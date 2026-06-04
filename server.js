const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const line = require("./line");

const port = Number(process.env.PORT) || 3000;
const rootDir = __dirname;
const dataFile = path.join(rootDir, "seating-data.json");
const hostFile = path.join(rootDir, ".host-token");
const lineConfigFile = path.join(rootDir, "line-config.json");
const lineStateFile = path.join(rootDir, "line-state.json");
const drawingDurationMs = 4200;
const proxyAdminSecret = process.env.XSERVER_PROXY_SECRET || "sit-position-proxy-admin-v1";
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || process.env.LINE_PUBLIC_URL || "https://xxxtrw77777.xsrv.jp").replace(/\/$/, "");

const defaultConfig = {
  seatCount: 12,
  members: ["田中太郎", "鈴木花子", "佐藤次郎", "高橋美咲"],
};

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

const hostToken = loadHostToken();

let clients = [];
let state = {
  config: loadStoredConfig(),
  drawing: null,
  session: null,
};
let cachedResultPng = null;
let lineState = loadLineState();
const viewers = new Map();

function loadHostToken() {
  if (process.env.HOST_TOKEN) return process.env.HOST_TOKEN.trim();

  try {
    if (fs.existsSync(hostFile)) {
      const storedToken = fs.readFileSync(hostFile, "utf8").trim();
      if (storedToken) return storedToken;
    }
  } catch (error) {
    console.warn("Failed to read host token.", error);
  }

  const nextToken = crypto.randomBytes(18).toString("hex");
  try {
    fs.writeFileSync(hostFile, `${nextToken}\n`, "utf8");
  } catch (error) {
    console.warn("Failed to save host token.", error);
  }
  return nextToken;
}

function getLocalAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => item.address);
}

function createDefaultSeats(seatCount) {
  return Array.from({ length: seatCount }, (_, index) => ({
    label: `席 ${index + 1}`,
    fixedMember: "",
  }));
}

function sanitizeConfig(config) {
  const seatCount = Number(config && config.seatCount);
  const members = Array.isArray(config && config.members)
    ? config.members.map((name) => String(name).trim()).filter(Boolean)
    : [];
  const normalizedSeatCount = Number.isInteger(seatCount) && seatCount > 0 ? seatCount : defaultConfig.seatCount;
  const sourceSeats = Array.isArray(config && config.seats) ? config.seats : [];
  const usedFixedMembers = new Set();
  const seats = createDefaultSeats(normalizedSeatCount).map((seat, index) => {
    const sourceSeat = sourceSeats[index] || {};
    const label = String(sourceSeat.label || seat.label).trim() || seat.label;
    const fixedMember = String(sourceSeat.fixedMember || "").trim();
    const canUseFixedMember = fixedMember && members.includes(fixedMember) && !usedFixedMembers.has(fixedMember);

    if (canUseFixedMember) usedFixedMembers.add(fixedMember);
    return {
      label,
      fixedMember: canUseFixedMember ? fixedMember : "",
    };
  });

  return {
    seatCount: normalizedSeatCount,
    members,
    seats,
  };
}

function loadStoredConfig() {
  if (!fs.existsSync(dataFile)) {
    return sanitizeConfig(defaultConfig);
  }

  try {
    return sanitizeConfig(JSON.parse(fs.readFileSync(dataFile, "utf8")));
  } catch (error) {
    console.warn("Failed to read seating-data.json. Using defaults.", error);
    return sanitizeConfig(defaultConfig);
  }
}

