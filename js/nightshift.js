/**
 * nightshift.js
 * ---------------------------------------------------------------------------
 * "The desk closes. The rush doesn't." — the 24-hour night-shift model on the
 * portfolio page. A scrubbable/playable timeline of one sample day of inbound
 * WhatsApp messages for the demo clinic, with running totals.
 *
 * Illustration only: the feed below is hand-written sample traffic, not real
 * customer data, and nothing here talks to the chat engine. Prices match
 * BUSINESS_KNOWLEDGE in engine.js; desk hours match its weekday hours.
 * ---------------------------------------------------------------------------
 */

const DESK_OPEN = 8;
const DESK_CLOSE = 18;
const MINUTES_SAVED_PER_CONVERSATION = 4;

// t = hour of day (decimal). value = first-visit price from engine.js, 0 if nothing was booked.
export const NIGHT_FEED = [
  {
    t: 0.4,
    name: "Shantell R.",
    msg: "Do y'all do whitening before a wedding? It's in 3 weeks",
    out: "booked",
    what: "Whitening, Thu 10am",
    value: 250,
  },
  {
    t: 1.8,
    name: "Marco K.",
    msg: "my back tooth is killing me can't sleep",
    out: "booked",
    what: "Emergency, 8am today",
    value: 140,
  },
  {
    t: 6.6,
    name: "Deja M.",
    msg: "Morning! what time y'all open?",
    out: "answered",
    what: "Hours sent",
    value: 0,
  },
  {
    t: 7.3,
    name: "Patrice B.",
    msg: "Need to move my 2pm cleaning to Saturday",
    out: "moved",
    what: "Moved to Sat 10:30am",
    value: 0,
  },
  {
    t: 9.2,
    name: "Keno W.",
    msg: "how much is a filling",
    out: "booked",
    what: "Filling, Mon 3pm",
    value: 150,
  },
  {
    t: 11.5,
    name: "Alicia F.",
    msg: "Do you take insurance?",
    out: "answered",
    what: "Insurance info sent",
    value: 0,
  },
  {
    t: 12.4,
    name: "Tremaine S.",
    msg: "can I bring my 2 kids for checkups same day",
    out: "booked",
    what: "2 × Exam, Sat 9am",
    value: 180,
  },
  {
    t: 13.1,
    name: "Gina L.",
    msg: "I want to speak to someone about my bill",
    out: "escalated",
    what: "Handed to front desk",
    value: 0,
  },
  {
    t: 15.7,
    name: "Omar P.",
    msg: "Cleaning next week? any day after 4",
    out: "booked",
    what: "Cleaning, Wed 4:30pm",
    value: 120,
  },
  {
    t: 18.3,
    name: "Renee T.",
    msg: "Hi are you still open?",
    out: "booked",
    what: "Cleaning, Tomorrow 9am",
    value: 120,
  },
  {
    t: 18.9,
    name: "Javon C.",
    msg: "where are y'all located",
    out: "answered",
    what: "Directions sent",
    value: 0,
  },
  {
    t: 19.8,
    name: "Kayla N.",
    msg: "Haven't been in 2 yrs 😬 can I still come?",
    out: "booked",
    what: "New-patient exam, Fri 11am",
    value: 90,
  },
  {
    t: 20.9,
    name: "Andre G.",
    msg: "chipped my front tooth at Junkanoo practice",
    out: "booked",
    what: "Emergency, 8am tomorrow",
    value: 140,
  },
  {
    t: 21.6,
    name: "Simone H.",
    msg: "my old crown cracked, can someone look at it?",
    out: "booked",
    what: "Exam, Tue 2pm",
    value: 90,
  },
  {
    t: 22.4,
    name: "Brent A.",
    msg: "cancel my thursday please",
    out: "moved",
    what: "Cancelled, slot reopened",
    value: 0,
  },
  {
    t: 23.3,
    name: "Nia O.",
    msg: "how much for a cleaning without insurance",
    out: "booked",
    what: "Cleaning, Mon 8am",
    value: 120,
  },
];

