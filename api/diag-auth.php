<?php
/**
 * Auth Diagnostic Endpoint
 * Safe diagnostics for troubleshooting authorization issues
 * Gated to local/admin access only
 */

require_once 'config.php';
require_once 'functions.php';

// Gated access - only allow from localhost, CLI, or authenticated admin
$remoteAddr = $_SERVER['REMOTE_ADDR'] ?? '';
$isLocal = in_array($remoteAddr, ['127.0.0.1', '::1', 'localhost']) || $remoteAddr === '';
$isCli = php_sapi_name() === 'cli';
$authUser = rsa_getAuthUser();
$isAdmin = $authUser && ($authUser['role'] ?? '') === 'admin';
$isLocal = $isLocal || $isCli;

if (!$isLocal && !$isAdmin) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Diagnostics access denied']);
    exit;
}

// Safe diagnostic output - no secrets, no tokens, no passwords
$diagnostics = [
    'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? 'unknown',
    'php_sapi' => php_sapi_name(),
    'headers_received' => [],
    'auth_header_present' => false,
    'auth_header_source' => null,
    'bearer_prefix_present' => false,
    'token_extracted' => false,
    'user_authenticated' => false,
    'user_id' => null,
    'user_email' => null,
    'user_role' => null,
];

// Check for Authorization header from various sources
$authHeader = '';
if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
    $diagnostics['auth_header_source'] = 'HTTP_AUTHORIZATION';
    $diagnostics['auth_header_present'] = true;
} elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
    $authHeader = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    $diagnostics['auth_header_source'] = 'REDIRECT_HTTP_AUTHORIZATION';
    $diagnostics['auth_header_present'] = true;
} elseif (function_exists('apache_request_headers')) {
    $headers = apache_request_headers();
    $auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    if ($auth) {
        $authHeader = $auth;
        $diagnostics['auth_header_source'] = 'apache_request_headers';
        $diagnostics['auth_header_present'] = true;
    }
}

// Check for Bearer prefix (safe - don't expose the token itself)
if ($authHeader) {
    $diagnostics['bearer_prefix_present'] = (strpos($authHeader, 'Bearer ') === 0);
    
    // Try to extract and verify token (without exposing it)
    if (preg_match('/Bearer\s+(.+)/', $authHeader, $matches)) {
        $token = $matches[1];
        $diagnostics['token_extracted'] = true;
        
        // Verify the token
        $userData = rsa_verifyToken($token);
        if ($userData) {
            $diagnostics['user_authenticated'] = true;
            $diagnostics['user_id'] = $userData['user_id'] ?? null;
            $diagnostics['user_email'] = $userData['email'] ?? null;
            $diagnostics['user_role'] = $userData['role'] ?? null;
        }
    }
}

// List all headers that were received (without values that might contain secrets)
$headerKeys = array_keys(getallheaders());
$diagnostics['headers_received'] = array_map('strtolower', $headerKeys);

// Check JWT configuration (without exposing the actual secret)
$diagnostics['jwt_secret_configured'] = defined('JWT_SECRET') && JWT_SECRET !== '' && JWT_SECRET !== 'default_secret_change_me';

header('Content-Type: application/json');
echo json_encode($diagnostics, JSON_PRETTY_PRINT);
