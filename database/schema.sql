-- =====================================================================
--  CivicPulse database schema + sample data  (MySQL 8+)
--  Run:  mysql -u root -p < database/schema.sql
-- =====================================================================
CREATE DATABASE IF NOT EXISTS civicpulse CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE civicpulse;

DROP TABLE IF EXISTS confirmations;
DROP TABLE IF EXISTS status_history;
DROP TABLE IF EXISTS issue_reports;
DROP TABLE IF EXISTS issues;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS settings;

-- Issue categories with admin-managed severity weights (1 = minor, 10 = dangerous)
CREATE TABLE categories (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(80)  NOT NULL UNIQUE,
  icon            VARCHAR(50)  NOT NULL DEFAULT 'bi-exclamation-triangle',
  color           VARCHAR(9)   NOT NULL DEFAULT '#0F9D8A',
  severity_weight TINYINT UNSIGNED NOT NULL DEFAULT 5,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_weight CHECK (severity_weight BETWEEN 1 AND 10)
) ENGINE=InnoDB;

-- One row per UNIQUE issue (duplicates are consolidated into it)
CREATE TABLE issues (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  title         VARCHAR(150) NOT NULL,
  description   TEXT NOT NULL,
  category_id   INT NOT NULL,
  latitude      DECIMAL(10,7) NOT NULL,
  longitude     DECIMAL(10,7) NOT NULL,
  address       VARCHAR(255),
  status        ENUM('Reported','Acknowledged','In Progress','Resolved','Rejected') NOT NULL DEFAULT 'Reported',
  confirmations INT NOT NULL DEFAULT 1,   -- community confirmations (unique voters)
  report_count  INT NOT NULL DEFAULT 1,   -- raw reports merged into this issue
  reporter_name VARCHAR(100) DEFAULT 'Anonymous',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  resolved_at   TIMESTAMP NULL,
  CONSTRAINT fk_issue_category FOREIGN KEY (category_id) REFERENCES categories(id),
  INDEX idx_geo (latitude, longitude),    -- speeds up the bounding-box pre-filter
  INDEX idx_status (status),
  INDEX idx_category (category_id)
) ENGINE=InnoDB;

