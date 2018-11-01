// Note: this file expects to be run with ffmpeg-server.js included on the page.

import {context2d, getPromiseParts, sendStatusEvent} from './../util.js';

let ffmpegServer;

export const startFFMpegServer = function startFFMpegServer(server) {
  ffmpegServer = server;
  let [promise, resolve, reject] = getPromiseParts();
  sendStatusEvent('rendering to FFMpegServer');
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
  return function stopFFMpegServer() {
    ffmpegServer.end();
    return promise;
  };
}

export const sendFramestoFFMpegServer = async function sendFramestoFFMpegServer(imgFrames) {
  sendStatusEvent(`sending batch of ${imgFrames.length} frames to FFMpegServer`);
  let processedCallback;
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
}
