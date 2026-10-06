#!/usr/bin/env sh
# Zbalí oficiálne Anthropic SDK (@anthropic-ai/sdk) do js/vendor/anthropic-sdk.mjs.
# Spustenie: sh tools/build-sdk.sh [verzia]   (predvolene posledná verzia)
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
cd "$TMP"
npm init -y >/dev/null
npm install --silent "@anthropic-ai/sdk@${1:-latest}" esbuild@0.24.2
cp "$ROOT/tools/anthropic-sdk-entry.mjs" entry.mjs
npx esbuild entry.mjs --bundle --format=esm --platform=browser --target=es2020 --minify --legal-comments=eof --outfile="$ROOT/js/vendor/anthropic-sdk.mjs"
echo "SDK $(node -p "require('./node_modules/@anthropic-ai/sdk/package.json').version" 2>/dev/null || grep '\"version\"' node_modules/@anthropic-ai/sdk/package.json) → js/vendor/anthropic-sdk.mjs"