const LABEL = {
  booked: "Booked",
  answered: "Answered",
  moved: "Rescheduled",
  escalated: "Sent to staff",
};

const money = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

export function formatHour(h) {
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h - Math.floor(h)) * 60);
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, "0")}${hh < 12 ? "am" : "pm"}`;
}

const isAfterHours = (t) => t < DESK_OPEN || t >= DESK_CLOSE;

export function initNightShift() {
  const $ = (id) => document.getElementById(id);
  const track = $("nsTrack");
  if (!track) return;
  const needle = $("nsNeedle");
  const scrub = $("nsScrub");
  const feed = $("nsFeed");
  const play = $("nsPlay");

  const pins = NIGHT_FEED.map((m) => {
    const p = document.createElement("span");
    p.className = `ns-pin ${m.out}`;
    p.style.left = `${(m.t / 24) * 100}%`;
    p.title = `${formatHour(m.t)} · ${m.name}`;
    track.appendChild(p);
    return p;
  });

  let shown = -1;
  function render(t) {
    needle.style.left = `${(t / 24) * 100}%`;
    needle.dataset.time = formatHour(Math.min(t, 23.99));
    pins.forEach((p, i) => p.classList.toggle("on", NIGHT_FEED[i].t <= t));
    const upto = NIGHT_FEED.filter((m) => m.t <= t);
    if (upto.length === shown) return;
    shown = upto.length;

    feed.replaceChildren();
    if (!upto.length) {
      const empty = document.createElement("div");
      empty.className = "ns-empty";
      empty.textContent = "12:00am. Clinic is dark. Press play.";
      feed.appendChild(empty);
    }
    [...upto].reverse().forEach((m) => {
      const after = isAfterHours(m.t);
      const card = document.createElement("article");
      card.className = `ns-card${after ? " after" : ""}`;
      card.innerHTML = `<time></time><div><div class="who"></div><div class="said"></div></div><div class="res ${m.out}"></div>`;
      card.querySelector("time").textContent = formatHour(m.t);
      card.querySelector(".who").textContent = m.name + (after ? "  ·  after hours" : "");
      card.querySelector(".said").textContent = `"${m.msg}"`;
      card.querySelector(".res").textContent = `${LABEL[m.out]} · ${m.what}`;
      feed.appendChild(card);
    });

    const booked = upto.filter((m) => m.out === "booked");
    const mins = upto.length * MINUTES_SAVED_PER_CONVERSATION;
    $("nsBooked").textContent = money(booked.reduce((a, m) => a + m.value, 0));
    $("nsMsgs").textContent = upto.length;
    $("nsAfter").textContent = upto.filter((m) => isAfterHours(m.t)).length;
    $("nsAppts").textContent = booked.length;
    $("nsMins").textContent = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
  }

  let raf = null;
  function stop() {
    cancelAnimationFrame(raf);
    raf = null;
    play.textContent = "▶ Play the day";
  }
  play.addEventListener("click", () => {
    if (raf) return stop();
    let t = scrub.valueAsNumber >= 23.9 ? 0 : scrub.valueAsNumber;
    let last = performance.now();
    play.textContent = "❚❚ Pause";
    const step = (now) => {
      t = Math.min(24, t + ((now - last) / 1000) * 1.6);
      last = now;
      scrub.value = t;
      render(t);
      if (t < 24) raf = requestAnimationFrame(step);
      else stop();
    };
    raf = requestAnimationFrame(step);
  });
  scrub.addEventListener("input", () => {
    stop();
    render(scrub.valueAsNumber);
  });
  track.addEventListener("click", (e) => {
    stop();
    const r = track.getBoundingClientRect();
    const t = Math.max(0, Math.min(24, ((e.clientX - r.left) / r.width) * 24));
    scrub.value = t;
    render(t);
  });

  // Complete at rest: the whole day is visible on load.
  render(24);
}
