<?php
$renderUrl = 'https://sit-position.onrender.com';
$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
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
    if (!in_array($lower, ['host', 'connection', 'content-length'], true)) {
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
  if (
    $header === '' ||
    stripos($header, 'HTTP/') === 0 ||
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
