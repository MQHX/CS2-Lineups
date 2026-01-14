// ==========================
// CS2 Lineups — Viewer script (FIXED)
// Works with viewer.html + loader.js (JSON data)
// ==========================

// --------------------------
// 0) DOM
// --------------------------
const container   = document.getElementById("map-container");
const map         = document.getElementById("map");
const coordsText  = document.getElementById("coords");

const panelsLeft  = document.getElementById("panels-left");
const panelsRight = document.getElementById("panels-right");

const overlay     = document.getElementById("map-overlay");

// Executes
const executesBox = document.getElementById("executes");
const execGrid    = document.getElementById("exec-grid");
const execClear   = document.getElementById("exec-clear");

// Modal (universal)
const uiModal      = document.getElementById("ui-modal");
const uiModalTitle = document.getElementById("ui-modal-title");
const uiModalBody  = document.getElementById("ui-modal-body");
const uiModalAct   = document.getElementById("ui-modal-actions");
const uiModalX     = document.getElementById("ui-modal-x");

// Lightbox
const lightbox    = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");

// Groups dock (exists in viewer.html; if not, we create it)
let groupsDock = document.getElementById("groups-dock");
let groupsList = document.getElementById("user-groups-list");
let addGroupBtn = document.getElementById("add-group");

// Filters (pill buttons)
const pillType = Array.from(document.querySelectorAll('#filters .pill-group[data-group="type"] .pill'));
const pillSide = Array.from(document.querySelectorAll('#filters .pill-group[data-group="side"] .pill'));

// --------------------------
// 1) Guard rails
// --------------------------
if (!container || !overlay) console.error("map-container ou map-overlay introuvable.");
if (!panelsLeft || !panelsRight) console.error("Panels introuvables (#panels-left / #panels-right).");

// `lineups` + `executes` viennent de loader.js (data/<map>.json)
if (typeof window.lineups === "undefined" || !Array.isArray(window.lineups)) {
  console.error("`lineups` n'est pas défini. Vérifie loader.js + data/<map>.json.");
}
if (typeof window.executes === "undefined") {
  window.executes = [];
}

// CSS.escape polyfill (very small) — prevents querySelector crashes on odd ids
if (!window.CSS) window.CSS = {};
if (typeof window.CSS.escape !== "function") {
  window.CSS.escape = (value) => String(value).replace(/[^a-zA-Z0-9_\-]/g, (m) => `\\${m}`);
}

// --------------------------
// 2) State / Index
// --------------------------
const lineups = Array.isArray(window.lineups) ? window.lineups : [];
const executes = Array.isArray(window.executes) ? window.executes : [];

const overlays = new Map();     // lineup.id -> { line, throwEl, label, type }
const markers  = [];            // { el, type, side, key }
const lineupsById = new Map();  // id -> lineup

lineups.forEach(lu => {
  if (lu && lu.id) lineupsById.set(lu.id, lu);
});

// SVG defs (arrowheads)
let defs = overlay ? overlay.querySelector("defs") : null;
if (overlay && !defs) {
  defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  overlay.appendChild(defs);
}

// Surface runtime errors (so clicks don't fail silently)
let __cs2_error_shown = false;
window.addEventListener("error", (ev) => {
  if (__cs2_error_shown) return;
  __cs2_error_shown = true;
  console.error("CS2 Lineups runtime error:", ev.error || ev.message);
});

// --------------------------
// 3) Modal helpers
// --------------------------
function openModal({ title = "", body = "", actions = [] } = {}) {
  if (!uiModal) return;
  uiModalTitle.textContent = title;
  uiModalBody.innerHTML = typeof body === "string" ? body : "";
  uiModalAct.innerHTML = "";

  for (const a of actions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = a.className || "ui-btn";
    btn.textContent = a.label || "OK";
    btn.onclick = () => a.onClick && a.onClick();
    uiModalAct.appendChild(btn);
  }

  uiModal.classList.remove("hidden");
  uiModal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  if (!uiModal) return;
  uiModal.classList.add("hidden");
  uiModal.setAttribute("aria-hidden", "true");
  uiModalTitle.textContent = "";
  uiModalBody.innerHTML = "";
  uiModalAct.innerHTML = "";
}

if (uiModalX) uiModalX.addEventListener("click", closeModal);
if (uiModal) {
  uiModal.addEventListener("click", (e) => {
    if (e.target && e.target.getAttribute && e.target.getAttribute("data-close") === "1") closeModal();
  });
}

// --------------------------
// 4) Lightbox (Gallery with right rail)
// --------------------------
const __lb = {
  built: false,
  items: /** @type {{src:string,label:string}[]} */ ([]),
  index: 0
};

function syncLightboxRailHeight() {
  if (!lightbox || !lightboxImg) return;
  const rail = lightbox.querySelector(".lb-rail");
  if (!rail) return;

  // Measure displayed image height (not natural)
  const rect = lightboxImg.getBoundingClientRect();
  if (!rect || rect.height <= 0) return;

  rail.style.height = `${Math.round(rect.height)}px`;
  rail.style.maxHeight = `${Math.round(rect.height)}px`;
}


