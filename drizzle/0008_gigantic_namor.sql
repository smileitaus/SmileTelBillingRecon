CREATE TABLE `review_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(16) NOT NULL,
	`targetType` varchar(16) NOT NULL,
	`targetId` varchar(64) NOT NULL,
	`targetName` varchar(512) DEFAULT '',
	`issueType` varchar(64) DEFAULT '',
	`note` text NOT NULL,
	`submittedBy` varchar(256) NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'open',
	`resolvedNote` text,
	`resolvedBy` varchar(256),
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `review_items_id` PRIMARY KEY(`id`)
);
