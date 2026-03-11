CREATE TABLE `billing_platform_checks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reviewItemId` int,
	`targetType` varchar(16) NOT NULL,
	`targetId` varchar(64) NOT NULL,
	`targetName` varchar(512) DEFAULT '',
	`platform` varchar(64) NOT NULL,
	`issueType` varchar(64) NOT NULL,
	`issueDescription` text,
	`customerName` varchar(512) DEFAULT '',
	`customerExternalId` varchar(32) DEFAULT '',
	`monthlyAmount` decimal(10,2) DEFAULT '0.00',
	`priority` varchar(16) NOT NULL DEFAULT 'medium',
	`status` varchar(16) NOT NULL DEFAULT 'open',
	`actionedBy` varchar(256),
	`actionedNote` text,
	`actionedAt` timestamp,
	`createdBy` varchar(256) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `billing_platform_checks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `service_edit_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`serviceExternalId` varchar(32) NOT NULL,
	`editedBy` varchar(256) NOT NULL,
	`changes` text NOT NULL,
	`reason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `service_edit_history_id` PRIMARY KEY(`id`)
);
