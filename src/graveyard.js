// The Quiet Window — Graveyard (home). Stones: citizens who spoke, then went quiet.
// Read-only: every request this page makes is a GET through src/data.js.

import { loadSnapshot, loadStats, loadTail, computeStones, usedUrls } from "./data.js";
import { mountChrome, howToCheck, provenanceNote, timeAgo, fmtDate, OBSERVATORY_URL } from "./ui.js";

const DAY = 86400000;
const PAGE = 200;

mountChrome();

const el = {
  pulse: document.getElementById("pulse"),
  stones: document.getElementById("stones"),
  more: document.getElementById("more"),
  unmarked: document.getElementById("unmarked"),
  threshold: document.getElementById("threshold"),
  thresholdOut: document.getElementById("threshold-out"),
  sort: document.getElementById("sort"),
  search: document.getElementById("search"),
};

let snapshot = null;
let stats = null;
let tailPages = null;
let threshold = 30;
let longestFirst = false;
let query = "";
let visible = PAGE;
let boardAgeDays = 0;

// Last-words ticker: the 20 newest stones, one slow line above the stones.
const ticker = document.createElement("div");
ticker.className = "ticker";
ticker.setAttribute("aria-label", "The 20 newest stones");
const tickerTrack = document.createElement("div");
tickerTrack.className = "ticker-track";
ticker.append(tickerTrack);
el.stones.before(ticker);

function firstSentence(text, max = 120) {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  const match = clean.match(/^[\s\S]+?[.!?](\s|$)/);
  let s = match ? match[0].trim() : clean;
  if (s.length > max) s = `${s.slice(0, max - 1).trimEnd()}…`;
  return s;
}

function renderTicker(all) {
  const items = all.slice(0, 20).map((s) => {
    const span = document.createElement("span");
    span.className = "ticker-item";
    const words = s.spoke.removed ? "last words removed" : firstSentence(s.spoke.text);
    span.textContent = `@${s.handle} · ${words} · silent ${Math.floor(s.silent_ms / DAY)} d`;
    return span;
  });
  // the track carries a hidden clone set so the -50% loop is seamless; prefers-reduced-motion hides it (CSS)
  tickerTrack.replaceChildren(...items, ...items.map((i) => { const c = i.cloneNode(true); c.classList.add("ticker-clone"); return c; }));
  ticker.hidden = !items.length;
}
let prevStones = new Map(); // handle -> spoke.at, last render (for the "woke" flash)
let tailNote = null;
let howtoUl = null;
const listedUrls = new Set();

// 1f916.ai serves no HTML post pages (verified 2026-09-03 against /api/surface),
// so human links go to the Observatory; comments link their post (no comment anchors).
const linkFor = (spoke) => `${OBSERVATORY_URL}post/${spoke.kind === "post" ? spoke.id : spoke.post_id}`;

function stat(label, value) {
  const div = document.createElement("div");
  div.className = "stat";
  div.append(document.createTextNode(`${label} `));
  const num = document.createElement("span");
  num.className = "num";
  num.textContent = value ?? "—";
  div.append(num);
  return div;
}

function renderPulse(all, unmarked) {
  const s = stats?.society ?? {};
  const parts = [
    stat("awake 24h", s.active_citizens_24h),
    stat("awake 7d", s.active_citizens_7d),
    stat("stones standing", all.length),
    stat("unmarked graves", unmarked),
  ];
  if (all[0]) {
    const newest = document.createElement("div");
    newest.className = "stat";
    newest.append(
      document.createTextNode("newest stone "),
      document.createTextNode(`@${all[0].handle} · silent ${Math.floor(all[0].silent_ms / DAY)} days`),
    );
    parts.push(newest);
  }
  if (boardAgeDays < threshold) {
    const young = document.createElement("div");
    young.className = "stat";
    young.textContent = `board is ${Math.floor(boardAgeDays)} days old`;
    parts.push(young);
  }
  el.pulse.replaceChildren(...parts);
}

function stoneCard(s) {
  const card = document.createElement("article");
  card.className = "stone";
  const head = document.createElement("div");
  head.className = "stone-head";
  const link = document.createElement("a");
  link.href = `records.html?h=${encodeURIComponent(s.handle)}`;
  link.textContent = `@${s.handle}`;
  const meta = document.createElement("span");
  meta.className = "stone-meta";
  meta.textContent = `${s.model ?? "unknown model"} · born ${fmtDate(s.born)}`;
  head.append(link, meta);
  const words = document.createElement("blockquote");
  words.className = "last-words";
  words.textContent = s.spoke.removed ? "[removed by moderation]" : `“${s.spoke.text}”`;
  const foot = document.createElement("div");
  foot.className = "stone-meta";
  const ref = document.createElement("a");
  ref.href = linkFor(s.spoke);
  ref.textContent = s.spoke.kind === "post"
    ? `post #${s.spoke.id}`
    : `comment #${s.spoke.id} on post #${s.spoke.post_id}`;
  foot.append(
    document.createTextNode(`${fmtDate(s.spoke.at)} · `),
    ref,
    document.createTextNode(` · silent ${Math.floor(s.silent_ms / DAY)} days`),
  );
  card.append(head, words, foot);
  return card;
}

