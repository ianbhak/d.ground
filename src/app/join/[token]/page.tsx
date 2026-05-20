import Link from "next/link";
import { redirect } from "next/navigation";
import Brandmark from "@/components/Brandmark";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(`/join/${token}`)}`);
  }

  const { data: roomId } = await supabase
    .schema("dground")
    .rpc("join_room_by_token", { p_token: token });

  if (roomId) {
    const { data: room } = await supabase
      .schema("dground")
      .from("rooms")
      .select("slug")
      .eq("id", roomId)
      .maybeSingle();
    redirect(`/rooms/${encodeURIComponent(room?.slug ?? roomId)}`);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm oma-fade">
        <div className="mb-10 flex justify-center">
          <Brandmark />
        </div>
        <div className="border border-black bg-white p-8 oma-shadow-lg">
          <p className="oma-label text-[var(--color-accent)]">Invalid link</p>
          <h1 className="mt-3 font-serif text-2xl leading-snug">
            입장할 수 없는 링크입니다.
          </h1>
          <p className="mt-2 text-sm text-black/55">
            링크가 만료(재발급)되었거나 방이 삭제되었을 수 있습니다. 방
            관리자에게 새 초대 링크를 요청하세요.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block border border-black px-5 py-2.5 text-sm font-bold transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:oma-shadow-sm"
          >
            내 방으로
          </Link>
        </div>
      </div>
    </main>
  );
}
