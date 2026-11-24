import { brand } from "@/config/brand";

/** DRAFT for lawyer review. Placeholders in [square brackets]. */
export const PRIVACY_MD = `
# Privacy Policy

**Last updated: [date]. DRAFT: to be reviewed by a lawyer before launch.**

${brand.name} ("we", "us") provides daily check-in phone calls to elderly parents, set up by their family members. This policy explains what personal data we process, why, and your rights under India's Digital Personal Data Protection Act, 2023 ("DPDP Act").

## Who is responsible

The data fiduciary is [legal entity name, address], operating ${brand.name}. Grievance officer: [name], [email], [WhatsApp]. We reply to grievances within [7] days.

## Whose data we process

- **Family members** who create an account (name, email, WhatsApp number, time zone, preferences, billing details).
- **Parents** who receive calls (name, how to address them, phone number, language, city, call schedule, medicine names, topics, optional health notes written by the family, and the content of the calls).
- **Alert contacts** named by the family (name, WhatsApp number, optional email).

## Consent

The family member confirms they have told the parent about the calls. The **first call is an introduction**: the assistant says it is an AI assistant set up by the family and asks the parent for permission. Daily calls start only if the parent agrees. The parent can withdraw consent at any time by saying so on a call (for example "phone mat karo"). We then stop calling and inform the family. Family members can withdraw consent for their own data by deleting their account.

## What we use data for (purpose limitation)

- To make the daily check-in calls and remember earlier conversations (so each call can follow up).
- To send summaries and alerts to the family by WhatsApp and email.
- To bill for the service.
- To keep the service safe and reliable (logs, error tracking, fraud and abuse prevention).

We do not sell personal data, use it for advertising, or use call content to train AI models of our own.

## Sensitive information

Health notes written by the family are stored encrypted. Call transcripts may contain health information the parent mentions; we use it only to write the family summary and alerts. Summaries describe what the parent said and are not medical assessments.

## Service providers (data processors)

We share data only as needed with: our voice AI provider (ElevenLabs), our telephony provider, Meta (WhatsApp Cloud API), our email provider, our payments provider (Razorpay), and our hosting and database providers. Some of these process data outside India (for example in the USA or EU). We choose providers with appropriate security commitments. [List exact providers and regions at launch.]

## How long we keep data

- Call transcripts: **180 days** by default (families can change this between 30 and 730 days). Summaries stay while the account exists.
- Recordings: kept by our voice provider for up to 180 days, not stored by us.
- Account and parent profile: until you delete them.
- Payment records: as long as Indian tax law requires.

## Your rights

You can access your data (Settings → Download all data), correct it (edit anytime), erase it (delete a parent or your account), withdraw consent, nominate a person to exercise your rights in case of death or incapacity, and raise a grievance with us and then with the Data Protection Board of India.

## Security

Encryption in transit and for sensitive fields at rest, access only for family members and a small team when fixing a problem, audit logs for staff actions, and regular backups.

## Children

The service is for adults. Family members must be 18 or older.

## Changes

We will tell you about important changes by email or WhatsApp before they apply.
`;
