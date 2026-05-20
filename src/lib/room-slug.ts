import { slugify } from "./slug";
import { generateAnswer } from "./generation";

const PROMPT = `Convert this room name into a short English URL slug.
Rules: lowercase, hyphen-separated, at most 4 words, omit articles
(a/an/the), English words only. Respond with ONLY the slug.

Room name: `;

/** True if every character is ASCII (charCode ≤ 127). */
function isAscii(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 127) return false;
  }
  return true;
}

/**
 * Build a room slug. ASCII names are slugified directly. Names with
 * non-ASCII characters (e.g. Korean) are translated to a concise
 * English phrase via Gemini first, capped at 4 words. Falls back to
 * slugifying the raw name if translation is unavailable.
 */
export async function generateRoomSlug(name: string): Promise<string> {
  if (isAscii(name)) {
    return slugify(name);
  }

  try {
    const { text } = await generateAnswer({
      model: "gemini-2.5-flash-lite",
      systemPrompt: "You output only a URL slug — no explanation, no quotes.",
      userPrompt: PROMPT + name,
    });
    const line = text.trim().split("\n").filter(Boolean).pop() ?? "";
    const ascii = line
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .split("-")
      .filter(Boolean)
      .slice(0, 4) // hard word-count cap
      .join("-");
    if (ascii) return slugify(ascii);
  } catch {
    // Translation unavailable (e.g. rate limit) — fall through.
  }

  return slugify(name);
}
