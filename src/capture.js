import {context2d, getPromiseParts} from './util.js';

let _requestAnimationFrame, _setTimeout, _now, _dateNow;

let ffmpegServer;

let started = false;
let elapsed = 0;

// requestAnimationFrame callbacks
let frameCallbacks = [];

// setTimeout callbacks
let scheduledTimeouts = [];

function enterTimewarp() {
  // replace globals with intercepted versions
  _requestAnimationFrame = window.requestAnimationFrame;
  window.requestAnimationFrame = function() {
    frameCallbacks.push(arguments[0]);
  }
  _setTimeout = window.setTimeout;
  window.setTimeout = function(callback, delay) {
    scheduledTimeouts.push([arguments[1] + elapsed, arguments[0], arguments.slice(2)]);
  }
  _now = performance.now;
  _dateNow = Date.now;
  performance.now = () => elapsed;
  Date.now = () => elapsed;
}

// Start capturing content from the sources passed in.
//
// captureSources is expected to be an array of svg or canvas elements,
// or a generator that will repeatedly yield a promise containing one of those.
// returns a promise which will resolve with an HTML video element containing
// the rendered video.
function start(captureSources, options) {
  const source = captureSources[0];
  options = {
    framesToCapture:60,
    fps: 60,
    format: 'ffmpeg',
    // format: 'webm',
    width: source.width,
    height: source.height,
    ...options
  }

  if (options.format === 'ffmpeg') {
    const serverOptions = {
      framerate: options.fps,
      url: `ws://${document.location.hostname}:8080`,
    };
    ffmpegServer = new FFMpegServer.Video(serverOptions);
    ffmpegServer.start(serverOptions);
  }

  if (_requestAnimationFrame === undefined || _setTimeout === undefined) {
    enterTimewarp();
  }

  if (started) {
    throw new Error('Cannot start capture when already started');
  }
  started = true;
  sendStatusEvent('Started processing');

  const frameLengthInMs = 1000 / options.fps;

  // which frame (ordinal) are we rendering
  let frame = 0;
  let framePromises = [];
  while (frame < options.framesToCapture) {
    elapsed = frame * frameLengthInMs;
    tick();
    framePromises.push(renderFrame(captureSources, frame));
    frame++;
  }

  reset();

  let renderer = options.format === 'ffmpeg' ? renderFramesToFFMpegServer : renderFramesToVideo;
  return Promise.all(framePromises).then(compositeFrames).then(renderer);
}

// Render frame syncronously for each capture source, then serialize the svgs
// into an image or copy the contents of the canvas, and return a promise that
// will resolve with the captured images when they're fully loaded.
function renderFrame(captureSources, frame) {
  const [promise, resolve, reject] = getPromiseParts();

  let promises = captureSources.map(rawSource => {
    const handleSource = source => {
      if (source instanceof HTMLCanvasElement) {
        return Promise.resolve(source.getContext('2d').getImageData(0, 0, source.width, source.height));
      } else if (source instanceof SVGSVGElement) {
        // save svg frame to img; on load it will resolve the promise with the svg frame
        // and the canvas one.
        const serialized = new XMLSerializer().serializeToString(source);
        const url = URL.createObjectURL(new Blob([serialized], {type: "image/svg+xml"}));
        const img = new Image();
        return new Promise((resolve) => {
          img.onload = () => resolve(img);
          img.src = url;
        });
      }
    };
    if (rawSource.next) {
      return rawSource.next().value.then(handleSource)
    } else {
      return handleSource(rawSource);
    }
  });
  resolve(Promise.all(promises));
  return promise;
}

// Given the 2D array of image frames (number of frames * number of sources),
// render them into a 1D array of composited frames.
function compositeFrames(imgFrames) {
  sendStatusEvent('Done capturing; compositing sources...');
  const width = imgFrames[0][0].width;
  const height = imgFrames[0][0].height;
  
  const imageHelper = context2d(width, height);
  const ctx = context2d(width, height);
  
  const result = [];
  // Must do this in a loop (vs. functionally) to avoid OOM issues
  while (imgFrames.length) {
    const frames = imgFrames.shift();
    // build off white background to avoid transparency in video
    ctx.fillStyle = 'rgb(255,255,255)';
    ctx.fillRect(0, 0, width, height);
    frames.forEach(image => {
      if (image instanceof ImageData) {
        imageHelper.putImageData(image, 0, 0);
        ctx.drawImage(imageHelper.canvas, 0, 0, width, height);
      } else if (image instanceof HTMLImageElement) {
        ctx.drawImage(image, 0, 0, width, height);
      }
    });
    result.push(ctx.getImageData(0, 0, width, height));
  }

  return result;
}

