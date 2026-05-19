import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "d.ground",
  description: "Ground your conversation in documents.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
