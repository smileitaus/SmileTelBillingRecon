CREATE TABLE `supplier_product_cost_map` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplier` varchar(128) NOT NULL,
	`productName` varchar(512) NOT NULL,
	`productCategory` varchar(128) DEFAULT '',
	`unit` varchar(64) DEFAULT 'Per Month',
	`rrp` decimal(10,5) DEFAULT '0.00000',
	`wholesaleCost` decimal(10,5) NOT NULL,
	`defaultRetailPrice` decimal(10,5) DEFAULT '0.00000',
	`notes` text,
	`isActive` int NOT NULL DEFAULT 1,
	`source` varchar(128) DEFAULT 'Access4 Diamond Pricebook v3.4',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supplier_product_cost_map_id` PRIMARY KEY(`id`)
);
