import capture from './../src/capture.js';

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
  result.innerHTML = '';
  capture.enterTimewarp();
  setStatus('Loading notebook and runtime...');
  const [runtime, notebook] = await Promise.all([
    import('https://unpkg.com/@observablehq/notebook-runtime@1?module'),
    import(`https://api.observablehq.com/${document.querySelector('#notebook').value}.js`),
  ]);
  const canvasGenerator = (function* () {
    let [promise, res, rej] = getPromiseParts();
    const callbacks = [[res, rej]];
    runtime.Runtime.load(notebook.default, variable => {
      if (variable.name === 'canvas') {
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
  const video = await capture.start([canvasGenerator], numFrames);
  const duration = Date.now() - loadStartTime;
  setStatus(`Displaying captured video; took ${duration / 1000} seconds
              to render ${numFrames} frames`);
  result.appendChild(video);

  return false;
};

if (document.readyState !== 'done') {
  window.addEventListener('load', bootstrap);
} else {  
  bootstrap();
}

function getPromiseParts() {
  let resolve, reject;
  const promise = new Promise(function (res, rej) {
    resolve = res, reject = rej;
  });
  return [promise, resolve, reject];
}