const state = {
  operatorId: null,
  operatorName: "",
  currentMedia: null,
  currentSessionId: null,
};

const el = {
  operatorName: document.getElementById("operatorName"),
  operatorDni: document.getElementById("operatorDni"),
  btnRegister: document.getElementById("btnRegister"),
  video: document.getElementById("videoPlayer"),
  audio: document.getElementById("audioPlayer"),
  nowPlaying: document.getElementById("nowPlaying"),
  btnPlay: document.getElementById("btnPlay"),
  btnPause: document.getElementById("btnPause"),
  btnStop: document.getElementById("btnStop"),
  btnBack: document.getElementById("btnBack"),
  btnForward: document.getElementById("btnForward"),
  speed: document.getElementById("speed"),
  volume: document.getElementById("volume"),
  timeInfo: document.getElementById("timeInfo"),
  library: document.getElementById("library"),
  stats: document.getElementById("stats"),
  leaders: document.getElementById("leaders"),
  history: document.getElementById("history"),
  mediaForm: document.getElementById("mediaForm"),
  /* v2 refs */
  toastBox: document.getElementById("toastBox"),
  playingDot: document.getElementById("playingDot"),
  progressBar: document.getElementById("progressBar"),
  progressFill: document.getElementById("progressFill"),
  themeToggle: document.getElementById("themeToggle"),
  seedBtn: document.getElementById("seedBtn"),
  exportBtn: document.getElementById("exportBtn"),
  importBtn: document.getElementById("importBtn"),
  importFile: document.getElementById("importFile"),
  /* upload refs */
  uploadZone: document.getElementById("uploadZone"),
  uploadInput: document.getElementById("uploadInput"),
  uploadProgress: document.getElementById("uploadProgress"),
  uploadBar: document.getElementById("uploadBar"),
  uploadStatus: document.getElementById("uploadStatus"),
};

function activePlayer() {
  if (state.currentMedia?.kind === "audio") {
    return el.audio;
  }
  return el.video;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "00:00";
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60).toString().padStart(2, "0");
  const s = (safe % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || "Error en API");
  }
  return data;
}

/* ─── v2 Utility functions ─── */

function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  el.toastBox.appendChild(t);
  t.addEventListener('animationend', () => t.remove());
}

function setPlayingDot(active) {
  el.playingDot.classList.toggle('active', active);
}

function initTheme() {
  const saved = localStorage.getItem('mch-theme');
  if (saved === 'light') {
    document.documentElement.classList.add('light');
    el.themeToggle.textContent = '☀️';
  }
}

function toggleTheme() {
  const isLight = document.documentElement.classList.toggle('light');
  localStorage.setItem('mch-theme', isLight ? 'light' : 'dark');
  el.themeToggle.textContent = isLight ? '☀️' : '🌙';
  showToast(`Tema ${isLight ? 'claro' : 'oscuro'} activado`, 'info');
}

async function registerOperator() {
  const name = el.operatorName.value.trim();
  const dni = el.operatorDni.value.trim();
  const data = await api("/api/operators/register", {
    method: "POST",
    body: JSON.stringify({ name, dni }),
  });

  state.operatorId = data.operatorId;
  state.operatorName = data.name;
  el.nowPlaying.innerHTML = `<span class="playing-dot" id="playingDot"></span>Operador activo: ${data.name} (${data.dni})`;
  showToast(`✅ Operador ${data.name} registrado`, 'ok');
  await refreshStats();
  await refreshLeaders();
  await refreshHistory();
}

