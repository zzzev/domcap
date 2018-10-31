# domcap

domcap is a small js library that helps you capture video of browser-based SVG or Canvas animations.

Similar to ccapture.js, domcap intercepts the common methods your code uses to determine time and then renders each frame with as much or little time as necessary to avoid dropped frames (allowing guaranteed 60fps output at any resolution).

Unlike ccapture, domcap supports capturing svg content and multiple composited sources. It also contains some conveniences for creating videos from [Observable Notebooks](https://observablehq.com/) (i.e. can take Observable cells as input).

## Usage

See the examples directory for usage examples. They expect to be run via a command like `python3 -m http.server` from the root of this repo.

If you want to use [ffmpegserver.js](https://github.com/greggman/ffmpegserver.js) to encode e.g. mp4 videos, download and install that repo, and run it alongside the example. Run the `./getdeps.sh` script first (or copy the client-side ffmpegserver.js script to the deps folder by hand).

The Observable example has some configurable options that you can play with to get a sense of how it works.

## Limitations

- Only works in a recent version of Chrome (the only browser so far which allows encoding of webm video from MediaStream API)
- Not super fast or optimized
- Video output only as .webm in browser, otherwise requires using ffmpegserver.js as described above.

## Possible feature additions

There's a lot of room for improvement here; the following things are definitely possible to do, so if you'd like any of these, please file an issue or PR.

- headless mode (run entirely from command line)
- output image sets or gifs
- better progress notification