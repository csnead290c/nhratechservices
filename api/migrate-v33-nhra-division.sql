-- Migration v33: Add nhra_division column to parity_tracks
-- Run once against production DB before deploying parity.php changes.
-- Source: nhra.com/member-track-locator, May 2026

ALTER TABLE parity_tracks
    ADD COLUMN IF NOT EXISTS nhra_division VARCHAR(2) NULL DEFAULT NULL
        COMMENT 'NHRA Division (1-7 or W for World)';
