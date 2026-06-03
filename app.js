const storageKey = "seatingConfig";
const hostTokenKey = "seatingHostToken";
const drawingDurationMs = 4200;
const frameMs = 95;
const pollMs = 1500;

const defaultConfig = {
  seatCount: 12,
  members: ["田中太郎", "鈴木花子", "佐藤次郎", "高橋美咲"],
};

let activeAnimation = null;
let pollTimer = null;
let currentConfig = sanitizeConfig(defaultConfig);
let lastRenderedDrawingSeed = null;

const serverMode = location.protocol === "http:" || location.protocol === "https:";

function readHostTokenFromUrl() {
  const params = new URLSearchParams(location.search);
  const token = params.get("host");
  if (!token) return;

  localStorage.setItem(hostTokenKey, token);
  params.delete("host");
  const nextSearch = params.toString();
  history.replaceState(null, "", `${location.pathname}${nextSearch ? `?${nextSearch}` : ""}${location.hash}`);
}

function getHostToken() {
  return localStorage.getItem(hostTokenKey) || "";
}

function getSessionId() {
  return new URLSearchParams(location.search).get("session") || "";
}

function createDefaultSeats(seatCount) {
  return Array.from({ length: seatCount }, (_, index) => ({
    label: `席 ${index + 1}`,
    fixedMember: "",
  }));
}

