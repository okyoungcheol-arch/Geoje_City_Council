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

export const statementInsights = pgTable("statement_insights", {
  id: serial("id").primaryKey(),
  statementId: integer("statement_id").notNull().references(() => statements.id).unique(),
  summary: text("summary").notNull(), // Sonnet 5 output
  tags: jsonb("tags").$type<string[]>().notNull(), // Sonnet 5 output
  learningLevel: integer("learning_level").notNull(), // 1-5, Opus 5
  questionScore: integer("question_score").notNull(), // 1-5, Opus 5
  ideaScore: integer("idea_score").notNull(), // 1-5, Opus 5
  feasibilityScore: integer("feasibility_score").notNull(), // 1-5, Opus 5
  geojeImpactScore: integer("geoje_impact_score").notNull(), // 1-5, Opus 5
  rationale: text("rationale").notNull(), // Opus 5's short justification for the 5 scores
  sonnetModel: text("sonnet_model").notNull(),
  opusModel: text("opus_model").notNull(),
  processedAt: timestamp("processed_at").notNull().defaultNow(),
});
