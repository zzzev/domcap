# domcap

domcap is a small js library that helps you capture video of browser-based SVG or Canvas animations.

Similar to ccapture.js, domcap intercepts the common methods your code uses to determine time and then renders each frame with as much or little time as necessary to avoid dropped frames (allowing guaranteed 60fps output at any resolution).

Unlike ccapture, domcap supports capturing svg content and multiple composited sources.

## Usage

See the examples directory for usage examples. They expect to be run via a command like `python3 -m http.server` from the root of this repo.

## Limitations

- Can be slow when creating longer videos, as all the data is held in memory (in addition to the normal weight of the animation you're running)
- Only works in a recent version of Chrome (the only browser so far which allows encoding of webm video from MediaStream API)
- Video output only as .webm

## Possible feature additions

There's a lot of room for improvement here; the following things are definitely possible to do, so if you'd like any of these, please file an issue.

- headless mode
- output image sets or gifs
- do something like ccapture's ffmpeg server for more output options
- batch big jobs into smaller pieces to reduce memory pressure
- allow ui to update during job to see progress