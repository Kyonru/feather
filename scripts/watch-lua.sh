#!/bin/bash
LOVE_BIN="/Applications/love.app/Contents/MacOS/love"
find ./src-lua -type f -name "*.lua" | entr -r "$LOVE_BIN" ./src-lua/
