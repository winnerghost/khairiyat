/**
 * Landing page copy, English + Hindi. Honest by design:
 * - everything about food/medicine is "what they told us" (self-reported)
 * - not a medical service, not an emergency service, not a replacement for family calls
 */
import { brand } from "@/config/brand";

const A = brand.assistantNames.female;

export type LandingLang = "en" | "hi";

export const LANDING = {
  en: {
    nav: { login: "Log in", trial: "Start free trial", switchTo: "हिंदी" },
    hero: {
      eyebrow: "Daily check-in calls for parents",
      title: "Har subah, Maa ki khairiyat.",
      sub: "A warm AI assistant calls your parent every day, in Hindi, Urdu, Hinglish or English. Know by 10 am that Maa is okay. If she doesn't pick up, know within the hour.",
      cta: "Start 7-day free trial",
      secondary: "See a sample call",
      trust: [
        "No smartphone or app needed",
        "Hindi · Urdu · Hinglish · English",
        "Not an emergency service",
      ],
    },
    how: {
      title: "How it works",
      steps: [
        {
          t: "Tell us about Maa",
          d: "How to greet her (Ammi, Maa, Papa ji), what time to call, her medicines, what she loves to talk about. About 5 minutes.",
        },
        {
          t: `${A} calls every day`,
          d: `A calm, slow, respectful chat of 3 to 5 minutes. She asks about her day, food, medicines and sleep, and remembers what Maa said yesterday.`,
        },
        {
          t: "You get a gentle note",
          d: "A short WhatsApp summary after each call. If she can't be reached after retries, or mentions a fall or chest pain, you're alerted at once.",
        },
      ],
    },
    sample: {
      title: "What you get on WhatsApp",
      note: "A real example of the daily message (names changed).",
      message:
        "🌼 Today's call with Maa\nSpoke at 9:32 am.\n\nMaa sounded cheerful (\"bilkul theek\"). Food: had dal-chawal and bhindi for lunch. Medicines: said they took Metformin and Amlodipine (self-reported). Slept well, woke once. Enjoyed talking about Kabir's drawing prize.",
      callTitle: "A few lines from the call",
      call: [
        {
          who: A,
          text: "Namaste Maa! Main Roshni bol rahi hoon, Riya ki taraf se aapki AI assistant. Aaj aapki tabiyat kaisi hai?",
        },
        { who: "Maa", text: "Main bilkul theek hoon beta! Aaj dhoop achhi nikli hai." },
        { who: A, text: "Wah! Aur aaj lunch mein kya banaya?" },
        { who: "Maa", text: "Dal chawal aur bhindi ki sabzi." },
        { who: A, text: "Kal aapne ghutne ke dard ki baat ki thi, ab kaisa hai?" },
      ],
    },
    who: {
      title: "Made for children who live far away",
      items: [
        {
          t: "In another city",
          d: "Bengaluru, Pune, Gurugram: you can't drop by after work. Now you know how her day went.",
        },
        {
          t: "Abroad",
          d: "London, Dubai, Toronto: time zones make daily calls hard. We call at her time and show it in yours.",
        },
        {
          t: "Busy, but caring",
          d: "It doesn't replace your calls. It makes sure no day goes by without someone asking.",
        },
      ],
    },
    honest: {
      title: "What it is, and what it isn't",
      is: [
        "A warm daily conversation that asks after your parent",
        "A short, gentle note for the family after each call",
        "Fast alerts if we can't reach them or they mention something worrying",
        "A memory of what was said, so each call follows up on the last",
      ],
      isnt: [
        "Not a medical service: no diagnosis, no medical advice",
        "Not an emergency service: in an emergency, call 112",
        "Not proof of anything: food and medicines are what they told us",
        "Not a replacement for your own calls",
      ],
    },
    pricing: {
      title: "Simple pricing, per parent",
      trial: "7 days free. No card needed. Cancel anytime.",
      perMonth: "/month",
      cta: "Start free trial",
    },
    trust: {
      title: "Built for trust",
      items: [
        {
          t: "Consent first",
          d: `The first call is an introduction. ${A} says she is an AI assistant you set up, and asks if daily calls are okay. If your parent says no, or ever says stop, we stop and tell you.`,
        },
        {
          t: "Never asks for money",
          d: `${A} will never ask for OTPs, bank details, Aadhaar or money, and warns your parent never to share them on any call.`,
        },
        {
          t: "Your data, your control",
          d: "Health notes are encrypted. Only your family sees the calls. Download or delete everything anytime. Transcripts are deleted after 180 days by default.",
        },
        {
          t: "Reliable by design",
          d: "Never two calls for the same slot, never before 8 am or after 8 pm, and every alert is tracked until it's delivered (WhatsApp, then email).",
        },
      ],
    },
    faqTitle: "Questions families ask",
    founder: {
      title: "Why we're building this",
      // DRAFT: Arham, please rewrite this in your own words before launch.
      body: "I'm building Khairiyat from Lucknow. So many of us live in another city or country while our parents stay home, and the weekly call slowly becomes a fortnightly one. You start wondering about the days in between. Khairiyat is a gentle answer: someone warm asks after Maa every single day, and you hear back. We're starting small and honest, and we'd love your feedback.",
      sign: "Arham, founder (Lucknow)",
    },
    final: {
      title: "Start this week. She'll love the company.",
      cta: "Start 7-day free trial",
      whatsapp: "Ask us on WhatsApp",
    },
    footer: {
      emergency:
        "Not an emergency service. In an emergency, call 112. Mental-health support: Tele-MANAS 14416 (free).",
      links: { privacy: "Privacy", terms: "Terms", emergency: "Not an emergency service" },
    },
  },
  hi: {
    nav: { login: "लॉग इन", trial: "फ़्री ट्रायल शुरू करें", switchTo: "English" },
    hero: {
      eyebrow: "माता-पिता के लिए रोज़ की ख़ैरियत कॉल",
      title: "हर सुबह, माँ की ख़ैरियत।",
      sub: "एक प्यारी-सी AI सहायक रोज़ आपके माता-पिता को फ़ोन करती है, हिंदी, उर्दू, हिंग्लिश या अंग्रेज़ी में। सुबह 10 बजे तक जानिए कि माँ ठीक हैं। अगर वे फ़ोन न उठाएँ, तो घंटे भर में पता चल जाए।",
      cta: "7 दिन का फ़्री ट्रायल",
      secondary: "एक नमूना कॉल देखें",
      trust: ["स्मार्टफ़ोन या ऐप की ज़रूरत नहीं", "हिंदी · उर्दू · हिंग्लिश · अंग्रेज़ी", "आपातकालीन सेवा नहीं"],
    },
    how: {
      title: "यह कैसे काम करता है",
      steps: [
        {
          t: "माँ के बारे में बताइए",
          d: "उन्हें कैसे बुलाएँ (अम्मी, माँ, पापा जी), किस समय फ़ोन करें, उनकी दवाइयाँ, उन्हें किन बातों में मज़ा आता है। लगभग 5 मिनट।",
        },
        {
          t: `${A} रोज़ फ़ोन करती है`,
          d: "3 से 5 मिनट की शांत, धीमी और आदर भरी बातचीत। दिन, खाना, दवा और नींद के बारे में पूछती है, और कल की बात याद रखती है।",
        },
        {
          t: "आपको एक छोटा-सा संदेश",
          d: "हर कॉल के बाद WhatsApp पर छोटा सार। अगर बार-बार कोशिश के बाद भी बात न हो, या वे गिरने या सीने में दर्द की बात करें, तो आपको तुरंत ख़बर।",
        },
      ],
    },
    sample: {
      title: "WhatsApp पर आपको क्या मिलता है",
      note: "रोज़ के संदेश का असली उदाहरण (नाम बदले गए हैं)।",
      message:
        '🌼 आज माँ से बात हुई\nसमय: सुबह 9:32\n\nमाँ बहुत ख़ुश लगीं ("बिल्कुल ठीक")। खाना: दोपहर में दाल-चावल और भिंडी। दवाइयाँ: Metformin और Amlodipine ले लीं (उन्होंने बताया)। नींद अच्छी आई। कबीर के ड्रॉइंग इनाम की बात करके ख़ुश हुईं।',
      callTitle: "बातचीत की कुछ पंक्तियाँ",
      call: [
        {
          who: A,
          text: "नमस्ते माँ! मैं रोशनी बोल रही हूँ, रिया की तरफ़ से आपकी AI सहायक। आज आपकी तबीयत कैसी है?",
        },
        { who: "माँ", text: "मैं बिल्कुल ठीक हूँ बेटा! आज धूप अच्छी निकली है।" },
        { who: A, text: "वाह! और आज लंच में क्या बनाया?" },
        { who: "माँ", text: "दाल चावल और भिंडी की सब्ज़ी।" },
        { who: A, text: "कल आपने घुटने के दर्द की बात की थी, अब कैसा है?" },
      ],
    },
    who: {
      title: "दूर रहने वाले बच्चों के लिए",
      items: [
        {
          t: "दूसरे शहर में",
          d: "बेंगलुरु, पुणे, गुरुग्राम: ऑफ़िस के बाद मिलने नहीं जा सकते। अब आपको पता रहेगा उनका दिन कैसा गया।",
        },
        {
          t: "विदेश में",
          d: "लंदन, दुबई, टोरंटो: टाइम-ज़ोन की वजह से रोज़ बात मुश्किल। हम उनके समय पर फ़ोन करते हैं और आपके समय में दिखाते हैं।",
        },
        {
          t: "व्यस्त, पर फ़िक्रमंद",
          d: "यह आपकी कॉल की जगह नहीं लेता। बस यह पक्का करता है कि कोई दिन बिना हाल-चाल पूछे न जाए।",
        },
      ],
    },
    honest: {
      title: "यह क्या है, और क्या नहीं",
      is: [
        "रोज़ की प्यार भरी बातचीत जो माता-पिता का हाल पूछे",
        "हर कॉल के बाद परिवार के लिए छोटा, नरम संदेश",
        "बात न हो पाए या चिंता की बात हो तो तुरंत सूचना",
        "पिछली बातों की याद, ताकि हर कॉल पिछली कॉल से जुड़ी रहे",
      ],
      isnt: [
        "मेडिकल सेवा नहीं: न जाँच, न डॉक्टरी सलाह",
        "आपातकालीन सेवा नहीं: आपात स्थिति में 112 पर फ़ोन करें",
        "किसी बात का सबूत नहीं: खाना और दवा वही जो उन्होंने बताया",
        "आपकी अपनी कॉल की जगह नहीं",
      ],
    },
    pricing: {
      title: "आसान क़ीमत, हर माता-पिता के लिए",
      trial: "7 दिन फ़्री। कार्ड की ज़रूरत नहीं। कभी भी बंद करें।",
      perMonth: "/महीना",
      cta: "फ़्री ट्रायल शुरू करें",
    },
    trust: {
      title: "भरोसे के लिए बना",
      items: [
        {
          t: "पहले सहमति",
          d: `पहली कॉल सिर्फ़ परिचय की होती है। ${A} बताती है कि वह आपकी रखी हुई AI सहायक है, और पूछती है कि क्या रोज़ फ़ोन ठीक है। अगर वे मना करें या कभी भी "बंद करो" कहें, तो हम रुक जाते हैं और आपको बताते हैं।`,
        },
        {
          t: "कभी पैसे नहीं माँगती",
          d: `${A} कभी OTP, बैंक डिटेल, आधार या पैसे नहीं माँगती, और माता-पिता को समझाती है कि किसी भी कॉल पर ये न बताएँ।`,
        },
        {
          t: "आपका डेटा, आपके हाथ में",
          d: "सेहत से जुड़ी बातें एन्क्रिप्टेड रहती हैं। कॉल सिर्फ़ आपका परिवार देखता है। जब चाहें सब डाउनलोड या डिलीट करें। बातचीत का पूरा लेख 180 दिन बाद अपने-आप हट जाता है।",
        },
        {
          t: "भरोसेमंद बनावट",
          d: "एक समय पर कभी दो कॉल नहीं, सुबह 8 से पहले या रात 8 के बाद कभी नहीं, और हर अलर्ट पहुँचने तक ट्रैक होता है (WhatsApp, फिर ईमेल)।",
        },
      ],
    },
    faqTitle: "परिवार अक्सर पूछते हैं",
    founder: {
      title: "हम यह क्यों बना रहे हैं",
      body: "मैं ख़ैरियत लखनऊ से बना रहा हूँ। हम में से कई लोग दूसरे शहर या देश में रहते हैं, जबकि माता-पिता घर पर रहते हैं, और हफ़्ते की कॉल धीरे-धीरे पंद्रह दिन की हो जाती है। बीच के दिनों की फ़िक्र रहती है। ख़ैरियत इसका एक नरम जवाब है: कोई प्यार से रोज़ माँ का हाल पूछे, और आपको ख़बर मिले। हम छोटे और ईमानदार तरीक़े से शुरू कर रहे हैं, आपकी राय का इंतज़ार है।",
      sign: "अरहम, संस्थापक (लखनऊ)",
    },
    final: {
      title: "इसी हफ़्ते शुरू कीजिए। उन्हें बातें करना अच्छा लगेगा।",
      cta: "7 दिन का फ़्री ट्रायल",
      whatsapp: "WhatsApp पर पूछें",
    },
    footer: {
      emergency:
        "आपातकालीन सेवा नहीं। आपात स्थिति में 112 पर फ़ोन करें। मानसिक स्वास्थ्य सहायता: टेली-मानस 14416 (मुफ़्त)।",
      links: { privacy: "गोपनीयता", terms: "शर्तें", emergency: "आपातकालीन सेवा नहीं" },
    },
  },
} as const;

