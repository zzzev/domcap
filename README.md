# domcap

domcap is a small js library that helps you capture video of browser-based SVG or Canvas animations.

Similar to ccapture.js, domcap intercepts the common methods your code uses to determine time and then
renders each frame with as much or little time as necessary to avoid dropped frames (therefore allows
guaranteed 60fps output at any resolution).

Unlike ccapture, domcap supports capturing svg content and multiple composited sources.

## Limitations

- Only works in Chrome so far (the only browser which allows encoding of webm video from MediaStream API)
- Video output only as .webm (for now, more formats such as image sets or gif could be added)