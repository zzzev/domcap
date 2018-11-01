#!/bin/sh
rm -rf deps
mkdir deps
curl -o deps/ffmpegserver.js https://raw.githubusercontent.com/greggman/ffmpegserver.js/master/dist/ffmpegserver.js
curl -L -o deps/webm-writer.js https://github.com/thenickdude/webm-writer-js/releases/download/0.2.0/webm-writer-0.2.0.js
