import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";

export default async function RoomsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: rooms } = await supabase
    .schema("dground")
    .from("rooms")
    .select("id, name, description, model, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-3xl px-8 py-12">
      <header className="mb-12 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-light tracking-tight">d.ground</h1>
          <p className="mt-1 text-sm text-[var(--color-ground-muted)]">
            {user.email}
          </p>
        </div>
        <SignOutButton />
      </header>

      <section className="mb-8 flex items-center justify-between">
        <h2 className="text-lg font-medium">내 방</h2>
        <Link
          href="/rooms/new"
          className="border border-black px-4 py-2 text-sm hover:bg-black hover:text-white transition"
        >
          + 새 방
        </Link>
      </section>

      {rooms && rooms.length > 0 ? (
        <ul className="divide-y border-y">
          {rooms.map((r) => (
            <li key={r.id}>
              <Link
                href={`/rooms/${r.id}` as never}
                className="block py-4 hover:bg-neutral-50"
              >
                <div className="font-medium">{r.name}</div>
                {r.description && (
                  <div className="mt-1 text-sm text-[var(--color-ground-muted)]">
                    {r.description}
                  </div>
                )}
                <div className="mt-2 text-xs text-[var(--color-ground-muted)]">
                  {r.model}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="border border-dashed py-16 text-center text-sm text-[var(--color-ground-muted)]">
          아직 방이 없습니다. 새 방을 만들어 문서를 ground 삼아 보세요.
        </div>
      )}
    </main>
  );
}
