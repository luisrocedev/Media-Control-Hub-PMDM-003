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
  seek: document.getElementById("seek"),
  timeInfo: document.getElementById("timeInfo"),
  library: document.getElementById("library"),
  stats: document.getElementById("stats"),
  leaders: document.getElementById("leaders"),
  history: document.getElementById("history"),
  mediaForm: document.getElementById("mediaForm"),
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

async function registerOperator() {
  const name = el.operatorName.value.trim();
  const dni = el.operatorDni.value.trim();
  const data = await api("/api/operators/register", {
    method: "POST",
    body: JSON.stringify({ name, dni }),
  });

  state.operatorId = data.operatorId;
  state.operatorName = data.name;
  el.nowPlaying.textContent = `Operador activo: ${data.name} (${data.dni})`;
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
        <td>${item.kind}</td>
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
    el.seek.value = `${pct}`;
    el.timeInfo.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
  });

  player.addEventListener("ended", async () => {
    await endSession(true);
    await pushEvent("ended", { ended: true });
    el.nowPlaying.textContent = "Reproducción completada";
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
  el.nowPlaying.textContent = `Cargado: ${item.title} [${item.kind}]`;

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
      (row) => `
      <tr>
        <td>${row.name}</td>
        <td>${row.total_sessions}</td>
        <td>${row.completions}</td>
        <td>${row.avg_position}</td>
      </tr>
    `
    )
    .join("");

  el.leaders.innerHTML = `
    <table class='list'>
      <thead><tr><th>Operador</th><th>Sesiones</th><th>Completadas</th><th>Avg Pos.</th></tr></thead>
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
      (session) => `
      <tr>
        <td>${session.title}</td>
        <td>${session.kind}</td>
        <td>${session.genre}</td>
        <td>${session.completed ? "Sí" : "No"}</td>
        <td>${Number(session.last_position).toFixed(2)}s</td>
      </tr>
    `
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
    el.nowPlaying.textContent = "Primero carga un elemento de la biblioteca.";
    return;
  }
  const player = activePlayer();
  await player.play();
  await pushEvent("play", { rate: player.playbackRate, volume: player.volume });
  el.nowPlaying.textContent = "Estado: reproduciendo";
}

async function pause() {
  const player = activePlayer();
  player.pause();
  await pushEvent("pause", {});
  el.nowPlaying.textContent = "Estado: pausa";
}

async function stop() {
  const player = activePlayer();
  player.pause();
  player.currentTime = 0;
  await pushEvent("stop", {});
  await endSession(false);
  el.nowPlaying.textContent = "Estado: detenido";
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
  });

  el.volume.addEventListener("input", async () => {
    const player = activePlayer();
    player.volume = Number(el.volume.value);
    await pushEvent("volume", { value: player.volume });
  });

  el.seek.addEventListener("input", async () => {
    const player = activePlayer();
    const duration = player.duration || 0;
    player.currentTime = (Number(el.seek.value) / 100) * duration;
    await pushEvent("seek", { absolute: player.currentTime });
  });

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
      el.nowPlaying.textContent = "Medio añadido correctamente";
    } catch (error) {
      el.nowPlaying.textContent = `Error al añadir medio: ${error.message}`;
    }
  });
}

async function boot() {
  wireEvents();
  await refreshLibrary();
  await refreshStats();
  await refreshLeaders();
  await refreshHistory();
}

boot().catch((error) => {
  el.nowPlaying.textContent = `Error de inicialización: ${error.message}`;
});
