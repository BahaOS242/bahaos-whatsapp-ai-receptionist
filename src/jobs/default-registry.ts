import { memoryExpireSweepJob } from "./handlers/memory-expire-sweep";
import { createJobRegistry, type JobRegistry } from "./registry";
import type { JobDefinition } from "./types";

/**
 * The PRODUCTION registry: real job types only. Test-only handlers live under
 * tests/ and are passed to the worker explicitly; they cannot be reached from here.
 */
export const PRODUCTION_JOB_DEFINITIONS: JobDefinition[] = [memoryExpireSweepJob as JobDefinition];

export function createDefaultJobRegistry(): JobRegistry {
  return createJobRegistry(PRODUCTION_JOB_DEFINITIONS);
}
