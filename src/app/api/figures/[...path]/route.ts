import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { renderPageThumbnail } from "@/lib/pdf";

const DOCS_BUCKET = "dground-docs";
const FIGURES_BUCKET = "dground-figures";

const IMAGE_HEADERS = {
  "Content-Type": "image/png",
  "Cache-Control": "private, max-age=31536000, immutable",
};

/**
 * Serve a page thumbnail for an indexed PDF.
 *
 * Path: /api/figures/<content_hash>/p<N>.png
 *
 * Thumbnails are rendered lazily — the first request for a page
 * rasterises it from the stored PDF and caches the PNG in the private
 * dground-figures bucket; later requests are served from that cache.
 * Only pages an answer actually cites are ever rendered.
 *
 * Auth: the caller must be able to SELECT the shared_document with
 * this content_hash under RLS — i.e. be a member of some room that
 * has the document attached.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const hash = path[0] ?? "";
  const file = path[1] ?? "";
  const pageMatch = /^p(\d+)\.png$/.exec(file);

  if (path.length !== 2 || !/^[a-f0-9]{64}$/.test(hash) || !pageMatch) {
    return new Response("not found", { status: 404 });
  }
  const page = Number(pageMatch[1]);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  // RLS gate — a row comes back only if the caller may see this doc.
  const { data: doc } = await supabase
    .schema("dground")
    .from("shared_documents")
    .select("storage_path")
    .eq("content_hash", hash)
    .maybeSingle();
  if (!doc) return new Response("forbidden", { status: 403 });

  const admin = createSupabaseAdminClient();
  const thumbPath = `${hash}/${file}`;

  // Cache hit — serve the already-rendered thumbnail.
  const cached = await admin.storage.from(FIGURES_BUCKET).download(thumbPath);
  if (cached.data) {
    return new Response(cached.data, { headers: IMAGE_HEADERS });
  }

  // Cache miss — render this page from the stored PDF, then cache it.
  const pdf = await admin.storage
    .from(DOCS_BUCKET)
    .download(doc.storage_path);
  if (!pdf.data) return new Response("not found", { status: 404 });

  let png: ArrayBuffer | null;
  try {
    png = await renderPageThumbnail(
      new Uint8Array(await pdf.data.arrayBuffer()),
      page,
    );
  } catch {
    return new Response("render failed", { status: 500 });
  }
  if (!png) return new Response("not found", { status: 404 });

  await admin.storage.from(FIGURES_BUCKET).upload(thumbPath, png, {
    contentType: "image/png",
    upsert: true,
  });

  return new Response(png, { headers: IMAGE_HEADERS });
}
