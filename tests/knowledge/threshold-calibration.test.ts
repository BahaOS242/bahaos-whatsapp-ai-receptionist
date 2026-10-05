import { describe, expect, it } from "vitest";
import { HashingEmbedder } from "../../src/knowledge/embedding/hashing-embedder";
import { KnowledgeService } from "../../src/knowledge/knowledge-service";
import { InMemoryKnowledgeStore } from "../../src/knowledge/memory-store";
import { seedDemoKnowledge } from "../../src/knowledge/seed/demo-knowledge";
import { DEFAULT_THRESHOLDS, HASHING_EMBEDDER_THRESHOLDS, thresholdsFor } from "../../src/knowledge/thresholds";
import { BUSINESS, IDLE, TENANT_A } from "./helpers";
import { LABELED_QUESTIONS } from "./fixtures/labeled-questions";

/**
 * The evidence thresholds are MEASURED, not guessed. This test re-measures
 * them: it runs every labeled question with the thresholds disabled to read
 * the RAW top coverage/score, then asserts that the shipped operating
 * point sits in the clear gap between "answerable" and "must refuse".
 *
 * If this fails, someone changed text analysis/scoring (or the demo
 * corpus) enough to move the distributions — re-run the sweep, pick a new
 * midpoint in src/knowledge/thresholds.ts, and update the corpus of
 * labeled questions rather than loosening the margin.
 *
 * Set KNOWLEDGE_CALIBRATION_REPORT=1 to print the sweep.
 */
const MODEL = new HashingEmbedder().id;
const SHIPPED = thresholdsFor(MODEL);
const MARGIN_COVERAGE = 0.04;
const MARGIN_SCORE = 0.03;

async function rawMeasurements() {
  const service = new KnowledgeService({
    store: new InMemoryKnowledgeStore(),
    embedder: new HashingEmbedder(),
    cacheTtlMs: 0,
    thresholds: { minCoverage: 0, minScore: 0, vectorWeight: SHIPPED.vectorWeight },
  });
  await seedDemoKnowledge(service, BUSINESS, TENANT_A);
  const lookup = service.lookupFor({ tenantId: TENANT_A, business: BUSINESS });
  const rows = [];
  for (const item of LABELED_QUESTIONS) {
    const r = await lookup({ message: item.q, history: [], context: IDLE });
    if (!r.consulted) continue; // gate skips are covered by the gate tests
    rows.push({ item, coverage: r.topCoverage, score: r.topScore, top: r.considered[0]?.documentKey ?? "" });
  }
  return rows;
}

describe("evidence threshold calibration (measured on the labeled set)", () => {
  it("the shipped operating point separates answerable from must-refuse with margin", async () => {
    const rows = await rawMeasurements();
    const refuse = rows.filter((r) => r.item.kind === "refuse");
    const answerable = rows.filter((r) => r.item.kind === "answerable" && r.item.expect!.includes(r.top));
    expect(refuse.length).toBeGreaterThanOrEqual(15);
    expect(answerable.length).toBeGreaterThanOrEqual(25);

    const maxRefuseCoverage = Math.max(...refuse.map((r) => r.coverage));
    const maxRefuseScore = Math.max(...refuse.map((r) => r.score));
    // Answerable questions the engine is able to ground at all:
    const passing = answerable.filter((r) => r.coverage >= SHIPPED.minCoverage && r.score >= SHIPPED.minScore);
    const minPassingCoverage = Math.min(...passing.map((r) => r.coverage));
    const minPassingScore = Math.min(...passing.map((r) => r.score));

    if (process.env.KNOWLEDGE_CALIBRATION_REPORT) {
      console.info({ maxRefuseCoverage, maxRefuseScore, minPassingCoverage, minPassingScore, shipped: SHIPPED, answerable: answerable.length, passing: passing.length });
    }

    // 1. NOTHING that must be refused can pass, and with room to spare.
    expect(maxRefuseCoverage + MARGIN_COVERAGE).toBeLessThan(SHIPPED.minCoverage);
    expect(maxRefuseScore + MARGIN_SCORE).toBeLessThan(SHIPPED.minScore);
    // 2. The thresholds are not so high that they sit on top of real answers.
    expect(SHIPPED.minCoverage + MARGIN_COVERAGE).toBeLessThan(minPassingCoverage);
    expect(SHIPPED.minScore + MARGIN_SCORE / 2).toBeLessThan(minPassingScore);
  });

  it("recall at the shipped point is high on answerable questions and fabrication leakage is zero", async () => {
    const rows = await rawMeasurements();
    let recalled = 0;
    let answerableCount = 0;
    let leaked = 0;
    for (const r of rows) {
      const passes = r.coverage >= SHIPPED.minCoverage && r.score >= SHIPPED.minScore;
      if (r.item.kind === "answerable") {
        answerableCount += 1;
        if (passes && r.item.expect!.includes(r.top)) recalled += 1;
      } else if (passes) leaked += 1;
    }
    expect(leaked).toBe(0);
    expect(recalled / answerableCount).toBeGreaterThanOrEqual(0.9);
  });

  it("the near-miss that motivated the coverage requirement is actually below it", async () => {
    // "pediatric root canals": every word EXISTS in the knowledge base
    // (children, root canal) but the COMBINATION does not.
    const rows = await rawMeasurements();
    const near = rows.find((r) => r.item.q === "do you offer pediatric root canals")!;
    expect(near.coverage).toBeLessThan(SHIPPED.minCoverage);
    expect(near.coverage).toBeGreaterThan(0.4); // it genuinely looks relevant — that is the point
  });
});

describe("threshold policy for models that have not been calibrated", () => {
  it("an unknown embedding model gets STRICTER limits than the calibrated one, never looser", () => {
    const unknown = thresholdsFor("some-new-model:v9");
    expect(unknown).toBe(DEFAULT_THRESHOLDS);
    expect(unknown.minCoverage).toBeGreaterThan(HASHING_EMBEDDER_THRESHOLDS.minCoverage);
    expect(unknown.minScore).toBeGreaterThan(HASHING_EMBEDDER_THRESHOLDS.minScore);
    expect(thresholdsFor(null)).toBe(DEFAULT_THRESHOLDS);
    expect(thresholdsFor("hash-v1-512")).toBe(HASHING_EMBEDDER_THRESHOLDS);
  });
});
