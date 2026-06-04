<?php
$renderUrl = 'https://sit-position.onrender.com';
$proxyAdminSecret = 'sit-position-proxy-admin-v1';
$adminCookieName = 'sit_position_admin';
$adminCookieValue = hash_hmac('sha256', 'line-admin', $proxyAdminSecret);
$requestUri = $_SERVER['REQUEST_URI'] ?? '/';

function base64url_decode_string($value) {
  $padded = strtr($value, '-_', '+/');
  $padded .= str_repeat('=', (4 - strlen($padded) % 4) % 4);
  return base64_decode($padded, true);
}

function base64url_encode_string($value) {
  return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function verify_admin_token($token, $secret) {
  $parts = explode('.', (string) $token);
  if (count($parts) !== 2) return false;

  [$payload, $signature] = $parts;
  $expected = base64url_encode_string(hash_hmac('sha256', $payload, $secret, true));
  if (!hash_equals($expected, $signature)) return false;

  $json = base64url_decode_string($payload);
  if ($json === false) return false;

  $data = json_decode($json, true);
  if (!is_array($data)) return false;
  if (($data['typ'] ?? '') !== 'line-admin') return false;
  if (!isset($data['exp']) || (int) $data['exp'] < (int) floor(microtime(true) * 1000)) return false;
  return true;
}

if (isset($_GET['admin']) && verify_admin_token((string) $_GET['admin'], $proxyAdminSecret)) {
  setcookie($adminCookieName, $adminCookieValue, [
    'expires' => time() + 60 * 60 * 24 * 30,
    'path' => '/',
    'secure' => true,
    'httponly' => true,
    'samesite' => 'Lax',
  ]);

  $parts = parse_url($requestUri);
  parse_str($parts['query'] ?? '', $query);
  unset($query['admin']);
  $nextQuery = http_build_query($query);
  $nextPath = ($parts['path'] ?? '/') . ($nextQuery ? '?' . $nextQuery : '');
  header('Location: ' . $nextPath, true, 302);
  exit;
}

$isAdmin = isset($_COOKIE[$adminCookieName]) && hash_equals($adminCookieValue, (string) $_COOKIE[$adminCookieName]);
$targetUrl = rtrim($renderUrl, '/') . $requestUri;

$ch = curl_init($targetUrl);
curl_setopt_array($ch, [
  CURLOPT_CUSTOMREQUEST => $_SERVER['REQUEST_METHOD'] ?? 'GET',
  CURLOPT_RETURNTRANSFER => false,
  CURLOPT_HEADER => false,
  CURLOPT_FOLLOWLOCATION => false,
  CURLOPT_TIMEOUT => 120,
  CURLOPT_CONNECTTIMEOUT => 20,
]);

$headers = [];
if (function_exists('getallheaders')) {
  foreach (getallheaders() as $name => $value) {
    $lower = strtolower($name);
    if (!in_array($lower, ['host', 'connection', 'content-length', 'x-host-token', 'x-xserver-admin'], true)) {
      $headers[] = $name . ': ' . $value;
    }
  }
}

$headers[] = 'Host: sit-position.onrender.com';
$headers[] = 'X-Forwarded-Host: ' . ($_SERVER['HTTP_HOST'] ?? 'xxxtrw77777.xsrv.jp');
$headers[] = 'X-Forwarded-Proto: https';

if (!empty($_SERVER['REMOTE_ADDR'])) {
  $headers[] = 'X-Forwarded-For: ' . $_SERVER['REMOTE_ADDR'];
}

if ($isAdmin) {
  $headers[] = 'X-Xserver-Admin: ' . $proxyAdminSecret;
}

if (isset($_SERVER['HTTP_COOKIE'])) {
  curl_setopt($ch, CURLOPT_COOKIE, $_SERVER['HTTP_COOKIE']);
}

if (in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
  $body = file_get_contents('php://input');
  curl_setopt($ch, CURLOPT_POSTFIELDS, $body);

  if (!empty($_SERVER['CONTENT_TYPE'])) {
    $headers[] = 'Content-Type: ' . $_SERVER['CONTENT_TYPE'];
  }
}

curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_HEADERFUNCTION, function ($curl, $headerLine) {
  $header = trim($headerLine);
  if (preg_match('/^HTTP\/\S+\s+(\d+)/', $header, $matches)) {
    http_response_code((int) $matches[1]);
    return strlen($headerLine);
  }

  if (
    $header === '' ||
    stripos($header, 'Transfer-Encoding:') === 0 ||
    stripos($header, 'Connection:') === 0 ||
    stripos($header, 'Content-Length:') === 0 ||
    stripos($header, 'Content-Encoding:') === 0
  ) {
    return strlen($headerLine);
  }

  header($header, false);
  return strlen($headerLine);
});

curl_setopt($ch, CURLOPT_WRITEFUNCTION, function ($curl, $chunk) {
  echo $chunk;
  if (function_exists('ob_flush')) {
    @ob_flush();
  }
  flush();
  return strlen($chunk);
});

$ok = curl_exec($ch);
if ($ok === false) {
  http_response_code(502);
  header('Content-Type: text/plain; charset=utf-8');
  echo 'Render proxy error: ' . curl_error($ch);
}

curl_close($ch);
