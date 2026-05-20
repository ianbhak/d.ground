# d.ground — Product Requirements Document

작성일: 2026-05-20
최종 수정: 2026-05-20 (PRD.md + PRD02.md 머지)
작성자: ianbhak@gmail.com

---

## 0. 브랜드 & 라인업

**제품명**: d.ground (구 사내명: `domain-rag`)

**슬로건**
- EN: *Ground your conversation in documents.*
- KO: *문서에 발 디딘 대화.*

**한 단어, 두 의미**
- **Ground (n.)** — 답변이 딛고 선 문서. RAG = grounded answer, 환각 없음.
- **Ground (v.)** — 멤버들이 공통의 장(common ground)을 만든다.

**상위 라인업**
- d.connect (커뮤니티) · d.translate (번역) · d.present (발표 리허설) · d.assist (디자인 멘토) · **d.ground (RAG 챗봇)**

**호스팅**: `dground.dconnect.kr` (dconnect.kr 서브도메인, Vercel)

**비주얼**: Bauhaus 미니멀(라인업 공통). 모노크롬, Inter + Playfair Display. 상세는 [BRAND.md](BRAND.md).

---

## 1. 개요

SCI급 학술논문, 기술 명세서·API 레퍼런스·디자인 시스템 문서 등 도메인 문서를 기반으로 한 **멀티테넌트 RAG 챗봇 플랫폼**.
각 어드민/운영진이 **자신만의 독립된 RAG 챗봇(이하 "Room")**을 개설하고, 초대 링크로 멤버를 받아 운영할 수 있다.

### 핵심 가치
- 어드민이 코드 없이 자기 문서로 RAG 챗봇을 즉시 운영
- 방 단위 ACL — 외부에 노출되지 않는 사적 챗봇 공간
- 운영진(슈퍼 어드민)이 전체 시스템을 일괄 관리
- **방 단위 비용 가시화** — 어드민이 모델 선택 후 실제 사용량/비용 확인 가능
- **문서 dedup** — 동일 PDF 공유 시 임베딩/스토리지 비용 절감

### 타깃 시나리오

**A. 학술 연구실** — 교수/PI가 Room을 열고 핵심 논문 50편 업로드 → 신규 대학원생이 선행연구 질의
**B. 제품 개발팀** — 테크리드가 Room을 열고 API 레퍼런스·아키텍처 결정 기록(ADR)·디자인 시스템 문서 업로드 → 개발자·디자이너가 설계 근거 즉시 조회
**C. 사내 매뉴얼** — HR/기술팀이 Room을 열고 정책 문서·온보딩 자료 업로드 → 신규 입사자가 질의

---

## 2. 사용자 역할

| 역할 | 권한 |
|---|---|
| **Super Admin (운영진)** | 전체 방 조회/생성/삭제, 모든 유저 관리, 어드민 권한 부여, 시스템 한도 설정 |
| **Room Admin (어드민)** | 자신이 만든/배정된 방 운영 — 문서 업로드, 시스템 프롬프트/모델 설정, 멤버 삭제, 초대 링크 재발급, 방 한도 조정 (시스템 hard cap 이내) |
| **Member (일반 유저)** | 자신이 속한 방 목록 확인, 챗봇과 대화 (1:1/공용 탭 전환), 자신의 1:1 대화 기록 열람 |
| **Guest (비로그인)** | 로그인 페이지만 접근 |

> **로그인은 Google OAuth만 지원.** 별도 회원가입 없음. 첫 로그인 시 자동으로 User 레코드 생성, 기본 역할 = Member.
> **Super Admin 지정**은 `SUPER_ADMINS` 환경 변수의 이메일 화이트리스트.

---

## 3. 핵심 기능

### 3.1 인증
- Google OAuth 단일 옵션
- 세션 7일 유지, 로그아웃 지원
- `SUPER_ADMINS=email1,email2,...` 환경 변수로 지정된 이메일은 첫 로그인 시 자동 Super Admin

