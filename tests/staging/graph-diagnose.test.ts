import { describe, expect, it } from "vitest";
import { DEFAULT_IDS, runDiagnostics, sanitize } from "../../scripts/staging/graph-diagnose";

type Waba = { containsTestPhoneNumber: unknown; subscribedApps: unknown };
type Findings = { wabaContainingTestPhoneNumber: unknown; wabas: Record<string, Waba>; queriedWabaIdsListedUnderBusiness: unknown; businessNodeReadable: boolean };
const TOKEN = "EAAB" + "x".repeat(60) + "SECRETTAIL";

/** A fake Graph: records every call and answers by path. */
function fakeGraph(overrides: Record<string, { status?: number; body: unknown }> = {}) {
  const calls: Array<{ url: string; method?: string; auth?: string }> = [];
  const impl = (async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    calls.push({ url, method: init?.method, auth: (init?.headers as Record<string, string> | undefined)?.Authorization });
    const key = u.pathname.replace(/^\/v[\d.]+/, "");
    const hit = overrides[key];
    const defaults: Record<string, unknown> = {
      "/debug_token": { data: { app_id: "1109659041650307", is_valid: true, expires_at: 1791600000, scopes: ["whatsapp_business_management", "business_management"] } },
      "/1403602129498088": { id: "1403602129498088", display_phone_number: "+1 555-643-6134", quality_rating: "UNKNOWN" },
      "/28205690265798365/phone_numbers": { data: [{ id: "1403602129498088", display_phone_number: "+1 555-643-6134" }] },
      "/1122901356778301/phone_numbers": { data: [] },
      "/28205690265798365": { id: "28205690265798365", name: "Test WhatsApp Business Account", account_review_status: "PENDING" },
      "/1122901356778301": { id: "1122901356778301", name: "Other" },
      "/28205690265798365/subscribed_apps": { data: [{ whatsapp_business_api_data: { id: "1109659041650307", name: "BahaOS Staging" } }] },
      "/1122901356778301/subscribed_apps": { data: [] },
      "/1087227134067802": { id: "1087227134067802", name: "Biz", verification_status: "not_verified" },
      "/1087227134067802/owned_whatsapp_business_accounts": { data: [{ id: "28205690265798365" }] },
      "/1087227134067802/client_whatsapp_business_accounts": { data: [] },
    };
    const status = hit?.status ?? 200;
    return new Response(JSON.stringify(hit ? hit.body : defaults[key] ?? { error: { message: "unknown path", code: 100 } }), { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("graph-diagnose is strictly read-only and never leaks the token", () => {
  it("sends only GET requests, to allow-listed paths, with the token only in the Authorization header", async () => {
    const g = fakeGraph();
    await runDiagnostics({ token: TOKEN, fetchImpl: g.impl });
    expect(g.calls.length).toBeGreaterThan(8);
    expect(g.calls.some((c) => c.url.includes("/debug_token?input_token="))).toBe(true); // introspects ITS OWN token, GET only
    for (const c of g.calls) {
      expect(c.method).toBe("GET");
      expect(c.auth).toBe(`Bearer ${TOKEN}`);
      expect(c.url).toMatch(/^https:\/\/graph\.facebook\.com\/v25\.0\//);
      expect(new URL(c.url).pathname).not.toMatch(/\/(messages|message_templates|register|deregister|request_code|verify_code)/);
    }
    // debug_token needs the token as input_token (introspecting itself); it must never be written to the report
    const report = JSON.stringify(await runDiagnostics({ token: TOKEN, fetchImpl: fakeGraph().impl }));
    expect(report).not.toContain(TOKEN);
    expect(report).not.toContain("SECRETTAIL");
  });

  it("determines which WABA contains the test phone number, and which are listed under the business", async () => {
    const r = await runDiagnostics({ token: TOKEN, fetchImpl: fakeGraph().impl });
    const f = r.findings as Findings;
    expect(f.wabaContainingTestPhoneNumber).toBe("28205690265798365");
    expect(f.wabas["28205690265798365"].containsTestPhoneNumber).toBe(true);
    expect(f.wabas["1122901356778301"].containsTestPhoneNumber).toBe(false);
    expect(f.queriedWabaIdsListedUnderBusiness).toEqual({ "28205690265798365": true, "1122901356778301": false });
    expect(f.wabas["28205690265798365"].subscribedApps).toEqual([{ id: "1109659041650307", name: "BahaOS Staging" }]);
  });

  it("reports limitations instead of guessing when permissions are missing", async () => {
    const denied = { status: 403, body: { error: { message: "(#200) Requires whatsapp_business_management permission", code: 200 } } };
    const g = fakeGraph({ "/1122901356778301/phone_numbers": denied, "/1087227134067802": denied });
    const r = await runDiagnostics({ token: TOKEN, fetchImpl: g.impl });
    const f = r.findings as Findings;
    expect(f.wabas["1122901356778301"].containsTestPhoneNumber).toMatch(/unknown/);
    expect(f.businessNodeReadable).toBe(false);
    expect(r.limitations.join("\n")).toMatch(/403/);
  });

  it("a total network failure is recorded, not thrown", async () => {
    const r = await runDiagnostics({ token: TOKEN, fetchImpl: (async () => { throw new Error(`boom ${TOKEN}`); }) as unknown as typeof fetch });
    expect(r.requests.every((x) => x.status === "network_error")).toBe(true);
    expect(JSON.stringify(r)).not.toContain(TOKEN);
  });

  it("sanitize redacts tokens and masks phone numbers", () => {
    const s = JSON.stringify(sanitize({ display_phone_number: "+1 242 801 2847", note: `x ${TOKEN}`, access_token: "abc", nested: [{ recipient_id: "12428012847" }] }, TOKEN));
    expect(s).not.toContain(TOKEN);
    expect(s).not.toContain("access_token");
    expect(s).toContain("2847");
    expect(s).not.toContain("12428012847");
  });

  it("refuses any path outside the allow-list (no way to reach /messages)", async () => {
    // the allow-list is enforced inside get(); a crafted id list cannot smuggle a path segment
    await expect(runDiagnostics({ token: TOKEN, fetchImpl: fakeGraph().impl, ids: { ...DEFAULT_IDS, phoneNumberId: "1/messages" } })).rejects.toThrow(/refused/);
  });
});