function sanitizeConfig(config) {
  const seatCount = Number(config?.seatCount);
  const members = Array.isArray(config?.members)
    ? config.members.map((name) => String(name).trim()).filter(Boolean)
    : [];
  const normalizedSeatCount = Number.isInteger(seatCount) && seatCount > 0 ? seatCount : defaultConfig.seatCount;
  const sourceSeats = Array.isArray(config?.seats) ? config.seats : [];
  const usedFixedMembers = new Set();
  const seats = createDefaultSeats(normalizedSeatCount).map((seat, index) => {
    const sourceSeat = sourceSeats[index] || {};
    const label = String(sourceSeat.label || seat.label).trim() || seat.label;
    const fixedMember = String(sourceSeat.fixedMember || "").trim();
    const canUseFixedMember = fixedMember && members.includes(fixedMember) && !usedFixedMembers.has(fixedMember);
    if (canUseFixedMember) usedFixedMembers.add(fixedMember);
    return { label, fixedMember: canUseFixedMember ? fixedMember : "" };
  });

  return { seatCount: normalizedSeatCount, members, seats };
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

function buildDisplayCandidates(config) {
  const members = config.members.slice(0, config.seatCount);
  const emptyCount = Math.max(0, config.seatCount - members.length);
  return [...members, ...Array.from({ length: emptyCount }, () => null)];
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

async function requestJson(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const hostToken = getHostToken();
  if (hostToken) headers["X-Host-Token"] = hostToken;

  const response = await fetch(path, { headers, ...options });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function stopAnimation() {
  if (activeAnimation) {
    clearInterval(activeAnimation);
    activeAnimation = null;
  }
}

function updateStatus(text) {
  const status = document.getElementById("statusText");
  if (status) status.textContent = text;
}

function updateAdminStatus(text) {
  const status = document.getElementById("adminStatus");
  if (status) status.textContent = text;
}

function setStatusTone(tone) {
  const panel = document.querySelector(".viewer-panel");
  if (!panel) return;
  panel.dataset.tone = tone;
}

function createSeatCard(seat, index, name, state = "waiting") {
  const card = document.createElement("article");
  card.className = `seat-card seat-card-${state}`;

  const meta = document.createElement("div");
  meta.className = "seat-meta";

  const number = document.createElement("span");
  number.className = "seat-number";
  number.textContent = String(index).padStart(2, "0");

  const title = document.createElement("h2");
  title.className = "seat-title";
  title.textContent = seat?.label || `席 ${index}`;
  meta.append(number, title);

  const person = document.createElement("p");
  person.className = "seat-person";
  person.textContent = name || (state === "empty" ? "空席" : "未発表");

  const badge = document.createElement("span");
  badge.className = "seat-badge";
  const labels = {
    waiting: "待機中",
    drawing: "抽選中",
    fixed: "決定",
    empty: "空席",
  };
  badge.textContent = labels[state] || "待機中";

  card.append(meta, person, badge);
  return card;
}

function renderSeats(config, names, state = "waiting") {
  const container = document.getElementById("seatGrid");
  if (!container) return;

  container.innerHTML = "";
  config.seats.forEach((seat, index) => {
    const name = Array.isArray(names) ? names[index] : null;
    const seatState = state === "fixed" && !name ? "empty" : state;
    container.appendChild(createSeatCard(seat, index + 1, name, seatState));
  });
}

function renderWaitingSeats(config) {
  renderSeats(config, Array.from({ length: config.seatCount }, () => null), "waiting");
}

function animateDrawing(payload, force = false) {
  const config = sanitizeConfig(payload.config || currentConfig);
  const finalSeats = Array.isArray(payload.finalSeats) ? payload.finalSeats : [];
  const seed = Number(payload.seed) || Date.now();
  const startedAt = Number(payload.startedAt) || Date.now();
  const elapsedNow = Date.now() - startedAt;

  currentConfig = config;

  if (!force && lastRenderedDrawingSeed === seed && elapsedNow > drawingDurationMs) {
    renderSeats(config, finalSeats, "fixed");
    setStatusTone("done");
    updateStatus("抽選結果が表示されています。");
    return;
  }

  lastRenderedDrawingSeed = seed;
  stopAnimation();

  if (elapsedNow >= drawingDurationMs) {
    renderSeats(config, finalSeats, "fixed");
    setStatusTone("done");
    updateStatus("抽選結果が表示されています。");
    return;
  }

  const candidates = buildDisplayCandidates(config);
  setStatusTone("active");
  updateStatus("抽選中です。画面をそのままお待ちください。");

  activeAnimation = setInterval(() => {
    const elapsed = Date.now() - startedAt;
    if (elapsed >= drawingDurationMs) {
      stopAnimation();
      renderSeats(config, finalSeats, "fixed");
      setStatusTone("done");
      updateStatus("抽選結果が表示されています。");
      return;
    }

    const frame = Math.max(0, Math.floor(elapsed / frameMs));
    const random = createSeededRandom(seed + frame * 101);
    renderSeats(config, shuffle(candidates, random), "drawing");
  }, frameMs);
}

function syncPublicState(state, force = false) {
  const sessionId = getSessionId();
  const session = state.session;
  currentConfig = sanitizeConfig(state.config);

  if (!sessionId) {
    stopAnimation();
    setStatusTone("waiting");
    updateStatus("管理者が抽選画面を作成すると、参加者用URLが発行されます。");
    renderWaitingSeats(currentConfig);
    return;
  }

  if (!session || session.id !== sessionId) {
    stopAnimation();
    setStatusTone("warning");
    updateStatus("この抽選画面は現在有効ではありません。管理者から最新URLを受け取ってください。");
    renderWaitingSeats(currentConfig);
    return;
  }

  if (state.drawing) {
    animateDrawing(state.drawing, force);
    return;
  }

  stopAnimation();
  lastRenderedDrawingSeed = null;
  setStatusTone("ready");
  updateStatus("抽選開始を待っています。固定席の内容は開始まで表示されません。");
  renderWaitingSeats(currentConfig);
}

async function fetchState() {
  return requestJson("/api/state");
}

async function renderMainPage(force = false) {
  try {
    const state = await fetchState();
    syncPublicState(state, force);
  } catch (error) {
    setStatusTone("warning");
    updateStatus("サーバーに接続できません。通信状況を確認してください。");
  }
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => renderMainPage(false), pollMs);
}

async function bindMainPage() {
  await renderMainPage(true);
  startPolling();
  document.getElementById("refreshButton")?.addEventListener("click", () => renderMainPage(true));
}

async function bindAdminPage() {
  const seatCountInput = document.getElementById("seatCount");
  const memberNameInput = document.getElementById("memberName");
  const memberList = document.getElementById("memberList");
  const adminSeatGrid = document.getElementById("adminSeatGrid");
  const addMemberButton = document.getElementById("addMemberButton");
  const saveButton = document.getElementById("saveButton");
  const clearButton = document.getElementById("clearButton");
  const createSessionButton = document.getElementById("createSessionButton");
  const adminStartButton = document.getElementById("adminStartButton");
  const publicUrlInput = document.getElementById("publicUrl");
  const copyPublicUrlButton = document.getElementById("copyPublicUrlButton");

  const initialState = await fetchState();
  let currentMembers = [...sanitizeConfig(initialState.config).members];
  let seatCount = sanitizeConfig(initialState.config).seatCount;
  let currentSeats = [...sanitizeConfig(initialState.config).seats];

  function buildConfig() {
    return sanitizeConfig({ seatCount, members: currentMembers, seats: currentSeats });
  }

  function updatePublicUrl(session) {
    publicUrlInput.value = session?.id ? `${location.origin}/?session=${session.id}` : "";
  }

  updatePublicUrl(initialState.session);

  function resizeSeats(nextSeatCount) {
    currentSeats = createDefaultSeats(nextSeatCount).map((seat, index) => currentSeats[index] || seat);
  }

  function renderMembers() {
    memberList.innerHTML = "";
    if (!currentMembers.length) {
      const empty = document.createElement("li");
      empty.className = "empty-list";
      empty.textContent = "メンバーが登録されていません。";
      memberList.appendChild(empty);
      return;
    }

    currentMembers.forEach((name, index) => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      const removeButton = document.createElement("button");
      label.textContent = name;
      removeButton.type = "button";
      removeButton.textContent = "削除";
      removeButton.addEventListener("click", () => {
        const removedName = currentMembers[index];
        currentMembers = currentMembers.filter((_, i) => i !== index);
        currentSeats = currentSeats.map((seat) => ({
          ...seat,
          fixedMember: seat.fixedMember === removedName ? "" : seat.fixedMember,
        }));
        renderMembers();
        renderSeatEditor();
      });
      item.append(label, removeButton);
      memberList.appendChild(item);
    });
  }

  function renderSeatEditor() {
    resizeSeats(seatCount);
    adminSeatGrid.innerHTML = "";

    currentSeats.forEach((seat, index) => {
      const card = document.createElement("article");
      card.className = `admin-seat-card${seat.fixedMember ? " is-fixed" : ""}`;

      const head = document.createElement("div");
      head.className = "admin-seat-head";
      const number = document.createElement("span");
      number.className = "admin-seat-number";
      number.textContent = String(index + 1).padStart(2, "0");
      const title = document.createElement("h3");
      title.textContent = seat.label || `席 ${index + 1}`;
      const chip = document.createElement("span");
      chip.className = "fixed-chip";
      chip.textContent = seat.fixedMember ? "固定あり" : "未固定";
      head.append(number, title, chip);

      const labelGroup = document.createElement("label");
      labelGroup.className = "field-stack";
      const labelCaption = document.createElement("span");
      labelCaption.textContent = "席名";
      const labelInput = document.createElement("input");
      labelInput.type = "text";
      labelInput.value = seat.label;
      labelInput.addEventListener("input", () => {
        currentSeats[index] = { ...currentSeats[index], label: labelInput.value };
        title.textContent = labelInput.value.trim() || `席 ${index + 1}`;
      });
      labelGroup.append(labelCaption, labelInput);

      const fixedGroup = document.createElement("label");
      fixedGroup.className = "field-stack";
      const fixedCaption = document.createElement("span");
      fixedCaption.textContent = "固定メンバー";
      const select = document.createElement("select");
      const emptyOption = document.createElement("option");
      emptyOption.value = "";
      emptyOption.textContent = "固定しない";
      select.appendChild(emptyOption);

      currentMembers.forEach((member) => {
        const option = document.createElement("option");
        const alreadyFixed = currentSeats.some((currentSeat, seatIndex) => {
          return seatIndex !== index && currentSeat.fixedMember === member;
        });
        option.value = member;
        option.textContent = alreadyFixed ? `${member}（他の席で固定中）` : member;
        option.disabled = alreadyFixed;
        select.appendChild(option);
      });

      select.value = currentMembers.includes(seat.fixedMember) ? seat.fixedMember : "";
      select.addEventListener("change", () => {
        currentSeats[index] = { ...currentSeats[index], fixedMember: select.value };
        renderSeatEditor();
      });
      fixedGroup.append(fixedCaption, select);

      card.append(head, labelGroup, fixedGroup);
      adminSeatGrid.appendChild(card);
    });
  }

  function addMember() {
    const name = memberNameInput.value.trim();
    if (!name) return;
    currentMembers.push(name);
    memberNameInput.value = "";
    renderMembers();
    renderSeatEditor();
    memberNameInput.focus();
  }

  async function saveAdminConfig(message = "設定を保存しました。") {
    const parsedSeatCount = Number(seatCountInput.value);
    seatCount = Number.isInteger(parsedSeatCount) && parsedSeatCount > 0 ? parsedSeatCount : seatCount;
    resizeSeats(seatCount);
    const state = await requestJson("/api/config", { method: "POST", body: JSON.stringify(buildConfig()) });
    updatePublicUrl(state.session);
    updateAdminStatus(message);
    return state;
  }

  async function createSession() {
    await saveAdminConfig("設定を保存しました。");
    const state = await requestJson("/api/session", { method: "POST" });
    updatePublicUrl(state.session);
    updateAdminStatus("参加者用URLを作成しました。URLを共有してから抽選を開始してください。");
  }

  async function startDrawing() {
    try {
      await saveAdminConfig("最新設定を保存しました。");
      const state = await requestJson("/api/draw", { method: "POST" });
      updatePublicUrl(state.session);
      updateAdminStatus("抽選を開始しました。参加者画面へ自動反映されます。");
    } catch (error) {
      updateAdminStatus(`抽選開始に失敗しました: ${error.message}`);
    }
  }

  seatCountInput.value = seatCount;
  renderMembers();
  renderSeatEditor();

  addMemberButton.addEventListener("click", addMember);
  memberNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") addMember();
  });
  seatCountInput.addEventListener("change", () => {
    const nextSeatCount = Number(seatCountInput.value);
    if (!Number.isInteger(nextSeatCount) || nextSeatCount <= 0) {
      seatCountInput.value = seatCount;
      return;
    }
    seatCount = nextSeatCount;
    renderSeatEditor();
  });
  saveButton.addEventListener("click", () => saveAdminConfig().catch((error) => updateAdminStatus(`保存に失敗しました: ${error.message}`)));
  createSessionButton.addEventListener("click", () => createSession().catch((error) => updateAdminStatus(`URL作成に失敗しました: ${error.message}`)));
  adminStartButton.addEventListener("click", startDrawing);
  clearButton.addEventListener("click", () => {
    if (!confirm("全てのメンバーを削除しますか？")) return;
    currentMembers = [];
    currentSeats = currentSeats.map((seat) => ({ ...seat, fixedMember: "" }));
    renderMembers();
    renderSeatEditor();
  });
  copyPublicUrlButton.addEventListener("click", async () => {
    if (!publicUrlInput.value) return;
    await navigator.clipboard?.writeText(publicUrlInput.value);
    updateAdminStatus("参加者用URLをコピーしました。");
  });

  updateAdminStatus("管理者画面を読み込みました。");
  bindLineConfig();
}

