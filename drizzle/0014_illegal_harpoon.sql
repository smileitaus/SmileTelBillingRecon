CREATE TABLE `customer_usage_summaries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uploadId` int,
	`customerExternalId` varchar(32) NOT NULL,
	`customerName` varchar(512) NOT NULL,
	`usageMonth` varchar(16) NOT NULL,
	`usageType` varchar(64) NOT NULL DEFAULT 'call-usage',
	`supplier` varchar(128) NOT NULL,
	`totalExGst` decimal(10,2) NOT NULL DEFAULT '0.00',
	`totalIncGst` decimal(10,2) NOT NULL DEFAULT '0.00',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_usage_summaries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supplier_workbook_line_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uploadId` int NOT NULL,
	`enterpriseName` varchar(512) NOT NULL,
	`productName` varchar(512) NOT NULL,
	`productType` varchar(64) DEFAULT '',
	`serviceRefId` varchar(256) DEFAULT '',
	`amountExGst` decimal(10,2) NOT NULL DEFAULT '0.00',
	`amountIncGst` decimal(10,2) NOT NULL DEFAULT '0.00',
	`matchStatus` varchar(32) NOT NULL DEFAULT 'unmatched',
	`matchedCustomerExternalId` varchar(32) DEFAULT '',
	`matchedCustomerName` varchar(512) DEFAULT '',
	`matchedServiceExternalId` varchar(32) DEFAULT '',
	`matchConfidence` decimal(4,2) DEFAULT '0.00',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supplier_workbook_line_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supplier_workbook_uploads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplier` varchar(128) NOT NULL,
	`workbookName` varchar(256) NOT NULL,
	`billingMonth` varchar(16) NOT NULL,
	`invoiceReference` varchar(128) DEFAULT '',
	`totalExGst` decimal(10,2) NOT NULL DEFAULT '0.00',
	`totalIncGst` decimal(10,2) NOT NULL DEFAULT '0.00',
	`lineItemCount` int NOT NULL DEFAULT 0,
	`matchedCount` int NOT NULL DEFAULT 0,
	`unmatchedCount` int NOT NULL DEFAULT 0,
	`importedBy` varchar(256) NOT NULL,
	`importedAt` timestamp NOT NULL DEFAULT (now()),
	`status` varchar(32) NOT NULL DEFAULT 'complete',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supplier_workbook_uploads_id` PRIMARY KEY(`id`)
);
