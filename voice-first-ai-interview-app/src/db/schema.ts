import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  serial,
  boolean,
  customType,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export type UserSettings = {
  defaultDifficulty?: "easy" | "medium" | "hard";
  defaultType?: string;
  recordAudio?: boolean;
  readAloudFallback?: boolean;
  captions?: boolean;
  handsFreeDefault?: boolean;
  voiceName?: string;
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull().default(""),
  passwordHash: text("password_hash"),
  provider: text("provider").notNull().default("password"),
  firebaseUid: text("firebase_uid").unique(),
  settings: jsonb("settings").$type<UserSettings>().notNull().default({}),
  resetToken: text("reset_token"),
  resetTokenExpires: timestamp("reset_token_expires", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const interviewSessions = pgTable(
  "interview_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    interviewType: text("interview_type").notNull(),
    customType: text("custom_type").notNull().default(""),
    difficulty: text("difficulty").notNull(),
    plannedMinutes: integer("planned_minutes").notNull(),
    panelSize: integer("panel_size").notNull().default(1),
    roleTitle: text("role_title").notNull().default(""),
    companyUrl: text("company_url").notNull(),
    companyName: text("company_name").notNull().default(""),
    companyContext: text("company_context").notNull().default(""),
    cvText: text("cv_text").notNull().default(""),
    coverLetterText: text("cover_letter_text").notNull().default(""),
    jdText: text("jd_text").notNull().default(""),
    status: text("status").notNull().default("setup"),
    mode: text("mode").notNull().default("voice"),
    connectionLog: jsonb("connection_log").$type<{ t: number; state: string; note?: string }[]>().notNull().default([]),
    overallScore: integer("overall_score"),
    actualSeconds: integer("actual_seconds"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)]
);

export const transcriptTurns = pgTable(
  "transcript_turns",
  {
    id: serial("id").primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => interviewSessions.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    seq: integer("seq").notNull(),
    speaker: text("speaker").notNull(),
    speakerName: text("speaker_name").notNull().default(""),
    tsStartMs: integer("ts_start_ms").notNull(),
    tsEndMs: integer("ts_end_ms").notNull(),
    text: text("text").notNull(),
    channel: text("channel").notNull().default("voice"),
  },
  (t) => [uniqueIndex("turn_client_uq").on(t.sessionId, t.clientId), index("turn_session_idx").on(t.sessionId)]
);

export const bookmarks = pgTable("bookmarks", {
  id: serial("id").primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => interviewSessions.id, { onDelete: "cascade" }),
  tMs: integer("t_ms").notNull(),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const debriefs = pgTable("debriefs", {
  id: serial("id").primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => interviewSessions.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  json: jsonb("json").notNull(),
  source: text("source").notNull(),
  model: text("model").notNull().default(""),
  partial: boolean("partial").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const uploads = pgTable("uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  data: bytea("data").notNull(),
  extractedText: text("extracted_text").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recordings = pgTable("recordings", {
  id: serial("id").primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => interviewSessions.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  data: bytea("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
