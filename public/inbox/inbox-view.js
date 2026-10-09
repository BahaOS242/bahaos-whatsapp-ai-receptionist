// Pure render functions: data in, HTML string out. No DOM, no network, no clock
// (callers pass `now`), so they are unit-tested in Node. ALL dynamic text goes
// through esc().
export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const STATE_LABEL = { ai_active: "AI active", human_pending: "Needs a human", staff_owned: "With staff", resolved: "Closed" };
export const FILTERS = [["all", "All"], ["pending", "Needs human"], ["human", "With staff"], ["ai", "AI"], ["closed", "Closed"]];
export const DELIVERY_LABEL = { queued: "Queued", sending: "Sending…", retrying: "Retrying", sent: "Sent", failed: "Failed to send", withdrawn: "Withdrawn (not sent)" };

export function ago(iso, now) {
  if (!iso) return "";
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function renderFilters(counts, active) {
  return `<div class="filters" role="group" aria-label="Filter conversations">${FILTERS.map(
    ([k, l]) => `<button type="button" data-filter="${esc(k)}" aria-pressed="${k === active}">${esc(l)} (${esc(counts?.[k] ?? 0)})</button>`,
  ).join("")}</div>`;
}

export function renderList(list, selectedId, now) {
  if (!list.length) return `<div class="state">No conversations match.</div>`;
  return list
    .map((c) => {
      const name = c.customerName || c.customerPhone;
      const waiting = c.waitingSince ? `<span class="badge pending">Waiting ${esc(ago(c.waitingSince, now))}</span>` : "";
      const who = c.assignee ? ` · ${esc(c.assignee.name)}` : "";
      const prev = c.lastMessage ? `${c.lastMessage.direction === "inbound" ? "" : "↩ "}${esc(c.lastMessage.preview)}` : "No messages";
      return `<button type="button" class="row" data-open="${esc(c.id)}" aria-current="${c.id === selectedId}">
<div class="top"><span>${esc(name)}</span><span class="badge">${esc(STATE_LABEL[c.status] ?? c.status)}</span></div>
<div class="prev">${prev}</div>
<div>${waiting} <span class="badge">${esc(ago(c.lastActivityAt, now))}${who}</span></div></button>`;
    })
    .join("");
}

export function renderMessage(m) {
  const who = m.direction === "inbound" ? "Customer" : m.senderType === "staff" ? `Staff${m.author ? ` · ${m.author.name}` : ""}` : "AI assistant";
  const cls = m.direction === "inbound" ? "cust" : m.senderType === "staff" ? "staff" : "ai";
  let d = "";
  if (m.delivery) {
    const bad = m.delivery.state === "failed";
    d = `<div><span class="badge${bad ? " failed" : ""}">${esc(m.delivery.mayHaveBeenDelivered ? "Withdrawn — an earlier attempt may have been delivered" : (DELIVERY_LABEL[m.delivery.state] ?? m.delivery.state))}</span>${
      bad && m.delivery.error ? ` <span class="err">${esc(m.delivery.error)}</span>` : ""
    }${m.delivery.retryable ? ` <button type="button" data-retry="${esc(m.id)}">Retry</button>` : ""}</div>`;
  }
  return `<div class="msg ${cls}"><div class="who">${esc(who)}</div>${esc(m.content)}${d}</div>`;
}

const ACTIONS = [["accept", "Accept"], ["takeover", "Take over"], ["release", "Return to AI"], ["close", "Close"], ["reopen", "Reopen"]];

export function renderMeta(detail, staff) {
  const c = detail.conversation;
  const a = detail.allowedActions;
  const buttons = ACTIONS.map(([k, l]) => `<button type="button" data-action="${k}"${a[k] ? "" : " disabled"}>${l}</button>`).join("");
  const assign = a.assign
    ? `<select data-assign aria-label="Assign to"><option value="">Assign to…</option>${staff.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")}</select>`
    : "";
  return `<div class="meta"><strong>${esc(c.customerName || c.customerPhone)}</strong> <span class="badge">${esc(STATE_LABEL[c.status])}</span>
${c.assignee ? `<span class="badge">Assigned: ${esc(c.assignee.name)}</span>` : ""}
${c.handoffReason ? `<div>Handoff reason: ${esc(c.handoffReason)}</div>` : ""}
<div class="actions">${buttons}${assign}</div></div>`;
}

export function renderDetail(detail, staff) {
  const paused = detail.aiPaused ? `<div class="paused" role="status">AI paused — automated replies are off for this conversation</div>` : "";
  const msgs = detail.messages.length ? detail.messages.map(renderMessage).join("") : `<div class="state">No messages yet.</div>`;
  const canReply = detail.allowedActions.reply;
  const composer = `<form class="composer" data-composer><textarea name="body" maxlength="4096" rows="2" placeholder="${
    canReply ? "Write a reply" : "Take over this conversation to reply"
  }"${canReply ? "" : " disabled"} aria-label="Reply"></textarea><button class="primary" type="submit"${canReply ? "" : " disabled"}>Send</button></form>`;
  return `${renderMeta(detail, staff)}${paused}<div class="msgs" data-msgs>${msgs}</div>${composer}`;
}

export function renderLogin(error) {
  return `<form class="login" data-login><h1>BahaOS Inbox</h1>
<input name="tenant" placeholder="Business" autocomplete="organization" required>
<input name="email" type="email" placeholder="Email" autocomplete="username" required>
<input name="password" type="password" placeholder="Password" autocomplete="current-password" required>
<button class="primary" type="submit">Sign in</button>${error ? `<div class="err" role="alert">${esc(error)}</div>` : ""}</form>`;
}