### 3.2 Room (독립 RAG 챗봇)

**개설**
- Room Admin 이상이 방 개설 가능
- 입력: 방 이름, 설명, 시스템 프롬프트, 모델 (기본 Gemini 2.5 Flash), 민감도, 임베딩 모델 (시스템 디폴트)

**접근 제어 — 단일 초대 링크 모델**
- 방은 항상 **비공개** (목록 비노출)
- 방 개설 시 추측 불가능한 토큰이 박힌 **초대 링크 1개**가 자동 생성됨
  (`/join/<token>`, 128-bit hex)
- 링크를 받은 사람이 로그인 후 열면 → 멤버로 자동 등록
- Room Admin이 **링크 재발급**으로 기존 링크 무효화 (입장 완료 멤버는 유지)
- 비밀번호·초대코드·이메일 초대 등 복수 경로는 인지부하 때문에 폐기 —
  공유·관리 대상은 링크 하나뿐 (Notion/Google Docs "링크가 있는 사람" 모델)

**문서 관리 (Room Admin)**
- PDF, DOCX, TXT, MD 업로드 (v1은 PDF 우선)
- 업로드 시 **SHA256 해시 계산 → 시스템 전역 dedup 검사** (§3.6 참고)
- 자동 청킹 → 임베딩 → 방 매핑 등록
- 업로드 목록 보기, 방에서 detach, 재인덱싱 (해시 동일하면 임베딩 재사용)
- **방별 쿼터** 표시 (사용량/한도, 한도 조정 가능)

**RAG 설정 (Room Admin)**
- 시스템 프롬프트 편집
- 모델 선택: `gemini-2.5-flash` (기본) / `gemini-2.5-pro` / `gemini-2.5-flash-lite`
- top-k, temperature
- 임베딩 모델은 시스템 디폴트 사용 (방별 변경 불가 — dedup 호환성 위해)

### 3.3 채팅 — 듀얼 모드 (탭 전환)

방에 입장하면 좌측에 두 개 탭:

**[탭 1] 공용 스레드 (Shared)**
- 방 멤버 전체가 같은 대화 화면을 공유
- 누구나 챗봇에게 질문 가능, 모든 멤버가 메시지(질문/답변)를 봄
- 메시지에 발화자(이름/이메일) 표시
- **Room Admin은 공용 스레드의 임의 메시지(멤버 발화 포함) 삭제 가능** — 삭제는 soft delete + 감사 로그
- 방당 1개의 공용 스레드 (v1) → 추후 다중 스레드 확장 가능

**[탭 2] 내 채팅 (Private)**
- 각자 챗봇과 1:1 대화 — 다른 멤버는 못 봄
- 다중 스레드 지원 (좌측 스레드 목록)
- 스레드 이름 자동 생성 + 수동 변경

> 공통: 응답은 항상 스트리밍, RAG 검색 결과 출처(문서명 + 페이지) 표시.
> 공통: 같은 방 문서/임베딩 인덱스 사용 — 모드만 다름.

### 3.4 어드민 콘솔

**Room Admin 콘솔 (자기 방 한정)**
- 멤버 목록 / 삭제 / 강퇴
- 초대 링크 확인 / 재발급
- 문서 업로드 / detach / 재인덱싱 — dedup 표시 ("이 문서는 N개 방에서 공유 중")
- 시스템 프롬프트 / 모델 / top-k / temperature
- **사용량 대시보드**: 메시지 수, 입출력 토큰, 추정 비용 (USD/KRW), 모델별 분해
- **쿼터 조정**: 문서 수, 총 용량 (시스템 hard cap 이내)

**Super Admin 콘솔**
- 전체 방 목록 / 강제 삭제
- 전체 유저 목록 / 역할 변경 / 정지
- **시스템 hard cap 설정** (방당 최대 문서 수, 최대 용량, 일일 토큰 한도)
- 전역 비용/사용량 대시보드 (월별 토큰, 임베딩, 스토리지)
- 공유 문서 라이브러리 조회 (어느 문서가 어느 방에 attached)

