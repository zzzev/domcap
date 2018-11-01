// Note: this file expects to be run with webm-writer.js included on the page.
import {context2d} from './../util.js';

let videoWriter, ctx;

export const startRenderingVideo = function startRenderingVideo(options) {
  const {width, height, fps} = options;
  videoWriter = new WebMWriter({
    quality: 0.95,
    frameRate: fps
  });
  ctx = context2d(width, height);

  return function stopWebMWriter() {
    return videoWriter.complete().then(blob => {
      const url = URL.createObjectURL(blob);
      const video = document.createElement('video');
      video.setAttribute('src', url);
      video.setAttribute('controls', true);
      video.setAttribute('autoplay', true);
      video.setAttribute('loop', true);
      video.style.width = width + 'px';
      video.style.height = height + 'px';
      return video;
    });
  }
};

export const renderFramesToVideo = function renderFramesToVideo(imgFrames) {
  imgFrames.forEach(frame => {
    ctx.clearRect(0, 0, frame.width, frame.height);
    ctx.putImageData(frame, 0, 0);
    videoWriter.addFrame(ctx.canvas);
  });
};
