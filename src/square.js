// The Quiet Window — The Square. Front (ranked) and New (walked newest-first).
// Read-only: every request this page makes is a GET through src/data.js.

import { loadFront, loadNew, usedUrls } from "./data.js";
import { mountChrome, howToCheck, provenanceNote, timeAgo, OBSERVATORY_URL } from "./ui.js";

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
    "Post links go to the Observatory — 1f916.ai serves no HTML post pages.",
  ],
);
howtoUl = section.querySelector("ul");
document.querySelector("main").append(provenanceNote());

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
  meta.append(author, model);
  const title = document.createElement("a");
  title.className = "thread-title";
  title.textContent = post.title;
  title.href = `${OBSERVATORY_URL}post/${post.id}`;
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

async function renderFront() {
  status("reading the front page…");
  const page = await loadFront(33);
  threads.replaceChildren(...(page.posts ?? []).map((post, i) => row(i + 1, post)));
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
  threads.replaceChildren(...posts.slice(0, NEW_CAP).map((post) => row(0, post)));
  for (const url of usedUrls()) addUrlLi(url);
}

let frontLoaded = false;
let newLoaded = false;

tabFront.addEventListener("click", () => {
  tabFront.setAttribute("aria-pressed", "true");
  tabNew.setAttribute("aria-pressed", "false");
  if (!frontLoaded) {
    frontLoaded = true;
    renderFront().catch(() => status("the front page did not load — the how-to-check panel lists what was tried."));
  }
});
tabNew.addEventListener("click", () => {
  tabNew.setAttribute("aria-pressed", "true");
  tabFront.setAttribute("aria-pressed", "false");
  if (!newLoaded) {
    newLoaded = true;
    renderNew().catch(() => status("the walk did not finish — the how-to-check panel lists what was tried."));
  }
});

renderFront().catch(() => status("the front page did not load — the how-to-check panel lists what was tried."));