### 3.5 비용 추적 & 가시화

**저장**
- 메시지마다 `model`, `tokens_in`, `tokens_out`, `cache_read_tokens`, `cache_write_tokens` 저장
- 임베딩 호출 시 `embedding_tokens` 저장 (Document/SharedDocument 단위)

**계산**
- 모델/임베딩 단가 테이블을 코드 상수로 관리 (USD per 1M tokens)
- Room Admin 콘솔에서 방별 일일/누적 비용 표시
- (예상) Gemini 2.5 Flash 기준 메시지 평균 비용 ~$0.003 (input 4K + output 600 토큰 기준)

**한도**
- 방별 일일 토큰 한도 (Super Admin이 시스템 디폴트, Room Admin이 방별 조정)
- 한도 초과 시 응답 거부 + 어드민 알림

### 3.6 문서 중복 처리 — SharedDocument 패턴

**문제**: 같은 PDF(예: 팀 공용 API 레퍼런스)가 여러 방에 업로드될 때 임베딩 비용/스토리지/시간 낭비.

**해결**: 컨텐츠 해시 기반 시스템 전역 dedup.

**플로우**
1. 어드민이 PDF 업로드
2. 서버에서 SHA256 계산
3. `SharedDocument` 테이블에 해시 존재 → 청크/임베딩 재사용, `RoomDocument` 매핑만 새로 생성
4. 없으면 → 새로 청킹/임베딩 후 SharedDocument + 첫 RoomDocument 매핑 생성
5. 어드민 UI에 "공유 문서 — N개 방에서 사용 중" 표시

**보안/격리**
- RAG 쿼리는 **항상** `room_documents` 매핑을 join — 다른 방 문서가 절대 검색되지 않음
- 쿼리 헬퍼 함수로 래핑 (room_id 누락 시 throw)
- 방에서 detach해도 SharedDocument는 다른 방이 참조 중이면 유지, 마지막 참조 제거되면 삭제

**제약**
- Dedup의 전제는 **임베딩 모델 동일** — 그래서 임베딩 모델은 시스템 디폴트 1개로 고정. 변경 시 전체 재인덱싱 필요.
- 텍스트 추출/청킹 알고리즘도 동일해야 함 — 버전 마이그레이션 시 재인덱싱.

**기대 효과**
- 샘플 문서 5종이 여러 방에서 재사용된다면 임베딩 비용 N분의 1, 인덱싱 시간도 단축.

### 3.7 민감정보 처리 정책

전문 도메인 문서는 **개인정보(주민번호/연락처 등)** + **법인 정보(사업자번호/도장)** + **사업적 민감 정보**가 혼재. 사업적 민감 정보는 챗봇의 핵심 컨텐츠이므로 일률 마스킹 불가. → **계층화 + 어드민 판단** 모델 채택.

#### L1. 업로드 시 자동 PII 스캔 (v1)
- 한국 패턴 정규식으로 검출:
  - 주민번호 (`\d{6}-?\d{7}`)
  - 휴대전화 (`01[0-9]-?\d{3,4}-?\d{4}`)
  - 이메일 (RFC 5322 단순 패턴)
  - 계좌번호 (은행별 자릿수 패턴)
  - 신용카드 (`\d{4}-?\d{4}-?\d{4}-?\d{4}`)
  - 사업자등록번호 (`\d{3}-?\d{2}-?\d{5}`)
- 비용 무료, 지연 무시할 수준
- 위치 정보(문서 페이지, 오프셋)와 함께 저장

