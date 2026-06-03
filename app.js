const storageKey = "seatingConfig";
const hostTokenKey = "seatingHostToken";
const drawingDurationMs = 4200;
const frameMs = 95;

const defaultConfig = {
  seatCount: 12,
  members: ["田中太郎", "鈴木花子", "佐藤次郎", "高橋美咲"],
};

let activeAnimation = null;
let currentConfig = sanitizeConfig(defaultConfig);
const serverMode = location.protocol === "http:" || location.protocol === "https:";

function readHostTokenFromUrl() {
  const params = new URLSearchParams(location.search);
  const token = params.get("host");
  if (!token) return;

  localStorage.setItem(hostTokenKey, token);
  params.delete("host");
  const nextSearch = params.toString();
  const nextUrl = `${location.pathname}${nextSearch ? `?${nextSearch}` : ""}${location.hash}`;
  history.replaceState(null, "", nextUrl);
}

function getHostToken() {
  return localStorage.getItem(hostTokenKey) || "";
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

function loadLocalConfig() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return { ...defaultConfig, members: [...defaultConfig.members] };

  try {
    return sanitizeConfig(JSON.parse(raw));
  } catch (error) {
    console.warn("座席設定の読み込みに失敗しました", error);
    return { ...defaultConfig, members: [...defaultConfig.members] };
  }
}

function saveLocalConfig(config) {
  localStorage.setItem(storageKey, JSON.stringify(sanitizeConfig(config)));
}

