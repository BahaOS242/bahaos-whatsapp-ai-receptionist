import { createApp } from "./app";
import { getEnv } from "./config/env";

const env = getEnv();
const app = createApp();

app.listen(env.PORT, () => {
  console.log(`bahaos-whatsapp-ai-receptionist listening on port ${env.PORT} (${env.NODE_ENV})`);
});
