CREATE TABLE `service_billing_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`billingItemExternalId` varchar(32) NOT NULL,
	`serviceExternalId` varchar(32) NOT NULL,
	`customerExternalId` varchar(32) NOT NULL,
	`assignedBy` varchar(256) NOT NULL,
	`assignmentMethod` varchar(32) NOT NULL DEFAULT 'manual',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `service_billing_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `unbillable_services` (
	`id` int AUTO_INCREMENT NOT NULL,
	`serviceExternalId` varchar(32) NOT NULL,
	`customerExternalId` varchar(32) NOT NULL,
	`reason` varchar(64) NOT NULL,
	`notes` text,
	`markedBy` varchar(256) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `unbillable_services_id` PRIMARY KEY(`id`),
	CONSTRAINT `unbillable_services_serviceExternalId_unique` UNIQUE(`serviceExternalId`)
);
