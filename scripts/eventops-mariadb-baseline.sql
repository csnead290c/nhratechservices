-- Pre-v40 production-shaped baseline for local MariaDB migration validation.
-- Synthetic schema only — mirrors the real DDL from api/setup.php,
-- api/migrate-v6c-parity-weather.php, api/migrate-v18-tm-events.php,
-- api/migrate-v19-tm-identities.php. No production data or credentials.

-- ── users (api/setup.php) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role ENUM('owner', 'admin', 'user', 'beta') DEFAULT 'user',
    products JSON,
    preferences JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── persons (api/migrate-v19-tm-identities.php) ────────────────────────
CREATE TABLE IF NOT EXISTS persons (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    uuid             VARCHAR(36) NOT NULL,
    display_name     VARCHAR(255) NOT NULL,
    normalized_name  VARCHAR(255) NOT NULL,
    first_name       VARCHAR(100) NULL,
    last_name        VARCHAR(100) NULL,
    nhra_license_id  VARCHAR(100) NULL,
    person_type      VARCHAR(100) NOT NULL DEFAULT 'driver',
    status           ENUM('active','inactive','deceased') NOT NULL DEFAULT 'active',
    notes            TEXT NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_p_uuid (uuid),
    INDEX idx_p_normalized (normalized_name),
    INDEX idx_p_license (nhra_license_id),
    INDEX idx_p_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── parity_tracks (api/migrate-v6c-parity-weather.php; city/state from later migrations) ──
CREATE TABLE IF NOT EXISTS parity_tracks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    track_name VARCHAR(255) NOT NULL,
    city VARCHAR(100) NULL,
    state VARCHAR(50) NULL,
    timezone_iana VARCHAR(100) NOT NULL DEFAULT 'America/New_York',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_pt_name (track_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── event_types / seasons (FK targets for event_instances) ────────────
CREATE TABLE IF NOT EXISTS event_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    UNIQUE KEY uk_et_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seasons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    year SMALLINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    UNIQUE KEY uk_season_year (year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── event_instances (api/migrate-v18-tm-events.php) ────────────────────
CREATE TABLE IF NOT EXISTS event_instances (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    uuid             VARCHAR(36) NOT NULL,
    event_type_id    INT NOT NULL,
    season_id        INT NULL,
    track_id         INT NOT NULL,
    name             VARCHAR(255) NOT NULL,
    event_code       VARCHAR(50) NULL,
    start_date_local DATE NOT NULL,
    end_date_local   DATE NOT NULL,
    race_lookup      VARCHAR(8) NULL,
    status           ENUM('scheduled','active','completed','cancelled') NOT NULL DEFAULT 'scheduled',
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_ei_uuid (uuid),
    UNIQUE KEY uk_ei_race_lookup (race_lookup),
    INDEX idx_ei_season (season_id),
    INDEX idx_ei_track (track_id),
    INDEX idx_ei_type (event_type_id),
    INDEX idx_ei_dates (start_date_local, end_date_local),
    CONSTRAINT fk_ei_type FOREIGN KEY (event_type_id) REFERENCES event_types(id),
    CONSTRAINT fk_ei_season FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE SET NULL,
    CONSTRAINT fk_ei_track FOREIGN KEY (track_id) REFERENCES parity_tracks(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── parity_events (v6c + v10 season_year/event_code + v18 event_instance_id) ──
CREATE TABLE IF NOT EXISTS parity_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_instance_id INT NULL,
    event_name VARCHAR(255) NOT NULL,
    event_code VARCHAR(50) NULL,
    season_year SMALLINT NULL,
    track_id INT NOT NULL,
    start_date_local DATE NOT NULL,
    end_date_local DATE NOT NULL,
    race_lookup VARCHAR(8) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pe_track (track_id),
    INDEX idx_pe_dates (start_date_local, end_date_local),
    INDEX idx_pe_racelookup (race_lookup),
    INDEX idx_pe_ei (event_instance_id),
    FOREIGN KEY (track_id) REFERENCES parity_tracks(id) ON DELETE CASCADE,
    CONSTRAINT fk_pe_ei FOREIGN KEY (event_instance_id) REFERENCES event_instances(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Synthetic seed data ───────────────────────────────────────────────
INSERT INTO parity_tracks (id, track_name, city, state, timezone_iana) VALUES
    (1, 'US 131 Motorsports Park', 'Martin', 'MI', 'America/Detroit'),
    (2, 'Gainesville Raceway', 'Gainesville', 'FL', 'America/New_York');

INSERT INTO event_types (id, code, name) VALUES (1, 'divisional', 'Divisional LODRS');
INSERT INTO seasons (id, year, name) VALUES (1, 2026, '2026 Season');

INSERT INTO event_instances (id, uuid, event_type_id, season_id, track_id, name, event_code, start_date_local, end_date_local, race_lookup, status) VALUES
    (10, 'ei-uuid-10', 1, 1, 1, '2026 US 131 Division 3 LODRS', 'MARTIN_D3', '2026-08-07', '2026-08-09', 'D3MR26', 'scheduled');

INSERT INTO parity_events (id, event_instance_id, event_name, event_code, season_year, track_id, start_date_local, end_date_local, race_lookup) VALUES
    (1, 10, '2026 US 131 Division 3 LODRS', 'MARTIN_D3', 2026, 1, '2026-08-07', '2026-08-09', 'D3MR26'),
    (2, NULL, '2026 Gainesville Division 2 LODRS', 'GNV_D2', 2026, 2, '2026-03-13', '2026-03-15', 'D2GN26');

INSERT INTO users (id, email, password_hash, name, role) VALUES
    (1, 'admin@rsa.local', '$2y$10$dummyhashfortestingonly', 'Admin User', 'admin'),
    (2, 'joey@rsa.local', '$2y$10$dummyhashfortestingonly', 'Joey Martin', 'user'),
    (3, 'rick@rsa.local', '$2y$10$dummyhashfortestingonly', 'Rick Delgado', 'user'),
    (4, 'jake@rsa.local', '$2y$10$dummyhashfortestingonly', 'Jake Morrison', 'user');

INSERT INTO persons (id, uuid, display_name, normalized_name, first_name, last_name, person_type, status) VALUES
    (1, 'p-uuid-1', 'Russell Smith', 'russell smith', 'Russell', 'Smith', 'staff', 'active'),
    (2, 'p-uuid-2', 'Joey Martin', 'joey martin', 'Joey', 'Martin', 'staff', 'active'),
    (3, 'p-uuid-3', 'Rick Delgado', 'rick delgado', 'Rick', 'Delgado', 'staff', 'active'),
    (4, 'p-uuid-4', 'Jake Morrison', 'jake morrison', 'Jake', 'Morrison', 'staff', 'active');