#### L2. 어드민 결정 UI (v1)
- 검출 결과 표시 → 어드민이 선택:
  - **(a) 자동 마스킹 후 인덱싱** — 원본은 SharedDocument에 암호화 보관, 청크/임베딩/응답엔 마스킹 버전
  - **(b) 그대로 업로드** — 사업적 민감 정보가 챗봇 핵심인 경우
  - **(c) 업로드 취소**
- 마스킹 형식: `[주민번호 마스킹]`, `[연락처 마스킹]` 등 (타입 표시 + 원본 길이 보존)

#### L3. 방 민감도 등급 (v1.5)
- 어드민이 방 생성 시 라벨 선택: `public` / `internal` / `confidential`
- `confidential` 방은 시스템 프롬프트에 "외부 공유 금지, 인용 시 출처만" 자동 주입
- 라벨은 UI 표시 + 감사 로그 태깅용 — 실제 ACL은 멤버십이 결정

#### L4. 응답 출력 필터 (v1.5)
- LLM 응답 스트림에서 같은 정규식으로 1회 더 검사 — 안전망
- 검출 시 마스킹 후 사용자에 전송 + 어드민 알림

#### L5. 운영 정책 (v1)
- **업로드 시 책임 동의 체크박스**: "이 문서에 민감정보가 포함된 경우 책임은 업로더에게 있으며, 플랫폼은 마스킹/보안 조치를 합리적 범위에서 제공합니다"
- **Gemini API 데이터 처리**: 유료 등급(paid tier)의 Gemini API는 입력 데이터를 모델 학습에 사용하지 않음 — 프로젝트를 유료 등급으로 운영하고 약관 페이지 링크를 명시. (무료 등급은 학습에 사용될 수 있으므로 운영 환경에서는 유료 등급 필수)
- **감사 로그**: 업로드/조회/삭제/마스킹 액션 전체 기록 (90일 보관)
- **방 삭제 시 데이터 처리**:
  - 방 삭제 → 30일 grace period (복구 가능)
  - 30일 후 영구 삭제 — 마지막 참조면 SharedDocument도 삭제
  - 감사 로그는 90일 별도 보관 후 익명화
- **PII 정책 페이지**: 별도 문서로 사용자에 공개 (서비스 약관과 분리)

#### 비포함 (의도적 배제)
- AI 기반 PII 검출 — 비용/지연 대비 정규식이 한국 패턴에 충분
- 클라이언트 사이드 암호화 — RAG 검색 불가
- 외부 DLP 서비스 (Nightfall, Skyflow 등) — v1 규모 대비 과투자
- 자동 일괄 마스킹 — 사업적 민감 정보 손실

### 3.8 쿼터 (디폴트)

샘플 문서 세트(PDF 총합 ~220MB) 기준으로 디폴트 설정:

| 항목 | 시스템 hard cap (Super Admin) | 방별 디폴트 (Room Admin 조정 가능) |
|---|---|---|
| 방당 문서 수 | 500개 | 100개 |
| 방당 총 용량 | 2 GB | 500 MB |
| 방당 일일 메시지 토큰 | 5 M | 500 K |

> Room Admin은 자기 방의 디폴트값을 시스템 hard cap까지 자유롭게 조정.
> Super Admin은 시스템 hard cap을 언제든 수정.

---

## 4. 주요 유저 플로우

### 4.1 어드민이 방 만들고 링크 공유
1. Google 로그인 → "방 만들기" → 이름/프롬프트/모델/민감도 입력
2. 방 생성 직후 초대 링크 자동 발급 → 복사
3. 문서 업로드 → 해시 검사 → dedup 표시 또는 신규 인덱싱
4. (필요 시) 링크 재발급으로 기존 링크 무효화

### 4.2 일반 유저가 링크로 입장
1. 공유받은 초대 링크(`/join/<token>`) 클릭
2. 미로그인 시 Google 로그인 → 로그인 후 자동으로 입장 처리
3. 멤버로 자동 등록 → 방으로 이동, "공용/내 채팅" 탭에서 대화 시작

