import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const FIGURES_BUCKET = "dground-figures";

/**
 * Serve a page thumbnail for an indexed PDF.
 *
 * Path: /api/figures/<content_hash>/p<N>.png
 *
 * Auth: the caller must be able to SELECT the shared_document with
 * this content_hash under RLS — i.e. be a member of some room that
 * has the document attached. The image bytes themselves are then
 * fetched with the service-role client from the private bucket.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const hash = path[0] ?? "";
  const file = path[1] ?? "";

  if (path.length !== 2 || !/^[a-f0-9]{64}$/.test(hash) || !/^p\d+\.png$/.test(file)) {
    return new Response("not found", { status: 404 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  // RLS gate — a row comes back only if the caller may see this doc.
  const { data: doc } = await supabase
    .schema("dground")
    .from("shared_documents")
    .select("id")
    .eq("content_hash", hash)
    .maybeSingle();
  if (!doc) return new Response("forbidden", { status: 403 });

  const admin = createSupabaseAdminClient();
  const { data: blob, error } = await admin.storage
    .from(FIGURES_BUCKET)
    .download(`${hash}/${file}`);
  if (error || !blob) return new Response("not found", { status: 404 });

  return new Response(blob, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
