const crypto = require("crypto");
const https = require("https");
const path = require("path");
const fontkit = require("fontkit");

let sharp;
try {
  sharp = require("sharp");
} catch {
  // Image mode is optional. The app falls back to Flex Messages.
}

let imageFonts;

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escAttr(str) {
  return esc(str).replace(/"/g, "&quot;");
}

function loadImageFonts() {
  if (imageFonts !== undefined) return imageFonts;

  try {
    const fontDir = path.join(__dirname, "node_modules", "@embedpdf", "fonts-jp", "fonts");
    imageFonts = {
      regular: fontkit.openSync(path.join(fontDir, "NotoSansJP-Regular.otf")),
      medium: fontkit.openSync(path.join(fontDir, "NotoSansJP-Medium.otf")),
      bold: fontkit.openSync(path.join(fontDir, "NotoSansJP-Bold.otf")),
      black: fontkit.openSync(path.join(fontDir, "NotoSansJP-Black.otf")),
    };
  } catch (err) {
    console.warn("Japanese image font loading failed:", err.message);
    imageFonts = null;
  }

  return imageFonts;
}

function getImageFont(weight = 400) {
  const fonts = loadImageFonts();
  if (!fonts) return null;
  if (weight >= 850) return fonts.black;
  if (weight >= 650) return fonts.bold;
  if (weight >= 500) return fonts.medium;
  return fonts.regular;
}

function formatNumber(value) {
  return Number(value).toFixed(3).replace(/\.?0+$/g, "");
}

function imageText(text, { x, y, fill, fontSize, fontWeight = 400, anchor = "start" }) {
  const value = String(text || "");
  const font = getImageFont(fontWeight);

  if (!font) {
    const anchorAttr = anchor === "middle" || anchor === "end" ? ` text-anchor="${anchor}"` : "";
    return `<text x="${x}" y="${y}"${anchorAttr} fill="${escAttr(fill)}" font-size="${fontSize}" font-weight="${fontWeight}">${esc(value)}</text>`;
  }

  const run = font.layout(value);
  const scale = fontSize / font.unitsPerEm;
  const width = run.positions.reduce((total, position) => total + position.xAdvance, 0) * scale;
  const baseX = anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x;
  let cursor = 0;
  const paths = [];

  run.glyphs.forEach((glyph, index) => {
    const position = run.positions[index];
    const d = glyph.path.toSVG();
    if (d) {
      const tx = baseX + (cursor + position.xOffset) * scale;
      const ty = y - position.yOffset * scale;
      paths.push(`<path d="${d}" transform="translate(${formatNumber(tx)} ${formatNumber(ty)}) scale(${formatNumber(scale)} -${formatNumber(scale)})" fill="${escAttr(fill)}"/>`);
    }
    cursor += position.xAdvance;
  });

  return paths.join("");
}

function lineRequest(method, apiPath, token, body = null, options = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body), "utf8") : null;
    const hostname = options.hostname || "api.line.me";
    const headers = {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    };

    if (payload) {
      headers["Content-Type"] = "application/json; charset=utf-8";
      headers["Content-Length"] = payload.length;
    }

    const req = https.request(
      { hostname, path: apiPath, method, headers },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          let json = null;
          try {
            json = data ? JSON.parse(data) : null;
          } catch {
            // Keep the raw body for LINE error messages.
          }
          resolve({ status: res.statusCode, body: data, json });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function replyToLine(lineConfig, replyToken, messages) {
  if (!lineConfig.channelAccessToken || !replyToken) return null;
  return lineRequest("POST", "/v2/bot/message/reply", lineConfig.channelAccessToken, {
    replyToken,
    messages: Array.isArray(messages) ? messages : [messages],
  });
}

function pushMessages(lineConfig, to, messages) {
  if (!lineConfig.channelAccessToken || !to) return null;
  return lineRequest("POST", "/v2/bot/message/push", lineConfig.channelAccessToken, {
    to,
    messages: Array.isArray(messages) ? messages : [messages],
  });
}

function getGroupMemberCount(lineConfig, groupId) {
  return lineRequest("GET", `/v2/bot/group/${encodeURIComponent(groupId)}/members/count`, lineConfig.channelAccessToken);
}

async function getGroupMemberIds(lineConfig, groupId) {
  const ids = [];
  let start = "";

  do {
    const query = start ? `?start=${encodeURIComponent(start)}` : "";
    const result = await lineRequest(
      "GET",
      `/v2/bot/group/${encodeURIComponent(groupId)}/members/ids${query}`,
      lineConfig.channelAccessToken
    );
    if (result.status < 200 || result.status >= 300) return result;
    ids.push(...(result.json?.memberIds || []));
    start = result.json?.next || "";
  } while (start);

  return { status: 200, json: { memberIds: ids }, body: JSON.stringify({ memberIds: ids }) };
}

function getGroupMemberProfile(lineConfig, groupId, userId) {
  return lineRequest(
    "GET",
    `/v2/bot/group/${encodeURIComponent(groupId)}/member/${encodeURIComponent(userId)}`,
    lineConfig.channelAccessToken
  );
}

function getUserProfile(lineConfig, userId) {
  return lineRequest("GET", `/v2/bot/profile/${encodeURIComponent(userId)}`, lineConfig.channelAccessToken);
}

function textMessage(text, quickReplyItems = []) {
  const message = { type: "text", text };
  if (quickReplyItems.length) {
    message.quickReply = { items: quickReplyItems };
  }
  return message;
}

function quickReply(label, data, displayText = label) {
  return {
    type: "action",
    action: {
      type: "postback",
      label,
      data,
      displayText,
    },
  };
}

function buildSetupQuickReply() {
  return [
    quickReply("メンバー取得", "action=collectMembers"),
    quickReply("参加", "action=joinLottery"),
    quickReply("確定", "action=confirmLottery"),
    quickReply("抽選開始", "action=startLottery"),
  ];
}

function postbackButton(label, data, style = "secondary", displayText = label) {
  const action = {
    type: "postback",
    label,
    data,
  };
  if (displayText) action.displayText = displayText;

  return {
    type: "button",
    style,
    height: "sm",
    action,
  };
}

function uriButton(label, uri) {
  return {
    type: "button",
    style: "link",
    height: "sm",
    action: {
      type: "uri",
      label,
      uri,
    },
  };
}

function buildSetupPanel({ memberCount = 0, totalCount = 0, sessionUrl = "", adminUrl = "", note = "" } = {}) {
  const summary = totalCount
    ? `登録 ${memberCount}名 / グループ ${totalCount}名`
    : `登録 ${memberCount}名`;
  const actions = [
    postbackButton("幹事に設定", "action=setup", "secondary", "抽選設定"),
    postbackButton("参加する", "action=joinLottery", "primary", "参加しました"),
    postbackButton("メンバー取得", "action=collectMembers"),
    postbackButton("確定してURL作成", "action=confirmLottery"),
    postbackButton("抽選開始", "action=startLottery"),
    postbackButton("リセット", "action=resetLottery"),
    postbackButton("設定リセット", "action=resetSettings"),
  ];

  if (sessionUrl) actions.splice(3, 0, uriButton("抽選画面を開く", sessionUrl));
  if (adminUrl) actions.push(uriButton("管理画面を開く", adminUrl));

  return {
    type: "flex",
    altText: "座席抽選 操作パネル",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#245c4f",
        paddingAll: "16px",
        contents: [
          { type: "text", text: "座席抽選", color: "#ffffff", weight: "bold", size: "xl" },
          { type: "text", text: "操作パネル", color: "#d8efe7", size: "sm", margin: "xs" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        paddingAll: "16px",
        backgroundColor: "#fffdf8",
        contents: [
          { type: "text", text: summary, color: "#17212b", weight: "bold", size: "md" },
          { type: "text", text: note || "参加者は「参加する」を押してください。管理者は人数確認後に確定します。", color: "#697586", size: "sm", wrap: true },
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            margin: "md",
            contents: actions,
          },
        ],
      },
    },
  };
}