-- Every raw citizen report, including those merged as duplicates (audit trail)
CREATE TABLE issue_reports (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  issue_id              INT NOT NULL,
  reporter_name         VARCHAR(100),
  description           TEXT,
  latitude              DECIMAL(10,7),
  longitude             DECIMAL(10,7),
  distance_from_issue_m DECIMAL(8,1) DEFAULT 0,  -- Haversine distance to the master issue
  text_similarity       DECIMAL(4,3) DEFAULT 1,  -- Jaccard index against the master issue
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- One confirmation per browser per issue
CREATE TABLE confirmations (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  issue_id   INT NOT NULL,
  voter_key  VARCHAR(64) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_vote (issue_id, voter_key),
  FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Status-tracking workflow log
CREATE TABLE status_history (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  issue_id   INT NOT NULL,
  old_status VARCHAR(20),
  new_status VARCHAR(20) NOT NULL,
  note       VARCHAR(255),
  changed_by VARCHAR(60),
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Engine tuning knobs editable from the admin panel
CREATE TABLE settings (
  setting_key   VARCHAR(50) PRIMARY KEY,
  setting_value DECIMAL(10,3) NOT NULL
) ENGINE=InnoDB;

INSERT INTO settings (setting_key, setting_value) VALUES
  ('duplicate_radius_m', 100),
  ('jaccard_threshold', 0.30),
  ('w_severity', 10),
  ('w_confirmations', 4),
  ('w_age', 1.5),
  ('age_cap_days', 60);

INSERT INTO categories (name, icon, color, severity_weight) VALUES
  ('Open Manhole',        'bi-exclamation-octagon', '#B91C1C', 10),
  ('Pothole',             'bi-cone-striped',        '#EA580C', 7),
  ('Water Leakage',       'bi-droplet-half',        '#0284C7', 7),
  ('Broken Streetlight',  'bi-lightbulb',           '#CA8A04', 6),
  ('Drainage Blockage',   'bi-water',               '#0F766E', 6),
  ('Garbage Overflow',    'bi-trash3',              '#65A30D', 5),
  ('Fallen Tree',         'bi-tree',                '#15803D', 5),
  ('Damaged Road Sign',   'bi-sign-stop',           '#7C3AED', 3);

-- Sample issues around the default map centre (23.0225, 72.5714) -------------
INSERT INTO issues (title, description, category_id, latitude, longitude, address, status, confirmations, report_count, reporter_name, created_at) VALUES
 ('Deep pothole near bus stop', 'Large deep pothole on the main road next to the bus stop. Two-wheelers are swerving to avoid it.', 2, 23.0268, 72.5801, 'Main Road, near City Bus Stop', 'Reported', 14, 5, 'Riya Shah', DATE_SUB(NOW(), INTERVAL 21 DAY)),
 ('Streetlight not working on lane 4', 'The streetlight at the corner of lane 4 has been dark for a week. The lane is unsafe after 7 pm.', 4, 23.0181, 72.5652, 'Lane 4, Garden Colony', 'Acknowledged', 8, 3, 'Imran K.', DATE_SUB(NOW(), INTERVAL 9 DAY)),
 ('Garbage overflowing from community bin', 'Community garbage bin is overflowing onto the footpath and smells terrible. Collection has been missed for days.', 6, 23.0312, 72.5589, 'Market Square', 'In Progress', 11, 4, 'Anita Desai', DATE_SUB(NOW(), INTERVAL 12 DAY)),
 ('Open manhole without cover', 'Manhole cover is missing on the busy crossing. Very dangerous for children and vehicles at night.', 1, 23.0140, 72.5780, 'Station Crossing', 'Reported', 19, 7, 'Karan Mehta', DATE_SUB(NOW(), INTERVAL 4 DAY)),
 ('Water pipeline leaking on street', 'Main water pipeline is leaking continuously and the street is flooded with clean water.', 3, 23.0405, 72.5701, 'Sector 7 Road', 'Acknowledged', 6, 2, 'Pooja Nair', DATE_SUB(NOW(), INTERVAL 6 DAY)),
 ('Blocked storm drain floods road', 'Storm drain is choked with plastic and mud. Road floods after even light rain.', 5, 23.0090, 72.5600, 'Riverside Avenue', 'Reported', 5, 2, 'Sanjay Patel', DATE_SUB(NOW(), INTERVAL 15 DAY)),
 ('Tree fallen across footpath', 'A large tree branch has fallen across the footpath and half the road after last night''s storm.', 7, 23.0350, 72.5900, 'Park Lane', 'In Progress', 4, 1, 'Meera Joshi', DATE_SUB(NOW(), INTERVAL 2 DAY)),
 ('Road sign knocked over', 'The speed limit sign near the school zone is bent and lying on the ground.', 8, 23.0220, 72.5500, 'School Zone, West End', 'Reported', 2, 1, 'Vikram Rao', DATE_SUB(NOW(), INTERVAL 30 DAY)),
 ('Pothole cluster after monsoon', 'Several potholes have opened up on this stretch after the monsoon, damaging vehicles.', 2, 23.0455, 72.5530, 'Ring Road, North Stretch', 'Reported', 9, 3, 'Neha Bhatt', DATE_SUB(NOW(), INTERVAL 18 DAY)),
 ('Streetlights out along entire park road', 'Four consecutive streetlights are not working along the park road. Joggers and families feel unsafe.', 4, 23.0290, 72.5960, 'Park Road', 'Reported', 7, 3, 'Dev Malhotra', DATE_SUB(NOW(), INTERVAL 5 DAY)),
 ('Garbage dumped at vacant plot', 'Mixed waste is being dumped on the vacant plot beside the colony gate. Stray animals spread it onto the road.', 6, 23.0050, 72.5905, 'Colony Gate 2', 'Resolved', 6, 2, 'Farah Ali', DATE_SUB(NOW(), INTERVAL 25 DAY)),
 ('Sewage overflow near temple', 'Drain is overflowing with sewage near the temple entrance, creating a health hazard.', 5, 23.0375, 72.5460, 'Temple Road', 'Acknowledged', 10, 4, 'Harsh Vyas', DATE_SUB(NOW(), INTERVAL 8 DAY));

UPDATE issues SET resolved_at = DATE_SUB(NOW(), INTERVAL 20 DAY) WHERE status = 'Resolved';

INSERT INTO issue_reports (issue_id, reporter_name, description, latitude, longitude)
  SELECT id, reporter_name, description, latitude, longitude FROM issues;

INSERT INTO status_history (issue_id, old_status, new_status, note, changed_by)
  SELECT id, NULL, 'Reported', 'Issue reported by a citizen', NULL FROM issues;
INSERT INTO status_history (issue_id, old_status, new_status, note, changed_by)
  SELECT id, 'Reported', 'Acknowledged', 'Assigned to the zone engineer', 'admin' FROM issues WHERE status IN ('Acknowledged','In Progress','Resolved');
INSERT INTO status_history (issue_id, old_status, new_status, note, changed_by)
  SELECT id, 'Acknowledged', 'In Progress', 'Work crew dispatched', 'admin' FROM issues WHERE status IN ('In Progress','Resolved');
INSERT INTO status_history (issue_id, old_status, new_status, note, changed_by)
  SELECT id, 'In Progress', 'Resolved', 'Work completed and verified', 'admin' FROM issues WHERE status = 'Resolved';
