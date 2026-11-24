import { describe, expect, it } from "vitest";
import type { TranscriptTurn } from "@/db/schema/app";
import { looksLikeVoicemail, scanDistress, scanRedFlags, scanStopRequest } from "./red-flags";

const user = (message: string): TranscriptTurn => ({ role: "user", message, timeInCallSecs: 10 });
const agent = (message: string): TranscriptTurn => ({ role: "agent", message, timeInCallSecs: 5 });
const labels = (turns: TranscriptTurn[]) => scanRedFlags(turns).map((h) => h.label);

describe("red flag keywords", () => {
  it.each([
    ["Aaj subah bathroom mein gir gayi thi", "a fall"],
    ["kal raat seedhi se gir gaya", "a fall"],
    ["मैं आज सुबह गिर गई थी", "a fall"],
    ["I fell in the kitchen", "a fall"],
    ["seene mein dard ho raha hai", "chest pain"],
    ["सीने में दर्द है", "chest pain"],
    ["I have chest pain since morning", "chest pain"],
    ["saans nahi aa rahi theek se", "breathing trouble"],
    ["साँस फूल रही है", "breathing trouble"],
    ["I can't breathe properly", "breathing trouble"],
    ["subah chakkar aa gaya tha", "dizziness or fainting"],
    ["woh behosh ho gaye the", "dizziness or fainting"],
    ["haath se khoon nikal raha hai", "bleeding or injury"],
    ["ambulance bulani padi", "hospital or ambulance"],
    ["कल अस्पताल गए थे", "hospital or ambulance"],
  ])("flags %j as %s", (text, label) => {
    expect(labels([user(text)])).toContain(label);
  });

  it("ignores the assistant's own questions", () => {
    expect(labels([agent("Koi chot to nahi lagi? Chakkar to nahi aaya?")])).toEqual([]);
  });

  it("respects simple negations", () => {
    expect(labels([user("chakkar nahi aaya, sab theek hai")])).toEqual([]);
    expect(labels([user("koi chot nahi lagi")])).toEqual([]);
  });

  it("does not flag ordinary conversation", () => {
    expect(
      labels([user("Aaj dal chawal banaya, dhoop achhi thi, Riya ka exam achha gaya")]),
    ).toEqual([]);
  });

  it("detects hopelessness separately", () => {
    expect(scanDistress([user("ab jeene ka mann nahi karta")]).length).toBe(1);
    expect(scanDistress([user("I want to die")]).length).toBe(1);
    expect(scanDistress([user("thodi thakaan hai bas")]).length).toBe(0);
  });
});

describe("stop requests and voicemail", () => {
  it("hears 'please stop calling'", () => {
    expect(scanStopRequest([user("ye phone mat karo roz")])).toBeTruthy();
    expect(scanStopRequest([user("फोन बंद करो")])).toBeTruthy();
    expect(scanStopRequest([user("please stop calling me")])).toBeTruthy();
    expect(scanStopRequest([user("phone karti rehna, achha lagta hai")])).toBeNull();
  });

  it("recognises carrier and voicemail messages", () => {
    expect(
      looksLikeVoicemail([user("Aapke dwara dial kiya gaya number abhi uplabdh nahi hai")]),
    ).toBe(true);
    expect(looksLikeVoicemail([user("The number you have dialled is switched off")])).toBe(true);
    expect(looksLikeVoicemail([user("Please leave a message after the beep")])).toBe(true);
    expect(looksLikeVoicemail([user("Haan beta, bolo")])).toBe(false);
  });
});