function ensureLightboxStructure() {
  if (!lightbox || !lightboxImg || __lb.built) return;
  __lb.built = true;

  // Build gallery UI around the existing #lightbox-img
  const inner = document.createElement("div");
  inner.className = "lb-inner";

  const main = document.createElement("div");
  main.className = "lb-main";

  const rail = document.createElement("div");
  rail.className = "lb-rail";
  rail.setAttribute("aria-label", "Gallery");

  // Move existing image into main
  const img = lightboxImg;
  img.classList.add("lb-img");
  main.appendChild(img);

  inner.appendChild(main);
  inner.appendChild(rail);

  // Replace lightbox content with the inner shell
  lightbox.innerHTML = "";
  lightbox.appendChild(inner);

  // Prevent clicks inside from closing
  inner.addEventListener("click", (e) => e.stopPropagation());

  // Close only when clicking the backdrop
  lightbox.addEventListener("click", closeLightbox);

  // Wheel navigation inside the lightbox
  inner.addEventListener("wheel", (e) => {
    if (lightbox.classList.contains("hidden")) return;
    if (!__lb.items || __lb.items.length <= 1) return;
    e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    setLightboxIndex(__lb.index + dir);
  }, { passive: false });

  // Keep rail height synced with displayed image
  window.addEventListener("resize", () => {
    if (lightbox.classList.contains("hidden")) return;
    syncLightboxRailHeight();
  });
  requestAnimationFrame(syncLightboxRailHeight);
}

function setLightboxIndex(nextIndex) {
  if (!lightbox || !lightboxImg) return;
  if (!__lb.items || __lb.items.length === 0) return;
  const n = __lb.items.length;
  __lb.index = (nextIndex % n + n) % n;

  const it = __lb.items[__lb.index];
  lightboxImg.onload = () => { syncLightboxRailHeight(); };
  lightboxImg.src = it.src || "";
  renderLightboxRail();
  requestAnimationFrame(syncLightboxRailHeight);
}

function renderLightboxRail() {
  if (!lightbox) return;
  const rail = lightbox.querySelector(".lb-rail");
  if (!rail) return;
  rail.innerHTML = "";

  (__lb.items || []).forEach((it, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lb-thumb" + (idx === __lb.index ? " is-active" : "");
    btn.title = it.label || "";

    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = it.label || "";
    img.src = it.src;

    const lab = document.createElement("div");
    lab.className = "lb-thumb-label";
    lab.textContent = it.label || "";

    btn.appendChild(img);
    btn.appendChild(lab);
    btn.addEventListener("click", () => setLightboxIndex(idx));

    rail.appendChild(btn);
  });

  // Keep active visible
  const active = rail.querySelector(".lb-thumb.is-active");
  if (active) active.scrollIntoView({ block: "nearest" });
}

function openLightboxGallery(items, startIndex = 0) {
  if (!lightbox || !lightboxImg) return;
  ensureLightboxStructure();

  const cleaned = (items || [])
    .map(it => ({ src: String(it.src || "").trim(), label: String(it.label || "").trim() }))
    .filter(it => it.src);

  if (cleaned.length === 0) return;

  __lb.items = cleaned;
  __lb.index = Math.max(0, Math.min(startIndex, cleaned.length - 1));

  lightboxImg.onload = () => { syncLightboxRailHeight(); }; 
  lightboxImg.src = cleaned[__lb.index].src;
  lightbox.classList.remove("hidden");
  lightbox.setAttribute("aria-hidden", "false");
  renderLightboxRail();
  requestAnimationFrame(syncLightboxRailHeight);
}

// Backward-compatible helper (single image)
function openLightbox(src) {
  const s = String(src || "").trim();
  if (!s) return;
  openLightboxGallery([{ src: s, label: "" }], 0);
}

function closeLightbox() {
  if (!lightbox || !lightboxImg) return;
  lightbox.classList.add("hidden");
  lightbox.setAttribute("aria-hidden", "true");
  lightboxImg.src = "";
  __lb.items = [];
  __lb.index = 0;

  // Clear rail if present
  const rail = lightbox.querySelector(".lb-rail");
  if (rail) rail.innerHTML = "";
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeLightbox();
    closeModal();
  }

  // Lightbox navigation
  if (!lightbox || lightbox.classList.contains("hidden")) return;
  if (!__lb.items || __lb.items.length <= 1) return;

  if (e.key === "ArrowRight" || e.key === "ArrowDown") {
    e.preventDefault();
    setLightboxIndex(__lb.index + 1);
  } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
    e.preventDefault();
    setLightboxIndex(__lb.index - 1);
  }
});

