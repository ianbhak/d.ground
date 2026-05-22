"use client";

import { useEffect } from "react";

/**
 * Catches errors thrown in the root layout. It replaces the root layout
 * entirely, so it must render its own <html>/<body> and cannot rely on
 * globals.css — styling is therefore inline.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 24px",
          textAlign: "center",
          background: "#fff",
          color: "#000",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "#0000ff",
          }}
        >
          Critical error
        </p>
        <h1
          style={{
            margin: "16px 0 0",
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          앱을 불러오지 못했습니다
        </h1>
        <p
          style={{
            margin: "20px 0 0",
            maxWidth: 420,
            fontSize: 14,
            lineHeight: 1.7,
            color: "rgba(0,0,0,0.55)",
          }}
        >
          예기치 못한 오류가 발생했습니다. 다시 시도해 주세요.
        </p>
        {error.digest && (
          <p
            style={{
              margin: "12px 0 0",
              fontSize: 12,
              fontFamily: "ui-monospace, monospace",
              color: "rgba(0,0,0,0.3)",
            }}
          >
            ref: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          style={{
            marginTop: 32,
            height: 40,
            padding: "0 16px",
            border: "1px solid #000",
            background: "#000",
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          다시 시도
        </button>
      </body>
    </html>
  );
}
