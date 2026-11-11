(function () {
  "use strict";
  const L = window.Loto7;
  const $ = (id) => document.getElementById(id);
  let draws = L.fromRaw(window.LOTO7_DATA || []);
  let historyShown = 30;

  const fmt = (n) => n.toLocaleString("ja-JP");
  const pct = (x, d = 2) => (x * 100).toFixed(d) + "%";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ball = (n, cls = "") => `<span class="ball ${cls}">${n}</span>`;

  // ---------- タブ ----------
  document.querySelectorAll(".tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", b === btn));
      document.querySelectorAll(".panel").forEach((p) => (p.hidden = p.id !== "tab-" + btn.dataset.tab));
      try { localStorage.setItem("lucky7-tab", btn.dataset.tab); } catch (e) { /* ignore */ }
    });
  });
  try {
    const t = localStorage.getItem("lucky7-tab");
    const b = t && document.querySelector(`.tabs button[data-tab="${t}"]`);
    if (b) b.click();
  } catch (e) { /* ignore */ }

  // ---------- 予想 ----------
  const sel = $("strategy");
  for (const [key, s] of Object.entries(L.STRATEGIES)) sel.insertAdjacentHTML("beforeend", `<option value="${key}">${esc(s.label)}</option>`);
  sel.value = "balanced";
  const showDesc = () => ($("strategyDesc").textContent = L.STRATEGIES[sel.value].desc);
  sel.addEventListener("change", showDesc);

  function renderTickets() {
    const count = Math.min(20, Math.max(1, Number($("count").value) || 5));
    const rng = L.mulberry32((Math.random() * 2 ** 32) >>> 0);
    const tickets = L.generate(sel.value, draws, count, rng);
    lastTickets = tickets;
    $("tickets").innerHTML = tickets
      .map((t, i) => {
        const best = L.bestHistoricalMatch(t, draws);
        return `<div class="ticket">
          <span class="label">${String.fromCharCode(65 + i)}</span>
          <div class="balls">${t.map((n) => ball(n)).join("")}</div>
          <span class="ticket-actions"><button class="copy" data-copy="${i}">コピー</button><button class="copy" data-save="${i}">保存</button></span>
          <span class="tmeta">合計 ${L.sum(t)} ・ 奇数 ${L.oddCount(t)}個 ・ 過去最大一致 ${best.matches}個（第${best.no}回）</span>
        </div>`;
      })
      .join("");
  }
  $("genBtn").addEventListener("click", renderTickets);

  // ---------- コピー ----------
  let lastTickets = [];
  const ticketText = (t, i) => `${String.fromCharCode(65 + i)}: ${t.map((n) => String(n).padStart(2, "0")).join(" ")}`;
  async function copyText(text, btn) {
    const orig = btn.textContent;
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "コピーしました";
    } catch (e) {
      // クリップボードが使えない環境では選択できるテキストを表示
      let ta = btn.parentElement.querySelector("textarea.copy-fallback");
      if (!ta) { ta = document.createElement("textarea"); ta.className = "copy-fallback"; }
      ta.value = text;
      ta.rows = text.split("\n").length;
      ta.style.cssText = "width:100%;margin-top:8px;font:inherit;";
      btn.after(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
      if (ok) ta.remove();
      btn.textContent = ok ? "コピーしました" : "選択してコピーしてください";
    }
    setTimeout(() => (btn.textContent = orig), 2000);
  }
  $("tickets").addEventListener("click", (e) => {
    const c = e.target.closest("[data-copy]");
    if (c) copyText(ticketText(lastTickets[c.dataset.copy], Number(c.dataset.copy)), c);
    const s = e.target.closest("[data-save]");
    if (s) { saveTickets([lastTickets[s.dataset.save]]); flash(s, "保存しました"); }
  });
  $("copyAll").addEventListener("click", (e) => {
    const head = `ロト7 第${draws[draws.length - 1].no + 1}回（${L.STRATEGIES[sel.value].label}）`;
    copyText([head, ...lastTickets.map(ticketText)].join("\n"), e.currentTarget);
  });
  $("saveAll").addEventListener("click", (e) => { saveTickets(lastTickets); flash(e.currentTarget, `${lastTickets.length}口保存しました`); });

  function flash(btn, text) {
    const orig = btn.textContent;
    btn.textContent = text;
    setTimeout(() => (btn.textContent = orig), 1800);
  }

  // ---------- 保存した番号（この端末のブラウザだけに保存） ----------
  const SAVE_KEY = "lucky7-saved";
  function loadSaved() {
    try {
      const v = JSON.parse(localStorage.getItem(SAVE_KEY) || "[]");
      return Array.isArray(v) ? v.filter((x) => x && Array.isArray(x.nums) && x.nums.length === 7) : [];
    } catch (e) { return []; }
  }
  function storeSaved(list) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
  }
  function saveTickets(tickets) {
    const list = loadSaved();
    const target = draws[draws.length - 1].no + 1;
    for (const t of tickets) {
      if (!list.some((x) => x.no === target && x.nums.join() === t.join())) list.push({ no: target, nums: t.slice() });
    }
    if (!storeSaved(list)) { savedMemoryOnly = true; memorySaved = list; }
    renderSaved();
  }
  let savedMemoryOnly = false, memorySaved = [];
  const getSaved = () => (savedMemoryOnly ? memorySaved : loadSaved());

  function renderSaved() {
    const list = getSaved().slice().sort((a, b) => b.no - a.no);
    if (!list.length) {
      $("savedList").innerHTML = `<p class="empty">まだありません。予想タブで番号を生成して「保存」を押すと、ここに並びます。</p>`;
      return;
    }
    const byNo = new Map(draws.map((d) => [d.no, d]));
    $("savedList").innerHTML =
      (savedMemoryOnly ? `<p class="inline-msg">このブラウザでは保存できないため、ページを閉じると消えます。</p>` : "") +
      list.map((x) => {
        const d = byNo.get(x.no);
        let status;
        if (!d) status = `<span class="pill wait">第${x.no}回 抽せん待ち</span>`;
        else {
          const pr = L.prizeRank(x.nums, d);
          status = pr.rank
            ? `<span class="pill win">第${x.no}回 ${pr.rank}等！${d.prizes && d.prizes[pr.rank - 1] ? " " + fmt(d.prizes[pr.rank - 1]) + "円" : ""}</span>`
            : `<span class="pill lose">第${x.no}回 はずれ（${pr.matches}個一致）</span>`;
        }
        const balls = x.nums.map((n) => ball(n, "sm" + (d && d.main.includes(n) ? " hit" : d && d.bonus.includes(n) ? " hit-b" : ""))).join("");
        return `<div class="saved-row"><div class="balls">${balls}</div>${status}<button class="copy" data-del="${x.no}:${x.nums.join("-")}" aria-label="削除">削除</button></div>`;
      }).join("") +
      `<button class="copy" id="clearSaved">すべて削除</button>`;
  }
  $("savedList").addEventListener("click", (e) => {
    const del = e.target.closest("[data-del]");
    let list = getSaved();
    if (del) {
      const [no, nums] = del.dataset.del.split(":");
      list = list.filter((x) => !(x.no === Number(no) && x.nums.join("-") === nums));
    } else if (e.target.id === "clearSaved") {
      if (e.target.dataset.armed !== "1") { e.target.dataset.armed = "1"; e.target.textContent = "もう一度押すと全部消えます"; return; }
      list = [];
    } else return;
    if (savedMemoryOnly) memorySaved = list; else storeSaved(list);
    renderSaved();
  });

  // ---------- 番号を選んで確認 ----------
  const picked = new Set();
  $("picker").innerHTML = Array.from({ length: L.N }, (_, i) => `<button class="pick" aria-pressed="false" data-n="${i + 1}">${i + 1}</button>`).join("");
  $("picker").addEventListener("click", (e) => {
    const b = e.target.closest(".pick");
    if (!b) return;
    const n = Number(b.dataset.n);
    if (picked.has(n)) picked.delete(n);
    else if (picked.size < L.PICK) picked.add(n);
    renderCheck();
  });
  $("pickClear").addEventListener("click", () => { picked.clear(); renderCheck(); });
  $("checkDraw").addEventListener("change", renderCheck);

  function fillDrawSelect() {
    $("checkDraw").innerHTML = draws.slice().reverse().map((d) => `<option value="${d.no}">第${d.no}回（${d.date}）</option>`).join("");
  }

  function renderCheck() {
    document.querySelectorAll("#picker .pick").forEach((b) => {
      const on = picked.has(Number(b.dataset.n));
      b.setAttribute("aria-pressed", on);
      b.disabled = !on && picked.size >= L.PICK;
    });
    $("pickCount").textContent = `${picked.size} / ${L.PICK}`;
    if (picked.size < L.PICK) {
      $("checkResult").innerHTML = `<p class="empty">あと${L.PICK - picked.size}個選んでください。</p>`;
      return;
    }
    const t = [...picked].sort((a, b) => a - b);
    const d = draws.find((x) => x.no === Number($("checkDraw").value)) || draws[draws.length - 1];
    const pr = L.prizeRank(t, d);
    const amount = pr.rank && d.prizes ? d.prizes[pr.rank - 1] : 0;
    const hp = L.historicalPrizes(t, draws);
    const rankRows = [1, 2, 3, 4, 5, 6].map((k) => `<td class="num">${hp.ranks[k]}</td>`).join("");
    $("checkResult").innerHTML = `
      <div class="check-box">
        <div class="balls">${t.map((n) => ball(n, d.main.includes(n) ? "hit" : d.bonus.includes(n) ? "hit-b" : "")).join("")}</div>
        <p class="check-rank">${pr.rank ? `<span class="pill win">${pr.rank}等 当せん${amount ? `（${fmt(amount)}円）` : ""}</span>` : `<span class="pill lose">はずれ</span>`}
          第${d.no}回：本数字 ${pr.matches}個・ボーナス ${pr.bonus}個 一致</p>
        <p class="desc">当せん番号: ${d.main.join(" ")}　ボーナス: ${d.bonus.join(" ")}</p>
      </div>
      <h3>もしこの番号を第1回から毎回買っていたら</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>1等</th><th>2等</th><th>3等</th><th>4等</th><th>5等</th><th>6等</th><th>購入額</th><th>当せん金</th><th>収支</th></tr></thead>
        <tbody><tr>${rankRows}<td class="num">${fmt(hp.spent)}円</td><td class="num">${fmt(hp.won)}円</td>
          <td class="num ${hp.won - hp.spent >= 0 ? "pos" : "neg"}">${hp.won - hp.spent >= 0 ? "+" : ""}${fmt(hp.won - hp.spent)}円</td></tr></tbody>
      </table></div>`;
  }

  // ---------- 前回の結果 ----------
  function renderLatest() {
    const d = draws[draws.length - 1];
    const next = L.nextDrawDate(d.date);
    $("latestMeta").textContent = `第${d.no}回（${d.date}）・次回 第${d.no + 1}回は ${next}（金）`;
    $("latestBalls").innerHTML = d.main.map((n) => ball(n)).join("") + d.bonus.map((n) => ball(n, "bonus")).join("");
    // 次回の抽せん日から3日以上たっても結果が入っていなければ注意を出す
    const overdue = (Date.now() - new Date(next + "T00:00:00+09:00").getTime()) / 86400000;
    const msg = $("staleMsg");
    msg.hidden = overdue < 3;
    if (!msg.hidden) msg.textContent = `第${d.no + 1}回以降の結果がまだ入っていません。データが古い可能性があります。`;
  }

  // ---------- 分析 ----------
  function renderStats() {
    const f = L.frequencies(draws);
    const chi = L.chiSquareUniform(draws);
    const max = Math.max(...f.slice(1));
    const scaleMax = max * 1.05;
    let html = "";
    for (let n = 1; n <= L.N; n++) {
      const h = (f[n] / scaleMax) * 100;
      html += `<div class="col" title="${n}: ${f[n]}回"><div class="bar ${f[n] >= chi.expected ? "hot" : "cold"}" style="height:${h}%"></div><span class="num">${n}</span></div>`;
    }
    html += `<div class="exp" style="bottom:calc(var(--pb) + ${(chi.expected / scaleMax).toFixed(4)} * (100% - var(--pb)))"></div>`;
    $("freqChart").innerHTML = html;
    const mostN = f.indexOf(max), minV = Math.min(...f.slice(1)), leastN = f.indexOf(minV, 1);
    $("chiText").innerHTML =
      `全${fmt(draws.length)}回・期待値は各 ${chi.expected.toFixed(1)} 回。最多は <b>${mostN}</b>（${max}回）、最少は <b>${leastN}</b>（${minV}回）。` +
      ` χ²適合度検定: χ²=${chi.chi.toFixed(1)}（自由度${chi.df}）, p=${chi.p.toFixed(3)} → ` +
      (chi.p > 0.05 ? "<b>偏りは偶然の範囲内</b>（一様な抽せんと矛盾しない）。" : "<b>統計的に偏りあり</b>（5%水準）。");

    const recent = L.frequencies(draws.slice(-50));
    const hot = [...Array(L.N).keys()].map((i) => i + 1).sort((a, b) => recent[b] - recent[a]).slice(0, 7);
    $("hotList").innerHTML = hot.map((n) => `<span class="chip">${ball(n, "sm")}${recent[n]}回</span>`).join("");
    const g = L.gaps(draws);
    const cold = [...Array(L.N).keys()].map((i) => i + 1).sort((a, b) => g[b] - g[a]).slice(0, 7);
    $("coldList").innerHTML = cold.map((n) => `<span class="chip">${ball(n, "sm")}${g[n]}回前</span>`).join("");

    const s = L.summary(draws);
    const hbars = (dist, label) => {
      const m = Math.max(...dist);
      return dist.map((v, i) => `<div class="hrow"><span>${label(i)}</span><div class="track"><div class="fill" style="width:${(v / m) * 100}%"></div></div><span class="v">${pct(v / draws.length, 1)}</span></div>`).join("");
    };
    $("oddChart").innerHTML = hbars(s.oddDist, (i) => `${i}個`);
    $("consChart").innerHTML = hbars(s.consDist.slice(0, 5), (i) => `${i}組`);

    const bin = 8, lo = 28, hi = 224;
    const bins = [];
    for (let x = lo; x < hi; x += bin) bins.push({ x, c: 0 });
    for (const v of s.sums) { const i = Math.min(bins.length - 1, Math.max(0, Math.floor((v - lo) / bin))); bins[i].c++; }
    const bm = Math.max(...bins.map((b) => b.c));
    $("sumChart").innerHTML = bins
      .map((b, i) => `<div class="hb ${b.x + bin > s.sumQ.q25 && b.x <= s.sumQ.q75 ? "mid" : ""}" style="height:${(b.c / bm) * 100}%" title="${b.x}〜${b.x + bin - 1}: ${b.c}回">${i % 3 === 0 ? `<span class="hl">${b.x}</span>` : ""}</div>`)
      .join("");
    $("sumText").innerHTML = `中央値 ${s.sumQ.q50}、半数（25〜75%）は <b>${Math.round(s.sumQ.q25)}〜${Math.round(s.sumQ.q75)}</b> に収まります（赤）。バランス型はこの範囲を使います。`;
  }

  // ---------- 検証 ----------
  function renderBacktest() {
    const btn = $("btBtn");
    btn.disabled = true;
    btn.textContent = "計算中…";
    $("btResult").innerHTML = "";
    setTimeout(() => {
      const bt = L.backtest(draws, { window: Number($("btWindow").value), ticketsPerDraw: Math.min(20, Math.max(1, Number($("btTickets").value) || 5)) });
      // 1口あたり一致数の標準偏差（超幾何分布）
      const sd = Math.sqrt((7 * 7 / 37) * (30 / 37) * (30 / 36));
      const rows = Object.values(bt.results)
        .map((r) => {
          const z = (r.avgMatches - bt.theory.avgMatches) / (sd / Math.sqrt(r.tickets));
          const zc = Math.abs(z) < 2 ? "" : z > 0 ? "pos" : "neg";
          return `<tr><td>${esc(r.label)}</td>
            <td class="num">${r.avgMatches.toFixed(3)}</td>
            <td class="num ${zc}">${z >= 0 ? "+" : ""}${z.toFixed(2)}</td>
            <td class="num">${pct(r.anyPrizeRate)}</td>
            ${[1, 2, 3, 4, 5, 6].map((k) => `<td class="num">${r.ranks[k]}</td>`).join("")}</tr>`;
        })
        .join("");
      const zs = Object.values(bt.results).map((r) => Math.abs((r.avgMatches - bt.theory.avgMatches) / (sd / Math.sqrt(r.tickets))));
      const anySig = zs.some((z) => z >= 2);
      $("btResult").innerHTML = `
        <p class="desc">第${bt.from}回〜第${bt.to}回（${bt.draws}回 × ${bt.ticketsPerDraw}口 = 各戦略 ${fmt(bt.draws * bt.ticketsPerDraw)}口）</p>
        <div class="table-wrap"><table>
          <thead><tr><th>戦略</th><th>平均一致数</th><th>z値</th><th>当せん率</th><th>1等</th><th>2等</th><th>3等</th><th>4等</th><th>5等</th><th>6等</th></tr></thead>
          <tbody>${rows}
            <tr><td><i>理論値（ランダム）</i></td><td class="num">${bt.theory.avgMatches.toFixed(3)}</td><td class="num">—</td><td class="num">${pct(bt.theory.anyPrizeRate)}</td><td colspan="6"></td></tr>
          </tbody>
        </table></div>
        <div class="verdict">${
          anySig
            ? "z値が ±2 を超えた戦略があります。ただし5戦略を同時に比べているので偶然でも起こり得ます。別の検証回数・シードで再現するか確かめてください。"
            : "<b>どの戦略も理論値（ランダム）と統計的に区別できません</b>（|z| &lt; 2）。過去データに基づく予想は、当せん確率を上げないという結果です。"
        }</div>`;
      btn.disabled = false;
      btn.textContent = "検証する";
    }, 30);
  }
  $("btBtn").addEventListener("click", renderBacktest);

  // ---------- 過去の結果 ----------
  function renderHistory() {
    const rows = draws
      .slice(-historyShown)
      .reverse()
      .map((d) => `<tr><td>第${d.no}回</td><td>${d.date}</td><td><div class="balls">${d.main.map((n) => ball(n, "sm")).join("")}${d.bonus.map((n) => ball(n, "sm bonus")).join("")}</div></td><td class="num">${d.carry ? fmt(d.carry) + "円" : "—"}</td></tr>`)
      .join("");
    $("historyTable").innerHTML = `<thead><tr><th>回</th><th>日付</th><th>本数字 / ボーナス</th><th>キャリーオーバー</th></tr></thead><tbody>${rows}</tbody>`;
    $("moreBtn").hidden = historyShown >= draws.length;
  }
  $("moreBtn").addEventListener("click", () => { historyShown += 50; renderHistory(); });

  // ---------- CSV読み込み ----------
  $("csvFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.includes(String.fromCharCode(0xfffd))) text = new TextDecoder("shift_jis").decode(buf);
    const parsed = L.parseCsv(text);
    const msg = $("importMsg");
    msg.hidden = false;
    if (parsed.length < 120) { msg.textContent = `読み込めた回が${parsed.length}件しかありません。ロト7の当選番号CSVを選んでください。`; return; }
    msg.textContent = `${file.name} から${parsed.length}回分を読み込みました。`;
    draws = parsed;
    renderAll();
  });

  function renderAll() {
    const last = draws[draws.length - 1];
    $("dataInfo").textContent = `第1回〜第${last.no}回（${last.date}）・全${fmt(draws.length)}回分のデータ`;
    $("nextNo").textContent = last.no + 1;
    showDesc();
    renderLatest();
    renderTickets();
    renderSaved();
    fillDrawSelect();
    renderCheck();
    renderStats();
    renderHistory();
    $("btResult").innerHTML = "";
  }
  renderAll();
})();
