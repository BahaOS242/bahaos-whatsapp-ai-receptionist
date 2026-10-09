"use strict";
const log = document.getElementById("log");
const form = document.getElementById("form");
const input = document.getElementById("msg");
const sendBtn = document.getElementById("send");
const stateEl = document.getElementById("state");
const actionsEl = document.getElementById("actions");
let conversationId = null;
let busy = false;
const doneActions = [];

async function api(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "request failed (" + res.status + ")");
  return data;
}

function addMessage(role, text) {
  const el = document.createElement("div");
  el.className = "msg " + role;
  el.textContent = text; // text only, never HTML
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

function showState(bookingState, actions) {
  stateEl.textContent = JSON.stringify(bookingState || {}, null, 2);
  for (const a of actions || []) doneActions.push(a.type + (a.ok ? " (ok)" : " FAILED: " + (a.error || "")));
  actionsEl.textContent = doneActions.length ? "Booking actions in this conversation: " + doneActions.join(", ") : "No booking actions yet.";
}

async function startConversation() {
  const created = await api("/api/conversations", {});
  conversationId = created.id;
  log.textContent = "";
  doneActions.length = 0;
  addMessage("note", "New conversation. This is a free simulation: type a message to begin.");
  showState({}, []);
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
  } catch (error) {
    addMessage("note", "Error: " + error.message + (String(error.message).includes("unknown conversation") ? " Click New conversation." : ""));
  } finally {
    busy = false;
    sendBtn.disabled = false;
    input.focus();
  }
});

document.getElementById("new").addEventListener("click", () => { startConversation().catch((e) => addMessage("note", "Error: " + e.message)); });
for (const chip of document.querySelectorAll(".chip")) {
  chip.addEventListener("click", () => { input.value = chip.getAttribute("data-text") || ""; input.focus(); });
}
startConversation().catch((e) => addMessage("note", "Could not start: " + e.message));
