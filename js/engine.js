/**
 * engine.js
 * ---------------------------------------------------------------------------
 * The "brain" of the demo receptionist, kept deliberately separate from the
 * chat UI (chat.js) and from the DOM entirely. This is a rule-based intent
 * matcher + a small stage-based state machine for the booking flow.
 *
 * IMPORTANT — This is a PORTFOLIO DEMO:
 *   - No messages leave the browser. There is no WhatsApp Business API call,
 *     no LLM API call, and no database write.
 *   - "Appointments", "cancellations" and "leads" are only ever written to
 *     in-memory state (this.state) so the UI can render a realistic
 *     confirmation. Nothing is persisted or sent anywhere.
 *   - The `BUSINESS_KNOWLEDGE` object below stands in for the "Business
 *     Knowledge" box in the architecture diagram. In production this would
 *     be loaded per-tenant from a database/CMS instead of hardcoded here.
 * ---------------------------------------------------------------------------
 */

const BUSINESS_KNOWLEDGE = {
  name: "BrightSmile Dental",
  hours: "Monday–Friday 8:00 AM–6:00 PM, Saturday 9:00 AM–2:00 PM. Closed Sundays.",
  location: "142 Bay Street, Nassau (5 minutes from Bay Street & Elizabeth Ave).",
  insurance: "We accept most major dental insurance plans, plus in-house financing for larger treatment plans.",
  payment: "Cash, card, and financing through CareCredit. Payment is due at time of service unless a plan is arranged.",
  newPatientInfo: "New patients get a free consultation plus a full exam and x-rays at the first visit.",
  emergency: "We hold same-day emergency slots every weekday — mention it's urgent and we'll get you seen first.",
  services: [
    { id: "cleaning", label: "Dental cleaning", blurb: "A routine cleaning and polish, ~45 minutes.", price: "$120" },
    { id: "whitening", label: "Teeth whitening", blurb: "In-office whitening, visible results same day.", price: "$250" },
    { id: "exam", label: "Dental exam", blurb: "Full check-up with x-rays if needed.", price: "$90" },
    { id: "filling", label: "Fillings", blurb: "Tooth-colored composite fillings.", price: "from $150" },
    { id: "crown", label: "Crowns", blurb: "Custom crowns, usually 2 visits.", price: "from $900" },
    { id: "emergency", label: "Emergency visit", blurb: "Same-day pain relief and diagnosis.", price: "$140" },
  ],
};

// Every one of these is demo/sample business data, not a real clinic.
const DEMO_DISCLAIMER = "(demo business info)";

function normalize(text) {
  return text.toLowerCase().trim();
}

function matchAny(text, patterns) {
  return patterns.some((p) => text.includes(p));
}

function pickService(text) {
  return BUSINESS_KNOWLEDGE.services.find((s) =>
    text.includes(s.id) || text.includes(s.label.toLowerCase())
  );
}

// Very light date/time extraction — good enough for a scripted demo,
// not a real NLP date parser.
function extractDate(text) {
  const patterns = [
    "today", "tomorrow", "monday", "tuesday", "wednesday", "thursday",
    "friday", "saturday", "sunday",
  ];
  const found = patterns.find((p) => text.includes(p));
  if (found) return found[0].toUpperCase() + found.slice(1);
  const m = text.match(/\b\d{1,2}\/\d{1,2}\b/);
  return m ? m[0] : null;
}

function extractTime(text) {
  const m = text.match(/\b(1[0-2]|0?[1-9])(:[0-5][0-9])?\s?(am|pm)\b/i);
  return m ? m[0].toUpperCase() : null;
}

function extractPhone(text) {
  const m = text.match(/\+?\d[\d\s-]{6,}\d/);
  return m ? m[0].trim() : null;
}

