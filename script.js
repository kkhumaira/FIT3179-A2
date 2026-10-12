const chartDefinitions = [
  {
    id: "chart1",
    path: "charts/chart1.vl.json",
    linked: false
  },
  {
    id: "chart2",
    path: "charts/chart2.vl.json",
    linked: true
  },
  {
    id: "chart3",
    path: "charts/chart3.vl.json",
    linked: true
  },
  {
    id: "chart4",
    path: "charts/chart4.vl.json",
    linked: true
  },
  {
    id: "chart5",
    path: "charts/chart5.vl.json",
    linked: false
  }
];

const linkedViews = [];

const yearControl = document.getElementById("shared-year");
const yearOutput = document.getElementById("year-value");
const filterStatus = document.getElementById("filter-status");

/*
Keep selectedYear in each linked chart, but remove its individual
slider. The HTML slider controls the three charts instead.
*/
function removeIndividualYearSlider(specification) {
  if (specification.params) {
    for (const parameter of specification.params) {
      if (parameter.name === "selectedYear") {
        delete parameter.bind;
        parameter.value = 2025;
      }
    }
  }

  for (const key of ["layer", "vconcat", "hconcat", "concat"]) {
    if (Array.isArray(specification[key])) {
      specification[key].forEach(removeIndividualYearSlider);
    }
  }

  if (specification.spec) {
    removeIndividualYearSlider(specification.spec);
  }
}

/* LOAD ONE CHART */

async function loadChart(definition) {
  const container = document.getElementById(definition.id);

  try {
    const response = await fetch(definition.path);

    if (!response.ok) {
      throw new Error(
        `Cannot load ${definition.path}: ${response.status}`
      );
    }

    const specification = await response.json();

    if (definition.linked) {
      removeIndividualYearSlider(specification);
    }

    container.replaceChildren();

    const result = await vegaEmbed(
      container,
      specification,
      {
        actions: false,
        renderer: "svg"
      }
    );

    if (definition.linked) {
      linkedViews.push(result.view);
    }
  } catch (error) {
    console.error(error);

    const message = document.createElement("p");
    message.className = "error";

    message.textContent =
      `Could not load this chart. Check ${definition.path} ` +
      "and the CSV URL inside it.";

    container.replaceChildren(message);
  }
}

/* UPDATE THE THREE LINKED CHARTS */

let pendingYear = 2025;
let updating = false;

async function updateLinkedCharts() {
  if (updating) return;

  updating = true;

  try {
    let appliedYear;

    do {
      appliedYear = pendingYear;

      await Promise.all(
        linkedViews.map(view =>
          view
            .signal("selectedYear", appliedYear)
            .runAsync()
        )
      );
    } while (appliedYear !== pendingYear);

    filterStatus.textContent =
      `Showing ${appliedYear} in ${linkedViews.length} linked charts.`;
  } catch (error) {
    console.error(error);

    filterStatus.textContent =
      "Could not update a chart. Check that each linked " +
      "JSON defines the selectedYear parameter.";
  } finally {
    updating = false;
  }
}

/* SLIDER EVENT */

yearControl.addEventListener("input", () => {
  pendingYear = Number(yearControl.value);
  yearOutput.value = String(pendingYear);

  updateLinkedCharts();
});

/* START THE DASHBOARD */

async function initialiseDashboard() {
  if (typeof vegaEmbed !== "function") {
    filterStatus.textContent =
      "Chart libraries did not load. Check your internet connection.";

    return;
  }

  await Promise.all(
    chartDefinitions.map(loadChart)
  );

  yearControl.disabled = linkedViews.length === 0;

  filterStatus.textContent =
    linkedViews.length === 3
      ? "Showing 2025 in the three linked charts."
      : `${linkedViews.length} of 3 linked charts loaded. ` +
        "Check the chart error messages.";
}

initialiseDashboard();