# lucky-seven
ロト7の過去の当選番号を分析し、数字の傾向調査や組み合わせ生成を行う研究プロジェクト。
PC でもスマホでも、ブラウザで開くだけで動きます（サーバー・インストール不要）。

## 機能
| タブ | 内容 |
|---|---|
| 予想 | 前回の結果と次回の抽せん日を表示。5つの戦略（完全ランダム / ホット / 全期間頻度 / コールド / バランス型）で次回の組合せを生成し、コピー（LINEに貼れる形式）や保存ができる |
| 当せん確認 | 保存した番号を抽せん結果と自動で照合（この端末のブラウザに保存）。番号を7個タップして好きな回と照合し、「第1回から毎回買っていたら」の収支も表示 |
| 分析 | 数字別出現回数とχ²一様性検定、ホット/コールド、奇数個数・連番・合計値の分布 |
| 検証 | 各戦略を「その回より前のデータだけ」で予想させ、実際の結果と照合するバックテスト |
| 過去の結果 | 全当選番号の一覧 |

## 運用（GitHub Pages で家族に共有）
`.github/workflows/pages.yml` が次を自動で行います。

1. 毎週土曜 9:00 / 21:00（日本時間）に最新の当選番号を取得
2. テストを実行し、通ったらデータを main にコミット
3. GitHub Pages に公開

### 最初に1回だけやること
1. このリポジトリを main に push する
2. GitHub のリポジトリ画面 → **Settings → Pages → Source** を **GitHub Actions** にする
3. **Actions** タブ → 「Update data & deploy」→ **Run workflow** で初回公開
4. 公開された URL（`https://<ユーザー名>.github.io/lucky-seven/`）を家族に送る。スマホでは「ホーム画面に追加」するとアプリのように開けます

無料プランの GitHub Pages は公開リポジトリが必要で、URL を知っている人なら誰でも見られます。

## 手元で使う
```bash
bash scripts/update-data.sh   # 最新データを取得（件数が減る取得結果は拒否）
bash scripts/build.sh         # dist/lucky-seven.html（全部入り1ファイル）を作る
```
`dist/lucky-seven.html` は LINE・メールで送ってもそのまま開けます。
開発中は `index.html` を直接開くか、`powershell -ExecutionPolicy Bypass -File scripts/serve.ps1` で http://localhost:8777/ から。

## テスト
- ブラウザ: `tests/index.html` を開く
- Node: `node tests/engine.test.js`（CI でも実行）

## 注意
ロト7の1等確率は 1/10,295,472 で、各回の抽せんは独立です。過去データから当選確率を上げることはできません。
「検証」タブはそれを実データで確かめるためのものです（直近600回の検証で、どの戦略もランダムと差なし）。
データ出典: loto7.thekyo.jp。正式な当選番号は必ず公式サイトで確認してください。

## 構成
- `index.html` / `src/app.js` / `src/style.css` — 画面
- `src/engine.js` — 統計・戦略・等級判定・バックテスト（DOM非依存）
- `data/` — 当選番号（CSV と、ブラウザ用に埋め込んだ JS）
- `scripts/` — データ取得・ビルド・簡易サーバー
- `tests/` — エンジンのテスト
