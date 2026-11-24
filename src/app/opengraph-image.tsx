import { ImageResponse } from "next/og";
import { brand } from "@/config/brand";

export const alt = `${brand.name}: daily check-in calls for your parents`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social share card (OpenGraph / WhatsApp link preview). */
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 80,
        background: brand.colors.background,
        color: brand.colors.foreground,
      }}
    >
      <div style={{ fontSize: 44, color: brand.colors.primary, fontWeight: 700 }}>{brand.name}</div>
      <div style={{ fontSize: 76, fontWeight: 700, marginTop: 24, lineHeight: 1.1 }}>
        Har subah, Maa ki khairiyat.
      </div>
      <div style={{ fontSize: 34, marginTop: 28, color: brand.colors.muted }}>
        A warm daily check-in call for your parents, and a gentle note for you.
      </div>
      <div style={{ display: "flex", marginTop: 40, fontSize: 26, color: brand.colors.primary }}>
        Hindi · Urdu · Hinglish · English · No app needed
      </div>
    </div>,
    size,
  );
}