// Given the 1D array of image frames render them into a video via ffmpegserver.js
async function renderFramesToFFMpegServer(imgFrames) {
  let [promise, resolve, reject] = getPromiseParts();
  sendStatusEvent('rendering to FFMpegServer');
  let processedCallback;
  ffmpegServer.on('error', function (error) {
    const result = document.createElement('div');
    result.innerText = `error: ${error.result.stderr}`;
    result.style.color = 'red';
    reject(result);
  });
  ffmpegServer.on('finished', function( url, size ) {
    const result = document.createElement('a');
    result.innerText = 'Sent frames to server';
    result.setAttribute('href', url);
    resolve(result);
  });
  ffmpegServer.on('process', function() {
    if (processedCallback) processedCallback();
  });
  const [w, h] = [imgFrames[0].width, imgFrames[0].height];
  let ctx = context2d(w, h);
  for (let i = 0; i < imgFrames.length; i++) {
    let frame = imgFrames[i];
    if (!ffmpegServer.safeToProceed()) {
      const [proceedPromise, proceedResolve] = getPromiseParts();
      processedCallback = proceedResolve;
      await proceedPromise;
    }
    ctx.clearRect(0, 0, w, h);
    ctx.putImageData(frame, 0, 0);
    ffmpegServer.add(ctx.canvas);
  }
  sendStatusEvent('sent all frames to FFMpegServer');
  ffmpegServer.end();
  return promise;
}

// Given the 1D array of image frames render them into a video by drawing
// them to a canvas element we're capturing video from.
function renderFramesToVideo(imgFrames) {
  sendStatusEvent('Done compositing; rendering to video...');
  const width = imgFrames[0].width;
  const height = imgFrames[0].height;
  const data = [];
  const stream = new MediaStream();
  const recorder = new MediaRecorder(stream, {
    mimeType: 'video/webm',
  });
  recorder.ondataavailable = function(event) {
    if (event.data && event.data.size) {
      data.push(event.data);
    }
  };
  const ctx = context2d(width, height);
  const canvas = ctx.canvas;
  for (let track of canvas.captureStream().getVideoTracks()) {
    stream.addTrack(track);
  }

  const finishedProcessing = new Promise((res) => {
    recorder.onstop = () => {
      sendStatusEvent('Done processing, creating video blob object');
      var url = URL.createObjectURL(new Blob(data, { type: 'video/webm' }));
      const video = document.createElement('video');
      video.setAttribute('src', url);
      video.setAttribute('controls', true);
      video.setAttribute('autoplay', true);
      video.setAttribute('loop', true);
      video.style.width = width + 'px';
      video.style.height = height + 'px';
      res(video);
    };
  });

  function drawFrameToRecorder() {
    if (imgFrames.length) {
      ctx.clearRect(0, 0, width, height);
      ctx.putImageData(imgFrames.shift(), 0, 0);
      
      _requestAnimationFrame(drawFrameToRecorder);
    } else {
      recorder.stop();
    }
  }

  recorder.start();
  drawFrameToRecorder();

  return finishedProcessing;
}

function tick() {
  if (frameCallbacks.length) {
    const toCall = frameCallbacks;
    frameCallbacks = [];
    toCall.forEach(cb => cb(elapsed));
  }

  if (scheduledTimeouts.length) {
    firingTimeouts = scheduledTimeouts.filter(d => d[0] <= elapsed);
    if (firingTimeouts.length) {
      firingTimeouts.forEach(d => d[1].apply(this, d[2]));
      scheduledTimeouts = scheduledTimeouts.filter(d => d[0] > elapsed);
    }
  }
}

// Reset callbacks we overrode.
// 
// If you use a library which captures the callbacks (e.g. d3), this may not return 
// everything to normal unless you re-execute the library.
function reset() {
  window.requestAnimationFrame = _requestAnimationFrame;
  window.setTimeout = _setTimeout;
  performance.now = _now;
  Date.now = _dateNow;
  if (started) {
    frameCallbacks = [];
    scheduledTimeouts = [];
    started = false;
  }
}

export default {
  enterTimewarp, start, reset, tick
};

function sendStatusEvent(message) {
  console.info(message);
  document.dispatchEvent(new CustomEvent('capture', {detail: message}));
};