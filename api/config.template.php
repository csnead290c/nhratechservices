<?php
/**
 * Database Configuration Template
 * Copy this to config.php and fill in your credentials
 * 
 * NOTE: All helper functions are now in functions.php
 */

define('DB_HOST', 'localhost');
define('DB_NAME', 'your_database_name');
define('DB_USER', 'your_username');
define('DB_PASS', 'your_password');

// JWT Secret for token signing
// REQUIRED: Generate a strong random secret (e.g. openssl rand -hex 64)
// Never commit the real secret. Keep this value unique per environment.
define('JWT_SECRET', 'REQUIRED_GENERATE_A_STRONG_RANDOM_SECRET');

// CORS settings
define('ALLOWED_ORIGIN', 'https://nhratechservices.com');

// =============================================================================
// Stripe Configuration — DISABLED on NHRATS by default
// Stripe is not used on NHRA Tech Services. These constants are preserved
// for compatibility but should remain as placeholders unless Stripe is
// explicitly re-enabled for NHRATS billing in the future.
// =============================================================================
define('STRIPE_SECRET_KEY', '');
define('STRIPE_WEBHOOK_SECRET', '');

// Stripe Price IDs for subscription plans (not used on NHRATS)
define('STRIPE_PRICE_RACER_MONTHLY', '');
define('STRIPE_PRICE_RACER_YEARLY', '');
define('STRIPE_PRICE_PRO_MONTHLY', '');
define('STRIPE_PRICE_PRO_YEARLY', '');
define('STRIPE_PRICE_TEAM_MONTHLY', '');
define('STRIPE_PRICE_TEAM_YEARLY', '');

// Frontend URL
define('FRONTEND_URL', 'https://nhratechservices.com');
define('STRIPE_SUCCESS_URL', FRONTEND_URL . '/account?checkout=success');
define('STRIPE_CANCEL_URL', FRONTEND_URL . '/account?checkout=canceled');

// =============================================================================
// NHRA Parity — Tempest Weather Stations
// Get station IDs from https://tempestwx.com/ (Settings > Stations > Station ID)
// Get API key from https://tempestwx.com/settings/tokens
//
// Multi-station: list all station IDs comma-separated. The canonical weather
// rebuild cross-validates readings and uses median consensus when stations
// disagree (especially humidity). Stations may be offline independently.
// =============================================================================
define('TEMPEST_STATION_IDS', '');          // Comma-separated station IDs (e.g. '156136,187092,136782')
define('TEMPEST_STATION_ID', '');           // Legacy single station ID (used if TEMPEST_STATION_IDS is empty)
define('TEMPEST_API_KEY', '');              // WeatherFlow personal access token
define('TEMPEST_BUCKET_MINUTES', 30);       // Observation bucketing interval (default 30)

// =============================================================================
// Bootstrap Tools (CLI-only recovery tool)
// Enable only when needed, disable after use.
// =============================================================================
// define('BOOTSTRAP_TOOLS_ENABLED', true);
// define('BOOTSTRAP_SECRET', '');  // Optional: require a secret argument to run

// Error reporting (disable in production)
error_reporting(E_ALL);
ini_set('display_errors', 0);
