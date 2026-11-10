CREATE TABLE `signals` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`source` text NOT NULL,
	`location` text NOT NULL,
	`author` text NOT NULL,
	`subject` text,
	`body` text NOT NULL,
	`line_id` text,
	`purpose_tags` text DEFAULT '[]' NOT NULL,
	`event_id` text,
	`sent_at` text NOT NULL
);
