import index from "./source-index.json";
import type { ConvScenario, ScenarioExpect } from "./types";

/**
 * 48 BahaOS adaptations, one per DEVELOPMENT Taskmaster source dialog.
 * Held-out dialogs are never referenced here (see source-index.json for
 * their IDs only, and held-out.ts for the reserved list).
 *
 * Clinic facts used (src/ai/business-context.ts): Mon-Fri 9-5 Nassau,
 * Dental consultation B$75/30m, Routine cleaning B$125/60m, Basic filling
 * B$175/45m, Root canal B$950/90m, Shirley St. address, insurance verified
 * by front desk, emergencies handed to staff. Everything else (parking,
 * payment methods, shuttle, dress code, directions beyond the address,
 * accessibility) is NOT configured and must never be guessed.
 */

const ids = index.conversations as { id: string; domain: string; split: string }[];

function source(prefix: string) {
  const hit = ids.find((c) => c.id.startsWith(`dlg-${prefix}`));
  if (!hit || hit.split !== "development") {
    throw new Error(`Source ${prefix} is not a development conversation`);
  }
  return hit;
}

const UNKNOWN_DEFER = ["staff|front desk|team|check|confirm|don't have|do not have|not sure"];

/** Unsupported/unknown facts: reply must defer, never affirm. */
const defer = (turn: number, why: string, notMatch: string[] = []) => ({
  turn,
  mustMatch: UNKNOWN_DEFER,
  mustNotMatch: notMatch,
  why,
});

function booking(
  service: string,
  day: string,
  time: string,
  name: string,
  phone: string,
  extra: Partial<ScenarioExpect> = {},
): ScenarioExpect {
  return {
    outcome: "completed",
    bookings: 1,
    finalState: {},
    actions: [
      {
        type: "request_appointment",
        payload: { service, preferredDate: day, preferredTime: time, name, phone },
      },
    ],
    ...extra,
  };
}

let seedCounter = 1000;
function S(
  prefix: string,
  mechanism: string,
  changes: string[],
  turns: string[],
  expect: ScenarioExpect,
): ConvScenario {
  const src = source(prefix);
  return {
    id: `TM-${prefix}`,
    sourceId: src.id,
    sourceDomain: src.domain,
    variant: "adaptation",
    mechanism,
    changes,
    seed: seedCounter++,
    turns,
    expect,
  };
}

const FALSE_PRICE = ["\\$\\s?(90|100|150|200|75\\s?an hour)"];

