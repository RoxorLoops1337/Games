#!/bin/sh
# Promote the tested lab reference modules into the game's js/ folder (X_ref.js -> js/X.js, imports renamed).
set -e
cd "$(dirname "$0")/../ludus_maximus_3d"
for f in rig gear env_arena env_ludus envfx envtex sky post fx feel director audio; do
  [ -f lab/ref/${f}_ref.js ] && sed 's/_ref\.js/.js/g' lab/ref/${f}_ref.js > js/${f}.js && echo "promoted $f"
done
cp lab/ref/ui_ref.css css_ui.tmp 2>/dev/null && mkdir -p css && mv css_ui.tmp css/ui.css || true
sed 's/_ref\.js/.js/g' lab/ref/ui_ref.js > js/ui_kit.js && echo "promoted ui_kit"
