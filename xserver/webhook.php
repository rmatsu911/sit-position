<?php
$renderUrl = 'https://sit-position.onrender.com';
$endpoint = rtrim($renderUrl, '/') . '/webhook';

$body = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_LINE_SIGNATURE'] ?? '';

$ch = curl_init($endpoint);
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_POSTFIELDS => $body,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HEADER => false,
  CURLOPT_HTTPHEADER => [
    'Content-Type: application/json',
    'X-Line-Signature: ' . $signature,
  ],
  CURLOPT_TIMEOUT => 15,
]);

$response = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);

if ($response === false) {
  http_response_code(502);
  header('Content-Type: text/plain; charset=utf-8');
  echo 'Webhook proxy failed';
  curl_close($ch);
  exit;
}

curl_close($ch);
http_response_code($status ?: 200);
header('Content-Type: text/plain; charset=utf-8');
echo $response;
