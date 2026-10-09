CREATE TABLE "recording_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recording_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"from_seq" integer NOT NULL,
	"to_seq" integer NOT NULL,
	"status" text NOT NULL,
	"model" text NOT NULL,
	"event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "session_recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"session_no" integer NOT NULL,
	"status" text DEFAULT 'live' NOT NULL,
	"device_id" text NOT NULL,
	"started_by" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"segment_count" integer DEFAULT 0 NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"analyzed_seq" integer DEFAULT 0 NOT NULL,
	"audio_chunks" integer DEFAULT 0 NOT NULL,
	"audio_mime" text,
	"audio_bytes" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recording_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"session_no" integer NOT NULL,
	"seq" integer NOT NULL,
	"client_seq" integer NOT NULL,
	"speaker" text,
	"text" text NOT NULL,
	"words" integer DEFAULT 0 NOT NULL,
	"offset_ms" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"spoken_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcript_segments_recording_seq" UNIQUE("recording_id","seq"),
	CONSTRAINT "transcript_segments_recording_client_seq" UNIQUE("recording_id","client_seq")
);
--> statement-breakpoint
ALTER TABLE "recording_analyses" ADD CONSTRAINT "recording_analyses_recording_id_session_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."session_recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recording_analyses" ADD CONSTRAINT "recording_analyses_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_recordings" ADD CONSTRAINT "session_recordings_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_recordings" ADD CONSTRAINT "session_recordings_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_recording_id_session_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."session_recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recording_analyses_recording_idx" ON "recording_analyses" USING btree ("recording_id","created_at");--> statement-breakpoint
CREATE INDEX "session_recordings_campaign_session_idx" ON "session_recordings" USING btree ("campaign_id","session_no");--> statement-breakpoint
CREATE INDEX "transcript_segments_session_idx" ON "transcript_segments" USING btree ("campaign_id","session_no","spoken_at");