async function requestJson(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const hostToken = getHostToken();
  if (hostToken) headers["X-Host-Token"] = hostToken;

  const response = await fetch(path, {
    headers,
    ...options,
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function loadConfig() {
  if (!serverMode) return loadLocalConfig();

  try {
    const state = await requestJson("/api/state");
    return sanitizeConfig(state.config);
  } catch (error) {
    console.warn("サーバー設定の読み込みに失敗しました", error);
    return loadLocalConfig();
  }
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

function buildDisplayCandidates(config) {
  const members = config.members.slice(0, config.seatCount);
  const emptyCount = Math.max(0, config.seatCount - members.length);
  return [...members, ...Array.from({ length: emptyCount }, () => null)];
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

function getPresetSeatNames(config) {
  return config.seats.map((seat) => seat.fixedMember || null);
}

function createSeatCard(seat, index, name, state = "waiting") {
  const card = document.createElement("article");
  card.className = `card card-${state}`;

  const head = document.createElement("div");
  head.className = "seat-card-head";

  const number = document.createElement("span");
  number.className = "seat-number";
  number.textContent = String(index).padStart(2, "0");

  const title = document.createElement("h2");
  title.className = "seat-title";
  title.textContent = seat?.label || `席 ${index}`;

  head.append(number, title);

  const label = document.createElement("p");
  label.className = "seat-person";
  label.textContent = name || (state === "empty" ? "空席" : "?");

  const desc = document.createElement("span");
  desc.className = "seat-state";
  if (state === "drawing") desc.textContent = "抽選中";
  if (state === "empty") desc.textContent = "空き";
  if (state === "fixed") desc.textContent = "決定";
  if (state === "preset") desc.textContent = "固定済み";
  if (state === "waiting") desc.textContent = "待機中";

  card.append(head, label, desc);
  return card;
}

function renderSeats(seats, state = "waiting", config = currentConfig) {
  const container = document.getElementById("seatGrid");
  if (!container) return;

  container.innerHTML = "";
  seats.forEach((name, index) => {
    const isPreset = state === "waiting" && config.seats[index]?.fixedMember;
    const seatState = state === "fixed" && !name ? "empty" : isPreset ? "preset" : state;
    container.appendChild(createSeatCard(config.seats[index], index + 1, name, seatState));
  });
}

function updateStatus(text) {
  const status = document.getElementById("statusText");
  if (status) status.textContent = text;
}

function updateAdminStatus(text) {
  const status = document.getElementById("adminStatus");
  if (status) status.textContent = text;
}

function stopAnimation() {
  if (activeAnimation) {
    clearInterval(activeAnimation);
    activeAnimation = null;
  }
}

function animateDrawing(payload) {
  stopAnimation();

  const config = sanitizeConfig(payload.config || currentConfig);
  const finalSeats = Array.isArray(payload.finalSeats)
    ? payload.finalSeats
    : composeSeatNames(config, shuffle(buildOpenCandidates(config)));
  const seed = Number(payload.seed) || Date.now();
  const startedAt = Number(payload.startedAt) || Date.now();
  const candidates = buildDisplayCandidates(config);
  const frameCount = Math.max(1, Math.ceil(drawingDurationMs / frameMs));

  updateStatus("抽選中... 席がどんどん入れ替わっています");

  activeAnimation = setInterval(() => {
    const elapsed = Date.now() - startedAt;
    const frame = Math.max(0, Math.floor(elapsed / frameMs));

    if (elapsed >= drawingDurationMs) {
      stopAnimation();
      renderSeats(finalSeats, "fixed");
      updateStatus("抽選結果が決定しました。接続中の画面にも同じ結果が表示されています。");
      return;
    }

    const random = createSeededRandom(seed + frame * 101);
    const visibleSeats = shuffle(candidates, random);
    renderSeats(visibleSeats, "drawing", config);

    if (frame >= frameCount) {
      stopAnimation();
      renderSeats(finalSeats, "fixed");
    }
  }, frameMs);
}

async function renderMainPage() {
  currentConfig = await loadConfig();
  stopAnimation();
  renderSeats(getPresetSeatNames(currentConfig), "waiting", currentConfig);
  updateStatus(`${currentConfig.members.length}名のメンバーを読み込みました。席数: ${currentConfig.seatCount}、固定席: ${getFixedMembers(currentConfig).length}`);
}

async function startDrawing() {
  if (serverMode) {
    try {
      const state = await requestJson("/api/draw", { method: "POST" });
      animateDrawing(state.drawing);
      return;
    } catch (error) {
      console.warn("サーバー抽選に失敗しました", error);
      if (error.message.startsWith("403")) return;
      updateStatus("サーバー抽選に失敗しました。通信状況を確認してください。");
      return;
    }
  }

  const config = loadLocalConfig();
  const finalSeats = composeSeatNames(config, shuffle(buildOpenCandidates(config)));
  animateDrawing({ config, finalSeats, seed: Date.now(), startedAt: Date.now() });
}

function subscribeMainEvents() {
  if (!serverMode || !window.EventSource) return;

  const source = new EventSource("/api/events");
  source.addEventListener("state", (event) => {
    const state = JSON.parse(event.data);
    currentConfig = sanitizeConfig(state.config);
    if (state.drawing && Date.now() - state.drawing.startedAt < drawingDurationMs + 1000) {
      animateDrawing(state.drawing);
    } else {
      renderSeats(getPresetSeatNames(currentConfig), "waiting", currentConfig);
      updateStatus(`${currentConfig.members.length}名のメンバーを読み込みました。席数: ${currentConfig.seatCount}、固定席: ${getFixedMembers(currentConfig).length}`);
    }
  });

  source.addEventListener("config", (event) => {
    const state = JSON.parse(event.data);
    currentConfig = sanitizeConfig(state.config);
    renderSeats(getPresetSeatNames(currentConfig), "waiting", currentConfig);
    updateStatus("管理者画面の変更を反映しました。抽選開始を待っています。");
  });

  source.addEventListener("drawing", (event) => {
    animateDrawing(JSON.parse(event.data));
  });
}

async function bindMainPage() {
  await renderMainPage();
  subscribeMainEvents();

  document.getElementById("startButton")?.addEventListener("click", startDrawing);
  document.getElementById("refreshButton")?.addEventListener("click", renderMainPage);

  window.addEventListener("storage", (event) => {
    if (event.key === storageKey) renderMainPage();
  });
}

async function bindAdminPage() {
  const seatCountInput = document.getElementById("seatCount");
  const memberNameInput = document.getElementById("memberName");
  const memberList = document.getElementById("memberList");
  const adminSeatGrid = document.getElementById("adminSeatGrid");
  const addMemberButton = document.getElementById("addMemberButton");
  const saveButton = document.getElementById("saveButton");
  const clearButton = document.getElementById("clearButton");

  const config = await loadConfig();
  let currentMembers = [...config.members];
  let seatCount = config.seatCount;
  let currentSeats = [...config.seats];

  function resizeSeats(nextSeatCount) {
    currentSeats = createDefaultSeats(nextSeatCount).map((seat, index) => currentSeats[index] || seat);
  }

  function renderMembers() {
    memberList.innerHTML = "";

    if (currentMembers.length === 0) {
      const emptyMessage = document.createElement("li");
      emptyMessage.textContent = "まだメンバーが登録されていません。";
      emptyMessage.className = "empty-list";
      memberList.appendChild(emptyMessage);
      return;
    }

    currentMembers.forEach((name, index) => {
      const li = document.createElement("li");
      const label = document.createElement("span");
      const removeButton = document.createElement("button");

      label.textContent = name;
      removeButton.textContent = "削除";
      removeButton.type = "button";
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

      li.append(label, removeButton);
      memberList.appendChild(li);
    });
  }

  function renderSeatEditor() {
    if (!adminSeatGrid) return;

    resizeSeats(seatCount);
    adminSeatGrid.innerHTML = "";

    currentSeats.forEach((seat, index) => {
      const card = document.createElement("article");
      const head = document.createElement("div");
      const number = document.createElement("span");
      const title = document.createElement("h3");
      const fixedChip = document.createElement("span");
      const labelGroup = document.createElement("label");
      const fixedGroup = document.createElement("label");
      const labelCaption = document.createElement("span");
      const fixedCaption = document.createElement("span");
      const labelInput = document.createElement("input");
      const select = document.createElement("select");
      const emptyOption = document.createElement("option");

      card.className = `admin-seat-card${seat.fixedMember ? " is-fixed" : ""}`;
      head.className = "admin-seat-head";
      number.className = "admin-seat-number";
      number.textContent = String(index + 1).padStart(2, "0");
      title.textContent = seat.label || `席 ${index + 1}`;
      fixedChip.className = "fixed-chip";
      fixedChip.textContent = seat.fixedMember ? "固定済み" : "未固定";
      head.append(number, title, fixedChip);

      labelGroup.className = "field-stack";
      fixedGroup.className = "field-stack";
      labelCaption.textContent = "席名";
      fixedCaption.textContent = "固定メンバー";

      labelInput.type = "text";
      labelInput.value = seat.label;
      labelInput.setAttribute("aria-label", `席 ${index + 1} の表示名`);
      labelInput.addEventListener("input", () => {
        currentSeats[index] = { ...currentSeats[index], label: labelInput.value };
        title.textContent = labelInput.value.trim() || `席 ${index + 1}`;
      });

      emptyOption.value = "";
      emptyOption.textContent = "固定なし";
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
      select.setAttribute("aria-label", `${seat.label || `席 ${index + 1}`} の固定メンバー`);
      select.addEventListener("change", () => {
        currentSeats[index] = { ...currentSeats[index], fixedMember: select.value };
        renderSeatEditor();
      });

      labelGroup.append(labelCaption, labelInput);
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
    const nextConfig = sanitizeConfig({ seatCount, members: currentMembers, seats: currentSeats });

    if (serverMode) {
      try {
        await requestJson("/api/config", { method: "POST", body: JSON.stringify(nextConfig) });
        updateAdminStatus(`${message} 抽選画面へリアルタイム反映しました。`);
        return;
      } catch (error) {
        console.warn("サーバー保存に失敗しました", error);
        updateAdminStatus("サーバー保存に失敗したため、このブラウザだけに保存しました。");
      }
    }

    saveLocalConfig(nextConfig);
    updateAdminStatus(`${message} HTMLを直接開いているため、同じブラウザ内で反映されます。`);
  }

  seatCountInput.value = seatCount;
  renderMembers();
  renderSeatEditor();

  addMemberButton.addEventListener("click", addMember);
  memberNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") addMember();
  });
  saveButton.addEventListener("click", () => saveAdminConfig());
  seatCountInput.addEventListener("change", () => {
    const nextSeatCount = Number(seatCountInput.value);
    if (!Number.isInteger(nextSeatCount) || nextSeatCount <= 0) {
      seatCountInput.value = seatCount;
      return;
    }

    seatCount = nextSeatCount;
    resizeSeats(seatCount);
    renderSeatEditor();
  });
  clearButton.addEventListener("click", () => {
    if (!confirm("本当に全てのメンバーを削除しますか？")) return;
    currentMembers = [];
    currentSeats = currentSeats.map((seat) => ({ ...seat, fixedMember: "" }));
    renderMembers();
    renderSeatEditor();
    saveAdminConfig("全メンバーを削除しました。");
  });

  updateAdminStatus(serverMode ? "サーバー接続中です。" : "ローカル保存モードです。");
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

  if (!serverMode) {
    saveButton.disabled = true;
    statusEl.textContent = "LINE連携はサーバーモードのみ対応しています。";
    return;
  }

  try {
    const cfg = await requestJson("/api/line-config");
    if (cfg.hasToken) tokenInput.placeholder = "設定済み（変更する場合のみ入力）";
    if (cfg.hasSecret) secretInput.placeholder = "設定済み（変更する場合のみ入力）";
    if (cfg.groupId) groupIdInput.value = cfg.groupId;
    if (cfg.publicUrl) publicUrlInput.value = cfg.publicUrl;
    const modeNote = cfg.imageMode ? "（sharpインストール済み・画像送信対応）" : "（sharp未導入・Flexメッセージで送信）";
    statusEl.textContent = cfg.groupId
      ? `グループID設定済み ${modeNote}`
      : `グループIDが未設定です。BotをLINEグループに追加してください。${modeNote}`;
  } catch (err) {
    statusEl.textContent = `設定の読み込みに失敗しました: ${err.message}`;
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
      statusEl.textContent = `保存しました。グループID: ${result.groupId || "未設定"}`;
    } catch (err) {
      statusEl.textContent = `保存に失敗しました: ${err.message}`;
    }
  });
}

function initPage() {
  readHostTokenFromUrl();
  if (document.getElementById("startButton")) bindMainPage();
  if (document.getElementById("saveButton")) bindAdminPage();
}

document.addEventListener("DOMContentLoaded", initPage);
