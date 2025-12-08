const chatWindow = document.getElementById("chat-window");
const chatInput = document.getElementById("chat-input");
const chatSend = document.getElementById("chat-send");
const chatReset = document.getElementById("chat-reset");
const chatStateInput = document.getElementById("chat-state-input");
const chatDistrictInput = document.getElementById("chat-district-input");
const chatBlockInput = document.getElementById("chat-block-input");
const chatApply = document.getElementById("chat-apply");
const chatAssistError = document.getElementById("chat-assist-error");
const chatStatesList = document.getElementById("chat-states-list");
const chatDistrictsList = document.getElementById("chat-districts-list");
const chatBlocksList = document.getElementById("chat-blocks-list");

const API_BASE = "/api";
const STATES = {
  ASK_STATE: "ASK_STATE",
  ASK_DISTRICT_OR_LEVEL: "ASK_DISTRICT_OR_LEVEL",
  ASK_YEAR: "ASK_YEAR",
  CONFIRM_AND_QUERY: "CONFIRM_AND_QUERY",
  DONE: "DONE",
};

let currentState = STATES.ASK_STATE;
let conversation = {
  state: null,
  district: null,
  block: null,
  years: undefined, // undefined means not chosen, [] means use latest
};

const caches = {
  states: [],
  districts: new Map(), // state -> districts array
  blocks: new Map(), // `${state}|${district}` -> blocks array
};

function fillDatalist(listEl, values = []) {
  if (!listEl) return;
  listEl.innerHTML = "";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    listEl.appendChild(option);
  });
}

function normalizeValue(value) {
  return value?.trim().toLowerCase() || "";
}

function findExact(value, options = []) {
  const target = normalizeValue(value);
  return options.find((opt) => normalizeValue(opt) === target) || null;
}

/**
 * Rendering helpers
 */
