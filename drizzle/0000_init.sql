CREATE TABLE `approvals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` integer NOT NULL,
	`member_id` text NOT NULL,
	`decision` text NOT NULL,
	`amount_cents` integer,
	`note` text,
	`precedent_id` text,
	`criterion_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` integer,
	`trace_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`site` text,
	`model` text,
	`mode` text,
	`latency_ms` integer,
	`data_json` text,
	`screenshot` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_request_idx` ON `audit_log` (`request_id`);--> statement-breakpoint
CREATE TABLE `budget_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`allocated_cents` integer NOT NULL,
	`per_head_cap_cents` integer,
	`max_per_purchase_cents` integer,
	`required_fields` text DEFAULT '[]' NOT NULL,
	`allowed_categories` text DEFAULT '[]' NOT NULL,
	`source_row` integer NOT NULL,
	`notes` text,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `card_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_id` integer NOT NULL,
	`request_id` integer NOT NULL,
	`external_transaction_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`merchant_name` text NOT NULL,
	`merchant_category` text NOT NULL,
	`settled_at` text NOT NULL,
	`resolution` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_txn_external_uq` ON `card_transactions` (`external_transaction_id`);--> statement-breakpoint
CREATE TABLE `cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` integer NOT NULL,
	`issuer` text NOT NULL,
	`external_card_id` text NOT NULL,
	`last4` text NOT NULL,
	`limit_cents` integer NOT NULL,
	`allowed_categories` text NOT NULL,
	`expires_at` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cards_external_uq` ON `cards` (`external_card_id`);--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pane` text NOT NULL,
	`author` text NOT NULL,
	`member_id` text,
	`request_id` integer,
	`body` text NOT NULL,
	`attachment_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`date` text NOT NULL,
	`rsvp_count` integer NOT NULL,
	`is_recruiting` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`line_id` text NOT NULL,
	`request_id` integer,
	`kind` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`funding_source` text NOT NULL,
	`memo` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`line_id`) REFERENCES `budget_lines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ledger_line_idx` ON `ledger_entries` (`line_id`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`student_id` text NOT NULL,
	`role` text NOT NULL,
	`title` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `mock_issuer_cards` (
	`external_card_id` text PRIMARY KEY NOT NULL,
	`last4` text NOT NULL,
	`holder_name` text NOT NULL,
	`limit_cents` integer NOT NULL,
	`spent_cents` integer DEFAULT 0 NOT NULL,
	`allowed_categories` text NOT NULL,
	`expires_at` text NOT NULL,
	`status` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mock_portal_submissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`confirmation_id` text NOT NULL,
	`external_ref` text NOT NULL,
	`form_version` text NOT NULL,
	`fields_json` text NOT NULL,
	`receipt_file` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mock_portal_ext_ref_uq` ON `mock_portal_submissions` (`external_ref`);--> statement-breakpoint
CREATE TABLE `org_criteria` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`text` text NOT NULL,
	`line_id` text,
	`purpose_tag` text,
	`param_cents` integer,
	`param_kind` text,
	`source` text NOT NULL,
	`last_confirmed_at` text NOT NULL,
	`created_from_request_id` integer
);
--> statement-breakpoint
CREATE TABLE `org_hard_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`kind` text NOT NULL,
	`description` text NOT NULL,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orgs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`asuc_account` text NOT NULL,
	`semester` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `portal_filings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` integer NOT NULL,
	`form_type` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`payload_json` text NOT NULL,
	`plan_json` text,
	`confirmation_id` text,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`started_at` text,
	`finished_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_filings_idem_uq` ON `portal_filings` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `precedents` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`line_id` text NOT NULL,
	`purpose_tag` text NOT NULL,
	`description` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`attendee_count` integer,
	`outcome` text NOT NULL,
	`approved_cents` integer,
	`treasurer_note` text,
	`decided_at` text NOT NULL,
	`semester` text NOT NULL,
	`created_from_request_id` integer
);
--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` integer NOT NULL,
	`sha256` text NOT NULL,
	`file_path` text NOT NULL,
	`mime_type` text NOT NULL,
	`extraction_json` text,
	`total_cents` integer,
	`flags_json` text DEFAULT '[]' NOT NULL,
	`outcome` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_sha_uq` ON `receipts` (`sha256`);--> statement-breakpoint
CREATE TABLE `recommendations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` integer NOT NULL,
	`verdict` text NOT NULL,
	`reasons_json` text NOT NULL,
	`dropped_json` text DEFAULT '[]' NOT NULL,
	`stats_json` text DEFAULT '[]' NOT NULL,
	`suggested_amount_cents` integer,
	`model` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`short_id` text NOT NULL,
	`org_id` text NOT NULL,
	`officer_id` text NOT NULL,
	`status` text NOT NULL,
	`funding_source` text NOT NULL,
	`message` text NOT NULL,
	`message_slug` text NOT NULL,
	`amount_cents` integer,
	`approved_amount_cents` integer,
	`line_id` text,
	`event_id` text,
	`attendee_count` integer,
	`purpose` text,
	`purpose_tag` text,
	`vendor_hint` text,
	`project_name` text,
	`extraction_json` text,
	`status_reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `requests_short_id_uq` ON `requests` (`short_id`);--> statement-breakpoint
CREATE TABLE `rule_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` integer NOT NULL,
	`tier` text NOT NULL,
	`rule_id` text NOT NULL,
	`outcome` text NOT NULL,
	`message` text NOT NULL,
	`suggestion` text,
	`citation` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `school_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`quote` text NOT NULL,
	`source` text NOT NULL
);
