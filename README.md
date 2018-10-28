# domcap

domcap is a small js library that helps you capture video of browser-based SVG or Canvas animations.

Similar to ccapture.js, domcap intercepts the common methods your code uses to determine time and then
renders each frame with as much or little time as necessary to avoid dropped frames (therefore allows
guaranteed 60fps output at any resolution).

Unlike ccapture, domcap supports capturing svg content and multiple composited sources.

## Usage

See the examples directory for usage examples.

## Limitations

- Can become quite slow when creating long videos, as all the data is held in memory (in addition to the normal weight of the animation you're running)
- Only works in a recent version of Chrome (the only browser so far which allows encoding of webm video from MediaStream API)
- Video output only as .webm (for now, more formats such as image sets or gif could be added)