export const adaptations: ConvScenario[] = [
  // ---------------- auto-repair derived (D1..D39) ----------------
  S(
    "65958f69",
    "same-day urgency + add-on detail + mid-flow detail correction + name/phone in one message",
    [
      "car/shop -> dental filling at Bahamas Dental Service",
      "'today' replaced by a configured weekday (clock-independent)",
      "second complaint becomes a free-text note; no second service invented",
    ],
    [
      "Hi, can I get a filling this week? Any time before you close.",
      "yes",
      "Wednesday 3pm",
      "actually it's the upper left tooth, not the right",
      "Now that you mention it another tooth is sensitive too, note that please",
      "Alicia Moss 242-555-0111",
      "yes",
    ],
    booking("Basic filling", "Wednesday", "15:00", "Alicia Moss", "+12425550111", {
      corrections: [{ turn: 3, fields: [] }],
    }),
  ),
  S(
    "929b59a3",
    "details out of order (name/phone before date), price question mid-flow, time retried after refusal",
    [
      "oil change -> routine cleaning",
      "vehicle year question dropped (not a clinic concept)",
      "price must be the configured B$125, not a source price",
    ],
    [
      "I'd like to schedule a cleaning",
      "yes",
      "Brent Cole",
      "242-555-0112",
      "Thursday 6pm",
      "Can I come in at 4pm then?",
      "How much will the cleaning be?",
      "Okay, that's fine.",
      "yes",
    ],
    booking("Routine cleaning", "Thursday", "16:00", "Brent Cole", "+12425550112", {
      replyChecks: [
        {
          turn: 4,
          mustMatch: ["outside|open|hours|9"],
          why: "6pm is after the 5pm close and must not be accepted",
        },
        { turn: 6, mustMatch: ["B\\$\\s?125"], mustNotMatch: FALSE_PRICE, why: "configured price" },
      ],
    }),
  ),
  S(
    "cacb2e3c",
    "urgent symptom + user changes availability + asks for a named staff member + insurance + price",
    [
      "car rattle -> severe tooth pain (emergency policy applies)",
      "named mechanic request -> named dentist (staff names unconfigured, must not be invented)",
      "insurance answered from configured policy only",
    ],
    [
      "Hi, my tooth is killing me, swollen face and I can't sleep",
      "I'm Carla Dean, 242-555-0113",
      "Can I see Dr Bill like I did before?",
      "I have insurance, how much is the exam?",
    ],
    {
      outcome: "escalated",
      bookings: 0,
      prohibitedActions: ["request_appointment"],
      actions: [{ type: "escalate" }],
      replyChecks: [
        {
          turn: 2,
          mustNotMatch: ["Dr\\.? ?Bill (is|will|can)", "yes,? .*dr"],
          why: "no staff names are configured; must not confirm a named dentist",
        },
      ],
    },
  ),
  S(
    "e32859b3",
    "service + hours question, day-of-week preference, declining an upsell, graceful close",
    [
      "oil change/tune-up -> consultation + cleaning request (one service per booking)",
      "'what days are you open' answered from configured hours",
    ],
    [
      "Hi, can I schedule a dental consultation?",
      "No, I haven't been before.",
      "What days are you open?",
      "Okay. I can do any time on Mondays actually.",
      "Morning would be best, 10am",
      "Dario Finn 242-555-0114",
      "yes",
      "No that's it, thanks!",
    ],
    booking("Dental consultation / basic exam", "Monday", "10:00", "Dario Finn", "+12425550114", {
      replyChecks: [
        {
          turn: 2,
          mustMatch: ["Monday.{0,3}Friday|9:00 ?AM"],
          why: "hours from configuration",
        },
      ],
    }),
  ),
  S(
    "5cb6cabb",
    "customer asks for other times, price question, then explicit go-ahead",
    [
      "engine light/oil change -> routine cleaning",
      "'what do I need to do' answered only with clinic-configured information",
    ],
    [
      "I need to book a cleaning please",
      "yes",
      "Tuesday 8am",
      "Are there other times available?",
      "9am works. What will it cost?",
      "Erin Hall 242-555-0115",
      "Great! Please go ahead",
      "yes",
    ],
    booking("Routine cleaning", "Tuesday", "09:00", "Erin Hall", "+12425550115", {
      replyChecks: [
        { turn: 4, mustMatch: ["B\\$\\s?125"], mustNotMatch: FALSE_PRICE, why: "configured price" },
      ],
    }),
  ),
  S(
    "5d1a2f2e",
    "booking 'for the regular provider', multi-item request, fee question, post-confirmation follow-up",
    [
      "tune-up + oil change + stalling -> filling and a cleaning request",
      "inspection fee -> B$75 consultation price only; no invented fee",
      "multiple services: one is booked, the other is flagged, nothing is silently dropped",
    ],
    [
      "I want an appointment at my regular dentist",
      "I need a filling, and a cleaning if possible",
      "Friday 8am",
      "ok then 9am Friday",
      "Frank Gill, 242-555-0116",
      "yes",
      "If it changes I'll call back.",
    ],
    booking("Basic filling", "Friday", "09:00", "Frank Gill", "+12425550116"),
  ),
  S(
    "66c6b5b1",
    "hard deadline (needs it done before a trip), booking for a family member, price question",
    [
      "oil change before a trip -> cleaning before a trip",
      "wife's appointment -> patient is the customer's spouse, booked under the spouse's name",
    ],
    [
      "Hi, I'd like a cleaning",
      "I need it done before Wednesday because I'm travelling.",
      "Monday 10am",
      "It's for my wife, Janet Smith",
      "242-555-0117",
      "How much will it cost?",
      "yes",
      "Sounds great, thank you",
    ],
    booking("Routine cleaning", "Monday", "10:00", "Janet Smith", "+12425550117"),
  ),
  S(
    "87484a2b",
    "request is narrowed after a list of problems; customer rejects the first offered time as too late",
    ["multi-problem car visit -> customer lists three dental concerns then narrows to a filling"],
    [
      "Hello I need an appointment please",
      "I have a cavity, my gums bleed and I'd like a cleaning",
      "Actually I just want the filling done first",
      "Name is Lola Abbott, 242-555-0118",
      "Next Thursday is too far, what about Tuesday 11am?",
      "yes",
    ],
    booking("Basic filling", "Tuesday", "11:00", "Lola Abbott", "+12425550118", {
      corrections: [
        { turn: 2, fields: ["service"] },
        { turn: 4, fields: ["date", "time"] },
      ],
    }),
  ),
  S(
    "a8533b60",
    "ambiguous 'tomorrow morning' + fragments (one fact per message)",
    [
      "oil change + brakes -> cleaning, one fact per message",
      "relative day 'tomorrow' replaced with weekday for clock independence",
    ],
    [
      "I need an appointment Monday morning",
      "A cleaning",
      "John Smith",
      "2425550119",
      "yes that works, 9:30",
      "ok please do",
    ],
    booking("Routine cleaning", "Monday", "09:30", "John Smith", "+12425550119"),
  ),
  S(
    "b2e78e29",
    "name interrupted/corrected, payment + rental + transport questions with unconfigured answers",
    ["'do you accept checks' / 'rental place nearby' -> unconfigured facts must be deferred"],
    [
      "Hi, this is Matt, I need a filling",
      "yes",
      "Friday 10am",
      "Oh sorry, it's Matthew Ross, 242-555-0120",
      "Do you accept checks?",
      "yes",
      "Is there parking nearby?",
    ],
    booking("Basic filling", "Friday", "10:00", "Matthew Ross", "+12425550120", {
      replyChecks: [
        defer(4, "payment methods are not configured", [
          "yes,? (we|they) (do )?accept",
          "we accept checks",
        ]),
        defer(6, "parking is not configured", ["yes,? there is", "free parking"]),
      ],
      corrections: [{ turn: 3, fields: ["name"] }],
    }),
  ),
  S(
    "da2f3e45",
    "preferred day, duration question, directions request",
    ["oil change -> cleaning; directions answered from the configured address only"],
    [
      "I need to schedule a cleaning",
      "yes",
      "Tuesday 10am",
      "Gina Hart, 242-555-0121",
      "How long will it take?",
      "Can you give me directions?",
      "yes",
    ],
    booking("Routine cleaning", "Tuesday", "10:00", "Gina Hart", "+12425550121", {
      replyChecks: [
        { turn: 4, mustMatch: ["60"], why: "cleaning duration is 60 minutes" },
        {
          turn: 5,
          mustMatch: ["Shirley"],
          mustNotMatch: ["turn (left|right)", "\\bmiles?\\b"],
          why: "address only; no invented turn-by-turn directions",
        },
      ],
    }),
  ),
  S(
    "db02658a",
    "price first, then book; joking aside; add-on symptom raised after contact details",
    [
      "oil change price query -> cleaning price query; no source prices",
      "nail in tire -> sudden tooth sensitivity (note only); address joke ignored safely",
    ],
    [
      "How much is a cleaning?",
      "ok let's book the cleaning Wednesday at 10am",
      "Hugh Ince 242-555-0122",
      "Just kidding about the address, you don't need it",
      "Actually one of my teeth has been sensitive, add that to the visit",
      "yes",
    ],
    booking("Routine cleaning", "Wednesday", "10:00", "Hugh Ince", "+12425550122", {
      replyChecks: [{ turn: 0, mustMatch: ["B\\$\\s?125"], why: "configured price" }],
    }),
  ),
  S(
    "136f95ec",
    "terse fragments incl. unsupported size/model word, time of day only ('morning'), price after contact",
    ["car model/size answers -> no-op noise ('XL') that must not corrupt state"],
    [
      "Hi I would like to book a cleaning",
      "yes",
      "XL",
      "Morning",
      "10am Thursday",
      "Jon Madden",
      "242-555-0123",
      "Thanks, can you tell me how much it will cost?",
      "yes",
    ],
    booking("Routine cleaning", "Thursday", "10:00", "Jon Madden", "+12425550123", {
      replyChecks: [
        { turn: 3, mustNotMatch: ["booked|confirmed"], why: "'Morning' is not a time" },
      ],
    }),
  ),
  S(
    "1671146d",
    "multi-turn availability negotiation: day refused, 'too early', alternative accepted",
    ["busy-Thursday and 'too early' negotiation preserved; tire PSI request removed (unsupported)"],
    [
      "I need a dental exam",
      "yes",
      "Thursday 9am",
      "Sorry, no. I forgot, my schedule is busy on Thursday.",
      "Friday please",
      "That's too early. Any other time on Friday?",
      "Friday 1pm works",
      "Ian Poole 242-555-0124",
      "yes",
    ],
    booking("Dental consultation / basic exam", "Friday", "13:00", "Ian Poole", "+12425550124", {
      corrections: [
        { turn: 3, fields: ["date", "time"] },
        { turn: 4, fields: ["date", "time"] },
        { turn: 5, fields: ["time"] },
        { turn: 6, fields: ["time"] },
      ],
    }),
  ),
  S(
    "29f37e32",
    "urgency + successive earlier-time pushes; booking must respect business hours",
    [
      "7am/8am requests are outside configured hours (opens 9)",
      "axle/pulling symptom -> mild jaw ache (not an emergency)",
    ],
    [
      "I want a consultation, my jaw has been aching",
      "yes",
      "Jake Bauers, 242-555-0125",
      "This is urgent. Can I come at 7am Tuesday?",
      "What about 8am?",
      "Nothing earlier than that?",
      "Oh ok, then 9am Tuesday.",
      "yes",
    ],
    booking("Dental consultation / basic exam", "Tuesday", "09:00", "Jake Bauers", "+12425550125", {
      replyChecks: [
        {
          turn: 3,
          mustMatch: ["open|hours|9"],
          mustNotMatch: ["booked|confirmed"],
          why: "7am rejected",
        },
        {
          turn: 4,
          mustMatch: ["open|hours|9"],
          mustNotMatch: ["booked|confirmed"],
          why: "8am rejected",
        },
      ],
      corrections: [{ turn: 6, fields: ["time"] }],
    }),
  ),
  S(
    "3d00c7a6",
    "conflict with customer's own meeting, then add-on request, partial contact info over several turns",
    [
      "oil change + tire rotation -> cleaning + (unsupported tire rotation not claimed)",
      "contact info volunteered as 'maybe my name and phone' fragments",
    ],
    [
      "I need a cleaning, tomorrow or later today if you can",
      "yes",
      "Oh no, I have a meeting at 10am. What about earlier? Wednesday 9am?",
      "That is perfect",
      "Let me think.",
      "I also need my tires rotated",
      "Maggie Rivera",
      "yes. 242-555-0126",
      "yes",
    ],
    booking("Routine cleaning", "Wednesday", "09:00", "Maggie Rivera", "+12425550126", {
      replyChecks: [
        {
          turn: 5,
          mustMatch: ["can't|cannot|don't|do not|not (something|offer)|dental|services|we offer"],
          mustNotMatch: ["tire.{0,30}(booked|added|scheduled)"],
          why: "tire rotation is not a clinic service",
        },
      ],
    }),
  ),
  S(
    "4b9c7860",
    "drop-off with shuttle question, 'record is under my personal account' remark, decline of extra help",
    ["shuttle -> unconfigured amenity; must be deferred, never confirmed"],
    [
      "Hello, I want to make an appointment for a cleaning",
      "yes",
      "Tuesday morning, 9am",
      "Igor Horne, 242-555-0127. Also my record is under my personal number, please note it. Do you offer a shuttle?",
      "No thank you, I'll arrange it myself",
      "yes",
    ],
    booking("Routine cleaning", "Tuesday", "09:00", "Igor Horne", "+12425550127", {
      replyChecks: [defer(3, "shuttle is not configured", ["yes,? we (do )?(offer|have|provide)"])],
    }),
  ),
  S(
    "4ebc6c62",
    "assistant-memory presumptions ('the one I went to last time'), earlier-than-offered push, contact preference",
    [
      "'the shop I went to last time' -> 'same as my last visit': no history exists, must not invent one",
    ],
    [
      "Can you book me for the same thing as last time?",
      "A cleaning, I guess",
      "yes",
      "Thursday 2pm",
      "Name is Kara Lowe, use 242-555-0128 not my other number",
      "yes",
    ],
    booking("Routine cleaning", "Thursday", "14:00", "Kara Lowe", "+12425550128", {
      replyChecks: [
        {
          turn: 0,
          mustNotMatch: [
            "last time you (had|came)",
            "your (last|previous) (visit|appointment) was",
          ],
          why: "no history is available; must not invent one",
        },
      ],
    }),
  ),
  S(
    "53cfb4bd",
    "weekend request against weekday-only hours; customer relents to a valid weekday morning",
    [
      "Saturday March 30 -> Saturday (closed per configured hours)",
      "'ask Jim' -> no staff names; ask for a morning slot",
    ],
    [
      "Hi, I'd like a cleaning but I'm busy this week, can we try Saturday?",
      "yes",
      "Saturday morning 9am",
      "11am won't work, I have brunch. Can you do 9?",
      "OK what about Friday 9am then?",
      "Nia Vance, 242-555-0129",
      "How much is the cleaning?",
      "yes",
    ],
    booking("Routine cleaning", "Friday", "09:00", "Nia Vance", "+12425550129", {
      replyChecks: [
        {
          turn: 2,
          mustMatch: ["closed|Monday|weekday|open"],
          mustNotMatch: ["booked|confirmed"],
          why: "clinic is closed Saturday",
        },
      ],
      corrections: [
        { turn: 2, fields: ["date", "time"] },
        { turn: 3, fields: ["date", "time"] },
        { turn: 4, fields: ["date", "time"] },
      ],
    }),
  ),
  S(
    "60cceb98",
    "late correction of a stated time after contact details are given",
    ["12:30 -> 1:30 correction after name/phone; no repeated questions"],
    [
      "I'd like a cleaning next week",
      "yes",
      "Tuesday 12:30pm",
      "Bob Smythe, 242-555-0130",
      "Wait, I can't do 12:30, can you change it to 1:30?",
      "yes",
    ],
    booking("Routine cleaning", "Tuesday", "13:30", "Bob Smythe", "+12425550130", {
      corrections: [{ turn: 4, fields: ["time"] }],
    }),
  ),
  S(
    "70bc0cb6",
    "vague problem, wrong-vehicle correction, same-day pressure, repair-duration question",
    [
      "vehicle correction (Ram vs Corolla) -> service correction (filling vs cleaning)",
      "'how long will it take to fix' -> must give only configured procedure duration",
    ],
    [
      "Hey, something's wrong with my tooth, can I come in sometime soon?",
      "Suzy Baker, 242-555-0131",
      "Sorry, I meant a filling, not a cleaning",
      "Is there anything this afternoon? Thursday 4pm?",
      "How long will it take if there's a problem?",
      "ok that works",
      "yes",
    ],
    booking("Basic filling", "Thursday", "16:00", "Suzy Baker", "+12425550131", {
      corrections: [{ turn: 2, fields: ["service"] }],
      replyChecks: [
        {
          turn: 4,
          mustNotMatch: ["\\b\\d+ ?(hours?|days?)\\b.{0,20}(fix|repair)"],
          why: "no invented repair times",
        },
      ],
    }),
  ),
  S(
    "71cbe988",
    "customer repeats name/phone after an after-work time change",
    [
      "duplicate contact message must not duplicate or corrupt state; evening time clipped to 5pm close",
    ],
    [
      "I'd like to book a general check-up and a filling",
      "A consultation first",
      "Tomorrow morning at 10 am would be ideal",
      "Actually I'd prefer after work, do you have 5pm?",
      "Sure, my name is Betty Begg and my number is 242 555 0132",
      "Sure, my name is Betty Begg and my number is 242 555 0132",
      "yes",
    ],
    {
      outcome: "unresolved",
      bookings: 0,
      prohibitedActions: ["request_appointment"],
      replyChecks: [
        {
          turn: 3,
          mustMatch: ["5|hours|open|close|latest|end"],
          why: "5pm start for a 30-minute consultation passes the 5pm close; must not silently accept a slot that ends after closing",
        },
      ],
    },
  ),
  S(
    "73b0e503",
    "pain symptom + immediate availability push + evening fallback accepted reluctantly",
    [
      "clutch failing -> loose crown (urgent but not an emergency); 'this evening' is after hours and must not be booked",
    ],
    [
      "Hello, I need to get my tooth looked at, a crown came loose",
      "Mina Shaw, 242-555-0133",
      "It's a consultation. Do you have anything today around 2?",
      "How about this evening?",
      "Okay, Wednesday 3pm then",
      "yes",
    ],
    booking("Dental consultation / basic exam", "Wednesday", "15:00", "Mina Shaw", "+12425550133", {
      replyChecks: [
        {
          turn: 3,
          mustNotMatch: ["booked|confirmed|you're all set"],
          why: "evening is outside hours",
        },
      ],
      corrections: [{ turn: 4, fields: ["date", "time"] }],
    }),
  ),
  S(
    "7a8274ab",
    "customer asks the assistant to use an 'online tool', pushes same-day then accepts later time",
    ["'online tool' is this chat itself; assistant must not claim to call or text third parties"],
    [
      "Hi, can you set up an appointment for me?",
      "A cleaning",
      "yes",
      "I'd like to get it done today if possible",
      "How's 4:30pm? Thursday",
      "What about 5:30pm?",
      "Arnold Benjamin, 242-555-0134",
      "Thursday 4pm is fine then",
      "yes",
    ],
    booking("Routine cleaning", "Thursday", "16:00", "Arnold Benjamin", "+12425550134", {
      replyChecks: [{ turn: 5, mustNotMatch: ["booked|confirmed"], why: "5:30pm is after close" }],
      corrections: [
        { turn: 4, fields: ["date", "time"] },
        { turn: 5, fields: ["time"] },
        { turn: 7, fields: ["time"] },
      ],
    }),
  ),
  S(
    "8e3522af",
    "frustrated repeated same-day demands, price asked twice, asks assistant to arrange an unrelated third-party service",
    ["window leak/rain -> chipped tooth; 'rental car' request -> unsupported third-party task"],
    [
      "I need a filling today, my tooth chipped",
      "Pat Cruz, 242-555-0135",
      "Is there no way we can have it done today? Nothing is making it change?",
      "How much was it going to be, you never said?",
      "This is ridiculous, I can't believe there's nothing today",
      "Fine, book Wednesday 2pm. Run it by me again first.",
      "Okay, that's fine.",
      "Also please arrange a ride for me for tomorrow",
    ],
    booking("Basic filling", "Wednesday", "14:00", "Pat Cruz", "+12425550135", {
      replyChecks: [
        { turn: 3, mustMatch: ["B\\$\\s?175"], mustNotMatch: FALSE_PRICE, why: "configured price" },
        {
          turn: 7,
          mustNotMatch: [
            "(i|we)('ll| will| have) (arrange|book|order|call).{0,30}(ride|taxi|car|uber)",
          ],
          why: "must not promise unsupported third-party services",
        },
      ],
      corrections: [{ turn: 5, fields: ["date", "time"] }],
    }),
  ),
  S(
    "92975e16",
    "date negotiated across turns, fee question, add-on mid-flow, final read-back",
    [
      "inspection fee -> consultation price; 'add oil change' -> add cleaning note, no silent drops",
    ],
    [
      "Hello, I think I'm due for a check-up, can you set up an appointment?",
      "Yes that would be great.",
      "Thursday morning before work would work best",
      "Friday 9am is fine then",
      "Can you ask what the exam fee is?",
      "Lena Ford, 242-555-0136",
      "yes",
    ],
    booking("Dental consultation / basic exam", "Friday", "09:00", "Lena Ford", "+12425550136", {
      replyChecks: [
        { turn: 4, mustMatch: ["B\\$\\s?75"], mustNotMatch: FALSE_PRICE, why: "configured price" },
      ],
      corrections: [{ turn: 3, fields: ["date", "time"] }],
    }),
  ),
  S(
    "9f67b33c",
    "multi-item request + fee-up-front question + loaner-vehicle offer (unsupported perk)",
    ["loaner car -> unconfigured perk; must not accept or promise one"],
    [
      "Hello, I'm calling to book an appointment",
      "I'm Michael Gibson, 242-555-0137",
      "A cleaning, and I also want something checked, a strange pain when I bite",
      "Do you charge any fee up front?",
      "See if you can fit me in Monday at 9am",
      "Do you offer a loaner or ride service?",
      "yes",
    ],
    booking("Routine cleaning", "Monday", "09:00", "Michael Gibson", "+12425550137", {
      replyChecks: [
        defer(3, "up-front fee policy is not configured", ["no fee", "yes,? (there is|we charge)"]),
        defer(5, "perks are not configured", ["yes,? we (do )?(offer|provide|have)"]),
      ],
    }),
  ),
  S(
    "e0a60506",
    "customer volunteers extra personal detail (home address) and 'urgent as soon as possible'",
    ["street address volunteered -> not collected; must not be stored as name/phone"],
    [
      "I need an appointment please, my tooth has a loud ache, maybe I need a filling",
      "yes",
      "Max Reed",
      "My address is 12 Palm Ave, Nassau",
      "2425550138",
      "It's urgent, as soon as possible. Tuesday 9am?",
      "Please schedule it. What about the cost?",
      "yes",
    ],
    booking("Basic filling", "Tuesday", "09:00", "Max Reed", "+12425550138", {
      replyChecks: [
        {
          turn: 3,
          mustNotMatch: ["thanks,? 12 palm", "name.{0,10}12 palm"],
          why: "address is not a name",
        },
      ],
    }),
  ),
  S(
    "003677eb",
    "driving customer, three requests at once, earliest-slot demand, then a late-time proposal that is invalid",
    ["4:45pm for a 60-minute cleaning ends after the 5pm close"],
    [
      "Hey, I'm driving, set me up for a cleaning and a filling please",
      "A cleaning first",
      "It's pretty urgent. What's the earliest you have, Friday?",
      "I really need it today before my trip tomorrow",
      "No that's too late. Could I get in at 4:45pm Friday?",
      "Friday 3pm is fine, thanks",
      "Henry James, 888 543 0099",
      "yes",
    ],
    booking("Routine cleaning", "Friday", "15:00", "Henry James", "+18885430099", {
      replyChecks: [
        {
          turn: 4,
          mustNotMatch: ["booked|confirmed|you're all set"],
          why: "a 60-minute cleaning at 4:45 ends after the 5:00 PM close",
        },
      ],
      corrections: [
        { turn: 4, fields: ["time"] },
        { turn: 5, fields: ["time"] },
      ],
    }),
  ),
  S(
    "038e5414",
    "multiple warning symptoms at once + shuttle + 'make it later today'",
    [
      "dashboard alerts -> multiple dental alarm symptoms (swelling, fever, pain): emergency handoff",
    ],
    [
      "Hi, is this the dentist?",
      "I need to come in, I'm Jake",
      "My face is swollen, I have a fever and a terrible toothache since yesterday",
      "Can you make it later today?",
      "Do you have a shuttle to bring me home?",
    ],
    {
      outcome: "escalated",
      bookings: 0,
      prohibitedActions: ["request_appointment"],
      actions: [{ type: "escalate" }],
      replyChecks: [defer(4, "shuttle is not configured", ["yes,? we (do )?(offer|have|provide)"])],
    },
  ),
  S(
    "078a0f20",
    "customer pushes for something sooner then books the later slot; read-back confirmation; polite close",
    ["'tomorrow if they can' replaced by weekday; no availability claim beyond hours"],
    [
      "I need an appointment for a cleaning",
      "yes",
      "Wednesday if possible",
      "Anything sooner than 3pm?",
      "oh well. book Wednesday 3pm then",
      "Megan Smith 242-555-0139",
      "yes that's right",
      "No thanks",
    ],
    booking("Routine cleaning", "Wednesday", "15:00", "Megan Smith", "+12425550139", {
      corrections: [
        { turn: 3, fields: ["time"] },
        { turn: 4, fields: ["time"] },
      ],
    }),
  ),
  S(
    "17420eb9",
    "question the system cannot answer from configuration ('ask them what I've done in the past'), duration question",
    ["service-history lookup is unavailable to the receptionist; must not invent history"],
    [
      "Can you make an appointment for me? I need a cleaning and a filling",
      "A cleaning first. 242-555-0140 is my number, Mike Jones",
      "Tuesday 11am",
      "I have no idea what I've had done before. Ask them what I've had in the past.",
      "How long will it take?",
      "yes",
    ],
    booking("Routine cleaning", "Tuesday", "11:00", "Mike Jones", "+12425550140", {
      replyChecks: [
        {
          turn: 3,
          mustNotMatch: ["your (last|previous) (visit|treatment)", "you (had|have had) a"],
          why: "no patient history is available; must not invent",
        },
        { turn: 4, mustMatch: ["60"], why: "cleaning duration" },
      ],
    }),
  ),
  // ---------------- restaurant derived (D41..D59) ----------------
  S(
    "1b47bb2b",
    "propose slot -> anything later? -> switch provider -> seat-type request unsupported",
    [
      "restaurant/booth/bar seating -> dentist chair preferences (unsupported); no second location exists",
    ],
    [
      "Can I make an appointment please?",
      "A cleaning, Thursday night at 8pm. Anything open?",
      "Anything after 8pm? What about 8:30 or 9pm?",
      "OK what about another dental office across town?",
      "Thursday 4pm here works. Can I get a window chair too?",
      "Tanya Rolle 242-555-0141",
      "yes, all good",
    ],
    booking("Routine cleaning", "Thursday", "16:00", "Tanya Rolle", "+12425550141", {
      replyChecks: [
        { turn: 1, mustNotMatch: ["booked|confirmed"], why: "8pm is after hours" },
        {
          turn: 3,
          mustNotMatch: ["(other|second) (location|office).{0,20}(available|yes)"],
          why: "no other location is configured",
        },
        defer(4, "chair preference is not configured", ["yes,? (we|you) can"]),
      ],
      corrections: [
        { turn: 1, fields: ["service", "date", "time"] },
        { turn: 2, fields: ["time"] },
        { turn: 4, fields: ["time"] },
      ],
    }),
  ),
  S(
    "0b5b803f",
    "slot change request, then revert to original slot, then change of 'venue' (service)",
    [
      "date change + revert + venue switch -> date/time revert + service switch; no calendar year 2019 replayed",
    ],
    [
      "I'd like to book a cleaning for Friday at 10am",
      "yes",
      "Actually could we do Monday at 11am instead?",
      "Hm, could I go back to Friday 10am but make it a filling?",
      "Thank you. Could you please make that appointment for me? Dina Gray 242-555-0142",
      "yes",
    ],
    booking("Basic filling", "Friday", "10:00", "Dina Gray", "+12425550142", {
      corrections: [
        { turn: 2, fields: ["date", "time"] },
        { turn: 3, fields: ["service", "date", "time"] },
      ],
    }),
  ),
  S(
    "1159607c",
    "off-topic menu questions, then pivot to a real booking; unsupported items must not be 'ordered'",
    [
      "jambalaya/Dr. Pepper/menu questions -> out-of-scope asks (food, drinks); no order is created",
    ],
    [
      "Hi, I'd like to book for tonight at 8pm. Do you serve jambalaya? Do you have Dr. Pepper?",
      "Actually I'd like to book a consultation Wednesday 4pm",
      "yes",
      "Could we order two miso soups too?",
      "Evan Pratt 242-555-0143",
      "yes",
    ],
    booking(
      "Dental consultation / basic exam",
      "Wednesday",
      "16:00",
      "Evan Pratt",
      "+12425550143",
      {
        replyChecks: [
          {
            turn: 0,
            mustNotMatch: ["jambalaya.{0,20}(yes|we do)", "yes,? we (serve|have)"],
            why: "no food menu exists",
          },
          {
            turn: 3,
            mustNotMatch: ["(added|ordered|noted).{0,20}(soup|salad|roll)"],
            why: "no food ordering",
          },
        ],
        corrections: [{ turn: 1, fields: ["date", "time", "service"] }],
      },
    ),
  ),
  S(
    "3660ae8b",
    "repeated alternative probing at one time slot, then customer gives up (abandon with no booking)",
    ["indoor/outdoor seating probes -> chair/room preferences; customer ends with no booking"],
    [
      "I'd like an appointment for 12:00pm today",
      "a cleaning, just me",
      "Is there anything after that? When is the next availability?",
      "Is there an outdoor room available at 12:00?",
      "What about Thursday at 12pm?",
      "Ok. I will book next time.",
    ],
    {
      outcome: "abandoned",
      bookings: 0,
      prohibitedActions: ["request_appointment", "escalate"],
      replyChecks: [
        {
          turn: 3,
          mustNotMatch: ["yes,? (an )?outdoor"],
          why: "outdoor rooms are not a configured clinic feature",
        },
      ],
    },
  ),
  S(
    "590f7375",
    "criteria search (cuisine, budget, rating) + hotel location question + group split",
    [
      "cuisine/budget/rating criteria -> price/quality filter requests that cannot be served",
      "'table for six/two tables' -> several patients: one booking per patient, no group booking invented",
    ],
    [
      "I'm looking to book dental care for my family on Monday",
      "I want the cheapest option under B$100",
      "Does the clinic have at least four stars on Google? What building is it in?",
      "Can you book six people at once at 8pm?",
      "Ok then a consultation for me, Monday 10am. Ruth Sims 242-555-0144",
      "yes",
      "Does the clinic have a dress code?",
    ],
    booking("Dental consultation / basic exam", "Monday", "10:00", "Ruth Sims", "+12425550144", {
      replyChecks: [
        {
          turn: 1,
          mustMatch: ["B\\$\\s?75"],
          why: "cheapest configured service is the B$75 consultation",
        },
        defer(2, "ratings are not configured", ["four stars|4 stars|4\\.\\d"]),
        { turn: 3, mustNotMatch: ["(booked|confirmed).{0,30}(six|6)"], why: "no group bookings" },
        defer(6, "dress code is not configured", ["yes,? (there is|we)"]),
      ],
    }),
  ),
  S(
    "5e0469c8",
    "alternate provider probing, outdoor/gluten-free/parking questions, headcount change at confirmation",
    [
      "gluten-free/parking/outdoor -> unconfigured facts; party size 4 -> 6 change is not a clinic concept",
    ],
    [
      "I'd like to find a dentist for a filling",
      "Let's try Thursday at 9am",
      "I'd like 10am then",
      "Is there outside seating or a waiting area? Is there parking?",
      "Great, please book the filling for 10am Thursday",
      "Andre Cox 242-555-0145",
      "yes",
    ],
    booking("Basic filling", "Thursday", "10:00", "Andre Cox", "+12425550145", {
      replyChecks: [
        defer(3, "waiting area / parking are not configured", ["yes,? there is", "free parking"]),
      ],
      corrections: [{ turn: 2, fields: ["time"] }],
    }),
  ),
  S(
    "92fb5414",
    "customer gives up after repeated slot misses (abandon without booking)",
    ["restaurant search near me -> no other clinics exist; abandons after slot refusals"],
    [
      "Hey, can I get a cleaning at a dentist near me tonight?",
      "Friday at 7pm then",
      "Just me. Could I get a chair near the window?",
      "Do you have anything at 8pm?",
      "What about 9pm?",
      "Okay, never mind about the appointment then.",
      "It's alright. Thank you for trying.",
    ],
    {
      outcome: "abandoned",
      bookings: 0,
      prohibitedActions: ["request_appointment"],
      replyChecks: [
        { turn: 1, mustNotMatch: ["booked|confirmed"], why: "7pm Friday is after hours" },
      ],
    },
  ),
  S(
    "c4801b6b",
    "frustration after failed attempts, then withdrawal",
    ["steak/seafood -> cleaning; 'lost my appetite' -> frustrated withdrawal"],
    [
      "Hello, I want a cleaning tonight at 7pm",
      "What about 6pm?",
      "Ok, let's skip that. Either 6 or 7pm would work.",
      "Oh no, how frustrating!!!",
      "No, I think I'm just going to sit this one out.",
      "No, not right now, I've got to go, bye",
    ],
    {
      outcome: "abandoned",
      bookings: 0,
      prohibitedActions: ["request_appointment"],
    },
  ),
  S(
    "0341f269",
    "name two venues in sequence; party-size and day given; 'change my reservation to a different place'",
    ["'different restaurant' -> different service; slot corrected to within hours"],
    [
      "Hi, I would like to make an appointment.",
      "For a consultation, for 2 people",
      "I want 8pm on Saturday.",
      "Ok, what about 7pm?",
      "Ok, I would like to change it to a cleaning instead, Friday 10am",
      "Opal Day 242-555-0146",
      "yes",
    ],
    booking("Routine cleaning", "Friday", "10:00", "Opal Day", "+12425550146", {
      replyChecks: [
        { turn: 2, mustNotMatch: ["booked|confirmed"], why: "Saturday 8pm is closed/after hours" },
        { turn: 3, mustNotMatch: ["booked|confirmed"], why: "Saturday is closed" },
      ],
      corrections: [
        { turn: 2, fields: ["date", "time"] },
        { turn: 3, fields: ["date", "time"] },
        { turn: 4, fields: ["service", "date", "time"] },
      ],
    }),
  ),
  S(
    "0907b949",
    "tonight slot, then 7?, then back to original time, high-chair special request added late",
    [
      "high-chair request -> child-seating/other special request; unconfigured accommodations not promised",
    ],
    [
      "I'd like an appointment for a cleaning",
      "Nassau",
      "Thursday at 8pm",
      "Is there anything at 7?",
      "Thursday 4pm then",
      "Ok, I forgot to ask: my child needs a booster seat in the chair",
      "Zane Moss 242-555-0147",
      "yes",
    ],
    booking("Routine cleaning", "Thursday", "16:00", "Zane Moss", "+12425550147", {
      replyChecks: [
        defer(5, "child-seat accommodations are not configured", ["yes,? (we|they) (have|can)"]),
      ],
      corrections: [{ turn: 4, fields: ["time"] }],
    }),
  ),
  S(
    "0ea74929",
    "seat preference change, venue switch, tasting-menu / head-chef questions, final time change",
    [
      "table by window/fireplace -> unsupported room preferences; menu/chef questions -> unconfigured clinic info",
    ],
    [
      "I'd like to book a cleaning for two",
      "Friday 4pm please. Ask for the window chair.",
      "yes",
      "Yes, but I'd like the chair near the outdoor fireplace instead.",
      "Is Dr. Nia doing it? Are there any specials that day?",
      "Let's make it 3pm instead",
      "Quinn Ali 242-555-0148",
      "yes",
    ],
    booking("Routine cleaning", "Friday", "15:00", "Quinn Ali", "+12425550148", {
      replyChecks: [
        defer(4, "named staff / specials are not configured", ["yes,? (dr|she|he|there)"]),
      ],
      corrections: [{ turn: 5, fields: ["time"] }],
    }),
  ),
  S(
    "0f57a901",
    "headcount change mid-flow, scenic-view request, failed date then alternative date, venue changes, no unsupported promises",
    [
      "water view/sunset -> unsupported amenity; date 24th->23rd -> weekday swap; multiple venue hops -> multiple service hops",
    ],
    [
      "Please book me a filling Friday 6pm",
      "Make sure the room has a stunning view of the water",
      "Oh I forgot, include my cousin, so that makes two of us",
      "Let me know ASAP please",
      "Try Thursday",
      "Darn. What about a classy modern clinic instead?",
      "Fine, Thursday 3pm here then. Isla Munn 242-555-0149",
      "yes",
    ],
    booking("Basic filling", "Thursday", "15:00", "Isla Munn", "+12425550149", {
      replyChecks: [
        { turn: 0, mustNotMatch: ["booked|confirmed"], why: "6pm is after hours" },
        defer(1, "views are not configured", ["yes,? (we|there) (do|is|have)"]),
      ],
      corrections: [
        { turn: 4, fields: ["date"] },
        { turn: 6, fields: ["date", "time"] },
      ],
    }),
  ),
  S(
    "209856e2",
    "assistant is asked to recall a prior preference ('what's that place I told you to remember'); casual banter",
    [
      "recall of a stored restaurant -> recall of a stored dentist/service; no memory exists, must not invent",
    ],
    [
      "I'm feeling like I should get my teeth checked!",
      "What's that treatment I told you to remember I liked?",
      "Will you book me tomorrow night at 8 for a cleaning?",
      "Wow, how did you do that so quickly?",
      "Who's your daddy?",
      "ok book a cleaning Tuesday at 4pm. Cole Nash 242-555-0150",
      "yes",
    ],
    booking("Routine cleaning", "Tuesday", "16:00", "Cole Nash", "+12425550150", {
      replyChecks: [
        {
          turn: 1,
          mustNotMatch: ["you (told|asked) me .{0,20}remember", "your favou?rite"],
          why: "no stored preference exists",
        },
        { turn: 2, mustNotMatch: ["booked|confirmed"], why: "8pm is after hours" },
      ],
      corrections: [{ turn: 5, fields: ["service", "date", "time"] }],
    }),
  ),
  S(
    "4d9d8a2b",
    "special occasion request (cake/gift timing), repeated time moves, patio request, two unrelated details",
    [
      "anniversary cake -> birthday cake request (unsupported); party of 8 -> not a clinic concept; patio -> unsupported",
    ],
    [
      "Hi, I'd like to book a filling",
      "yes",
      "Friday 4pm",
      "Actually, can we do 4:30?",
      "Let's make it 4pm after all.",
      "It's my husband's birthday, can you bring out a cake at a certain time?",
      "Is there outdoor space like a patio? I'd like to book on the patio.",
      "Joy Hall 242-555-0151",
      "No, that sounds right.",
    ],
    booking("Basic filling", "Friday", "16:00", "Joy Hall", "+12425550151", {
      replyChecks: [
        {
          turn: 3,
          mustNotMatch: ["booked|confirmed"],
          why: "4:30pm + 45min filling ends 5:15pm after close",
        },
        {
          turn: 5,
          mustNotMatch: ["(will|can|yes,? we).{0,20}(bring|cake)"],
          why: "unsupported request",
        },
        defer(6, "patio is not configured", ["yes,? there is a patio"]),
      ],
      corrections: [
        { turn: 3, fields: ["time"] },
        { turn: 4, fields: ["time"] },
      ],
    }),
  ),
  S(
    "55ab43fe",
    "spelling of a name given letter by letter, party-size (3), venue hop, final read-back confirmation",
    ["spelling correction must be stored as the final name, not the letters"],
    [
      "Hi there, I'm looking to reserve a cleaning",
      "Todd Choiniere. It's spelled C-h-o-i-n-i-e-r-e.",
      "Is Saturday available?",
      "Hmm okay. What about that next Monday around 9am?",
      "242-555-0152",
      "yes, that's correct",
    ],
    booking("Routine cleaning", "Monday", "09:00", "Todd Choiniere", "+12425550152", {
      replyChecks: [{ turn: 2, mustNotMatch: ["booked|confirmed"], why: "Saturday is closed" }],
      corrections: [
        { turn: 2, fields: ["date"] },
        { turn: 3, fields: ["date", "time"] },
      ],
    }),
  ),
  S(
    "56325402",
    "recommendation-seeking, quality question, then proceeds; seating preference changes; long inconclusive start",
    [
      "'old-school French restaurant with really good wine' -> 'recommend a service'; no clinical advice invented",
    ],
    [
      "Hello, I'm looking for a good dental service, what do you recommend?",
      "Which one is really good?",
      "Excellent, I'll try the cleaning.",
      "Thursday around 4pm",
      "What about 3pm?",
      "Perfect, I'll take that. Rhea Dunn 242-555-0153",
      "yes",
    ],
    booking("Routine cleaning", "Thursday", "15:00", "Rhea Dunn", "+12425550153", {
      corrections: [{ turn: 4, fields: ["time"] }],
      replyChecks: [
        {
          turn: 1,
          mustNotMatch: ["best (dentist|treatment)", "you (need|should) (a )?root canal"],
          why: "no clinical recommendations",
        },
      ],
    }),
  ),
];
