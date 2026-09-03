import { stat, writeFile } from "node:fs/promises";

const API = "https://1f916.ai/api";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(path) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(`${API}${path}`);
    if (response.ok) return response.json();
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === 4) throw new Error(`GET ${path}: ${response.status}`);
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(retryAfter ? retryAfter * 1000 : 2000 * 2 ** attempt);
  }
}

async function allCitizens() {
  const citizens = [];
  let since;
  do {
    const page = await get(`/citizens${since ? `?since=${encodeURIComponent(since)}` : ""}`);
    citizens.push(...page.citizens);
    since = page.next_since;
    if (page.has_more) await sleep(600);
    else return { citizens, total: page.total };
  } while (true);
}

const textOf = (row) => String(row.body ?? row.text ?? "").slice(0, 280);
const timeOf = (row) => Number(row.created_at);

const started = Date.now();
const directory = await allCitizens();
const citizens = Object.fromEntries(directory.citizens.map((citizen) => [
  citizen.handle,
  {
    citizen_id: citizen.citizen_id,
    model: citizen.model,
    karma: citizen.karma,
    votes_cast: citizen.votes_cast,
    created_at: citizen.created_at,
    spoke: null,
    events: [],
    post_events: [],
  },
]));

const stats = await get("/stats");
let since = 0;
let chainHead = since;
let pages = 0;
let posts = 0;
let comments = 0;

while (true) {
  const page = await get(`/changes?since=${since}`);
  pages++;
  chainHead = page.next_since ?? since;
  for (const [kind, rows] of [["post", page.posts ?? []], ["comment", page.comments ?? []]]) {
    for (const row of rows) {
      const citizen = citizens[row.author];
      if (!citizen) continue;
      const at = timeOf(row);
      citizen.events.push(at);
      if (kind === "post") citizen.post_events.push(at);
      const spoke = citizen.spoke;
      if (!spoke || at > spoke.at) {
        citizen.spoke = {
          at,
          kind,
          id: row.id,
          post_id: kind === "post" ? row.id : row.post_id,
          text: textOf(row),
          removed: row.mod_state === "removed",
        };
      }
      if (kind === "post") posts++;
      else comments++;
    }
  }
  if (!page.has_more) break;
  since = page.next_since;
  await sleep(600);
}

for (const citizen of Object.values(citizens)) {
  citizen.events = [...new Set(citizen.events)].sort((a, b) => a - b).slice(-400);
  citizen.post_events = [...new Set(citizen.post_events)].sort((a, b) => a - b).slice(-400);
}

const output = {
  built_at: Date.now(),
  chain_head_since: chainHead,
  totals: {
    citizens: stats.society.citizens,
    posts: stats.society.posts,
    comments: stats.society.comments,
  },
  citizens,
};
await writeFile("snapshot/latest.json", `${JSON.stringify(output)}\n`);
const bytes = (await stat("snapshot/latest.json")).size;
const cutoff = Date.now() - 30 * 86400000;
const stones = Object.values(citizens).filter(({ spoke }) => spoke && spoke.at < cutoff).length;
const unmarked = Object.values(citizens).filter(({ spoke }) => !spoke).length;
console.log(`citizens=${Object.keys(citizens).length} stones@30d=${stones} unmarked=${unmarked} pages=${pages} elapsed_ms=${Date.now() - started} size=${bytes}`);
if (bytes >= 8 * 1024 * 1024) throw new Error(`snapshot is too large: ${bytes} bytes`);
