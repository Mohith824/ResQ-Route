-- ============================================================================
-- Application: ResQ-Route (Emergency Response Database Schema)
-- DBMS: MySQL (Compatible with version 8.0+)
-- Normalization Level: Third Normal Form (3NF) Compliance
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 3NF Normalization Analysis:
-- 1NF: All columns contain atomic values, and each record is unique with a defined Primary Key.
-- 2NF: No partial dependencies exist. All non-key columns depend entirely on the whole Primary Key.
-- 3NF: No transitive dependencies exist. Non-key columns depend ONLY on the primary key, 
--      and do not depend on other non-key columns. 
--
-- Table Analysis:
-- 1. `disaster_zones`: Primary Key is `zone_id`. `area_name`, `disaster_type`, `severity_level`, 
--    and `status` all directly describe the zone and depend solely on `zone_id`.
-- 2. `relief_camps`: Primary Key is `camp_id`. `camp_name`, `total_capacity`, and 
--    `current_occupants` depend solely on `camp_id`.
-- 3. `supplies_inventory`: Primary Key is `item_id`. `camp_id` acts as a foreign key indicating 
--    where the supply inventory is held. `item_name`, `quantity`, and `minimum_threshold` depend 
--    solely on the specific inventory item instance (`item_id`).
-- 4. `dispatch_logs`: Primary Key is `dispatch_id`. The log attributes (`item_id`, `zone_id`, 
--    `quantity_sent`, and `dispatch_timestamp`) describe the specific transaction and depend 
--    solely on `dispatch_id`.
-- ----------------------------------------------------------------------------

-- Create the Database
CREATE DATABASE IF NOT EXISTS resq_route;
USE resq_route;

-- ----------------------------------------------------------------------------
-- Drop tables in reverse order of dependencies to avoid constraint violations
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS dispatch_logs;
DROP TABLE IF EXISTS supplies_inventory;
DROP TABLE IF EXISTS relief_camps;
DROP TABLE IF EXISTS disaster_zones;