// --------------------------
// 5) Variants chooser (uses modal)
// --------------------------
function openChooser(group) {
  const sorted = (group || []).slice().sort((a, b) => (a.variant || a.name || "").localeCompare(b.variant || b.name || ""));
  if (sorted.length === 0) return;

  const title = `${sorted[0]?.name || "Lineup"} — ${sorted.length} variants`;

  // Use the currently loaded map image as the overview background
  const mapSrc = (map && (map.currentSrc || map.src)) ? String(map.currentSrc || map.src).trim() : "";

  const rows = sorted.map((lu, i) => {
    const label = lu.variant || lu.name || lu.id;
    // data-idx lets us correlate list -> pin order
    return `<button class="ui-list-row vc-row" data-id="${escapeHtml(lu.id)}" data-idx="${i}"><span class="vc-row-idx">${i + 1}.</span><span class="vc-row-label">${escapeHtml(label)}</span></button>`;
  }).join("");

  const body = `
    <div class="vc-wrap">
      <div class="vc-left">
        <div class="ui-list vc-list">${rows}</div>
      </div>

      <div class="vc-right">
        <div class="vc-head">
          <div class="vc-head-title">Overview</div>
          <div class="vc-head-sub">Throw position</div>
        </div>

        <div class="vc-map" aria-label="Throw overview">
          ${mapSrc ? `<img class="vc-map-img" src="${escapeHtml(mapSrc)}" alt="">` : `<div class="vc-map-empty">Map</div>`}
          <div class="vc-map-layer"></div>
        </div>

        <div class="vc-hint"></div>
      </div>
    </div>
  `;

  openModal({
    title,
    body,
    actions: [
      { label: "Close", className: "ui-btn ui-btn-weak", onClick: closeModal }
    ]
  });

  // Wire rows
  const rowEls = Array.from(uiModalBody.querySelectorAll(".ui-list-row.vc-row"));
  const layer = uiModalBody.querySelector(".vc-map-layer");
  const hint = uiModalBody.querySelector(".vc-hint");

  if (!layer) {
    // Fallback: behave like the old chooser (still clickable)
    rowEls.forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const lu = lineupsById.get(id);
        closeModal();
        if (lu) openPopup(lu);
      });
    });
    return;
  }

  // Build pins for each variant (based on throw coords from JSON)
  const pinsById = new Map();

  sorted.forEach((lu, idx) => {
    const pin = document.createElement("div");
    pin.className = `vc-pin ${lu.type || ""}`.trim();
    pin.dataset.id = lu.id || "";
    pin.dataset.idx = String(idx);

    const tx = lu?.throw?.x;
    const ty = lu?.throw?.y;

    // If throw is missing, keep the pin hidden but the row remains usable
    if (typeof tx === "number" && typeof ty === "number" && isFinite(tx) && isFinite(ty)) {
      pin.style.left = tx + "%";
      pin.style.top = ty + "%";
      pin.innerHTML = `<span>${idx + 1}</span>`;
    } else {
      pin.classList.add("is-missing");
      pin.style.left = "50%";
      pin.style.top = "50%";
      pin.innerHTML = `<span>?</span>`;
    }

    layer.appendChild(pin);
    pinsById.set(lu.id, pin);
  });

  function setActive(id) {
    pinsById.forEach((pin) => pin.classList.remove("is-active"));
    rowEls.forEach((r) => r.classList.remove("is-active"));

    if (!id) return;

    const pin = pinsById.get(id);
    const row = rowEls.find(r => r.getAttribute("data-id") === id);

    if (pin) pin.classList.add("is-active");
    if (row) row.classList.add("is-active");

  }

  // Hover / focus preview
  rowEls.forEach(btn => {
    const id = btn.getAttribute("data-id");

    btn.addEventListener("mouseenter", () => setActive(id));
    btn.addEventListener("focus", () => setActive(id));

    btn.addEventListener("mouseleave", () => {
      // keep last active on mouseleave (cleaner UX), do nothing
    });

    // Touch support: a first tap previews, second tap selects
    btn.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") {
        const isAlready = btn.classList.contains("is-active");
        setActive(id);
        if (!isAlready) e.preventDefault();
      }
    });

    btn.addEventListener("click", () => {
      const lu = lineupsById.get(id);
      closeModal();
      if (lu) openPopup(lu);
    });
  });

  // Default highlight: first row
  if (rowEls[0]) setActive(rowEls[0].getAttribute("data-id"));
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// --------------------------
// 6) Markers
// - 1 marker per lineup (prevents position shifts)
// - On click: if multiple variants share same key+coords => chooser
// --------------------------
function buildMarkers() {
  if (!Array.isArray(lineups) || !container) return;

  // remove previous
  markers.forEach(m => m.el.remove());
  markers.length = 0;

  const nearly = (a, b, eps = 0.15) => Math.abs((a ?? 0) - (b ?? 0)) <= eps;

  for (const lu of lineups) {
    if (!lu) continue;

    const el = document.createElement("div");
    el.className = `marker marker-target ${lu.type || ""}`.trim();

    const key = (lu.target || lu.id);
    el.dataset.key = key;
    el.dataset.id = lu.id || "";

    el.style.left = (lu.x ?? 0) + "%";
    el.style.top  = (lu.y ?? 0) + "%";

    el.addEventListener("click", () => {
      try {
        const group = lineups.filter(x => x && (x.target || x.id) === key && nearly(x.x, lu.x) && nearly(x.y, lu.y));
        if (group.length > 1) openChooser(group);
        else openPopup(lu);
      } catch (err) {
        console.error("Marker click failed:", err);
      }
    });

    container.appendChild(el);
    markers.push({ el, key, type: lu.type, side: lu.side });
  }
}

function refreshActiveMarkers() {
  // keys des lineups ouvertes (target ou id)
  const activeKeys = new Set(
    Array.from(document.querySelectorAll(".lineup-item[data-key]"))
      .map(el => el.dataset.key)
  );

  markers.forEach(m => {
    const isActive = activeKeys.has(m.key);
    m.el.classList.toggle("marker-active", isActive);
    // IMPORTANT: on NE grise PAS les autres
    m.el.classList.remove("marker-dim");
  });
}