function saveStoredConfig(config) {
  fs.writeFileSync(dataFile, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function loadLineState() {
  try {
    if (fs.existsSync(lineStateFile)) {
      return JSON.parse(fs.readFileSync(lineStateFile, "utf8"));
    }
  } catch (error) {
    console.warn("Failed to read line-state.json.", error);
  }
  return { groups: {} };
}

function saveLineState() {
  fs.writeFileSync(lineStateFile, `${JSON.stringify(lineState, null, 2)}\n`, "utf8");
}

function getLineGroupState(groupId) {
  if (!lineState.groups[groupId]) {
    lineState.groups[groupId] = {
      groupId,
      adminUserId: "",
      members: [],
      memberCount: 0,
      updatedAt: Date.now(),
    };
  }
  return lineState.groups[groupId];
}

function upsertLineMember(groupId, member) {
  const group = getLineGroupState(groupId);
  const userId = String(member.userId || "").trim();
  const displayName = String(member.displayName || member.name || "").trim();
  if (!userId || !displayName) return group;

  const existing = group.members.find((item) => item.userId === userId);
  if (existing) {
    existing.displayName = displayName;
  } else {
    group.members.push({ userId, displayName });
  }
  group.updatedAt = Date.now();
  saveLineState();
  return group;
}

function lineMembersToConfig(group) {
  const members = group.members.map((member) => member.displayName).filter(Boolean);
  if (!members.length) return null;
  const seatCount = Math.max(state.config.seatCount || members.length, members.length);
  return sanitizeConfig({
    ...state.config,
    seatCount,
    members,
    seats: createDefaultSeats(seatCount),
  });
}

function getSessionUrl() {
  return state.session ? `${publicBaseUrl}/?session=${encodeURIComponent(state.session.id)}` : "";
}

function getAdminUrl() {
  return `${publicBaseUrl}/admin.html?host=sit-position-admin-2026`;
}

function cleanupViewers() {
  const cutoff = Date.now() - 12_000;
  for (const [key, item] of viewers.entries()) {
    if (item.seenAt < cutoff) viewers.delete(key);
  }
}

function registerViewer(request, url) {
  const sessionId = url.searchParams.get("session");
  const viewerId = String(request.headers["x-viewer-id"] || "").trim();
  if (!sessionId || !viewerId) return;
  viewers.set(`${sessionId}:${viewerId}`, { sessionId, seenAt: Date.now() });
}

function getViewCount(sessionId = state.session && state.session.id) {
  cleanupViewers();
  if (!sessionId) return 0;
  let count = 0;
  for (const item of viewers.values()) {
    if (item.sessionId === sessionId) count += 1;
  }
  return count;
}

function buildPublicState() {
  return {
    ...state,
    viewCount: getViewCount(),
  };
}

function loadLineConfig() {
  let fileConfig = {};
  try {
    if (fs.existsSync(lineConfigFile)) {
      fileConfig = JSON.parse(fs.readFileSync(lineConfigFile, "utf8"));
    }
  } catch {
    // ignore
  }
  return {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || fileConfig.channelAccessToken || "",
    channelSecret: process.env.LINE_CHANNEL_SECRET || fileConfig.channelSecret || "",
    groupId: process.env.LINE_GROUP_ID || fileConfig.groupId || "",
    publicUrl: process.env.LINE_PUBLIC_URL || fileConfig.publicUrl || "",
  };
}

function saveLineConfig(config) {
  const safe = {
    channelAccessToken: String(config.channelAccessToken || "").trim(),
    channelSecret: String(config.channelSecret || "").trim(),
    groupId: String(config.groupId || "").trim(),
    publicUrl: String(config.publicUrl || "").trim().replace(/\/$/, ""),
  };
  fs.writeFileSync(lineConfigFile, `${JSON.stringify(safe, null, 2)}\n`, "utf8");
  return safe;
}

async function pushLineNotification(drawing) {
  const lineConfig = loadLineConfig();
  if (!lineConfig.channelAccessToken || !lineConfig.groupId) return;

  // Wait for the lottery animation to finish before sending
  await new Promise((resolve) => setTimeout(resolve, drawingDurationMs + 800));

  let imageUrl = null;
  if (lineConfig.publicUrl && line.isImageModeAvailable()) {
    try {
      if (!cachedResultPng) {
        cachedResultPng = await line.generateSeatPng(drawing.config, drawing.finalSeats);
      }
      imageUrl = `${lineConfig.publicUrl}/api/result-image.png?seed=${drawing.seed}`;
    } catch (err) {
      console.warn("LINE image generation failed:", err.message);
    }
  }

  const result = await line.pushToLine(lineConfig, drawing.config, drawing.finalSeats, imageUrl);
  if (result) console.log(`LINE push: ${result.status} ${result.body}`);
}

async function refreshCachedResultImage(drawing) {
  if (!line.isImageModeAvailable()) {
    cachedResultPng = null;
    return;
  }

  try {
    cachedResultPng = await line.generateSeatPng(drawing.config, drawing.finalSeats);
  } catch (err) {
    cachedResultPng = null;
    console.warn("Result image generation failed:", err.message);
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body is too large"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function createSeededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;

  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function shuffle(array, random = Math.random) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function getFixedMembers(config) {
  return config.seats.map((seat) => seat.fixedMember).filter(Boolean);
}

function buildOpenCandidates(config) {
  const fixedMembers = new Set(getFixedMembers(config));
  const openSeatCount = config.seats.filter((seat) => !seat.fixedMember).length;
  const remainingMembers = config.members.filter((member) => !fixedMembers.has(member)).slice(0, openSeatCount);
  const emptyCount = Math.max(0, openSeatCount - remainingMembers.length);
  return [...remainingMembers, ...Array.from({ length: emptyCount }, () => null)];
}

function composeSeatNames(config, openOrder) {
  let openIndex = 0;
  return config.seats.map((seat) => {
    if (seat.fixedMember) return seat.fixedMember;
    const name = openOrder[openIndex];
    openIndex += 1;
    return name || null;
  });
}

function createDrawing() {
  const seed = Date.now();
  const random = createSeededRandom(seed);
  const finalSeats = composeSeatNames(state.config, shuffle(buildOpenCandidates(state.config), random));

  return {
    config: state.config,
    finalSeats,
    seed,
    startedAt: Date.now(),
  };
}

function isHostRequest(request) {
  return request.headers["x-host-token"] === hostToken ||
    request.headers["x-xserver-admin"] === proxyAdminSecret;
}

function createSession() {
  return {
    id: crypto.randomBytes(8).toString("base64url"),
    createdAt: Date.now(),
  };
}

function broadcast(eventName, payload) {
  const message = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  clients = clients.filter((client) => !client.destroyed);
  clients.forEach((client) => client.write(message));
}

function serveEvents(request, response) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.write("\n");
  clients.push(response);
  broadcastTo(response, "state", state);

  const heartbeat = setInterval(() => {
    if (!response.destroyed) response.write(": ping\n\n");
  }, 25000);

  request.on("close", () => {
    clearInterval(heartbeat);
    clients = clients.filter((client) => client !== response);
  });
}

function broadcastTo(response, eventName, payload) {
  response.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function serveStatic(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const resolvedPath = path.normalize(path.join(rootDir, decodeURIComponent(pathname)));
  const relativePath = path.relative(rootDir, resolvedPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const blockedFiles = new Set([".host-token", "seating-data.json", "line-config.json", "line-state.json", "localtunnel.log", "localtunnel.err.log"]);
  if (blockedFiles.has(path.basename(resolvedPath))) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  fs.readFile(resolvedPath, (error, content) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(content);
  });
}

async function handleApi(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/api/state") {
    registerViewer(request, url);
    sendJson(response, 200, buildPublicState());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/events") {
    serveEvents(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/config") {
    if (!isHostRequest(request)) {
      sendJson(response, 403, { error: "Host only" });
      return;
    }

    try {
      const nextConfig = sanitizeConfig(JSON.parse(await readBody(request)));
      state = { config: nextConfig, drawing: null, session: state.session };
      saveStoredConfig(nextConfig);
      broadcast("config", state);
      sendJson(response, 200, buildPublicState());
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/session") {
    if (!isHostRequest(request)) {
      sendJson(response, 403, { error: "Host only" });
      return;
    }

    state = { ...state, drawing: null, session: createSession() };
    broadcast("session", state);
    sendJson(response, 200, buildPublicState());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/draw") {
    if (!isHostRequest(request)) {
      sendJson(response, 403, { error: "Host only" });
      return;
    }

    if (!state.session) state.session = createSession();
    state.drawing = createDrawing();
    broadcast("drawing", state.drawing);
    sendJson(response, 200, buildPublicState());
    refreshCachedResultImage(state.drawing);
    pushLineNotification(state.drawing).catch((err) =>
      console.warn("LINE notification error:", err.message)
    );
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/result-image.png") {
    if (!cachedResultPng) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("No result image");
      return;
    }
    response.writeHead(200, {
      "Content-Type": "image/png",
      "Content-Length": cachedResultPng.length,
      "Cache-Control": "no-store",
    });
    response.end(cachedResultPng);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/line-config") {
    const cfg = loadLineConfig();
    sendJson(response, 200, {
      hasToken: !!cfg.channelAccessToken,
      hasSecret: !!cfg.channelSecret,
      groupId: cfg.groupId,
      publicUrl: cfg.publicUrl || publicBaseUrl,
      imageMode: line.isImageModeAvailable(),
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/line-config") {
    if (!isHostRequest(request)) {
      sendJson(response, 403, { error: "Host only" });
      return;
    }
    try {
      const incoming = JSON.parse(await readBody(request));
      const current = loadLineConfig();
      const next = saveLineConfig({
        channelAccessToken: incoming.channelAccessToken || current.channelAccessToken,
        channelSecret: incoming.channelSecret || current.channelSecret,
        groupId: incoming.groupId !== undefined ? incoming.groupId : current.groupId,
        publicUrl: incoming.publicUrl !== undefined ? incoming.publicUrl : current.publicUrl,
      });
      sendJson(response, 200, { ok: true, groupId: next.groupId });
    } catch (err) {
      sendJson(response, 400, { error: err.message });
    }
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

function parsePostbackData(data) {
  return Object.fromEntries(new URLSearchParams(String(data || "")));
}

async function getDisplayName(lineConfig, source) {
  if (!source || !source.userId) return "";
  try {
    const result = source.groupId
      ? await line.getGroupMemberProfile(lineConfig, source.groupId, source.userId)
      : await line.getUserProfile(lineConfig, source.userId);
    return result.json?.displayName || "";
  } catch {
    return "";
  }
}

async function registerEventUser(lineConfig, event) {
  const groupId = event.source?.groupId;
  const userId = event.source?.userId;
  if (!groupId || !userId) return null;
  const displayName = await getDisplayName(lineConfig, event.source);
  if (!displayName) return null;
  return upsertLineMember(groupId, { userId, displayName });
}

async function collectGroupMembers(lineConfig, groupId) {
  const group = getLineGroupState(groupId);
  const countResult = await line.getGroupMemberCount(lineConfig, groupId);
  if (countResult.status >= 200 && countResult.status < 300) {
    group.memberCount = Number(countResult.json?.count) || group.memberCount;
  }

  const idsResult = await line.getGroupMemberIds(lineConfig, groupId);
  if (idsResult.status < 200 || idsResult.status >= 300) {
    group.updatedAt = Date.now();
    saveLineState();
    return {
      ok: false,
      group,
      reason: "グループ全員の自動取得はLINE公式アカウントのVerified/Premiumでのみ利用できます。通常アカウントでは、各メンバーが「参加」を押す方式で収集します。",
    };
  }

  for (const userId of idsResult.json.memberIds || []) {
    const profile = await line.getGroupMemberProfile(lineConfig, groupId, userId);
    const displayName = profile.json?.displayName;
    if (displayName) upsertLineMember(groupId, { userId, displayName });
  }

  return { ok: true, group: getLineGroupState(groupId) };
}

function applyLineMembersToLottery(group) {
  const nextConfig = lineMembersToConfig(group);
  if (!nextConfig) return false;
  state = { config: nextConfig, drawing: null, session: state.session || createSession() };
  saveStoredConfig(nextConfig);
  broadcast("config", buildPublicState());
  return true;
}

async function replySetupMenu(lineConfig, event, extraText = "") {
  const group = event.source?.groupId ? getLineGroupState(event.source.groupId) : null;
  const memberText = group ? `現在の収集メンバー: ${group.members.length}名` : "グループ内で操作してください。";
  const text = `${extraText ? `${extraText}\n\n` : ""}座席抽選の設定を開始します。\n${memberText}\n\n「メンバー取得」を試し、取得できない場合は各メンバーが「参加」を押してください。`;
  await line.replyToLine(lineConfig, event.replyToken, line.textMessage(text, line.buildSetupQuickReply()));
}

async function handleCollectMembers(lineConfig, event) {
  const groupId = event.source?.groupId;
  if (!groupId) {
    await line.replyToLine(lineConfig, event.replyToken, line.textMessage("この操作はLINEグループ内で実行してください。"));
    return;
  }

  const group = getLineGroupState(groupId);
  group.adminUserId = event.source.userId || group.adminUserId;
  saveLineState();
  const result = await collectGroupMembers(lineConfig, groupId);
  const latest = getLineGroupState(groupId);
  const message = result.ok
    ? `メンバーを取得しました。現在 ${latest.members.length}名です。`
    : `${result.reason}\n\n現在 ${latest.members.length}名です。未登録の方は「参加」を押してください。`;
  await replySetupMenu(lineConfig, event, message);
}

async function handleJoinLottery(lineConfig, event) {
  const group = await registerEventUser(lineConfig, event);
  if (!group) {
    await line.replyToLine(lineConfig, event.replyToken, line.textMessage("参加登録に失敗しました。グループ内で再度お試しください。"));
    return;
  }
  await line.replyToLine(lineConfig, event.replyToken, line.textMessage(`参加登録しました。現在 ${group.members.length}名です。`, line.buildSetupQuickReply()));
}

async function handleConfirmLottery(lineConfig, event) {
  const groupId = event.source?.groupId;
  const userId = event.source?.userId;
  if (!groupId || !userId) return;
  const group = getLineGroupState(groupId);
  if (group.adminUserId && group.adminUserId !== userId) {
    await line.replyToLine(lineConfig, event.replyToken, line.textMessage("最初に「抽選設定」を開始した方だけが確定できます。"));
    return;
  }
  group.adminUserId = userId;
  saveLineState();

  const applied = applyLineMembersToLottery(group);
  if (!applied) {
    await line.replyToLine(lineConfig, event.replyToken, line.textMessage("メンバーがまだ登録されていません。「参加」または「メンバー取得」を行ってください。", line.buildSetupQuickReply()));
    return;
  }

  const currentLineConfig = loadLineConfig();
  saveLineConfig({ ...currentLineConfig, groupId, publicUrl: currentLineConfig.publicUrl || publicBaseUrl });
  await line.replyToLine(lineConfig, event.replyToken, [
    line.textMessage(`抽選画面を作成しました。\n参加者用URL:\n${getSessionUrl()}\n\n管理者に確認URLを送信します。`, line.buildSetupQuickReply()),
  ]);

  const adminMessage = line.textMessage(`座席抽選の最終確認はこちらです。\n${getAdminUrl()}\n\n確認後、管理画面またはLINEの「抽選開始」から開始できます。`);
  const pushed = await line.pushMessages(lineConfig, userId, adminMessage);
  if (!pushed || pushed.status >= 300) {
    await line.pushMessages(lineConfig, groupId, line.textMessage(`管理者用URLを個別送信できませんでした。Botを友だち追加後に再度お試しください。\n管理者用URL:\n${getAdminUrl()}`));
  }
}

async function handleStartLotteryFromLine(lineConfig, event) {
  const groupId = event.source?.groupId;
  const userId = event.source?.userId;
  if (!groupId || !userId) return;
  const group = getLineGroupState(groupId);
  if (group.adminUserId && group.adminUserId !== userId) {
    await line.replyToLine(lineConfig, event.replyToken, line.textMessage("管理者だけが抽選開始できます。"));
    return;
  }
  if (!state.session) state.session = createSession();
  state.drawing = createDrawing();
  broadcast("drawing", state.drawing);
  refreshCachedResultImage(state.drawing);
  pushLineNotification(state.drawing).catch((err) => console.warn("LINE notification error:", err.message));
  await line.replyToLine(lineConfig, event.replyToken, line.textMessage(`抽選を開始しました。\n現在の表示人数: ${getViewCount()}人`));
}

async function handleLineCommand(lineConfig, event, command) {
  if (command === "抽選設定" || command === "action=setup") {
    if (event.source?.groupId && event.source?.userId) {
      const group = getLineGroupState(event.source.groupId);
      group.adminUserId = event.source.userId;
      saveLineState();
      await registerEventUser(lineConfig, event);
    }
    await replySetupMenu(lineConfig, event);
    return;
  }
  if (command === "参加" || command === "action=joinLottery") return handleJoinLottery(lineConfig, event);
  if (command === "メンバー取得" || command === "action=collectMembers") return handleCollectMembers(lineConfig, event);
  if (command === "確定" || command === "action=confirmLottery") return handleConfirmLottery(lineConfig, event);
  if (command === "抽選開始" || command === "action=startLottery") return handleStartLotteryFromLine(lineConfig, event);
}

async function handleLineWebhook(request, response) {
  const rawBody = await readBody(request);
  const sig = request.headers["x-line-signature"] || "";
  const lineConfig = loadLineConfig();

  if (!line.verifySignature(rawBody, sig, lineConfig.channelSecret)) {
    response.writeHead(401, { "Content-Type": "text/plain" });
    response.end("Unauthorized");
    return;
  }

  response.writeHead(200, { "Content-Type": "text/plain" });
  response.end("OK");

  let events;
  try {
    events = JSON.parse(rawBody).events || [];
  } catch {
    return;
  }

  for (const event of events) {
    if (event.source && event.source.type === "group" && event.source.groupId) {
      const currentCfg = loadLineConfig();
      if (currentCfg.groupId !== event.source.groupId) {
        saveLineConfig({ ...currentCfg, groupId: event.source.groupId, publicUrl: currentCfg.publicUrl || publicBaseUrl });
        console.log(`LINE group ID auto-detected: ${event.source.groupId}`);
      }
    }

    if (event.type === "join" && event.source?.groupId) {
      await line.replyToLine(lineConfig, event.replyToken, line.textMessage("招待ありがとうございます。\n「抽選設定」と送信すると座席抽選を開始できます。"));
      continue;
    }

    if (event.type === "memberJoined" && event.source?.groupId) {
      const groupId = event.source.groupId;
      for (const member of event.joined?.members || []) {
        if (member.userId) {
          const profile = await line.getGroupMemberProfile(lineConfig, groupId, member.userId);
          if (profile.json?.displayName) {
            upsertLineMember(groupId, { userId: member.userId, displayName: profile.json.displayName });
          }
        }
      }
      const group = getLineGroupState(groupId);
      await line.replyToLine(lineConfig, event.replyToken, line.textMessage(`新しいメンバーを記録しました。現在 ${group.members.length}名です。`, line.buildSetupQuickReply()));
      continue;
    }

    if (event.type === "message" && event.message?.type === "text") {
      const command = String(event.message.text || "").trim();
      await handleLineCommand(lineConfig, event, command);
      continue;
    }

    if (event.type === "postback") {
      const params = parsePostbackData(event.postback?.data);
      await handleLineCommand(lineConfig, event, `action=${params.action || ""}`);
      continue;
    }
  }
}

const server = http.createServer((request, response) => {
  if (request.method === "POST" && request.url === "/webhook") {
    handleLineWebhook(request, response).catch((err) => {
      console.warn("Webhook error:", err.message);
      if (!response.headersSent) {
        response.writeHead(500);
        response.end();
      }
    });
    return;
  }

  if (request.url.startsWith("/api/")) {
    handleApi(request, response);
    return;
  }

  serveStatic(request, response);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Seating lottery server: http://localhost:${port}`);
  getLocalAddresses().forEach((address) => console.log(`Mobile viewer URL: http://${address}:${port}`));
  console.log(`Host URL: http://localhost:${port}/?host=${hostToken}`);
  console.log(`LINE Webhook URL: <your-public-url>/webhook`);
  console.log(`LINE image mode: ${line.isImageModeAvailable() ? "available (sharp installed)" : "unavailable (Flex Message fallback)"}`);
  const lineCfg = loadLineConfig();
  console.log(`LINE group ID: ${lineCfg.groupId || "(not configured)"}`);
});
