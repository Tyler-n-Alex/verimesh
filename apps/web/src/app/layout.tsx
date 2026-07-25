import type { Metadata, Viewport } from "next";
import { cssVariables } from "@/lib/palette";
import "./globals.css";

export const metadata: Metadata = {
  title: "Verimesh — verifiable autonomy for DePIN",
  description:
    "A deterministic verifier, attested inference and human-backed differential authorization for an autonomous compute mesh.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#05070d",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" data-theme="dark" suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: cssVariables() }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
