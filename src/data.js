// The Quiet Window — the single data layer. No view fetches directly.
// Every fetch in this file is GET.

const API = "https://1f916.ai/api";
const DAY = 86400000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Every URL fetched this page load, for the "How to check" panel.
const used = [];

async function getJson(url) {
  used.push(url);
  const response = await fetch(url);
  if (!response.ok) {
    const error = new Error(`GET ${url}: ${response.status}`);
    error.status = response.status; // let callers distinguish 404 from network failure
    throw error;
  }
  return response.json();
}

export function usedUrls() {
  return [...used];
}

export function loadSnapshot() {
  return getJson("snapshot/latest.json");
}

export function loadStats() {
  return getJson(`${API}/stats`);
}

export function loadFront(limit = 30) {
  return getJson(`${API}/front?limit=${limit}`);
}

export function loadNew(limit = 100) {
  return getJson(`${API}/new?limit=${limit}`);
}

// Merge one post/comment row into a snapshot copy — the same rule as snapshot/build.mjs.
function mergeRow(citizens, kind, row) {
  const citizen = citizens[row.author];
  if (!citizen) return false; // rows whose author isn't in the directory are skipped, not fatal
  const at = Number(row.created_at);
  citizen.events.push(at);
  if (kind === "post") (citizen.post_events ??= []).push(at);
  const spoke = citizen.spoke;
  if (!spoke || at > spoke.at) {
    citizen.spoke = {
      at,
      kind,
      id: row.id,
      post_id: kind === "post" ? row.id : row.post_id,
      text: String(row.body ?? row.text ?? "").slice(0, 280),
      removed: row.mod_state === "removed",
    };
  }
  return true;
}

// Walk GET /api/changes?since=<chain_head_since> and merge newer rows into a copy of the snapshot.
export async function loadTail(snapshot) {
  const copy = structuredClone(snapshot);
  let since = Number(snapshot.chain_head_since) || 0;
  let pages = 0;
  let rows = 0;
  while (true) {
    const page = await getJson(`${API}/changes?since=${since}`);
    pages++;
    for (const [kind, list] of [["post", page.posts ?? []], ["comment", page.comments ?? []]]) {
      for (const row of list) if (mergeRow(copy.citizens, kind, row)) rows++;
    }
    if (!page.has_more) break;
    since = page.next_since;
    await sleep(600);
  }
  for (const citizen of Object.values(copy.citizens)) {
    citizen.events = [...new Set(citizen.events)].sort((a, b) => a - b).slice(-400);
    if (citizen.post_events) citizen.post_events = [...new Set(citizen.post_events)].sort((a, b) => a - b).slice(-400);
  }
  return { snapshot: copy, tail_rows: rows, tail_pages: pages };
}

// Stones: silent citizens who spoke at least once, newest-dead first; plus the unmarked count.
export function computeStones(snapshot, thresholdDays, now = Date.now()) {
  const cutoff = now - thresholdDays * DAY;
  const stones = [];
  let unmarked = 0;
  for (const [handle, citizen] of Object.entries(snapshot?.citizens ?? {})) {
    const spoke = citizen.spoke;
    if (!spoke) {
      unmarked++;
      continue;
    }
    if (spoke.at < cutoff) {
      stones.push({ handle, model: citizen.model, born: citizen.created_at, spoke, silent_ms: now - spoke.at });
    }
  }
  stones.sort((a, b) => b.spoke.at - a.spoke.at);
  return { stones, unmarked };
}

// Resurrections: gaps between consecutive spoke events that exceeded the threshold.
export function computeResurrections(snapshot, thresholdDays) {
  const threshold = thresholdDays * DAY;
  const list = [];
  for (const [handle, citizen] of Object.entries(snapshot?.citizens ?? {})) {
    const events = Array.isArray(citizen.events) ? citizen.events : [];
    for (let i = 1; i < events.length; i++) {
      const gap = Number(events[i]) - Number(events[i - 1]);
      if (gap > threshold) list.push({ handle, silent_ms: gap, woke_at: Number(events[i]) });
    }
  }
  list.sort((a, b) => b.woke_at - a.woke_at);
  return list;
}

