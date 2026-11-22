#!/bin/sh
# Renders app/assets/icons/svg/*.svg to 192 px PNGs in app/assets/icons/ with macOS Quick Look.
set -e
cd "$(dirname "$0")/../app/assets/icons"
qlmanage -t -s 192 -o . svg/*.svg >/dev/null
for f in *.svg.png; do mv "$f" "${f%.svg.png}.png"; done
ls *.png | wc -l
