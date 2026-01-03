// ==========================
// 0) DOM
// ==========================
const container   = document.getElementById("map-container");
const map         = document.getElementById("map");
const coordsText  = document.getElementById("coords");

const panelsLeft  = document.getElementById("panels-left");
const panelsRight = document.getElementById("panels-right");

const overlay     = document.getElementById("map-overlay");

// Lightbox
const lightbox    = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");

// Chooser (variants)
const chooser      = document.getElementById("chooser");
const chooserTitle = document.getElementById("chooser-title");
const chooserList  = document.getElementById("chooser-list");
const chooserClose = document.getElementById("chooser-close");

// Executes
const executesBox = document.getElementById("executes");

// Filtres
const checkboxes = document.querySelectorAll("#filters input");

// ==========================
// 1) Garde-fous
// ==========================
if (!container || !overlay) console.error("map-container ou map-overlay introuvable.");
if (!panelsLeft || !panelsRight) console.error("Panels introuvables (#panels-left / #panels-right).");

// `lineups` vient de data/<map>.js
if (typeof lineups === "undefined" || !Array.isArray(lineups)) {
  console.error("`lineups` n'est pas défini. Vérifie que data/<map>.js est bien chargé avant script.js");
}

// ==========================
// 2) State
// ==========================
const overlays = new Map();     // lineup.id -> { line, throwEl, label, type }
const markers  = [];            // { marker, type, side }
const lineupsById = new Map();  // id -> lineup

// SVG defs pour les flèches
let defs = overlay ? overlay.querySelector("defs") : null;
if (overlay && !defs) {
  defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  overlay.appendChild(defs);
}

// Index rapide des lineups
if (Array.isArray(lineups)) {
  lineups.forEach(lu => lineupsById.set(lu.id, lu));
}

// ==========================
// 3) Lightbox
// ==========================
function openLightbox(src) {
  if (!lightbox || !lightboxImg) return;
  lightboxImg.src = src;
  lightbox.classList.remove("hidden");
}
function closeLightbox() {
  if (!lightbox || !lightboxImg) return;
  lightbox.classList.add("hidden");
  lightboxImg.src = "";
}

if (lightbox) lightbox.addEventListener("click", closeLightbox);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeLightbox();
    if (chooser) chooser.classList.add("hidden");
  }
});

// ==========================
// 4) Chooser (variants)
// ==========================
if (chooserClose && chooser) chooserClose.addEventListener("click", () => chooser.classList.add("hidden"));
if (chooser) {
  chooser.addEventListener("click", (e) => {
    if (e.target === chooser) chooser.classList.add("hidden");
  });
}

function openChooser(group) {
  if (!chooser || !chooserTitle || !chooserList) {
    console.error("Chooser DOM manquant (#chooser / #chooser-title / #chooser-list).");
    return;
  }

  group.sort((a, b) => (a.variant || a.name || "").localeCompare(b.variant || b.name || ""));

  chooserTitle.textContent = `${group[0].name || "Lineup"} — ${group.length} variants`;
  chooserList.innerHTML = "";

  group.forEach(lu => {
    const btn = document.createElement("button");
    btn.textContent = lu.variant || lu.name || lu.id;
    btn.onclick = () => {
      chooser.classList.add("hidden");
      openPopup(lu);
    };
    chooserList.appendChild(btn);
  });

  chooser.classList.remove("hidden");
}

// ==========================
// 5) Markers (groupés par target)
// ==========================
function buildMarkers() {
  if (!Array.isArray(lineups) || !container) return;

  const lineupsByTarget = new Map();

  lineups.forEach(lu => {
    const key = lu.target || lu.id;
    if (!lineupsByTarget.has(key)) lineupsByTarget.set(key, []);
    lineupsByTarget.get(key).push(lu);
  });

  lineupsByTarget.forEach((group) => {
    const first = group[0];

    const marker = document.createElement("div");
    marker.classList.add("marker", first.type);
    marker.style.left = first.x + "%";
    marker.style.top  = first.y + "%";

    marker.onclick = () => {
      if (group.length === 1) openPopup(group[0]);
      else openChooser(group);
    };

    container.appendChild(marker);

    markers.push({ marker, type: first.type, side: first.side });
  });
}

