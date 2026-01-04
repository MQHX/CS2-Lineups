// ==========================
// 0) DOM
// ==========================
const container   = document.getElementById("map-container");
const map         = document.getElementById("map");
const coordsText  = document.getElementById("coords");

const panelsLeft  = document.getElementById("panels-left");
const panelsRight = document.getElementById("panels-right");

const overlay     = document.getElementById("map-overlay");


// ==========================
// UNIVERSAL MODAL (no browser prompt/confirm)
// ==========================
const UIModal = (() => {
  const root = document.getElementById("ui-modal");
  const titleEl = document.getElementById("ui-modal-title");
  const bodyEl  = document.getElementById("ui-modal-body");
  const actionsEl = document.getElementById("ui-modal-actions");
  const closeBtn = document.getElementById("ui-modal-x");

  let onClose = null;

  function close() {
    if (!root) return;
    root.classList.add("hidden");
    root.setAttribute("aria-hidden", "true");
    bodyEl && (bodyEl.innerHTML = "");
    actionsEl && (actionsEl.innerHTML = "");
    if (typeof onClose === "function") onClose();
    onClose = null;
  }

  function open({ title, body, actions = [], closeOnBackdrop = true, onCloseCb = null }) {
    if (!root || !titleEl || !bodyEl || !actionsEl) {
      console.warn("Modal DOM missing (#ui-modal, #ui-modal-title, #ui-modal-body, #ui-modal-actions).");
      return;
    }
    onClose = onCloseCb;

    titleEl.textContent = title || "";
    bodyEl.innerHTML = "";
    if (typeof body === "string") bodyEl.innerHTML = body;
    else if (body instanceof Node) bodyEl.appendChild(body);

    actionsEl.innerHTML = "";
    actions.forEach(a => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `ui-btn ${a.variant || ""}`.trim();
      b.textContent = a.label || "OK";
      if (a.disabled) b.disabled = true;
      b.onclick = () => a.onClick?.();
      actionsEl.appendChild(b);
    });

    root.classList.remove("hidden");
    root.setAttribute("aria-hidden", "false");

    // wiring
    if (closeBtn) closeBtn.onclick = close;

    const backdrop = root.querySelector(".ui-modal__backdrop");
    if (backdrop) {
      backdrop.onclick = () => { if (closeOnBackdrop) close(); };
    }

    document.addEventListener("keydown", escClose, { once: true });
    function escClose(e) {
      if (e.key === "Escape") close();
      else document.addEventListener("keydown", escClose, { once: true });
    }
  }

  function confirm({ title, message, confirmText = "Confirm", cancelText = "Cancel", danger = false }) {
    return new Promise(resolve => {
      const body = document.createElement("div");
      body.textContent = message || "";
      open({
        title,
        body,
        actions: [
          { label: cancelText, onClick: () => { resolve(false); close(); } },
          { label: confirmText, variant: danger ? "danger" : "primary", onClick: () => { resolve(true); close(); } },
        ],
        onCloseCb: () => resolve(false)
      });
    });
  }

  function prompt({ title, label, placeholder = "", value = "", confirmText = "OK", cancelText = "Cancel" }) {
    return new Promise(resolve => {
      const wrap = document.createElement("div");

      const field = document.createElement("div");
      field.className = "ui-field";

      const lab = document.createElement("label");
      lab.textContent = label || "";

      const input = document.createElement("input");
      input.className = "ui-input";
      input.placeholder = placeholder;
      input.value = value;

      field.append(lab, input);
      wrap.appendChild(field);

      const submit = () => {
        const v = input.value.trim();
        if (!v) return;
        resolve(v);
        close();
      };

      open({
        title,
        body: wrap,
        actions: [
          { label: cancelText, onClick: () => { resolve(null); close(); } },
          { label: confirmText, variant: "primary", onClick: submit }
        ],
        onCloseCb: () => resolve(null)
      });

      setTimeout(() => input.focus(), 0);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    });
  }

  function selectList({ title, items, multi = false, selected = new Set(), confirmText = "Select", cancelText = "Cancel", searchable = true, searchPlaceholder = "Search..." }) {
    return new Promise(resolve => {
      const wrap = document.createElement("div");

      let query = "";
      const sel = new Set(selected);

      let search = null;
      if (searchable) {
        const field = document.createElement("div");
        field.className = "ui-field";
        const lab = document.createElement("label");
        lab.textContent = "Search";
        search = document.createElement("input");
        search.className = "ui-input";
        search.placeholder = searchPlaceholder;
        field.append(lab, search);
        wrap.appendChild(field);
      }

      const list = document.createElement("div");
      list.className = "ui-list";
      wrap.appendChild(list);

      function render() {
        list.innerHTML = "";
        const filtered = items.filter(it => {
          if (!query) return true;
          const hay = `${it.title||""} ${it.sub||""}`.toLowerCase();
          return hay.includes(query.toLowerCase());
        });

        filtered.forEach(it => {
          const row = document.createElement("div");
          row.className = "ui-item";
          if (sel.has(it.id)) row.classList.add("selected");

          const meta = document.createElement("div");
          meta.className = "meta";
          const t = document.createElement("div");
          t.className = "title";
          t.textContent = it.title;
          const sub = document.createElement("div");
          sub.className = "sub";
          sub.textContent = it.sub || "";
          meta.append(t, sub);

          const chip = document.createElement("div");
          chip.className = "ui-chip";
          chip.textContent = it.chip || (sel.has(it.id) ? "Selected" : ""); 
          if (!chip.textContent) chip.style.visibility = "hidden";

          row.append(meta, chip);

          row.onclick = () => {
            if (multi) {
              if (sel.has(it.id)) sel.delete(it.id);
              else sel.add(it.id);
              render();
            } else {
              resolve(it.id);
              close();
            }
          };

          list.appendChild(row);
        });
      }

      render();

      if (search) {
        search.addEventListener("input", () => { query = search.value; render(); });
        setTimeout(() => search.focus(), 0);
      }

      const submit = () => {
        resolve(sel);
        close();
      };

      open({
        title,
        body: wrap,
        actions: [
          { label: cancelText, onClick: () => { resolve(null); close(); } },
          { label: confirmText, variant: "primary", onClick: submit }
        ],
        onCloseCb: () => resolve(null)
      });
    });
  }

  return { open, close, confirm, prompt, selectList };
})();

