const crypto = require("crypto");
const https = require("https");

let sharp;
try {
  sharp = require("sharp");
} catch {
  // Image mode is optional. The app falls back to Flex Messages.
}

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
    postbackButton("参加する", "action=joinLottery", "primary", ""),
    postbackButton("メンバー取得", "action=collectMembers"),
    postbackButton("確定してURL作成", "action=confirmLottery"),
    postbackButton("抽選開始", "action=startLottery"),
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
<text x="${x + 24}" y="${y + 29}" text-anchor="middle" fill="#64594b" font-size="11" font-weight="800">${String(index + 1).padStart(2, "0")}</text>
<text x="${x + 46}" y="${y + 29}" fill="#697586" font-size="12" font-weight="700">${esc(seat.label)}</text>
<text x="${x + 12}" y="${y + 64}" fill="${nameFill}" font-size="${nameFont}" font-weight="850">${esc(display)}</text>
<rect x="${x + cardW - 52}" y="${y + 10}" width="40" height="20" rx="10" fill="${chipFill}" opacity="0.13"/>
<text x="${x + cardW - 32}" y="${y + 24}" text-anchor="middle" fill="${chipFill}" font-size="11" font-weight="800">${chipText}</text>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<style>text{font-family:"Yu Gothic","Meiryo","Hiragino Kaku Gothic ProN","Noto Sans CJK JP",sans-serif}</style>
<rect width="${width}" height="${height}" fill="#f5f2ec"/>
<text x="${pad}" y="39" fill="#17212b" font-size="23" font-weight="900">座席抽選 結果</text>
<text x="${width - pad}" y="39" text-anchor="end" fill="#697586" font-size="12">${ts}</text>
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
  if (!secret || !signature) return !secret;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  return expected === signature;
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
