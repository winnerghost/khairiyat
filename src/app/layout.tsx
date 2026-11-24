import type { Metadata, Viewport } from "next";
import type { CSSProperties } from "react";
import { Fraunces, Mukta } from "next/font/google";
import { brand } from "@/config/brand";
import "./globals.css";

// Mukta covers both Latin and Devanagari, so Hindi text renders well everywhere.
const bodyFont = Mukta({
  variable: "--font-body",
  subsets: ["latin", "devanagari"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const headingFont = Fraunces({
  variable: "--font-heading",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${brand.name} · ${brand.tagline}`,
    template: `%s · ${brand.name}`,
  },
  description: brand.taglineEn,
  applicationName: brand.name,
};

export const viewport: Viewport = {
  themeColor: brand.colors.primary,
  width: "device-width",
  initialScale: 1,
};

/** Brand colours from src/config/brand.ts become CSS variables here. */
const brandVariables = {
  "--brand-primary": brand.colors.primary,
  "--brand-primary-foreground": brand.colors.primaryForeground,
  "--brand-accent": brand.colors.accent,
  "--brand-background": brand.colors.background,
  "--brand-surface": brand.colors.surface,
  "--brand-foreground": brand.colors.foreground,
  "--brand-muted": brand.colors.muted,
  "--brand-success": brand.colors.success,
  "--brand-info": brand.colors.info,
  "--brand-warning": brand.colors.warning,
  "--brand-danger": brand.colors.danger,
} as CSSProperties;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      style={brandVariables}
      className={`${bodyFont.variable} ${headingFont.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
