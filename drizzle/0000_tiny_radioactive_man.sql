CREATE TABLE `customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`externalId` varchar(32) NOT NULL,
	`name` varchar(512) NOT NULL,
	`billingPlatforms` text,
	`serviceCount` int NOT NULL DEFAULT 0,
	`monthlyCost` decimal(10,2) NOT NULL DEFAULT '0.00',
	`unmatchedCount` int NOT NULL DEFAULT 0,
	`matchedCount` int NOT NULL DEFAULT 0,
	`status` varchar(32) NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customers_id` PRIMARY KEY(`id`),
	CONSTRAINT `customers_externalId_unique` UNIQUE(`externalId`)
);
--> statement-breakpoint
CREATE TABLE `locations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`externalId` varchar(32) NOT NULL,
	`address` varchar(1024) NOT NULL,
	`customerExternalId` varchar(32) NOT NULL,
	`customerName` varchar(512) NOT NULL,
	`serviceCount` int NOT NULL DEFAULT 0,
	`serviceIds` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `locations_id` PRIMARY KEY(`id`),
	CONSTRAINT `locations_externalId_unique` UNIQUE(`externalId`)
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` int AUTO_INCREMENT NOT NULL,
	`externalId` varchar(32) NOT NULL,
	`serviceId` varchar(256) DEFAULT '',
	`serviceType` varchar(64) NOT NULL,
	`serviceTypeDetail` varchar(256) DEFAULT '',
	`planName` varchar(512) DEFAULT '',
	`status` varchar(32) NOT NULL DEFAULT 'active',
	`locationExternalId` varchar(32) DEFAULT '',
	`locationAddress` varchar(1024) DEFAULT '',
	`supplierAccount` varchar(64) DEFAULT '',
	`supplierName` varchar(128) DEFAULT 'Telstra',
	`phoneNumber` varchar(64) DEFAULT '',
	`email` varchar(320) DEFAULT '',
	`connectionId` varchar(128) DEFAULT '',
	`locId` varchar(128) DEFAULT '',
	`ipAddress` varchar(64) DEFAULT '',
	`customerName` varchar(512) DEFAULT '',
	`customerExternalId` varchar(32) DEFAULT '',
	`monthlyCost` decimal(10,2) NOT NULL DEFAULT '0.00',
	`billingHistory` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `services_id` PRIMARY KEY(`id`),
	CONSTRAINT `services_externalId_unique` UNIQUE(`externalId`)
);
--> statement-breakpoint
CREATE TABLE `supplier_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountNumber` varchar(64) NOT NULL,
	`supplierName` varchar(128) NOT NULL DEFAULT 'Telstra',
	`serviceCount` int NOT NULL DEFAULT 0,
	`monthlyCost` decimal(10,2) NOT NULL DEFAULT '0.00',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supplier_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
