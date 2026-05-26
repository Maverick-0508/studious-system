import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EcoFleet OS",
  description: "Unified EV fleet operations, charging orchestration, and ESG reporting platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
