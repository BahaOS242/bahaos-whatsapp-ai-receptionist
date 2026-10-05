/**
 * kit.js — shared logic for the three Junkanoo redesign concepts.
 * ---------------------------------------------------------------------------
 * Framework-free and DOM-light so each concept can style it however it wants:
 *   Kit.createReceptionist()  tiny scripted receptionist (intent + booking flow)
 *   Kit.mountChat(root, opts)  renders a chat into any element (class hooks: k-*)
 *   Kit.roi(inputs)            same formulas as js/roi.js ($300/mo plan)
 *   Kit.NIGHT_FEED             a sample 24h of WhatsApp traffic for a clinic
 *   Kit.HOURLY_SHARE           share of weekly messages arriving in each hour
 * Everything here is a simulation for the portfolio — nothing is sent anywhere.
 * ---------------------------------------------------------------------------
 */
(function () {
  const BIZ = {
    name: "BrightSmile Dental",
    town: "Nassau",
    hours: "Mon–Fri 8am–5pm, Sat 9am–1pm",
    address: "Village Road, Nassau",
    services: {
      cleaning: { label: "Cleaning & check-up", price: 120, words: ["clean", "check", "checkup", "hygien"] },
      whitening: { label: "Teeth whitening", price: 350, words: ["whiten", "white", "bleach"] },
      filling: { label: "Filling", price: 180, words: ["filling", "cavity", "cavities"] },
      emergency: { label: "Emergency visit", price: 95, words: ["emergency", "pain", "hurt", "ache", "killing", "broke", "chipped", "swollen"] },
    },
  };

  const AI_COST_MONTHLY = 300;
  const AI_COST_ANNUAL = AI_COST_MONTHLY * 12;

  const money = (n) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
      Math.round(n || 0)
    );

  function roi(i) {
    const recover = i.missed * i.recoveryRate * i.newValue * 12;
    const retain = i.active * Math.max(0, i.retainAfter - i.retainBefore) * i.retainedValue;
    const reactivate = i.reactivateOn === false ? 0 : i.inactive * i.reactivationRate * i.reactivatedValue;
    const total = recover + retain + reactivate;
    const net = total - AI_COST_ANNUAL;
    return { recover, retain, reactivate, total, net, multiple: net / AI_COST_ANNUAL };
  }

  /* ---------------- receptionist ---------------- */
  const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function findService(t) {
    for (const [key, s] of Object.entries(BIZ.services)) if (s.words.some((w) => t.includes(w))) return key;
    return null;
  }
  function findDay(t) {
    if (/\btoday\b/.test(t)) return "today";
    if (/\btomorrow\b|\btmrw\b/.test(t)) return "tomorrow";
    const d = DAYS.find((d) => t.includes(d) || new RegExp("\\b" + d.slice(0, 3) + "\\b").test(t));
    if (d === "sunday") return "sunday";
    return d || null;
  }
  function findTime(t) {
    const m = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
    if (m) return `${+m[1]}${m[2] ? ":" + m[2] : ""}${m[3]}`;
    if (/\bmorning\b/.test(t)) return "9am";
    if (/\bafternoon\b/.test(t)) return "2pm";
    if (/\blunch\b|\bnoon\b/.test(t)) return "12pm";
    return null;
  }

  function createReceptionist() {
    const s = { stage: null, service: null, day: null, time: null, name: null, booked: 0, lead: false };

    function nextAsk() {
      if (!s.service) {
        s.stage = "service";
        return {
          text: "What are we booking? Cleaning, whitening, a filling, or an emergency visit?",
          chips: ["Cleaning", "Whitening", "Emergency"],
        };
      }
      if (!s.day) {
        s.stage = "day";
        return { text: `${BIZ.services[s.service].label} it is. Which day works for you?`, chips: ["Tomorrow", "Friday", "Saturday"] };
      }
      if (!s.time) {
        s.stage = "time";
        const sat = s.day === "saturday";
        return {
          text: `I have openings ${s.day === "today" || s.day === "tomorrow" ? s.day : "on " + cap(s.day)}. Which time?`,
          chips: sat ? ["9am", "10:30am", "12pm"] : ["9am", "11:30am", "3pm"],
        };
      }
      if (!s.name) {
        s.stage = "name";
        return { text: "Last thing. What name should I put it under?", chips: [] };
      }
      s.stage = "done";
      s.booked += 1;
      const svc = BIZ.services[s.service];
      const when = `${s.day === "today" || s.day === "tomorrow" ? cap(s.day) : cap(s.day)} at ${s.time}`;
      const out = {
        text: `Done, ${s.name}! ✅ ${svc.label}, ${when}. I've sent a reminder for the morning before. See you at ${BIZ.address}.`,
        chips: ["Reschedule", "Prices", "Thanks!"],
        booked: { service: svc.label, when, name: s.name, value: svc.price },
      };
      s.service = s.day = s.time = null;
      return out;
    }

    function reply(raw) {
      const t = raw.toLowerCase().trim();
      const replies = [];
      let chips = [];
      let booked = null;

      // Booking flow captures first so "Friday" or "3pm" lands in the right slot.
      if (s.stage && s.stage !== "done") {
        if (s.stage === "name" && t && !/cancel|stop|never ?mind/.test(t)) {
          s.name = raw.trim().split(/\s+/).slice(0, 2).map(cap).join(" ");
          s.lead = true;
          const r = nextAsk();
          return { replies: [r.text], chips: r.chips, booked: r.booked, state: snapshot() };
        }
        const svc = findService(t), day = findDay(t), time = findTime(t);
        if (svc || day || time) {
          if (svc) s.service = svc;
          if (day === "sunday") return { replies: ["We're closed Sundays. Saturday morning or Monday?"], chips: ["Saturday", "Monday"], state: snapshot() };
          if (day) s.day = day;
          if (time) s.time = time;
          const r = nextAsk();
          return { replies: [r.text], chips: r.chips, booked: r.booked, state: snapshot() };
        }
      }

      if (/cancel|reschedul|move my|change my/.test(t)) {
        s.stage = "day"; s.service = s.service || "cleaning";
        replies.push("No problem, I can move it. Your slot is released. Which day suits you better?");
        chips = ["Tomorrow", "Friday", "Saturday"];
      } else if (/human|person|staff|speak to|real person/.test(t)) {
        replies.push("I'll hand you to the front desk. They'll reply here first thing when we open (8am). I've flagged it as priority.");
        chips = ["Book instead", "Hours"];
      } else if (/emergency|pain|hurt|ache|killing|broke|chipped|swollen|bleed/.test(t)) {
        s.service = "emergency";
        replies.push("Sorry you're hurting. 😣 We keep emergency slots every morning. Rinse with warm salt water; ibuprofen helps if you can take it.");
        const r = nextAsk(); replies.push(r.text); chips = r.chips; booked = r.booked;
      } else if (/price|cost|how much|\$|rate|fee/.test(t)) {
        replies.push(
          Object.values(BIZ.services).map((v) => `• ${v.label}: $${v.price}`).join("\n") +
          "\nInsurance claims filed for you. Want me to book one?"
        );
        chips = ["Book a cleaning", "Insurance?"];
      } else if (/book|appoint|schedule|slot|available|come in|see the dentist/.test(t) || findService(t)) {
        const svc = findService(t); if (svc) s.service = svc;
        const day = findDay(t); if (day && day !== "sunday") s.day = day;
        const time = findTime(t); if (time) s.time = time;
        const r = nextAsk(); replies.push(r.text); chips = r.chips; booked = r.booked;
      } else if (/insur|nib|coverage|colina|bahamas first/.test(t)) {
        replies.push("We accept most major plans, including NIB-linked and private insurers. Bring your card and we'll file the claim for you.");
        chips = ["Book a cleaning", "Prices"];
      } else if (/hour|open|close|when are you/.test(t)) {
        replies.push(`We're open ${BIZ.hours}. I answer WhatsApp 24/7 though, so you can book right now.`);
        chips = ["Book now", "Where are you?"];
      } else if (/where|locat|address|direction|park/.test(t)) {
        replies.push(`${BIZ.address}, next to the pharmacy. Free parking out front.`);
        chips = ["Book now", "Hours"];
      } else if (/thank|thx|ty\b|appreciate/.test(t)) {
        replies.push("Anytime! 🙌 Message me here whenever you need us.");
      } else if (/^(hi|hey|hello|good (morning|afternoon|evening)|morning|yo|wha gwan)/.test(t)) {
        replies.push(`Hi! 👋 I'm the ${BIZ.name} assistant. I can book you in, share prices, or answer questions.`);
        chips = ["Book a cleaning", "Prices", "I'm in pain"];
      } else {
        replies.push("I can help with bookings, prices, hours, insurance, or an urgent toothache. Which is it?");
        chips = ["Book a cleaning", "Prices", "Hours"];
      }
      return { replies, chips, booked, state: snapshot() };
    }

    function snapshot() {
      return { stage: s.stage || "idle", service: s.service, day: s.day, time: s.time, name: s.name, booked: s.booked, lead: s.lead };
    }
    return { reply, snapshot, greet: () => reply("hi") };
  }

  /**
   * Render a chat into `root`. Elements get k-* classes for styling:
   * k-msgs, k-msg (k-in | k-out), k-typing, k-chips, k-chip, k-form, k-field, k-send.
   * opts.onBooked(info) fires when a booking completes; opts.onState(state) after every turn.
   */
  function mountChat(root, opts = {}) {
    const bot = createReceptionist();
    root.innerHTML = `
      <div class="k-msgs" role="log" aria-live="polite"></div>
      <div class="k-chips"></div>
      <form class="k-form" autocomplete="off">
        <label class="k-sr" for="${opts.inputId || "k-field"}">Message</label>
        <input class="k-field" id="${opts.inputId || "k-field"}" placeholder="${opts.placeholder || "Type a message…"}" />
        <button class="k-send" type="submit" aria-label="Send">${opts.sendLabel || "➤"}</button>
      </form>`;
    const msgs = root.querySelector(".k-msgs");
    const chipsEl = root.querySelector(".k-chips");
    const form = root.querySelector(".k-form");
    const field = root.querySelector(".k-field");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let busy = false;

    const stamp = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    function add(text, who) {
      const b = document.createElement("div");
      b.className = `k-msg k-${who}`;
      b.textContent = text;
      const ts = document.createElement("span");
      ts.className = "k-ts";
      ts.textContent = stamp() + (who === "out" ? " ✓✓" : "");
      b.appendChild(ts);
      msgs.appendChild(b);
      msgs.scrollTop = msgs.scrollHeight;
    }
    function setChips(list) {
      chipsEl.innerHTML = "";
      (list || []).forEach((c) => {
        const btn = document.createElement("button");
        btn.type = "button"; btn.className = "k-chip"; btn.textContent = c;
        btn.addEventListener("click", () => send(c));
        chipsEl.appendChild(btn);
      });
    }
    function deliver(res) {
      const queue = [...res.replies];
      const step = () => {
        const text = queue.shift();
        if (text == null) {
          setChips(res.chips); busy = false;
          if (res.booked && opts.onBooked) opts.onBooked(res.booked);
          if (opts.onState) opts.onState(res.state);
          return;
        }
        const typing = document.createElement("div");
        typing.className = "k-typing"; typing.innerHTML = "<i></i><i></i><i></i>";
        msgs.appendChild(typing); msgs.scrollTop = msgs.scrollHeight;
        setTimeout(() => { typing.remove(); add(text, "out"); step(); }, reduce ? 0 : 450 + Math.min(text.length * 9, 700));
      };
      step();
    }
    function send(text) {
      if (busy || !text.trim()) return;
      busy = true; setChips([]);
      add(text, "in");
      deliver(bot.reply(text));
    }
    form.addEventListener("submit", (e) => { e.preventDefault(); const v = field.value; field.value = ""; send(v); });
    busy = true; deliver(bot.greet());
    return { send, isBusy: () => busy };
  }

  /* ---------------- sample traffic ---------------- */
  // One plausible day of inbound WhatsApp for a 3-chair clinic. Times are 24h.
  const NIGHT_FEED = [
    { t: 0.4, name: "Shantell R.", msg: "Do y'all do whitening before a wedding? It's in 3 weeks", out: "booked", what: "Whitening, Thu 10am", value: 350 },
    { t: 1.8, name: "Marco K.", msg: "my back tooth is killing me can't sleep", out: "booked", what: "Emergency, 8am today", value: 95 },
    { t: 6.6, name: "Deja M.", msg: "Morning! what time y'all open?", out: "answered", what: "Hours sent", value: 0 },
    { t: 7.3, name: "Patrice B.", msg: "Need to move my 2pm cleaning to Saturday", out: "moved", what: "Moved to Sat 10:30am", value: 0 },
    { t: 9.2, name: "Keno W.", msg: "how much is a filling", out: "booked", what: "Filling, Mon 3pm", value: 180 },
    { t: 11.5, name: "Alicia F.", msg: "Do you take NIB?", out: "answered", what: "Insurance info sent", value: 0 },
    { t: 12.4, name: "Tremaine S.", msg: "can I bring my 2 kids for checkups same day", out: "booked", what: "2 × Check-up, Sat 9am", value: 240 },
    { t: 13.1, name: "Gina L.", msg: "I want to speak to Dr. Rolle about my bill", out: "escalated", what: "Handed to front desk", value: 0 },
    { t: 15.7, name: "Omar P.", msg: "Cleaning next week? any day after 4", out: "booked", what: "Cleaning, Wed 4:30pm", value: 120 },
    { t: 17.6, name: "Renee T.", msg: "Hi are you still open?", out: "booked", what: "Cleaning, Tomorrow 9am", value: 120 },
    { t: 18.9, name: "Javon C.", msg: "where are y'all located", out: "answered", what: "Directions sent", value: 0 },
    { t: 19.8, name: "Kayla N.", msg: "Haven't been in 2 yrs 😬 can I still come?", out: "booked", what: "New-patient exam, Fri 11am", value: 120 },
    { t: 20.9, name: "Andre G.", msg: "chipped my front tooth at Junkanoo practice", out: "booked", what: "Emergency, 8am tomorrow", value: 95 },
    { t: 21.6, name: "Simone H.", msg: "Do you do Invisalign consults?", out: "booked", what: "Consult, Tue 2pm", value: 150 },
    { t: 22.4, name: "Brent A.", msg: "cancel my thursday please", out: "moved", what: "Cancelled, slot reopened", value: 0 },
    { t: 23.3, name: "Nia O.", msg: "how much for a cleaning without insurance", out: "booked", what: "Cleaning, Mon 8am", value: 120 },
  ];

  // Share of a week's inbound messages arriving in each clock hour (sums to 1).
  // Peaks at lunch and again after work (7–10pm), when nobody is at the desk.
  const RAW = [1.2, 0.8, 0.5, 0.3, 0.3, 0.6, 1.6, 3.4, 5.2, 5.8, 5.4, 5.6, 6.8, 6.2, 5.0, 4.8, 5.2, 5.9, 6.4, 7.1, 7.4, 6.6, 4.8, 2.4];
  const SUM = RAW.reduce((a, b) => a + b, 0);
  const HOURLY_SHARE = RAW.map((v) => v / SUM);

  const fmtHour = (h) => {
    const hh = Math.floor(h) % 24, mm = Math.round((h - Math.floor(h)) * 60);
    const ap = hh < 12 ? "am" : "pm", h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${h12}:${String(mm).padStart(2, "0")}${ap}`;
  };

  window.Kit = { BIZ, AI_COST_MONTHLY, AI_COST_ANNUAL, money, roi, createReceptionist, mountChat, NIGHT_FEED, HOURLY_SHARE, fmtHour };
})();
