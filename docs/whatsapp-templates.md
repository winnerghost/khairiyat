# WhatsApp message templates

Business-initiated WhatsApp messages must use templates pre-approved by Meta. Submit these in **WhatsApp Manager → Message templates** with category **UTILITY**, in **English (en)** and **Hindi (hi)**. The exact texts live in `src/domain/templates.ts`. If you change them there, resubmit.

Rules we follow:

- Parameters (`{{1}}`, `{{2}}`, …) can't contain newlines, tabs or 4+ spaces. `sanitizeTemplateParam()` cleans them.
- Utility templates are billed per delivered message. India price assumed **₹0.145** (Admin → Settings → Costs). **Verify the current price** on Meta's pricing page before launch.
- Every alert is also tracked in our outbox. If WhatsApp fails, the same text goes by email.

## daily_summary

Sent after each completed call to members who chose "every call".

- **en:** `🌼 Today's call with {{1}}` / `Spoke at {{2}}.` / `{{3}}` / `Full call: {{4}}`
- **hi:** `🌼 आज {{1}} से बात हुई` / `समय: {{2}}` / `{{3}}` / `पूरी बातचीत: {{4}}`
- Params: 1 = how the parent is addressed ("Maa"), 2 = time ("9:32 am"), 3 = summary (≤600 chars), 4 = link
- Sample: Maa · 9:32 am · "Maa sounded cheerful. Food: dal-chawal. Medicines: said they took Metformin (self-reported)." · https://example.com/app/parents/…

## not_reached_alert

- **en:** `⚠️ We couldn't reach {{1}} today.` / `We called at {{2}} and tried {{3}} times, but there was no answer.` / `Please call them yourself or ask someone nearby to check.` / `Details: {{4}}`
- **hi:** `⚠️ आज हम {{1}} से बात नहीं कर पाए।` / `हमने {{2}} बजे फ़ोन किया और {{3}} बार कोशिश की, पर किसी ने नहीं उठाया।` / `कृपया आप ख़ुद फ़ोन करें या किसी पास वाले से पता करवाएँ।` / `विवरण: {{4}}`
- Params: 1 = parent, 2 = first call time, 3 = attempts, 4 = link

## urgent_alert

- **en:** `🚨 Please call {{1}} now.` / `On today's call they mentioned {{2}}: "{{3}}"` / `We asked them to call family or 112 straight away.` / `Details: {{4}}` / `(Khairiyat is not an emergency service. In an emergency, call 112.)`
- **hi:** `🚨 कृपया {{1}} को अभी फ़ोन करें।` / `आज की बातचीत में उन्होंने बताया: {{2}} – "{{3}}"` / `हमने उनसे तुरंत घर वालों को या 112 पर फ़ोन करने को कहा।` / `विवरण: {{4}}` / `(ख़ैरियत आपातकालीन सेवा नहीं है। आपात स्थिति में 112 पर फ़ोन करें।)`
- Params: 1 = parent, 2 = what (e.g. "a fall"), 3 = their words, 4 = link

## consent_status

Introduction-call result, or the parent asked to stop.

- **en / hi:** `{{1}}` / `{{2}}` (two sentences, e.g. "Good news: Maa agreed to daily calls. 🌼" / "The first daily call is at the usual time…")

## payment_issue

- **en:** `Your payment for {{1}}'s daily calls didn't go through.` / `Don't worry: calls continue until {{2}}.` / `Please update your payment here: {{3}}`
- **hi:** `{{1}} की रोज़ की कॉल का भुगतान नहीं हो पाया।` / `चिंता न करें: कॉल {{2}} तक चलती रहेंगी।` / `कृपया यहाँ भुगतान अपडेट करें: {{3}}`

## billing_notice

Trial ending, trial ended, calls paused for payment, cancellation effective.

- **en / hi:** `{{1}}` / `{{2}}`

## weekly_digest

- **en:** `📅 This week with {{1}}` / `{{2}}` / `See more: {{3}}`
- **hi:** `📅 इस हफ़्ते {{1}} के साथ` / `{{2}}` / `और देखें: {{3}}`

## daily_digest

For members who chose "one message per day".

- **en:** `🌙 Today with {{1}}` / `{{2}}` / `See more: {{3}}`
- **hi:** `🌙 आज {{1}} के साथ` / `{{2}}` / `और देखें: {{3}}`

## call_problem

When a call couldn't be made because of a problem on our side.

- **en:** `Sorry. We couldn't make {{1}}'s call today because of a problem on our side. Our team has been alerted. You may want to call them yourself today.`
- **hi:** `माफ़ कीजिए। हमारी तरफ़ की एक दिक़्क़त की वजह से आज {{1}} को कॉल नहीं हो पाई। हमारी टीम को सूचना दे दी गई है। आज आप ख़ुद उन्हें फ़ोन कर लें।`
