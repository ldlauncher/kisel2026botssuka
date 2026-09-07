// LehDev TG Host — клиентская логика сайта.
// Сайт статический (GitHub Pages), поэтому вся "связь" с программой на ПК
// идёт напрямую в Firebase Realtime Database через обычные fetch()-запросы.

const LS_URL_KEY = "lehdev_fb_url";
const LS_SECRET_KEY = "lehdev_fb_secret";
const POLL_INTERVAL_MS = 4000;
const OFFLINE_AFTER_SEC = 20; // если heartbeat старше — считаем комп офлайн

let fbUrl = localStorage.getItem(LS_URL_KEY) || "";
let fbSecret = localStorage.getItem(LS_SECRET_KEY) || "";
let pollTimer = null;

const el = (id) => document.getElementById(id);

function basePath() {
  return `${fbUrl}/${fbSecret}`;
}

function showMainCard(show) {
  el("setupCard").classList.toggle("hidden", show);
  el("mainCard").classList.toggle("hidden", !show);
}

function setConnState(online) {
  const badge = el("connState");
  badge.textContent = online ? "ПК онлайн" : "ПК офлайн / нет данных";
  badge.className = "badge " + (online ? "online" : "offline");
}

// ---------------------------------------------------------------------
// Инициализация
// ---------------------------------------------------------------------

function init() {
  if (fbUrl && fbSecret) {
    el("fbUrl").value = fbUrl;
    el("fbSecret").value = fbSecret;
    showMainCard(true);
    startPolling();
  } else {
    showMainCard(false);
  }

  el("saveConfigBtn").addEventListener("click", () => {
    const url = el("fbUrl").value.trim().replace(/\/$/, "");
    const secret = el("fbSecret").value.trim();
    if (!url || !secret) {
      alert("Заполни оба поля.");
      return;
    }
    fbUrl = url;
    fbSecret = secret;
    localStorage.setItem(LS_URL_KEY, fbUrl);
    localStorage.setItem(LS_SECRET_KEY, fbSecret);
    showMainCard(true);
    startPolling();
  });

  el("changeConfigBtn").addEventListener("click", () => {
    stopPolling();
    showMainCard(false);
  });

  el("screenshotBtn").addEventListener("click", requestScreenshot);
}

// ---------------------------------------------------------------------
// Опрос Firebase
// ---------------------------------------------------------------------

function startPolling() {
  stopPolling();
  fetchStatus();
  pollTimer = setInterval(fetchStatus, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

async function fetchStatus() {
  try {
    const [statusRes, heartbeatRes] = await Promise.all([
      fetch(`${basePath()}/status.json`),
      fetch(`${basePath()}/heartbeat.json`),
    ]);
    const status = await statusRes.json();
    const heartbeat = await heartbeatRes.json();

    const online = heartbeat && (Date.now() / 1000 - heartbeat) < OFFLINE_AFTER_SEC;
    setConnState(!!online);

    if (heartbeat) {
      const d = new Date(heartbeat * 1000);
      el("lastSeen").textContent = "Обновлено: " + d.toLocaleTimeString();
    }

    renderBots(status || {});
  } catch (e) {
    setConnState(false);
    console.error("Ошибка запроса статуса:", e);
  }
}

function renderBots(status) {
  const container = el("botsList");
  const names = Object.keys(status).sort();

  if (names.length === 0) {
    container.innerHTML = `<p class="hint">Боты не найдены (или ПК ещё не отправил данные).</p>`;
    return;
  }

  container.innerHTML = "";
  names.forEach((name) => {
    const running = !!(status[name] && status[name].running);

    const row = document.createElement("div");
    row.className = "bot-row";

    row.innerHTML = `
      <div>
        <span class="bot-name">${escapeHtml(name)}</span>
        <span class="bot-status ${running ? "running" : "stopped"}">
          ${running ? "работает" : "остановлен"}
        </span>
      </div>
      <div class="bot-actions">
        <button data-bot="${escapeHtml(name)}" data-cmd="${running ? "stop" : "start"}"
                class="${running ? "stop-btn" : ""}">
          ${running ? "Остановить" : "Запустить"}
        </button>
      </div>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll("button[data-bot]").forEach((btn) => {
    btn.addEventListener("click", () => sendCommand(btn.dataset.bot, btn.dataset.cmd));
  });
}

async function sendCommand(botName, cmd) {
  try {
    await fetch(`${basePath()}/commands/${encodeURIComponent(botName)}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cmd),
    });
    el("lastSeen").textContent = `Команда "${cmd}" для ${botName} отправлена...`;
    setTimeout(fetchStatus, 2500);
  } catch (e) {
    alert("Не удалось отправить команду: " + e);
  }
}

// ---------------------------------------------------------------------
// Скриншот
// ---------------------------------------------------------------------

async function requestScreenshot() {
  el("shotStatus").textContent = "Запрашиваю скриншот...";
  try {
    await fetch(`${basePath()}/screenshot_request.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "true",
    });
    pollForScreenshot(Date.now());
  } catch (e) {
    el("shotStatus").textContent = "Ошибка запроса: " + e;
  }
}

function pollForScreenshot(requestTime, attempt = 0) {
  if (attempt > 20) {
    el("shotStatus").textContent = "ПК не ответил (офлайн?).";
    return;
  }
  fetch(`${basePath()}/screenshot.json`)
    .then((r) => r.json())
    .then((data) => {
      if (data && data.ts && data.ts * 1000 > requestTime - 3000) {
        el("shotImg").src = "data:image/jpeg;base64," + data.data;
        el("shotImg").style.display = "block";
        el("shotStatus").textContent = "Скриншот получен: " + new Date(data.ts * 1000).toLocaleTimeString();
      } else {
        setTimeout(() => pollForScreenshot(requestTime, attempt + 1), 1500);
      }
    })
    .catch(() => setTimeout(() => pollForScreenshot(requestTime, attempt + 1), 1500));
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

init();
