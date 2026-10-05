import type { BusinessContext } from "../ai/types";
import { formatCents, parseMoneyCents, type ClaimSubject } from "./claims";
import type { KnowledgeClaim, StructuredFact } from "./types";

/**
 * Authority tier 2: facts derived from structured business configuration.
 *
 * These are READ from BusinessContext (the existing home of services,
 * prices, hours, policies) on every lookup — never copied into the
 * knowledge tables. One source of truth means a price edited in
 * configuration is instantly the price the receptionist quotes; there is
 * no stale duplicate to drift out of sync.
 */

export function serviceSubjects(business: BusinessContext): ClaimSubject[] {
  return business.services.map((service) => {
    const lower = service.name.toLowerCase();
    const names = new Set<string>([lower]);
    // "Routine cleaning" is also said as "cleaning(s)"; "Dental
    // consultation / basic exam" as "consultation", "exam".
    for (const part of lower.split(/\s*\/\s*|\s+or\s+/)) names.add(part.trim());
    const words = lower.split(/[^a-z]+/).filter((w) => w.length > 3 && !["routine", "basic", "dental"].includes(w));
    for (const w of words) {
      names.add(w);
      if (!w.endsWith("s")) names.add(`${w}s`);
    }
    names.add(service.id.replace(/_/g, " "));
    return { id: service.id, names: [...names].filter((n) => n.length > 2) };
  });
}

export function buildStructuredFacts(business: BusinessContext): StructuredFact[] {
  const facts: StructuredFact[] = [];

  for (const service of business.services) {
    const claims: KnowledgeClaim[] = [];
    const cents = parseMoneyCents(service.priceLabel);
    if (cents !== undefined) {
      claims.push({ subject: `service:${service.id}`, attribute: "price", value: String(cents), display: formatCents(cents) });
    }
    claims.push({
      subject: `service:${service.id}`,
      attribute: "duration",
      value: String(service.durationMinutes),
      display: `${service.durationMinutes} minutes`,
    });
    facts.push({
      key: `service:${service.id}`,
      title: service.name,
      text: `${service.name} costs ${service.priceLabel} and takes about ${service.durationMinutes} minutes.`,
      claims,
    });
  }

  facts.push({
    key: "services:list",
    title: "Services offered",
    text: `Services offered: ${business.services.map((s) => `${s.name} (${s.priceLabel})`).join(", ")}.`,
    claims: [],
  });
  facts.push({
    key: "hours",
    title: "Business hours",
    // Per-day lines too, so "are you open on Saturday?" has a fact that
    // actually names Saturday. (The machine-checked hours used for
    // booking validation remain business.weeklyHours — this is wording.)
    text: `Business hours: ${business.hours}. ${(Object.entries(business.weeklyHours) as Array<[string, { open: string; close: string } | null]>)
      .map(([day, h]) => `${day}: ${h ? `${h.open}–${h.close}` : "closed"}.`)
      .join(" ")}`,
    claims: [],
  });
  facts.push({
    key: "location",
    title: "Location and address",
    text: `${business.name} is located at ${business.address}.`,
    claims: [],
  });
  facts.push({
    key: "policy:insurance",
    title: "Insurance",
    text: `Insurance: ${business.policies.insurance}`,
    claims: [],
  });
  facts.push({
    key: "policy:new_patients",
    title: "New patients",
    text: `New patients: ${business.policies.newPatientInfo}`,
    claims: [],
  });
  facts.push({
    key: "policy:cancellation",
    title: "Cancellation policy",
    text: `Cancellation policy: appointments can be cancelled up to ${business.policies.cancellationCutoffHours} hours before the scheduled time.`,
    claims: [
      {
        subject: "policy:cancellation",
        attribute: "notice_hours",
        value: String(business.policies.cancellationCutoffHours),
        display: `${business.policies.cancellationCutoffHours} hours`,
      },
    ],
  });
  facts.push({
    key: "policy:emergency",
    title: "Emergency policy",
    text: `Emergency policy: ${business.policies.emergencyPolicy}`,
    claims: [],
  });
  return facts;
}
