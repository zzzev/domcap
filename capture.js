import {context2d} from './util.js';

let _requestAnimationFrame, _setTimeout, _now;

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
  performance.now = () => elapsed;
}

// Start capturing content from the sources passed in.
//
// captureSources is expected to be an array of svg or canvas elements,
// or a generator that will repeatedly yield a promise containing one of those.
// returns a promise which will resolve with an HTML video element containing
// the rendered video.
function start(captureSources, framesToCapture = 60, fps = 60) {
  if (_requestAnimationFrame === undefined || _setTimeout === undefined) {
    enterTimewarp();
  }

  if (started) {
    throw new Error('Cannot start capture when already started');
  }
  started = true;

  const frameLengthInMs = 1000 / fps;

  // which frame (ordinal) are we rendering
  let frame = 0;
  let framePromises = [];
  while (frame < framesToCapture) {
    elapsed = frame * frameLengthInMs;
    framePromises.push(renderFrame(captureSources, frame));
    frame++;
  }

  reset();
  return Promise.all(framePromises).then(renderFramesToVideo);
}

// Render frame syncronously for each capture source, then serialize the svgs
// into an image or copy the contents of the canvas, and return a promise that
// will resolve with the captured images when they're fully loaded.
function renderFrame(captureSources, frame) {
  return new Promise(function (resolve) {
    console.log(`rendering frame ${frame}`);
    
    tick();
    
    let promises = captureSources.map(rawSource => {
      const wrappedSource = rawSource.next ? rawSource.next().value : Promise.resolve(rawSource);
      return wrappedSource.then(source => {
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
      });
    });

    resolve(Promise.all(promises));
  });
}

// Given the 2D array of image frames (number of frames * number of sources),
// render them into a video by drawing them to a canvas element we're capturing
// video from.
function renderFramesToVideo(imgFrames) {
  const width = imgFrames[0][0].width;
  const height = imgFrames[0][0].height;
  const data = [];
  const stream = new MediaStream();
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
  recorder.ondataavailable = function(event) {
    if (event.data && event.data.size) {
      data.push(event.data);
    }
  };
  const ctx = context2d(width, height);
  const canvas = ctx.canvas;
  const canvasStream = canvas.captureStream();
  for (let track of canvasStream.getVideoTracks()) {
    stream.addTrack(track);
  }

  const finishedProcessing = new Promise((res) => {
    recorder.onstop = () => {
      console.log(data);
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
      const images = imgFrames.shift();
      images.forEach(image => {
        if (image instanceof ImageData) {
          ctx.putImageData(image, 0, 0);
        } else if (image instanceof HTMLImageElement) {
          ctx.drawImage(image, 0, 0, width, height);
        }
      });
      
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
  if (started) {
    frameCallbacks = [];
    scheduledTimeouts = [];
    started = false;
  }
}

export default {
  enterTimewarp, start, reset, tick
};