async function bindLineConfig() {
  const tokenInput = document.getElementById("lineToken");
  const secretInput = document.getElementById("lineSecret");
  const groupIdInput = document.getElementById("lineGroupId");
  const publicUrlInput = document.getElementById("linePublicUrl");
  const saveButton = document.getElementById("saveLineButton");
  const statusEl = document.getElementById("lineStatus");
  if (!saveButton) return;

  try {
    const cfg = await requestJson("/api/line-config");
    if (cfg.hasToken) tokenInput.placeholder = "設定済み（変更する場合のみ入力）";
    if (cfg.hasSecret) secretInput.placeholder = "設定済み（変更する場合のみ入力）";
    if (cfg.groupId) groupIdInput.value = cfg.groupId;
    publicUrlInput.value = cfg.publicUrl || location.origin;
    statusEl.textContent = cfg.imageMode ? "画像送信に対応しています。" : "Flexメッセージで送信します。";
  } catch (error) {
    statusEl.textContent = `LINE設定の読み込みに失敗しました: ${error.message}`;
  }

  saveButton.addEventListener("click", async () => {
    try {
      const result = await requestJson("/api/line-config", {
        method: "POST",
        body: JSON.stringify({
          channelAccessToken: tokenInput.value,
          channelSecret: secretInput.value,
          groupId: groupIdInput.value.trim(),
          publicUrl: publicUrlInput.value.trim(),
        }),
      });
      tokenInput.value = "";
      secretInput.value = "";
      statusEl.textContent = `LINE設定を保存しました。グループID: ${result.groupId || "未設定"}`;
    } catch (error) {
      statusEl.textContent = `LINE設定の保存に失敗しました: ${error.message}`;
    }
  });
}

function initPage() {
  readHostTokenFromUrl();
  if (document.getElementById("seatGrid")) bindMainPage();
  if (document.getElementById("saveButton")) bindAdminPage();
}

document.addEventListener("DOMContentLoaded", initPage);
