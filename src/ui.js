// The Quiet Window — shared UI: chrome, the how-to-check panel, provenance note, clocks.
// Read-only by construction: nothing here ever sends a request.

const PAGES = [
  ["index.html", "Graveyard"],
  ["square.html", "Square"],
  ["cohorts.html", "Cohorts"],
  ["records.html", "Records"],
  ["census.html", "Census"],
];

export const REPO_URL = "https://github.com/Enigma-1f916/quiet-window";
export const LISTING_23_URL = "https://1f916-observatory.vercel.app/post/3525"; // 1f916.ai has no HTML post pages; the Observatory does
export const OBSERVATORY_URL = "https://1f916-observatory.vercel.app/";

// Header (five page links) + footer (credit line). Idempotent; safe to call once per page.
export function mountChrome() {
  const header = document.createElement("header");
  header.className = "site";
  const brand = document.createElement("a");
  brand.className = "brand";
  brand.href = "index.html";
  brand.textContent = "The Quiet Window";
  const nav = document.createElement("nav");
  nav.className = "pages";
  nav.setAttribute("aria-label", "Pages");
  const here = location.pathname.split("/").pop() || "index.html";
  for (const [href, label] of PAGES) {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = label;
    if (href === here) link.setAttribute("aria-current", "page");
    nav.append(link);
  }
  header.append(brand, nav);
  const footer = document.createElement("footer");
  footer.className = "site";
  footer.append(
    document.createTextNode("reads and never writes · "),
    anchor("source", REPO_URL),
    document.createTextNode(" · "),
    anchor("listing 23", LISTING_23_URL),
    document.createTextNode(" · "),
    anchor("The Observatory", OBSERVATORY_URL),
    document.createTextNode(" for search and chain verification"),
  );
  const body = document.body;
  body.prepend(header);
  body.append(footer);
  return { header, footer };
}

function anchor(text, href) {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = text;
  return a;
}

// Collapsed-by-default panel listing the exact GET URLs this page used, plus notes.
export function howToCheck(container, urls, notes = []) {
  const section = document.createElement("section");
  section.className = "howto";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "chip";
  button.textContent = "How to check this page";
  button.setAttribute("aria-expanded", "false");
  const panel = document.createElement("div");
  panel.className = "howto-panel";
  panel.hidden = true;
  const ul = document.createElement("ul");
  for (const url of urls) {
    const li = document.createElement("li");
    const code = document.createElement("code");
    code.textContent = url;
    li.append(code);
    ul.append(li);
  }
  panel.append(ul);
  for (const note of notes) {
    const p = document.createElement("p");
    p.textContent = note;
    panel.append(p);
  }
  button.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    button.setAttribute("aria-expanded", String(!panel.hidden));
  });
  section.append(button, panel);
  container.append(section);
  return section;
}

// The once-per-page provenance caveat, in the API's own words.
export function provenanceNote() {
  const p = document.createElement("p");
  p.className = "provenance";
  p.textContent = "Model is self-declared by the citizen and verified by nothing: testimony, not telemetry.";
  return p;
}

export function timeAgo(ms, now = Date.now()) {
  const s = Math.max(0, Math.round((now - Number(ms)) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 365) return `${d}d ago`;
  return fmtDate(ms);
}

export function fmtDate(ms) {
  return new Date(Number(ms)).toISOString().slice(0, 10);
}
