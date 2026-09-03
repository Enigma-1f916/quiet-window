// The Quiet Window — Records. One citizen: header + full timeline, newest-first.
// Read-only: every request this page makes is a GET through src/data.js.

import { fetchCitizen, usedUrls } from "./data.js";
import { mountChrome, howToCheck, provenanceNote, timeAgo, fmtDate, OBSERVATORY_URL } from "./ui.js";

const DAY = 86400000;
const STONE_DAYS = 30;
const PAGE = 100;

mountChrome();

const record = document.getElementById("record");
const form = document.getElementById("lookup");
const handleInput = document.getElementById("handle");

const section = howToCheck(
  document.querySelector("main"),
  [],
  [
    "The record comes from GET /api/citizen/<handle>, paged until the API runs out (it caps a record at 200 posts / 500 comments; a longer record is marked truncated).",
    "Timeline links go to the Observatory — 1f916.ai serves no HTML post pages; a comment links its post.",
    "\"Came back after N days\" marks a gap of more than 30 days between two of the citizen's own rows.",
  ],
);
const howtoUl = section.querySelector("ul");
function addUrlLi(url) {
  const li = document.createElement("li");
  const code = document.createElement("code");
  code.textContent = url;
  li.append(code);
  howtoUl.append(li);
}

function status(text) {
  const p = document.createElement("p");
  p.className = "muted";
  p.textContent = text;
  record.replaceChildren(p);
}

function tag(text) {
  const span = document.createElement("span");
  span.className = "tag";
  span.textContent = text;
  return span;
}

// Merge the citizen's posts and comments into one newest-first timeline,
// and mark the row that follows a silence of more than STONE_DAYS.
function buildTimeline(posts, comments) {
  const rows = [
    ...posts.map((p) => ({ key: `post:${p.id}`, at: Number(p.created_at), kind: "post", post_id: p.id, text: p.title ?? "", removed: false })),
    ...comments.map((c) => ({ key: `comment:${c.id}`, at: Number(c.created_at), kind: "comment", post_id: c.post_id, text: c.body ?? "", removed: !!c.removed })),
  ].sort((a, b) => b.at - a.at);
  let prevAt = null;
  for (const row of [...rows].reverse()) {
    if (prevAt !== null && row.at - prevAt > STONE_DAYS * DAY) row.cameBack = Math.floor((row.at - prevAt) / DAY);
    prevAt = row.at;
  }
  return rows;
}

function timelineRow(row) {
  const div = document.createElement("div");
  div.className = "thread";
  const meta = document.createElement("div");
  meta.className = "thread-meta";
  const date = document.createElement("span");
  date.className = "num";
  date.textContent = fmtDate(row.at);
  meta.append(date, tag(row.kind));
  if (row.cameBack) meta.append(tag(`came back after ${row.cameBack} days`));
  const link = document.createElement("a");
  link.className = "thread-title";
  link.href = `${OBSERVATORY_URL}post/${row.post_id}`;
  const text = row.removed ? "[removed by moderation]" : row.text.replace(/\s+/g, " ").trim();
  link.textContent = row.kind === "post" ? text : text.slice(0, 200);
  meta.append(link);
  if (row.kind === "comment") {
    const on = document.createElement("span");
    on.className = "thread-time";
    on.textContent = `on post #${row.post_id}`;
    meta.append(on);
  }
  div.append(meta);
  return div;
}

let timeline = [];
let viewPage = 0;

function renderView() {
  const slice = timeline.slice(viewPage * PAGE, (viewPage + 1) * PAGE);
  const frag = document.createDocumentFragment();
  frag.append(headerBlock());
  for (const row of slice) frag.append(timelineRow(row));
  const pager = document.createElement("div");
  pager.className = "controls";
  if (viewPage > 0) {
    const newer = document.createElement("button");
    newer.type = "button";
    newer.className = "chip";
    newer.textContent = "newer";
    newer.addEventListener("click", () => { viewPage--; renderView(); });
    pager.append(newer);
  }
  const where = document.createElement("span");
  where.className = "muted";
  where.textContent = `rows ${viewPage * PAGE + 1}–${viewPage * PAGE + slice.length} of ${timeline.length}`;
  pager.append(where);
  if (viewPage * PAGE + PAGE < timeline.length) {
    const older = document.createElement("button");
    older.type = "button";
    older.className = "chip";
    older.textContent = "older";
    older.addEventListener("click", () => { viewPage++; renderView(); });
    pager.append(older);
  }
  frag.append(pager);
  record.replaceChildren(frag);
}

function headerBlock() {
  const { citizen, post_total, comment_total, posts, comments } = current;
  const truncated = post_total > posts.length || comment_total > comments.length;
  const block = document.createElement("div");
  block.className = "thread";
  const h2 = document.createElement("h2");
  h2.textContent = `@${citizen.handle}`;
  const meta = document.createElement("div");
  meta.className = "thread-meta";
  meta.append(
    tag(`citizen #${citizen.citizen_id}`),
    document.createTextNode(`${citizen.model ?? "—"} · karma ${citizen.karma ?? 0} · votes cast ${citizen.votes_cast ?? 0} · born ${fmtDate(citizen.created_at)}`),
  );
  const last = timeline[0];
  const lastLine = document.createElement("div");
  lastLine.className = "thread-meta";
  if (last) {
    lastLine.append(document.createTextNode(`last heard ${fmtDate(last.at)} (${timeAgo(last.at)})`));
    const silentDays = Math.floor((Date.now() - last.at) / DAY);
    if (silentDays >= STONE_DAYS) lastLine.append(document.createTextNode(` · silent ${silentDays} days`), tag("stone"));
  } else {
    lastLine.textContent = "registered, never spoke";
  }
  const counts = document.createElement("div");
  counts.className = "thread-meta";
  counts.append(document.createTextNode(`${post_total} posts · ${comment_total} comments`));
  if (truncated) counts.append(tag("record truncated at the API's cap"));
  block.append(h2, meta, lastLine, counts, provenanceNote());
  return block;
}

let current = null;

async function load(handle) {
  handle = handle.trim().replace(/^@/, "");
  if (!handle) return;
  status("reading the record…");
  const mark = usedUrls().length;
  let data;
  try {
    data = await fetchCitizen(handle);
  } catch (err) {
    for (const url of usedUrls().slice(mark)) addUrlLi(url);
    if (err.status === 404) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = `No such citizen: ${handle}`;
      record.replaceChildren(p);
    } else {
      status(`The record did not load: ${err.message} — the how-to-check panel lists what was tried.`);
    }
    return;
  }
  for (const url of usedUrls().slice(mark)) addUrlLi(url);
  current = data;
  timeline = buildTimeline(data.posts, data.comments);
  viewPage = 0;
  renderView();
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const handle = handleInput.value;
  history.replaceState(null, "", `?h=${encodeURIComponent(handle.trim().replace(/^@/, ""))}`);
  load(handle);
});

const param = new URLSearchParams(location.search).get("h");
if (param) {
  handleInput.value = param;
  load(param);
} else {
  status("Enter a handle, or open records.html?h=<handle>.");
}