// ==========================
// 6) Filtres
// ==========================
function updateFilters() {
  const activeTypes = Array.from(checkboxes)
    .filter(cb => cb.checked && ["smoke", "flash", "molotov"].includes(cb.value))
    .map(cb => cb.value);

  const activeSides = Array.from(checkboxes)
    .filter(cb => cb.checked && ["T", "CT"].includes(cb.value))
    .map(cb => cb.value);

  const typesToUse = activeTypes.length ? activeTypes : ["smoke", "flash", "molotov"];
  const sidesToUse = activeSides.length ? activeSides : ["T", "CT"];

  markers.forEach(m => {
    const okType = typesToUse.includes(m.type);
    const okSide = sidesToUse.includes(m.side);
    m.marker.style.display = (okType && okSide) ? "block" : "none";
  });
}

checkboxes.forEach(cb => cb.addEventListener("change", updateFilters));

// ==========================
// 7) Clic map => coords
// ==========================
if (map) {
  map.addEventListener("click", (e) => {
    if (!coordsText) return;
    const rect = map.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width * 100).toFixed(1);
    const y = ((e.clientY - rect.top) / rect.height * 100).toFixed(1);
    coordsText.innerText = `x: ${x} | y: ${y}`;
  });
}

// ==========================
// 8) Panels + overlays
// ==========================
function openPopup(lineup, opts = {}) {

  if (!panelsLeft || !panelsRight) return;

const forced = opts.forceSide; // "left" | "right" | undefined
const targetPanels =
  forced === "left"  ? panelsLeft :
  forced === "right" ? panelsRight :
  (lineup.type === "smoke" ? panelsLeft : panelsRight);

  // déjà ouvert en tant qu'item ?
  const existingItem = document.querySelector(`.lineup-item[data-id="${lineup.id}"]`);
  if (existingItem) {
    const panel = existingItem.closest(".panel");
    if (panel) targetPanels.prepend(panel);
    return;
  }

  // clé de groupement (même point de lancement)
  const isExecute = opts.mode === "execute";
  const key = isExecute
  ? getSpotKey(lineup)                  // groupement cross-type
  : (lineup.throwKey || getThrowKey(lineup)); // ton groupement normal


  // si pas de throw => panel classique (1 lineup = 1 panel)
  if (!key) {
    const panel = createGroupPanel(targetPanels, null, lineup); // groupKey null => panel simple
    targetPanels.prepend(panel);
    addOverlay(lineup, 0); // badge sera set par renumberType
    renumberType(lineup.type);
    return;
  }

  // panel groupé déjà présent ?
  let groupPanel = document.querySelector(`.panel[data-throwkey="${CSS.escape(key)}"]`);

  // sinon on le crée
  if (!groupPanel) {
    groupPanel = createGroupPanel(targetPanels, key, lineup);
    targetPanels.prepend(groupPanel);
  if (!groupPanel) {
  groupPanel = createGroupPanel(targetPanels, key, lineup);

  if (isExecute) targetPanels.appendChild(groupPanel);
  else targetPanels.prepend(groupPanel);
}
  if (groupPanel && !isExecute) {
  targetPanels.prepend(groupPanel);
}


    // overlay pour la lineup (le point de lancement unique sera géré par l'existant, toi tu gardes un point par lineup actuellement)
    addOverlay(lineup, 0);
    renumberType(lineup.type);
    return;
  }

  // panel groupé existe : on ajoute juste un item (visée)
  targetPanels.prepend(groupPanel);
  appendLineupItem(groupPanel, lineup);

  addOverlay(lineup, 0);
  renumberType(lineup.type);
}
function createGroupPanel(targetPanels, throwKey, firstLineup) {
  const panel = document.createElement("div");
  panel.className = "panel";
  panel.dataset.type = firstLineup.type;

  if (throwKey) panel.dataset.throwkey = throwKey;

  // Header panel (tu peux changer le titre si tu veux)
  panel.innerHTML = `
    <span class="close-btn">✕</span>
    <h2>${throwKey ? "Spot" : firstLineup.name}</h2>

    ${throwKey ? `
      <img class="stand-img" src="${firstLineup.images?.stand || ""}" alt="stand">
      <div class="aim-list"></div>
    ` : `
      <div class="aim-list"></div>
    `}
  `;

// Lightbox: clique sur n'importe quelle image dans ce panel (spot + visées)
panel.addEventListener("click", (e) => {
  const img = e.target.closest("img");
  if (!img) return;
  if (!img.src) return;
  openLightbox(img.src);
});

// Lightbox sur l'image du spot
const spotImg = panel.querySelector(".spot-img");
if (spotImg && spotImg.getAttribute("src")) {
  spotImg.addEventListener("click", () => openLightbox(spotImg.src));
}

  // fermer le panel : ferme toutes les lineups dedans
  panel.querySelector(".close-btn").onclick = () => {
    panel.querySelectorAll(".lineup-item").forEach(item => {
      const id = item.dataset.id;
      removeOverlay(id);
    });
    panel.remove();
    renumberType(firstLineup.type);
  };

  targetPanels.prepend(panel);

  // pour panel simple : on met aussi Position + Aim dans la liste comme un item
  if (!throwKey) {
    panel.querySelector("h2").innerHTML = `<span class="badge"></span>${firstLineup.name}`;
    panel.insertAdjacentHTML("beforeend", `
      <img class="stand-img" src="${firstLineup.images?.stand || ""}" alt="stand">
    `);
  }

  appendLineupItem(panel, firstLineup);
  return panel;
}

