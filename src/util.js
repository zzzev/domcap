export const sendStatusEvent = function sendStatusEvent(message) {
  console.info(message);
  document.dispatchEvent(new CustomEvent('capture', {detail: message}));
};

// Convenience function for working with async code.
export const getPromiseParts = function getPromiseParts() {
  let resolve, reject;
  const promise = new Promise(function (res, rej) {
    resolve = res, reject = rej;
  });
  return [promise, resolve, reject];
}

// Convenience functions for creating svg and canvas elements.
//
// Lovingly stolen from Observable's stdlib.
// https://github.com/observablehq/notebook-stdlib 

export const svg = function svg(width, height) {
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', [0, 0, width, height]);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  return svg;
};

export const context2d = function context2d(width, height, dpi) {
  if (dpi == null) dpi = devicePixelRatio;
  var canvas = document.createElement("canvas");
  canvas.width = width * dpi;
  canvas.height = height * dpi;
  canvas.style.width = width + "px";
  var context = canvas.getContext("2d");
  context.scale(dpi, dpi);
  return context;
};

/*
ISC License reproduced from Observable stdlib, applies only to this file.
Copyright 2018 Observable, Inc.

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
*/
