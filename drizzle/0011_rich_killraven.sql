CREATE TABLE `customer_proposals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`proposedName` varchar(512) NOT NULL,
	`notes` text,
	`serviceExternalIds` text NOT NULL,
	`source` varchar(128),
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`proposedBy` varchar(256) NOT NULL,
	`reviewedBy` varchar(256),
	`reviewedAt` timestamp,
	`rejectionReason` text,
	`createdCustomerExternalId` varchar(32),
	`createPlatformCheck` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_proposals_id` PRIMARY KEY(`id`)
);
