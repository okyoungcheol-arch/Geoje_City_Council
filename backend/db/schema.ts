import { pgTable, serial, text, integer, timestamp, jsonb, uniqueIndex, boolean, numeric } from "drizzle-orm/pg-core";

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

// 5-KPI 회의록 전용 지표 체계 per docs/rubric/CLAUDE.md v2.0 (§3/§6). 8축 가중평균 체계를
// 대체 — see docs/superpowers/specs/2026-08-11-gjcl-5kpi-rubric-design.md.
export const statementInsights = pgTable("statement_insights", {
  id: serial("id").primaryKey(),
  statementId: integer("statement_id").notNull().references(() => statements.id).unique(),
  summary: text("summary").notNull(), // Sonnet 5 output
  tags: jsonb("tags").$type<string[]>().notNull(), // Sonnet 5 output
  excludedReason: text("excluded_reason"), // "의사진행 발언" | "의원 아님(집행부/사무국)" | null
  speechType: text("speech_type"), // "five_min" | "budget_review" | "admin_audit" | "ordinance_proposal"; null if excluded
  hasQaStructure: boolean("has_qa_structure").notNull().default(false), // KPI3·4 N/A 판정 근거
  citations: jsonb("citations").$type<{ type: "L" | "S" | "P" | "F"; text: string }[]>(),
  kpiEvidenceDensity: numeric("kpi_evidence_density"), // KPI① 값, null if speechDurationSec unknown
  kpiEvidenceDensityGrade: text("kpi_evidence_density_grade"), // "A"|"B"|"C"|"D"|null
  proposals: jsonb("proposals").$type<{ budget: boolean; timeline: boolean; subject: boolean; method: boolean }[]>(),
  kpiSolutionSpecificity: numeric("kpi_solution_specificity"), // KPI② 값, null if 제안 0건
  qaRounds: jsonb("qa_rounds").$type<{ roundIndex: number; answerGrade: string; bonusTags: string[] }[]>(),
  kpiInterrogationDepth: numeric("kpi_interrogation_depth"), // KPI③ 값, null if no Q&A structure
  kpiReQuestionRate: numeric("kpi_re_question_rate"),
  kpiCommitmentRate: numeric("kpi_commitment_rate"), // KPI④ 값, null if no Q&A structure
  selfRaisedIssues: jsonb("self_raised_issues").$type<{ description: string }[]>(), // KPI⑤ 후보, matchIssues 입력
  topicsToWatch: jsonb("topics_to_watch").$type<string[]>(),
  rationale: text("rationale"),
  rubricVersion: text("rubric_version").notNull().default("v2.0-5kpi"),
  sonnetModel: text("sonnet_model").notNull(),
  opusModel: text("opus_model"), // null unless matchIssues was called this statement
  processedAt: timestamp("processed_at").notNull().defaultNow(),
});

// KPI⑤(이슈지속추적률)는 의원 누적 단위이므로 statementInsights와 별도로 관리한다.
export const issueTickets = pgTable("issue_tickets", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => members.id),
  description: text("description").notNull(),
  registeredStatementId: integer("registered_statement_id").notNull().references(() => statements.id),
  registeredMeetingId: integer("registered_meeting_id").notNull().references(() => meetings.id),
  status: text("status").notNull().default("open"), // "open" | "resolved"
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const issueReviews = pgTable("issue_reviews", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull().references(() => issueTickets.id),
  reviewedStatementId: integer("reviewed_statement_id").notNull().references(() => statements.id),
  reviewedMeetingId: integer("reviewed_meeting_id").notNull().references(() => meetings.id),
  reviewedAt: timestamp("reviewed_at").notNull().defaultNow(),
});