### 4.4 어드민이 비용 확인 후 모델 변경
1. 사용량 대시보드에서 방별 누적 비용 확인 (모델별 분해)
2. Pro → Flash로 변경 → 신규 메시지부터 반영

---

## 5. 비기능 요구사항

| 항목 | 요구사항 |
|---|---|
| 응답 지연 | 첫 토큰 < 2초, 일반 대화 스트리밍 |
| 동시 사용 | v1 동시 접속 50명 가정 |
| 보안 | 초대 토큰 128-bit 난수, 방 ACL 서버사이드 강제(RLS), RAG 쿼리 헬퍼가 room_id 필터 누락 시 throw |
| 데이터 격리 | SharedDocument 도입에도 불구하고 방 간 검색 누출 0건 — 단위 테스트로 강제 |
| 비용 통제 | 유저별/방별 일일 토큰 한도, 한도 초과 시 차단 |
| 로깅 | 모든 챗 메시지/검색 쿼리/관리 액션 감사 로그, 비용 텔레메트리 |
| 캐시 | Gemini context caching 활용 (시스템 프롬프트 + 자주 쓰이는 문서 청크) → 입력 비용 절감 |

---

## 6. 기술 스택 (확정)

| 영역 | 선택 | 비고 |
|---|---|---|
| **프레임워크** | Next.js 15 (App Router) | 풀스택 단일 코드베이스 |
| **언어** | TypeScript | |
| **UI** | Tailwind CSS + shadcn/ui | d.connect와 동일 디자인 시스템 |
| **챗 UI** | Vercel AI SDK (`useChat`) + 자체 공용 스레드 핸들러 | 1:1은 useChat 그대로, 공용은 Postgres pub/sub 또는 Supabase Realtime |
| **인증** | **Supabase Auth (`@supabase/ssr`)** + Google Provider | d.connect와 동일한 `auth.users` 공유 (§12 참조) |
| **DB** | PostgreSQL (Supabase) — **d.connect 프로젝트 공유** | `dground` 스키마로 격리, pgvector 확장 |
| **데이터 접근** | Supabase JS 클라이언트 (PostgREST) + Postgres RPC 함수 | RLS 자동 적용. 별도 ORM·직접 연결(`DATABASE_URL`) 없음 |
| **타입** | `supabase gen types`로 DB 스키마에서 자동 생성 | `npm run db:types` → `src/lib/database.types.ts` |
| **벡터 검색** | Postgres 함수 `match_chunks()` + `supabase.rpc()` | room_documents join을 함수에 내장 → ACL·방 격리 강제 |
| **LLM (생성)** | Gemini API — 2.5 Flash (기본) / 2.5 Pro / 2.5 Flash-Lite | 방별 선택. 임베딩과 동일 벤더·키, 별도 ANTHROPIC 키 불필요 |
| **임베딩 (확정)** | **Voyage AI `voyage-3-lite`** | $0.02/1M, 다국어 지원, 한국어 품질 양호. 부족 시 `voyage-3`로 업그레이드 |
| **PDF 파싱** | `unpdf` (Node) | 서버사이드 텍스트 추출 |
| **청킹** | 자체 구현 (500 토큰 / 50 오버랩, 문단 경계 우선) | |
| **파일 저장** | Supabase Storage | SharedDocument는 해시 경로로 저장 |
| **실시간 (공용 스레드)** | Supabase Realtime | 같은 방 멤버에 메시지 broadcast |
| **이메일 (초대)** | Resend | |
| **배포** | Vercel (앱) + Supabase (DB/Storage/Realtime, **라인업 공통**) | `dground.dconnect.kr` 서브도메인. Free → Pro 업그레이드 시점은 W7 직전 |
| **모니터링** | Vercel Analytics + Sentry | |

### 모델 단가 참고 (2026 초 기준, USD per 1M tokens)

