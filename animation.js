import { svg as createSvg } from './util.js';

export default async function () {
  d3 = await d3.require('d3');

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