// ==========================
// USER GROUPS (per-map, local only)
// - Create / Open / Edit / Delete
// ==========================
const UG_params = new URLSearchParams(location.search);
const UG_rawMap = UG_params.get("map") || "default";
const UG_mapKey = String(UG_rawMap).toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
const UG_storageKey = `cs2_user_groups_${UG_mapKey}`;

let userGroups = JSON.parse(localStorage.getItem(UG_storageKey) || "[]");

function saveUserGroups() {
  localStorage.setItem(UG_storageKey, JSON.stringify(userGroups));
}

function ensureUserGroupsUI() {
  const template = `
    <div class="ug-head">
      <div class="ug-title">My Groups</div>
    </div>

    <div id="user-groups-list" class="ug-list"></div>

    <button id="add-group" class="ug-create" type="button">＋ Create group</button>
  `;

  // If the container already exists (older UI), normalize it.
  const existing = document.getElementById("user-groups");
  if (existing) {
    existing.innerHTML = template;
    return;
  }

  // Otherwise create it and place it before the right panel.
  if (!panelsRight || !panelsRight.parentElement) return;

  const wrap = document.createElement("div");
  wrap.id = "user-groups";
  wrap.innerHTML = template;

  panelsRight.parentElement.insertBefore(wrap, panelsRight);
}

function ugGetOpenIdsPrefill() {
  return Array.from(document.querySelectorAll(".lineup-item[data-id]"))
    .map(el => el.dataset.id)
    .filter(Boolean)
    .join(", ");
}

function ugGetLineupById(id) {
  // Prefer the fast index, fallback to array search
  if (typeof lineupsById !== "undefined" && lineupsById && lineupsById.get) {
    const lu = lineupsById.get(id);
    if (lu) return lu;
  }
  if (Array.isArray(lineups)) return lineups.find(l => l.id === id);
  return null;
}

function openGroup(group) {
  group.items.forEach(id => {
    const lu = ugGetLineupById(id);
    if (lu) openPopup(lu, { mode: "group" });
  });
}

async function modalPickGroupName(existing) {
  return await UIModal.prompt({
    title: existing ? "Edit group" : "Create group",
    label: "Group name",
    placeholder: "e.g. B Retake smokes",
    value: existing?.name || "",
    confirmText: existing ? "Save" : "Create"
  });
}

