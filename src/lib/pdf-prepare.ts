/**
 * Client-side PDF downsizing — runs in the browser before a PDF is
 * uploaded to Storage. Keeps d.ground on the Supabase Free plan, where
 * the per-file Storage ceiling is well under most large source PDFs.
 *
 * A file at or below the upload limit is passed straight through,
 * untouched, so its native text layer is preserved. An oversized file
 * is rasterised page-by-page at ~150 DPI, the pages are re-encoded as
 * JPEG, and reassembled into one or more PDF "parts" with pdf-lib.
 *
 * Each part is packed to stay under PART_TARGET_BYTES — comfortably
 * inside Gemini's ~12 MB inline-vision cap — so every processed part
 * is indexed via vision OCR (see src/lib/pdf.ts). Rasterising drops
 * the original text layer, but for files this large vision OCR is the
 * only path that indexes well on the Free plan anyway.
 *
 * Browser-only: depends on OffscreenCanvas / createImageBitmap.
 */

const MAX_UPLOAD_BYTES = 32 * 1024 * 1024; // matches the Storage bucket limit
const PART_TARGET_BYTES = 11 * 1024 * 1024; // keep each part under Gemini's 12 MB vision cap
const HARD_MAX_BYTES = 300 * 1024 * 1024; // refuse to rasterise beyond this — would risk an OOM tab
const RENDER_SCALE = 150 / 72; // render at ~150 DPI (PDF user space is 72 DPI)
const MAX_RENDER_PX = 2200; // hard cap on a rasterised page's longest side
const JPEG_QUALITY = 0.72;

export type PreparePhase =
  | { kind: "rendering"; page: number; total: number }
  | { kind: "assembling"; part: number };

export interface PreparedPart {
  blob: Blob;
  filename: string;
}

export class PdfTooLargeError extends Error {
  constructor(sizeBytes: number) {
    super(
      `파일이 너무 큽니다 (${(sizeBytes / 1024 / 1024).toFixed(0)}MB). ` +
        `${HARD_MAX_BYTES / 1024 / 1024}MB 이하로 나눠서 올려주세요.`,
    );
    this.name = "PdfTooLargeError";
  }
}

/** Strip a trailing ".pdf" (case-insensitive) to get the base name. */
function baseName(filename: string): string {
  return filename.replace(/\.pdf$/i, "");
}

type RenderedPage = { bytes: Uint8Array; width: number; height: number };

/**
 * Decode a rendered-page PNG and re-encode it as a downscaled JPEG.
 * Caps the longest side at MAX_RENDER_PX so an oversized page (e.g. a
 * poster) can't blow up memory or the output size.
 */
async function transcodeToJpeg(png: ArrayBuffer): Promise<RenderedPage> {
  const bitmap = await createImageBitmap(new Blob([png]));
  let width = bitmap.width;
  let height = bitmap.height;
  const longest = Math.max(width, height);
  if (longest > MAX_RENDER_PX) {
    const ratio = MAX_RENDER_PX / longest;
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지 변환을 초기화하지 못했습니다.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await canvas.convertToBlob({
    type: "image/jpeg",
    quality: JPEG_QUALITY,
  });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
}

/** Assemble rasterised pages into a single image-only PDF part. */
async function buildPart(pages: RenderedPage[]): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  for (const p of pages) {
    const img = await doc.embedJpg(p.bytes);
    const page = doc.addPage([p.width, p.height]);
    page.drawImage(img, { x: 0, y: 0, width: p.width, height: p.height });
  }
  const bytes = await doc.save();
  // Copy into a plain ArrayBuffer — pdf-lib's Uint8Array isn't a valid
  // BlobPart under the strict typed-array generics in current TS libs.
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: "application/pdf" });
}

/**
 * Prepare a PDF for upload. Returns one part for a file already within
 * the limit, or several rasterised parts for an oversized file.
 */
export async function preparePdfForUpload(
  file: File,
  onProgress?: (phase: PreparePhase) => void,
): Promise<PreparedPart[]> {
  if (file.size <= MAX_UPLOAD_BYTES) {
    return [{ blob: file, filename: file.name }];
  }
  if (file.size > HARD_MAX_BYTES) {
    throw new PdfTooLargeError(file.size);
  }

  const { getDocumentProxy, renderPageAsImage } = await import("unpdf");
  const source = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocumentProxy(source);
  const total = pdf.numPages;

  const parts: { blob: Blob; startPage: number; endPage: number }[] = [];
  let bucket: RenderedPage[] = [];
  let bucketBytes = 0;
  let bucketStart = 1;

  const flush = async (endPage: number) => {
    onProgress?.({ kind: "assembling", part: parts.length + 1 });
    const blob = await buildPart(bucket);
    parts.push({ blob, startPage: bucketStart, endPage });
    bucket = [];
    bucketBytes = 0;
  };

  for (let n = 1; n <= total; n++) {
    onProgress?.({ kind: "rendering", page: n, total });
    const png = await renderPageAsImage(pdf, n, { scale: RENDER_SCALE });
    const rendered = await transcodeToJpeg(png);

    // Start a new part once this page would push the bucket over target
    // (but never emit an empty part — a single huge page stands alone).
    if (bucket.length > 0 && bucketBytes + rendered.bytes.length > PART_TARGET_BYTES) {
      await flush(n - 1);
      bucketStart = n;
    }
    bucket.push(rendered);
    bucketBytes += rendered.bytes.length;
  }
  if (bucket.length > 0) await flush(total);

  const base = baseName(file.name);
  if (parts.length === 1) {
    return [{ blob: parts[0].blob, filename: `${base}.pdf` }];
  }
  return parts.map((p) => ({
    blob: p.blob,
    filename: `${base} (p.${p.startPage}-${p.endPage}).pdf`,
  }));
}
