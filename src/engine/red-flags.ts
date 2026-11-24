/**
 * Server-side safety net: scan what the PARENT said (never the assistant's
 * own questions) for words that suggest an emergency or deep distress, in
 * Hindi (Devanagari), romanised Hindi/Urdu and English.
 *
 * This runs IN ADDITION to the agent's own red_flag field. We prefer a few
 * false alarms over a missed fall: the alert quotes the words so the family
 * can judge.
 */
import type { TranscriptTurn } from "@/db/schema/app";

interface Rule {
  /** Shown to the family, e.g. "a fall". */
  label: string;
  patterns: RegExp[];
  /** Ignore if a negation follows within a few words ("chakkar nahi aaya"). */
  negatable?: boolean;
}

// Word boundary that also works around Devanagari (JS \b is ASCII-only).
const B = "(?<![\\p{L}\\p{M}])";
const E = "(?![\\p{L}\\p{M}])";
const w = (s: string) => new RegExp(`${B}${s}${E}`, "iu");

export const RED_FLAG_RULES: Rule[] = [
  {
    label: "a fall",
    patterns: [
      w("gir (?:gaya|gayi|gai|gayee|gaye|padi|pada|padee|padaa)"),
      w("gir ke"),
      w("fisal (?:gaya|gayi|gai|gaye)"),
      w("गिर (?:गया|गई|गयी|गए|पड़ी|पड़ा)"),
      w("फिसल (?:गया|गई|गयी)"),
      w("(?:i |had a |a )?(?:fell|fallen|have fallen)"),
      w("slipped"),
    ],
  },
  {
    label: "chest pain",
    patterns: [
      w(
        "(?:seene|sine|seeney|chhati|chhaati|chaati|chati) (?:me|mein|mai|main|men) (?:dard|dukh|jalan|bhaaripan)",
      ),
      w("(?:सीने|छाती) (?:में|मे) (?:दर्द|जलन|भारीपन)"),
      w("chest pain"),
      w("pain in (?:my|the) chest"),
      w("heart attack"),
      w("dil ka daura"),
      w("दिल का दौरा"),
    ],
  },
  {
    label: "breathing trouble",
    patterns: [
      w("(?:saans|sans|saas|saans?) (?:nahi|nahin|nai) (?:aa|aa rahi|aa raha|le pa)"),
      w("(?:saans|sans) (?:phool|fool|ukhad|ruk)"),
      w("(?:साँस|सांस) (?:नहीं|फूल|रुक)"),
      w("(?:can'?t|cannot|can not) breathe"),
      w("short(?:ness)? of breath"),
      w("breathless"),
    ],
  },
  {
    label: "dizziness or fainting",
    negatable: true,
    patterns: [
      w("chakk?ar (?:aa|aaya|aayi|aate|aata|aa gaya|aa raha|aa rahe)"),
      w("behosh"),
      w("bezosh"),
      w("चक्कर"),
      w("बेहोश"),
      w("dizzy"),
      w("faint(?:ed|ing)?"),
      w("passed out"),
      w("unconscious"),
    ],
  },
  {
    label: "bleeding or injury",
    negatable: true,
    patterns: [
      w("khoon (?:nikal|beh|aa|aaya)"),
      w("chot (?:lagi|lag gayi|lag gai|aayi)"),
      w("खून"),
      w("चोट"),
      w("bleeding"),
      w("blood"),
      w("injur(?:ed|y)"),
    ],
  },
  {
    label: "hospital or ambulance",
    negatable: true,
    patterns: [
      w("ambulance"),
      w("एम्बुलेंस"),
      w("hospital"),
      w("aspatal|haspatal"),
      w("अस्पताल"),
      w("emergency"),
    ],
  },
  {
    label: "possible stroke or confusion",
    patterns: [
      w("lakwa|lakhwa"),
      w("लकवा"),
      w("stroke"),
      w("(?:muh|munh|मुँह) (?:tedha|टेढ़ा)"),
      w("kuch samajh nahi aa raha"),
      w("confused"),
    ],
  },
];

