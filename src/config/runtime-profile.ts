import type { Env } from "./env";

/**
 * What this process will actually run with — resolved from the validated env by the SAME pure functions the real
 * provider factories use (createReceptionistTools / createMessagingProvider / createAiProvider), so the startup log and
 * the production guard can never disagree with real behaviour. Never contains a credential value.
 *
 * Why it exists (staging, 2026-10-09): production with DB_BOOKING_ENABLED missing silently used the in-memory demo
 * booking tools — customers were told "request captured" and nothing was stored. Nothing at startup said so.
 */
export type BookingBackend = "database" | "clinic_simulator" | "google_calendar" | "demo_in_memory";
export type MessagingTransport = "whatsapp" | "mock";
export type AiProviderKind = "anthropic" | "rule_based";

export interface RuntimeProfile {
  nodeEnv: Env["NODE_ENV"];
  aiProvider: AiProviderKind;
  bookingBackend: BookingBackend;
  messaging: MessagingTransport;
  webhook: { inboundConfigured: boolean; signatureVerification: boolean };
  flags: { knowledge: boolean; memory: boolean; jobs: boolean };
}

/** Same precedence as createReceptionistTools: simulator, then database, then Google Calendar (all four vars), else demo. */
export function resolveBookingBackend(env: Env, hasInjectedSimulator = false): BookingBackend {
  if (env.CLINIC_SIMULATOR_ENABLED || hasInjectedSimulator) return "clinic_simulator";
  if (env.DB_BOOKING_ENABLED) return "database";
  if (
    env.GOOGLE_CALENDAR_CLIENT_ID &&
    env.GOOGLE_CALENDAR_CLIENT_SECRET &&
    env.GOOGLE_CALENDAR_REFRESH_TOKEN &&
    env.GOOGLE_CALENDAR_ID
  ) {
    return "google_calendar";
  }
  return "demo_in_memory";
}

/** Real WhatsApp sending needs BOTH the access token and the phone number id (see createMessagingProvider). */
export function resolveMessagingTransport(env: Env): MessagingTransport {
  return env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID ? "whatsapp" : "mock";
}

/** Anthropic is the only LLM provider (see createAiProvider); anything else is the deterministic fallback. */
export function resolveAiProvider(env: Env): AiProviderKind {
  return env.ANTHROPIC_API_KEY ? "anthropic" : "rule_based";
}

export function resolveRuntimeProfile(env: Env): RuntimeProfile {
  return {
    nodeEnv: env.NODE_ENV,
    aiProvider: resolveAiProvider(env),
    bookingBackend: resolveBookingBackend(env),
    messaging: resolveMessagingTransport(env),
    webhook: {
      inboundConfigured: Boolean(env.WHATSAPP_WEBHOOK_VERIFY_TOKEN),
      signatureVerification: Boolean(env.WHATSAPP_APP_SECRET),
    },
    flags: { knowledge: env.KNOWLEDGE_ENABLED, memory: env.MEMORY_ENABLED, jobs: env.JOBS_ENABLED },
  };
}

/** One log line, no secrets. */
export function describeRuntimeProfile(p: RuntimeProfile): string {
  return (
    `[startup] runtime profile: nodeEnv=${p.nodeEnv} aiProvider=${p.aiProvider} bookingBackend=${p.bookingBackend} ` +
    `messaging=${p.messaging} webhookInbound=${p.webhook.inboundConfigured} signatureVerification=${p.webhook.signatureVerification} ` +
    `knowledge=${p.flags.knowledge} memory=${p.flags.memory} jobs=${p.flags.jobs}`
  );
}

export class RuntimeProfileError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Refusing to start in production with an unsafe configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}\n` +
      "Set ALLOW_DEMO_TOOLS_IN_PRODUCTION=true only if running demo tools in production is genuinely intended.");
    this.name = "RuntimeProfileError";
  }
}

/** Production only: demo/in-memory booking, or an inbound webhook with no real outbound transport, would silently lose data. */
export function assertSafeRuntimeProfile(profile: RuntimeProfile, env: Env): void {
  if (profile.nodeEnv !== "production" || env.ALLOW_DEMO_TOOLS_IN_PRODUCTION) return;
  const problems: string[] = [];
  if (profile.bookingBackend === "demo_in_memory") {
    problems.push(
      "bookings would use the in-memory demo tools and nothing would be stored (set DB_BOOKING_ENABLED=true, or configure all four GOOGLE_CALENDAR_* variables)",
    );
  }
  if (profile.bookingBackend === "clinic_simulator") {
    problems.push("CLINIC_SIMULATOR_ENABLED uses an in-memory simulator that stores nothing durable (unset it and set DB_BOOKING_ENABLED=true)");
  }
  if (profile.webhook.inboundConfigured && profile.messaging === "mock") {
    problems.push("an inbound WhatsApp webhook is configured but replies would go to the mock transport (set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID)");
  }
  if (problems.length > 0) throw new RuntimeProfileError(problems);
}
