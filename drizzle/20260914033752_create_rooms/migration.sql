CREATE TABLE IF NOT EXISTS `rooms` (
	`room_id` text PRIMARY KEY,
	`snapshot` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
