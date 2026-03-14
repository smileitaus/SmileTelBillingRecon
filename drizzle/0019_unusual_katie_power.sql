CREATE TABLE `escalated_services` (
	`id` int AUTO_INCREMENT NOT NULL,
	`serviceExternalId` varchar(32) NOT NULL,
	`customerExternalId` varchar(32) NOT NULL,
	`reason` varchar(256) NOT NULL DEFAULT 'No matching Xero billing item found',
	`notes` text,
	`escalatedBy` varchar(256) NOT NULL,
	`resolvedAt` timestamp,
	`resolvedBy` varchar(256),
	`resolutionNotes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `escalated_services_id` PRIMARY KEY(`id`),
	CONSTRAINT `escalated_services_serviceExternalId_unique` UNIQUE(`serviceExternalId`)
);
