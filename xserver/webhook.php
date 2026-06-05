<?php
$renderUrl = 'https://sit-position.onrender.com';
$proxyAdminSecret = 'sit-position-proxy-admin-v1';
$endpoint = rtrim($renderUrl, '/') . '/webhook';
$lineChannelAccessToken = '';
$lineChannelSecret = '';
$lineGroupId = '';
$linePublicUrl = 'https://xxxtrw77777.xsrv.jp';
$lineSecretsFile = __DIR__ . '/line-secrets.php';

if (is_file($lineSecretsFile)) {
  require $lineSecretsFile;
}

function clean_header_value($value) {
  return str_replace(["\r", "\n"], '', (string) $value);
}

$body = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_LINE_SIGNATURE'] ?? '';

$headers = [
  'Content-Type: application/json',
  'X-Line-Signature: ' . clean_header_value($signature),
];

if (!empty($lineChannelAccessToken) && !empty($lineChannelSecret)) {
  $headers[] = 'X-Line-Config-Proxy: ' . clean_header_value($proxyAdminSecret);
  $headers[] = 'X-Line-Channel-Access-Token: ' . clean_header_value($lineChannelAccessToken);
  $headers[] = 'X-Line-Channel-Secret: ' . clean_header_value($lineChannelSecret);
  $headers[] = 'X-Line-Public-Url: ' . clean_header_value($linePublicUrl);
  if (!empty($lineGroupId)) {
    $headers[] = 'X-Line-Group-Id: ' . clean_header_value($lineGroupId);
  }
}

$ch = curl_init($endpoint);
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_POSTFIELDS => $body,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HEADER => false,
  CURLOPT_HTTPHEADER => $headers,
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
