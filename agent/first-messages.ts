/**
 * The scripted greeting (the agent's first message). It always discloses
 * that this is an AI assistant set up by the family.
 *
 * Rendered by our server before each call and passed as the dynamic
 * variable {{first_message}} (the agent's first_message is just
 * "{{first_message}}"). Hindi verbs follow the assistant's gender; we use
 * "tabiyat kaisi hai" so the wording works for any parent.
 */

export type GreetingLang = "hi" | "hinglish" | "ur" | "en";
export type Gender = "female" | "male";

export interface GreetingInput {
  addressAs: string;
  assistantName: string;
  familyMemberName: string;
  language: GreetingLang;
  gender: Gender;
  isConsentCall: boolean;
}

export function renderFirstMessage(g: GreetingInput): string {
  const f = g.gender === "female";
  const bol = f ? "bol rahi hoon" : "bol raha hoon";
  if (g.isConsentCall) {
    switch (g.language) {
      case "en":
        return `Namaste ${g.addressAs}! My name is ${g.assistantName}. I'm an AI assistant that ${g.familyMemberName} set up to check in on you. Do you have two minutes to talk?`;
      case "ur":
        return `Assalam-o-alaikum ${g.addressAs}! Main ${g.assistantName} ${bol}, ek AI assistant. ${g.familyMemberName} ne mujhe aapki khairiyat poochne ke liye rakha hai. Kya aapke paas do minute hain?`;
      default:
        return `Namaste ${g.addressAs}! Main ${g.assistantName} ${bol}, ek AI assistant. ${g.familyMemberName} ne mujhe aapka haal-chaal poochne ke liye set kiya hai. Kya aapke paas do minute hain?`;
    }
  }
  switch (g.language) {
    case "en":
      return `Namaste ${g.addressAs}! It's ${g.assistantName}, the AI assistant from ${g.familyMemberName}. How are you feeling today?`;
    case "ur":
      return `Assalam-o-alaikum ${g.addressAs}! Main ${g.assistantName} ${bol}, ${g.familyMemberName} ki AI assistant. Aaj tabiyat kaisi hai?`;
    default:
      return `Namaste ${g.addressAs}! Main ${g.assistantName} ${bol}, ${g.familyMemberName} ki taraf se aapki AI assistant. Aaj aapki tabiyat kaisi hai?`;
  }
}
