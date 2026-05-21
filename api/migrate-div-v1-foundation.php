<?php
/**
 * Database Migration — Divisional Parity DB Foundation
 *
 * Creates all tables for NHRA divisional event data in the separate div database.
 *
 * Tables:
 *   - div_tracks              (track name, timezone, coordinates)
 *   - div_events              (divisional event metadata, division D1-D7/W)
 *   - div_run_imports         (import audit trail)
 *   - div_runs                (normalized run data)
 *   - div_weather_samples     (Open-Meteo hourly weather)
 *   - div_weather_canonical   (bucketed canonical weather for joins)
 *   - div_scrape_logs         (schedule scraper audit)
 *
 * Safe to run multiple times (uses IF NOT EXISTS).
 *
 * Usage:
 *   php api/migrate-div-v1-foundation.php       (CLI)
 *   https://example.com/api/migrate-div-v1-foundation.php  (browser)
 */

ini_set('display_errors', 1);
error_reporting(E_ALL);
header('Content-Type: text/plain');

echo "=== NHRATS Migration — Divisional Parity DB Foundation ===\n\n";

if (!file_exists(__DIR__ . '/config_div.php')) {
    echo "ERROR: config_div.php not found!\n";
    exit(1);
}

require_once __DIR__ . '/config_div.php';

echo "1. Connecting to divisional database...\n";
try {
    $pdo = getDivDB();
    echo "   OK — connected to " . DIV_DB_NAME . "\n\n";
} catch (Exception $e) {
    echo "   FAILED: " . $e->getMessage() . "\n";
    exit(1);
}

// ── Helper ──────────────────────────────────────────────────────────────────

function addIndexSafeDiv(PDO $pdo, string $name, string $ddl): void {
    try {
        $pdo->exec($ddl);
        echo "   Added index: $name\n";
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'Duplicate') !== false || strpos($e->getMessage(), 'already exists') !== false) {
            echo "   Exists: $name\n";
        } else {
            throw $e;
        }
    }
}

function addColumnIfNotExistsDiv(PDO $pdo, string $table, string $column, string $definition): void {
    $cols = $pdo->query("SHOW COLUMNS FROM `$table` LIKE '$column'")->fetchAll();
    if (count($cols) === 0) {
        $pdo->exec("ALTER TABLE `$table` ADD COLUMN $column $definition");
        echo "   Added column: $table.$column\n";
    } else {
        echo "   Exists: $table.$column\n";
    }
}

// ── 2. div_tracks ────────────────────────────────────────────────────────────

echo "2. Creating div_tracks table...\n";
try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS div_tracks (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            track_name      VARCHAR(255) NOT NULL,
            timezone_iana   VARCHAR(50) NOT NULL DEFAULT 'America/New_York',
            street          VARCHAR(255) NULL,
            city            VARCHAR(100) NULL,
            state           VARCHAR(2)   NULL,
            zip             VARCHAR(10)  NULL,
            latitude        DOUBLE       NULL,
            longitude       DOUBLE       NULL,
            nhra_division   VARCHAR(2)   NULL,
            created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

            UNIQUE KEY uk_dt_name (track_name),
            INDEX idx_dt_division (nhra_division)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    echo "   OK\n\n";
} catch (PDOException $e) {
    echo "   FAILED: " . $e->getMessage() . "\n\n";
}

// ── 3. div_events ────────────────────────────────────────────────────────────

