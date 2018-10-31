import {context2d, getPromiseParts, sendStatusEvent} from './util.js';
import {startFFMpegServer, sendFramestoFFMpegServer} from './capturers/ffmpeg.js';
import {startRenderingVideo, renderFramesToVideo} from './capturers/webm.js';

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
    scheduledTimeouts.push([arguments[1] + elapsed, arguments[0], Array.from(arguments).slice(2)]);
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
async function start(captureSources, options) {
  let layoutSource;
  const nonGeneratorSources = captureSources.filter(s => !s.next);
  if (nonGeneratorSources.length) {
    layoutSource = captureSources[0];
  } else {
    const sourcePromise = captureSources[0].next().value;
    tick();
    layoutSource = await sourcePromise;
  }
  options = { // default options
    framesToCapture:60,
    fps: 60,
    batchSize: 20,
    format: 'ffmpeg', // other options: 'webm'
    width: layoutSource.width,
    height: layoutSource.height,
    ...options // override with any user specified
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

  let stopCallback;
  if (options.format === 'ffmpeg') {
    stopCallback = startFFMpegServer(ffmpegServer);
  } else if (options.format === 'webm') {
    stopCallback = startRenderingVideo(options.width, options.height);
  }

  const numBatches = Math.ceil(options.framesToCapture / options.batchSize);
  let batchIndex = 0;
  while (batchIndex < numBatches) {
    const batchMin = batchIndex * options.batchSize;
    batchIndex++;
    const batchMax = batchIndex * options.batchSize;
    console.log(`batch ${batchIndex} (${batchMin}-${batchMax})`);
    // which frame (ordinal) are we rendering
    let frame = batchMin;
    let framePromises = [];
    while (frame < Math.min(batchMax, options.framesToCapture)) {
      elapsed = frame * frameLengthInMs;
      const sourcePromises = Promise.all(captureSources.map(source => {
        if (source.next) {
          return source.next().value;
        }
        return Promise.resolve(source)
      }));
      tick();
      framePromises.push(renderFrame(await sourcePromises, frame));
      frame++;
    }
    console.log('awaiting batch frames');
    const compositedFrames = await Promise.all(framePromises).then(compositeFrames);
    if (options.format === 'ffmpeg') {
      await sendFramestoFFMpegServer(compositedFrames);
    } else if (options.format === 'webm') {
      await renderFramesToVideo(compositedFrames, _requestAnimationFrame);
    } else {
      throw new Error('unknown format ' + options.format);
    }
  }
  reset();
  return stopCallback();
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

function tick() {
  if (frameCallbacks.length) {
    const toCall = frameCallbacks;
    frameCallbacks = [];
    toCall.forEach(cb => cb(elapsed));
  }

  if (scheduledTimeouts.length) {
    const firingTimeouts = scheduledTimeouts.filter(d => d[0] <= elapsed);
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
