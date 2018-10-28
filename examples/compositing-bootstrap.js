import capture from './../src/capture.js';

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

if (document.readyState !== 'done') {
  window.addEventListener('load', bootstrap);
} else {  
  bootstrap();
}