function lineupItemsForPicker() {
  const arr = Array.isArray(lineups) ? lineups.slice() : [];
  arr.sort((a,b) => (a.name||a.id).localeCompare(b.name||b.id));
  return arr.map(lu => ({
    id: lu.id,
    title: `${lu.name || lu.id}`,
    sub: `${(lu.variant || "").trim()}${lu.variant ? " · " : ""}${(lu.side||"").trim()} ${lu.type || ""}`.trim(),
    chip: (lu.type || "").toUpperCase(),
    type: (lu.type || "").toLowerCase()
  }));
}

async function modalPickGroupItems(existing) {
  // Custom multi-select modal with Search + Type filters + Done button
  const pre = new Set(existing?.items || []);
  const items = lineupItemsForPicker(); // {id,title,sub,chip,type}

  return await new Promise(resolve => {
    const wrap = document.createElement("div");

    // Search
    let query = "";
    const searchField = document.createElement("div");
    searchField.className = "ui-field";
    const searchLab = document.createElement("label");
    searchLab.textContent = "Search";
    const search = document.createElement("input");
    search.className = "ui-input";
    search.placeholder = "Search by name / variant / id…";
    searchField.append(searchLab, search);
    wrap.appendChild(searchField);

    // Filters (type pills)
    const filters = document.createElement("div");
    filters.className = "pillbar modal-pillbar";
    filters.innerHTML = `
      <div class="pill-group" data-group="modal-type">
        <button class="pill active" type="button" data-value="smoke">Smoke</button>
        <button class="pill active" type="button" data-value="flash">Flash</button>
        <button class="pill active" type="button" data-value="molotov">Molotov</button>
      </div>
    `;
    wrap.appendChild(filters);

    // List
    const list = document.createElement("div");
    list.className = "ui-list";
    wrap.appendChild(list);

    const sel = new Set(pre);
    const activeTypes = new Set(["smoke","flash","molotov"]);

    function updateDoneButton() {
      const btn = document.querySelector("#ui-modal-actions .ui-btn.primary");
      if (!btn) return;
      btn.textContent = sel.size ? `Done (${sel.size})` : "Done";
      btn.disabled = sel.size === 0;
    }

    function render() {
      list.innerHTML = "";

      const q = query.trim().toLowerCase();
      const filtered = items.filter(it => {
        if (it.type && !activeTypes.has(it.type)) return false;
        if (!q) return true;
        const hay = `${it.title||""} ${it.sub||""} ${it.id||""}`.toLowerCase();
        return hay.includes(q);
      });

      filtered.forEach(it => {
        const row = document.createElement("div");
        row.className = "ui-item";
        if (sel.has(it.id)) row.classList.add("selected");

        const meta = document.createElement("div");
        meta.className = "meta";
        const t = document.createElement("div");
        t.className = "title";
        t.textContent = it.title;
        const sub = document.createElement("div");
        sub.className = "sub";
        sub.textContent = it.sub || "";
        meta.append(t, sub);

        const chip = document.createElement("div");
        chip.className = `ui-chip chip-${it.type||""}`.trim();
        chip.textContent = it.chip || "";
        if (!chip.textContent) chip.style.visibility = "hidden";

        row.append(meta, chip);

        row.onclick = () => {
          if (sel.has(it.id)) sel.delete(it.id);
          else sel.add(it.id);
          render();
          updateDoneButton();
        };

        list.appendChild(row);
      });

      updateDoneButton();
    }

    // pill toggles
    filters.querySelectorAll(".pill").forEach(btn => {
      btn.addEventListener("click", () => {
        const v = btn.dataset.value;
        const isActive = btn.classList.toggle("active");
        if (isActive) activeTypes.add(v);
        else activeTypes.delete(v);

        // Never allow empty => keep at least one active
        if (activeTypes.size === 0) {
          activeTypes.add(v);
          btn.classList.add("active");
        }
        render();
      });
    });

    // search input
    search.addEventListener("input", () => { query = search.value; render(); });

    const submit = () => {
      if (sel.size === 0) return; // blocked by disabled
      resolve(Array.from(sel));
      UIModal.close();
    };

    UIModal.open({
      title: "Select lineups",
      body: wrap,
      closeOnBackdrop: false,
      actions: [
        { label: "Cancel", onClick: () => { resolve(null); UIModal.close(); } },
        { label: "Done", variant: "primary", onClick: submit, disabled: sel.size === 0 }
      ],
      onCloseCb: () => resolve(null)
    });

    setTimeout(() => search.focus(), 0);
    render();
  });
}

