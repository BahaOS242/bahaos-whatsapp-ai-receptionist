import { createHash } from "node:crypto";

/** Deterministic JSON: object keys sorted recursively, so equal payloads hash equal regardless of key order. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",")}}`;
}

export function payloadHash(type: string, version: number, payload: unknown): string {
  return createHash("sha256").update(`${type}\n${version}\n${canonicalJson(payload)}`).digest("hex");
}