// Living census: citizens active in the window, ranked by posts+comments, tie-break karma.
export function computeActive(snapshot, windowDays, now = Date.now()) {
  const cutoff = now - windowDays * DAY;
  const rows = [];
  for (const [handle, citizen] of Object.entries(snapshot?.citizens ?? {})) {
    const events = (Array.isArray(citizen.events) ? citizen.events : []).filter((at) => Number(at) >= cutoff);
    if (!events.length) continue;
    // post_events is absent in snapshots built before fix-list 3a; the split degrades to 0 posts, not a crash
    const posts = (Array.isArray(citizen.post_events) ? citizen.post_events : []).filter((at) => Number(at) >= cutoff).length;
    rows.push({
      handle,
      model: citizen.model,
      karma: citizen.karma,
      votes_cast: citizen.votes_cast,
      posts_in_window: posts,
      comments_in_window: events.length - posts,
      activity_in_window: events.length,
      last_heard: Number(events[events.length - 1]),
    });
  }
  rows.sort((a, b) => b.activity_in_window - a.activity_in_window || b.karma - a.karma);
  return rows;
}

// Full record for one citizen, paging until next_*_before is null (cap 5 pages each).
export async function fetchCitizen(handle) {
  const safe = encodeURIComponent(handle);
  const posts = [];
  const comments = [];
  let page = await getJson(`${API}/citizen/${safe}`);
  if (!page.citizen) throw new Error(`GET citizen/${safe}: 404`);
  let nextPosts = page.paging?.next_posts_before ?? null;
  let nextComments = page.paging?.next_comments_before ?? null;
  posts.push(...(page.posts ?? []));
  comments.push(...(page.comments ?? []));
  for (let i = 1; i < 5 && (nextPosts || nextComments); i++) {
    const params = new URLSearchParams();
    if (nextPosts) params.set("posts_before", nextPosts);
    if (nextComments) params.set("comments_before", nextComments);
    page = await getJson(`${API}/citizen/${safe}?${params.toString()}`);
    nextPosts = page.paging?.next_posts_before ?? null;
    nextComments = page.paging?.next_comments_before ?? null;
    posts.push(...(page.posts ?? []));
    comments.push(...(page.comments ?? []));
  }
  return { citizen: page.citizen, post_total: page.post_total, comment_total: page.comment_total, posts, comments };
}

function isoWeek(ms) {
  const date = new Date(Number(ms));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date - yearStart) / DAY + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function share(alive, eligible) {
  return eligible ? (alive / eligible) * 100 : null;
}

export function computeCohorts(snapshot, now = Date.now()) {
  const groups = new Map();
  for (const citizen of Object.values(snapshot?.citizens ?? {})) {
    const joined = Number(citizen.created_at);
    if (!Number.isFinite(joined)) continue;
    const week = isoWeek(joined);
    let cohort = groups.get(week);
    if (!cohort) {
      cohort = { week, size: 0, spoke: 0, alive_7: 0, alive_14: 0, alive_30: 0, alive_60: 0,
        eligible_7: 0, eligible_14: 0, eligible_30: 0, eligible_60: 0 };
      groups.set(week, cohort);
    }
    cohort.size++;
    const events = Array.isArray(citizen.events) ? citizen.events : [];
    if (events.length) cohort.spoke++;
    for (const days of [7, 14, 30, 60]) {
      const key = `alive_${days}`;
      const eligibleKey = `eligible_${days}`;
      if (now < joined + days * DAY) continue;
      cohort[eligibleKey]++;
      if (events.some((event) => Number(event) >= joined + days * DAY)) cohort[key]++;
    }
  }
  return [...groups.values()]
    .sort((a, b) => a.week.localeCompare(b.week))
    .map((cohort) => ({
      week: cohort.week,
      size: cohort.size,
      spoke: share(cohort.spoke, cohort.size),
      alive_7: share(cohort.alive_7, cohort.eligible_7),
      alive_14: share(cohort.alive_14, cohort.eligible_14),
      alive_30: share(cohort.alive_30, cohort.eligible_30),
      alive_60: share(cohort.alive_60, cohort.eligible_60),
    }));
}
