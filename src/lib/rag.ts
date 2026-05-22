/** RAG prompt assembly — shared by the chat route. */

export interface RetrievedChunk {
  chunk_id: string;
  content: string;
  page: number | null;
  filename: string;
  content_hash: string;
  /** 1-based pages of this document that carry a table or figure. */
  figure_pages: number[];
  similarity: number;
}

const GROUNDING_RULES = `당신은 문서 기반 RAG 어시스턴트입니다. 다음 규칙을 반드시 지키세요:
- 아래 제공된 문서 발췌(context)만을 근거로 답하세요.
- 발췌에 없는 내용은 추측하지 말고 "제공된 문서에서 근거를 찾지 못했습니다"라고 답하세요.
- 답변에 사용한 발췌를 [1], [2] 형식으로 인용하세요.
- 한국어로 명확하고 간결하게 답하세요.`;

/** Final system prompt = grounding rules + the room's custom prompt. */
export function buildSystemPrompt(roomPrompt: string): string {
  const custom = roomPrompt.trim();
  return custom ? `${GROUNDING_RULES}\n\n[방 지침]\n${custom}` : GROUNDING_RULES;
}

/** User prompt = numbered context excerpts + the question. */
export function buildUserPrompt(
  chunks: RetrievedChunk[],
  question: string,
): string {
  if (chunks.length === 0) {
    return `참고할 문서 발췌가 없습니다.\n\n질문: ${question}`;
  }
  const context = chunks
    .map((c, i) => {
      const src = c.page ? `${c.filename}, p.${c.page}` : c.filename;
      return `[${i + 1}] (출처: ${src})\n${c.content}`;
    })
    .join("\n\n");
  return `다음 문서 발췌를 근거로 질문에 답하세요.\n\n${context}\n\n질문: ${question}`;
}