-- ----------------------------------------------------------------------------
-- Table 1: disaster_zones
-- Stores information about active and monitored disaster-affected regions.
-- ----------------------------------------------------------------------------
CREATE TABLE disaster_zones (
    zone_id INT AUTO_INCREMENT,
    area_name VARCHAR(255) NOT NULL,
    disaster_type VARCHAR(100) NOT NULL,
    severity_level TINYINT NOT NULL,
    status VARCHAR(50) NOT NULL,
    PRIMARY KEY (zone_id),
    -- Ensure severity level remains within the designated 1-5 scale
    CONSTRAINT chk_severity_level CHECK (severity_level BETWEEN 1 AND 5),
    -- Ensure status and area name are not empty
    CONSTRAINT chk_zone_area_name CHECK (CHAR_LENGTH(TRIM(area_name)) > 0),
    CONSTRAINT chk_zone_status CHECK (CHAR_LENGTH(TRIM(status)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table 2: relief_camps
-- Stores details about locations established to support displaced populations.
-- ----------------------------------------------------------------------------
CREATE TABLE relief_camps (
    camp_id INT AUTO_INCREMENT,
    camp_name VARCHAR(255) NOT NULL,
    total_capacity INT NOT NULL,
    current_occupants INT NOT NULL,
    PRIMARY KEY (camp_id),
    -- Business rule validation constraints
    CONSTRAINT chk_camp_name CHECK (CHAR_LENGTH(TRIM(camp_name)) > 0),
    CONSTRAINT chk_total_capacity CHECK (total_capacity >= 0),
    CONSTRAINT chk_current_occupants CHECK (current_occupants >= 0),
    -- Ensure camp capacity is never exceeded
    CONSTRAINT chk_capacity_limit CHECK (current_occupants <= total_capacity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table 3: supplies_inventory
-- Stores quantities of various emergency items stored in individual relief camps.
-- ----------------------------------------------------------------------------
CREATE TABLE supplies_inventory (
    item_id INT AUTO_INCREMENT,
    camp_id INT NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL,
    minimum_threshold INT NOT NULL,
    PRIMARY KEY (item_id),
    -- Foreign Key referencing relief_camps with explicit ON DELETE RESTRICT
    CONSTRAINT fk_supplies_camp FOREIGN KEY (camp_id)
        REFERENCES relief_camps (camp_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    -- Validate quantity and threshold boundaries
    CONSTRAINT chk_item_name CHECK (CHAR_LENGTH(TRIM(item_name)) > 0),
    CONSTRAINT chk_quantity CHECK (quantity >= 0),
    CONSTRAINT chk_minimum_threshold CHECK (minimum_threshold >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table 4: dispatch_logs
-- Stores transaction records of supplies dispatched to disaster zones.
-- ----------------------------------------------------------------------------
CREATE TABLE dispatch_logs (
    dispatch_id INT AUTO_INCREMENT,
    item_id INT NOT NULL,
    zone_id INT NOT NULL,
    quantity_sent INT NOT NULL,
    dispatch_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (dispatch_id),
    -- Foreign Keys referencing supplies_inventory and disaster_zones with ON DELETE RESTRICT
    CONSTRAINT fk_dispatch_item FOREIGN KEY (item_id)
        REFERENCES supplies_inventory (item_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_dispatch_zone FOREIGN KEY (zone_id)
        REFERENCES disaster_zones (zone_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    -- Ensure quantity sent is positive and non-zero
    CONSTRAINT chk_quantity_sent CHECK (quantity_sent > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Indices for Query Optimization
-- ----------------------------------------------------------------------------
CREATE INDEX idx_disaster_zones_severity ON disaster_zones(severity_level);
CREATE INDEX idx_disaster_zones_status ON disaster_zones(status);
CREATE INDEX idx_relief_camps_occupancy ON relief_camps(current_occupants, total_capacity);
CREATE INDEX idx_supplies_camp_item ON supplies_inventory(camp_id, item_name);
CREATE INDEX idx_dispatch_timestamp ON dispatch_logs(dispatch_timestamp);


-- ============================================================================
-- SAMPLE DATA INSERTION (5 Realistic Records Per Table for Expo Demo)
-- ============================================================================

-- 1. Insert records into disaster_zones
INSERT INTO disaster_zones (area_name, disaster_type, severity_level, status)
VALUES 
    ('Downtown Metro Sector A', 'Urban Flooding', 4, 'Active - Evacuating'),
    ('Coastal Bay Beachfront', 'Category 4 Hurricane', 5, 'Active - Impacted'),
    ('East Ridge Mountain Pass', 'Landslide & Road Collapse', 3, 'Monitored - Restrictive Access'),
    ('West Valley Pine Forest', 'Wildfire Outbreak', 4, 'Active - Containment Phase'),
    ('North Plains Industrial Park', 'Industrial Gas Leak', 2, 'Resolved - Safe');

-- 2. Insert records into relief_camps
INSERT INTO relief_camps (camp_name, total_capacity, current_occupants)
VALUES 
    ('Hope Haven Stadium Camp', 1200, 850),
    ('Safe Harbor Community Center', 400, 320),
    ('Valley High Sports Complex', 300, 150),
    ('Metro Arena Relief Hub', 2500, 1850),
    ('Green Meadows Forest Lodge', 150, 45);

-- 3. Insert records into supplies_inventory
-- camp_id maps to: 1 = Hope Haven, 2 = Safe Harbor, 3 = Valley High, 4 = Metro Arena, 5 = Green Meadows
INSERT INTO supplies_inventory (camp_id, item_name, quantity, minimum_threshold)
VALUES 
    (1, 'Bottled Drinking Water (Cases)', 1500, 300),
    (1, 'MRE (Meals Ready-to-Eat) Packs', 2000, 400),
    (2, 'Trauma Medical Kits', 250, 75),
    (3, 'Thermal Emergency Blankets', 600, 150),
    (4, 'Heavy-Duty Diesel Generators', 20, 5);

-- 4. Insert records into dispatch_logs
-- item_id maps to: 
--   1 = Water (Camp 1)
--   2 = MRE Packs (Camp 1)
--   3 = Medical Kits (Camp 2)
--   4 = Blankets (Camp 3)
--   5 = Generators (Camp 4)
-- zone_id maps to:
--   1 = Downtown Flooding
--   2 = Coastal Hurricane
--   3 = East Ridge Landslide
--   4 = West Valley Wildfire
--   5 = North Plains Gas Leak
INSERT INTO dispatch_logs (item_id, zone_id, quantity_sent, dispatch_timestamp)
VALUES 
    (1, 1, 300, '2026-05-24 08:30:00'), -- Dispatched Water to Downtown Flooding
    (2, 1, 400, '2026-05-24 09:15:00'), -- Dispatched MREs to Downtown Flooding
    (3, 2, 50, '2026-05-24 10:00:00'),  -- Dispatched Medical Kits to Coastal Hurricane
    (4, 3, 100, '2026-05-24 11:45:00'), -- Dispatched Blankets to East Ridge Landslide
    (5, 4, 3, '2026-05-24 14:20:00');    -- Dispatched Generators to West Valley Wildfire

-- ============================================================================
-- TRIGGERS & AUTOMATION
-- ============================================================================

-- AFTER UPDATE trigger on supplies_inventory to set disaster zone status
-- to 'CRITICAL SYSTEM ALERT' when quantity falls below minimum_threshold.
DELIMITER //

CREATE TRIGGER after_supplies_inventory_update
AFTER UPDATE ON supplies_inventory
FOR EACH ROW
BEGIN
    IF NEW.quantity < NEW.minimum_threshold THEN
        UPDATE disaster_zones
        SET status = 'CRITICAL SYSTEM ALERT'
        WHERE zone_id IN (
            SELECT DISTINCT zone_id
            FROM dispatch_logs
            WHERE item_id = NEW.item_id
        );
    END IF;
END //

DELIMITER ;
