/**
 * Realistic fake conversations for demo mode and the simulation. Each one
 * produces ElevenLabs-shaped webhook payloads (same fields as the real
 * post-call webhooks), so the whole pipeline is exercised end to end.
 */

export const SCENARIOS = [
  "happy",
  "meds_missed",
  "short_answers",
  "lonely",
  "robot_question",
  "scam_otp",
  "urdu",
  "hard_of_hearing",
  "talks_forever",
  "fall",
  "chest_pain",
  "hopeless",
  "opt_out",
  "consent_yes",
  "consent_no",
  "consent_unclear",
  "wrong_person",
  "silence",
  "no_answer",
  "busy",
  "voicemail",
  "lost_webhook",
] as const;

export type Scenario = (typeof SCENARIOS)[number];

export const SCENARIO_LABELS: Record<Scenario, string> = {
  happy: "Happy chat, took medicines",
  meds_missed: "Forgot a medicine",
  short_answers: "Only says 'theek hai'",
  lonely: "Feeling lonely",
  robot_question: "Asks 'are you a robot?'",
  scam_otp: "Tries to share an OTP",
  urdu: "Speaks Urdu",
  hard_of_hearing: "Hard of hearing",
  talks_forever: "Wants to talk forever (time limit)",
  fall: "Mentions a fall (red flag)",
  chest_pain: "Mentions chest pain (red flag)",
  hopeless: "Says something hopeless",
  opt_out: "Asks to stop the calls",
  consent_yes: "Introduction call: says yes",
  consent_no: "Introduction call: says no",
  consent_unclear: "Introduction call: unclear",
  wrong_person: "Someone else answers",
  silence: "Picks up but silence",
  no_answer: "Doesn't pick up",
  busy: "Line busy",
  voicemail: "Phone switched off / voicemail",
  lost_webhook: "Answered, but the result webhook is lost",
};

type Vars = Record<string, unknown>;
type Turn = { role: "agent" | "user"; message: string };

interface Built {
  turns: Turn[];
  data: Record<string, string | number | boolean | null>;
  callResult: "answered" | "voicemail" | "busy" | "no_answer" | "failed";
  initiationFailure?: "busy" | "no-answer";
}

const v = (vars: Vars, key: string, fallback = ""): string => {
  const x = vars[key];
  return typeof x === "string" && x !== "none" ? x : fallback;
};

function medsList(vars: Vars): string[] {
  return v(vars, "medicines_due_now")
    .split(",")
    .map((s) => s.replace(/\(.*?\)/g, "").trim())
    .filter(Boolean);
}

function medsAnswer(names: string[], missed: string[] = []): string {
  return names.map((n) => `${n}: ${missed.includes(n) ? "no" : "yes"}`).join("; ");
}

function opening(vars: Vars): Turn[] {
  const a = v(vars, "address_as", "ji");
  const name = v(vars, "assistant_name", "Roshni");
  const fam = v(vars, "family_member_name", "aapke bachche");
  return [
    {
      role: "agent",
      message: `Namaste ${a}! Main ${name} bol rahi hoon, ${fam} ki taraf se aapka haal-chaal poochne ke liye. Kaisi hain aap aaj?`,
    },
  ];
}

function medsTurns(vars: Vars, missed: string[]): Turn[] {
  const meds = medsList(vars);
  if (meds.length === 0) return [];
  const turns: Turn[] = [
    { role: "agent", message: `Aur aaj ki dawai, ${meds.join(" aur ")}, le li aapne?` },
  ];
  if (missed.length === 0)
    turns.push({ role: "user", message: "Haan beta, subah naashte ke baad le li thi." });
  else {
    turns.push({ role: "user", message: `Arre, ${missed[0]} toh bhool gayi aaj, abhi leti hoon.` });
    turns.push({
      role: "agent",
      message: "Koi baat nahi, abhi le lijiye aaram se. Aur paani zaroor pee lijiyega.",
    });
  }
  return turns;
}

function closing(vars: Vars): Turn[] {
  return [
    {
      role: "agent",
      message: `Achha ${v(vars, "address_as", "ji")}, aapse baat karke bahut achha laga. Apna khayal rakhiyega, kal phir baat karte hain. Namaste!`,
    },
  ];
}

