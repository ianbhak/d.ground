import Link from "next/link";

/** Handles notFound() and any unmatched route. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="oma-label text-[var(--color-accent)]">Error 404</p>
      <h1 className="mt-4 font-serif text-5xl tracking-tight sm:text-7xl">
        페이지를 찾을 수 없습니다
      </h1>
      <div className="mt-6 h-px w-20 bg-black" />
      <p className="mt-6 max-w-md text-sm leading-relaxed text-black/55">
        주소가 바뀌었거나 삭제된 방일 수 있습니다.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex h-10 items-center border border-black bg-black px-4 text-sm font-bold text-white transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:oma-shadow-sm"
      >
        홈으로
      </Link>
    </div>
  );
}
