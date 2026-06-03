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
const drawingDurationMs = 4200;

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
};
let cachedResultPng = null;

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
  return request.headers["x-host-token"] === hostToken;
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

  const blockedFiles = new Set([".host-token", "seating-data.json", "line-config.json", "localtunnel.log", "localtunnel.err.log"]);
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
    if (state.drawing && Date.now() - state.drawing.startedAt > drawingDurationMs + 5000) {
      state.drawing = null;
    }
    sendJson(response, 200, state);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/events") {
    serveEvents(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/config") {
    try {
      const nextConfig = sanitizeConfig(JSON.parse(await readBody(request)));
      state = { config: nextConfig, drawing: null };
      saveStoredConfig(nextConfig);
      broadcast("config", state);
      sendJson(response, 200, state);
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/draw") {
    if (!isHostRequest(request)) {
      sendJson(response, 403, { error: "Host only" });
      return;
    }

    state.drawing = createDrawing();
    broadcast("drawing", state.drawing);
    sendJson(response, 200, state);
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
      publicUrl: cfg.publicUrl,
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
        saveLineConfig({ ...currentCfg, groupId: event.source.groupId });
        console.log(`LINE group ID auto-detected: ${event.source.groupId}`);
      }
      break;
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
