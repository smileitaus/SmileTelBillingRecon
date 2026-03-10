ALTER TABLE `customers` ADD `businessName` varchar(512) DEFAULT '';--> statement-breakpoint
ALTER TABLE `customers` ADD `contactName` varchar(256) DEFAULT '';--> statement-breakpoint
ALTER TABLE `customers` ADD `contactEmail` varchar(320) DEFAULT '';--> statement-breakpoint
ALTER TABLE `customers` ADD `contactPhone` varchar(64) DEFAULT '';--> statement-breakpoint
ALTER TABLE `customers` ADD `ownershipType` varchar(16) DEFAULT '';--> statement-breakpoint
ALTER TABLE `customers` ADD `siteAddress` varchar(1024) DEFAULT '';--> statement-breakpoint
ALTER TABLE `customers` ADD `notes` text;