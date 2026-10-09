import type { Env } from "../config/env";
import { getEnv } from "../config/env";
import type { BusinessContext } from "../ai/types";
import { MemoryService } from "./service";
import { consoleMemoryTelemetry, noopMemoryTelemetry } from "./telemetry";

/** The memory service, or `undefined` when MEMORY_ENABLED is off — then nothing in the receptionist changes. */
export function createMemoryService(business: BusinessContext, env: Env = getEnv()): MemoryService | undefined {
  if (!env.MEMORY_ENABLED) return undefined;
  return new MemoryService({ business, telemetry: env.NODE_ENV === "test" ? noopMemoryTelemetry : consoleMemoryTelemetry });
}