async function editGroup(group) {
  const name = await modalPickGroupName(group);
  if (!name) return;

  const items = await modalPickGroupItems(group);
  if (!items) return;

  group.name = name;
  group.items = items;
  saveUserGroups();
  renderUserGroups();
}

async function deleteGroup(group) {
  const ok = await UIModal.confirm({
    title: "Delete group",
    message: `Delete group "${group.name}" ?`,
    confirmText: "Delete",
    danger: true
  });
  if (!ok) return;

  userGroups = userGroups.filter(g => g.id !== group.id);
  saveUserGroups();
  renderUserGroups();
}
function renderUserGroups() {
  const box = document.getElementById("user-groups-list");
  if (!box) return;

  box.innerHTML = "";

  if (!userGroups.length) {
    const empty = document.createElement("div");
    empty.className = "ug-empty";
    empty.textContent = "No groups yet. Click “Create group”.";
    box.appendChild(empty);
    return;
  }

  userGroups.forEach(group => {
    const row = document.createElement("div");
    row.className = "ug-row";

    const openBtn = document.createElement("button");
    openBtn.className = "ug-open";
    openBtn.type = "button";
    openBtn.innerHTML = `
      <span class="ug-name">${escapeHtml(group.name)}</span>
      <span class="ug-count">${group.items?.length || 0}</span>
    `;
    openBtn.onclick = () => openGroup(group);

    const actions = document.createElement("div");
    actions.className = "ug-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "ug-action";
    editBtn.type = "button";
    editBtn.title = "Edit group";
    editBtn.innerHTML = pencilSvg();
    editBtn.onclick = () => editGroup(group);

    const delBtn = document.createElement("button");
    delBtn.className = "ug-action ug-danger";
    delBtn.type = "button";
    delBtn.title = "Delete group";
    delBtn.innerHTML = trashSvg();
    delBtn.onclick = () => deleteGroup(group);

    actions.append(editBtn, delBtn);
    row.append(openBtn, actions);
    box.appendChild(row);
  });
}

function bindAddGroupButton() {
  const btn = document.getElementById("add-group");
  if (!btn) return;
  if (btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";

  btn.onclick = async () => {
    const name = await modalPickGroupName(null);
    if (!name) return;

    const items = await modalPickGroupItems({ items: ugGetOpenIdsPrefill().split(',').map(s=>s.trim()).filter(Boolean) });
    if (!items) return;

    userGroups.push({
      id: crypto.randomUUID(),
      name,
      items
    });

    saveUserGroups();
    renderUserGroups();
  };
}

// small helpers

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[m]));
}

function pencilSvg() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"></path>
      <path d="M20.71 7.04a1.003 1.003 0 0 0 0-1.42L18.37 3.29a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.83z"></path>
    </svg>
  `;
}

function trashSvg() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 7h12l-1 14H7L6 7z"></path>
      <path d="M9 4h6l1 2H8l1-2z"></path>
    </svg>
  `;
}




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

// Filtres (pills)
const filterPills = document.querySelectorAll("#filters .pill");

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
// 4) Chooser (variants) — now uses Universal Modal
// ==========================

function openChooser(group) {
  // Modal single-select (clean)
  group.sort((a, b) => (a.variant || a.name || a.id).localeCompare(b.variant || b.name || b.id));

  const items = group.map(lu => ({
    id: lu.id,
    title: lu.variant || lu.name || lu.id,
    sub: lu.description || lu.side || lu.type || "",
    chip: lu.type ? lu.type.toUpperCase() : ""
  }));

  UIModal.selectList({
    title: `${group[0].name || "Lineup"} — ${group.length} variants`,
    items,
    multi: false,
    searchable: false
  }).then(id => {
    if (!id) return;
    const lu = group.find(x => x.id === id);
    if (lu) openPopup(lu);
  });
}

