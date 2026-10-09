/**
 * READ-ONLY Meta Graph API diagnostic for the WhatsApp staging account. Sends GET requests only, to an allow-listed set of
 * paths, with the token supplied through the WA_TOKEN environment variable (use a hidden prompt: `read -rs "WA_TOKEN?..."`).
 * The token is sent only in the Authorization header and is never printed, logged or written. Output is sanitised: tokens are
 * redacted, phone numbers are masked to their last four digits. NO sends, NO writes, NO account changes.
 *
 * usage (in YOUR terminal; paste the token once at the hidden prompt, then `unset WA_TOKEN` afterwards):
 *   read -rs "WA_TOKEN?Meta access token (hidden): "; export WA_TOKEN; echo
 *   npx tsx scripts/staging/graph-diagnose.ts            # prints the sanitised report; add --out FILE to also save it
 */
import { writeFileSync } from "node:fs";

export const GRAPH_VERSION = "v25.0";
export const DEFAULT_IDS = {
  phoneNumberId: "1403602129498088",
  wabaIds: ["28205690265798365", "1122901356778301"],
  businessId: "1087227134067802",
};

export interface DiagnosticIds { phoneNumberId: string; wabaIds: string[]; businessId: string }
export interface RequestRecord { path: string; status: number | "network_error"; ok: boolean; response: unknown }
export interface DiagnosticReport {
  generatedAt: string;
  graphVersion: string;
  requests: RequestRecord[];
  findings: Record<string, unknown>;
  limitations: string[];
}

const ID = "[0-9]{5,25}";
/** Every path this tool may request. Anything else is refused before a request is made. */
const ALLOWED: RegExp[] = [
  new RegExp(`^/debug_token$`),
  new RegExp(`^/${ID}$`),
  new RegExp(`^/${ID}/(phone_numbers|subscribed_apps|owned_whatsapp_business_accounts|client_whatsapp_business_accounts)$`),
];

const PHONE_FIELDS = "id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status,platform_type,account_mode,status,is_official_business_account";
const WABA_FIELDS = "id,name,currency,timezone_id,account_review_status,business_verification_status,ownership_type,health_status,is_enabled_for_insights";
const BUSINESS_FIELDS = "id,name,verification_status,two_factor_type,created_time";

/** Redacts anything token-shaped and masks phone numbers; never returns the secret it was given. */
export function sanitize(value: unknown, secret?: string): unknown {
  const walk = (v: unknown, key = ""): unknown => {
    if (typeof v === "string") {
      let s = v;
      if (secret) s = s.split(secret).join("[REDACTED]");
      s = s.replace(/EAA[A-Za-z0-9_-]{20,}/g, "[REDACTED_TOKEN]");
      if (/phone|number|recipient|wa_id/i.test(key) && /\d{7,}/.test(s)) s = s.replace(/\d(?=\d{4})/g, "•");
      return s;
    }
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([k]) => !/^(access_token|token|input_token|authorization)$/i.test(k))
          .map(([k, x]) => [k, walk(x, k)]),
      );
    }
    return v;
  };
  return walk(value);
}

