import capture from './capture.js';

const bootstrap = async function() {
  capture.enterTimewarp();
  const animation = await import('./animation.js');
  const video = await capture.start([
    (await animation.rainbowCanvas()),
    (await animation.scaleSquare()).node(),
    (await animation.spinSquare()).node(),
  ]);
  document.body.appendChild(video);
};

const bootstrapObservable = async function() {
  capture.enterTimewarp();
  const [runtime, notebook] = await Promise.all([
    import('https://unpkg.com/@observablehq/notebook-runtime@1?module'),
    import('https://api.observablehq.com/@mbostock/spiral-raster.js'),
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
  const video = await capture.start([canvasGenerator]);
  document.body.appendChild(video);
};

if (document.readyState !== 'done') {
  window.addEventListener('load', bootstrapObservable);
} else {  
  bootstrapObservable();
}

function getPromiseParts() {
  let resolve, reject;
  const promise = new Promise(function (res, rej) {
    resolve = res, reject = rej;
  });
  return [promise, resolve, reject];
}