| 모델 | Input | Output | 비고 |
|---|---|---|---|
| gemini-2.5-flash-lite | $0.10 | $0.40 | 최저비용 |
| gemini-2.5-flash | $0.30 | $2.50 | **기본** |
| gemini-2.5-pro | $1.25 | $10 | 고품질 |
| gemini-embedding-001 | 무료 티어 | — | 임베딩 |

> 메시지당 예상 비용 (input 4K + output 600 토큰, 캐시 없음):
> - Flash-Lite: ~$0.0006
> - Flash: ~$0.0027
> - Pro: ~$0.011
> context caching 적용 시 입력 비용 추가 절감. (참고: Claude Sonnet은 동일 조건 ~$0.021로 Flash의 8배)

---

## 7. 데이터 모델 (확정 초안)

```
User
  id, email, name, image, role (super_admin | room_admin | member), created_at

Room
  id, name, description, owner_id (→User),
  system_prompt, model, top_k, temperature, sensitivity,
  join_token (unique),         -- 초대 링크 토큰, 재발급 가능
  quota_docs, quota_bytes, quota_daily_tokens,
  created_at

Membership
  id, room_id, user_id, role (admin | member),
  joined_at, joined_via (owner | invite)   -- invite = 초대 링크 입장

SharedDocument                  -- 시스템 전역 dedup
  id, content_hash (unique, sha256),
  original_filename, mime_type, byte_size,
  text_extract_version, chunking_version, embedding_model,
  status (pending | indexed | failed),
  created_at, indexed_at

RoomDocument                    -- 방 ↔ SharedDocument 매핑
  id, room_id, shared_doc_id,
  display_filename,             -- 방별 이름 변경 허용
  attached_by, attached_at

Chunk                           -- SharedDocument 종속
  id, shared_doc_id, content, embedding (vector),
  page, chunk_index, metadata_json

Thread
  id, room_id,
  visibility (private | shared),
  user_id (nullable, shared면 NULL),
  title, created_at, last_message_at

Message
  id, thread_id,
  sender_id (→User, nullable — assistant면 NULL),
  role (user | assistant),
  content,
  sources_json (인용 청크 ids + 점수),
  model, tokens_in, tokens_out, cache_read_tokens, cache_write_tokens,
  created_at

-- (Invite 테이블 폐기 — 방 단위 join_token 으로 대체)

UsageDaily                      -- 비용 집계 (매일 1행/방/모델)
  id, room_id, date, model,
  tokens_in_sum, tokens_out_sum, cache_read_sum, cache_write_sum,
  message_count, estimated_cost_usd

AuditLog
  id, actor_id, action, target_type, target_id,
  metadata_json, created_at
```

**핵심 인덱스**
- `chunks.embedding` — HNSW or IVF
- `room_documents (room_id, shared_doc_id)` — 유니크
- `shared_documents.content_hash` — 유니크
- `messages (thread_id, created_at)`

**RAG 쿼리 (의사 SQL)**
```sql
SELECT c.id, c.content, c.page, c.embedding <=> $query_vec AS dist,
       sd.original_filename
FROM chunks c
JOIN shared_documents sd ON sd.id = c.shared_doc_id
JOIN room_documents rd ON rd.shared_doc_id = sd.id
WHERE rd.room_id = $room_id    -- ★ 격리 보장
ORDER BY dist
LIMIT $top_k;
```

---

## 8. v1 스코프 / 비스코프

### v1 포함
- Google 로그인
- 방 생성/삭제, 초대 링크 입장 + RLS 기반 ACL
- PDF 업로드 → SharedDocument dedup → pgvector 인덱싱
- 듀얼 채팅 모드 (공용/1:1 탭)
- 출처 표시 (문서명 + 페이지)
- Room Admin / Super Admin 콘솔
- 비용 추적 대시보드 (방별/모델별)
- 쿼터 (시스템 cap + 방별 조정)