function buildSeatSVG(config, finalSeats) {
  const total = finalSeats.length;
  const fixedSet = new Set(config.seats.filter((seat) => seat.fixedMember).map((seat) => seat.fixedMember));
  const cols = total <= 6 ? 2 : total <= 12 ? 3 : 4;
  const rows = Math.ceil(total / cols);
  const cardW = 218;
  const cardH = 82;
  const gap = 10;
  const pad = 22;
  const headerH = 62;
  const bodyW = cols * cardW + (cols - 1) * gap;
  const width = bodyW + pad * 2;
  const height = headerH + pad + rows * cardH + Math.max(0, rows - 1) * gap + pad;
  const now = new Date();
  const ts = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const cards = finalSeats.map((name, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = pad + col * (cardW + gap);
    const y = headerH + pad + row * (cardH + gap);
    const seat = config.seats[index] || { label: `席 ${index + 1}` };
    const isFixed = !!(name && fixedSet.has(name));
    const isEmpty = !name;
    const display = name || "空席";
    const chipText = isFixed ? "固定" : isEmpty ? "空席" : "抽選";
    const chipFill = isFixed ? "#245c4f" : isEmpty ? "#8a8176" : "#b56b2a";
    const nameFill = isEmpty ? "#9b948c" : "#17212b";
    const nameFont = display.length > 8 ? 14 : display.length > 5 ? 17 : 21;

    return `
<rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="8" fill="#fffdf8" stroke="#e3ddd2"/>
<rect x="${x + 10}" y="${y + 10}" width="28" height="28" rx="7" fill="#efe8dc"/>
${imageText(String(index + 1).padStart(2, "0"), { x: x + 24, y: y + 29, anchor: "middle", fill: "#64594b", fontSize: 11, fontWeight: 800 })}
${imageText(seat.label, { x: x + 46, y: y + 29, fill: "#697586", fontSize: 12, fontWeight: 700 })}
${imageText(display, { x: x + 12, y: y + 64, fill: nameFill, fontSize: nameFont, fontWeight: 850 })}
<rect x="${x + cardW - 52}" y="${y + 10}" width="40" height="20" rx="10" fill="${chipFill}" opacity="0.13"/>
${imageText(chipText, { x: x + cardW - 32, y: y + 24, anchor: "middle", fill: chipFill, fontSize: 11, fontWeight: 800 })}`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<style>text{font-family:"Yu Gothic","Meiryo","Hiragino Kaku Gothic ProN","Noto Sans CJK JP",sans-serif}</style>
<rect width="${width}" height="${height}" fill="#f5f2ec"/>
${imageText("座席抽選 結果", { x: pad, y: 39, fill: "#17212b", fontSize: 23, fontWeight: 900 })}
${imageText(ts, { x: width - pad, y: 39, anchor: "end", fill: "#697586", fontSize: 12, fontWeight: 500 })}
<line x1="${pad}" y1="55" x2="${width - pad}" y2="55" stroke="#e3ddd2"/>
${cards}
</svg>`;
}

async function generateSeatPng(config, finalSeats) {
  if (!sharp) throw new Error("sharp is not installed.");
  return sharp(Buffer.from(buildSeatSVG(config, finalSeats), "utf8")).png({ compressionLevel: 7 }).toBuffer();
}

function buildFlexMessage(config, finalSeats) {
  const rows = finalSeats.map((name, index) => ({
    type: "box",
    layout: "horizontal",
    paddingAll: "8px",
    backgroundColor: index % 2 === 0 ? "#fffdf8" : "#f7f2ea",
    contents: [
      { type: "text", text: String(index + 1).padStart(2, "0"), size: "xs", color: "#697586", weight: "bold", flex: 0 },
      { type: "text", text: config.seats[index]?.label || `席 ${index + 1}`, size: "xs", color: "#697586", margin: "md", flex: 2 },
      { type: "text", text: name || "空席", size: "sm", color: name ? "#17212b" : "#9b948c", weight: "bold", align: "end", flex: 3, wrap: true },
    ],
  }));

  return {
    type: "flex",
    altText: `座席抽選 結果 (${finalSeats.filter(Boolean).length}名)`,
    contents: {
      type: "bubble",
      size: "giga",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#245c4f",
        paddingAll: "16px",
        contents: [
          { type: "text", text: "座席抽選 結果", weight: "bold", size: "lg", color: "#ffffff" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "0px",
        contents: rows,
      },
    },
  };
}

async function pushToLine(lineConfig, config, finalSeats, imageUrl) {
  const { channelAccessToken, groupId } = lineConfig;
  if (!channelAccessToken || !groupId) return null;
  const message = imageUrl
    ? { type: "image", originalContentUrl: imageUrl, previewImageUrl: imageUrl }
    : buildFlexMessage(config, finalSeats);
  return pushMessages(lineConfig, groupId, message);
}

function verifySignature(rawBody, signature, secret) {
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(String(signature), "utf8");
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

module.exports = {
  buildSetupQuickReply,
  buildSeatSVG,
  buildSetupPanel,
  generateSeatPng,
  buildFlexMessage,
  getGroupMemberCount,
  getGroupMemberIds,
  getGroupMemberProfile,
  getUserProfile,
  isImageModeAvailable: () => !!sharp,
  pushMessages,
  pushToLine,
  quickReply,
  replyToLine,
  textMessage,
  verifySignature,
};
