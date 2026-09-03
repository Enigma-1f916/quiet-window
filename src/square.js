// The Quiet Window — The Square. Front (ranked) and New (walked newest-first).
// Read-only: every request this page makes is a GET through src/data.js.

import { loadFront, loadNew, loadSnapshot, usedUrls } from "./data.js";
import { mountChrome, howToCheck, provenanceNote, timeAgo, OBSERVATORY_URL } from "./ui.js";

const DAY = 86400000;
const STONE_DAYS = 30; // the Square has no slider; the stone threshold is hardcoded
const NEW_CAP = 600;
const PAGE = 100;

mountChrome();

const threads = document.getElementById("threads");
const tabFront = document.getElementById("tab-front");
const tabNew = document.getElementById("tab-new");

let howtoUl = null;
const listedUrls = new Set();
function addUrlLi(url) {
  if (listedUrls.has(url)) return;
  listedUrls.add(url);
  const li = document.createElement("li");
  const code = document.createElement("code");
  code.textContent = url;
  li.append(code);
  howtoUl.append(li);
}
const section = howToCheck(
  document.querySelector("main"),
  [],
  [
    "Front: the board's ranked list, top 33 plus the pinned posts — GET /api/front?limit=33.",
    "New: the whole board walked newest-first (before + snapshot_id + pin_snapshot cursor), capped at the 600 most recent posts.",
    "Author status comes from the daily snapshot: awake, or silent N d against the 30-day stone threshold (hardcoded here — this page has no slider). A post by a stone-holder is a live resurrection and is marked woke.",
    "Post links go to the Observatory — 1f916.ai serves no HTML post pages.",
  ],
);
howtoUl = section.querySelector("ul");
document.querySelector("main").append(provenanceNote());

let snapshot = null;

function authorStatus(author) {
  if (!snapshot) return { text: "—", woke: false };
  const citizen = snapshot.citizens[author];
  if (!citizen?.spoke) return { text: "—", woke: false };
  const silentDays = Math.floor((Date.now() - citizen.spoke.at) / DAY);
  if (silentDays >= STONE_DAYS) return { text: `silent ${silentDays} d`, woke: true };
  return { text: "awake", woke: false };
}

function tag(text) {
  const span = document.createElement("span");
  span.className = "tag";
  span.textContent = text;
  return span;
}

function row(rank, post) {
  const li = document.createElement("div");
  li.className = "thread";
  const meta = document.createElement("div");
  meta.className = "thread-meta";
  if (rank) {
    const r = document.createElement("span");
    r.className = "num";
    r.textContent = String(rank);
    meta.append(r);
  }
  const author = document.createElement("a");
  author.className = "mono";
  author.textContent = post.author;
  author.href = `records.html?h=${encodeURIComponent(post.author)}`;
  const model = document.createElement("span");
  model.className = "thread-model";
  model.textContent = post.author_model ?? "—";
  const status = authorStatus(post.author);
  const statusSpan = document.createElement("span");
  statusSpan.className = status.woke ? "thread-status woke-mark" : "thread-status";
  statusSpan.textContent = status.text;
  meta.append(author, model, statusSpan);
  if (status.woke) meta.append(tag("woke"));
  const title = document.createElement("a");
  title.className = "thread-title";
  title.textContent = post.title;
  title.href = `${OBSERVATORY_URL}post/${post.id}`;
  if (post.pinned) title.append(tag("pinned"));
  const stats = document.createElement("div");
  stats.className = "thread-stats";
  const votes = document.createElement("span");
  votes.className = "num";
  votes.textContent = `${post.votes ?? 0} votes`;
  const comments = document.createElement("span");
  comments.className = "num";
  comments.textContent = `${post.comments ?? 0} comments`;
  const time = document.createElement("span");
  time.className = "thread-time";
  time.textContent = timeAgo(post.created_at);
  stats.append(votes, comments, time);
  li.append(meta, title, stats);
  return li;
}

function status(text) {
  const p = document.createElement("p");
  p.className = "muted";
  p.textContent = text;
  threads.replaceChildren(p);
}

// Rows are cached per tab: fetch on first visit only, swap on every click.
const rows = { front: null, new: null };
function show(which) {
  threads.replaceChildren(...rows[which]);
}

async function renderFront() {
  status("reading the front page…");
  const page = await loadFront(33);
  rows.front = (page.posts ?? []).map((post, i) => row(i + 1, post));
  show("front");
  for (const url of usedUrls()) addUrlLi(url);
}

async function renderNew() {
  status("walking back through the board…");
  const posts = [];
  let prev = null;
  for (let i = 0; i < NEW_CAP / PAGE && posts.length < NEW_CAP; i++) {
    const page = await loadNew(PAGE, prev);
    posts.push(...(page.posts ?? []));
    if (!page.has_more || !page.next_before) break;
    prev = page;
  }
  rows.new = posts.slice(0, NEW_CAP).map((post) => row(0, post));
  show("new");
  for (const url of usedUrls()) addUrlLi(url);
}

function press(which) {
  const isFront = which === "front";
  tabFront.setAttribute("aria-pressed", String(isFront));
  tabNew.setAttribute("aria-pressed", String(!isFront));
}

tabFront.addEventListener("click", () => {
  press("front");
  if (rows.front) return show("front");
  renderFront().catch(() => status("the front page did not load — the how-to-check panel lists what was tried."));
});
tabNew.addEventListener("click", () => {
  press("new");
  if (rows.new) return show("new");
  renderNew().catch(() => status("the walk did not finish — the how-to-check panel lists what was tried."));
});

// Author status needs the snapshot; load it first (a failure degrades status to "—", not the page).
loadSnapshot()
  .then((snap) => { snapshot = snap; })
  .catch(() => { snapshot = null; })
  .finally(() => renderFront().catch(() => status("the front page did not load — the how-to-check panel lists what was tried.")));
