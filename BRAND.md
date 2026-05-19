# d.ground — Brand Direction

## 1. Brand Essence

**Name**: d.ground
**One-liner (EN)**: *Ground your conversation in documents.*
**One-liner (KO)**: *문서에 발 디딘 대화.*

**Two meanings, one word**:
- **Ground (n.)** — the source documents the AI stands on. RAG = grounded answer.
- **Ground (v.)** — to build common ground; a shared place where members talk through what the documents say.

→ Technical truth (no hallucination) + Human truth (shared understanding) packed into one word.

## 2. Positioning

> *d.ground is where domain experts open a Room, ground their AI in their own documents, and invite a team to stand on the same ground.*

- **Vs. general chatbots**: every answer is sourced, no invention.
- **Vs. enterprise search**: conversational, not just retrieval.
- **Vs. internal wikis**: AI as facilitator, not passive storage.

## 3. Taglines (variants)

| Use | EN | KO |
|---|---|---|
| Primary | Ground your conversation in documents. | 문서에 발 디딘 대화. |
| Alt 1 | Where knowledge becomes common ground. | 지식이 공통의 장이 되는 곳. |
| Alt 2 | No hallucination. Just your sources. | 환각 없이, 당신의 문서만. |
| Alt 3 | A Room for documents, for people. | 문서를 위한, 사람을 위한 방. |
| Microcopy | Open your Room. Upload your ground. Invite your people. | 방을 열고, 문서를 올리고, 사람을 초대하세요. |

## 4. Visual Direction (aligned with d.connect Bauhaus)

- **Palette**: Black `#000` / White `#FFF` / Gray `#888` (monochrome, like d.connect)
- **Accent (optional)**: Single muted tone — *earth* / *clay* / *terracotta* — playing on "ground"
  - Suggested: `#3E2F1C` (deep earth) or `#A9886B` (warm clay)
- **Type**: Inter (UI) + Playfair Display (headers) — same as d.connect
- **Iconography**: Horizon line. Solid floor. A document anchoring upward into a conversation bubble.

## 5. Logo Direction — text mark concepts

### Concept A — Horizon
```
d.ground
────────
```
Wordmark with a baseline rule that visualizes the "ground" itself.

### Concept B — Anchor
```
d.ground
    ▼
```
A small downward marker under "ground" — the document anchoring the conversation.

### Concept C — Layer
```
┌─────────┐
│ d.ground│
└─────────┘
```
Wordmark on a solid block — literal "ground" as a foundation slab.

### Concept D — Punctuated (matches d.connect "." pattern)
```
d·ground
```
Middle dot variant for tighter logo lockup. Use `d.ground` in body copy, `d·ground` in compact lockups.

**Recommended**: **A (Horizon)** as the primary wordmark — purest expression of the "ground" metaphor, scales cleanly to favicon, works with d.connect family's minimalist tone.

## 6. Domain & Handle

### Production URL

**Primary**: `dground.dconnect.kr`

d.ground lives as a subdomain under the existing parent brand `dconnect.kr`.
This keeps the d.connect family unified under one root and avoids a separate domain purchase.

- **Parent**: `dconnect.kr` (already registered, Vercel DNS)
- **This product**: `dground.dconnect.kr`
- **Sibling pattern** (likely): `dtranslate.dconnect.kr`, `dpresent.dconnect.kr`, etc.

### DNS / Hosting Plan

- Add CNAME `dground` → Vercel project for d.ground
- Auto-issue TLS via Vercel
- No separate domain registration needed

### Code Handles (checked 2026-05-20)

| Asset | Status | Plan |
|---|---|---|
| GitHub `d-ground` | ✅ Available | Use for org or repo |
| GitHub `dground` | ❌ Taken | — |
| npm `dground` | ✅ Available | Available if needed |
| npm `d-ground` | ✅ Available | Available if needed |

### Standalone domains — deferred

External `.ai` / `.app` / `.io` domains (`dground.ai` etc. all available) are **deferred**.
Revisit only if d.ground spins out of the d.connect family as a standalone product.
