CREATE TABLE `service_billing_match_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`serviceExternalId` varchar(32) NOT NULL,
	`serviceType` varchar(64) NOT NULL,
	`planName` varchar(512) DEFAULT '',
	`customerExternalId` varchar(32) NOT NULL,
	`customerName` varchar(512) NOT NULL,
	`resolution` varchar(32) NOT NULL,
	`billingItemId` varchar(32) DEFAULT '',
	`billingPlatform` varchar(64) DEFAULT '',
	`notes` text,
	`resolvedBy` varchar(256) NOT NULL,
	`resolvedAt` timestamp NOT NULL DEFAULT (now()),
	`matchKey` varchar(512) DEFAULT '',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `service_billing_match_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `customers` ADD `unmatchedBillingCount` int DEFAULT 0 NOT NULL;