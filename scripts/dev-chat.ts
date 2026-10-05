/**
 * Interactive terminal chat against the real ReceptionistAgent — the
 * "how do I actually try this" entry point for this milestone. Uses
 * LLMProvider automatically when OPENAI_API_KEY is set (else
 * DevRuleBasedAIProvider), and real Google Calendar tools when all four
 * GOOGLE_CALENDAR_* vars are set (else the in-memory simulated tools).
 * Run with `npm run chat`.
 */
import { stdin, stdout } from "node:process";
import readline from "node:readline/promises";
import {
  BAHAMAS_DENTAL_SERVICE,
  createAiProvider,
  createLanguageObservationRecorder,
  createReceptionistTools,
} from "../src/ai/create-provider";
import { createClinicSimulator } from "../src/simulator/clinic-simulator";
import { ConversationManager } from "../src/ai/conversation-manager";
import { ReceptionistAgent } from "../src/ai/receptionist-agent";
import { createKnowledgeService } from "../src/knowledge/create-knowledge-service";
import { noopTelemetry } from "../src/knowledge/telemetry";
import { seedDemoKnowledge } from "../src/knowledge/seed/demo-knowledge";
import { getEnv } from "../src/config/env";
import type { AIProviderRequest, ConversationTurn } from "../src/ai/types";

async function main() {
  const provider = createAiProvider();
  // ONE simulator instance for the whole session (not a fresh one per
  // turn) — so a booking made turn 3 is still reflected in turn 4's
  // availability checks. See AIProviderRequest.checkAvailability's own
  // docstring for why the conversational layer needs direct access to
  // this, not just the ReceptionistTools execution layer.
  const clinicSimulatorEnabled = process.env.CLINIC_SIMULATOR_ENABLED === "true";
  const clinicSimulator = clinicSimulatorEnabled ? createClinicSimulator(BAHAMAS_DENTAL_SERVICE) : undefined;
  const tools = createReceptionistTools(undefined, undefined, clinicSimulator);
  const checkAvailability: AIProviderRequest["checkAvailability"] = clinicSimulator
    ? (date, time, durationMinutes) => clinicSimulator.checkBookable(date, time, durationMinutes)
    : undefined;
  const languageObservationRecorder = createLanguageObservationRecorder();
  const providerLabel = provider.constructor.name;
  const toolsLabel = clinicSimulatorEnabled
    ? "clinic simulator (test-data/clinic-calendar/)"
    : process.env.DB_BOOKING_ENABLED === "true"
      ? "database"
      : process.env.GOOGLE_CALENDAR_CLIENT_ID
        ? "real (Google Calendar)"
        : "simulated";

  console.log(
    `\n${BAHAMAS_DENTAL_SERVICE.name} — dev chat (provider: ${providerLabel}, tools: ${toolsLabel})`,
  );
  console.log("Type a message and press enter. Ctrl+C to quit.\n");

  // KNOWLEDGE_ENABLED=true => business-knowledge (RAG) engine, seeded with
  // the demo corpus in an in-memory store (src/knowledge/seed). Try:
  // "what should I bring", "what's your cancellation policy", "do you
  // offer pediatric root canals" (-> honest "I don't have that").
  const DEV_TENANT_ID = "00000000-0000-0000-0000-00000000dev1";
  const knowledge = createKnowledgeService(getEnv(), undefined, { telemetry: noopTelemetry });
  if (knowledge) await seedDemoKnowledge(knowledge, BAHAMAS_DENTAL_SERVICE, DEV_TENANT_ID);
  const agent = new ReceptionistAgent(provider, tools, languageObservationRecorder, knowledge);
  const conversationManager = new ConversationManager();
  const history: ConversationTurn[] = [];

  const rl = readline.createInterface({ input: stdin, output: stdout });

  for (;;) {
    const message = await rl.question("You: ");
    if (!message.trim()) continue;

    const request = conversationManager.buildRequest({
      business: BAHAMAS_DENTAL_SERVICE,
      customer: {},
      history,
      message,
      checkAvailability,
      tenantId: knowledge ? DEV_TENANT_ID : undefined,
    });

    const result = await agent.handleMessage(request);
    console.log(`AI: ${result.reply}\n`);

    history.push({ role: "customer", content: message });
    history.push({ role: "assistant", content: result.reply });
    conversationManager.setBookingState(result.bookingState);
    conversationManager.setHandoffActive(result.handoffActive);

    for (const executed of result.actionsTaken) {
      const status = executed.result.success
        ? "ok"
        : `FAILED: ${executed.result.error ?? "unknown"}`;
      console.log(`  [action] ${executed.action.type} -> ${status}`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