### v1 제외 (백로그)
- DOCX/TXT/MD 업로드 (PDF만 우선)
- 음성/이미지 입력
- 비Gemini 모델 (Claude/OpenAI) — 방별 picker는 Gemini 티어만
- Webhook / API 외부 통합
- 모바일 앱 (반응형 웹만)
- 방별 임베딩 모델 선택 (dedup 깨짐 — 시스템 단일 디폴트)
- 다중 공용 스레드 (방당 1개)
- Reranker
- Self-host 가이드

---

## 9. 결정 사항

| # | 항목 | 결정 |
|---|---|---|
| 1 | 채팅 모드 | **공용/1:1 탭 병행** — 같은 문서 인덱스 공유 |
| 2 | 인증 | **Google OAuth만** |
| 3 | Super Admin 지정 | **ENV 화이트리스트** (`SUPER_ADMINS=...`) |
| 4 | 쿼터 | **시스템 hard cap + 방별 조정 가능** — 디폴트: 방당 100문서/500MB/500K tokens/day |
| 5 | 임베딩 모델 | **Voyage `voyage-3-lite`** ($0.02/1M, 한국어 OK) |
| 6 | 생성 모델 | **Gemini로 통일** — 2.5 Flash 기본, 방별 picker(Flash/Pro/Flash-Lite) + 비용 가시화. Claude 대비 ~8x 저렴, 임베딩과 동일 벤더 |
| 7 | 문서 dedup | **시스템 전역 SharedDocument 패턴** (해시 기반, ACL은 매핑 테이블로) |
| 8 | 공용 스레드 모더레이션 | **Room Admin이 임의 메시지 삭제 가능** (soft delete + 감사 로그) |
| 9 | 민감정보 처리 | **5계층 접근** — L1 PII 자동 스캔 (정규식) + L2 어드민 결정 UI + L5 운영 정책은 v1, L3 방 민감도 등급 + L4 응답 필터는 v1.5 |
| 10 | 브랜드 / 호스팅 | **d.ground @ `dground.dconnect.kr`** (서브도메인). 별도 도메인 미구매. |
| 11 | DB & Auth 전략 | **d.connect Supabase 프로젝트 확장** — `dground` 스키마 격리, Supabase Auth(`auth.users`) 라인업 공유. 라인업 통합 분석(운영진/사용자/활동량) 위해 단일 DB 채택. |

---

## 10. 마일스톤

| 주차 | 산출물 |
|---|---|
| W0 (현재) | 브랜딩·PRD 머지·랜딩 카피 확정, pgvector 활성화, `dground` 스키마 부트스트랩 |
| W1 | Next.js 스캐폴딩, Supabase Auth (`@supabase/ssr`) + Google, profiles 연동, Room 스키마/CRUD UI |
| W2 | PDF 업로드 + SHA256 dedup + 청킹 + voyage-3-lite 임베딩 + pgvector |
| W3 | RAG 쿼리 파이프라인 + 채팅 UI (1:1 스트리밍) + 출처 표시 |
| W4 | 공용 스레드 (Supabase Realtime), Membership ACL, 멤버 관리 콘솔 |
| W5 | Room Admin 콘솔 (멤버/문서/모델/쿼터/비용 대시보드) |
| W6 | Super Admin 콘솔, 감사 로그, 한도 강제, 한국어 UI 다듬기 |
| W7 | Supabase **Pro 업그레이드** (PITR + 8GB storage), 첫 방(샘플 도메인 문서 5종 PDF) 시드, QA, `dground.dconnect.kr` 배포 |

---

## 11. 남은 검토 포인트