function noteTurns(vars: Vars): Turn[] {
  const note = v(vars, "family_note_for_today");
  if (!note) return [];
  return [
    { role: "agent", message: `Ek baat aur, ghar se khabar aayi hai: ${note}.` },
    { role: "user", message: "Achha! Sunke bahut khushi hui." },
  ];
}

/** Hindi agent verbs follow the assistant's gender. */
export function genderAgentText(text: string, gender: string): string {
  if (gender !== "male") return text;
  return text
    .replace(
      /\b(rahi|sakti|deti|karti|maangti|leti|samajh gayi)\b/g,
      (m) =>
        ({
          rahi: "raha",
          sakti: "sakta",
          deti: "deta",
          karti: "karta",
          maangti: "maangta",
          leti: "leta",
          "samajh gayi": "samajh gaya",
        })[m] ?? m,
    )
    .replace(/\bkarungi\b/g, "karunga");
}

export function buildScenario(scenario: Scenario, vars: Vars): Built {
  const built = buildScenarioInner(scenario, vars);
  const gender =
    typeof vars["assistant_gender"] === "string" ? (vars["assistant_gender"] as string) : "female";
  return {
    ...built,
    turns: built.turns.map((t) =>
      t.role === "agent" ? { ...t, message: genderAgentText(t.message, gender) } : t,
    ),
  };
}

