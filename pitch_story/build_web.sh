#!/usr/bin/env bash
# Build the web version into pitch_story/play/ (committed, like awesome_farm/play).
# Needs Godot 4.7.1 on PATH (or GODOT=/path/to/godot) with the matching Web export templates.
set -euo pipefail
cd "$(dirname "$0")"
GODOT="${GODOT:-godot}"
rm -rf play && mkdir -p play
"$GODOT" --headless --path . --import >/dev/null 2>&1 || true
"$GODOT" --headless --path . --export-release Web play/index.html 2>&1 | grep -iE "error|fail" && exit 1 || true
test -f play/index.wasm || { echo "export did not produce play/index.wasm"; exit 1; }
# The engine is over the host's 25 MiB per-file limit: ship it gzipped, shell.html unpacks it.
gzip -9 -n -f play/index.wasm
rm -f play/index.png
cp web/cover.webp play/cover.webp   # poster for the home page card
echo "built play/ ($(du -sh play | cut -f1))"
