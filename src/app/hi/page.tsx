import type { Metadata } from "next";
import { Landing } from "@/components/marketing/landing";
import { brand } from "@/config/brand";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: `${brand.nameHi}: माता-पिता के लिए रोज़ की ख़ैरियत कॉल` },
  description:
    "एक प्यारी AI सहायक रोज़ आपके माता-पिता को हिंदी, उर्दू, हिंग्लिश या अंग्रेज़ी में फ़ोन करती है, और आपको WhatsApp पर छोटा संदेश भेजती है। आपातकालीन सेवा नहीं।",
  alternates: { canonical: "/hi", languages: { "en-IN": "/", "hi-IN": "/hi" } },
  openGraph: { locale: "hi_IN" },
};

export default function HindiHome() {
  return <Landing lang="hi" />;
}