echo "3. Creating div_events table...\n";
try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS div_events (
            id                INT AUTO_INCREMENT PRIMARY KEY,
            event_name        VARCHAR(255)  NOT NULL,
            track_id          INT           NOT NULL,
            start_date_local  DATE          NOT NULL,
            end_date_local    DATE          NOT NULL,
            race_lookup       VARCHAR(8)    NULL,
            season_year       INT           NULL,
            nhra_division     VARCHAR(2)    NOT NULL DEFAULT 'D1',
            event_code        VARCHAR(20)   NULL,
            created_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
            updated_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

            UNIQUE KEY uk_de_racelookup_div (race_lookup, nhra_division),
            INDEX idx_de_track (track_id),
            INDEX idx_de_dates (start_date_local, end_date_local),
            INDEX idx_de_division (nhra_division),
            INDEX idx_de_season (season_year),
            FOREIGN KEY (track_id) REFERENCES div_tracks(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    echo "   OK\n\n";
} catch (PDOException $e) {
    echo "   FAILED: " . $e->getMessage() . "\n\n";
}

// ── 4. div_run_imports ────────────────────────────────────────────────────────

echo "4. Creating div_run_imports table...\n";
try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS div_run_imports (
            id                  INT AUTO_INCREMENT PRIMARY KEY,
            uuid                VARCHAR(36)   UNIQUE NOT NULL,
            race_lookup         VARCHAR(8)    NOT NULL,
            nhra_division       VARCHAR(2)    NOT NULL,
            requested_at_utc    DATETIME      NOT NULL,
            fetched_at_utc      DATETIME      NULL,
            status              ENUM('success','error') NOT NULL DEFAULT 'success',
            row_count           INT           NOT NULL DEFAULT 0,
            error_message       TEXT          NULL,
            source_url          TEXT          NOT NULL,
            created_by_user_id  INT           NULL,
            created_at          TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,

            INDEX idx_dri_race (race_lookup),
            INDEX idx_dri_division (nhra_division),
            UNIQUE KEY uk_dri_race_div_fetch (race_lookup, nhra_division, requested_at_utc)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    echo "   OK\n\n";
} catch (PDOException $e) {
    echo "   FAILED: " . $e->getMessage() . "\n\n";
}

// ── 5. div_runs ───────────────────────────────────────────────────────────────

echo "5. Creating div_runs table...\n";
try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS div_runs (
            id                  INT AUTO_INCREMENT PRIMARY KEY,
            uuid                VARCHAR(36)   UNIQUE NOT NULL,
            import_id           INT           NOT NULL,
            race_lookup         VARCHAR(8)    NOT NULL,
            nhra_division       VARCHAR(2)    NOT NULL,
            run_timestamp_utc   DATETIME      NULL,
            run_time_local      DATETIME      NULL,
            category            VARCHAR(100)  NULL,
            class_index         VARCHAR(30)   NULL,
            round               VARCHAR(20)   NULL,
            lane                VARCHAR(10)   NULL,
            driver_name         VARCHAR(255)  NULL,
            car_number          VARCHAR(20)   NULL,
            dial_in             DOUBLE        NULL,
            rt                  DOUBLE        NULL,
            ft60                DOUBLE        NULL,
            ft330               DOUBLE        NULL,
            ft660               DOUBLE        NULL,
            mph660              DOUBLE        NULL,
            ft1000              DOUBLE        NULL,
            mph1000             DOUBLE        NULL,
            ft1320              DOUBLE        NULL,
            mph1320             DOUBLE        NULL,
            win_flag            TINYINT(1)    NULL,
            dq_flag             TINYINT(1)    NULL,
            mov                 DOUBLE        NULL,
            place               VARCHAR(10)   NULL,
            source_ref          VARCHAR(50)   NULL,
            row_hash            VARCHAR(64)   NOT NULL,
            created_at          TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,

            UNIQUE KEY uk_dr_hash_div (row_hash, nhra_division),
            INDEX idx_dr_race_div (race_lookup, nhra_division),
            INDEX idx_dr_driver (driver_name),
            INDEX idx_dr_class (class_index),
            INDEX idx_dr_ts (run_timestamp_utc),
            INDEX idx_dr_import (import_id),
            FOREIGN KEY (import_id) REFERENCES div_run_imports(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    echo "   OK\n\n";
} catch (PDOException $e) {
    echo "   FAILED: " . $e->getMessage() . "\n\n";
}

// ── 6. div_weather_samples ────────────────────────────────────────────────────

echo "6. Creating div_weather_samples table...\n";
try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS div_weather_samples (
            id                      INT AUTO_INCREMENT PRIMARY KEY,
            timestamp_utc           DATETIME      NOT NULL,
            event_id                INT           NULL,
            track_id                INT           NULL,
            event_local_time        DATETIME      NULL,
            temp_c                  DOUBLE        NULL,
            temp_f                  DOUBLE        NULL,
            rh_pct                  DOUBLE        NULL,
            station_pressure_raw    DOUBLE        NULL,
            wind_speed_mph          DOUBLE        NULL,
            wind_dir_deg            SMALLINT      NULL,
            source                  VARCHAR(50)   NOT NULL DEFAULT 'open_meteo',
            created_at              TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,

            INDEX idx_dws_ts (timestamp_utc),
            INDEX idx_dws_event_ts (event_id, timestamp_utc),
            UNIQUE KEY uk_dws_source_ts_event (source, timestamp_utc, event_id),
            FOREIGN KEY (event_id) REFERENCES div_events(id) ON DELETE SET NULL,
            FOREIGN KEY (track_id) REFERENCES div_tracks(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    echo "   OK\n\n";
} catch (PDOException $e) {
    echo "   FAILED: " . $e->getMessage() . "\n\n";
}

// ── 7. div_weather_canonical ──────────────────────────────────────────────────

echo "7. Creating div_weather_canonical table...\n";
try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS div_weather_canonical (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            bucket_utc      DATETIME    NOT NULL,
            event_id        INT         NULL,
            track_id        INT         NULL,
            temp_f          DOUBLE      NULL,
            rh_pct          DOUBLE      NULL,
            pressure_inhg   DOUBLE      NULL,
            wind_speed_mph  DOUBLE      NULL,
            wind_dir_deg    SMALLINT    NULL,
            source_count    INT         NOT NULL DEFAULT 0,
            created_at      TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMP   DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

            UNIQUE KEY uk_dwc_bucket_event (bucket_utc, event_id),
            INDEX idx_dwc_bucket (bucket_utc),
            INDEX idx_dwc_event (event_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    echo "   OK\n\n";
} catch (PDOException $e) {
    echo "   FAILED: " . $e->getMessage() . "\n\n";
}

// ── 8. div_scrape_logs ────────────────────────────────────────────────────────

echo "8. Creating div_scrape_logs table...\n";
try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS div_scrape_logs (
            id                      INT AUTO_INCREMENT PRIMARY KEY,
            started_at              DATETIME    NOT NULL,
            ended_at                DATETIME    NULL,
            years                   JSON        NULL,
            divisions               JSON        NULL,
            events_upserted         INT         NOT NULL DEFAULT 0,
            tracks_upserted         INT         NOT NULL DEFAULT 0,
            errors_json             JSON        NULL,
            created_by_user_id      INT         NULL,
            created_at              TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    echo "   OK\n\n";
} catch (PDOException $e) {
    echo "   FAILED: " . $e->getMessage() . "\n\n";
}

echo "=== Migration Complete ===\n";
echo "Divisional DB: " . DIV_DB_NAME . "\n";
echo "Tables: div_tracks, div_events, div_run_imports, div_runs,\n";
echo "        div_weather_samples, div_weather_canonical, div_scrape_logs\n";
