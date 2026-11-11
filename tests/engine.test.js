// エンジンのテスト。Node（CI）でもブラウザ（tests/index.html）でも動く。
//   Node:    node tests/engine.test.js
//   ブラウザ: tests/index.html を開く
(function (root) {
  "use strict";
  const isNode = typeof module !== "undefined" && module.exports && typeof require === "function";
  const L = isNode ? require("../src/engine.js") : root.Loto7;
  if (isNode) require("../data/loto7-data.js");
  const RAW = root.LOTO7_DATA;

  const results = [];
  function test(name, fn) {
    try { fn(); results.push({ name, ok: true }); }
    catch (e) { results.push({ name, ok: false, err: e && e.message ? e.message : String(e) }); }
  }
  function eq(a, b, msg) {
    const sa = JSON.stringify(a), sb = JSON.stringify(b);
    if (sa !== sb) throw new Error(`${msg || "not equal"}: ${sa} !== ${sb}`);
  }
  function ok(c, msg) { if (!c) throw new Error(msg || "assertion failed"); }
  const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg || "not near"}: ${a} vs ${b}`);

  const draws = L.fromRaw(RAW);
  const D = { no: 1, date: "2026-01-02", main: [1, 2, 3, 4, 5, 6, 7], bonus: [8, 9], carry: 0, prizes: [6e8, 1e7, 7e5, 9000, 1400, 1000] };

  // ---------- データ ----------
  test("データ: 全回が1..37・重複なし・昇順・回号連番", () => {
    ok(draws.length >= 700, "draws: " + draws.length);
    draws.forEach((d, i) => {
      eq(d.no, i + 1, "draw no");
      const all = d.main.concat(d.bonus);
      ok(all.every((n) => n >= 1 && n <= 37), "range " + d.no);
      eq(new Set(all).size, 9, "unique " + d.no);
      for (let k = 1; k < 7; k++) ok(d.main[k] > d.main[k - 1], "sorted " + d.no);
      ok(Array.isArray(d.prizes) && d.prizes.length === 6, "prizes " + d.no);
    });
  });
  test("データ: 日付が古い順に並んでいる", () => {
    for (let i = 1; i < draws.length; i++) ok(draws[i].date > draws[i - 1].date, "date order " + draws[i].no);
  });

  // ---------- 等級判定 ----------
  test("等級: 1等〜6等とはずれ", () => {
    eq(L.prizeRank([1, 2, 3, 4, 5, 6, 7], D).rank, 1);
    eq(L.prizeRank([1, 2, 3, 4, 5, 6, 8], D).rank, 2);
    eq(L.prizeRank([1, 2, 3, 4, 5, 6, 20], D).rank, 3);
    eq(L.prizeRank([1, 2, 3, 4, 5, 20, 21], D).rank, 4);
    eq(L.prizeRank([1, 2, 3, 4, 8, 9, 20], D).rank, 5, "4本+ボーナスは5等");
    eq(L.prizeRank([1, 2, 3, 8, 20, 21, 22], D).rank, 6);
    eq(L.prizeRank([1, 2, 3, 20, 21, 22, 23], D).rank, 0, "3本のみははずれ");
    eq(L.prizeRank([1, 2, 8, 9, 20, 21, 22], D).rank, 0, "2本+ボーナス2はずれ");
  });
  test("等級: 理論上の組合せ数の合計が正しい", () => {
    eq(L.TOTAL, 10295472);
    eq(L.PRIZE_COMBOS, { 1: 1, 2: 14, 3: 196, 4: 9135, 5: 142100, 6: 242550 });
  });

  // ---------- 生成 ----------
  test("生成: 全戦略が7個・重複なし・1..37・昇順・口同士も重複なし", () => {
    for (const key of Object.keys(L.STRATEGIES)) {
      const ts = L.generate(key, draws, 20, L.mulberry32(42));
      eq(ts.length, 20, key + " count");
      eq(new Set(ts.map((t) => t.join())).size, 20, key + " unique tickets");
      for (const t of ts) {
        eq(t.length, 7, key);
        eq(new Set(t).size, 7, key + " dup");
        ok(t.every((n) => n >= 1 && n <= 37), key + " range");
        for (let k = 1; k < 7; k++) ok(t[k] > t[k - 1], key + " sorted");
      }
    }
  });
  test("生成: 同じシードなら同じ結果", () => {
    eq(L.generate("hot", draws, 5, L.mulberry32(7)), L.generate("hot", draws, 5, L.mulberry32(7)));
  });
  test("生成: バランス型は合計値・奇数個数の条件を守る", () => {
    const s = L.summary(draws);
    for (const t of L.generate("balanced", draws, 50, L.mulberry32(1))) {
      const total = L.sum(t), odd = L.oddCount(t);
      ok(total >= s.sumQ.q25 && total <= s.sumQ.q75, "sum " + total);
      ok(odd >= 2 && odd <= 5, "odd " + odd);
      ok(L.consecutivePairs(t) <= 2, "consecutive");
    }
  });
  test("生成: 完全ランダムは各数字ほぼ均等（2万口）", () => {
    const f = new Array(38).fill(0);
    const rng = L.mulberry32(99);
    for (let i = 0; i < 1000; i++) for (const t of L.generate("random", draws, 20, rng)) for (const n of t) f[n]++;
    const exp = (20000 * 7) / 37;
    for (let n = 1; n <= 37; n++) near(f[n], exp, exp * 0.08, "freq " + n);
  });

  // ---------- 統計 ----------
  test("統計: 出現回数の合計 = 回数×7", () => {
    eq(L.frequencies(draws).reduce((a, b) => a + b, 0), draws.length * 7);
  });
  test("統計: 直近回の数字のギャップは0", () => {
    const g = L.gaps(draws);
    for (const n of draws[draws.length - 1].main) eq(g[n], 0, "gap " + n);
  });
  test("統計: χ²の上側確率が分布表の値と一致", () => {
    near(L.chiSquareSf(2, 2), Math.exp(-1), 1e-9, "df=2 は exp(-x/2)");
    near(L.chiSquareSf(3.841459, 1), 0.05, 1e-5, "df=1 の5%点");
    near(L.chiSquareSf(18.307038, 10), 0.05, 1e-5, "df=10 の5%点");
    near(L.chiSquareSf(50.998460, 36), 0.05, 1e-5, "df=36 の5%点");
    near(L.chiSquareSf(58.619215, 36), 0.01, 1e-5, "df=36 の1%点");
    const r = L.chiSquareUniform(draws);
    eq(r.df, 36);
    near(r.p, L.chiSquareSf(r.chi, 36), 1e-12);
  });

  // ---------- その他 ----------
  test("次回抽せん日: 7日後の金曜", () => {
    eq(L.nextDrawDate("2026-11-06"), "2026-11-13");
    eq(L.nextDrawDate("2026-12-25"), "2027-01-01");
  });
  test("全期間シミュレーション: 購入額と当せん金", () => {
    const hp = L.historicalPrizes([1, 2, 3, 4, 5, 6, 8], [D, { ...D, no: 2, main: [10, 11, 12, 13, 14, 15, 16], bonus: [17, 18] }]);
    eq(hp.spent, 600);
    eq(hp.ranks, [1, 0, 1, 0, 0, 0, 0]);
    eq(hp.won, 1e7);
  });
  test("CSV解析: 公式形式の行を読み、壊れた行は捨てる", () => {
    const csv = [
      "開催回,日付,第1数字,第2数字,第3数字,第4数字,第5数字,第6数字,第7数字,BONUS数字1,BONUS数字2,1等口数,2等口数,3等口数,4等口数,5等口数,6等口数,1等賞金,2等賞金,3等賞金,4等賞金,5等賞金,6等賞金,キャリーオーバー",
      "2,2013/4/12,20,24,29,31,33,34,35,32,12,0,3,63,3631,67155,122990,0,27968500,1864500,18900,2500,1200,247506600",
      "1,2013/04/05,7,10,12,17,23,28,34,3,15,1,24,168,8254,115022,189593,301716500,4144600,828900,9800,1700,900,0",
      "3,2013/4/19,2,2,8,11,14,23,31,5,15,0,0,0,0,0,0,0,0,0,0,0,0,0",
      "4,2013/4/26,1,2,3,4,5,6,99,7,8",
    ].join("\r\n");
    const p = L.parseCsv(csv);
    eq(p.map((d) => d.no), [1, 2], "valid rows sorted");
    eq(p[1].date, "2013-04-12");
    eq(p[1].carry, 247506600);
    eq(p[0].prizes, [301716500, 4144600, 828900, 9800, 1700, 900]);
  });
  test("バックテスト: 理論値と結果の形", () => {
    const bt = L.backtest(draws, { window: 50, ticketsPerDraw: 3 });
    near(bt.theory.avgMatches, 49 / 37, 1e-12);
    near(bt.theory.anyPrizeRate, 393996 / 10295472, 1e-12);
    for (const r of Object.values(bt.results)) {
      eq(r.tickets, 150);
      eq(r.ranks.reduce((a, b) => a + b, 0), 150);
      ok(r.avgMatches >= 0 && r.avgMatches <= 7);
    }
  });

  // ---------- 出力 ----------
  const failed = results.filter((r) => !r.ok);
  if (isNode) {
    for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.name}${r.ok ? "" : "\n     " + r.err}`);
    console.log(`\n${results.length - failed.length}/${results.length} passed`);
    process.exitCode = failed.length ? 1 : 0;
  } else {
    root.TEST_RESULTS = results;
  }
})(typeof window !== "undefined" ? window : globalThis);
