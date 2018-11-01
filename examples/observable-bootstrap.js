import capture from './../src/capture.js';
import {getPromiseParts} from './../src/util.js';

const setStatus = function(text) {
  document.querySelector('#status').innerText = text;
}

const bootstrap = function() {
  document.addEventListener('capture', (event) => setStatus(event.detail));
  document.querySelector('#load').addEventListener('click', load);
}

const load = async function() {
  const loadStartTime = Date.now();
  const result = document.querySelector('#result');
  const cellName = document.querySelector('#cell').value;
  result.innerHTML = '';
  capture.enterTimewarp();
  setStatus('Loading notebook and runtime...');
  const [runtime, notebook] = await Promise.all([
    import('https://unpkg.com/@observablehq/notebook-runtime@1?module'),
    import(`https://api.observablehq.com/${document.querySelector('#notebook').value}.js`),
  ]);
  const cellGenerator = (function* () {
    let [promise, res, rej] = getPromiseParts();
    const callbacks = [[res, rej]];
    const lib = new runtime.Library();
    lib.width = function* () {yield parseFloat(document.querySelector('#width').value);};
    
    runtime.Runtime.load(notebook.default, lib, variable => {
      if (variable.name === cellName) {
        return {
          fulfilled: (value) => {
            if (callbacks.length) {
              const [resolve, reject] = callbacks.shift();
              resolve(value)
            }
          },
          rejected: (error) => {
            if (callbacks.length) {
              const [resolve, reject] = callbacks.shift();
              reject(error);
            }
          }
        };
      }
    });
    yield promise;
    while (true) {
      [promise, res, rej] = getPromiseParts();
      callbacks.push([res, rej]);
      yield promise;
    }
  })();
  setStatus('Capturing video in background...');
  const numFrames = 60 * parseFloat(document.querySelector('#length').value);
  const captureResult = await capture.start([cellGenerator], {
    format: Array.from(document.querySelectorAll('input[name=format]'))
        .filter(node => node.checked)[0].id,
    framesToCapture: numFrames,
    batchSize: parseInt(document.querySelector('#batch').value)
  });
  const duration = Date.now() - loadStartTime;
  setStatus(`Completed; took ${duration / 1000} seconds \
              to render ${numFrames} frames (${duration / (1000 * numFrames / 60)}x)`);
  if (captureResult instanceof Node) {
    result.appendChild(captureResult);
  } else {
    result.innerText = 'Output: ' + captureResult;
  }

  return false;
};

if (document.readyState !== 'done') {
  window.addEventListener('load', bootstrap);
} else {  
  bootstrap();
}