// --------------------------
// 7) Filters (pill buttons)
// --------------------------
function getActivePills(btns, allValues) {
  const active = btns.filter(b => b.classList.contains("active")).map(b => b.dataset.value);
  return active.length ? active : allValues;
}

function updateFilters() {
  const typesToUse = getActivePills(pillType, ["smoke", "flash", "molotov"]);
  const sidesToUse = getActivePills(pillSide, ["T", "CT"]);

  // ✅ If no type OR no side is selected => hide everything
  const noTypeSelected = pillType.every(b => !b.classList.contains("active"));
  const noSideSelected = pillSide.every(b => !b.classList.contains("active"));
  const nothingSelected = noTypeSelected || noSideSelected;

  markers.forEach(m => {
    const okType = typesToUse.includes(m.type);
    const okSide = sidesToUse.includes(m.side);
    m.el.style.display = (!nothingSelected && okType && okSide) ? "block" : "none";
  });

  // Keep executes in sync with the same filters
  updateExecFilters(typesToUse, sidesToUse, nothingSelected);
}

function wirePillGroup(btns) {
  btns.forEach(btn => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      updateFilters();
    });
  });
}
wirePillGroup(pillType);
wirePillGroup(pillSide);

// --------------------------
// 8) Click map => coords
// --------------------------
if (map) {
  map.addEventListener("click", (e) => {
    if (!coordsText) return;
    const rect = map.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width * 100).toFixed(1);
    const y = ((e.clientY - rect.top) / rect.height * 100).toFixed(1);
    coordsText.innerText = `x: ${x} | y: ${y}`;
  });
}

// --------------------------
// 9) Panels + overlays
// --------------------------
function openPopup(lineup, opts = {}) {
  if (!panelsLeft || !panelsRight) return;

  const forced = opts.forceSide; // "left" | "right" | undefined
  const targetPanels =
    forced === "left"  ? panelsLeft :
    forced === "right" ? panelsRight :
    (lineup.type === "smoke" ? panelsLeft : panelsRight);

  // already opened?
  const existingItem = document.querySelector(`.lineup-item[data-id="${CSS.escape(lineup.id)}"]`);
  if (existingItem) {
    const panel = existingItem.closest(".panel");
    if (panel) targetPanels.prepend(panel);
    setActiveLineup(panel, lineup.id);
    refreshActiveMarkers();
    return;
  }

  const isExecute = opts.mode === "execute";
  const key = isExecute ? getSpotKey(lineup) : getThrowKey(lineup);

  if (!key) {
    const panel = createGroupPanel(targetPanels, null, lineup);
    targetPanels.prepend(panel);
    appendLineupItem(panel, lineup);
    addOverlay(lineup, 0);
    renumberType(lineup.type);
    refreshActiveMarkers();
    return;
  }

  let groupPanel = document.querySelector(`.panel[data-throwkey="${CSS.escape(key)}"]`);

  if (!groupPanel) {
    groupPanel = createGroupPanel(targetPanels, key, lineup);
    if (isExecute) targetPanels.appendChild(groupPanel);
    else targetPanels.prepend(groupPanel);
  } else if (!isExecute) {
    targetPanels.prepend(groupPanel);
  }

  appendLineupItem(groupPanel, lineup);
  addOverlay(lineup, 0);
  renumberType(lineup.type);
  refreshActiveMarkers();
}

function createGroupPanel(targetPanels, throwKey, firstLineup) {
  const panel = document.createElement("div");
  panel.className = "panel";
  panel.dataset.type = firstLineup.type || "";
  if (throwKey) panel.dataset.throwkey = throwKey;

  panel.innerHTML = `
    <button class="close-btn" type="button" aria-label="Close">✕</button>
    <h2>${throwKey ? "Spot" : escapeHtml(firstLineup.name || firstLineup.id)}</h2>

    ${throwKey ? `
      ${imgTag("spot-img", pickSpotSrc(firstLineup), "spot")}
      <div class="panel-body">
        <div class="lineup-view"><div class="aim-list"></div></div>
        <div class="lineup-nav" aria-label="Lineups"></div>
      </div>
    ` : `
      <div class="panel-body">
        <div class="lineup-view"><div class="aim-list"></div></div>
        <div class="lineup-nav" aria-label="Lineups"></div>
      </div>
      ${imgTag("stand-img", pickImageSrc(firstLineup,"stand"), "stand")}
    `}
  `;

  panel.addEventListener("click", (e) => {
    const img = e.target.closest("img");
    if (!img) return;
    if (!img.src) return;
    openLightboxFromPanel(panel, img);
  });

  panel.querySelector(".close-btn").onclick = () => {
    panel.querySelectorAll(".lineup-item").forEach(item => removeOverlay(item.dataset.id));
    panel.remove();
    refreshActiveMarkers();
    renumberType(firstLineup.type);
  };

  targetPanels.prepend(panel);
  return panel;
}

function pickImageSrc(lu, preferred) {
  const imgs = lu && lu.images ? lu.images : {};
  const single = (imgs && (imgs.single || imgs.one)) || "";
  const stand  = (imgs && imgs.stand) || "";
  const aim    = (imgs && imgs.aim) || "";

  // Important: don't let a missing stand image fall back to aim,
  // otherwise you get duplicated aim images in panels.
  if (preferred === "stand") return stand || single || "";
  if (preferred === "aim")   return aim || stand || single || "";
  return stand || aim || single || "";
}

