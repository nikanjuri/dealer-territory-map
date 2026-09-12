import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dealer Territory Map",
  description:
    "Salesperson territory coverage and dealer locations across Telangana and Andhra Pradesh.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
