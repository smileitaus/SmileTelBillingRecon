-- Add serviceCategory to services table
-- Categories: voice-licensing | voice-usage | voice-numbers | voice-features |
--             data-mobile | data-nbn | data-enterprise | data-usage |
--             hardware | professional-services | internal | other
ALTER TABLE `services` ADD COLUMN `serviceCategory` varchar(64) DEFAULT 'other' NOT NULL;

-- Add assignmentBucket to service_billing_assignments
-- Buckets: standard | usage-holding | professional-services | hardware-sales | internal-cost
ALTER TABLE `service_billing_assignments` ADD COLUMN `assignmentBucket` varchar(64) DEFAULT 'standard' NOT NULL;
