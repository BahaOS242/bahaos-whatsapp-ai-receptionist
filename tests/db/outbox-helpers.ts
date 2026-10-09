import { randomUUID } from "node:crypto";
import { conversations, customers, messages, tenants } from "../../src/db/schema";
import type { MessagingProvider, OutboundMessageResult } from "../../src/messaging/messaging-provider";
import { enqueueOutboundMessage } from "../../src/messaging/outbox";
import { runOutboxPass, type OutboxWorkerOptions } from "../../src/messaging/outbox-worker";
import type { createTestDb } from "./db-test-helpers";

type TestDb = ReturnType<typeof createTestDb>["db"];

export interface Fixture {
  tenantId: string;
  customerId: string;
  conversationId: string;
  phone: string;
}

let phoneCounter = 0;

/** A tenant + customer + conversation. Pass `tenantId` to put a second
 * customer in an existing tenant. */
export async function seedConversation(db: TestDb, existingTenantId?: string): Promise<Fixture> {
  const tenantId =
    existingTenantId ??
    (await db.insert(tenants).values({ slug: `outbox-${randomUUID()}`, name: "Outbox Test", timezone: "UTC" }).returning())[0].id;
  const phone = `+1242555${String(1000 + phoneCounter++).padStart(4, "0")}`;
  const [customer] = await db.insert(customers).values({ tenantId, whatsappId: phone }).returning();
  const [conversation] = await db.insert(conversations).values({ tenantId, customerId: customer.id }).returning();
  return { tenantId, customerId: customer.id, conversationId: conversation.id, phone };
}

/** Records the conversation-log row and queues it, exactly as the webhook does. */
export async function queue(db: TestDb, f: Fixture, body: string, key = `k-${randomUUID()}`, now?: Date) {
  const [message] = await db
    .insert(messages)
    .values({ tenantId: f.tenantId, conversationId: f.conversationId, direction: "outbound", senderType: "ai", content: body })
    .returning();
  const result = await enqueueOutboundMessage(db, {
    tenantId: f.tenantId,
    conversationId: f.conversationId,
    customerId: f.customerId,
    messageId: message.id,
    body,
    idempotencyKey: key,
    now,
  });
  return { ...result, messageId: message.id, key };
}

export interface SendLog {
  to: string;
  body: string;
  startedAt: number;
  endedAt?: number;
}

/** A provider whose every outcome is scripted; records each send. */
export class ScriptedProvider implements MessagingProvider {
  readonly sends: SendLog[] = [];
  private seq = 0;
  constructor(
    private readonly script: (call: number, to: string, body: string) => OutboundMessageResult | Promise<OutboundMessageResult> = () => ({ success: true }),
  ) {}
  async sendText(to: string, body: string): Promise<OutboundMessageResult> {
    const log: SendLog = { to, body, startedAt: Date.now() };
    this.sends.push(log);
    const call = ++this.seq;
    try {
      const r = await this.script(call, to, body);
      // A scripted success gets a provider id unless it explicitly carries a
      // `providerMessageId` key (use `providerMessageId: undefined` to model a
      // 2xx whose body had no usable id).
      return r.success && !("providerMessageId" in r) ? { ...r, providerMessageId: `wamid.test-${call}` } : r;
    } finally {
      log.endedAt = Date.now();
    }
  }
  get bodies(): string[] {
    return this.sends.map((s) => s.body);
  }
}

export const TRANSIENT: Record<"timeout" | "network" | "http503" | "rateLimit", OutboundMessageResult> = {
  timeout: { success: false, error: "WhatsApp send failed (network error): timeout", retryable: true, errorCode: "network_timeout", ambiguous: true },
  network: { success: false, error: "WhatsApp send failed (network error): ECONNRESET", retryable: true, errorCode: "network_error", ambiguous: true },
  http503: { success: false, error: "WhatsApp send failed: Service Unavailable", retryable: true, errorCode: "http_503", httpStatus: 503, ambiguous: true },
  rateLimit: { success: false, error: "WhatsApp send failed: rate limit hit", retryable: true, errorCode: "meta_130429", httpStatus: 400, metaCode: 130429, ambiguous: false },
};

export const PERMANENT: Record<"invalidRecipient" | "malformed" | "badCredentials" | "unclassified", OutboundMessageResult> = {
  invalidRecipient: { success: false, error: "WhatsApp send failed: recipient not valid", retryable: false, errorCode: "meta_131026", httpStatus: 400, metaCode: 131026, ambiguous: false },
  malformed: { success: false, error: "WhatsApp send failed: Param text['body'] is required", retryable: false, errorCode: "meta_100", httpStatus: 400, metaCode: 100, ambiguous: false },
  badCredentials: { success: false, error: "WhatsApp send failed: Invalid OAuth access token", retryable: false, errorCode: "meta_190", httpStatus: 401, metaCode: 190, ambiguous: false },
  unclassified: { success: false, error: "something unexplained" },
};

/** A controllable clock. Starts a minute in the REAL future so rows
 * enqueued with the real clock a moment earlier are already due. */
export function fakeClock(start = new Date(Date.now() + 60_000)) {
  let t = start.getTime();
  return {
    now: () => new Date(t),
    advance: (ms: number) => {
      t += ms;
    },
    clock: () => new Date(t),
  };
}

/**
 * What the background worker does in production, run explicitly: keep
 * passing until nothing is deliverable right now (a retry that is not yet
 * due is NOT delivered). The webhook no longer delivers anything itself,
 * so tests that assert on delivered replies call this after the request.
 */
export async function deliverAllQueued(db: TestDb, provider: MessagingProvider, opts: OutboxWorkerOptions = {}): Promise<number> {
  let sent = 0;
  for (let i = 0; i < 50; i++) {
    const pass = await runOutboxPass(db, provider, opts);
    sent += pass.sent;
    if (pass.claimed === 0) break;
  }
  return sent;
}
