ALTER TABLE `billing_items` ADD `billingPlatform` varchar(64) DEFAULT '';--> statement-breakpoint
ALTER TABLE `services` ADD `billingPlatform` text;