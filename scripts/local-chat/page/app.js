"use strict";
const log = document.getElementById("log");
const form = document.getElementById("form");
const input = document.getElementById("msg");
const sendBtn = document.getElementById("send");
const stateEl = document.getElementById("state");
const actionsEl = document.getElementById("actions");
const modeSel = document.getElementById("mode");
const badge = document.getElementById("badge");
const spendEl = document.getElementById("spend");
const haltEl = document.getElementById("halt");
let conversationId = null;
let currentMode = "free";
let liveInfo = { available: false };
let busy = false;
const doneActions = [];

const FREE_BADGE = "Free simulation · built-in rule-based replies · simulated booking · no real AI, database, calendar or WhatsApp";
const LIVE_BADGE = "Live Haiku / simulated bookings · real AI replies (costs money, budget-limited) · bookings simulated · no database, calendar or WhatsApp";

async function api(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(data.error || "request failed (" + res.status + ")"); err.data = data; throw err; }
  return data;
}

function usd(n) { return "$" + Number(n).toFixed(4); }

function addMessage(role, text) {
  const el = document.createElement("div");
  el.className = "msg " + role;
  el.textContent = text; // text only, never HTML
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

function renderMode() {
  badge.textContent = "";
  const strong = document.createElement("strong");
  const isLive = currentMode === "live";
  strong.textContent = isLive ? "Live Haiku / simulated bookings" : "Free simulation";
  badge.append(strong, " · " + (isLive ? LIVE_BADGE.split(" · ").slice(1).join(" · ") : FREE_BADGE.split(" · ").slice(1).join(" · ")));
  badge.classList.toggle("live", isLive);
  spendEl.hidden = !isLive;
}

function renderLive(live) {
  if (!live || !live.available) return;
  liveInfo = live;
  spendEl.textContent = "Estimated session spend: " + usd(live.spentUsd) + " of $" + live.budgetUsd.toFixed(2) + " (" + usd(live.remainingUsd) + " left) · " + live.calls + " model call" + (live.calls === 1 ? "" : "s") + " · an estimate from reported usage, not a receipt";
  if (live.halted) { haltEl.textContent = "Live mode has stopped: " + live.halted + ". Switch to Free simulation, or restart the server to reset the budget."; haltEl.hidden = false; }
  else { haltEl.hidden = true; }
}

function showState(bookingState, actions) {
  stateEl.textContent = JSON.stringify(bookingState || {}, null, 2);
  for (const a of actions || []) doneActions.push(a.type + (a.ok ? " (ok)" : " FAILED: " + (a.error || "")));
  actionsEl.textContent = doneActions.length ? "Booking actions in this conversation: " + doneActions.join(", ") : "No booking actions yet.";
}

async function startConversation(mode) {
  const created = await api("/api/conversations", { mode });
  conversationId = created.id;
  currentMode = created.mode;
  log.textContent = "";
  doneActions.length = 0;
  haltEl.hidden = true;
  renderMode();
  addMessage("note", "New " + (currentMode === "live" ? "LIVE (real Haiku, simulated bookings)" : "free-simulation") + " conversation. Type a message to begin.");
  showState({}, []);
  const info = await api("/api/info");
  renderLive(info.live);
  input.focus();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || busy || !conversationId) return;
  busy = true;
  sendBtn.disabled = true;
  input.value = "";
  addMessage("customer", text);
  try {
    const turn = await api("/api/conversations/" + conversationId + "/messages", { message: text });
    addMessage("assistant", turn.reply);
    showState(turn.bookingState, turn.actions);
    renderLive(turn.live);
  } catch (error) {
    addMessage("note", "Error: " + error.message + (String(error.message).includes("unknown conversation") ? " Click New conversation." : ""));
    if (error.data && error.data.live) renderLive(error.data.live);
  } finally {
    busy = false;
    sendBtn.disabled = false;
    input.focus();
  }
});

// Switching providers ALWAYS starts a fresh conversation (nothing carries over between modes).
modeSel.addEventListener("change", () => { startConversation(modeSel.value).catch((e) => { addMessage("note", "Error: " + e.message); }); });
document.getElementById("new").addEventListener("click", () => { startConversation(modeSel.value).catch((e) => addMessage("note", "Error: " + e.message)); });
for (const chip of document.querySelectorAll(".chip")) {
  chip.addEventListener("click", () => { input.value = chip.getAttribute("data-text") || ""; input.focus(); });
}

(async () => {
  try {
    const info = await api("/api/info");
    liveInfo = info.live || { available: false };
    const opt = document.getElementById("live-option");
    if (liveInfo.available) { opt.disabled = false; opt.textContent = "Live Haiku / simulated bookings"; renderLive(liveInfo); }
    await startConversation("free");
  } catch (e) { addMessage("note", "Could not start: " + e.message); }
})();
