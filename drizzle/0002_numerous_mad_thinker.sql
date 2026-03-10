ALTER TABLE `services` ADD `simSerialNumber` varchar(64) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `hardwareType` varchar(256) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `macAddress` varchar(64) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `modemSerialNumber` varchar(128) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `wifiPassword` varchar(128) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `lastWanIp` varchar(64) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `simOwner` varchar(256) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `dataPlanGb` varchar(32) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `purchaseDate` varchar(64) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `dataSource` varchar(256) DEFAULT '';