// Spot image should never fall back to aim (otherwise you'll see aim twice: spot + aim)
function pickSpotSrc(lu) {
  const imgs = lu && lu.images ? lu.images : {};
  const stand  = (imgs && imgs.stand) || "";
  const single = (imgs && (imgs.single || imgs.one)) || "";
  return stand || single || "";
}

function imgTag(cls, src, alt) {
  const s = String(src || "").trim();
  if (!s) return "";
  return `<img class="${cls}" src="${s}" alt="${alt || ""}">`;
}

// Build lightbox gallery items from a given popup panel
function openLightboxFromPanel(panel, clickedImgEl) {
  if (!panel) return;

  /** @type {{src:string,label:string}[]} */
  const items = [];

  // Spot (single)
  const spot = panel.querySelector("img.spot-img");
  if (spot && spot.src) items.push({ src: spot.src, label: "Spot" });

  // Collect lineup ids from both the list and the nav (some UIs switch via nav)
  const ids = [];
  panel.querySelectorAll(".lineup-item[data-id]").forEach(el => {
    const id = el.getAttribute("data-id");
    if (id) ids.push(id);
  });
  panel.querySelectorAll(".lineup-nav-btn[data-id]").forEach(el => {
    const id = el.getAttribute("data-id");
    if (id) ids.push(id);
  });

  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);

    const li = panel.querySelector(`.lineup-item[data-id="${CSS.escape(id)}"]`);
    const badge = li?.querySelector(".badge")?.textContent?.trim() || "";
    const domImg = li?.querySelector("img.aim-img");
    const domSrc = String(domImg?.src || "").trim();

    let src = domSrc;
    if (!src) {
      const lu = lineupsById.get(id);
      src = String(pickImageSrc(lu, "aim") || "").trim();
    }
    if (!src) continue;

    let label = badge;
    if (!label) {
      const navBtn = panel.querySelector(`.lineup-nav-btn[data-id="${CSS.escape(id)}"]`);
      label = (navBtn?.textContent || navBtn?.title || "").trim();
    }
    items.push({ src, label: label || "Aim" });
  }

  // Stand (optional)
  const stand = panel.querySelector("img.stand-img");
  if (stand && stand.src) items.push({ src: stand.src, label: "Stand" });

  // Determine start index based on clicked element
  const clickedSrc = String(clickedImgEl?.src || "").trim();
  let start = 0;
  if (clickedSrc) {
    const idx = items.findIndex(it => it.src === clickedSrc);
    if (idx >= 0) start = idx;
  }

  openLightboxGallery(items, start);
}


function setActiveLineup(panel, lineupId) {
  const items = Array.from(panel.querySelectorAll(".lineup-item"));
  if (items.length === 0) return;

  items.forEach(it => it.classList.toggle("is-active", it.dataset.id === lineupId));

  const btns = Array.from(panel.querySelectorAll(".lineup-nav-btn"));
  btns.forEach(b => b.classList.toggle("is-active", b.dataset.id === lineupId));
}

function ensureNavButton(panel, lineup) {
  const nav = panel.querySelector(".lineup-nav");
  if (!nav) return;

  // avoid duplicates
  if (nav.querySelector(`.lineup-nav-btn[data-id="${CSS.escape(lineup.id)}"]`)) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "lineup-nav-btn";
  btn.dataset.id = lineup.id;
  btn.dataset.type = lineup.type || "";
  btn.title = lineup.name || lineup.id || "";

  const key = (lineup.target || lineup.id || "").toString();
  btn.textContent = key;

  btn.onclick = (e) => {
    e.stopPropagation();
    setActiveLineup(panel, lineup.id);
  };

  nav.appendChild(btn);
}

function enableWheelSwitch(panel) {
  if (panel.dataset.wheelswitch === "1") return;
  panel.dataset.wheelswitch = "1";

  panel.addEventListener("wheel", (e) => {
    // only when pointer is over the panel (not the page)
    if (!panel.matches(":hover")) return;
    // allow natural scroll inside nav if it overflows
    const nav = panel.querySelector(".lineup-nav");
    const overNav = nav && nav.matches(":hover");

    const items = Array.from(panel.querySelectorAll(".lineup-item"));
    if (items.length <= 1) return;

    // prevent page scroll / map scroll
    e.preventDefault();

    // find active index
    let idx = items.findIndex(it => it.classList.contains("is-active"));
    if (idx < 0) idx = 0;

    const dir = e.deltaY > 0 ? 1 : -1;
    idx = (idx + dir + items.length) % items.length;

    const nextId = items[idx].dataset.id;
    if (nextId) setActiveLineup(panel, nextId);

    // keep nav scrolled to active
    const activeBtn = panel.querySelector(`.lineup-nav-btn.is-active`);
    if (activeBtn && overNav) activeBtn.scrollIntoView({ block: "nearest" });
  }, { passive: false });
}
function appendLineupItem(panel, lineup) {
  const list = panel.querySelector(".aim-list");
  if (!list) return;

  const item = document.createElement("div");
  item.className = "lineup-item";
  item.dataset.id = lineup.id;
  item.dataset.key = (lineup.target || lineup.id);
  item.dataset.type = lineup.type || "";

  item.innerHTML = `
    <div class="lineup-item-head">
      <span class="badge"></span>
      <div class="lineup-item-title">
        <div class="lineup-name">${escapeHtml(lineup.name || lineup.id)}</div>
        <div class="lineup-desc">${escapeHtml(lineup.description || "")}</div>
      </div>
      <button class="item-close" type="button" aria-label="Close">✕</button>
    </div>
    ${imgTag("aim-img", pickImageSrc(lineup,"aim"), "aim")}
  `;

  item.querySelector(".item-close").onclick = () => {
    removeOverlay(lineup.id);
    item.remove();

    if (panel.querySelectorAll(".lineup-item").length === 0) panel.remove();
    refreshActiveMarkers();
    renumberType(lineup.type);
  };

  list.appendChild(item);

  // if nothing selected yet, select the newly added item
  const hasActive = panel.querySelector(".lineup-item.is-active");
  if (!hasActive) setActiveLineup(panel, lineup.id);
}