1. **임베딩 한국어 벤치**: voyage-3-lite vs voyage-3 — 첫 방 PDF로 실측 후 결정.
2. **prompt caching 전략**: 시스템 프롬프트만 캐시 vs 자주 쓰이는 청크까지 캐시 — 트래픽 보고 결정.
3. **초대 링크 보안**: 토큰은 시간 만료 없이 재발급으로만 무효화 — 유출 위험이 큰 방은 confidential 등급 + 주기적 재발급 안내로 충분한지 검토.
4. **Gemini API 등급**: 운영 환경은 유료 등급(데이터 미학습) 필수 — 무료 등급 한도와 유료 전환 시점 확인 필요.
5. **방 삭제 grace period**: 30일이 적정한지 — 법인 사용 사례에 따라 조정 가능.
6. **PII 마스킹 false positive**: 정규식 오검출 (사업자번호 형식과 다른 숫자열 등) — 시드 PDF로 정확도 측정 후 패턴 튜닝.
7. **공통 `profiles` 테이블 소유권**: d.connect가 현재 마스터 — d.ground/d.translate가 컬럼 추가 필요할 때 라인업 공통 마이그레이션 절차 정해야 함.

---

## 12. d.connect 라인업과의 관계

### 통합 전략 (확정)

라인업 통합 분석(**운영진·사용자·활동량**)을 위해 **단일 Supabase 프로젝트 + 스키마 격리**를 채택.
각 d.* 서비스는 자기 도메인 스키마만 소유하고, `auth.users` + `public.profiles`는 라인업 공통.

| 영역 | 결정 |
|---|---|
| **호스팅** | `dground.dconnect.kr` (Vercel) |
| **프레임워크** | d.ground = Next.js 15 (의도적 분기 — 풀스택 + AI SDK 이점) / d.connect = React+Vite |
| **디자인 시스템** | Tailwind + shadcn/ui (d.connect 컴포넌트 재사용), Bauhaus 미니멀 톤 공유 |
| **인증** | ✅ **Supabase Auth 공유** — d.connect의 `auth.users`를 그대로 사용. `@supabase/ssr`로 Next.js 통합. |
| **OAuth 클라이언트** | ✅ Google Cloud 동일 OAuth client. 각 d.* 서브도메인을 redirect URI에 추가 등록. |
| **DB** | ✅ **d.connect Supabase 프로젝트 공유** — `dground` 스키마 격리. RLS는 스키마별 독립 정책. |
| **공통 테이블** | `auth.users`, `public.profiles` (라인업 마스터). `public.profiles.role`로 운영진 일괄 관리. |
| **도메인 테이블** | `dground.rooms`, `dground.memberships`, ... — 모두 `dground` 스키마 내부. user_id는 `public.profiles.id` FK. |
| **네비게이션** | 라인업 헤더 컴포넌트 공유 시 d.* 사이트 간 이동 가능 |
| **분석** | `profiles JOIN dconnect.posts JOIN dground.messages ...` 단일 DB 내 SQL JOIN으로 가능 |

### 라인업 통합 분석 예시

```sql
-- 라인업 전체 활동량 상위 사용자
SELECT
  p.email,
  COUNT(DISTINCT dc.id) AS dconnect_posts,
  COUNT(DISTINCT dg.id) AS dground_messages,
  COUNT(DISTINCT dt.id) AS dtranslate_sessions
FROM public.profiles p
LEFT JOIN dconnect.posts dc       ON dc.author_id = p.id
LEFT JOIN dground.messages dg     ON dg.sender_id = p.id
LEFT JOIN dtranslate.sessions dt  ON dt.user_id   = p.id
GROUP BY p.id, p.email
ORDER BY (dconnect_posts + dground_messages + dtranslate_sessions) DESC
LIMIT 20;
```

### 리스크 / 완화

- **Blast radius**: 한 DB가 라인업 SPOF → W7 Pro 업그레이드로 PITR 확보, CI 마이그레이션 dry-run
- **마이그레이션 일관성**: 라인업 전체가 손으로 쓴 raw SQL 마이그레이션 사용 — ORM별 도구 충돌 없음. d.ground는 `dground` 스키마만 건드림
- **RLS 누락**: 새 `dground.*` 테이블은 모두 RLS enabled로 시작, 기본 정책은 deny-all + 명시적 allow
