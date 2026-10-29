"use strict";

const chartDefinitions = Array.from({ length: 9 }, (_, index) => ({
  id: `chart${index + 1}`,
  path: `charts/chart${index + 1}.vl.json`,
  linked: [2, 3, 4].includes(index + 1)
}));
const linkedViews = new Map();
const activeViews = new Map();
const slider = document.getElementById("shared-year");
const output = document.getElementById("year-value");
const status = document.getElementById("filter-status");
let requestedYear = Number(slider.value);
let syncing = false;

// Remove only the duplicate year-slider binding in charts 2–4.
// Preserve selection parameters and controls in all other charts.
function prepareYearParameter(node) {
  if (!node || typeof node !== "object") return false;
  let found = false;
  if (Array.isArray(node.params)) {
    for (const parameter of node.params) {
      if (parameter.name === "selectedYear" && !parameter.select) {
        delete parameter.bind;
        parameter.value = requestedYear;
        found = true;
      }
    }
  }
  for (const key of ["layer", "hconcat", "vconcat", "concat"]) {
    if (Array.isArray(node[key])) {
      for (const child of node[key]) found = prepareYearParameter(child) || found;
    }
  }
  if (node.spec) found = prepareYearParameter(node.spec) || found;
  return found;
}

function refreshFilterAvailability() {
  const count = linkedViews.size;
  slider.disabled = count === 0;
  status.textContent = count === 3
    ? `Showing ${requestedYear} across the three linked charts.`
    : count > 0
      ? `Year control connected to ${count} of 3 charts. Check any chart error below.`
      : "Year control will activate when the linked charts load.";
}

async function syncYear() {
  if (syncing) return;
  syncing = true;
  try {
    while (true) {
      const year = requestedYear;
      const results = await Promise.allSettled(
        [...linkedViews.values()].map(view => view.signal("selectedYear", year).runAsync())
      );
      const failures = results.filter(result => result.status === "rejected");
      if (failures.length) {
        status.textContent = "A linked chart could not update. Reload the page to retry.";
        failures.forEach(result => console.error(result.reason));
      } else {
        refreshFilterAvailability();
      }
      if (year === requestedYear) break;
    }
  } finally {
    syncing = false;
  }
}

function showError(container, definition, error) {
  container.replaceChildren();
  const box = document.createElement("div");
  box.className = "error";
  box.setAttribute("role", "alert");
  const message = document.createElement("p");
  message.textContent = `Could not load ${definition.id}. Check ${definition.path} and its data URLs.`;
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "Retry chart";
  retry.addEventListener("click", () => loadChart(definition));
  box.append(message, retry);
  container.append(box);
  console.error(`Loading ${definition.path}:`, error);
}

async function loadChart(definition) {
  const container = document.getElementById(definition.id);
  if (!container) return;
  linkedViews.delete(definition.id);
  const previous = activeViews.get(definition.id);
  if (previous) { previous.finalize(); activeViews.delete(definition.id); }
  container.setAttribute("aria-busy", "true");
  try {
    if (typeof vegaEmbed !== "function") throw new Error("Vega Embed did not load.");
    const response = await fetch(definition.path);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const spec = await response.json();
    const hasYear = definition.linked ? prepareYearParameter(spec) : false;
    container.replaceChildren();
    const result = await vegaEmbed(container, spec, { actions: false, renderer: "svg" });
    activeViews.set(definition.id, result.view);
    if (definition.linked && hasYear) {
      // Confirm the signal is available before enabling the shared control.
      result.view.signal("selectedYear");
      linkedViews.set(definition.id, result.view);
      await syncYear();
    }
  } catch (error) {
    linkedViews.delete(definition.id);
    showError(container, definition, error);
  } finally {
    container.setAttribute("aria-busy", "false");
    refreshFilterAvailability();
  }
}

slider.addEventListener("input", () => {
  requestedYear = Number(slider.value);
  output.value = String(requestedYear);
  output.textContent = String(requestedYear);
  void syncYear();
});

// Only ask Vega to resize responsive specs; fixed-width compositions scroll.
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    for (const view of activeViews.values()) {
      view.resize().runAsync().catch(error => console.error("Chart resize:", error));
    }
  }, 180);
});

void Promise.allSettled(chartDefinitions.map(loadChart));
