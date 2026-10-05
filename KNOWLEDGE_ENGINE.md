# BahaOS Knowledge / RAG Engine (Phase 1)

> **The AI interprets the customer. The knowledge base supplies business facts.
> The application determines what is actually true.**

This engine lets the receptionist answer business-specific questions ("what
should I bring?", "what's your cancellation policy?") from the business's own,
human-approved knowledge — and **refuse honestly** when that knowledge does not
establish the answer. It is an *addition* to the existing receptionist, not a
rewrite: the deterministic conversation, booking, scheduling, confirmation,
recurrence, reschedule, simulator, Meta-webhook and language-observation
architecture is untouched.

It is **off by default** (`KNOWLEDGE_ENABLED=false`). With it off, the system
behaves exactly as before it existed.

---

## 1. What RAG is and is not allowed to decide

| Question | Source of truth | Can RAG answer it? |
|---|---|---|
| "How much is a cleaning?" | structured config (`BusinessContext` / services) | grounds on it, never overrides it |
| "What should I bring?" / "cancellation policy?" / "do you take cash?" | approved knowledge documents | **yes** |
| "Can I come Thursday at 3?" / "anything available tomorrow?" | calendar + booking engine | **never** |
| availability, conflicts, booking/cancel/reschedule, recurrence, hours *enforcement*, customer identity, confirmation, DB state | the application | **never** |

The query gate (`src/knowledge/query-gate.ts`) draws this line deterministically
*before* any embedding or retrieval happens. Scheduling messages never reach it.

## 2. Authority hierarchy

Lower tiers can **never** override higher ones (`src/knowledge/authority.ts`):

1. **Application / database truth** — appointments, calendar, customers. Not knowledge; there is no code path by which retrieval can read or answer from it.
2. **`structured_config`** — `BusinessContext`: services, prices, durations, hours, address, insurance/cancellation policy. Read live on every lookup, **never copied** into the knowledge tables (so there is no stale duplicate to drift).
3. **`human_approved`** — a named person wrote or signed off on it.
4. **`approved_document`** — an approved uploaded/imported document.
5. **`unreviewed`** — stored (drafts, future crawls) but **never** served to a customer, and cannot be approved.
6. **LLM general knowledge** — never a source of business facts. The model is told to answer only from tiers 2–4 and a post-check enforces it.

### Conflicts (`src/knowledge/conflicts.ts`)
Documents and configuration carry deterministic **claims** (`service:cleaning` /
`price` = `12500`; `policy:cancellation` / `notice_hours` = `2`), extracted
conservatively (precision over recall — a false conflict makes the receptionist
refuse a correct answer). When two sources disagree about the same
(subject, attribute):

* exactly one value backed by the strictly highest authority → **`authority_wins`**.
  Config says $125, a document says $100 → the customer hears $125; the document's
  chunk is withheld from the model and $100 is added to the *forbidden amounts*.
* the top authority is itself split (two approved documents: $500 vs $650) →
  **`needs_confirmation`**: nobody wins, the model is **not asked**, the customer
  hears "different details in our records… I can have someone confirm."
* Either way the disagreement is persisted (`knowledge_conflicts`, deduplicated by
  signature, with a detection counter) so the operator sees it — at approval time
  *and* whenever a customer trips over it. Fixing the source auto-closes it.

Stale knowledge: a new approved version supersedes the old one atomically (the DB
allows at most one approved version per `(tenant, docKey)`); `expires_at` /
`effective_at` are honoured at read time.

## 3. Architecture

```
 customer message
        │
        ▼
 ReceptionistAgent ── binds a TENANT-SCOPED lookup onto the request ──┐
        │                                                              │
        ▼                                                              │
 AIProvider (LLMProvider | DevRuleBasedAIProvider)                     │
   deterministic extraction / state machine (unchanged)                │
        │                                                              │
        ├─ query gate: is this a knowledge question? ──no──► existing flow (unchanged)
        │                                                              │
        └─yes─► request.knowledge(...) ◄───────────────────────────────┘
                     │
        KnowledgeService.lookup
          contextualize ("and what about root canal") · strip contact details
          · approved-only vocabulary expansion
                     │
        Retriever (tenant-scoped)
          candidates = structured facts (tier 2) + approved chunks (tiers 3-4)
          score = IDF-weighted COVERAGE blended with vector similarity
          conflict analysis over the whole approved base
          threshold  ──► grounded │ no_evidence │ conflict
                     │
   grounded ─► evidence in a nonce-delimited, JSON-encoded UNTRUSTED block ─► LLM
   no_evidence / conflict ─► deterministic reply, LLM NOT called, gap recorded
                     │
        answer guard: any price the app can't account for ⇒ reply replaced
```

* `src/knowledge/` — the engine (types, authority, text analysis, chunker, parsers, claims, injection, embeddings, stores, ingestion, retriever, conflicts, gate, prompt, guard, service, telemetry, demo seed).
* `src/db/knowledge-store.ts`, `knowledge-vocabulary.ts` — Postgres store, approved-only vocabulary reader, operator gap recorder.
* Integration points (all optional, absent by default): `AIProviderRequest.knowledge` / `.tenantId`, `AIProviderResponse.knowledgeGap`, `ReceptionistAgent`'s 4th constructor argument, `PersistedConversationManager.buildRequest`, `createKnowledgeService`.

## 4. Data model (migration `0007_knowledge_engine`)

`knowledge_sources` · `knowledge_documents` (versioned, status, authority, content hash, effective/expiry, approver) · `knowledge_chunks` (section, content, **claims**, injection flag, **embedding + embedding model**) · `knowledge_conflicts` · `knowledge_retrieval_logs`. Operator gap records reuse `audit_events`. Consolidations: embeddings live on the chunk row; "KnowledgeArticle / structured entry" is a document of type `faq`/`policy`/`article` (an FAQ pair is a single atomic chunk); structured config stays in configuration.

Status lifecycle: `draft → pending_review → approved → superseded` (or `rejected` / `archived`). **Ingestion never approves.** Approval requires a named human (`approvedBy`).

Embeddings are `real[]` — **`pgvector` is not installed** in this environment. Similarity is computed in-process over a tenant's *eligible* chunks (cached, TTL 15s, invalidated on ingest/approve). Fine for a clinic's corpus (hundreds–low thousands of chunks); see Limitations.

## 5. Retrieval and the evidence threshold

Similarity alone is **not** evidence. Each candidate gets:

* **coverage** — the IDF-weighted share of the query's *informative* terms that this one piece of evidence contains (stopwords, filler, and a small reviewed synonym table are normalised first). "do you offer *pediatric root canals*" against the root-canal fact covers `root`+`canal` but not `pediatric` → coverage 0.615, **refused**, even though it "looks" relevant. Best *single* chunk must cover the question, so two facts can't be stitched into a claim neither makes.
* **vector similarity** blended in (weight per embedding model).

Thresholds are **measured, not guessed** (`tests/knowledge/threshold-calibration.test.ts`, 52 labelled questions incl. deliberate near-misses). For the offline hashing embedder:

| | coverage | score |
|---|---|---|
| highest value among questions that **must be refused** | 0.615 | 0.584 |
| **shipped threshold** | **0.68** | **0.63** |
| lowest value among answerable questions that pass | 0.746 | 0.685 |

Result on the labelled set: **0 of 18 must-refuse questions answered**; 30 of 31 answerable questions grounded on the correct source (the remainder fail *safe*: compound questions spanning two facts are refused, not guessed). The test fails if the margin erodes. **An uncalibrated model gets strict defaults** (0.80 / 0.70). A real embedding model must be re-calibrated before its thresholds are relaxed.

## 6. No-evidence behaviour

If the threshold isn't met (or the lookup itself errors — it **fails closed**), the model is **not called**. The reply is fixed:

> "I don't have that information available right now. I can have someone from the office confirm that for you."

It does not claim anyone was contacted, does not escalate or lock the conversation (that remains the customer's choice via the existing "talk to someone" flow), preserves the whole booking state, and — mid-booking — invites the customer back to it. A redacted record of the question is written to `audit_events` (`knowledge.gap`) for the operator.

## 7. Prompt-injection defence (four independent layers)

Retrieved text is **untrusted data**: it may state facts; it may never change system rules, safety rules, booking rules, tool permissions or tenant boundaries.

1. **Neutralize** — instruction-like *sentences* are replaced by a marker at ingestion (facts in the same document survive) and again at read time, so a row that bypassed ingestion is still inert. A document that needed this is **quarantined** (`pending_review`); approving it requires `acknowledgeQuarantine`, i.e. a human looked at what was removed.
2. **Contain** — evidence reaches the model only inside `===== BEGIN/END RETRIEVED BUSINESS KNOWLEDGE [nonce] =====` placed *after* the application rules; the nonce is random per request (a document can't forge its own END marker); every evidence text is **JSON-encoded** on a single line.
3. **Instruct** — the model is told plainly what the block is and that nothing in it can alter rules, tools or booking state.
4. **Verify** — independent of what the model does, `answer-guard.ts` rejects a reply containing a price the application can't account for (hallucinated, from a losing source, or coaxed out by an injected document) or any fragment of our prompt, and substitutes the refusal. Booking actions are still gated by the existing hard confirmation gate — a document cannot book anything.

## 8. Tenant isolation (five layers)

1. The lookup a provider receives is **bound to one tenant at construction** — there is no tenant argument to change.
2. Every `KnowledgeStore` method takes a `tenantId` and filters on it (both implementations pass one shared contract test).
3. **Composite foreign keys** `(tenant_id, document_id)` / `(tenant_id, source_id)` make cross-tenant rows *unrepresentable* in Postgres.
4. The retriever independently drops (and raises `tenant_violation` for) any chunk whose tenant differs from the bound tenant.
5. With **no tenant known**, only structured configuration is consulted — a tenant is never guessed.

## 9. Language observations

The existing lifecycle (`observed → customer_confirmed → repeated → approved`) is unchanged. The knowledge engine sits at its very end and reads **only `approved`** rows (filtered in SQL), only for the asking tenant, only to understand slang (an approved phrase's words are swapped for its meaning in the *query*). It **never writes** to `language_observations`, and nothing promotes anything automatically. Tested against Postgres: observed / confirmed / repeated / rejected rows have no effect, and a battery of lookups, refusals and gap records leaves the table byte-identical.

## 10. When retrieval runs (performance)

Not on `yes`/`no`/names/times/phone numbers answering a question, not on any confirmation turn, not on scheduling/availability requests, not on meta questions ("are you a robot?"), not on statements. In the 168-turn existing evaluation corpus the engine performed **0** lookups; in a 16-turn mixed transcript it embedded the query exactly for the 4 genuine knowledge questions.

## 11. Observability

One JSON line per event, ids/counts/scores only — never the message or document text: `knowledge_query` (hash + length only), `knowledge_skipped` (reason), `retrieval_started`, `retrieval_completed`, `documents_retrieved`, `top_score`, `no_evidence`, `knowledge_conflict`, `grounded_response`, `knowledge_escalation`, plus `answer_guard_blocked`, `tenant_violation`, `embedding_failed`. "Why did it say that?" → `knowledge_retrieval_logs` (redacted query, outcome, per-evidence source/version/chunk/authority/score/snippet).

## 12. Operating it

```bash
# enable (and, for Postgres storage, DB_BOOKING_ENABLED=true + migration 0007)
KNOWLEDGE_ENABLED=true
# optional real embeddings (Voyage AI). Absent => offline hashing embedder.
VOYAGE_API_KEY=...            # never commit

DATABASE_URL=... npx drizzle-kit migrate           # applies 0007
npm run knowledge -- seed-demo                     # demo corpus (placeholders, like the rest of the demo tenant)
npm run knowledge -- ingest ./policy.md --key cancellation-policy --title "Cancellation Policy" --type policy --authority human_approved
npm run knowledge -- list --status pending_review
npm run knowledge -- approve <documentId> --by "Dr. Rolle" [--ack-quarantine]
npm run knowledge -- conflicts
npm run knowledge -- ask "what should I bring?"
npm run knowledge -- why <conversationId>
npm run chat                                       # KNOWLEDGE_ENABLED=true seeds an in-memory demo corpus
```

## 13. Known limitations (honest)

* **No `pgvector`.** Similarity is in-process; fine at clinic scale, not at thousands of tenants × thousands of chunks. Phase 2: `vector` column + HNSW.
* **The default embedder is lexical-shaped**, not semantic. Paraphrase recall relies on the reviewed synonym table. A real model (Voyage client included) needs its own calibration; **the Voyage client has only been exercised against a mocked `fetch`, never the live API.** OpenAI is intentionally not an option (standing project constraint).
* **PDF/DOCX parsing is not built in** — rejected with a clear error unless a parser is registered (`registerDocumentParser`). Text, Markdown, HTML and FAQ-JSON are supported. No website crawler (by design this phase).
* **Compound questions that need two facts** ("will my insurance cover a *filling*?") are refused, not stitched together — deliberately: stitching is how "pediatric root canal" would be answered.
* **Claim extraction is conservative**: only price, duration and cancellation-notice for known services; other disagreements (e.g. two documents giving different parking details) are not auto-detected.
* Currency is compared numerically (BSD is pegged 1:1 to USD); a non-pegged tenant would need a currency on the claim.
* The in-process chunk cache means a change made by *another* process is seen within `cacheTtlMs` (15 s).
* `webhook` turns hold a transaction connection while a lookup uses another; at pool exhaustion this inherits an existing characteristic of the tools layer (pool max is the `pg` default of 10).
* The LLM path still adopts a booking *intent* from the deterministic extractor when a knowledge question merely contains the word "appointment" (pre-existing behaviour, unchanged).
* The knowledge **admin UI** is a later phase; the CLI is the seed/import mechanism.

## 14. Phase 2 suggestions

`pgvector` + HNSW; PDF/DOCX extraction; operator UI (review queue, conflict inbox, "why" viewer); per-tenant business configuration in the database (today's single demo `BusinessContext` is still in code); real-embedding calibration and a semantic-coverage path; scheduled re-embedding when the model changes; website crawler feeding `unreviewed` → review; promotion of *approved* language observations into reviewed knowledge drafts.
