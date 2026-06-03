<?php
$renderUrl = 'https://sit-position.onrender.com';
$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
$target = rtrim($renderUrl, '/') . $requestUri;
?>
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>宴会座席抽選</title>
  <style>
    html,
    body {
      margin: 0;
      width: 100%;
      height: 100%;
      background: #f6f3ee;
    }

    iframe {
      display: block;
      width: 100%;
      height: 100dvh;
      border: 0;
    }

    .fallback {
      padding: 24px;
      font-family: "Segoe UI", "Yu Gothic", "Meiryo", sans-serif;
      color: #1f2933;
    }

    .fallback a {
      color: #1677ff;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <iframe src="<?php echo htmlspecialchars($target, ENT_QUOTES, 'UTF-8'); ?>" title="宴会座席抽選"></iframe>
  <noscript>
    <div class="fallback">
      <p>JavaScriptが無効です。以下のリンクから開いてください。</p>
      <p><a href="<?php echo htmlspecialchars($target, ENT_QUOTES, 'UTF-8'); ?>">宴会座席抽選を開く</a></p>
    </div>
  </noscript>
</body>
</html>
