import svgcap from './capture.js';
svgcap.enterTimewarp();

const bootstrap = async function() {
  const animation = await import('./animation.js');
  const svg = (await animation.default()).node();
  const video = await svgcap.start(svg);
  document.body.appendChild(video);
};

if (document.readyState !== 'done') {
  window.addEventListener('load', bootstrap);
} else {  
  bootstrap();
}
