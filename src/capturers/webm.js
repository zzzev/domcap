import {context2d, sendStatusEvent, getPromiseParts} from './../util.js';

let ctx, recorder, data, track, stream;

export const startRenderingVideo = function startRenderingVideo(width, height) {
  data = [];
  stream = new MediaStream();
  ctx = context2d(width, height);
  track = ctx.canvas.captureStream().getVideoTracks()[0];
  stream.addTrack(track);
  recorder = new MediaRecorder(stream, {
    mimeType: 'video/webm',
  });
  recorder.start();
  recorder.ondataavailable = function(event) {
    console.log(`data ${event.data.size}`);
    if (event.data && event.data.size) {
      data.push(event.data);
    }
  };

  const [promise, resolve, reject] = getPromiseParts();

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
    resolve(video);
  };

  return () => {
    recorder.stop();
    return promise;
  };
}

// Given the 1D array of image frames render them into a video by drawing
// them to a canvas element we're capturing video from.
export const renderFramesToVideo = function renderFramesToVideo(imgFrames, _requestAnimationFrame) {
  const [promise, resolve] = getPromiseParts();
  function drawFrameToRecorder() {
    if (imgFrames.length) {
      ctx.clearRect(0, 0, imgFrames[0].width, imgFrames[0].height);
      ctx.putImageData(imgFrames.shift(), 0, 0);
      // recorder.requestData();
      track.requestFrame();
      _requestAnimationFrame(drawFrameToRecorder);
    } else {
      console.log('done rendering')
      resolve();
    }
  }

  drawFrameToRecorder();
  return promise;
}
