ALTER TABLE `customer_proposals` MODIFY COLUMN `serviceExternalIds` text NOT NULL;--> statement-breakpoint
ALTER TABLE `customer_proposals` MODIFY COLUMN `source` varchar(128);