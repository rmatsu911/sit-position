const crypto = require("crypto");
const https = require("https");

let sharp;
try {
  sharp = require("sharp");
} catch {
  // image mode unavailable; falls back to Flex Message
}

// ── SVG → PNG ────────────────────────────────────

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildSeatSVG(config, finalSeats) {
  const total = finalSeats.length;
  const fixedSet = new Set(
    config.seats.filter((s) => s.fixedMember).map((s) => s.fixedMember)
  );

  const cols = total <= 6 ? 2 : total <= 12 ? 3 : 4;
  const rows = Math.ceil(total / cols);
  const CARD_W = 210;
  const CARD_H = 78;
  const GAP_X = 10;
  const GAP_Y = 10;
  const PAD_X = 20;
  const HEADER_H = 56;
  const PAD_TOP = 14;
  const PAD_BOT = 16;

  const bodyW = cols * CARD_W + (cols - 1) * GAP_X;
  const W = bodyW + PAD_X * 2;
  const H = HEADER_H + PAD_TOP + rows * (CARD_H + GAP_Y) - GAP_Y + PAD_BOT;

  const now = new Date();
  const ts =
    `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}` +
    ` ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  let cards = "";
  finalSeats.forEach((name, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = PAD_X + col * (CARD_W + GAP_X);
    const y = HEADER_H + PAD_TOP + row * (CARD_H + GAP_Y);
    const seat = config.seats[i] || { label: `席 ${i + 1}` };
    const isFixed = !!(name && fixedSet.has(name));
    const isEmpty = !name;
    const display = name || "空席";
    const numStr = String(i + 1).padStart(2, "0");
    const nameFontSize = display.length > 8 ? 13 : display.length > 5 ? 16 : 20;

    const bg = isEmpty ? "#181b1e" : isFixed ? "#182820" : "#1d2024";
    const stroke = isEmpty
      ? "rgba(255,255,255,0.07)"
      : isFixed
      ? "rgba(53,208,167,0.35)"
      : "rgba(255,255,255,0.12)";
    const nameFill = isEmpty ? "#4a4845" : "#f0ece4";
    const chipBg = isFixed
      ? "rgba(53,208,167,0.18)"
      : isEmpty
      ? "rgba(255,255,255,0.05)"
      : "rgba(255,255,255,0.07)";
    const chipFill = isFixed ? "#35d0a7" : "#8a8480";
    const chipTx = isFixed ? "固定" : isEmpty ? "空席" : "抽選";

    cards += `
<rect x="${x}" y="${y}" width="${CARD_W}" height="${CARD_H}" rx="7" fill="${bg}" stroke="${stroke}" stroke-width="1"/>
<rect x="${x + 8}" y="${y + 8}" width="22" height="22" rx="4" fill="rgba(255,255,255,0.07)"/>
<text x="${x + 19}" y="${y + 22.5}" text-anchor="middle" fill="#8a8480" font-size="10" font-weight="700">${numStr}</text>
<text x="${x + 36}" y="${y + 22.5}" fill="#8a8480" font-size="11">${esc(seat.label)}</text>
<text x="${x + 12}" y="${y + 59}" fill="${nameFill}" font-size="${nameFontSize}" font-weight="800">${esc(display)}</text>
<rect x="${x + CARD_W - 47}" y="${y + 8}" width="39" height="17" rx="8" fill="${chipBg}"/>
<text x="${x + CARD_W - 27.5}" y="${y + 20.5}" text-anchor="middle" fill="${chipFill}" font-size="10" font-weight="700">${chipTx}</text>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<style>text{font-family:"Yu Gothic","Meiryo","Hiragino Kaku Gothic ProN","Noto Sans CJK JP",sans-serif}</style>
<rect width="${W}" height="${H}" fill="#111315"/>
<text x="${PAD_X}" y="36" fill="#f0ece4" font-size="19" font-weight="900">宴会座席抽選　結果</text>
<text x="${W - PAD_X}" y="36" text-anchor="end" fill="#8a8480" font-size="12">${ts}</text>
<line x1="${PAD_X}" y1="49" x2="${W - PAD_X}" y2="49" stroke="rgba(255,255,255,0.1)"/>
${cards}
</svg>`;
}

async function generateSeatPng(config, finalSeats) {
  if (!sharp) throw new Error("sharp がインストールされていません。npm install sharp を実行してください。");
  const svg = buildSeatSVG(config, finalSeats);
  return sharp(Buffer.from(svg, "utf8")).png({ compressionLevel: 7 }).toBuffer();
}

// ── Flex Message ─────────────────────────────────

function buildFlexMessage(config, finalSeats) {
  const fixedSet = new Set(
    config.seats.filter((s) => s.fixedMember).map((s) => s.fixedMember)
  );
  const cols = finalSeats.length <= 6 ? 2 : 3;

  const seatBoxes = finalSeats.map((name, i) => {
    const seat = config.seats[i] || { label: `席 ${i + 1}` };
    const isFixed = !!(name && fixedSet.has(name));
    const isEmpty = !name;
    return {
      type: "box",
      layout: "vertical",
      flex: 1,
      paddingAll: "9px",
      backgroundColor: isFixed ? "#182820" : "#1d2024",
      cornerRadius: "7px",
      spacing: "xs",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: String(i + 1).padStart(2, "0"), size: "xxs", color: "#8a8480", weight: "bold", flex: 0 },
            { type: "text", text: seat.label, size: "xxs", color: "#8a8480", margin: "sm", flex: 1 },
            { type: "text", text: isFixed ? "固定" : isEmpty ? "空席" : "抽選", size: "xxs", color: isFixed ? "#35d0a7" : "#8a8480", align: "end", flex: 0 },
          ],
        },
        { type: "text", text: name || "空席", size: "sm", color: isEmpty ? "#555555" : "#f0ece4", weight: "bold", wrap: true },
      ],
    };
  });

  const rowContents = [];
  for (let i = 0; i < seatBoxes.length; i += cols) {
    const row = seatBoxes.slice(i, i + cols);
    while (row.length < cols) {
      row.push({ type: "box", layout: "vertical", flex: 1, contents: [] });
    }
    rowContents.push({ type: "box", layout: "horizontal", spacing: "sm", contents: row });
  }

  const now = new Date();
  const ts =
    `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}` +
    ` ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  return {
    type: "flex",
    altText: `🎲 座席抽選結果 (${finalSeats.filter(Boolean).length}名)`,
    contents: {
      type: "bubble",
      size: "giga",
      header: {
        type: "box",
        layout: "horizontal",
        backgroundColor: "#111315",
        paddingAll: "14px",
        contents: [
          { type: "text", text: "🎲 座席抽選　結果", weight: "bold", size: "lg", color: "#f0ece4", flex: 1 },
          { type: "text", text: ts, size: "xxs", color: "#8a8480", align: "end", gravity: "center" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "12px",
        backgroundColor: "#111315",
        contents: rowContents,
      },
    },
  };
}

// ── LINE API ──────────────────────────────────────

function linePost(apiPath, body, token) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body), "utf8");
    const req = https.request(
      {
        hostname: "api.line.me",
        path: apiPath,
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": payload.length,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function pushToLine(lineConfig, config, finalSeats, imageUrl) {
  const { channelAccessToken, groupId } = lineConfig;
  if (!channelAccessToken || !groupId) return null;

  const message = imageUrl
    ? { type: "image", originalContentUrl: imageUrl, previewImageUrl: imageUrl }
    : buildFlexMessage(config, finalSeats);

  return linePost("/v2/bot/message/push", { to: groupId, messages: [message] }, channelAccessToken);
}

function verifySignature(rawBody, signature, secret) {
  if (!secret || !signature) return !secret; // skip if no secret configured
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  return expected === signature;
}

module.exports = {
  buildSeatSVG,
  generateSeatPng,
  buildFlexMessage,
  pushToLine,
  verifySignature,
  isImageModeAvailable: () => !!sharp,
};
