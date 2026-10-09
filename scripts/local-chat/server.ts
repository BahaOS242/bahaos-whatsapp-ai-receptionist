/**
 * Starts the LOCAL-ONLY browser chat (free simulation). `npm run chat:web`, then open the printed address.
 * Refuses to run in production or on a hosting platform; listens on 127.0.0.1 only; reads no credentials or .env.
 */
import { assertLocalDevelopmentOnly, createLocalChatApp } from "./local-chat-app";

assertLocalDevelopmentOnly(process.env);

const port = Number.parseInt(process.env.LOCAL_CHAT_PORT ?? "3100", 10);
const app = createLocalChatApp();
const server = app.listen(port, "127.0.0.1", () => {
  console.log(`BahaOS local test chat (FREE SIMULATION: rule-based provider, simulated booking, no AI/database/WhatsApp)`);
  console.log(`Open http://127.0.0.1:${port}   (Ctrl+C to stop)`);
});
server.on("error", (e) => {
  console.error(e instanceof Error ? e.message : "failed to start");
  process.exit(1);
});
