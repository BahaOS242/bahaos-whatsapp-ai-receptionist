import { esc, renderDetail, renderFilters, renderList, renderLogin } from "./inbox-view.js";

const API = "/api/inbox";
const POLL_MS = 5000;
const app = document.getElementById("app");
const S = { token: null, me: null, filter: "all", q: "", selected: null, staff: [], list: null, detail: null, error: null, timer: null, busy: false };

// Token lives in sessionStorage only (cleared with the tab); wrapped because it can throw.
try { S.token = sessionStorage.getItem("inboxToken"); } catch { /* ignore */ }

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    method: opts.method || "GET",
    headers: { "content-type": "application/json", ...(S.token ? { authorization: `Bearer ${S.token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && S.token) signOut();
  if (!res.ok) throw Object.assign(new Error(data.detail || data.error || `HTTP ${res.status}`), { code: data.error });
  return data;
}

function signOut() {
  S.token = null; S.me = null; stopPolling();
  try { sessionStorage.removeItem("inboxToken"); } catch { /* ignore */ }
  draw();
}

async function refresh() {
  if (!S.token) return;
  try {
    if (!S.staff.length) S.staff = (await api("/staff")).staff;
    S.list = await api(`/conversations?filter=${S.filter}${S.q ? `&q=${encodeURIComponent(S.q)}` : ""}`);
    if (S.selected) S.detail = await api(`/conversations/${S.selected}`);
    S.error = null;
  } catch (e) { S.error = e.message; if (e.code === "not_found") { S.selected = null; S.detail = null; } }
  draw();
}

function startPolling() { stopPolling(); S.timer = setInterval(() => { if (!document.hidden && !S.busy) refresh(); }, POLL_MS); }
function stopPolling() { if (S.timer) clearInterval(S.timer); S.timer = null; }
window.addEventListener("pagehide", stopPolling);

function draw() {
  if (!S.token) { app.innerHTML = renderLogin(S.error); return; }
  const keepDraft = app.querySelector("textarea[name=body]")?.value ?? "";
  const keepQ = document.activeElement?.matches?.("[data-q]");
  const list = S.list
    ? renderFilters(S.list.counts, S.filter) + renderList(S.list.conversations, S.selected, Date.now())
    : `<div class="state">Loading…</div>`;
  const detail = S.detail ? renderDetail(S.detail, S.staff) : `<div class="state">Select a conversation.</div>`;
  app.innerHTML = `<div class="bar"><h1>Inbox</h1><input class="q" data-q type="search" placeholder="Search" value="${esc(S.q)}"><button type="button" data-signout>Sign out</button></div>
${S.error ? `<div class="state error" role="alert">${esc(S.error)}</div>` : ""}
<div class="layout${S.selected ? " viewing" : ""}"><div class="list">${list}</div><div class="detail">${S.selected ? '<button type="button" data-back>← Back</button>' : ""}${detail}</div></div>`;
  const ta = app.querySelector("textarea[name=body]");
  if (ta && keepDraft) ta.value = keepDraft;
  if (keepQ) { const q = app.querySelector("[data-q]"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  const msgs = app.querySelector("[data-msgs]"); if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

async function act(fn) {
  S.busy = true;
  try { await fn(); S.error = null; } catch (e) { S.error = e.message; }
  S.busy = false;
  await refresh(); // truthful state only comes from the server
}

app.addEventListener("click", (e) => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.filter) { S.filter = t.dataset.filter; refresh(); }
  else if (t.dataset.open) { S.selected = t.dataset.open; S.detail = null; refresh(); }
  else if (t.hasAttribute("data-back")) { S.selected = null; S.detail = null; draw(); }
  else if (t.hasAttribute("data-signout")) { api("/logout", { method: "POST" }).catch(() => {}); signOut(); }
  else if (t.dataset.action) {
    const body = { expectedVersion: S.detail.conversation.ownershipVersion };
    act(() => api(`/conversations/${S.selected}/${t.dataset.action}`, { method: "POST", body }));
  } else if (t.dataset.retry) act(() => api(`/conversations/${S.selected}/messages/${t.dataset.retry}/retry`, { method: "POST" }));
});
app.addEventListener("change", (e) => {
  if (e.target.matches("[data-assign]") && e.target.value)
    act(() => api(`/conversations/${S.selected}/assign`, { method: "POST", body: { assigneeId: e.target.value, expectedVersion: S.detail.conversation.ownershipVersion } }));
});
let qTimer;
app.addEventListener("input", (e) => {
  if (e.target.matches("[data-q]")) { S.q = e.target.value; clearTimeout(qTimer); qTimer = setTimeout(refresh, 300); }
});
let pending = null; // {id, body}: the id is reused ONLY for identical text, so a retry dedupes but an edited message is a new message
app.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (e.target.matches("[data-login]")) {
    const f = new FormData(e.target);
    try {
      const r = await api("/login", { method: "POST", body: Object.fromEntries(f) });
      S.token = r.token; S.me = r.staff; S.error = null;
      try { sessionStorage.setItem("inboxToken", r.token); } catch { /* ignore */ }
      startPolling(); refresh();
    } catch { S.error = "Sign-in failed."; draw(); }
  } else if (e.target.matches("[data-composer]")) {
    const ta = e.target.querySelector("textarea"); const body = ta.value.trim();
    if (!body) return;
    if (!pending || pending.body !== body) pending = { id: `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, body };
    const id = pending.id;
    await act(async () => { await api(`/conversations/${S.selected}/reply`, { method: "POST", body: { body, clientMessageId: id } }); pending = null; ta.value = ""; });
  }
});

if (S.token) { startPolling(); refresh(); } else draw();
