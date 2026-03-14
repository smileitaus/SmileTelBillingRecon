CREATE TABLE `supplier_enterprise_map` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierName` varchar(128) NOT NULL,
	`enterpriseName` varchar(512) NOT NULL,
	`customerId` int NOT NULL,
	`customerExternalId` varchar(32) NOT NULL,
	`customerName` varchar(512) NOT NULL,
	`confirmedBy` varchar(64) NOT NULL DEFAULT 'auto',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supplier_enterprise_map_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supplier_product_map` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierName` varchar(128) NOT NULL,
	`productName` varchar(512) NOT NULL,
	`productType` varchar(64) NOT NULL DEFAULT '',
	`internalServiceType` varchar(64) NOT NULL DEFAULT 'Voice',
	`billingLabel` varchar(256) NOT NULL DEFAULT '',
	`notes` text,
	`confirmedBy` varchar(64) NOT NULL DEFAULT 'auto',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supplier_product_map_id` PRIMARY KEY(`id`)
);