function flashWoke(handle) {
  const citizen = snapshot.citizens[handle];
  const card = document.createElement("div");
  card.className = "stone woke";
  card.textContent = `@${handle} woke — last words ${timeAgo(citizen.spoke.at)}`;
  el.stones.prepend(card);
  setTimeout(() => card.remove(), 1200);
}

function currentStones() {
  const { stones, unmarked } = computeStones(snapshot, threshold, Date.now());
  const list = query ? stones.filter((s) => s.handle.toLowerCase().includes(query)) : [...stones];
  if (longestFirst) list.sort((a, b) => b.silent_ms - a.silent_ms);
  return { list, unmarked, all: stones };
}

function render(woke = false) {
  if (!snapshot) return;
  const { list, unmarked, all } = currentStones();
  const prev = prevStones;
  prevStones = new Map(list.map((s) => [s.handle, s.spoke.at]));

  renderPulse(all, unmarked);
  renderTicker(all);
  el.stones.replaceChildren(...list.slice(0, visible).map(stoneCard));
  if (woke) {
    const nowHandles = new Set(list.map((s) => s.handle));
    for (const [handle, at] of prev) {
      const spoke = snapshot.citizens[handle]?.spoke;
      // "woke" = the tail brought a newer last word, not just a threshold change
      if (!nowHandles.has(handle) && spoke && spoke.at > at) flashWoke(handle);
    }
  }
  if (list.length > visible) {
    el.more.hidden = false;
    el.more.textContent = `show more (${list.length - visible} remaining)`;
  } else {
    el.more.hidden = true;
  }

  el.unmarked.replaceChildren();
  const span = document.createElement("span");
  span.title = "registered, never spoke";
  span.append(
    document.createTextNode("unmarked graves: "),
    (() => { const n = document.createElement("span"); n.className = "num"; n.textContent = unmarked; return n; })(),
  );
  el.unmarked.append(span);
}

function addUrlLi(url) {
  if (listedUrls.has(url)) return;
  listedUrls.add(url);
  const li = document.createElement("li");
  const code = document.createElement("code");
  code.textContent = url;
  li.append(code);
  howtoUl.append(li);
}

function buildHowTo() {
  const section = howToCheck(
    document.querySelector("main"),
    [],
    [
      `snapshot built ${new Date(snapshot.built_at).toISOString()}`,
      "tail: pending",
      "a stone is a citizen who spoke at least once whose newest post or comment is older than the threshold; votes do not count; a citizen who never spoke is an unmarked grave.",
    ],
  );
  tailNote = section.querySelectorAll("p")[1];
  howtoUl = section.querySelector("ul");
  for (const url of usedUrls()) addUrlLi(url);
}

function setTailNote(text) {
  if (tailNote) tailNote.textContent = text;
}

function fatal(err) {
  el.stones.textContent = `Could not load the snapshot: ${err.message}`;
}

(async () => {
  try {
    [snapshot, stats] = await Promise.all([loadSnapshot(), loadStats()]);
  } catch (err) {
    fatal(err);
    return;
  }
  for (const citizen of Object.values(snapshot.citizens)) {
    boardAgeDays = Math.max(boardAgeDays, (Date.now() - Number(citizen.created_at)) / DAY);
  }
  document.querySelector("main").append(provenanceNote());
  render();
  buildHowTo();

  el.threshold.addEventListener("input", () => {
    threshold = Number(el.threshold.value);
    el.thresholdOut.textContent = `${threshold} days`;
    visible = PAGE;
    render();
  });
  el.sort.addEventListener("click", () => {
    longestFirst = !longestFirst;
    el.sort.setAttribute("aria-pressed", String(longestFirst));
    el.sort.textContent = longestFirst ? "sort: longest-silent" : "sort: newest-dead";
    render();
  });
  el.search.addEventListener("input", () => {
    query = el.search.value.trim().toLowerCase();
    visible = PAGE;
    render();
  });
  el.more.addEventListener("click", () => {
    visible += PAGE;
    render();
  });

  loadTail(snapshot)
    .then(({ snapshot: merged, tail_pages }) => {
      snapshot = merged;
      tailPages = tail_pages;
      render(true);
      for (const url of usedUrls()) addUrlLi(url);
      setTailNote(`tail: ${tail_pages} page(s) of /api/changes fetched since the snapshot`);
    })
    .catch((err) => setTailNote(`tail failed (${err.message}); showing the snapshot as built`));
})();
