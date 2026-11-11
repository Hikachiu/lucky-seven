#!/usr/bin/env bash
# ロト7の過去当選番号CSVを取得し、data/loto7.csv と data/loto7-data.js を再生成する。
# 使い方: bash scripts/update-data.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_URL="${LOTO7_CSV_URL:-https://loto7.thekyo.jp/data/loto7.csv}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading $SRC_URL ..."
curl -fsSL -m 60 -o "$TMP/raw.csv" "$SRC_URL"
iconv -f SHIFT_JIS -t UTF-8 "$TMP/raw.csv" | tr -d '\r' > "$TMP/loto7.csv"

# 検証: 1..37の範囲・重複なし・本数字が昇順・回号が連番
awk -F, 'NR>1{
  delete s
  for(i=3;i<=11;i++){ if($i<1||$i>37){print "out of range: draw "$1; bad=1} if(s[$i]++){print "duplicate: draw "$1; bad=1} }
  for(i=3;i<9;i++) if($i+0>=$(i+1)+0){print "not sorted: draw "$1; bad=1}
  if(NR-1!=$1){print "draw number gap at "$1; bad=1}
} END{ if(bad) exit 1; print NR-1" draws OK" }' "$TMP/loto7.csv"

awk -F, 'NR>1 && NF!=24 {print "unexpected column count at draw "$1; exit 1}' "$TMP/loto7.csv"

# 取得元の不具合で件数が減った場合は上書きしない
NEW_COUNT=$(( $(wc -l < "$TMP/loto7.csv") - 1 ))
if [ -f "$ROOT/data/loto7.csv" ]; then
  OLD_COUNT=$(( $(wc -l < "$ROOT/data/loto7.csv") - 1 ))
  if [ "$NEW_COUNT" -lt "$OLD_COUNT" ]; then
    echo "Downloaded data has fewer draws ($NEW_COUNT) than current ($OLD_COUNT). Keeping current data." >&2
    exit 1
  fi
fi

mkdir -p "$ROOT/data"
cp "$TMP/loto7.csv" "$ROOT/data/loto7.csv"

# ブラウザで file:// から直接開けるよう JS として埋め込む（Node でも読み込める形）
{
  echo "// 自動生成ファイル: scripts/update-data.sh で再生成してください"
  echo "// [回号, 日付, [本数字x7], [ボーナスx2], キャリーオーバー, [1等〜6等の1口あたり賞金]]"
  echo "(typeof window !== \"undefined\" ? window : globalThis).LOTO7_DATA = ["
  awk -F, 'NR>1{
    split($2,d,"/"); date=sprintf("%04d-%02d-%02d",d[1],d[2],d[3])
    printf "[%d,\"%s\",[%d,%d,%d,%d,%d,%d,%d],[%d,%d],%d,[%d,%d,%d,%d,%d,%d]],\n",$1,date,$3,$4,$5,$6,$7,$8,$9,$10,$11,$24,$18,$19,$20,$21,$22,$23
  }' "$TMP/loto7.csv"
  echo "];"
} > "$ROOT/data/loto7-data.js"

echo "Wrote data/loto7.csv and data/loto7-data.js"
