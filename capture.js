import {context2d} from './util.js';

let _requestAnimationFrame, _setTimeout, _now;

let started = false;
let elapsed = 0;

// requestAnimationFrame callbacks
let frameCallbacks = [];

// setTimeout callbacks (TODO)
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

function start(svg, framesToCapture = 60, fps = 60) {
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
    framePromises.push(renderFrame(svg, frame));
    frame++;
  }

  reset();
  return Promise.all(framePromises).then(renderFramesToVideo);
}

// Render frame syncronously, then serialize the svg into an image and return
// a promise that will resolve with the image when the image's load event fires.
function renderFrame(svg, frame) {
  return new Promise(function (resolve) {
    console.log(`rendering frame ${frame}`);
    
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
    
    // save svg frame to img; on load it will resolve the promise with the svg frame
    // and the canvas one.
    const serialized = new XMLSerializer().serializeToString(svg);
    const url = URL.createObjectURL(new Blob([serialized], {type: "image/svg+xml"}));
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = url;
  });
}

function renderFramesToVideo(imgFrames) {
  const width = imgFrames[0].width;
  const height = imgFrames[0].height;
  const data = [];
  const stream = new MediaStream();
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
  recorder.ondataavailable = function(event) {
    if (event.data && event.data.size) {
      data.push(event.data);
    }
  };
  const canvas = context2d(width, height).canvas;
  const canvasStream = canvas.captureStream();
  for (let track of canvasStream.getVideoTracks()) {
    stream.addTrack(track);
  }

  const finishedProcessing = new Promise((res) => {
    recorder.onstop = () => {
      console.log(data);
      var url = URL.createObjectURL(new Blob(data, { type: 'video/webm' }));
      const video = d3.select(document.createElement('video'))
        .attr('src', url)
        .attr('controls', true)
        .attr('autoplay', true)
        .attr('loop', true)
        .style('width', width + 'px')
        .style('height', height + 'px');
      res(video.node());
    };
  });

  function drawFrameToRecorder() {
    if (imgFrames.length) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, width, height);
      const img = imgFrames.shift();
      
      ctx.drawImage(img, 0, 0, width, height);
      _requestAnimationFrame(drawFrameToRecorder);
    } else {
      recorder.stop();
    }
  }

  recorder.start();
  drawFrameToRecorder();

  return finishedProcessing;
}

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
  enterTimewarp, start, reset
};