function addMessage(text, sender = "bot") {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${sender}`;
  bubble.innerText = text;
  chatWindow.appendChild(bubble);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function setAssistError(message = "") {
  if (chatAssistError) {
    chatAssistError.textContent = message;
  }
}

function resetConversation(clearHistory = true) {
  conversation = { state: null, district: null, block: null, years: undefined };
  currentState = STATES.ASK_STATE;
  if (clearHistory) {
    chatWindow.innerHTML = "";
  }
  addMessage("Hi! I can help you with groundwater data for India. Which state are you interested in?");
}

/**
 * Data helpers
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
  if (caches.states.length) return caches.states;
  caches.states = await fetchJSON(`${API_BASE}/meta/states`);
  fillDatalist(chatStatesList, caches.states);
  return caches.states;
}

async function loadDistricts(state) {
  if (caches.districts.has(state)) return caches.districts.get(state);
  const districts = await fetchJSON(
    `${API_BASE}/meta/districts?state=${encodeURIComponent(state)}`
  );
  caches.districts.set(state, districts);
  if (normalizeValue(state) === normalizeValue(chatStateInput?.value)) {
    fillDatalist(chatDistrictsList, districts);
  }
  return districts;
}

async function loadBlocks(state, district) {
  const key = `${state}|${district}`;
  if (caches.blocks.has(key)) return caches.blocks.get(key);
  const blocks = await fetchJSON(
    `${API_BASE}/meta/blocks?state=${encodeURIComponent(state)}&district=${encodeURIComponent(
      district
    )}`
  );
  caches.blocks.set(key, blocks);
  if (
    normalizeValue(state) === normalizeValue(chatStateInput?.value) &&
    normalizeValue(district) === normalizeValue(chatDistrictInput?.value)
  ) {
    fillDatalist(chatBlocksList, blocks);
  }
  return blocks;
}

/**
 * Parsing helpers
 */
function detectMatch(text, options = []) {
  const lowerText = text.toLowerCase();
  return options.find((opt) => lowerText.includes(opt.toLowerCase())) || null;
}

function parseYears(text) {
  const lower = text.toLowerCase();
  if (lower.includes("latest")) return [];
  if (lower.includes("both") || lower.includes("all")) return [2023, 2024];

  const matches = [];
  if (lower.match(/2023/)) matches.push(2023);
  if (lower.match(/2024/)) matches.push(2024);

  if (matches.length) return Array.from(new Set(matches));
  return null; // no signal detected
}

function wantsStateLevel(text) {
  const lower = text.toLowerCase();
  return lower.includes("state level") || lower.includes("no district") || lower.includes("skip");
}

function formatSuggestions(list, limit = 3) {
  return list.slice(0, limit).join(", ");
}

/**
 * Assisted selectors (searchable dropdowns)
 */
async function handleStateAssistChange() {
  setAssistError("");
  const value = chatStateInput?.value?.trim();
  if (!value) {
    chatDistrictInput.value = "";
    chatBlockInput.value = "";
    chatDistrictInput.disabled = true;
    chatBlockInput.disabled = true;
    fillDatalist(chatDistrictsList, []);
    fillDatalist(chatBlocksList, []);
    return;
  }

  const states = await loadStates();
  const match = findExact(value, states);
  if (!match) {
    setAssistError("Select a valid state from the list.");
    chatDistrictInput.disabled = true;
    chatBlockInput.disabled = true;
    fillDatalist(chatDistrictsList, []);
    fillDatalist(chatBlocksList, []);
    return;
  }

  conversation.state = match;
  conversation.district = null;
  conversation.block = null;
  chatDistrictInput.value = "";
  chatBlockInput.value = "";
  chatDistrictInput.disabled = false;
  await loadDistricts(match);
}

async function handleDistrictAssistChange() {
  setAssistError("");
  const state = conversation.state;
  const value = chatDistrictInput?.value?.trim();
  if (!state) {
    setAssistError("Choose a state first.");
    chatDistrictInput.value = "";
    chatDistrictInput.disabled = true;
    return;
  }

  if (!value) {
    conversation.district = null;
    chatBlockInput.value = "";
    chatBlockInput.disabled = true;
    fillDatalist(chatBlocksList, []);
    return;
  }

  const districts = await loadDistricts(state);
  const match = findExact(value, districts);
  if (!match) {
    setAssistError("Select a valid district from the list.");
    chatBlockInput.disabled = true;
    fillDatalist(chatBlocksList, []);
    return;
  }

  conversation.district = match;
  conversation.block = null;
  chatBlockInput.value = "";
  chatBlockInput.disabled = false;
  await loadBlocks(state, match);
}

async function handleBlockAssistChange() {
  setAssistError("");
  const state = conversation.state;
  const district = conversation.district;
  const value = chatBlockInput?.value?.trim();

  if (!state || !district) {
    setAssistError("Select a state and district first.");
    chatBlockInput.value = "";
    chatBlockInput.disabled = true;
    return;
  }

  if (!value) {
    conversation.block = null;
    return;
  }

  const blocks = await loadBlocks(state, district);
  const match = findExact(value, blocks);
  if (!match) {
    setAssistError("Select a valid block from the list.");
    return;
  }

  conversation.block = match;
}

async function applyAssistSelection() {
  setAssistError("");
  const stateValue = chatStateInput?.value?.trim();
  if (!stateValue) {
    setAssistError("Please choose a state.");
    return;
  }

  const states = await loadStates();
  const state = findExact(stateValue, states);
  if (!state) {
    setAssistError("Please pick a state from the list.");
    return;
  }

  let district = null;
  let block = null;

  const districtValue = chatDistrictInput?.value?.trim();
  if (districtValue) {
    const districts = await loadDistricts(state);
    district = findExact(districtValue, districts);
    if (!district) {
      setAssistError("Pick a district from the list.");
      return;
    }
  }

  const blockValue = chatBlockInput?.value?.trim();
  if (blockValue) {
    if (!district) {
      setAssistError("Select a district before choosing a block.");
      return;
    }
    const blocks = await loadBlocks(state, district);
    block = findExact(blockValue, blocks);
    if (!block) {
      setAssistError("Pick a block from the list.");
      return;
    }
  }

  conversation = { state, district: district || null, block: block || null, years: undefined };
  addMessage(
    `Using selection: ${state}${district ? `, ${district}` : ""}${block ? `, ${block}` : ""}`,
    "user"
  );
  currentState = STATES.CONFIRM_AND_QUERY;
  await runQuery();
}

/**
 * FSM handlers
 */
async function handleAskState(message) {
  const states = await loadStates();
  const state = detectMatch(message, states);

  if (!state) {
    addMessage(
      `I couldn't find that state. Try one of: ${formatSuggestions(states, 4)}.`,
      "bot"
    );
    return;
  }

  conversation.state = state;

  // Pre-fetch districts and see if the user also provided one.
  const districts = await loadDistricts(state);
  const district = detectMatch(message, districts);
  const years = parseYears(message);

  if (district) {
    conversation.district = district;
  }
  if (years !== null) {
    conversation.years = years;
  }

  if (conversation.district || wantsStateLevel(message)) {
    currentState = STATES.ASK_YEAR;
    askYear();
  } else {
    currentState = STATES.ASK_DISTRICT_OR_LEVEL;
    addMessage(
      `Got it: ${state}. Do you want a specific district, or should I show state-level data?`
    );
  }

  // If we already have years, we can move straight to querying.
  if (currentState === STATES.ASK_YEAR && conversation.years !== undefined) {
    await handleAskYear(message, true);
  }
}

