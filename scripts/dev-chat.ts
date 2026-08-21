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
  createReceptionistTools,
} from "../src/ai/create-provider";
import { ConversationManager } from "../src/ai/conversation-manager";
import { ReceptionistAgent } from "../src/ai/receptionist-agent";
import type { ConversationTurn } from "../src/ai/types";

async function main() {
  const provider = createAiProvider();
  const tools = createReceptionistTools();
  const providerLabel = provider.constructor.name;
  const toolsLabel = process.env.GOOGLE_CALENDAR_CLIENT_ID ? "real (Google Calendar)" : "simulated";

  console.log(
    `\n${BAHAMAS_DENTAL_SERVICE.name} — dev chat (provider: ${providerLabel}, tools: ${toolsLabel})`,
  );
  console.log("Type a message and press enter. Ctrl+C to quit.\n");

  const agent = new ReceptionistAgent(provider, tools);
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
    });

    const result = await agent.handleMessage(request);
    console.log(`AI: ${result.reply}\n`);

    history.push({ role: "customer", content: message });
    history.push({ role: "assistant", content: result.reply });
    conversationManager.setBookingState(result.bookingState);

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
