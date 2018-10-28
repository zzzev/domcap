import { svg as createSvg, context2d } from './util.js';

async function getD3() {
  return {...d3, ...(await d3.require('d3'))};
}

export const scaleSquare = async function () {
  d3 = await getD3();
  const rectSize = Math.min(innerHeight, innerWidth) / 3;
  const w = innerWidth;
  const h = innerHeight;

  const svg = d3.select(createSvg(w, h))
    .attr('height', h)
    .attr('width', w);

  svg.append('rect')
    .attr('x', (w - rectSize ) / 2)
    .attr('y', (h - rectSize ) / 2)
    .attr('width', rectSize)
    .attr('height', rectSize)
    .attr('fill', 'black')
    .transition().duration(500)
    .on('start', function repeat() {
      d3.active(this)
          .attr('transform', `translate(${w / 2} ${h / 2}) scale(2) translate(${-w / 2} ${-h / 2})`)
        .transition()
          .attr('transform', `translate(${w / 2} ${h / 2}) scale(1) translate(${-w / 2} ${-h / 2})`)
        .transition()
          .on('start', repeat);
    });

  return svg;
}

export const spinSquare = async function() {
  d3 = await getD3();

  const rectSize = Math.min(innerHeight, innerWidth) / 2;
  const w = innerWidth;
  const h = innerHeight;

  const svg = d3.select(createSvg(w, h))
    .attr('height', h)
    .attr('width', w);

  svg.append('rect')
    .attr('x', (w - rectSize ) / 2)
    .attr('y', (h - rectSize ) / 2)
    .attr('width', rectSize)
    .attr('height', rectSize)
    .attr('fill', 'gray')
    .transition().duration(500)
    .on('start', function repeat() {
      d3.active(this)
          .attr('transform', `translate(${w / 2} ${h / 2}) rotate(90) translate(${-w / 2} ${-h / 2})`)
        .transition()
          .on('start', repeat);
    });

  return svg;
}

export const rainbowCanvas = async function() {
  const w = innerWidth, h = innerHeight;
  d3 = await getD3();

  const c = context2d(w, h);

  function frame(elapsed) {
    c.clearRect(0, 0, w, h);
    c.fillStyle = d3.interpolateRainbow(elapsed / 1000 % 1000);
    c.fillRect(0, 0, w, h);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  return c.canvas;
}