export const FAQ_HI = [
  {
    q: "इसकी क़ीमत क्या है?",
    a: "7 दिन फ़्री, कार्ड की ज़रूरत नहीं। फिर हर माता-पिता के लिए ₹1,499 महीना (पहले 50 परिवारों के लिए ₹999), या विदेश में रहने वाले परिवारों के लिए लंबी कॉल के साथ ₹2,299। कभी भी बंद करें; जिस महीने का भुगतान किया, उसके अंत तक कॉल चलती रहेंगी।",
  },
  {
    q: "क्या माता-पिता को स्मार्टफ़ोन या ऐप चाहिए?",
    a: `नहीं। ${A} उनके साधारण फ़ोन नंबर पर कॉल करती है, बाक़ी कॉल की तरह।`,
  },
  {
    q: "क्या यह रोबोट है? उन्हें पता चलेगा?",
    a: `हाँ, ${A} एक AI सहायक है और हर बार साफ़ बताती है कि उसे परिवार ने रखा है। वह कभी इंसान या परिवार का सदस्य होने का दावा नहीं करती।`,
  },
  {
    q: "सहमति का क्या?",
    a: `पहले आप उन्हें बताइए। फिर पहली कॉल परिचय की होती है: ${A} बताती है कि वह क्या है और पूछती है कि क्या रोज़ फ़ोन ठीक है। हाँ कहने पर ही रोज़ की कॉल शुरू होती हैं। अगर वे कभी "मत करो" कहें, तो हम रुक जाते हैं और आपको बताते हैं।`,
  },
  {
    q: "अगर वे फ़ोन न उठाएँ तो?",
    a: "हम 15 मिनट बाद फिर कोशिश करते हैं, दो बार। फिर भी बात न हो, तो आपको तुरंत WhatsApp पर अलर्ट मिलता है, आमतौर पर तय कॉल के घंटे भर के अंदर।",
  },
  {
    q: "क्या यह आपातकालीन सेवा है?",
    a: `नहीं। अगर वे गिरने, सीने में दर्द या साँस की तकलीफ़ की बात करें, तो ${A} उनसे तुरंत घर वालों को या 112 पर फ़ोन करने को कहती है और हम आपको तुरंत अलर्ट करते हैं। पर हम मदद नहीं भेज सकते, और हर बात पकड़ लेने की गारंटी नहीं। अपनी आपात तैयारी ज़रूर रखें।`,
  },
  {
    q: "क्या यह डॉक्टरी सलाह है?",
    a: `नहीं। ${A} कभी बीमारी नहीं बताती और दवा बदलने को नहीं कहती। सार में जो लिखा है, वह वही है जो उन्होंने बताया। हम पक्का नहीं कर सकते कि उन्होंने सच में खाना खाया या दवा ली।`,
  },
  {
    q: "क्या यह कभी पैसे या OTP माँगेगी?",
    a: `कभी नहीं। ${A} कभी OTP, बैंक डिटेल, आधार, पैसे या पता नहीं माँगती, और माता-पिता को समझाती है कि किसी कॉल पर ये न बताएँ। कृपया आप भी उन्हें यह बता दें।`,
  },
  {
    q: "बातचीत कौन देख सकता है?",
    a: "सिर्फ़ वे परिवार वाले जिन्हें आप जोड़ें, और किसी दिक़्क़त को ठीक करते समय हमारी छोटी-सी टीम। सेहत की बातें एन्क्रिप्टेड रहती हैं, और आप कभी भी सब डाउनलोड या डिलीट कर सकते हैं।",
  },
] as const;
