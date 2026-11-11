// ロト7 分析・予想エンジン（DOM非依存）
// draw = { no, date, main:[7], bonus:[2], carry }
(function (root) {
  "use strict";

  const N = 37; // 1..37
  const PICK = 7;

  // ---------- 乱数 ----------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- データ ----------
  function fromRaw(raw) {
    return raw.map((r) => ({ no: r[0], date: r[1], main: r[2], bonus: r[3], carry: r[4], prizes: r[5] || null }));
  }

  // ロト7は毎週金曜抽せん。最終回の日付から次の金曜を返す（YYYY-MM-DD）
  function nextDrawDate(lastDate) {
    const d = new Date(lastDate + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 7);
    return d.toISOString().slice(0, 10);
  }

  const PRICE = 300; // 1口300円

  // この組合せを全期間毎回買っていたら？
  function historicalPrizes(ticket, draws) {
    const ranks = [0, 0, 0, 0, 0, 0, 0];
    let won = 0;
    const hits = [];
    for (const d of draws) {
      const pr = prizeRank(ticket, d);
      ranks[pr.rank]++;
      if (pr.rank) {
        const amount = d.prizes ? d.prizes[pr.rank - 1] : 0;
        won += amount;
        hits.push({ no: d.no, date: d.date, rank: pr.rank, amount });
      }
    }
    return { ranks, won, spent: draws.length * PRICE, hits };
  }

  // 公式CSV（またはthekyo形式）を解析。Shift_JIS/UTF-8どちらでも可（呼び出し側でデコード済み文字列を渡す）
  function parseCsv(text) {
    const draws = [];
    for (const line of text.split(/\r?\n/)) {
      const c = line.split(",").map((s) => s.trim());
      if (c.length < 11 || !/^\d+$/.test(c[0])) continue;
      const nums = c.slice(2, 11).map(Number);
      if (nums.some((n) => !(n >= 1 && n <= N))) continue;
      if (new Set(nums).size !== 9) continue;
      const d = c[1].split(/[\/\-]/).map(Number);
      const date = `${d[0]}-${String(d[1]).padStart(2, "0")}-${String(d[2]).padStart(2, "0")}`;
      draws.push({
        no: Number(c[0]),
        date,
        main: nums.slice(0, 7).sort((a, b) => a - b),
        bonus: nums.slice(7, 9),
        carry: Number(c[c.length - 1]) || 0,
        prizes: c.length >= 24 ? c.slice(17, 23).map((x) => Number(x) || 0) : null,
      });
    }
    draws.sort((a, b) => a.no - b.no);
    return draws;
  }

  // ---------- 統計 ----------
  function frequencies(draws, key = "main") {
    const f = new Array(N + 1).fill(0);
    for (const d of draws) for (const n of d[key]) f[n]++;
    return f;
  }

  // 最後に出現してから何回経過したか（0=直近回で出現）
  function gaps(draws) {
    const g = new Array(N + 1).fill(draws.length);
    for (let i = draws.length - 1; i >= 0; i--) {
      const age = draws.length - 1 - i;
      for (const n of draws[i].main) if (g[n] === draws.length) g[n] = age;
    }
    return g;
  }

  function sum(a) { return a.reduce((s, x) => s + x, 0); }
  function oddCount(a) { return a.filter((x) => x % 2).length; }
  function consecutivePairs(sorted) {
    let c = 0;
    for (let i = 1; i < sorted.length; i++) if (sorted[i] - sorted[i - 1] === 1) c++;
    return c;
  }

  function quantile(sortedArr, q) {
    const pos = (sortedArr.length - 1) * q;
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (pos - lo);
  }

  // 正規化不完全ガンマ関数 Q(a, x) = 1 - P(a, x)  （χ²検定のp値用）
  function gammaln(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log((2.5066282746310005 * ser) / x);
  }
  function gammaQ(a, x) {
    if (x < a + 1) {
      let sum = 1 / a, del = sum, ap = a;
      for (let n = 0; n < 500; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-14) break; }
      return 1 - sum * Math.exp(-x + a * Math.log(x) - gammaln(a));
    }
    let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
    for (let i = 1; i < 500; i++) {
      const an = -i * (i - a); b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-14) break;
    }
    return Math.exp(-x + a * Math.log(x) - gammaln(a)) * h;
  }

  // 各数字の出現回数が一様分布から外れているかのχ²適合度検定
  function chiSquareUniform(draws) {
    const f = frequencies(draws);
    const expected = (draws.length * PICK) / N;
    let chi = 0;
    for (let n = 1; n <= N; n++) chi += (f[n] - expected) ** 2 / expected;
    const df = N - 1;
    return { chi, df, p: gammaQ(df / 2, chi / 2), expected };
  }

  function summary(draws) {
    const sums = draws.map((d) => sum(d.main)).sort((a, b) => a - b);
    const oddDist = new Array(PICK + 1).fill(0);
    const consDist = new Array(PICK).fill(0);
    for (const d of draws) { oddDist[oddCount(d.main)]++; consDist[consecutivePairs(d.main)]++; }
    return {
      sums,
      sumQ: { q10: quantile(sums, 0.1), q25: quantile(sums, 0.25), q50: quantile(sums, 0.5), q75: quantile(sums, 0.75), q90: quantile(sums, 0.9) },
      oddDist,
      consDist,
    };
  }

  // ---------- 組合せ論 ----------
  function comb(n, k) {
    if (k < 0 || k > n) return 0;
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    return Math.round(r);
  }
  const TOTAL = comb(N, PICK); // 10,295,472

  // 等級ごとの理論確率（ランダム1口あたり）
  const PRIZE_COMBOS = {
    1: 1,
    2: comb(7, 6) * 2,
    3: comb(7, 6) * 28,
    4: comb(7, 5) * comb(30, 2),
    5: comb(7, 4) * comb(30, 3),
    6: comb(7, 3) * (comb(30, 4) - comb(28, 4)),
  };

  function prizeRank(ticket, draw) {
    let m = 0, b = 0;
    for (const n of ticket) {
      if (draw.main.includes(n)) m++;
      else if (draw.bonus.includes(n)) b++;
    }
    let rank = 0;
    if (m === 7) rank = 1;
    else if (m === 6) rank = b ? 2 : 3;
    else if (m === 5) rank = 4;
    else if (m === 4) rank = 5;
    else if (m === 3 && b) rank = 6;
    return { matches: m, bonus: b, rank };
  }

  // ---------- 予想戦略 ----------
  // 各戦略は過去データから「数字ごとの重み」を返す。重み付き非復元抽出で7個選ぶ。
  const STRATEGIES = {
    random: {
      label: "完全ランダム",
      desc: "全ての数字を同じ確率で選ぶ。比較の基準（ベースライン）。",
      weights: () => new Array(N + 1).fill(1).fill(0, 0, 1),
    },
    hot: {
      label: "ホット（直近50回）",
      desc: "直近50回でよく出ている数字ほど選ばれやすい。「流れに乗る」作戦。",
      weights: (h) => {
        const f = frequencies(h.slice(-50));
        return f.map((x, i) => (i ? x + 1 : 0));
      },
    },
    longterm: {
      label: "全期間の出現頻度",
      desc: "全期間の出現回数に比例して選ぶ。「出やすい数字がある」仮説。",
      weights: (h) => frequencies(h).map((x, i) => (i ? x + 1 : 0)),
    },
    cold: {
      label: "コールド（ご無沙汰）",
      desc: "長く出ていない数字ほど選ばれやすい。「そろそろ来る」作戦。",
      weights: (h) => gaps(h).map((g, i) => (i ? g + 1 : 0)),
    },
    balanced: {
      label: "バランス型",
      desc: "ランダムに選び、合計値・奇偶比・連番数が過去の典型的な範囲に収まる組だけ採用。",
      weights: () => new Array(N + 1).fill(1).fill(0, 0, 1),
      filter: (h) => {
        const s = summary(h);
        return (t) => {
          const total = sum(t), odd = oddCount(t);
          return total >= s.sumQ.q25 && total <= s.sumQ.q75 && odd >= 2 && odd <= 5 && consecutivePairs(t) <= 2;
        };
      },
    },
  };

  function weightedPick(weights, rng) {
    const w = weights.slice();
    const out = [];
    for (let k = 0; k < PICK; k++) {
      let total = 0;
      for (let n = 1; n <= N; n++) total += w[n];
      let r = rng() * total;
      let chosen = N;
      for (let n = 1; n <= N; n++) { r -= w[n]; if (r <= 0 && w[n] > 0) { chosen = n; break; } }
      out.push(chosen);
      w[chosen] = 0;
    }
    return out.sort((a, b) => a - b);
  }

  function generate(strategyKey, history, count, rng) {
    const s = STRATEGIES[strategyKey];
    const weights = s.weights(history);
    const accept = s.filter ? s.filter(history) : null;
    const tickets = [];
    const seen = new Set();
    let guard = 0;
    while (tickets.length < count && guard++ < count * 2000) {
      const t = weightedPick(weights, rng);
      const key = t.join(",");
      if (seen.has(key)) continue;
      if (accept && !accept(t)) continue;
      seen.add(key);
      tickets.push(t);
    }
    return tickets;
  }

  // ---------- バックテスト ----------
  // 直近 `window` 回それぞれについて、その回より前のデータだけで予想し、実際の結果と照合する。
  function backtest(draws, { window = 300, ticketsPerDraw = 5, seed = 7 } = {}) {
    const start = Math.max(100, draws.length - window);
    const results = {};
    for (const key of Object.keys(STRATEGIES)) {
      const rng = mulberry32(seed);
      const r = { key, label: STRATEGIES[key].label, tickets: 0, matchSum: 0, ranks: [0, 0, 0, 0, 0, 0, 0], matchDist: new Array(PICK + 1).fill(0) };
      for (let i = start; i < draws.length; i++) {
        const history = draws.slice(0, i);
        for (const t of generate(key, history, ticketsPerDraw, rng)) {
          const pr = prizeRank(t, draws[i]);
          r.tickets++;
          r.matchSum += pr.matches;
          r.matchDist[pr.matches]++;
          r.ranks[pr.rank]++;
        }
      }
      r.avgMatches = r.matchSum / r.tickets;
      r.anyPrizeRate = (r.tickets - r.ranks[0]) / r.tickets;
      results[key] = r;
    }
    const theory = {
      avgMatches: (PICK * PICK) / N,
      anyPrizeRate: Object.values(PRIZE_COMBOS).reduce((a, b) => a + b, 0) / TOTAL,
    };
    return { from: draws[start].no, to: draws[draws.length - 1].no, draws: draws.length - start, ticketsPerDraw, results, theory };
  }

  // 生成した組合せと過去の当選番号との最大一致数
  function bestHistoricalMatch(ticket, draws) {
    let best = { matches: -1, no: null };
    for (const d of draws) {
      let m = 0;
      for (const n of ticket) if (d.main.includes(n)) m++;
      if (m > best.matches) best = { matches: m, no: d.no };
    }
    return best;
  }

  root.Loto7 = {
    N, PICK, TOTAL, PRIZE_COMBOS, STRATEGIES,
    mulberry32, fromRaw, parseCsv, frequencies, gaps, summary, chiSquareUniform,
    sum, oddCount, consecutivePairs, prizeRank, generate, backtest, bestHistoricalMatch, comb,
    nextDrawDate, historicalPrizes, PRICE,
    chiSquareSf: (chi, df) => gammaQ(df / 2, chi / 2),
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.Loto7;
})(typeof window !== "undefined" ? window : globalThis);