function extractName(text) {
  // Looks for "I'm X", "my name is X", or a short two-word reply on its own.
  const m1 = text.match(/(?:i'?m|my name is|this is)\s+([a-zA-Z][a-zA-Z\s]{1,30})/i);
  if (m1) return titleCase(m1[1].trim());
  const words = text.trim().split(/\s+/);
  if (words.length <= 3 && /^[a-zA-Z\s]+$/.test(text.trim()) && text.trim().length > 1) {
    return titleCase(text.trim());
  }
  return null;
}

function titleCase(s) {
  return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

export class ReceptionistEngine {
  constructor() {
    this.state = {
      stage: "idle", // idle | booking_service | booking_date | booking_time | booking_name | booking_phone | booking_confirm | reschedule | cancel
      name: null,
      phone: null,
      service: null,
      date: null,
      time: null,
      leadCaptured: false,
      escalated: false,
      turns: 0,
    };
  }

  // Returns a snapshot for the "Behind the scenes" panel — this is the same
  // shape a real backend would hand to a CRM/booking system.
  getStateSnapshot() {
    return { ...this.state };
  }

  greetingMessage() {
    return `Hi! 👋 Thanks for contacting ${BUSINESS_KNOWLEDGE.name}. I'm the virtual receptionist. How can I help you today?`;
  }

  handleMessage(rawText) {
    const text = normalize(rawText);
    this.state.turns += 1;

    // Opportunistically pick up info from ANY message, so we never
    // re-ask for something the visitor already told us.
    const maybeName = this.state.stage === "booking_name" ? extractName(rawText) : null;
    const maybePhone = extractPhone(rawText);
    const maybeDate = extractDate(text);
    const maybeTime = extractTime(text);
    const maybeService = pickService(text);
    if (maybePhone && !this.state.phone) this.state.phone = maybePhone;
    if (maybeDate && !this.state.date) this.state.date = maybeDate;
    if (maybeTime && !this.state.time) this.state.time = maybeTime;
    if (maybeService && !this.state.service) this.state.service = maybeService;

    // --- Escalation / human handoff takes priority over everything ---
    if (matchAny(text, ["talk to a human", "real person", "speak to someone", "manager", "this isn't working", "frustrated", "complaint"])) {
      this.state.escalated = true;
      return this.reply(
        `Totally understand — I'd be happy to have someone from the clinic team help with that directly. I've noted your message and a team member can follow up with you shortly.`,
        { action: "escalated", quickReplies: ["Thanks", "Actually, one more question"] }
      );
    }

    // --- Mid-flow: booking stages ---
    if (this.state.stage.startsWith("booking") || this.state.stage === "confirming") {
      return this.continueBooking(text, rawText);
    }
    if (this.state.stage === "reschedule") {
      return this.continueReschedule(text, rawText);
    }
    if (this.state.stage === "cancel") {
      return this.continueCancel(text, rawText);
    }

    // --- Fresh intent detection ---
    if (matchAny(text, ["hi", "hello", "hey", "good morning", "good afternoon"]) && this.state.turns <= 1) {
      return this.reply(this.greetingMessage(), {
        quickReplies: ["Book an appointment", "What are your hours?", "Do you take insurance?", "I need to reschedule"],
      });
    }

    if (matchAny(text, ["reschedule", "move my appointment", "change my appointment", "different time"])) {
      this.state.stage = "reschedule";
      return this.reply(
        `No problem — I can help with that. What's the name on the appointment, and what day/time were you originally booked for?`,
        { quickReplies: [] }
      );
    }

    if (matchAny(text, ["cancel"])) {
      this.state.stage = "cancel";
      return this.reply(
        `Sorry to see that — I can take care of the cancellation. Can you confirm the name and appointment date so I can look it up?`,
        { quickReplies: [] }
      );
    }

    if (matchAny(text, ["book", "appointment", "schedule", "come in", "set up a visit"])) {
      return this.startBooking();
    }

    if (matchAny(text, ["hour", "open", "close", "when are you"])) {
      return this.reply(`We're open ${BUSINESS_KNOWLEDGE.hours} ${DEMO_DISCLAIMER}`, {
        quickReplies: ["Book an appointment", "Where are you located?"],
      });
    }
    if (matchAny(text, ["where", "location", "address"])) {
      return this.reply(`We're at ${BUSINESS_KNOWLEDGE.location} ${DEMO_DISCLAIMER}`, {
        quickReplies: ["What are your hours?", "Book an appointment"],
      });
    }
    if (matchAny(text, ["insurance"])) {
      return this.reply(`${BUSINESS_KNOWLEDGE.insurance} ${DEMO_DISCLAIMER}`, {
        quickReplies: ["What about payment options?", "Book an appointment"],
      });
    }
    if (matchAny(text, ["payment", "pay", "financing", "cost", "price", "how much"])) {
      if (maybeService) {
        return this.reply(
          `${maybeService.label} is ${maybeService.price} here. ${BUSINESS_KNOWLEDGE.payment} ${DEMO_DISCLAIMER}`,
          { quickReplies: [`Book ${maybeService.label.toLowerCase()}`, "Any other services?"] }
        );
      }
      return this.reply(`${BUSINESS_KNOWLEDGE.payment} ${DEMO_DISCLAIMER}`, {
        quickReplies: ["What services do you offer?", "Book an appointment"],
      });
    }
    if (matchAny(text, ["emergency", "urgent", "pain", "hurts"])) {
      return this.reply(`${BUSINESS_KNOWLEDGE.emergency} ${DEMO_DISCLAIMER} Want me to grab your details now?`, {
        quickReplies: ["Yes, book me in", "No thanks"],
      });
    }
    if (matchAny(text, ["new patient", "first time", "never been"])) {
      return this.reply(`${BUSINESS_KNOWLEDGE.newPatientInfo} ${DEMO_DISCLAIMER} Want to get on the schedule?`, {
        quickReplies: ["Book an appointment", "What services do you offer?"],
      });
    }
    if (matchAny(text, ["service", "offer", "what do you do", "treatments"]) || maybeService) {
      if (maybeService) {
        return this.reply(`${maybeService.label} — ${maybeService.blurb} It's ${maybeService.price}. ${DEMO_DISCLAIMER} Want to book it?`, {
          quickReplies: [`Book ${maybeService.label.toLowerCase()}`, "What else do you offer?"],
        });
      }
      const list = BUSINESS_KNOWLEDGE.services.map((s) => `• ${s.label} (${s.price})`).join("\n");
      return this.reply(`Here's what we offer:\n${list}\n${DEMO_DISCLAIMER}`, {
        quickReplies: ["Book an appointment", "Do you take insurance?"],
      });
    }
    if (matchAny(text, ["thank", "thanks", "great", "awesome", "perfect"]) && this.state.turns > 1) {
      return this.reply(`Anytime! Anything else I can help with?`, {
        quickReplies: ["Book an appointment", "No, that's all"],
      });
    }
    if (matchAny(text, ["no, that's all", "no thats all", "that's all", "nothing else", "bye", "goodbye"])) {
      return this.reply(`Sounds good — have a great day! 👋`, { quickReplies: [] });
    }

    // --- Fallback: still capture the visitor as a lead if this looks like intent ---
    if (!this.state.leadCaptured && this.state.turns >= 2) {
      this.state.leadCaptured = true;
      return this.reply(
        `Good question — I want to make sure you get an accurate answer, so I'll flag this for the clinic team to follow up on. In the meantime, is there anything else I can help with, like booking a visit?`,
        { action: "lead_captured", quickReplies: ["Book an appointment", "What are your hours?"] }
      );
    }

    return this.reply(
      `I want to make sure I get that right — could you tell me a bit more, or pick one of these?`,
      { quickReplies: ["Book an appointment", "What are your hours?", "What services do you offer?"] }
    );
  }

  startBooking() {
    this.state.stage = "booking_service";
    if (this.state.service) {
      this.state.stage = "booking_date";
      return this.reply(
        `Great, let's get ${this.state.service.label.toLowerCase()} booked. What day works best for you?`,
        { quickReplies: [] }
      );
    }
    const options = BUSINESS_KNOWLEDGE.services.map((s) => s.label);
    return this.reply(`Happy to help you book. Which service are you after?`, { quickReplies: options.slice(0, 4) });
  }

  continueBooking(text, rawText) {
    const svc = pickService(text);
    if (svc && !this.state.service) this.state.service = svc;

    if (this.state.stage === "booking_service") {
      if (!this.state.service) {
        return this.reply(`No worries — which service were you thinking of? (e.g. cleaning, whitening, exam)`, {
          quickReplies: BUSINESS_KNOWLEDGE.services.slice(0, 4).map((s) => s.label),
        });
      }
      this.state.stage = "booking_date";
      return this.reply(`Got it, ${this.state.service.label.toLowerCase()}. What day works best?`, { quickReplies: ["Tomorrow", "This Friday", "Next Monday"] });
    }

    if (this.state.stage === "booking_date") {
      const d = extractDate(text) || rawText.trim();
      if (!d) {
        return this.reply(`What day were you thinking?`, { quickReplies: ["Tomorrow", "This Friday", "Next Monday"] });
      }
      this.state.date = this.state.date || titleCase(d);
      this.state.stage = "booking_time";
      return this.reply(`And what time on ${this.state.date}?`, { quickReplies: ["9:00 AM", "2:00 PM", "4:30 PM"] });
    }

    if (this.state.stage === "booking_time") {
      const t = extractTime(text) || rawText.trim();
      this.state.time = this.state.time || t;
      if (!this.state.name) {
        this.state.stage = "booking_name";
        return this.reply(`Perfect. Can I grab your name for the appointment?`, { quickReplies: [] });
      }
      return this.finishBooking();
    }

    if (this.state.stage === "booking_name") {
      const n = extractName(rawText);
      this.state.name = n || titleCase(rawText.trim());
      if (!this.state.phone) {
        this.state.stage = "booking_phone";
        return this.reply(`Thanks, ${this.state.name}! And the best phone number to reach you at?`, { quickReplies: [] });
      }
      return this.finishBooking();
    }

    if (this.state.stage === "booking_phone") {
      const p = extractPhone(rawText);
      this.state.phone = p || rawText.trim();
      return this.finishBooking();
    }

    return this.finishBooking();
  }

  finishBooking() {
    this.state.stage = "idle";
    this.state.leadCaptured = true;
    const { name, service, date, time } = this.state;
    return this.reply(
      `Perfect — I've captured your request for ${service ? service.label.toLowerCase() : "a visit"} on ${date || "your preferred day"} at ${time || "your preferred time"} for ${name || "you"}. A member of the clinic team will confirm the appointment shortly. Anything else I can help with?`,
      { action: "appointment_requested", quickReplies: ["No, that's all", "Actually, one more question"] }
    );
  }

  continueReschedule(text, rawText) {
    if (!this.state.name) {
      const n = extractName(rawText);
      if (n) this.state.name = n;
    }
    this.state.stage = "idle";
    return this.reply(
      `Thanks — I've flagged ${this.state.name || "your"} appointment for rescheduling and the team will reach out to confirm a new time that works for you. Anything else?`,
      { action: "reschedule_requested", quickReplies: ["No, that's all", "Book a different appointment"] }
    );
  }

  continueCancel(text, rawText) {
    if (!this.state.name) {
      const n = extractName(rawText);
      if (n) this.state.name = n;
    }
    this.state.stage = "idle";
    return this.reply(
      `Got it — I've noted the cancellation request for ${this.state.name || "your appointment"}. A team member will confirm it's been removed from the schedule. Hope to see you again soon!`,
      { action: "cancellation_requested", quickReplies: ["No, that's all"] }
    );
  }

  reply(text, { quickReplies = [], action = null } = {}) {
    return { text, quickReplies, action, state: this.getStateSnapshot() };
  }
}

export { BUSINESS_KNOWLEDGE };
