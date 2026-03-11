CREATE TABLE `billing_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`externalId` varchar(32) NOT NULL,
	`invoiceDate` varchar(32) NOT NULL,
	`invoiceNumber` varchar(64) NOT NULL,
	`contactName` varchar(512) NOT NULL,
	`description` text NOT NULL,
	`quantity` decimal(10,2) NOT NULL DEFAULT '1.00',
	`unitAmount` decimal(10,2) NOT NULL DEFAULT '0.00',
	`discount` decimal(10,2) DEFAULT '0.00',
	`lineAmount` decimal(10,2) NOT NULL DEFAULT '0.00',
	`taxAmount` decimal(10,2) DEFAULT '0.00',
	`accountCode` varchar(16),
	`category` varchar(64) NOT NULL DEFAULT 'recurring',
	`customerExternalId` varchar(32) DEFAULT '',
	`serviceExternalId` varchar(32) DEFAULT '',
	`matchStatus` varchar(32) NOT NULL DEFAULT 'unmatched',
	`matchConfidence` varchar(16) DEFAULT '',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `billing_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `billing_items_externalId_unique` UNIQUE(`externalId`)
);
--> statement-breakpoint
ALTER TABLE `customers` ADD `xeroContactName` varchar(512) DEFAULT '';--> statement-breakpoint
ALTER TABLE `customers` ADD `xeroAccountNumber` varchar(64) DEFAULT '';--> statement-breakpoint
ALTER TABLE `customers` ADD `monthlyRevenue` decimal(10,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `marginPercent` decimal(5,2);--> statement-breakpoint
ALTER TABLE `services` ADD `monthlyRevenue` decimal(10,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `services` ADD `marginPercent` decimal(5,2);--> statement-breakpoint
ALTER TABLE `services` ADD `billingItemId` varchar(32) DEFAULT '';