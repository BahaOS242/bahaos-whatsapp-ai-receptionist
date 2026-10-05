/**
 * Labelled evaluation set for the evidence threshold. Run against the demo
 * corpus (src/knowledge/seed/demo-knowledge.ts) + BAHAMAS_DENTAL_SERVICE.
 *
 *   answerable — the knowledge base DOES establish the answer; the engine
 *                must ground it, citing `expect`.
 *   refuse     — the knowledge base does NOT establish the answer; the
 *                engine must return no_evidence (never a plausible-looking
 *                near-miss).
 *
 * `expect` is a documentKey (a stored document) or a structured fact key.
 * Includes paraphrases — the point of retrieval — and deliberate near
 * misses (same topic words, missing the specific thing asked), which are
 * what a similarity-only threshold would wrongly answer.
 */
export interface LabeledQuestion {
  q: string;
  kind: "answerable" | "refuse";
  /** Any of these sources is an acceptable top citation. */
  expect?: string[];
  note?: string;
}

export const LABELED_QUESTIONS: LabeledQuestion[] = [
  // --- structured configuration (services / hours / location / policies)
  { q: "How much is a cleaning?", kind: "answerable", expect: ["service:cleaning"] },
  { q: "what does a filling cost", kind: "answerable", expect: ["service:filling"] },
  { q: "price of a root canal", kind: "answerable", expect: ["service:root_canal"] },
  { q: "how much for the consultation", kind: "answerable", expect: ["service:consultation"] },
  { q: "How long does a cleaning take?", kind: "answerable", expect: ["service:cleaning"] },
  { q: "how long is a root canal appointment", kind: "answerable", expect: ["service:root_canal"] },
  { q: "Do you take insurance?", kind: "answerable", expect: ["policy:insurance"] },
  { q: "do you accept dental insurance", kind: "answerable", expect: ["policy:insurance"] },
  { q: "will my insurance cover a filling", kind: "answerable", expect: ["policy:insurance"] },
  { q: "Where are you located?", kind: "answerable", expect: ["location"] },
  { q: "what's your address", kind: "answerable", expect: ["location"] },
  { q: "what are your hours", kind: "answerable", expect: ["hours"] },
  { q: "what time do you close", kind: "answerable", expect: ["hours"] },
  { q: "are you open on saturday", kind: "answerable", expect: ["hours"] },
  { q: "do you take new patients", kind: "answerable", expect: ["policy:new_patients"] },
  { q: "what do you do for a dental emergency", kind: "answerable", expect: ["policy:emergency"] },
  { q: "what services do you offer", kind: "answerable", expect: ["services:list"] },

  // --- stored documents
  { q: "What's your cancellation policy?", kind: "answerable", expect: ["cancellation-policy", "policy:cancellation"] },
  { q: "what happens if I cancel", kind: "answerable", expect: ["cancellation-policy", "policy:cancellation"] },
  { q: "how much notice do I need to give to cancel", kind: "answerable", expect: ["cancellation-policy", "policy:cancellation"] },
  { q: "what if I miss my appointment", kind: "answerable", expect: ["cancellation-policy"] },
  { q: "What should I bring to my first appointment?", kind: "answerable", expect: ["first-visit"] },
  { q: "what do I need to bring", kind: "answerable", expect: ["first-visit"] },
  { q: "how early should I arrive", kind: "answerable", expect: ["first-visit"] },
  { q: "how can I pay", kind: "answerable", expect: ["payment-methods"] },
  { q: "do you take credit cards", kind: "answerable", expect: ["payment-methods"] },
  { q: "can I pay with visa", kind: "answerable", expect: ["payment-methods"] },
  { q: "do you accept cash", kind: "answerable", expect: ["payment-methods"] },
  { q: "is there parking", kind: "answerable", expect: ["parking-and-access"] },
  { q: "where can I park", kind: "answerable", expect: ["parking-and-access"] },
  { q: "is the office wheelchair accessible", kind: "answerable", expect: ["parking-and-access"] },
  { q: "do you see children", kind: "answerable", expect: ["patients-of-all-ages"] },
  { q: "can I bring my kid", kind: "answerable", expect: ["patients-of-all-ages"] },

  // --- must refuse: nothing in the knowledge base establishes it
  { q: "do you offer pediatric root canals", kind: "refuse", note: "near miss: root canal + children both exist, the combination does not" },
  { q: "do you do orthodontics", kind: "refuse" },
  { q: "do you offer invisalign", kind: "refuse" },
  { q: "do you do teeth whitening", kind: "refuse", note: "not among the services" },
  { q: "do you do dental implants", kind: "refuse" },
  { q: "do you offer sedation", kind: "refuse" },
  { q: "do you take bitcoin", kind: "refuse", note: "near miss: payment methods exist, bitcoin is not one" },
  { q: "do you have a payment plan", kind: "refuse", note: "near miss: payment topic" },
  { q: "how much is a crown", kind: "refuse", note: "near miss: price topic, crown is not a service" },
  { q: "who is the dentist", kind: "refuse" },
  { q: "do you offer a senior discount", kind: "refuse" },
  { q: "do you speak spanish", kind: "refuse" },
  { q: "do you offer weekend appointments", kind: "refuse", note: "hours exist; weekend appointments are not stated" },
  { q: "what brand of toothpaste do you recommend", kind: "refuse" },
  { q: "do you have a loyalty program", kind: "refuse" },
  { q: "what is the wifi password", kind: "refuse" },
  { q: "is there free parking for motorcycles", kind: "refuse", note: "near miss: parking exists, motorcycles not stated" },
  { q: "do you do cosmetic veneers", kind: "refuse" },
];
