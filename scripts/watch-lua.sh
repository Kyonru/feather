#!/bin/bash
LOVE_BIN="/Applications/love.app/Contents/MacOS/love"
find ./packages/runtime-lua -type f -name "*.lua" | entr -r "$LOVE_BIN" ./packages/runtime-lua/
