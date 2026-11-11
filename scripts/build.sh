#!/usr/bin/env bash
# index.html と src/・data/ を1つのHTMLにまとめる（スマホ・PCどちらでも開ける配布用）。
#   dist/lucky-seven.html  … 家族に送る用（LINE・メール・USBなど）
#   dist/artifact.html     … Web公開用（<head>/<body>なしの本文だけ）
# 使い方: bash scripts/build.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p dist

inline() {
  awk '
    /<link rel="stylesheet" href="src\// {
      match($0, /href="[^"]+"/); f = substr($0, RSTART + 6, RLENGTH - 7)
      print "<style>"; while ((getline l < f) > 0) print l; close(f); print "</style>"; next
    }
    /<script src="[^"]+"><\/script>/ {
      match($0, /src="[^"]+"/); f = substr($0, RSTART + 5, RLENGTH - 6)
      print "<script>"; while ((getline l < f) > 0) print l; close(f); print "</script>"; next
    }
    { print }
  ' index.html
}

inline > dist/lucky-seven.html

# Web公開用: doctype/html/head/body タグを外す（公開時に自動で付くため）
inline | grep -v -E '^\s*(<!doctype html>|</?html[^>]*>|</?head>|</?body>|<meta charset|<meta name="viewport")' > dist/artifact.html

ls -l dist/
