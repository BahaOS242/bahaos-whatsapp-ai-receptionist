import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { ConversationManager } from "../../src/ai/conversation-manager";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import type { LlmChatClient, LlmChatResult } from "../../src/ai/providers/llm-chat-client";
import type {
  AIProvider,
  AIProviderRequest,
  BusinessContext,
  ConversationTurn,
  ReceptionistTools,
  ToolResult,
} from "../../src/ai/types";
import { HashingEmbedder } from "../../src/knowledge/embedding/hashing-embedder";
import type { EmbeddingProvider } from "../../src/knowledge/embedding/provider";
import { InMemoryGapRecorder, KnowledgeService } from "../../src/knowledge/knowledge-service";
import { InMemoryKnowledgeStore } from "../../src/knowledge/memory-store";
import { seedDemoKnowledge } from "../../src/knowledge/seed/demo-knowledge";
import { RecordingTelemetry } from "../../src/knowledge/telemetry";
import type { KnowledgeStore } from "../../src/knowledge/store";
import type { StoredKnowledgeAuthority, KnowledgeDocType } from "../../src/knowledge/types";
import type { ApprovedVocabularySource } from "../../src/knowledge/vocabulary";

export const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const BUSINESS = BAHAMAS_DENTAL_SERVICE;

/** The same practice, but root canal has no fixed price in configuration
 * ("Varies") — which lets TWO DOCUMENTS disagree about it with no
 * structured price outranking both. */
export const BUSINESS_NO_ROOT_CANAL_PRICE: BusinessContext = {
  ...BAHAMAS_DENTAL_SERVICE,
  services: BAHAMAS_DENTAL_SERVICE.services.map((s) => (s.id === "root_canal" ? { ...s, priceLabel: "Varies" } : s)),
};

/** Counts embed() calls, so tests can prove retrieval is not run needlessly. */
export class CountingEmbedder implements EmbeddingProvider {
  readonly inner = new HashingEmbedder();
  readonly id = this.inner.id;
  readonly dimensions = this.inner.dimensions;
  readonly semantic = false;
  queryEmbeds = 0;
  documentEmbeds = 0;
  async embed(texts: string[], kind: "document" | "query") {
    if (kind === "query") this.queryEmbeds += 1;
    else this.documentEmbeds += 1;
    return this.inner.embed(texts);
  }
}

export interface Engine {
  service: KnowledgeService;
  store: InMemoryKnowledgeStore;
  embedder: CountingEmbedder;
  telemetry: RecordingTelemetry;
  gaps: InMemoryGapRecorder;
}

export function makeEngine(options: { store?: KnowledgeStore; vocabulary?: ApprovedVocabularySource; embedder?: EmbeddingProvider } = {}): Engine {
  const store = (options.store as InMemoryKnowledgeStore | undefined) ?? new InMemoryKnowledgeStore();
  const embedder = new CountingEmbedder();
  const telemetry = new RecordingTelemetry();
  const gaps = new InMemoryGapRecorder();
  const service = new KnowledgeService({
    store,
    embedder: options.embedder ?? embedder,
    telemetry,
    gapRecorder: gaps,
    vocabulary: options.vocabulary,
    cacheTtlMs: 0,
  });
  return { service, store, embedder, telemetry, gaps };
}

export async function seededEngine(tenantId = TENANT_A): Promise<Engine> {
  const engine = makeEngine();
  await seedDemoKnowledge(engine.service, BUSINESS, tenantId);
  engine.telemetry.events.length = 0;
  return engine;
}

/** Ingest + approve one document in a single step. */
export async function addApproved(
  engine: Engine,
  tenantId: string,
  doc: { docKey: string; title: string; text: string; authority?: StoredKnowledgeAuthority; docType?: KnowledgeDocType; expiresAt?: Date; effectiveAt?: Date },
  business: BusinessContext = BUSINESS,
) {
  const ingested = await engine.service.ingest(business, {
    tenantId,
    docKey: doc.docKey,
    title: doc.title,
    docType: doc.docType ?? "policy",
    content: doc.text,
    mimeType: "text/markdown",
    authority: doc.authority ?? "approved_document",
    expiresAt: doc.expiresAt,
    effectiveAt: doc.effectiveAt,
  });
  const approved = await engine.service.approve(business, { tenantId, documentId: ingested.document.id, approvedBy: "test-reviewer" });
  return { ingested, approved };
}

export const IDLE = { hasActiveIntent: false, hasPendingConfirmation: false, extractedBookingField: false };

export async function ask(
  engine: Engine,
  message: string,
  options: { tenantId?: string; business?: BusinessContext; history?: ConversationTurn[] } = {},
) {
  const lookup = engine.service.lookupFor({
    tenantId: options.tenantId === undefined ? TENANT_A : options.tenantId,
    business: options.business ?? BUSINESS,
  });
  return lookup({ message, history: options.history ?? [], context: IDLE });
}

/** Programmable chat model double: records every call. */
export class ScriptedLlm implements LlmChatClient {
  calls: Array<Parameters<LlmChatClient["chat"]>[0]> = [];
  constructor(private readonly respond: (params: Parameters<LlmChatClient["chat"]>[0], callNumber: number) => LlmChatResult) {}
  async chat(params: Parameters<LlmChatClient["chat"]>[0]): Promise<LlmChatResult> {
    this.calls.push(params);
    return this.respond(params, this.calls.length);
  }
  get lastPrompt(): string {
    return this.calls[this.calls.length - 1]?.systemPrompt ?? "";
  }
}

export const say = (content: string): LlmChatResult => ({ content, toolCalls: [] });

/** ReceptionistTools double that records every call and succeeds. */
export class RecordingTools implements ReceptionistTools {
  calls: string[] = [];
  private ok = async (name: string): Promise<ToolResult> => {
    this.calls.push(name);
    return { success: true, persisted: true };
  };
  createLead = () => this.ok("createLead");
  requestAppointment = () => this.ok("requestAppointment");
  requestReschedule = () => this.ok("requestReschedule");
  requestCancellation = () => this.ok("requestCancellation");
  requestRecurringAppointment = () => this.ok("requestRecurringAppointment");
  escalate = () => this.ok("escalate");
}

export function request(message: string, overrides: Partial<AIProviderRequest> = {}): AIProviderRequest {
  return { business: BUSINESS, customer: {}, history: [], message, bookingState: {}, ...overrides };
}

/** A multi-turn conversation through the REAL ReceptionistAgent. */
export class Conversation {
  readonly manager = new ConversationManager();
  readonly history: ConversationTurn[] = [];
  readonly tools = new RecordingTools();
  readonly agent: ReceptionistAgent;
  readonly replies: string[] = [];

  constructor(
    provider: AIProvider = new DevRuleBasedAIProvider(),
    private readonly engine?: Engine,
    private readonly tenantId: string = TENANT_A,
    private readonly business: BusinessContext = BUSINESS,
  ) {
    this.agent = new ReceptionistAgent(provider, this.tools, undefined, engine?.service);
  }

  async send(message: string) {
    const req = this.manager.buildRequest({
      business: this.business,
      customer: {},
      history: this.history,
      message,
      tenantId: this.engine ? this.tenantId : undefined,
    });
    const result = await this.agent.handleMessage(req);
    this.history.push({ role: "customer", content: message }, { role: "assistant", content: result.reply });
    this.manager.setBookingState(result.bookingState);
    this.manager.setHandoffActive(result.handoffActive);
    this.replies.push(result.reply);
    return result;
  }
}
