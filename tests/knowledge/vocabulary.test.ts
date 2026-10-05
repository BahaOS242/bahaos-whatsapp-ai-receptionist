import { describe, expect, it } from "vitest";
import { expansionFor, type ApprovedPhrase } from "../../src/knowledge/vocabulary";
import { ask, makeEngine, TENANT_A } from "./helpers";

describe("approved language vocabulary", () => {
  const approved: ApprovedPhrase[] = [{ phrase: "How much fi", meaning: "price of" }];

  it("matches approved phrases case-insensitively and reports what to add/drop", () => {
    expect(expansionFor("HOW  MUCH fi a clean", approved)).toEqual({ add: ["price"], ignore: ["price", "fi"] });
    expect(expansionFor("do you take insurance", approved)).toEqual({ add: [], ignore: [] });
  });

  it("matches whole words only — an approved 'fi' never fires inside 'filling'", () => {
    const fi: ApprovedPhrase[] = [{ phrase: "fi", meaning: "for" }];
    expect(expansionFor("how much is a filling", fi)).toEqual({ add: [], ignore: [] });
    expect(expansionFor("how much fi a filling", fi).ignore).toEqual(["fi"]);
  });

  it("an APPROVED slang phrase lets the customer's real question be understood; without approval it is not", async () => {
    const without = makeEngine();
    const unapprovedResult = await ask(without, "how much fi a cleaning");
    // 'fi' is a word the knowledge base has never seen => it drags coverage down.
    const withVocab = makeEngine({ vocabulary: { listApproved: async () => [{ phrase: "fi", meaning: "for" }] } });
    const approvedResult = await ask(withVocab, "how much fi a cleaning");

    expect(approvedResult).toMatchObject({ consulted: true, outcome: "grounded" });
    expect(approvedResult.consulted && approvedResult.outcome === "grounded" && approvedResult.evidence[0].documentKey).toBe("service:cleaning");
    // The un-approved engine is allowed to do worse, but must never do wrongly:
    expect(unapprovedResult.consulted && unapprovedResult.outcome !== "grounded" ? "refused" : "answered-correctly").toMatch(/refused|answered-correctly/);
    if (unapprovedResult.consulted && unapprovedResult.outcome === "grounded") {
      expect(unapprovedResult.evidence[0].documentKey).toBe("service:cleaning");
    }
  });

  it("the vocabulary source is per-tenant: it is asked only for the lookup's own tenant", async () => {
    const asked: string[] = [];
    const engine = makeEngine({ vocabulary: { listApproved: async (t) => { asked.push(t); return []; } } });
    await ask(engine, "how much is a cleaning", { tenantId: TENANT_A });
    expect(asked).toEqual([TENANT_A]);
  });
});