// overlays (throw arrow + throw marker)
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
  // Stop the line a bit before the target icon so it doesn't go "into" it
  const end = shortenEndByPx(start, target, 22);

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
  throwEl.className = `throw-marker ${lineup.type || ""}`.trim();
  throwEl.style.left = lineup.throw.x + "%";
  throwEl.style.top  = lineup.throw.y + "%";

  // group key for stacking labels at the same throw point
  throwEl.dataset.throwpos = `${round1(lineup.throw.x)}|${round1(lineup.throw.y)}`;

  const label = document.createElement("div");
  label.className = "throw-label";
  const prefix = lineup.type === "smoke" ? "S" : (lineup.type === "flash" ? "F" : "M");
  label.textContent = `${prefix}${badgeNum}`;

  throwEl.appendChild(label);
  container.appendChild(throwEl);

  overlays.set(lineup.id, { line, throwEl, label, type: lineup.type });
  layoutThrowStacks();
}

function removeOverlay(lineupId) {
  const o = overlays.get(lineupId);
  if (!o) return;
  o.line.remove();
  o.throwEl.remove();
  overlays.delete(lineupId);
  layoutThrowStacks();
}

function renumberType(type) {
  const prefix = type === "smoke" ? "S" : (type === "flash" ? "F" : "M");
  const items = Array.from(document.querySelectorAll(`.lineup-item[data-type="${CSS.escape(type)}"]`));

  items.forEach((item, index) => {
    const num = index + 1;
    const id = item.dataset.id;
    const badge = item.querySelector(".badge");
    if (badge) badge.textContent = `${prefix}${num}`;
    const o = overlays.get(id);
    if (o && o.label) o.label.textContent = `${prefix}${num}`;
  });

  layoutThrowStacks();
}


function layoutThrowStacks() {
  // Stack labels for throw points that share the same coordinates
  const all = Array.from(document.querySelectorAll(".throw-marker"));
  const groups = new Map();

  for (const el of all) {
    const k = el.dataset.throwpos || "";
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(el);
  }

  for (const els of groups.values()) {
    els.sort((a, b) => {
      const ta = (a.querySelector(".throw-label")?.textContent || "");
      const tb = (b.querySelector(".throw-label")?.textContent || "");
      return ta.localeCompare(tb, undefined, { numeric: true });
    });

    els.forEach((el, i) => {
      const lab = el.querySelector(".throw-label");
      if (!lab) return;
      lab.style.top = (-6 + i * 12) + "px";
      lab.style.left = "14px";
    });
  }
}


// geometry utils
function getMapRect() { return map.getBoundingClientRect(); }
function percentToPx(p, axis) { const r = getMapRect(); return (axis === "x" ? r.width : r.height) * (p / 100); }
function pxToPercent(px, axis) { const r = getMapRect(); return 100 * (px / (axis === "x" ? r.width : r.height)); }
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

  return { x: pxToPercent(ex - ux * offsetPx, "x"), y: pxToPercent(ey - uy * offsetPx, "y") };
}
function round1(n) { return Math.round(n * 10) / 10; }

function getSpotKey(lu) {
  if (!lu.throw) return null;
  if (lu.spotKey) return lu.spotKey;
  return `${lu.side}|${round1(lu.throw.x)}|${round1(lu.throw.y)}`;
}
function getThrowKey(lu) {
  if (!lu.throw) return null;
  return `${lu.type}|${lu.side}|${round1(lu.throw.x)}|${round1(lu.throw.y)}`;
}

// --------------------------
// 10) Executes
// --------------------------
function closeAllPanels() {
  document.querySelectorAll(".panel .close-btn").forEach(btn => btn.click());
  refreshActiveMarkers();
}

function openExecute(exec) {
  if (!exec || !Array.isArray(exec.items)) return;
  exec.items.forEach(id => {
    const lu = lineupsById.get(id);
    if (!lu) return console.warn("Execute: lineup introuvable:", id);
    openPopup(lu, { forceSide: "left", mode: "execute" });
  });
}