function appendLineupItem(panel, lineup) {
  const list = panel.querySelector(".aim-list");
  if (!list) return;

  // item visée (connecté)
  const item = document.createElement("div");
  item.className = "lineup-item";
  item.dataset.id = lineup.id;
  item.dataset.type = lineup.type;

  item.innerHTML = `
    <div class="lineup-item-head">
      <span class="badge"></span>
      <div class="lineup-item-title">
        <div class="lineup-name">${lineup.name}</div>
        <div class="lineup-desc">${lineup.description || ""}</div>
      </div>
      <button class="item-close" type="button">✕</button>
    </div>

    <h4>Aim</h4>
    <img class="aim-img" src="${lineup.images?.aim || ""}" alt="aim">
  `;

  // close uniquement cette lineup
  item.querySelector(".item-close").onclick = () => {
    removeOverlay(lineup.id);
    item.remove();

    // si plus aucun item dans le panel => supprimer panel
    if (panel.querySelectorAll(".lineup-item").length === 0) {
      panel.remove();
    }
    renumberType(lineup.type);
  };

  // lightbox
  item.querySelectorAll("img").forEach(img => {
    if (img.getAttribute("src")) img.addEventListener("click", () => openLightbox(img.src));
  });

  list.appendChild(item);
}


function addOverlay(lineup, badgeNum) {
  if (!lineup.throw) return;
  if (overlays.has(lineup.id)) return;
  if (!overlay || !defs || !container) return;

  let color = "#ffffff";
  if (lineup.type === "smoke") color = "#6fa8ff";
  if (lineup.type === "flash") color = "#ffd966";
  if (lineup.type === "molotov") color = "#ff8c42";

  overlay.setAttribute("viewBox", "0 0 100 100");
  overlay.setAttribute("preserveAspectRatio", "none");

  const arrowId = `arrow-${lineup.id}`;

  if (!defs.querySelector(`#${CSS.escape(arrowId)}`)) {
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.setAttribute("id", arrowId);
    marker.setAttribute("markerWidth", "3");
    marker.setAttribute("markerHeight", "3");
    marker.setAttribute("refX", "3");
    marker.setAttribute("refY", "1.5");
    marker.setAttribute("markerUnits", "strokeWidth");
    marker.setAttribute("orient", "auto");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M0,0 L3,1.5 L0,3 Z");
    path.setAttribute("fill", color);

    marker.appendChild(path);
    defs.appendChild(marker);
  }

  const start  = { x: lineup.throw.x, y: lineup.throw.y };
  const target = { x: lineup.x,       y: lineup.y };

  const end = shortenEndByPx(start, target, 10);

  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", start.x);
  line.setAttribute("y1", start.y);
  line.setAttribute("x2", end.x);
  line.setAttribute("y2", end.y);
  line.setAttribute("stroke", color);
  line.setAttribute("stroke-width", "1.6");
  line.setAttribute("vector-effect", "non-scaling-stroke");
  line.setAttribute("marker-end", `url(#${arrowId})`);
  overlay.appendChild(line);

  const throwEl = document.createElement("div");
  throwEl.className = `throw-marker ${lineup.type}`;
  throwEl.style.left = lineup.throw.x + "%";
  throwEl.style.top  = lineup.throw.y + "%";

  const label = document.createElement("div");
  label.className = "throw-label";
  const prefix = lineup.type === "smoke" ? "S" : (lineup.type === "flash" ? "F" : "M");
  label.textContent = `${prefix}${badgeNum}`;

  throwEl.appendChild(label);
  container.appendChild(throwEl);

  overlays.set(lineup.id, { line, throwEl, label, type: lineup.type });
}

