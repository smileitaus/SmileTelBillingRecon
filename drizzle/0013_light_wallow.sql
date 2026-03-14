CREATE TABLE `service_cost_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`serviceExternalId` varchar(32) NOT NULL,
	`monthlyCost` decimal(10,2) NOT NULL,
	`costSource` varchar(32) NOT NULL,
	`snapshotReason` varchar(64) NOT NULL,
	`snapshotBy` varchar(256) NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `service_cost_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `services` ADD `costSource` varchar(32) DEFAULT 'unknown';