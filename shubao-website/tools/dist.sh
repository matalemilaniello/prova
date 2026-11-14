#!/usr/bin/env bash
# Prepara la cartella da pubblicare (solo i file del sito, senza strumenti né testi sorgente).
# Uso: bash tools/dist.sh [cartella-di-uscita]   (predefinita: ../shubao-dist)
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-../shubao-dist}"
rm -rf "$OUT" && mkdir -p "$OUT"
cp -r index.html 404.html zh ko ja legal css js assets sitemap.xml robots.txt manifest.webmanifest "$OUT"/
echo "Pronto: $OUT"
