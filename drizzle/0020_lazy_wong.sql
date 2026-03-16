ALTER TABLE `services` ADD `blitzImportDate` varchar(32) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `blitzReportName` varchar(128) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `blitzAccountNumber` varchar(64) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `blitzNoUse3m` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `services` ADD `blitzNoUse6m` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `services` ADD `blitzNoNetActivity6m` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `services` ADD `blitzLastUsedDate` varchar(64) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `blitzPostcode` varchar(16) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `blitzDeviceAgeMths` int;--> statement-breakpoint
ALTER TABLE `services` ADD `blitzMroContract` varchar(128) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `blitzMroEndDate` varchar(64) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `blitzMroEtc` decimal(10,2);--> statement-breakpoint
ALTER TABLE `services` ADD `blitzMroDeviceName` varchar(256) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `blitzAvg3mDataMb` decimal(12,2);--> statement-breakpoint
ALTER TABLE `services` ADD `blitzAvg6mDataMb` decimal(12,2);--> statement-breakpoint
ALTER TABLE `services` ADD `blitzAvg3mVoiceMins` decimal(10,2);--> statement-breakpoint
ALTER TABLE `services` ADD `blitzAvg6mVoiceMins` decimal(10,2);--> statement-breakpoint
ALTER TABLE `services` ADD `blitzAvg3mBill` decimal(10,2);--> statement-breakpoint
ALTER TABLE `services` ADD `blitzBillMar26` decimal(10,2);--> statement-breakpoint
ALTER TABLE `services` ADD `blitzBillFeb26` decimal(10,2);--> statement-breakpoint
ALTER TABLE `services` ADD `blitzBillJan26` decimal(10,2);--> statement-breakpoint
ALTER TABLE `services` ADD `blitzUsageHistory` text;--> statement-breakpoint
ALTER TABLE `services` ADD `terminationNote` text;