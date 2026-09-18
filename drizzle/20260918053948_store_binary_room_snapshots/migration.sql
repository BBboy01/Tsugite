ALTER TABLE `rooms` ADD `snapshot_blob` blob;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_rooms` (
	`room_id` text PRIMARY KEY,
	`snapshot` text,
	`snapshot_blob` blob,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_rooms`(`room_id`, `snapshot`, `created_at`, `updated_at`) SELECT `room_id`, `snapshot`, `created_at`, `updated_at` FROM `rooms`;--> statement-breakpoint
DROP TABLE `rooms`;--> statement-breakpoint
ALTER TABLE `__new_rooms` RENAME TO `rooms`;--> statement-breakpoint
PRAGMA foreign_keys=ON;