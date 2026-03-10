ALTER TABLE `services` ADD `imei` varchar(64) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `deviceName` varchar(256) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `deviceType` varchar(128) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `deviceCategory` varchar(128) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `imsi` varchar(64) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `userName` varchar(256) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `serviceActivationDate` varchar(64) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `serviceEndDate` varchar(64) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `flexiplanCode` varchar(128) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `flexiplanName` varchar(256) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `contractEndDate` varchar(64) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `proposedPlan` varchar(256) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `proposedCost` varchar(32) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `proposedDataGb` varchar(32) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `noDataUse` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `services` ADD `blitzCategory` varchar(128) DEFAULT '';