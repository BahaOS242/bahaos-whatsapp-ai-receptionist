import { describe, expect, it } from "vitest";
import { BAHAMAS_DENTAL_SERVICE as BUSINESS } from "../../src/ai/business-context";
import { extractCandidates } from "../../src/memory/extractor";

const kv = (m: string) => extractCandidates(m, BUSINESS).candidates.map((c) => `${c.kind}:${c.slot}=${c.value}`);

/** Release-audit regressions: adversarial and ordinary phrasing (incl. Bahamian English, code-switching). */
describe("audit: forget / privacy-directive wording is never stored as a memory", () => {
  it.each([
    "Forget that I prefer mornings.",
    "Please forget my name is Alicia",
    "Don't remember my name",
    "Do not save that I prefer afternoon appointments",
    "Stop remembering things about me",
    "That's not my preference anymore, I prefer mornings",
    "I no longer prefer morning appointments",
    "Delete what you know about me, my name is Bob",
  ])("%s", (m) => expect(kv(m)).toEqual([]));
});

describe("audit: ordinary phrasing must not become a profile fact", () => {
  it.each([
    ["call me later", "Please call me later"],
    ["call me back", "call me back please"],
    ["call me asap", "Call me ASAP"],
    ["call me on this number", "Call me on this number"],
    ["call me whenever", "Can someone call me whenever they can"],
    ["lowercase call me + adverb", "please call me now"],
  ])("%s", (_l, m) => expect(kv(m)).toEqual([]));

  it.each([
    ["clinical treatment: root canal", "I'm interested in a root canal"],
    ["clinical treatment: filling", "I'm interested in getting a filling"],
    ["third party, Bahamian English", "Mi daughter does prefer morning appointments"],
    ["third party, 'me wife'", "Me wife prefer afternoon appointments"],
    ["Spanish symptom alongside preference", "I prefer mornings porque tengo dolor de muela"],
    ["Spanish medication", "My name is Rosa y tomo medicina para la presión"],
    ["Haitian Creole pain", "I prefer mornings, mwen gen doulè nan dan"],
    ["hypothetical", "If I could choose I would prefer mornings"],
    ["hypothetical 2", "What if I preferred evenings"],
    ["wish", "I wish I could prefer afternoons"],
    ["identity number", "My name is Alicia and my SSN is 123-45-6789"],
    ["card number", "I prefer mornings, my credit card number is 4111 1111 1111 1111"],
  ])("%s", (_l, m) => expect(kv(m)).toEqual([]));

  it("a safe fact survives in a message whose OTHER sentence is sensitive", () => {
    expect(kv("My name is Alicia. I have diabetes.")).toEqual(["preferred_name:name=Alicia"]);
    expect(kv("I prefer morning appointments. My tooth hurts and there is swelling.")).toEqual(["scheduling_preference:time_of_day=morning"]);
  });

  it("still accepts ordinary explicit statements (no over-blocking of the documented examples)", () => {
    expect(kv("My name is Alicia")).toEqual(["preferred_name:name=Alicia"]);
    expect(kv("Please call me Ms. Johnson")).toEqual(["preferred_name:name=Ms. Johnson"]);
    expect(kv("I prefer speaking Spanish")).toEqual(["preferred_language:language=es"]);
    expect(kv("I'm interested in a routine cleaning")).toEqual(["service_interest:service:cleaning=cleaning"]);
    expect(kv("I'm interested in a dental consultation")).toEqual(["service_interest:service:consultation=consultation"]);
  });
});
