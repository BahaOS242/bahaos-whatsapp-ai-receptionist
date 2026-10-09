import type { ConversationStatus } from "../db/conversations";

/**
 * The ONE place that decides whether a staff member may perform an inbox
 * action on a conversation in a given state. The ownership service enforces
 * it server-side; the API also returns the same verdicts as `allowedActions`
 * so the UI can disable what would be refused — the UI is a convenience,
 * never the control.
 *
 * Roles (existing `staff_users.role`): `admin` may act on any conversation
 * in their tenant and may assign to anyone; `staff` may act on unowned
 * conversations and on ones they own, and may assign only to themselves.
 *
 * STATE MODEL (persisted `conversations.status`):
 *   ai_active      = AI_ACTIVE      the AI replies normally
 *   human_pending  = HUMAN_PENDING  handoff requested, awaiting staff; AI suppressed
 *   staff_owned    = HUMAN_ACTIVE   a staff member owns it; AI suppressed
 *   resolved       = CLOSED         closed; reopen is explicit
 */
export type InboxAction = "accept" | "takeover" | "assign" | "reply" | "release" | "close" | "reopen";

export interface ActorRef {
  staffUserId: string;
  role: "admin" | "staff";
}

export interface ConversationRef {
  status: ConversationStatus;
  assignedStaffUserId: string | null;
}

export type Verdict =
  | { ok: true }
  | { ok: false; reason: "invalid_transition" | "forbidden"; detail: string };

const yes: Verdict = { ok: true };
const invalid = (detail: string): Verdict => ({ ok: false, reason: "invalid_transition", detail });
const forbidden = (detail: string): Verdict => ({ ok: false, reason: "forbidden", detail });

export function evaluate(
  action: InboxAction,
  conv: ConversationRef,
  actor: ActorRef,
  target?: { assigneeId?: string },
): Verdict {
  const isAdmin = actor.role === "admin";
  const owner = conv.assignedStaffUserId;
  const ownedByOther = conv.status === "staff_owned" && owner !== null && owner !== actor.staffUserId;

  switch (action) {
    case "accept":
      return conv.status === "human_pending" ? yes : invalid("only a pending handoff can be accepted");

    case "takeover":
      if (conv.status === "ai_active" || conv.status === "human_pending") return yes;
      if (conv.status === "resolved") return invalid("a closed conversation must be reopened first");
      if (!ownedByOther) return invalid("you already own this conversation");
      return isAdmin ? yes : forbidden("owned by another staff member; only an admin can take it over");

    case "assign": {
      if (conv.status === "resolved") return invalid("a closed conversation must be reopened first");
      const to = target?.assigneeId;
      if (!to) return invalid("an assignee is required");
      if (!isAdmin && to !== actor.staffUserId) return forbidden("only an admin can assign to someone else");
      if (ownedByOther && !isAdmin) return forbidden("owned by another staff member");
      if (conv.status === "staff_owned" && owner === to) return invalid("already assigned to that person");
      return yes;
    }

    case "reply":
      if (conv.status !== "staff_owned") return invalid("take over the conversation before replying");
      if (ownedByOther && !isAdmin) return forbidden("owned by another staff member");
      return yes;

    case "release":
      if (conv.status === "human_pending") return yes;
      if (conv.status !== "staff_owned") return invalid("the AI already has this conversation");
      return ownedByOther && !isAdmin ? forbidden("owned by another staff member") : yes;

    case "close":
      if (conv.status === "resolved") return invalid("already closed");
      return ownedByOther && !isAdmin ? forbidden("owned by another staff member") : yes;

    case "reopen":
      return conv.status === "resolved" ? yes : invalid("only a closed conversation can be reopened");
  }
}

export type AllowedActions = Record<InboxAction, boolean>;

/** Verdicts for the UI. `assign` is "may I assign to myself" (admins may
 * assign to anyone — the UI offers a staff picker only to admins). */
export function allowedActions(conv: ConversationRef, actor: ActorRef): AllowedActions {
  const check = (a: InboxAction) => evaluate(a, conv, actor, { assigneeId: actor.staffUserId }).ok;
  return {
    accept: check("accept"),
    takeover: check("takeover"),
    assign: actor.role === "admin" ? evaluate("assign", conv, actor, { assigneeId: "__any__" }).ok : false,
    reply: check("reply"),
    release: check("release"),
    close: check("close"),
    reopen: check("reopen"),
  };
}
