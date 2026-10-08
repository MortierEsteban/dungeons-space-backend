CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"preference" text DEFAULT 'play' NOT NULL,
	"locale" text DEFAULT 'fr' NOT NULL,
	"home_style" text DEFAULT 'immersive' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"synopsis" text DEFAULT '' NOT NULL,
	"tone" text DEFAULT 'Héroïque' NOT NULL,
	"ruleset_id" text NOT NULL,
	"cover_url" text,
	"join_code" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"recruiting" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"settings" jsonb NOT NULL,
	"next_session_at" timestamp with time zone,
	"event_seq" bigint DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "game_sessions_campaign_number" UNIQUE("campaign_id","number")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"email" text NOT NULL,
	"invited_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_campaign_email" UNIQUE("campaign_id","email")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"campaign_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_campaign_id_user_id_pk" PRIMARY KEY("campaign_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "event_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"from_event_id" uuid NOT NULL,
	"to_event_id" uuid NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_links_pair" UNIQUE("from_event_id","to_event_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"seq" bigint NOT NULL,
	"session_no" integer,
	"correlation_id" uuid,
	"type" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"importance" integer DEFAULT 1 NOT NULL,
	"visibility" text NOT NULL,
	"visible_to" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"targets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"places" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"in_game_date" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"player_view" jsonb,
	"source" text NOT NULL,
	"author_id" uuid,
	"idempotency_key" text,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"ruleset_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_campaign_seq" UNIQUE("campaign_id","seq"),
	CONSTRAINT "events_campaign_idempotency" UNIQUE("campaign_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"owner_id" uuid,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"ruleset_id" text NOT NULL,
	"sheet" jsonb,
	"npc" jsonb,
	"visible_to_players" boolean DEFAULT true NOT NULL,
	"portrait_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"session_no" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "encounters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'setup' NOT NULL,
	"round" integer DEFAULT 0 NOT NULL,
	"combatant_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"from_node_id" uuid NOT NULL,
	"to_node_id" uuid NOT NULL,
	"type" text NOT NULL,
	"valence" integer DEFAULT 0 NOT NULL,
	"intensity" integer DEFAULT 1 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"player_visible" boolean DEFAULT false NOT NULL,
	"source_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"color" text,
	"player_visible" boolean DEFAULT false NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"position" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"campaign_id" uuid,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_links" ADD CONSTRAINT "event_links_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_links" ADD CONSTRAINT "event_links_from_event_id_events_id_fk" FOREIGN KEY ("from_event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_links" ADD CONSTRAINT "event_links_to_event_id_events_id_fk" FOREIGN KEY ("to_event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_links" ADD CONSTRAINT "event_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_from_node_id_nodes_id_fk" FOREIGN KEY ("from_node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_to_node_id_nodes_id_fk" FOREIGN KEY ("to_node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creations" ADD CONSTRAINT "creations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creations" ADD CONSTRAINT "creations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_correlation_idx" ON "events" USING btree ("correlation_id","seq");--> statement-breakpoint
CREATE INDEX "events_campaign_category_idx" ON "events" USING btree ("campaign_id","category","seq");--> statement-breakpoint
CREATE INDEX "characters_campaign_idx" ON "characters" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "notes_character_idx" ON "notes" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "links_campaign_idx" ON "links" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "nodes_campaign_idx" ON "nodes" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "nodes_ref_idx" ON "nodes" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE INDEX "creations_owner_idx" ON "creations" USING btree ("owner_id");