async function handleAskDistrict(message) {
  const state = conversation.state;
  const districts = await loadDistricts(state);
  if (wantsStateLevel(message)) {
    conversation.district = null;
    currentState = STATES.ASK_YEAR;
    askYear();
    return;
  }

  const district = detectMatch(message, districts);
  if (!district) {
    addMessage(
      `I couldn't find that district for ${state}. Try one of: ${formatSuggestions(
        districts,
        4
      )}.`
    );
    return;
  }

  conversation.district = district;
  currentState = STATES.ASK_YEAR;
  askYear();
}

function askYear() {
  addMessage("Which year? You can say 2023, 2024, or both. If you skip, I'll use the latest year.");
}

async function handleAskYear(message, skipPrompt = false) {
  const years = skipPrompt ? conversation.years : parseYears(message);
  if (years === null || years === undefined) {
    addMessage("I didn't catch the year. Say 2023, 2024, both, or 'latest year'.");
    return;
  }
  conversation.years = years;
  currentState = STATES.CONFIRM_AND_QUERY;
  await runQuery();
}

async function runQuery() {
  addMessage("Fetching data...");
  const payload = {
    state: conversation.state,
    district: conversation.district,
    block: conversation.block,
    years: conversation.years,
  };

  try {
    const data = await fetchJSON(`${API_BASE}/query`, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const { locationSummary, years } = data;
    if (!years || !years.length) {
      addMessage(
        "I couldn't find data for that combination. Try changing the state or district.",
        "bot"
      );
    } else {
      const locationText = [
        locationSummary.state || "All states",
        locationSummary.district || null,
        locationSummary.block || null,
      ]
        .filter(Boolean)
        .join(" › ");

      const lines = years
        .map(
          (y) =>
            `${y.year}: Extractable ${y.annual_extractable ?? "—"}, Extraction ${y.total_extraction ?? "—"
            }, Stage ${y.stage_percent ?? "—"}%, Category ${y.categorization || "Unknown"}`
        )
        .join("\n");

      addMessage(`Results for ${locationText}:\n${lines}`, "bot");
    }
  } catch (error) {
    console.error(error);
    addMessage(
      "I couldn't find data for that combination. Try changing the state or district.",
      "bot"
    );
  } finally {
    currentState = STATES.DONE;
    addMessage("Do you want to check another location? Tell me a state or hit Start over.", "bot");
    conversation = { state: null, district: null, block: null, years: undefined };
    currentState = STATES.ASK_STATE;
  }
}

/**
 * Input handling
 */
async function handleUserInput() {
  const message = chatInput.value.trim();
  if (!message) return;

  chatInput.value = "";
  addMessage(message, "user");

  if (message.toLowerCase() === "start over" || message.toLowerCase() === "reset") {
    resetConversation(false);
    return;
  }

  try {
    switch (currentState) {
      case STATES.ASK_STATE:
        await handleAskState(message);
        break;
      case STATES.ASK_DISTRICT_OR_LEVEL:
        await handleAskDistrict(message);
        break;
      case STATES.ASK_YEAR:
        await handleAskYear(message);
        break;
      default:
        await handleAskState(message);
        break;
    }
  } catch (error) {
    console.error(error);
    addMessage("Something went wrong. Please try again.", "bot");
  }
}

// Events
chatSend?.addEventListener("click", handleUserInput);
chatInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    handleUserInput();
  }
});

chatReset.addEventListener("click", () => resetConversation());

chatStateInput?.addEventListener("focus", loadStates);
chatStateInput?.addEventListener("input", handleStateAssistChange);
chatDistrictInput?.addEventListener("focus", handleDistrictAssistChange);
chatDistrictInput?.addEventListener("input", handleDistrictAssistChange);
chatBlockInput?.addEventListener("focus", handleBlockAssistChange);
chatBlockInput?.addEventListener("input", handleBlockAssistChange);
chatApply?.addEventListener("click", applyAssistSelection);

// Initialize
resetConversation();
loadStates().catch((err) => {
  console.error(err);
  addMessage("Unable to load states right now. Please try again later.", "bot");
});
