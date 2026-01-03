const container = document.getElementById("map-container");
const map = document.getElementById("map");
const coordsText = document.getElementById("coords");


const panelsLeft = document.getElementById("panels-left");
const panelsRight = document.getElementById("panels-right");
if (!panelsLeft || !panelsRight) {
  console.error("Panels introuvables. Vérifie que #panels-left et #panels-right existent dans index.html");
}


const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");

function openLightbox(src) {
  lightboxImg.src = src;
  lightbox.classList.remove("hidden");
}

function closeLightbox() {
  lightbox.classList.add("hidden");
  lightboxImg.src = "";
}

if (lightbox) {
  lightbox.addEventListener("click", closeLightbox);
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLightbox();
});



const overlay = document.getElementById("map-overlay");

// Un <defs> pour stocker les flèches (une fois)
let defs = overlay.querySelector("defs");
if (!defs) {
  defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  overlay.appendChild(defs);
}

// overlays persistants par lineup.id
const overlays = new Map();
const counters = { smoke: 0, flash: 0, molotov: 0 };

// Optionnel : stocker les markers par id (utile si tu veux highlight)
const markerById = new Map();




// Affiche les markers existants

const markers = [];

lineups.forEach(lineup => {
  const marker = document.createElement("div");
  marker.classList.add("marker", lineup.type);
  marker.style.left = lineup.x + "%";
  marker.style.top = lineup.y + "%";
  marker.onclick = () => openPopup(lineup);

  container.appendChild(marker);
  markerById.set(lineup.id, marker);

  markers.push({
    marker,
    type: lineup.type,
    side: lineup.side
  });
});

const checkboxes = document.querySelectorAll("#filters input");
checkboxes.forEach(cb => cb.addEventListener("change", updateFilters));

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

// applique une première fois au chargement
updateFilters();


// Clic sur la map pour récupérer les coordonnées
if (map) {
  map.addEventListener("click", (e) => {
    const rect = map.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width * 100).toFixed(1);
    const y = ((e.clientY - rect.top) / rect.height * 100).toFixed(1);
    coordsText.innerText = `x: ${x} | y: ${y}`;
  });
}


function openPopup(lineup) {
  const targetPanels = (lineup.type === "smoke") ? panelsLeft : panelsRight;

  // panel déjà ouvert ?
  const existing = document.querySelector(`.panel[data-id="${lineup.id}"]`);
  if (existing) {
    targetPanels.prepend(existing);
    return;
  }

  // prefix par type (S/F/M)
  const prefix = lineup.type === "smoke" ? "S" : (lineup.type === "flash" ? "F" : "M");

  // Numéro = (nombre de panels de ce type actuellement ouverts) + 1
  const currentPanelsOfType = document.querySelectorAll(`.panel[data-type="${lineup.type}"]`).length;
  const badgeNum = currentPanelsOfType + 1;

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.dataset.id = lineup.id;
  panel.dataset.type = lineup.type;       // <-- IMPORTANT pour renumérotation

  panel.innerHTML = `
    <span class="close-btn">✕</span>
    <h2><span class="badge">${prefix}${badgeNum}</span>${lineup.name}</h2>
    <p>${lineup.description}</p>

    <h4>Position</h4>
    <img src="${lineup.images.stand}">

    <h4>Visée</h4>
    <img src="${lineup.images.aim}">
  `;

  panel.querySelector(".close-btn").onclick = () => {
    removeOverlay(lineup.id);
    panel.remove();
    renumberType(lineup.type); // <-- renumérote après suppression
  };

  targetPanels.prepend(panel);

panel.querySelectorAll("img").forEach(img => {
  img.addEventListener("click", () => openLightbox(img.src));
});

  addOverlay(lineup, badgeNum);
}

function addOverlay(lineup, badgeNum) {
  // si pas de throw défini, on ne crée rien
  if (!lineup.throw) return;

  // si overlay déjà existant, on ne duplique pas
  if (overlays.has(lineup.id)) return;

  // couleur selon type
  let color = "#ffffff";
  if (lineup.type === "smoke") color = "#6fa8ff";
  if (lineup.type === "flash") color = "#ffd966";
  if (lineup.type === "molotov") color = "#ff8c42";

  // préparer le svg (coordonnées en %)
  overlay.setAttribute("viewBox", "0 0 100 100");
  overlay.setAttribute("preserveAspectRatio", "none");

  // flèche unique par lineup
  const arrowId = `arrow-${lineup.id}`;

  // créer le marker de flèche si pas encore présent
if (!defs.querySelector(`#${arrowId}`)) {
  const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
  marker.setAttribute("id", arrowId);

  // TAILLE TRÈS PETITE
  marker.setAttribute("markerWidth", "4");
  marker.setAttribute("markerHeight", "4");

  // Pointe bien alignée avec la ligne
  marker.setAttribute("refX", "4");
  marker.setAttribute("refY", "2");

  // IMPORTANT : scale avec l'épaisseur du trait
  marker.setAttribute("markerUnits", "strokeWidth");

  marker.setAttribute("orient", "auto");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

  // Mini triangle fin
  path.setAttribute("d", "M0,0 L4,2 L0,4 Z");
  path.setAttribute("fill", color);

  marker.appendChild(path);
  defs.appendChild(marker);
}


  // ligne : du point de lancer -> vers la cible (impact)
  const start = { x: lineup.throw.x, y: lineup.throw.y };
  const target = { x: lineup.x, y: lineup.y };

  // stop avant la cible pour ne pas empiéter sur la croix
  const stopBeforeTargetPx = 10;
  const end = shortenEndByPx(start, target, stopBeforeTargetPx);

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

  // point throw (div) + label
  const throwEl = document.createElement("div");
  throwEl.className = `throw-marker ${lineup.type}`;
  throwEl.style.left = lineup.throw.x + "%";
  throwEl.style.top = lineup.throw.y + "%";

  const label = document.createElement("div");
  label.className = "throw-label";
  const prefix = lineup.type === "smoke" ? "S" : (lineup.type === "flash" ? "F" : "M");
  label.textContent = `${prefix}${badgeNum}`;
  label.dataset.id = lineup.id;

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

  // Récupère tous les panels ouverts de ce type, dans l'ordre visuel (haut -> bas)
  const panels = Array.from(document.querySelectorAll(`.panel[data-type="${type}"]`));

  // Comme on prepend, l'ordre DOM est déjà haut -> bas (le premier est en haut)
  panels.forEach((panel, index) => {
    const newNum = index + 1;
    const id = panel.dataset.id;

    // update badge dans le panel
    const badge = panel.querySelector(".badge");
    if (badge) badge.textContent = `${prefix}${newNum}`;

    // update label à côté du point de lancement
    const o = overlays.get(id);
    if (o && o.label) {
      o.label.textContent = `${prefix}${newNum}`;
    }
  });
}

function getMapRect() {
  const map = document.getElementById("map");
  return map.getBoundingClientRect();
}

// Convertit % (0..100) -> pixels dans la map
function percentToPx(p, axis) {
  const rect = getMapRect();
  return (axis === "x" ? rect.width : rect.height) * (p / 100);
}

// Convertit pixels -> % (0..100)
function pxToPercent(px, axis) {
  const rect = getMapRect();
  return 100 * (px / (axis === "x" ? rect.width : rect.height));
}

// Retourne un point "end" raccourci de offsetPx avant la cible
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

  const newEx = ex - ux * offsetPx;
  const newEy = ey - uy * offsetPx;

  return {
    x: pxToPercent(newEx, "x"),
    y: pxToPercent(newEy, "y")
  };
}
