<?php
/**
 * Header Diagnostic - Shows what headers the server receives
 * No authentication required - safe output only
 */

header('Content-Type: application/json');

$info = [
    'remote_addr' => $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? 'unknown',
    'request_method' => $_SERVER['REQUEST_METHOD'] ?? 'unknown',
    'php_sapi' => php_sapi_name(),
    'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? 'unknown',
];

// Check for Authorization header via various methods
$authInfo = [
    'http_authorization_set' => isset($_SERVER['HTTP_AUTHORIZATION']),
    'redirect_http_authorization_set' => isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION']),
    'http_authorization_value' => isset($_SERVER['HTTP_AUTHORIZATION']) ? substr($_SERVER['HTTP_AUTHORIZATION'], 0, 20) . '...' : null,
];

// Try apache_request_headers if available
$apacheHeaders = [];
if (function_exists('apache_request_headers')) {
    $headers = apache_request_headers();
    $apacheHeaders = array_keys($headers);
    $authInfo['authorization_in_apache_headers'] = isset($headers['Authorization']) || isset($headers['authorization']);
}

// Check all headers via getallheaders
$allHeaders = [];
if (function_exists('getallheaders')) {
    $allHeaders = array_keys(getallheaders());
}

// Test if Authorization header is passed through
$testResult = [
    'env_vars_related_to_auth' => array_filter(array_keys($_SERVER), function($k) {
        return stripos($k, 'auth') !== false || stripos($k, 'authorization') !== false;
    }),
];

echo json_encode([
    'info' => $info,
    'auth_header_check' => $authInfo,
    'apache_headers_keys' => $apacheHeaders,
    'getallheaders_keys' => $allHeaders,
    'server_auth_vars' => $testResult['env_vars_related_to_auth'],
], JSON_PRETTY_PRINT);
