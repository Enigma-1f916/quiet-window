import { computeCohorts, computeResurrections, loadSnapshot, usedUrls } from "./data.js";
import { fmtDate, howToCheck, mountChrome } from "./ui.js";

mountChrome();
const main = document.querySelector("main");
const status = document.querySelector("#status");
const day = 86400000;

const text = (value) => document.createTextNode(value);
function cell(row, value, numeric = false, header = false) {
  const element = document.createElement(header ? "th" : "td");
  if (numeric) element.className = "num";
  element.textContent = value;
  row.append(element);
}
function percent(value) {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

function renderTable(cohorts) {
  const wrapper = document.createElement("div");
  wrapper.className = "scroll-x";
  const table = document.createElement("table");
  const headings = ["Week", "Joined", "Spoke at least once", "Alive at 7 d", "Alive at 14 d", "Alive at 30 d", "Alive at 60 d"];
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headings.forEach((heading, index) => cell(headRow, heading, index > 0, true));
  thead.append(headRow);
  const tbody = document.createElement("tbody");
  for (const cohort of cohorts) {
    const row = document.createElement("tr");
    cell(row, cohort.week);
    cell(row, String(cohort.size), true);
    cell(row, percent(cohort.spoke), true);
    cell(row, percent(cohort.alive_7), true);
    cell(row, percent(cohort.alive_14), true);
    cell(row, percent(cohort.alive_30), true);
    cell(row, percent(cohort.alive_60), true);
    tbody.append(row);
  }
  table.append(thead, tbody);
  wrapper.append(table);
  return wrapper;
}

function renderChart(cohorts) {
  const section = document.createElement("section");
  section.innerHTML = "<h2>30-day survival</h2>";
  const values = cohorts.filter((cohort) => cohort.alive_30 != null);
  if (!values.length) {
    section.append(text("No 30-day windows have elapsed yet."));
    return section;
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 640 220");
  svg.setAttribute("width", "100%");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "30-day survival share by registration week");
  const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
  title.textContent = "30-day survival share by registration week";
  svg.append(title);
  const points = values.map((cohort, index) => {
    const x = values.length === 1 ? 320 : 30 + index * 580 / (values.length - 1);
    const y = 190 - Number(cohort.alive_30) * 1.6;
    return `${x},${Math.max(20, y)}`;
  }).join(" ");
  const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  line.setAttribute("points", points);
  line.setAttribute("fill", "none");
  line.setAttribute("stroke", "var(--accent)");
  line.setAttribute("stroke-width", "3");
  svg.append(line);
  for (const [index, cohort] of values.entries()) {
    const x = values.length === 1 ? 320 : 30 + index * 580 / (values.length - 1);
    const y = Math.max(20, 190 - Number(cohort.alive_30) * 1.6);
    const point = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    point.setAttribute("cx", x);
    point.setAttribute("cy", y);
    point.setAttribute("r", "4");
    point.setAttribute("fill", "var(--accent)");
    point.setAttribute("role", "img");
    point.setAttribute("aria-label", `${cohort.week}: ${percent(cohort.alive_30)}`);
    svg.append(point);
  }
  section.append(svg);
  return section;
}

function renderResurrections(snapshot) {
  const section = document.createElement("section");
  section.innerHTML = "<h2>Resurrections</h2>";
  const list = document.createElement("ul");
  const resurrections = computeResurrections(snapshot, 30).slice(0, 50);
  if (!resurrections.length) {
    section.append(text("No gaps longer than 30 days yet."));
    return section;
  }
  for (const resurrection of resurrections) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = `records.html?h=${encodeURIComponent(resurrection.handle)}`;
    link.textContent = resurrection.handle;
    const days = Math.round(resurrection.silent_ms / day);
    item.append(link, text(` came back after ${days} days on ${fmtDate(resurrection.woke_at)}`));
    list.append(item);
  }
  section.append(list);
  return section;
}

try {
  const snapshot = await loadSnapshot();
  const cohorts = computeCohorts(snapshot, Date.now());
  status.remove();
  main.append(renderTable(cohorts), renderChart(cohorts), renderResurrections(snapshot));
  howToCheck(main, usedUrls(), [
    "Alive at D days means a citizen has an event at or after their registration time plus D days; citizens whose D-day has not arrived are excluded from that column's denominator.",
    `Snapshot built ${fmtDate(snapshot.built_at)}.`,
  ]);
} catch (error) {
  status.textContent = "Could not load the snapshot.";
  console.error(error);
}
