import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "d.ground — 문서에 발 디딘 대화",
  description:
    "도메인 문서 기반 멀티테넌트 RAG 챗봇 플랫폼. 논문·기술 문서·디자인 가이드를 올리면 팀 전용 챗봇이 출처와 함께 답합니다.",
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
