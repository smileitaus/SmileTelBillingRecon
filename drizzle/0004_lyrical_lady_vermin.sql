ALTER TABLE `services` ADD `provider` varchar(64) DEFAULT 'Unknown';--> statement-breakpoint
ALTER TABLE `services` ADD `carbonServiceId` varchar(64) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `carbonServiceType` varchar(64) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `carbonStatus` varchar(64) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `avcId` varchar(128) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `technology` varchar(64) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `speedTier` varchar(128) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `nbnSla` varchar(128) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `supportPack` varchar(64) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `poiName` varchar(128) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `zone` varchar(64) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `openDate` varchar(64) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `carbonMonthlyCost` decimal(10,2);--> statement-breakpoint
ALTER TABLE `services` ADD `carbonPlanName` varchar(256) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `carbonAlias` varchar(512) DEFAULT '';