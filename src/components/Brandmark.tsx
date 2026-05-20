import Link from "next/link";

export default function Brandmark({ size = "md" }: { size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-8 w-8 text-base" : "h-10 w-10 text-xl";

  return (
    <Link href="/" className="group inline-flex items-center gap-2.5">
      <div
        className={`flex ${box} items-center justify-center bg-black text-white transition-transform duration-200 group-hover:rotate-90`}
      >
        <span className="font-serif font-bold italic">d.</span>
      </div>
      <span className="oma-label text-black/50 transition-colors group-hover:text-black">
        ground
      </span>
    </Link>
  );
}
