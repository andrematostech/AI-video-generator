import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lumo",
  description: "Turn prompts into cinematic videos with Lumo."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
