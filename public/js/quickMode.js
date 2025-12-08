const stateSelect = document.getElementById("state-select");
const districtSelect = document.getElementById("district-select");
const blockSelect = document.getElementById("block-select");
const form = document.getElementById("quick-form");
const resultsEl = document.getElementById("results");
const formError = document.getElementById("form-error");
const getDataButton = document.getElementById("get-data");

const API_BASE = "/api";

/**
 * Helpers
 */
function setLoading(isLoading) {
  getDataButton.disabled = isLoading;
  getDataButton.textContent = isLoading ? "Loading..." : "Get Data";
}

function clearSelect(selectEl, placeholder) {
  selectEl.innerHTML = "";
  const option = document.createElement("option");
  option.value = "";
  option.textContent = placeholder;
  selectEl.appendChild(option);
}

function showError(message) {
  formError.textContent = message || "";
}

function renderLoading() {
  resultsEl.innerHTML = `
    <div class="loading">
      <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      <span>Fetching data...</span>
    </div>
  `;
}

function renderMessage(message) {
  resultsEl.innerHTML = `<p class="muted">${message}</p>`;
}

function renderResult(data) {
  const { locationSummary, years } = data;

  if (!years || !years.length) {
    renderMessage("No data found for this combination. Try changing the filters.");
    return;
  }

  const locationText = [
    locationSummary.state || "All states",
    locationSummary.district || null,
    locationSummary.block || null,
  ]
    .filter(Boolean)
    .join(" › ");

  const rows = years
    .map(
      (item) => `
      <tr>
        <td>${item.year}</td>
        <td>${item.annual_extractable ?? "—"}</td>
        <td>${item.total_extraction ?? "—"}</td>
        <td>${item.stage_percent ?? "—"}</td>
        <td>${item.categorization ?? "Unknown"}</td>
      </tr>
    `
    )
    .join("");

  resultsEl.innerHTML = `
    <p class="summary"><strong>${locationText}</strong></p>
    <table>
      <thead>
        <tr>
          <th>Year</th>
          <th>Annual Extractable (Ham)</th>
          <th>Total Extraction (Ham)</th>
          <th>Stage (%)</th>
          <th>Categorization</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/**
 * API calls
 */
async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Request failed");
  }

  return response.json();
}

async function loadStates() {
  clearSelect(stateSelect, "Select a state");
  stateSelect.disabled = true;
  try {
    const states = await fetchJSON(`${API_BASE}/meta/states`);
    states.forEach((state) => {
      const option = document.createElement("option");
      option.value = state;
      option.textContent = state;
      stateSelect.appendChild(option);
    });
  } catch (error) {
    renderMessage("Unable to load states. Please try again later.");
    console.error(error);
  } finally {
    stateSelect.disabled = false;
  }
}

async function loadDistricts(state) {
  clearSelect(districtSelect, "Select a district");
  clearSelect(blockSelect, "Select a block");
  districtSelect.disabled = true;
  blockSelect.disabled = true;

  if (!state) return;

  try {
    const districts = await fetchJSON(
      `${API_BASE}/meta/districts?state=${encodeURIComponent(state)}`
    );
    districts.forEach((district) => {
      const option = document.createElement("option");
      option.value = district;
      option.textContent = district;
      districtSelect.appendChild(option);
    });
    districtSelect.disabled = false;
  } catch (error) {
    console.error(error);
    renderMessage("Unable to load districts. Please try again later.");
  }
}

async function loadBlocks(state, district) {
  clearSelect(blockSelect, "Select a block");
  blockSelect.disabled = true;

  if (!state || !district) return;

  try {
    const blocks = await fetchJSON(
      `${API_BASE}/meta/blocks?state=${encodeURIComponent(
        state
      )}&district=${encodeURIComponent(district)}`
    );
    blocks.forEach((block) => {
      const option = document.createElement("option");
      option.value = block;
      option.textContent = block;
      blockSelect.appendChild(option);
    });
    blockSelect.disabled = false;
  } catch (error) {
    console.error(error);
    renderMessage("Unable to load blocks. Please try again later.");
  }
}

/**
 * Event handlers
 */
stateSelect.addEventListener("change", (e) => {
  const state = e.target.value || null;
  loadDistricts(state);
});

districtSelect.addEventListener("change", (e) => {
  const district = e.target.value || null;
  const state = stateSelect.value || null;
  loadBlocks(state, district);
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showError("");

  const state = stateSelect.value || null;
  const district = districtSelect.value || null;
  const block = blockSelect.value || null;
  const years = Array.from(form.querySelectorAll('input[name="years"]:checked')).map((el) =>
    Number(el.value)
  );

  if (!state && !district && !block) {
    showError("Please select at least one of state, district, or block.");
    return;
  }

  setLoading(true);
  renderLoading();

  try {
    const payload = { state, district, block, years };
    const data = await fetchJSON(`${API_BASE}/query`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    renderResult(data);
  } catch (error) {
    console.error(error);
    renderMessage("No data found for this combination. Try changing the filters.");
  } finally {
    setLoading(false);
  }
});

// Kick off initial load
loadStates();