function renderExecutes() {
  if (!executesBox || !execGrid) return;

  // Clear button is global (closes panels), must always be available
  if (execClear) execClear.onclick = closeAllPanels;

  executesBox.style.display = "block";
  execGrid.innerHTML = "";

  // If there are no executes, keep only the Clear button visible
  if (!Array.isArray(executes) || executes.length === 0) {
    execGrid.style.display = "none";
    return;
  }

  execGrid.style.display = "grid";

  executes.forEach(exec => {
    const btn = document.createElement("button");
    btn.className = "exec-btn";

    const side = String(exec.side || "").trim().toUpperCase();
    if (side === "T") btn.classList.add("exec-t");
    else if (side === "CT") btn.classList.add("exec-ct");

    // Bonus prefix
    const prefix = (side === "T") ? "T • " : (side === "CT") ? "CT • " : "";
    btn.textContent = prefix + (exec.name || exec.id || "Execute");

    // Store side for filtering
    btn.dataset.side = side;

    // Store types present in this execute (derived from lineup items)
    const typeSet = new Set();
    if (exec && Array.isArray(exec.items)) {
      exec.items.forEach(id => {
        const lu = lineupsById.get(id);
        if (lu && lu.type) typeSet.add(String(lu.type).trim());
      });
    }
    btn.dataset.types = Array.from(typeSet).join(",");

    btn.onclick = () => openExecute(exec);
    execGrid.appendChild(btn);
  });

  // Apply current filters to executes immediately
  updateExecFilters();
}


