/**
 * Starts the LOCAL-ONLY browser chat (free simulation). `npm run chat:web`, then open the printed address.
 * Refuses to run in production or on a hosting platform; listens on 127.0.0.1 only; reads no credentials or .env.
 */
import { assertLocalDevelopmentOnly, createLocalChatApp } from "./local-chat-app";
import { LIVE_BUDGET_CAP_USD, createLiveSession, readAnthropicKey, type LiveSession } from "./live-mode";

assertLocalDevelopmentOnly(process.env);

const port = Number.parseInt(process.env.LOCAL_CHAT_PORT ?? "3100", 10);
// Live Haiku is strictly opt-in: only `npm run chat:web:live` (LOCAL_CHAT_LIVE=1) reads the key, and only that one variable.
let live: LiveSession | undefined;
if (process.env.LOCAL_CHAT_LIVE === "1") {
  const apiKey = readAnthropicKey();
  if (!apiKey) {
    console.error("Live mode requested but no Anthropic key was found (in the process environment or the .env file). Starting nothing.");
    process.exit(1);
  }
  const budgetUsd = process.env.LOCAL_CHAT_BUDGET_USD ? Number(process.env.LOCAL_CHAT_BUDGET_USD) : LIVE_BUDGET_CAP_USD;
  live = createLiveSession({ apiKey, budgetUsd }); // throws if above the authorised $1.00
  console.log(`LIVE mode available: Claude Haiku 4.5, bookings still simulated, session budget $${budgetUsd.toFixed(2)} (estimate, enforced server-side). The key never leaves this process.`);
}

const app = createLocalChatApp({ live });
const server = app.listen(port, "127.0.0.1", () => {
  console.log(`BahaOS local test chat (FREE SIMULATION: rule-based provider, simulated booking, no AI/database/WhatsApp)`);
  console.log(`Open http://127.0.0.1:${port}   (Ctrl+C to stop)`);
});
server.on("error", (e) => {
  console.error(e instanceof Error ? e.message : "failed to start");
  process.exit(1);
});