export interface RunOptions {
  token: string;
  ids?: DiagnosticIds;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export async function runDiagnostics(opts: RunOptions): Promise<DiagnosticReport> {
  const ids = opts.ids ?? DEFAULT_IDS;
  const doFetch = opts.fetchImpl ?? fetch;
  const requests: RequestRecord[] = [];
  const limitations: string[] = [];

  async function get(path: string, query: Record<string, string> = {}): Promise<RequestRecord> {
    if (!ALLOWED.some((re) => re.test(path))) throw new Error(`refused: path not in the read-only allow-list: ${path}`);
    const qs = new URLSearchParams(query).toString();
    // The recorded path must never carry the token (debug_token takes it as a query parameter).
    const shownQs = new URLSearchParams(Object.fromEntries(Object.entries(query).map(([k, v]) => [k, /token/i.test(k) ? "[REDACTED]" : v]))).toString();
    const shownPath = shownQs ? `${path}?${shownQs}` : path;
    let record: RequestRecord;
    try {
      const res = await doFetch(`https://graph.facebook.com/${GRAPH_VERSION}${path}${qs ? `?${qs}` : ""}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${opts.token}` },
      });
      let body: unknown;
      try { body = await res.json(); } catch { body = { unreadable: true }; }
      record = { path: shownPath, status: res.status, ok: res.ok, response: sanitize(body, opts.token) };
    } catch (e) {
      record = { path: shownPath, status: "network_error", ok: false, response: { error: sanitize(e instanceof Error ? e.message : String(e), opts.token) } };
    }
    requests.push(record);
    return record;
  }
  const data = (r: RequestRecord): Array<Record<string, unknown>> => {
    const d = (r.response as { data?: unknown })?.data;
    return Array.isArray(d) ? (d as Array<Record<string, unknown>>) : [];
  };

  // 0. what the token is allowed to do (read-only introspection of the SAME token)
  const dbg = await get("/debug_token", { input_token: opts.token });
  // 1. the phone number node itself
  const phone = await get(`/${ids.phoneNumberId}`, { fields: PHONE_FIELDS });
  // 2. for every candidate WABA: its own node, its phone numbers, its subscribed apps
  const wabaFindings: Record<string, unknown> = {};
  let containing: string | null = null;
  for (const waba of ids.wabaIds) {
    const node = await get(`/${waba}`, { fields: WABA_FIELDS });
    const phones = await get(`/${waba}/phone_numbers`, { fields: "id,display_phone_number,verified_name,quality_rating,account_mode,status" });
    const subs = await get(`/${waba}/subscribed_apps`);
    const phoneIds = data(phones).map((p) => String(p.id));
    const has = phones.ok ? phoneIds.includes(ids.phoneNumberId) : "unknown (phone_numbers request failed)";
    if (has === true) containing = waba;
    wabaFindings[waba] = {
      nodeReadable: node.ok,
      phoneNumbersReadable: phones.ok,
      containsTestPhoneNumber: has,
      phoneNumberIds: phones.ok ? phoneIds : undefined,
      subscribedApps: subs.ok ? data(subs).map((a) => (a.whatsapp_business_api_data as { name?: string; id?: string } | undefined) ?? a) : "unreadable",
    };
  }
  // 3. the business portfolio and the WhatsApp accounts it owns / is a client of
  const biz = await get(`/${ids.businessId}`, { fields: BUSINESS_FIELDS });
  const owned = await get(`/${ids.businessId}/owned_whatsapp_business_accounts`, { fields: "id,name,account_review_status,business_verification_status" });
  const client = await get(`/${ids.businessId}/client_whatsapp_business_accounts`, { fields: "id,name,account_review_status,business_verification_status" });

  const scopes = ((dbg.response as { data?: { scopes?: string[] } })?.data?.scopes ?? []) as string[];
  if (!dbg.ok) limitations.push("The token could not be introspected (debug_token failed); scope/expiry unknown.");
  if (dbg.ok && !scopes.includes("whatsapp_business_management")) limitations.push("Token lacks whatsapp_business_management: WABA reads will likely fail.");
  if (dbg.ok && !scopes.includes("business_management")) limitations.push("Token lacks business_management: business portfolio reads will likely fail.");
  for (const r of requests) if (!r.ok) limitations.push(`${r.path.split("?")[0]} -> ${r.status} ${JSON.stringify((r.response as { error?: { message?: string; code?: number } })?.error ?? {}).slice(0, 160)}`);

  const idsInBusiness = [...data(owned), ...data(client)].map((w) => String(w.id));
  return {
    generatedAt: (opts.now ?? (() => new Date()))().toISOString(),
    graphVersion: GRAPH_VERSION,
    requests,
    findings: {
      tokenScopes: dbg.ok ? scopes : "unknown",
      tokenExpiresAt: dbg.ok ? (dbg.response as { data?: { expires_at?: number } }).data?.expires_at : "unknown",
      phoneNumberNodeReadable: phone.ok,
      phoneNumberNode: phone.ok ? phone.response : undefined,
      wabaContainingTestPhoneNumber: containing ?? "not determined (no WABA listing contained it, or listings were unreadable)",
      wabas: wabaFindings,
      businessNodeReadable: biz.ok,
      businessNode: biz.ok ? biz.response : undefined,
      businessListsTheseWabaIds: owned.ok || client.ok ? idsInBusiness : "unreadable",
      queriedWabaIdsListedUnderBusiness: Object.fromEntries(ids.wabaIds.map((w) => [w, owned.ok || client.ok ? idsInBusiness.includes(w) : "unknown"])),
    },
    limitations,
  };
}

async function main() {
  const token = process.env.WA_TOKEN ?? "";
  if (!token) { console.error("WA_TOKEN is not set. Use the hidden prompt described at the top of this file."); process.exit(2); }
  if (!token.startsWith("EAA") || token.length < 100) { console.error(`WA_TOKEN does not look like a Meta access token (starts "EAA", long). Length=${token.length}. Not sending anything.`); process.exit(2); }
  const report = await runDiagnostics({ token });
  const text = JSON.stringify(report, null, 2);
  const out = process.argv.indexOf("--out");
  if (out > -1 && process.argv[out + 1]) { writeFileSync(process.argv[out + 1], text + "\n", { mode: 0o600 }); console.error(`saved ${process.argv[out + 1]}`); }
  console.log(text);
}

if (process.argv[1]?.endsWith("graph-diagnose.ts")) {
  main().catch((e) => { console.error(e instanceof Error ? e.message.replace(/EAA[A-Za-z0-9_-]+/g, "[REDACTED_TOKEN]") : "failed"); process.exit(1); });
}
