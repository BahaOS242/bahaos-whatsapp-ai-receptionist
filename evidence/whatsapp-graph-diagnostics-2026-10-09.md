# WhatsApp test-message failure — diagnostic report (2026-10-09)

**Status: Graph API requests NOT yet executed.** No Meta credential was supplied to this session (no Meta variables in its environment; the staging tokens existed only in the owner's own terminal and were deliberately not read from any file). Everything in "Confirmed facts" comes from evidence already captured; everything the Graph API would settle is under "Unknowns". Nothing here was sent, changed, submitted or deployed. No token, connection string or full personal phone number is recorded.

IDs under investigation: phone-number id `1403602129498088` (display +1 555-643-6134) · WABA candidates `28205690265798365` and `1122901356778301` · business portfolio `1087227134067802` · app `1109659041650307` (BahaOS Staging).

## A. Confirmed facts (source: captured payloads / owner screens / owner-run Graph calls, 2026-10-09)
| # | Fact | Source |
|---|---|---|
| A1 | Every captured webhook for the test number has `entry[0].id = 28205690265798365` and `metadata.phone_number_id = 1403602129498088` (`display_phone_number 15556436134`) — inbound `messages` (13:56, 14:06, 14:13) and the delivery receipts below. | Meta "Check test webhooks" payloads |
| A2 | Three captured delivery receipts (14:06:24, 14:08:52, 14:09:51 local) have `status: failed`, `errors[0].code = 131031`, `title/message = "Business Account locked"`, `error_data.details = "Business account has been locked."`; the same entry id and phone id as A1. | same |
| A3 | Those receipts carry an undocumented, Meta-internal block `internal_1p_only_data.account_context = { cs_id: 1403602129498088, pma_id: 28205690265798365, app_id: 1109659041650307, account_context_type: "paid_messaging" }`. Inbound customer messages instead carry `{ waac_id: 976876138795677, cs_id: 1403602129498088, account_context_type: "non_paid_messaging" }` and no `pma_id`. | same |
| A4 | The `account_update` webhook (12:20:50) has `entry[0].id = 28205690265798365`, `value.event = BUSINESS_VERIFICATION_NEEDED`, and **inside the payload** `waba_info.waba_id = 1122901356778301`, `owner_business_id = 1087227134067802`. So one payload names two different ids: the entry id (2820…) and the `waba_info.waba_id` (1122…). | same |
| A5 | Meta's "Try it out" page shows "WhatsApp Business account ID: 28205690265798365" with the test number and phone-number id `1403602129498088`. WhatsApp Manager shows "Test WhatsApp Business Account — Account Restricted — Before you can begin messaging, you will need to verify your business." | owner screens |
| A6 | A Graph call by the owner (`GET /v25.0/28205690265798365/subscribed_apps`, valid token) succeeded and listed only "WA DevX Webhook Events 1P App" (id 2202427980234937); after the owner's `POST` to the same path (`{"success":true}`) real messages began reaching our app. So id `2820…` is a node the token can read and subscribe an app to. | owner terminal |
| A7 | Meta displayed: "Your Business Manager (ID 1087227134067802) is currently under a restriction, which prevents access to WhatsApp Business Platform configurations and prevents the identification of associated app subscriptions." The exact request that produced this text was not captured. | owner paste |
| A8 | The failures at 14:06–14:13 coincide with the owner pressing Meta's own "Send message" button (template sends), i.e. `paid_messaging` context (A3). Our app's own text replies were accepted by Meta's send API (outbox `sent`, provider message ids saved) and **never arrived on the phone**; an attempt to a recipient not on the allowed list failed at send time with `131030`. | staging DB + owner report |
| A9 | The strings `HARD_LOCKED` and `presence` do **not** appear anywhere in our captured evidence. The only status wording seen is "Account Restricted", "Business Account locked", 131031, `BUSINESS_VERIFICATION_NEEDED`. | search of all evidence |

## B. Unknowns (what is NOT established)
- **B1. Which WABA actually contains phone number `1403602129498088`?** A1/A5 point to `2820…`, but no Graph response listing that WABA's phone numbers has been captured.
- **B2. What is `1122901356778301`, and how does it relate to `2820…`?** (A4 shows both in one payload.) It may be another WABA, a parent/related business-level object, or an identifier of a different kind; nothing captured says. Whether it contains the phone number is unknown.
- **B3. "Separate `presence` and `paid_messaging` accounts" (Meta AI's claim): UNVERIFIED.** Evidence shows only a differing `account_context_type` label (`paid_messaging` vs `non_paid_messaging`) inside an undocumented internal payload field, and an extra id `waac_id` on inbound messages. That is consistent with several explanations; it does not show two accounts, and the word "presence" never appears.
- **B4. "Business verification will remove a `HARD_LOCKED` status": UNVERIFIED.** `HARD_LOCKED` has not been observed anywhere. We have seen "Account Restricted … you will need to verify your business" (A5), which suggests verification is *requested*, but whether it clears the 131031 lock is not established by any evidence we hold.
- **B5. Meta's official definition of 131031.** I could not retrieve it (a web search returned no authoritative text). Do not infer its cause from the title.
- **B6.** Whether the delivery receipts for **our app's** text replies were `failed` with 131031 (the receipts for them were not captured; receipt recording was not deployed then).
- **B7.** Whether the restriction is account-level (WABA), business-level (portfolio), or both.

## C. Read-only Graph plan (GET only; v25.0) — tool: `scripts/staging/graph-diagnose.ts`
Allow-listed paths; token only in the `Authorization` header; output sanitised (tokens redacted, phone numbers masked); no sends, writes, or account changes; free tests prove it (`tests/staging/graph-diagnose.test.ts`: GET-only, path allow-list, token never in output, partial-permission and network-failure handling).
| Request | Settles |
|---|---|
| `GET /debug_token?input_token=[REDACTED]` | token type, scopes, expiry (read-only introspection of the same token) |
| `GET /1403602129498088?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status,platform_type,account_mode,status,is_official_business_account` | the phone number's own state (B1, B7) |
| for each WABA id: `GET /{waba}?fields=id,name,currency,timezone_id,account_review_status,business_verification_status,ownership_type,health_status,is_enabled_for_insights` | WABA review / verification / `health_status` (can-send flags and entity errors) (B2, B3, B4, B7) |
| for each WABA id: `GET /{waba}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,account_mode,status` | **which WABA contains the phone number** (B1) |
| for each WABA id: `GET /{waba}/subscribed_apps` | app subscriptions (confirms A6 for each id) |
| `GET /1087227134067802?fields=id,name,verification_status,two_factor_type,created_time` | portfolio verification status (B4, B7) |
| `GET /1087227134067802/owned_whatsapp_business_accounts` and `/client_whatsapp_business_accounts` (`fields=id,name,account_review_status,business_verification_status`) | whether each WABA id belongs to / is shared with the portfolio (B2) |
**Limitation:** the token needs `whatsapp_business_management` (WABA reads) and `business_management` (portfolio reads); a temporary API-setup token may lack the latter, and the Meta restriction itself may block some reads (A7). The tool records each failure verbatim (sanitised) instead of guessing.

## D. How to run (owner terminal; the token never enters the chat)
```
read -rs "WA_TOKEN?Meta access token (hidden): "; export WA_TOKEN; echo
npx tsx scripts/staging/graph-diagnose.ts --out ~/graph-diagnostics.json
unset WA_TOKEN
```
Then share the contents of `~/graph-diagnostics.json` (it contains no token; phone numbers are masked). This report will be updated with the real responses; until then B1–B7 stay open.

## E. Interpretation limits
- A2 proves Meta reported error 131031 for template sends made from Meta's console on this account. It does **not** by itself show the cause of the lock or what clears it.
- A4's two ids may be perfectly consistent (e.g. a related object); treat any theory about them as a hypothesis until the Graph listings (C) are read.