export const DISTRESS_RULES: Rule[] = [
  {
    label: "not wanting to live",
    patterns: [
      w("jeene ka (?:mann|man|mn) nahi"),
      w("जीने का मन नहीं"),
      w("mar (?:jaana|jana|jaun|jaaun|jaati|jaata) (?:chahti|chahta|achha|behtar)"),
      w("marna chah(?:ti|ta)"),
      w("मर जा(?:ना|ऊँ|ऊं)"),
      w("zindagi se thak"),
      w("ज़िंदगी से थक|जिंदगी से थक"),
      w("kya fayda jeene ka"),
      w("(?:want|wanted) to die"),
      w("no point (?:in )?living"),
      w("end (?:my|it) (?:life|all)"),
      w("suicide|khudkushi|aatmahatya|आत्महत्या|ख़ुदकुशी"),
      w("bhagwan (?:utha|bula) le"),
      w("allah (?:utha|bula) le"),
      w("upar wala (?:utha|bula) le"),
    ],
  },
];

const NEGATION = /^(?:\s*\S+){0,2}?\s*(?:nahi|nahin|nai|na|not|no|नहीं|ना)(?![\p{L}\p{M}])/iu;

export interface FlagHit {
  label: string;
  quote: string;
}

function scan(turns: TranscriptTurn[], rules: Rule[]): FlagHit[] {
  const hits: FlagHit[] = [];
  const seen = new Set<string>();
  for (const turn of turns) {
    if (turn.role !== "user") continue;
    const text = turn.message;
    for (const rule of rules) {
      if (seen.has(rule.label)) continue;
      for (const re of rule.patterns) {
        const m = re.exec(text);
        if (!m) continue;
        if (rule.negatable) {
          const after = text.slice(m.index + m[0].length, m.index + m[0].length + 25);
          const before = text.slice(Math.max(0, m.index - 12), m.index);
          if (NEGATION.test(after) || /(?:koi|no|not|bina|without|कोई)\s*$/iu.test(before))
            continue;
        }
        seen.add(rule.label);
        hits.push({ label: rule.label, quote: m[0] });
        break;
      }
    }
  }
  return hits;
}

export function scanRedFlags(turns: TranscriptTurn[]): FlagHit[] {
  return scan(turns, RED_FLAG_RULES);
}

export function scanDistress(turns: TranscriptTurn[]): FlagHit[] {
  return scan(turns, DISTRESS_RULES);
}

/** Parent asking us to stop calling (backup for the agent's wants_to_stop_calls field). */
const STOP_PATTERNS = [
  w("(?:phone|call|fone) (?:mat|na|mut) (?:karo|karna|kijiye|kariye|kiya karo)"),
  w("(?:phone|call) (?:band|bandh) (?:karo|kar do|kijiye|kar dijiye)"),
  w("(?:फ़ोन|फोन|कॉल) (?:मत|ना) (?:करो|करना|कीजिए)"),
  w("(?:फ़ोन|फोन|कॉल) बंद (?:करो|कर दो|कीजिए)"),
  w("(?:stop|don'?t) call(?:ing)? me"),
  w("(?:stop|end) these calls"),
  w("do not call"),
  w("nahi chahiye (?:ye|yeh|aisa) (?:phone|call)"),
];

export function scanStopRequest(turns: TranscriptTurn[]): string | null {
  for (const turn of turns) {
    if (turn.role !== "user") continue;
    for (const re of STOP_PATTERNS) {
      const m = re.exec(turn.message);
      if (m) return m[0];
    }
  }
  return null;
}

/** Phrases a carrier message or voicemail greeting says (the parent never answered). */
const VOICEMAIL_PATTERNS = [
  w("(?:leave|record) (?:a|your) message"),
  w("after the (?:tone|beep)"),
  w("the (?:number|person) you (?:have )?(?:dialled|dialed|are calling)"),
  w("(?:is )?(?:switched off|not reachable|out of (?:coverage|service) area|busy on another call)"),
  w("voice ?mail"),
  w("(?:aap|aapke) dwara dial (?:kiya|kie) gaya"),
  w("abhi (?:uplabdh|upalabdh|vyast)"),
  w("pahunch se bahar"),
  w("(?:switch|swich) (?:off|of) hai"),
  w("आपके द्वारा डायल"),
  w("उपलब्ध नहीं"),
  w("पहुँच से बाहर|पहुंच से बाहर"),
  w("स्विच ऑफ"),
  w("व्यस्त है"),
  w("कृपया थोड़ी देर बाद"),
];

export function looksLikeVoicemail(turns: TranscriptTurn[]): boolean {
  return turns.some(
    (t) => t.role === "user" && VOICEMAIL_PATTERNS.some((re) => re.test(t.message)),
  );
}
