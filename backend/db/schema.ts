import { pgTable, serial, text, integer, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

export const meetings = pgTable("meetings", {
  id: serial("id").primaryKey(),
  sourceMeetingId: text("source_meeting_id").notNull(), // e.g. "264-plenary-1" derived from site params
  generation: text("generation").notNull(), // "제10대"
  category: text("category").notNull(), // "본회의" | "시정질문" | "의회운영위원회" | ...
  title: text("title").notNull(), // "제264회 임시회 제1차 본회의"
  sessionRound: text("session_round"), // "264회"
  sessionNo: text("session_no"), // "제1차"
  meetingDate: text("meeting_date"), // ISO date string, nullable if unknown
  sourceUrl: text("source_url").notNull(),
  scrapedAt: timestamp("scraped_at").notNull().defaultNow(),
}, (t) => ({
  uniqSource: uniqueIndex("meetings_source_meeting_id_idx").on(t.sourceMeetingId),
}));

export const members = pgTable("members", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  generation: text("generation").notNull(),
}, (t) => ({
  uniqNameGen: uniqueIndex("members_name_generation_idx").on(t.name, t.generation),
}));

export const agendaItems = pgTable("agenda_items", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull().references(() => meetings.id),
  title: text("title").notNull(),
  orderInMeeting: integer("order_in_meeting").notNull(),
}, (t) => ({
  uniqMeetingTitle: uniqueIndex("agenda_items_meeting_id_title_idx").on(t.meetingId, t.title),
}));

export const statements = pgTable("statements", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull().references(() => meetings.id),
  agendaItemId: integer("agenda_item_id").references(() => agendaItems.id),
  memberId: integer("member_id").notNull().references(() => members.id),
  rawText: text("raw_text").notNull(),
  orderInMeeting: integer("order_in_meeting").notNull(),
}, (t) => ({
  uniqStatement: uniqueIndex("statements_meeting_member_order_idx").on(t.meetingId, t.memberId, t.orderInMeeting),
}));

// 8-axis weighted rubric per root CLAUDE.md v1.1 (§3/§4/§6.1). Replaces the earlier
// 5-axis unweighted system entirely — see docs/superpowers/specs/2026-08-07-gjcl-member-
// evaluation-rubric-design.md for the migration rationale.
export const statementInsights = pgTable("statement_insights", {
  id: serial("id").primaryKey(),
  statementId: integer("statement_id").notNull().references(() => statements.id).unique(),
  summary: text("summary").notNull(), // Sonnet 5 output
  tags: jsonb("tags").$type<string[]>().notNull(), // Sonnet 5 output
  // Sonnet 5 classifies two exclusion cases before Opus 5 is ever called (CLAUDE.md §1.2):
  // procedural (의사진행) turns, and turns from speakers who aren't council members at all
  // (집행부/사무국 staff — detected via lib/members/isNonMemberSpeaker.ts on the raw scraped
  // name, not by Sonnet). Excluded turns get no Opus 5 score, so all score/rubric columns
  // below are nullable.
  excludedReason: text("excluded_reason"), // "의사진행 발언" | "의원 아님(집행부/사무국)" | null
  speechType: text("speech_type"), // "five_min" | "budget_review" | "admin_audit" | "ordinance_proposal"; null if excluded
  creativity: integer("creativity"), // ① 1-5, Opus 5
  feasibility: integer("feasibility"), // ② 1-5, Opus 5
  evidenceLegal: integer("evidence_legal"), // ③ 1-5, Opus 5
  persistence: integer("persistence"), // ④ 1-5, Opus 5; null when persistenceStatus is pending_future_evaluation
  persistenceStatus: text("persistence_status"), // "scored" | "pending_future_evaluation"
  oversight: integer("oversight"), // ⑤ 1-5, Opus 5
  citizenBenefit: integer("citizen_benefit"), // ⑥ 1-5, Opus 5
  futureStrategy: integer("future_strategy"), // ⑦ 1-5, Opus 5
  cityDevelopment: integer("city_development"), // ⑧ 1-5, Opus 5
  weightedScore: text("weighted_score"), // §4 formula result, stored as text to avoid float drift; null if excluded
  topicsToWatch: jsonb("topics_to_watch").$type<string[]>(), // "향후 감시할 주제" (표1 column), Opus 5 output
  rationale: text("rationale"), // Opus 5's short justification; null if excludedReason is set
  sonnetModel: text("sonnet_model").notNull(),
  opusModel: text("opus_model"), // null if excludedReason is set (Opus 5 never called)
  processedAt: timestamp("processed_at").notNull().defaultNow(),
});