function updateExecFilters(typesToUse, sidesToUse, nothingSelected) {
  if (!executesBox || !execGrid) return;

  // Determine whether NO pill is active (=> hide everything)
  const noTypeSelected = pillType.every(b => !b.classList.contains("active"));
  const noSideSelected = pillSide.every(b => !b.classList.contains("active"));
  const none = (typeof nothingSelected === "boolean") ? nothingSelected : (noTypeSelected || noSideSelected);

  // With the old fallback logic, types/sides may come in as "all values".
  // We still use them for normal filtering when something is selected.
  const types = (Array.isArray(typesToUse) && typesToUse.length)
    ? typesToUse
    : getActivePills(pillType, ["smoke", "flash", "molotov"]);

  const sides = (Array.isArray(sidesToUse) && sidesToUse.length)
    ? sidesToUse
    : getActivePills(pillSide, ["T", "CT"]);

  const btns = Array.from(execGrid.querySelectorAll(".exec-btn"));

  // Never hide the whole box: Clear closes panels too
  executesBox.style.display = "block";

  if (btns.length === 0) {
    execGrid.style.display = "none";
    return;
  }

  if (none) {
    btns.forEach(b => (b.style.display = "none"));
    execGrid.style.display = "none";
    return;
  }

  let anyVisible = false;

  btns.forEach(btn => {
    const side = String(btn.dataset.side || "").toUpperCase();
    const okSide = !side || sides.includes(side);

    const typeList = String(btn.dataset.types || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    const okType = (typeList.length === 0) ? true : typeList.some(t => types.includes(t));

    const show = okSide && okType;
    btn.style.display = show ? "inline-flex" : "none";
    if (show) anyVisible = true;
  });

  execGrid.style.display = anyVisible ? (execGrid.style.display === "grid" ? "grid" : "grid") : "none";
}

// --------------------------
// 11) Groups
// --------------------------
const GROUPS_KEY = "cs2_user_groups_v2";
let userGroups = [];

function loadGroups() {
  try { userGroups = JSON.parse(localStorage.getItem(GROUPS_KEY) || "[]"); }
  catch { userGroups = []; }
  if (!Array.isArray(userGroups)) userGroups = [];
}

function saveGroups() {
  localStorage.setItem(GROUPS_KEY, JSON.stringify(userGroups));
}

function ensureGroupsDock() {
  if (groupsDock && groupsList && addGroupBtn) return;

  groupsDock = document.createElement("aside");
  groupsDock.id = "groups-dock";
  groupsDock.className = "groups-dock";
  groupsDock.innerHTML = `
    <div class="groups-title">My Groups</div>
    <div id="user-groups-list" class="groups-list"></div>
    <button id="add-group" class="groups-create" type="button">+ Create group</button>
  `;
  document.body.appendChild(groupsDock);
  groupsList = document.getElementById("user-groups-list");
  addGroupBtn = document.getElementById("add-group");
}

function renderGroups() {
  ensureGroupsDock();
  if (!groupsList) return;

  groupsList.innerHTML = "";

  if (userGroups.length === 0) {
    const empty = document.createElement("div");
    empty.className = "groups-empty";
    empty.textContent = 'No groups yet. Click "Create group".';
    groupsList.appendChild(empty);
    return;
  }

  userGroups.forEach(group => {
    const row = document.createElement("div");
    row.className = "group-row";

    const nameBtn = document.createElement("button");
    nameBtn.type = "button";
    nameBtn.className = "group-name";
    nameBtn.textContent = group.name || "Unnamed";
    nameBtn.onclick = () => openGroup(group);

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "icon-btn";
    editBtn.textContent = "✎";
    editBtn.title = "Edit";
    editBtn.onclick = () => editGroup(group.id);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "icon-btn danger";
    delBtn.textContent = "🗑";
    delBtn.title = "Delete";
    delBtn.onclick = () => deleteGroup(group.id);

    row.appendChild(nameBtn);
    row.appendChild(editBtn);
    row.appendChild(delBtn);
    groupsList.appendChild(row);
  });
}

function openGroup(group) {
  if (!group || !Array.isArray(group.items)) return;
  group.items.forEach(id => {
    const lu = lineupsById.get(id);
    if (lu) openPopup(lu, { mode: "group" });
  });
}

function deleteGroup(groupId) {
  const g = userGroups.find(x => x.id === groupId);
  if (!g) return;
  openModal({
    title: "Delete group",
    body: `<div class="ui-text">Delete "<b>${escapeHtml(g.name)}</b>" ?</div>`,
    actions: [
      { label: "Cancel", className: "ui-btn ui-btn-weak", onClick: closeModal },
      { label: "Delete", className: "ui-btn ui-btn-danger", onClick: () => {
          userGroups = userGroups.filter(x => x.id !== groupId);
          saveGroups();
          renderGroups();
          closeModal();
        }
      }
    ]
  });
}

function createOrEditGroupModal(existing) {
  const isEdit = !!existing;
  const initialName = existing?.name || "";
  const initialSelected = new Set(existing?.items || []);

  // Step 1: name
  openModal({
    title: isEdit ? "Edit group" : "Create group",
    body: `
      <label class="ui-field">
        <div class="ui-label">Group name</div>
        <input id="g-name" class="ui-input" value="${escapeHtml(initialName)}" placeholder="e.g. B Retake smokes">
      </label>
    `,
    actions: [
      { label: "Cancel", className: "ui-btn ui-btn-weak", onClick: closeModal },
      { label: "Next", className: "ui-btn ui-btn-primary", onClick: () => {
          const name = (document.getElementById("g-name")?.value || "").trim();
          openSelectLineupsModal({
            title: "Select lineups",
            selected: initialSelected,
            onDone: (sel) => {
              const items = Array.from(sel);
              if (!name) return;
              if (isEdit) {
                existing.name = name;
                existing.items = items;
              } else {
                userGroups.push({ id: crypto.randomUUID(), name, items });
              }
              saveGroups();
              renderGroups();
              closeModal();
            }
          });
        }
      }
    ]
  });
}

function editGroup(groupId) {
  const g = userGroups.find(x => x.id === groupId);
  if (!g) return;
  createOrEditGroupModal(g);
}

function openSelectLineupsModal({ title, selected, onDone }) {
  // Source list (do NOT mutate the global `lineups` const)
  const sourceLineups = Array.isArray(lineups) ? lineups : [];

  // UI
  const body = document.createElement("div");
  body.className = "select-wrap";

  body.innerHTML = `
    <div class="select-top">
      <div class="select-search">
        <div class="ui-label">Search</div>
        <input class="ui-input" id="sel-q" placeholder="Search by name / variant / id...">
      </div>
      <div class="select-filters">
        <button class="chip active" data-type="smoke">Smoke</button>
        <button class="chip active" data-type="flash">Flash</button>
        <button class="chip active" data-type="molotov">Molotov</button>
      </div>
    </div>
    <div class="select-list" id="sel-list"></div>
  `;

  const actions = [
    { label: "Cancel", className: "ui-btn ui-btn-weak", onClick: closeModal },
    { label: "Done", className: "ui-btn ui-btn-primary", onClick: () => onDone && onDone(selected) }
  ];

  openModal({ title, body: "", actions });
  uiModalBody.innerHTML = "";
  uiModalBody.appendChild(body);

  const q = body.querySelector("#sel-q");
  const listEl = body.querySelector("#sel-list");
  const chips = Array.from(body.querySelectorAll(".chip"));

  function activeTypes() {
    const a = chips.filter(c => c.classList.contains("active")).map(c => c.dataset.type);
    return a.length ? a : ["smoke","flash","molotov"];
  }

  chips.forEach(ch => ch.addEventListener("click", () => { ch.classList.toggle("active"); render(); }));

  function render() {
    const query = (q.value || "").trim().toLowerCase();
    const types = new Set(activeTypes());

    const filtered = sourceLineups
      .filter(lu => lu && lu.id)
      .filter(lu => types.has(lu.type))
      .filter(lu => {
        if (!query) return true;
        const hay = `${lu.name||""} ${lu.variant||""} ${lu.id||""}`.toLowerCase();
        return hay.includes(query);
      })
      .sort((a,b) => (a.name||a.id).localeCompare(b.name||b.id));

    listEl.innerHTML = "";
    filtered.forEach(lu => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "select-row";
      row.dataset.id = lu.id;

      const isSel = selected.has(lu.id);
      row.classList.toggle("selected", isSel);

      row.innerHTML = `
        <div class="select-row-main">
          <div class="select-row-name">${escapeHtml(lu.name || lu.id)}</div>
          <div class="select-row-sub">${escapeHtml((lu.variant ? `${lu.variant} · ` : "") + `${lu.side||""} ${lu.type||""}`)}</div>
        </div>
        <div class="type-pill ${lu.type}">${escapeHtml((lu.type||"").toUpperCase())}</div>
      `;

      row.addEventListener("click", () => {
        if (selected.has(lu.id)) selected.delete(lu.id);
        else selected.add(lu.id);
        row.classList.toggle("selected", selected.has(lu.id));
      });

      listEl.appendChild(row);
    });
  }

  q.addEventListener("input", render);
  render();
}

function wireGroups() {
  ensureGroupsDock();
  loadGroups();
  renderGroups();

  if (addGroupBtn) {
    addGroupBtn.onclick = () => createOrEditGroupModal(null);
  }
}

// --------------------------
// 12) Init
// --------------------------
buildMarkers();
updateFilters();
renderExecutes();
wireGroups();
refreshActiveMarkers();
