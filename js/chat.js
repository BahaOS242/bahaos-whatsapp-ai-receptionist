import { ReceptionistEngine, BUSINESS_KNOWLEDGE } from "./engine.js";

const engine = new ReceptionistEngine();

const els = {
  body: document.getElementById("chatBody"),
  input: document.getElementById("chatInput"),
  send: document.getElementById("sendBtn"),
  status: document.getElementById("chatStatus"),
  scene: document.getElementById("sceneJson"),
};

function timeNow() {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function scrollToBottom() {
  els.body.scrollTop = els.body.scrollHeight;
}

function addMessage(text, sender) {
  const div = document.createElement("div");
  div.className = `msg ${sender}`;
  div.innerHTML = `${escapeHtml(text)}<span class="time">${timeNow()}</span>`;
  els.body.appendChild(div);
  scrollToBottom();
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function setQuickReplies(options) {
  const existing = els.body.querySelector(".quick-replies");
  if (existing) existing.remove();
  if (!options || options.length === 0) return;
  const row = document.createElement("div");
  row.className = "quick-replies";
  options.forEach((opt) => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.type = "button";
    chip.textContent = opt;
    chip.addEventListener("click", () => sendUserMessage(opt));
    row.appendChild(chip);
  });
  els.body.appendChild(row);
  scrollToBottom();
}

function showTyping() {
  els.status.textContent = "typing…";
  els.status.classList.add("typing");
  const bubble = document.createElement("div");
  bubble.className = "typing-bubble";
  bubble.id = "typingBubble";
  bubble.innerHTML = "<span></span><span></span><span></span>";
  els.body.appendChild(bubble);
  scrollToBottom();
}

function hideTyping() {
  els.status.textContent = "online";
  els.status.classList.remove("typing");
  document.getElementById("typingBubble")?.remove();
}

function updateScenePanel(action, state) {
  const lines = [];
  lines.push(`<span class="k">stage</span>: "${state.stage}"`);
  lines.push(`<span class="k">name</span>: ${state.name ? `"${state.name}"` : "null"}`);
  lines.push(`<span class="k">phone</span>: ${state.phone ? `"${state.phone}"` : "null"}`);
  lines.push(`<span class="k">service</span>: ${state.service ? `"${state.service.label}"` : "null"}`);
  lines.push(`<span class="k">date</span>: ${state.date ? `"${state.date}"` : "null"}`);
  lines.push(`<span class="k">time</span>: ${state.time ? `"${state.time}"` : "null"}`);
  lines.push(`<span class="k">leadCaptured</span>: ${state.leadCaptured}`);
  lines.push(`<span class="k">escalated</span>: ${state.escalated}`);
  if (action) lines.push(`<span class="k">lastAction</span>: "${action}" (simulated — not sent anywhere)`);
  els.scene.innerHTML = lines.join("\n");
}

function sendUserMessage(text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  setQuickReplies([]);
  addMessage(trimmed, "user");
  els.input.value = "";
  els.send.disabled = true;

  const delay = Math.min(1500, 500 + trimmed.length * 12);
  showTyping();
  setTimeout(() => {
    const result = engine.handleMessage(trimmed);
    hideTyping();
    addMessage(result.text, "bot");
    setQuickReplies(result.quickReplies);
    updateScenePanel(result.action, result.state);
    els.send.disabled = false;
    els.input.focus();
  }, delay);
}

export function initChat() {
  // Opening disclaimer, then the scripted greeting.
  const disclaimer = document.createElement("div");
  disclaimer.className = "chat-disclaimer";
  disclaimer.textContent = "Simulated demo — no real messages are sent";
  els.body.appendChild(disclaimer);

  showTyping();
  setTimeout(() => {
    hideTyping();
    addMessage(engine.greetingMessage(), "bot");
    setQuickReplies(["Book an appointment", "What are your hours?", "Do you take insurance?", "I need to reschedule"]);
    updateScenePanel(null, engine.getStateSnapshot());
  }, 700);

  els.send.addEventListener("click", () => sendUserMessage(els.input.value));
  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendUserMessage(els.input.value);
  });
}

export { BUSINESS_KNOWLEDGE };
