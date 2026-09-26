import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lattice — Connect what you know",
  description:
    "A multimedia knowledge workspace. Save ideas, find precise passages, and discover the connections between them.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
