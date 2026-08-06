CREATE TABLE "agenda_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"meeting_id" integer NOT NULL,
	"title" text NOT NULL,
	"order_in_meeting" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_meeting_id" text NOT NULL,
	"generation" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"session_round" text,
	"session_no" text,
	"meeting_date" text,
	"source_url" text NOT NULL,
	"scraped_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"generation" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statement_insights" (
	"id" serial PRIMARY KEY NOT NULL,
	"statement_id" integer NOT NULL,
	"summary" text NOT NULL,
	"tags" jsonb NOT NULL,
	"learning_level" integer NOT NULL,
	"question_score" integer NOT NULL,
	"idea_score" integer NOT NULL,
	"feasibility_score" integer NOT NULL,
	"geoje_impact_score" integer NOT NULL,
	"rationale" text NOT NULL,
	"sonnet_model" text NOT NULL,
	"opus_model" text NOT NULL,
	"processed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "statement_insights_statement_id_unique" UNIQUE("statement_id")
);
--> statement-breakpoint
CREATE TABLE "statements" (
	"id" serial PRIMARY KEY NOT NULL,
	"meeting_id" integer NOT NULL,
	"agenda_item_id" integer,
	"member_id" integer NOT NULL,
	"raw_text" text NOT NULL,
	"order_in_meeting" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agenda_items" ADD CONSTRAINT "agenda_items_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_insights" ADD CONSTRAINT "statement_insights_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_agenda_item_id_agenda_items_id_fk" FOREIGN KEY ("agenda_item_id") REFERENCES "public"."agenda_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meetings_source_meeting_id_idx" ON "meetings" USING btree ("source_meeting_id");--> statement-breakpoint
CREATE UNIQUE INDEX "members_name_generation_idx" ON "members" USING btree ("name","generation");--> statement-breakpoint
CREATE UNIQUE INDEX "statements_meeting_member_order_idx" ON "statements" USING btree ("meeting_id","member_id","order_in_meeting");