function buildScenarioInner(scenario: Scenario, vars: Vars): Built {
  const a = v(vars, "address_as", "ji");
  const meds = medsList(vars);
  const isConsent = v(vars, "is_consent_call") === "yes";
  const base = {
    consent_given: isConsent ? "yes" : null,
    wants_to_stop_calls: false,
    red_flag: false,
    distress: false,
  } as const;

  switch (scenario) {
    case "no_answer":
      return { turns: [], data: {}, callResult: "no_answer", initiationFailure: "no-answer" };
    case "busy":
      return { turns: [], data: {}, callResult: "busy", initiationFailure: "busy" };
    case "voicemail":
      return {
        turns: [
          { role: "agent", message: `Namaste ${a}!` },
          {
            role: "user",
            message:
              "Aapke dwara dial kiya gaya number abhi uplabdh nahi hai, kripya thodi der baad call karein.",
          },
        ],
        data: {},
        callResult: "voicemail",
      };
    case "silence":
      return {
        turns: [{ role: "agent", message: `Namaste ${a}? Kya aap sun pa rahi hain?` }],
        data: {},
        callResult: "answered",
      };
    case "wrong_person":
      return {
        turns: [
          ...opening(vars),
          { role: "user", message: "Main unki padosan bol rahi hoon, woh mandir gayi hain." },
          {
            role: "agent",
            message:
              "Achha, koi baat nahi. Unhe bata dijiyega ki unke ghar walon ki taraf se phone aaya tha. Dhanyavaad!",
          },
        ],
        data: {
          ...base,
          mood: null,
          summary_for_family_en: `A neighbour answered and said ${a} had gone to the temple. We'll try again at the next call.`,
          summary_for_family_hi: `पड़ोसी ने फ़ोन उठाया, बताया कि ${a} मंदिर गई हैं। अगली बार फिर बात करेंगे।`,
        },
        callResult: "answered",
      };
    case "consent_yes":
    case "consent_no":
    case "consent_unclear": {
      const name = v(vars, "assistant_name", "Roshni");
      const fam = v(vars, "family_member_name", "aapke bachche");
      const time = v(vars, "call_time", "subah");
      const answer =
        scenario === "consent_yes"
          ? "Haan haan, zaroor karna. Achha lagega baat karke."
          : scenario === "consent_no"
            ? "Nahi beta, mujhe roz roz phone nahi chahiye. Main theek hoon."
            : "Pata nahi... dekhte hain.";
      return {
        turns: [
          {
            role: "agent",
            message: `Namaste ${a}! Main ${name} hoon, ek AI assistant. ${fam} ne mujhe set kiya hai taaki main roz ${time} ke aas-paas aapka haal-chaal pooch sakoon, aur unhe ek chhota sa note bhej sakoon.`,
          },
          { role: "user", message: "Achha, robot ho tum?" },
          {
            role: "agent",
            message:
              "Ji, main ek AI assistant hoon, insaan nahi. Main kabhi paise ya OTP nahi maangti. Kya main roz aapko phone kar sakti hoon?",
          },
          { role: "user", message: answer },
          ...(scenario === "consent_yes"
            ? closing(vars)
            : [
                {
                  role: "agent" as const,
                  message:
                    "Koi baat nahi, main aapke ghar walon ko bata deti hoon. Apna khayal rakhiye. Namaste!",
                },
              ]),
        ],
        data: {
          ...base,
          consent_given:
            scenario === "consent_yes" ? "yes" : scenario === "consent_no" ? "no" : "unclear",
          mood: 4,
          mood_words: "theek hoon",
        },
        callResult: "answered",
      };
    }
    case "opt_out":
      return {
        turns: [
          ...opening(vars),
          {
            role: "user",
            message: "Dekho beta, ye phone mat karo roz. Mujhe nahi chahiye ye sab.",
          },
          {
            role: "agent",
            message:
              "Bilkul, main samajh gayi. Ab main phone nahi karungi, aur ghar walon ko bata deti hoon. Apna khayal rakhiye.",
          },
        ],
        data: { ...base, wants_to_stop_calls: true, mood: 3, mood_words: "thodi pareshan" },
        callResult: "answered",
      };
    case "fall":
      return {
        turns: [
          ...opening(vars),
          {
            role: "user",
            message: "Beta aaj subah bathroom mein gir gayi thi, kamar mein bahut dard hai.",
          },
          {
            role: "agent",
            message: `Oh, ${a}, mujhe bahut chinta ho rahi hai. Kya aapke paas abhi koi hai? Kripya abhi ghar walon ko ya 112 pe phone kariye. Main abhi aapke ghar walon ko bata rahi hoon.`,
          },
          { role: "user", message: "Haan, Kamla bai aa rahi hai." },
          {
            role: "agent",
            message:
              "Theek hai, aap aaram se baithiye, hilna mat zyada. Main ab phone rakhti hoon taaki ghar wale aapko call kar sakein.",
          },
        ],
        data: {
          ...base,
          red_flag: true,
          red_flag_detail: "said she fell in the bathroom this morning and has back pain",
          mood: 2,
          mood_words: "dard mein",
          pain_or_symptoms: "back pain after a fall",
        },
        callResult: "answered",
      };
    case "chest_pain":
      return {
        turns: [
          ...opening(vars),
          {
            role: "user",
            message: "Thoda seene mein dard ho raha hai subah se, aur saans bhi phool rahi hai.",
          },
          {
            role: "agent",
            message: `${a}, ye zaroori hai. Kripya abhi ghar walon ko ya 112 pe phone kariye. Kya paas mein koi hai? Main turant aapke ghar walon ko bata rahi hoon.`,
          },
        ],
        data: {
          ...base,
          red_flag: true,
          red_flag_detail: "mentioned chest pain since morning and breathlessness",
          mood: 2,
          pain_or_symptoms: "chest pain, breathlessness",
        },
        callResult: "answered",
      };
    case "hopeless":
      return {
        turns: [
          ...opening(vars),
          {
            role: "user",
            message: "Kya batayein beta, ab jeene ka mann nahi karta. Sab apne mein busy hain.",
          },
          {
            role: "agent",
            message:
              "Aapne ye baat mujhse kahi, ye bahut himmat ki baat hai. Aap akeli nahi hain. Tele-MANAS ka number hai 1-4-4-1-6, wahan muft mein baat kar sakti hain. Main aapke ghar walon ko bhi bata rahi hoon ki aapse baat karein.",
          },
        ],
        data: { ...base, distress: true, mood: 1, mood_words: "jeene ka mann nahi karta" },
        callResult: "answered",
      };
    case "meds_missed": {
      const missed = meds.length ? [meds[0]!] : [];
      return {
        turns: [
          ...opening(vars),
          { role: "user", message: "Theek hoon beta, bas thodi thakaan hai." },
          ...medsTurns(vars, missed),
          ...noteTurns(vars),
          ...closing(vars),
        ],
        data: {
          ...base,
          mood: 3,
          mood_words: "thodi thakaan",
          ate_meals: "had poha for breakfast",
          medicines_taken: medsAnswer(meds, missed),
          sleep: "slept okay",
          follow_up_for_next_call: missed.length ? `ask if she took ${missed[0]}` : null,
        },
        callResult: "answered",
      };
    }
    case "short_answers":
      return {
        turns: [
          ...opening(vars),
          { role: "user", message: "Theek hai." },
          { role: "agent", message: "Aaj khaane mein kya banaya aapne?" },
          { role: "user", message: "Theek hai, sab." },
          { role: "agent", message: "Achha. Aur neend kaisi aayi raat ko?" },
          { role: "user", message: "Theek." },
          ...closing(vars),
        ],
        data: {
          ...base,
          mood: 3,
          mood_words: "theek hai",
          ate_meals: null,
          medicines_taken: meds.length ? meds.map((m) => `${m}: unclear`).join("; ") : null,
          sleep: "said 'theek'",
        },
        callResult: "answered",
      };
    case "lonely":
      return {
        turns: [
          ...opening(vars),
          {
            role: "user",
            message: "Bas beta, akele mann nahi lagta. Din bhar TV dekhti rehti hoon.",
          },
          {
            role: "agent",
            message:
              "Samajh sakti hoon. Aapko purane gaane pasand hain na? Aaj kaun sa gaana suna?",
          },
          { role: "user", message: "Haan! Lata ji ka 'Lag ja gale' suna subah." },
          ...medsTurns(vars, []),
          ...closing(vars),
        ],
        data: {
          ...base,
          mood: 2,
          mood_words: "akele mann nahi lagta",
          ate_meals: "had dal-roti for lunch",
          medicines_taken: medsAnswer(meds),
          sleep: "slept fine",
          notable_moments:
            "Listened to 'Lag ja gale' this morning and enjoyed talking about old songs.",
          follow_up_for_next_call: "ask about her favourite songs",
        },
        callResult: "answered",
      };
    case "robot_question":
      return {
        turns: [
          ...opening(vars),
          { role: "user", message: "Ruko ruko, tum robot ho kya? Insaan ho?" },
          {
            role: "agent",
            message: `Achha sawaal hai ${a}. Main ek AI assistant hoon, insaan nahi. ${v(vars, "family_member_name", "Aapke bachchon")} ne mujhe set kiya hai aapka haal poochne ke liye.`,
          },
          { role: "user", message: "Achha achha. Theek hai, main badhiya hoon aaj." },
          ...medsTurns(vars, []),
          ...closing(vars),
        ],
        data: {
          ...base,
          mood: 4,
          mood_words: "badhiya",
          medicines_taken: medsAnswer(meds),
          ate_meals: "had khichdi",
        },
        callResult: "answered",
      };
    case "scam_otp":
      return {
        turns: [
          ...opening(vars),
          {
            role: "user",
            message: "Beta ek message aaya hai bank ka, OTP 4 5 1 2 hai, tumhe chahiye?",
          },
          {
            role: "agent",
            message:
              "Nahi nahi, kabhi kisi ko OTP mat bataiye, mujhe bhi nahi. Main kabhi OTP, paise ya bank details nahi maangti. Agar koi phone pe maange, toh wo dhokha hai.",
          },
          { role: "user", message: "Achha theek hai, dhanyavaad beta." },
          ...medsTurns(vars, []),
          ...closing(vars),
        ],
        data: {
          ...base,
          mood: 4,
          medicines_taken: medsAnswer(meds),
          notable_moments:
            "Received a suspicious bank OTP message; we reminded her never to share OTPs.",
          follow_up_for_next_call: "remind about not sharing OTPs",
        },
        callResult: "answered",
      };
    case "urdu":
      return {
        turns: [
          {
            role: "agent",
            message: `Assalam-o-alaikum ${a}! Main ${v(vars, "assistant_name", "Roshni")} baat kar rahi hoon. Aaj tabiyat kaisi hai?`,
          },
          {
            role: "user",
            message:
              "Walaikum assalam. Allah ka shukr hai, tabiyat theek hai. Aaj nihari banayi thi.",
          },
          ...medsTurns(vars, []),
          ...closing(vars),
        ],
        data: {
          ...base,
          mood: 4,
          mood_words: "Allah ka shukr hai",
          ate_meals: "made nihari",
          medicines_taken: medsAnswer(meds),
        },
        callResult: "answered",
      };
    case "hard_of_hearing":
      return {
        turns: [
          ...opening(vars),
          { role: "user", message: "Kya? Zor se boliye, sunai nahi diya." },
          { role: "agent", message: `${a}... aap... kaisi... hain... aaj?` },
          { role: "user", message: "Haan haan, theek hoon. Ghutne mein thoda dard hai bas." },
          ...medsTurns(vars, []),
          ...closing(vars),
        ],
        data: {
          ...base,
          mood: 3,
          pain_or_symptoms: "some knee pain",
          medicines_taken: medsAnswer(meds),
          follow_up_for_next_call: "ask about knee pain",
        },
        callResult: "answered",
      };
    case "talks_forever":
      return {
        turns: [
          ...opening(vars),
          {
            role: "user",
            message:
              "Arre beta, aaj toh bahut baatein hain! Pehle toh sunao, Sharma ji ke bete ki shaadi mein...",
          },
          { role: "agent", message: "Wah, ye toh bahut mazedaar hai! Aage bataiye." },
          {
            role: "user",
            message: "...aur phir unhone kaha ki halwai ko bulao, aur mere zamane mein toh...",
          },
          ...medsTurns(vars, []),
          {
            role: "agent",
            message: `${a}, aapki baatein sunke bahut maza aaya. Ab mujhe jaana hoga, kal aur sunaiyega! Apna khayal rakhiye.`,
          },
        ],
        data: {
          ...base,
          mood: 5,
          mood_words: "bahut khush",
          medicines_taken: medsAnswer(meds),
          notable_moments: "Told a long, happy story about a wedding in the neighbourhood.",
          follow_up_for_next_call: "ask the rest of the wedding story",
        },
        callResult: "answered",
      };
    case "lost_webhook":
    case "happy":
    default:
      return {
        turns: [
          ...opening(vars),
          { role: "user", message: "Main bilkul theek hoon beta! Aaj dhoop achhi nikli hai." },
          { role: "agent", message: "Wah, ye toh achhi baat hai. Aaj lunch mein kya banaya?" },
          { role: "user", message: "Dal chawal aur bhindi ki sabzi." },
          ...medsTurns(vars, []),
          { role: "agent", message: "Aur raat ko neend kaisi aayi?" },
          { role: "user", message: "Achhi aayi, bas ek baar uthi thi." },
          ...noteTurns(vars),
          ...closing(vars),
        ],
        data: {
          ...base,
          mood: 5,
          mood_words: "bilkul theek",
          ate_meals: "had dal-chawal and bhindi for lunch",
          medicines_taken: meds.length ? medsAnswer(meds) : null,
          sleep: "slept well, woke once",
          pain_or_symptoms: null,
          notable_moments: "Enjoyed the sunshine today.",
          follow_up_for_next_call: null,
        },
        callResult: "answered",
      };
  }
}

/** Seconds of talking per scenario (roughly). */
export function scenarioDuration(s: Scenario, maxSecs: number): number {
  const d: Partial<Record<Scenario, number>> = {
    voicemail: 9,
    silence: 25,
    wrong_person: 40,
    short_answers: 70,
    fall: 95,
    chest_pain: 80,
    hopeless: 110,
    opt_out: 45,
    talks_forever: maxSecs,
    consent_yes: 100,
    consent_no: 80,
    consent_unclear: 90,
  };
  return Math.min(maxSecs, d[s] ?? 180 + (s.length % 5) * 12);
}
