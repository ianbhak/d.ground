import { sql } from "drizzle-orm";
import {
  bigint,
  date,
  integer,
  jsonb,
  numeric,
  pgSchema,
  real,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

export const dground = pgSchema("dground");

export const rooms = dground.table("rooms", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  ownerId: uuid("owner_id").notNull(),
  systemPrompt: text("system_prompt").default("").notNull(),
  model: text("model").default("claude-sonnet-4-6").notNull(),
  topK: integer("top_k").default(5).notNull(),
  temperature: real("temperature").default(0.2).notNull(),
  passwordHash: text("password_hash"),
  sensitivity: text("sensitivity").default("internal").notNull(),
  quotaDocs: integer("quota_docs").default(100).notNull(),
  quotaBytes: bigint("quota_bytes", { mode: "number" })
    .default(524288000)
    .notNull(),
  quotaDailyTokens: bigint("quota_daily_tokens", { mode: "number" })
    .default(500000)
    .notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const memberships = dground.table(
  "memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    role: text("role").default("member").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    joinedVia: text("joined_via").notNull(),
  },
  (t) => ({
    uniqueRoomUser: unique().on(t.roomId, t.userId),
  }),
);

export const sharedDocuments = dground.table("shared_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  contentHash: text("content_hash").notNull().unique(),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  byteSize: bigint("byte_size", { mode: "number" }).notNull(),
  storagePath: text("storage_path").notNull(),
  textExtractVersion: text("text_extract_version").default("v1").notNull(),
  chunkingVersion: text("chunking_version").default("v1").notNull(),
  embeddingModel: text("embedding_model").default("voyage-3-lite").notNull(),
  embeddingDim: integer("embedding_dim").default(512).notNull(),
  status: text("status").default("pending").notNull(),
  piiFindings: jsonb("pii_findings").default(sql`'[]'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  indexedAt: timestamp("indexed_at", { withTimezone: true }),
});

export const roomDocuments = dground.table(
  "room_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    sharedDocId: uuid("shared_doc_id")
      .notNull()
      .references(() => sharedDocuments.id, { onDelete: "restrict" }),
    displayFilename: text("display_filename").notNull(),
    attachedBy: uuid("attached_by").notNull(),
    attachedAt: timestamp("attached_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    uniqueRoomDoc: unique().on(t.roomId, t.sharedDocId),
  }),
);

export const chunks = dground.table("chunks", {
  id: uuid("id").defaultRandom().primaryKey(),
  sharedDocId: uuid("shared_doc_id")
    .notNull()
    .references(() => sharedDocuments.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 512 }),
  page: integer("page"),
  chunkIndex: integer("chunk_index").notNull(),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const threads = dground.table("threads", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id")
    .notNull()
    .references(() => rooms.id, { onDelete: "cascade" }),
  visibility: text("visibility").notNull(),
  userId: uuid("user_id"),
  title: text("title").default("새 대화").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const messages = dground.table("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  threadId: uuid("thread_id")
    .notNull()
    .references(() => threads.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id"),
  role: text("role").notNull(),
  content: text("content").notNull(),
  sources: jsonb("sources").default(sql`'[]'::jsonb`).notNull(),
  model: text("model"),
  tokensIn: integer("tokens_in").default(0).notNull(),
  tokensOut: integer("tokens_out").default(0).notNull(),
  cacheReadTokens: integer("cache_read_tokens").default(0).notNull(),
  cacheWriteTokens: integer("cache_write_tokens").default(0).notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: uuid("deleted_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const invites = dground.table("invites", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id")
    .notNull()
    .references(() => rooms.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  invitedBy: uuid("invited_by").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const usageDaily = dground.table(
  "usage_daily",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    model: text("model").notNull(),
    tokensInSum: bigint("tokens_in_sum", { mode: "number" })
      .default(0)
      .notNull(),
    tokensOutSum: bigint("tokens_out_sum", { mode: "number" })
      .default(0)
      .notNull(),
    cacheReadSum: bigint("cache_read_sum", { mode: "number" })
      .default(0)
      .notNull(),
    cacheWriteSum: bigint("cache_write_sum", { mode: "number" })
      .default(0)
      .notNull(),
    messageCount: integer("message_count").default(0).notNull(),
    estimatedCostUsd: numeric("estimated_cost_usd", {
      precision: 12,
      scale: 6,
    })
      .default("0")
      .notNull(),
  },
  (t) => ({
    uniqueDayRoomModel: unique().on(t.roomId, t.date, t.model),
  }),
);

export const auditLog = dground.table("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
