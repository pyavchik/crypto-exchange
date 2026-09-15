CREATE TABLE `upstream_checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`service` text NOT NULL,
	`status` text NOT NULL,
	`http_status` integer,
	`latency_ms` integer NOT NULL,
	`checked_at` text NOT NULL,
	`request_id` text
);
--> statement-breakpoint
CREATE INDEX `upstream_checks_service_checked_at_idx` ON `upstream_checks` (`service`,`checked_at`);