function renderLibrary(items) {
  if (!items.length) {
    el.library.innerHTML = "<p class='status-warn'>Sin elementos en biblioteca.</p>";
    return;
  }

  const rows = items
    .map(
      (item) => `
      <tr>
        <td>${item.title}</td>
        <td><span class="badge-kind ${item.kind}">${item.kind === 'audio' ? '🎵' : '🎥'} ${item.kind}</span></td>
        <td>${item.genre || "General"}</td>
        <td>${item.duration_seconds || 0}s</td>
        <td><button data-play='${item.id}'>Cargar</button></td>
      </tr>
    `
    )
    .join("");

  el.library.innerHTML = `
    <table class='list'>
      <thead>
        <tr><th>Título</th><th>Tipo</th><th>Género</th><th>Duración</th><th>Acción</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  const buttons = el.library.querySelectorAll("button[data-play]");
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const item = items.find((entry) => entry.id === Number(button.dataset.play));
      loadMedia(item);
    });
  });
}

async function refreshLibrary() {
  const data = await api("/api/media");
  renderLibrary(data.items);
}

function switchTo(kind) {
  if (kind === "audio") {
    el.video.style.display = "none";
    el.audio.style.display = "block";
    el.video.pause();
  } else {
    el.audio.style.display = "none";
    el.video.style.display = "block";
    el.audio.pause();
  }
}

function bindProgressEvents(player) {
  player.addEventListener("timeupdate", () => {
    const duration = player.duration || 0;
    const current = player.currentTime || 0;
    const pct = duration > 0 ? (current / duration) * 100 : 0;
    el.progressFill.style.width = `${pct}%`;
    el.timeInfo.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
  });

  player.addEventListener("play", () => setPlayingDot(true));
  player.addEventListener("pause", () => setPlayingDot(false));

  player.addEventListener("ended", async () => {
    setPlayingDot(false);
    await endSession(true);
    await pushEvent("ended", { ended: true });
    el.nowPlaying.innerHTML = `<span class="playing-dot" id="playingDot"></span>Reproducción completada`;
    showToast('🎬 Reproducción completada', 'ok');
    await refreshStats();
    await refreshLeaders();
    await refreshHistory();
  });
}

bindProgressEvents(el.video);
bindProgressEvents(el.audio);

async function loadMedia(item) {
  if (!item) return;

  if (state.currentSessionId) {
    await endSession(false);
  }

  state.currentMedia = item;
  switchTo(item.kind);

  const player = activePlayer();
  player.src = item.source_url;
  player.load();
  el.nowPlaying.innerHTML = `<span class="playing-dot" id="playingDot"></span>Cargado: ${item.title} [${item.kind}]`;
  showToast(`📀 ${item.title} cargado`, 'info');

  if (state.operatorId) {
    const session = await api("/api/sessions/start", {
      method: "POST",
      body: JSON.stringify({
        operatorId: state.operatorId,
        mediaItemId: item.id,
      }),
    });
    state.currentSessionId = session.sessionId;
    await pushEvent("load", { title: item.title, kind: item.kind });
    await refreshStats();
  }
}

async function pushEvent(eventType, payload = {}) {
  if (!state.currentSessionId) return;
  const player = activePlayer();
  await api("/api/sessions/event", {
    method: "POST",
    body: JSON.stringify({
      sessionId: state.currentSessionId,
      eventType,
      position: player.currentTime || 0,
      payload,
    }),
  });
}

async function endSession(completed) {
  if (!state.currentSessionId) return;
  const player = activePlayer();
  await api("/api/sessions/end", {
    method: "POST",
    body: JSON.stringify({
      sessionId: state.currentSessionId,
      lastPosition: player.currentTime || 0,
      completed,
    }),
  });
  state.currentSessionId = null;
}

async function refreshStats() {
  const data = await api("/api/stats");
  const stats = data.stats;
  el.stats.innerHTML = `
    <div class='kpi'><strong>Medios</strong><span>${stats.media_total}</span></div>
    <div class='kpi'><strong>Operadores</strong><span>${stats.operators_total}</span></div>
    <div class='kpi'><strong>Sesiones</strong><span>${stats.sessions_total}</span></div>
    <div class='kpi'><strong>Eventos</strong><span>${stats.events_total}</span></div>
  `;
}

async function refreshLeaders() {
  const data = await api("/api/leaderboard");
  if (!data.leaders.length) {
    el.leaders.innerHTML = "<p class='status-warn'>Sin datos aún.</p>";
    return;
  }

  const rows = data.leaders
    .map(
      (row, idx) => {
        const badges = ['gold', 'silver', 'bronze'];
        const rank = idx < 3
          ? `<span class="rank-badge ${badges[idx]}">${idx + 1}</span>`
          : `${idx + 1}`;
        return `
      <tr>
        <td>${rank}</td>
        <td>${row.name}</td>
        <td>${row.total_sessions}</td>
        <td>${row.completions}</td>
        <td>${row.avg_position}</td>
      </tr>
    `;
      }
    )
    .join("");

  el.leaders.innerHTML = `
    <table class='list'>
      <thead><tr><th>#</th><th>Operador</th><th>Sesiones</th><th>Completadas</th><th>Avg Pos.</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function refreshHistory() {
  if (!state.operatorId) {
    el.history.innerHTML = "<p class='status-warn'>Registra un operador para ver historial.</p>";
    return;
  }

  const data = await api(`/api/operators/${state.operatorId}/history?limit=8`);
  if (!data.sessions.length) {
    el.history.innerHTML = "<p class='status-warn'>Sin sesiones para este operador.</p>";
    return;
  }

  const rows = data.sessions
    .map(
      (session) => {
        const comp = session.completed
          ? '<span class="badge-completed yes">✔ Sí</span>'
          : '<span class="badge-completed no">✘ No</span>';
        return `
      <tr>
        <td>${session.title}</td>
        <td><span class="badge-kind ${session.kind}">${session.kind === 'audio' ? '🎵' : '🎥'} ${session.kind}</span></td>
        <td>${session.genre}</td>
        <td>${comp}</td>
        <td>${Number(session.last_position).toFixed(2)}s</td>
      </tr>
    `;
      }
    )
    .join("");

  el.history.innerHTML = `
    <table class='list'>
      <thead><tr><th>Título</th><th>Tipo</th><th>Género</th><th>Completada</th><th>Última pos.</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function play() {
  if (!state.currentMedia) {
    showToast('⚠️ Carga un medio primero', 'warning');
    return;
  }
  const player = activePlayer();
  await player.play();
  setPlayingDot(true);
  await pushEvent("play", { rate: player.playbackRate, volume: player.volume });
  el.nowPlaying.innerHTML = `<span class="playing-dot active" id="playingDot"></span>▶ ${state.currentMedia.title}`;
  showToast('▶ Reproduciendo', 'ok');
}

async function pause() {
  const player = activePlayer();
  player.pause();
  setPlayingDot(false);
  await pushEvent("pause", {});
  el.nowPlaying.innerHTML = `<span class="playing-dot" id="playingDot"></span>⏸ Pausa: ${state.currentMedia?.title || ''}`;
  showToast('⏸ Pausado', 'info');
}

async function stop() {
  const player = activePlayer();
  player.pause();
  player.currentTime = 0;
  setPlayingDot(false);
  el.progressFill.style.width = '0%';
  await pushEvent("stop", {});
  await endSession(false);
  el.nowPlaying.innerHTML = '<span class="playing-dot" id="playingDot"></span>⏹ Detenido';
  showToast('⏹ Detenido', 'info');
  await refreshStats();
  await refreshLeaders();
  await refreshHistory();
}

async function skip(seconds) {
  const player = activePlayer();
  player.currentTime = Math.max(0, (player.currentTime || 0) + seconds);
  await pushEvent("seek", { delta: seconds });
}

function wireEvents() {
  el.btnRegister.addEventListener("click", async () => {
    try {
      await registerOperator();
    } catch (error) {
      el.nowPlaying.textContent = `Error registro: ${error.message}`;
    }
  });

  el.btnPlay.addEventListener("click", () => play().catch(console.error));
  el.btnPause.addEventListener("click", () => pause().catch(console.error));
  el.btnStop.addEventListener("click", () => stop().catch(console.error));
  el.btnBack.addEventListener("click", () => skip(-10).catch(console.error));
  el.btnForward.addEventListener("click", () => skip(10).catch(console.error));

  el.speed.addEventListener("change", async () => {
    const player = activePlayer();
    player.playbackRate = Number(el.speed.value);
    await pushEvent("speed", { value: player.playbackRate });
    showToast(`⚡ Velocidad: ${player.playbackRate}x`, 'info');
  });

  el.volume.addEventListener("input", async () => {
    const player = activePlayer();
    player.volume = Number(el.volume.value);
    await pushEvent("volume", { value: player.volume });
  });

  /* v2 — progress bar click-to-seek */
  el.progressBar.addEventListener("click", async (e) => {
    const player = activePlayer();
    const rect = el.progressBar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    player.currentTime = pct * (player.duration || 0);
    await pushEvent("seek", { absolute: player.currentTime });
  });

  /* v2 — theme toggle */
  el.themeToggle.addEventListener("click", toggleTheme);

  /* v2 — keyboard shortcuts */
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        activePlayer().paused ? play().catch(console.error) : pause().catch(console.error);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        skip(-5).catch(console.error);
        break;
      case 'ArrowRight':
        e.preventDefault();
        skip(5).catch(console.error);
        break;
      case 'ArrowUp':
        e.preventDefault();
        el.volume.value = Math.min(1, Number(el.volume.value) + 0.05).toFixed(2);
        el.volume.dispatchEvent(new Event('input'));
        break;
      case 'ArrowDown':
        e.preventDefault();
        el.volume.value = Math.max(0, Number(el.volume.value) - 0.05).toFixed(2);
        el.volume.dispatchEvent(new Event('input'));
        break;
    }
  });

  /* v2 — seed / export / import */
  el.seedBtn.addEventListener("click", () => seedData().catch(console.error));
  el.exportBtn.addEventListener("click", () => exportData().catch(console.error));
  el.importBtn.addEventListener("click", () => el.importFile.click());
  el.importFile.addEventListener("change", () => importData().catch(console.error));

  el.mediaForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(el.mediaForm);
    const payload = {
      title: formData.get("title"),
      kind: formData.get("kind"),
      sourceUrl: formData.get("sourceUrl"),
      durationSeconds: Number(formData.get("durationSeconds") || 0),
      genre: formData.get("genre") || "General",
    };

    try {
      await api("/api/media", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      el.mediaForm.reset();
      await refreshLibrary();
      await refreshStats();
      showToast('✅ Medio añadido', 'ok');
    } catch (error) {
      showToast(`❌ ${error.message}`, 'danger');
    }
  });
}

/* ─── v2 Data functions ─── */

/* ── File upload from local computer ── */

function uploadFile(file) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", file.name.replace(/\.[^.]+$/, ""));
    formData.append("genre", "Local");

    const xhr = new XMLHttpRequest();

    el.uploadProgress.style.display = "";
    el.uploadBar.style.width = "0%";
    el.uploadStatus.textContent = `Subiendo ${file.name}...`;

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        el.uploadBar.style.width = `${pct}%`;
        el.uploadStatus.textContent = `Subiendo ${file.name}... ${pct}%`;
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText);
        if (data.ok) {
          showToast(`✅ ${data.title} (${data.kind}) subido`, "ok");
          resolve(data);
        } else {
          showToast(`❌ ${data.error}`, "danger");
          reject(new Error(data.error));
        }
      } else {
        try {
          const data = JSON.parse(xhr.responseText);
          showToast(`❌ ${data.error || "Error de subida"}`, "danger");
        } catch (_) {
          showToast("❌ Error de subida", "danger");
        }
        reject(new Error("Upload failed"));
      }
    });

    xhr.addEventListener("error", () => {
      showToast("❌ Error de red al subir", "danger");
      reject(new Error("Network error"));
    });

    xhr.open("POST", "/api/upload");
    xhr.send(formData);
  });
}

async function handleFiles(files) {
  for (const file of files) {
    try {
      await uploadFile(file);
    } catch (_) { /* toast already shown */ }
  }
  el.uploadProgress.style.display = "none";
  await refreshLibrary();
  await refreshStats();
}

function wireUpload() {
  // Click to select
  el.uploadInput.addEventListener("change", () => {
    if (el.uploadInput.files.length) {
      handleFiles(el.uploadInput.files);
      el.uploadInput.value = "";
    }
  });

  // Drag & drop
  el.uploadZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    el.uploadZone.classList.add("drag-over");
  });
  el.uploadZone.addEventListener("dragleave", () => {
    el.uploadZone.classList.remove("drag-over");
  });
  el.uploadZone.addEventListener("drop", (e) => {
    e.preventDefault();
    el.uploadZone.classList.remove("drag-over");
    if (e.dataTransfer.files.length) {
      handleFiles(e.dataTransfer.files);
    }
  });
  // Click anywhere on zone opens picker
  el.uploadZone.addEventListener("click", (e) => {
    if (e.target.tagName !== 'LABEL') el.uploadInput.click();
  });
}

async function seedData() {
  await api('/api/seed', { method: 'POST' });
  showToast('🌱 Datos demo generados', 'ok');
  await refreshLibrary();
  await refreshStats();
  await refreshLeaders();
}

async function exportData() {
  const data = await api('/api/stats');
  const media = await api('/api/media');
  const blob = new Blob([JSON.stringify({ stats: data.stats, media: media.items }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `media-control-export-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('📥 Datos exportados', 'ok');
}

async function importData() {
  const file = el.importFile.files[0];
  if (!file) return;
  const text = await file.text();
  const json = JSON.parse(text);
  if (json.media && Array.isArray(json.media)) {
    await api('/api/import', { method: 'POST', body: JSON.stringify({ media: json.media }) });
    showToast(`📤 ${json.media.length} medios importados`, 'ok');
    await refreshLibrary();
    await refreshStats();
  } else {
    showToast('⚠️ Formato inválido', 'warning');
  }
  el.importFile.value = '';
}

async function boot() {
  initTheme();
  wireEvents();
  wireUpload();
  await refreshLibrary();
  await refreshStats();
  await refreshLeaders();
  await refreshHistory();
}

boot().catch((error) => {
  showToast(`❌ Error: ${error.message}`, 'danger');
});
