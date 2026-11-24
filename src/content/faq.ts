import { brand } from "@/config/brand";

const A = brand.assistantNames.female;

/** Shared FAQ for the landing page and the Help page. Honest answers only. */
export const FAQ_EN = [
  {
    q: "What does it cost?",
    a: `7 days free, no card needed. Then ₹1,499 a month per parent (₹999 for our first 50 families), or ₹2,299 for families abroad with longer calls. Cancel anytime; calls continue until the end of the month you paid for.`,
  },
  {
    q: "Does my parent need a smartphone or an app?",
    a: `No. ${A} calls their normal phone number, like any other call.`,
  },
  {
    q: "Is this a robot? Will my parent know?",
    a: `Yes, ${A} is an AI assistant, and says so at the start of every first call: "Main ${A} hoon, ek AI assistant, jise aapke bete/beti ne set kiya hai." It never pretends to be a person or a family member.`,
  },
  {
    q: "What about consent?",
    a: `You tell your parent first. Then the first call is an introduction: ${A} explains what it is and asks if daily calls are okay. Calls start only if they agree. If they ever say "mat karo", we stop and tell you.`,
  },
  {
    q: "What if she doesn't pick up?",
    a: "We try again after 15 minutes, twice. If we still can't reach her, you get a WhatsApp alert straight away, usually within the hour of the planned call.",
  },
  {
    q: "Is it an emergency service?",
    a: `No. If your parent mentions a fall, chest pain or breathlessness, ${A} tells them to call family or 112 right away, and we alert you immediately. But we can't send help, and we can't guarantee we'll catch everything. Please keep your own emergency plans.`,
  },
  {
    q: "Is it medical advice?",
    a: `No. ${A} never diagnoses or suggests medicine changes. Everything in the summary is what your parent told us (self-reported). We can't confirm they actually ate or took their medicines.`,
  },
  {
    q: "Will it ever ask for money or OTPs?",
    a: `Never. ${A} will never ask for OTPs, bank details, Aadhaar, money or addresses, and warns your parent never to share these on any call. Please tell your parent this too.`,
  },
  {
    q: "Who can see the conversations?",
    a: "Only family members you add, and our small team when fixing a problem. Calls are handled by our voice partner (ElevenLabs). Health notes are encrypted, transcripts are deleted after 180 days by default, and you can download or delete everything anytime.",
  },
] as const;
