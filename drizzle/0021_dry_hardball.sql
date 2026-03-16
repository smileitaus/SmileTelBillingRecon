CREATE TABLE `supplier_invoice_uploads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplier` varchar(128) NOT NULL,
	`invoiceNumber` varchar(128) NOT NULL,
	`accountNumber` varchar(64) DEFAULT '',
	`billingPeriod` varchar(64) DEFAULT '',
	`issueDate` varchar(32) DEFAULT '',
	`billingMonth` varchar(16) NOT NULL,
	`totalExGst` decimal(10,2) NOT NULL DEFAULT '0.00',
	`totalIncGst` decimal(10,2) NOT NULL DEFAULT '0.00',
	`serviceCount` int NOT NULL DEFAULT 0,
	`matchedCount` int NOT NULL DEFAULT 0,
	`unmatchedCount` int NOT NULL DEFAULT 0,
	`autoMatchedCount` int NOT NULL DEFAULT 0,
	`newMappingsCreated` int NOT NULL DEFAULT 0,
	`importedBy` varchar(256) NOT NULL,
	`importedAt` timestamp NOT NULL DEFAULT (now()),
	`status` varchar(32) NOT NULL DEFAULT 'complete',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supplier_invoice_uploads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supplier_registry` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`displayName` varchar(256) NOT NULL,
	`category` varchar(64) NOT NULL DEFAULT 'Telecom',
	`rank` int NOT NULL DEFAULT 99,
	`logoUrl` varchar(512) DEFAULT '',
	`abn` varchar(32) DEFAULT '',
	`supportPhone` varchar(64) DEFAULT '',
	`supportEmail` varchar(320) DEFAULT '',
	`uploadFormats` varchar(256) DEFAULT '',
	`uploadInstructions` text,
	`isActive` int NOT NULL DEFAULT 1,
	`totalServices` int NOT NULL DEFAULT 0,
	`totalMonthlyCost` decimal(12,2) NOT NULL DEFAULT '0.00',
	`lastInvoiceDate` varchar(32) DEFAULT '',
	`lastInvoiceNumber` varchar(128) DEFAULT '',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supplier_registry_id` PRIMARY KEY(`id`),
	CONSTRAINT `supplier_registry_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `supplier_service_map` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierName` varchar(128) NOT NULL,
	`matchKeyType` varchar(32) NOT NULL,
	`matchKeyValue` varchar(512) NOT NULL,
	`productType` varchar(128) DEFAULT '',
	`description` text,
	`customerExternalId` varchar(32) NOT NULL,
	`customerName` varchar(512) NOT NULL,
	`serviceExternalId` varchar(32) DEFAULT '',
	`confirmedBy` varchar(64) NOT NULL DEFAULT 'manual',
	`confidence` decimal(4,2) NOT NULL DEFAULT '1.00',
	`lastUsedAt` timestamp,
	`useCount` int NOT NULL DEFAULT 0,
	`isActive` int NOT NULL DEFAULT 1,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supplier_service_map_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_supplier_match_key` UNIQUE(`supplierName`,`matchKeyType`,`matchKeyValue`)
);
--> statement-breakpoint
ALTER TABLE `services` ADD `aaptServiceId` varchar(64) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `aaptProductType` varchar(128) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `aaptProductCategory` varchar(64) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `aaptYourId` varchar(256) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `aaptAccessId` varchar(128) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `aaptSpeedMbps` int;--> statement-breakpoint
ALTER TABLE `services` ADD `aaptContractMonths` int;--> statement-breakpoint
ALTER TABLE `services` ADD `aaptAccountNumber` varchar(64) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `aaptInvoiceNumber` varchar(64) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `aaptBillingPeriod` varchar(64) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `aaptImportDate` varchar(32) DEFAULT '';