function removeOverlay(lineupId) {
  const o = overlays.get(lineupId);
  if (!o) return;
  o.line.remove();
  o.throwEl.remove();
  overlays.delete(lineupId);
}

function renumberType(type) {
  const prefix = type === "smoke" ? "S" : (type === "flash" ? "F" : "M");

  const items = Array.from(document.querySelectorAll(`.lineup-item[data-type="${type}"]`));

  items.forEach((item, index) => {
    const num = index + 1;
    const id = item.dataset.id;

    // badge dans l'item
    const badge = item.querySelector(".badge");
    if (badge) badge.textContent = `${prefix}${num}`;

    // label sur le point de lancement (overlay)
    const o = overlays.get(id);
    if (o && o.label) o.label.textContent = `${prefix}${num}`;
  });
}


// ==========================
// 9) Utils géométrie
// ==========================
function getMapRect() {
  return map.getBoundingClientRect();
}
function percentToPx(p, axis) {
  const rect = getMapRect();
  return (axis === "x" ? rect.width : rect.height) * (p / 100);
}
function pxToPercent(px, axis) {
  const rect = getMapRect();
  return 100 * (px / (axis === "x" ? rect.width : rect.height));
}
function shortenEndByPx(start, end, offsetPx) {
  const sx = percentToPx(start.x, "x");
  const sy = percentToPx(start.y, "y");
  const ex = percentToPx(end.x, "x");
  const ey = percentToPx(end.y, "y");

  const vx = ex - sx;
  const vy = ey - sy;
  const len = Math.hypot(vx, vy);
  if (len < 0.001) return end;

  const ux = vx / len;
  const uy = vy / len;

  return {
    x: pxToPercent(ex - ux * offsetPx, "x"),
    y: pxToPercent(ey - uy * offsetPx, "y")
  };
}
function round1(n) { return Math.round(n * 10) / 10; } // arrondi 0.1%

// Clé "spot" basée uniquement sur le point de lancement (+ side si tu veux)
function getSpotKey(lu) {
  if (!lu.throw) return null;

  // Si tu as un champ manuel (recommandé si tu veux 0 surprise)
  if (lu.spotKey) return lu.spotKey;

  // Automatique: uniquement throw.x / throw.y (pas le type)
  return `${lu.side}|${round1(lu.throw.x)}|${round1(lu.throw.y)}`;
}

function getThrowKey(lu) {
  if (!lu.throw) return null;
  return `${lu.type}|${lu.side}|${round1(lu.throw.x)}|${round1(lu.throw.y)}`;
}

// ==========================
// 10) Executes (buttons)
// ==========================
function closeAllPanels() {
  document.querySelectorAll(".panel .close-btn").forEach(btn => btn.click());
}

function openExecute(exec) {
  exec.items.forEach(id => {
    const lu = lineupsById.get(id);
    if (!lu) return console.warn("Execute: lineup introuvable:", id);

    openPopup(lu, {
      forceSide: "left",
      mode: "execute"
    });
  });
}


function renderExecutes() {
  if (!executesBox) return;

  // Pas d'executes sur cette map
  if (typeof executes === "undefined" || !Array.isArray(executes) || executes.length === 0) {
    executesBox.style.display = "none";
    return;
  }

  executesBox.style.display = "flex";
  executesBox.innerHTML = "";

  // Clear en premier
  const clearBtn = document.createElement("button");
  clearBtn.className = "exec-btn exec-clear"; // 👈 classe spéciale
  clearBtn.textContent = "✕ Clear";
  clearBtn.onclick = closeAllPanels;
  executesBox.appendChild(clearBtn);


  // Puis les executes
  executes.forEach(exec => {
    const btn = document.createElement("button");
    btn.className = "exec-btn";
    btn.textContent = exec.name || exec.id;
    btn.onclick = () => openExecute(exec);
    executesBox.appendChild(btn);
  });
}

// ==========================
// 11) Init
// ==========================
buildMarkers();
updateFilters();
renderExecutes();