// ==========================
// 5) Markers (groupés par target)
// ==========================
function buildMarkers() {
  if (!Array.isArray(lineups) || !container) return;

  const lineupsByTarget = new Map();

  lineups.forEach(lu => {
    const key = (lu.target && String(lu.target).trim()) ? lu.target : lu.id;
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
// 6) Filtres (pills)
// ==========================
function getActiveValues(groupName, allowed) {
  const group = document.querySelector(`.pill-group[data-group="${groupName}"]`);
  if (!group) return allowed.slice();

  const active = Array.from(group.querySelectorAll(".pill.active"))
    .map(b => b.dataset.value)
    .filter(v => allowed.includes(v));

  return active.length ? active : allowed.slice();
}

function updateFilters() {
  const typesToUse = getActiveValues("type", ["smoke","flash","molotov"]);
  const sidesToUse = getActiveValues("side", ["T","CT"]);

  markers.forEach(m => {
    const okType = typesToUse.includes(m.type);
    const okSide = sidesToUse.includes(m.side);
    m.marker.style.display = (okType && okSide) ? "block" : "none";
  });
}

// toggle pills
filterPills.forEach(p => p.addEventListener("click", () => {
  p.classList.toggle("active");
  updateFilters();
}));

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

  // Si déjà ouvert : remonter le panel + refresh overlays
  const existingItem = document.querySelector(`.lineup-item[data-id="${lineup.id}"]`);
  if (existingItem) {
    const panel = existingItem.closest(".panel");
    if (panel) targetPanels.prepend(panel);
    return;
  }

  const isExecute = opts.mode === "execute";
  const key = isExecute
    ? getSpotKey(lineup)
    : (lineup.throwKey || getThrowKey(lineup));

  // Sans throw => panel simple
  if (!key) {
    const panel = createGroupPanel(targetPanels, null, lineup);
    targetPanels.prepend(panel);
    addOverlay(lineup, 0);
    renumberType(lineup.type);
    return;
  }

  // Cherche d'abord dans la colonne cible (sinon global)
  let groupPanel = targetPanels.querySelector(`.panel[data-throwkey="${CSS.escape(key)}"]`)
                || document.querySelector(`.panel[data-throwkey="${CSS.escape(key)}"]`);

  if (!groupPanel) {
    groupPanel = createGroupPanel(targetPanels, key, lineup);
  } else {
    // remonter le panel groupé
    targetPanels.prepend(groupPanel);
    // ajoute l'item (visée)
    appendLineupItem(groupPanel, lineup);
  }

  addOverlay(lineup, 0);
  renumberType(lineup.type);
}

function createGroupPanel(targetPanels, throwKey, firstLineup) {
  const panel = document.createElement("div");
  panel.className = "panel";
  panel.dataset.type = firstLineup.type;
  if (throwKey) panel.dataset.throwkey = throwKey;

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

  // Lightbox sur toutes les images
  panel.addEventListener("click", (e) => {
    const img = e.target.closest("img");
    if (!img || !img.src) return;
    openLightbox(img.src);
  });

  // fermer le panel : ferme toutes les lineups dedans
  panel.querySelector(".close-btn").onclick = () => {
    panel.querySelectorAll(".lineup-item").forEach(item => removeOverlay(item.dataset.id));
    panel.remove();
    renumberType(firstLineup.type);
  };

  targetPanels.prepend(panel);

  // panel simple : on ajoute l'image spot en dessous du titre
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

    <img class="aim-img" src="${lineup.images?.aim || ""}" alt="aim">
  `;

  item.querySelector(".item-close").onclick = () => {
    removeOverlay(lineup.id);
    item.remove();
    if (panel.querySelectorAll(".lineup-item").length === 0) panel.remove();
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

  const grid = document.getElementById("exec-grid");
  const clearBtn = document.getElementById("exec-clear");

  // Pas d'executes sur cette map
  if (typeof executes === "undefined" || !Array.isArray(executes) || executes.length === 0) {
    executesBox.style.display = "none";
    return;
  }

  executesBox.style.display = "block";
  if (grid) grid.innerHTML = "";

  if (clearBtn) {
    clearBtn.onclick = closeAllPanels;
    clearBtn.style.display = "inline-flex";
  }

  executes.forEach(exec => {
    const btn = document.createElement("button");
    btn.className = "exec-btn";
    btn.type = "button";
    btn.textContent = exec.name || exec.id;
    btn.onclick = () => openExecute(exec);
    (grid || executesBox).appendChild(btn);
  });
}


// ==========================
// 11) Init
// ==========================
ensureUserGroupsUI();
buildMarkers();
updateFilters();
renderExecutes();
renderUserGroups();
bindAddGroupButton();
