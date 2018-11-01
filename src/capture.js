import {context2d, getPromiseParts, sendStatusEvent} from './util.js';
import {startFFMpegServer, sendFramestoFFMpegServer} from './capturers/ffmpeg.js';
import {startRenderingVideo, renderFramesToVideo} from './capturers/webm.js';

// Original timing-related callbacks (only populated when in time warp)
let _requestAnimationFrame, _setTimeout, _clearTimeout, _setInterval, _clearInterval, _now, _dateNow;
// used for intercepted setTimeout and setInterval functions
let baseId = 0;

// ffmpegserver.js object
let ffmpegServer;

let started = false;
let elapsed = 0;

// requestAnimationFrame callbacks
let frameCallbacks = [];

// setTimeout callbacks
// keys are ids
// values are [scheduledTime, callback, args]
let scheduledTimeouts = {};

// setInterval callbacks
// keys are ids
// values are [baseTime, interval, callback, args]
// where baseTime is either the time the interval was scheduled or the last time it fired
let scheduledIntervals = {};

// Replace timing-related globals with intercepted versions so we can manipulate
// the time space continuum... in this window anyways.
function enterTimewarp() {
  _requestAnimationFrame = window.requestAnimationFrame;
  window.requestAnimationFrame = function() {
    frameCallbacks.push(arguments[0]);
  }
  _setTimeout = window.setTimeout;
  window.setTimeout = function(callback, delay, args) {
    scheduledTimeouts[baseId] = [delay + elapsed, callback, args];
    return baseId++;
  }
  _clearTimeout = window.clearTimeout;
  window.clearTimeout = function(id) {
    delete scheduledTimeouts[id];
  }
  _setInterval = window.setInterval;
  window.setInterval = function(callback, delay, ...args) {
    scheduledIntervals[baseId] = [elapsed, delay, callback, args];
    return baseId++;
  }
  _clearInterval = window.clearInterval;
  window.clearInterval = function(id) {
    delete scheduledIntervals[id]
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
async function start(captureSources, options = {}) {
  if (_requestAnimationFrame === undefined || _setTimeout === undefined) {
    enterTimewarp();
  }

  options.generatorSources = options.generatorSources || 'canvas';
  // Resolve generator-based sources as specified (see description in options)
  if (options.generatorSources !== 'all') {
    captureSources = await Promise.all(captureSources.map(async function (source) {
      if (source.next === undefined) return source;
      const promise = source.next().value;
      tick();
      const resolved = await (promise);
      const isCanvas = resolved instanceof HTMLCanvasElement;
      if (options.generatorSources === 'none' ||
          (options.generatorSources === 'canvas' && !isCanvas)) {
        return resolved;
      }
      return source;
    }));
  }

  // Grab one of the sources to get the size of the output; if all sources
  // are generators then grab a value off of it and wait for it to resolve first.
  let layoutSource;
  const nonGeneratorSources = captureSources.filter(s => !s.next);
  let sourcePromise;
  if (nonGeneratorSources.length) {
    layoutSource = captureSources[0];
  } else {
    sourcePromise = captureSources[0].next().value;
    tick();
    layoutSource = await sourcePromise;
  }
  let width, height;
  if (layoutSource instanceof SVGSVGElement) {
    width = layoutSource.getAttribute('width');
    height = layoutSource.getAttribute('height');
  } else {
    width = layoutSource.width;
    height = layoutSource.height;
  }

  options = { // default options
    framesToCapture:60,
    fps: 60,
    batchSize: 20,
    format: 'webm', // other options: 'ffmpeg' (requires separate server)
    width,
    height,
    allowTransparency: false, // if false, will add white background

    generatorSources: 'canvas', // other options: 'all', 'none'
    // If a captureSource is a generator, this determines whether domcap will
    // request a new result from the generator for each frame, or re-capture the
    // original element repeatedly.
    // 'canvas': only canvas elements will be re-requested. (default)
    // 'all': all generator sources will be re-requested.
    // 'none': no generator sources will be re-requested.

    ...options // override defaults with any user specified options
  }



  if (options.format === 'ffmpeg') {
    const serverOptions = {
      framerate: options.fps,
      url: `ws://${document.location.hostname}:8080`,
    };
    ffmpegServer = new FFMpegServer.Video(serverOptions);
    ffmpegServer.start(serverOptions);
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
    stopCallback = startRenderingVideo(options);
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
    const compositedFrames = await Promise.all(framePromises)
        .then((frames) => compositeFrames(frames, options.allowTransparency));
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
function compositeFrames(imgFrames, allowTransparency) {
  sendStatusEvent('Done capturing; compositing sources...');
  const width = imgFrames[0][0].width;
  const height = imgFrames[0][0].height;
  
  const imageHelper = context2d(width, height);
  const ctx = context2d(width, height);
  
  const result = [];
  // Must do this in a loop (vs. functionally) to avoid OOM issues
  while (imgFrames.length) {
    const frames = imgFrames.shift();
    if (!allowTransparency) {
      // build off white background to avoid transparency in video
      ctx.fillStyle = 'rgb(255,255,255)';
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.clearRect(0, 0, width, height);
    }
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

  const timeouts = Object.entries(scheduledTimeouts);
  if (timeouts.length) {
    const firingTimeouts = timeouts.filter(d => d[1][0] <= elapsed);
    if (firingTimeouts.length) {
      firingTimeouts.forEach(d => {
        d[1][1].apply(this, d[1][2]);
        delete scheduledTimeouts[d[0]];
      });
    }
  }

  const intervals = Object.entries(scheduledIntervals);
  if (intervals.length) {
    const firingIntervals = intervals.filter(d => {
      const [id, [baseTime, interval, callback, args]] = d;
      return elapsed - baseTime > interval;
    });
    firingIntervals.forEach(d => {
      console.log('firing interval');
      const [id, [baseTime, interval, callback, args]] = d;
      callback.apply(args);
      scheduledIntervals[id] = [baseTime + interval, interval, callback, args];
    });
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
