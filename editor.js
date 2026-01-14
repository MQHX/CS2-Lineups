// CS2 Lineups — Editor (FIXED)
// - No missing DOM references
// - Loads base JSON + merges local edits (same rule as loader.js)
// - Auto-saves to localStorage
// - Clean lineup + execute editing + map picker

(async () => {
  "use strict";

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);

  const elMapSelect   = $("ed-map");
  const elStatus      = $("ed-status");
  const elImportBtn   = $("import-json");
  const elExportBtn   = $("export-json");

  const elAddLineup   = $("ed-add");
  const elLineupList  = $("ed-list");

  const elAddExec     = $("ex-add");
  const elExecList    = $("ex-list");

  const elPickTarget  = $("pick-target");
  const elPickThrow   = $("pick-throw");

  const elMapBox      = $("ed-mapbox");
  const elMapImg      = $("ed-mapimg");
  const elDotTarget   = $("ed-dot-target");
  const elDotThrow    = $("ed-dot-throw");

  const elForm        = $("ed-form");

  // Modal (shared component)
  const modalRoot     = $("ui-modal");
  const modalTitleEl  = $("ui-modal-title");
  const modalBodyEl   = $("ui-modal-body");
  const modalActionsEl= $("ui-modal-actions");
  const modalCloseBtn = $("ui-modal-x");

  // If critical elements are missing, do nothing (avoid breaking page).
  if (!elMapSelect || !elMapImg || !elMapBox || !elForm || !elLineupList || !elExecList || !modalRoot) {
    console.error("Editor: missing required DOM nodes.");
    return;
  }

  // ---------- State ----------
  const params = new URLSearchParams(window.location.search);
  const preferredMap = (params.get("map") || localStorage.getItem("cs2_editor_last_map") || elMapSelect?.value || "overpass").trim();
  let currentMap = preferredMap;
  let db = { lineups: [], executes: [] }; // merged view
  let selectedId = null;
  let pickMode = "target"; // "target" | "throw"

  // autosave debounce
  let saveTimer = null;

  // ---------- Utilities ----------
  function localKey(mapName) { return `cs2_lineups_${mapName}`; }

  // Try to discover available maps dynamically (so you don't need to hardcode them).
  async function discoverMaps() {
    const maps = new Set();

    // 1) From index.html map cards (preferred — reflects what YOU added)
    try {
      const res = await fetch(`index.html?cacheBust=${Date.now()}`, { cache: "no-store" });
      if (res.ok) {
        const text = await res.text();

        // DOM parse (best effort)
        try {
          const doc = new DOMParser().parseFromString(text, "text/html");
          doc.querySelectorAll('a[href*="viewer.html?map="]').forEach((a) => {
            try {
              const href = a.getAttribute("href") || "";
              const u = new URL(href, window.location.href);
              const m = (u.searchParams.get("map") || "").trim();
              if (m) maps.add(m);
            } catch {}
          });
        } catch {}

        // Regex fallback (handles slightly broken HTML)
        const re = /viewer\.html\?map=([a-z0-9_-]+)/gi;
        let match;
        while ((match = re.exec(text))) {
          if (match[1]) maps.add(match[1].toLowerCase());
        }
      }
    } catch (e) {
      console.warn("Editor: index.html map discovery failed", e);
    }

    // 2) From localStorage keys (maps you edited before)
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.startsWith("cs2_lineups_")) {
          const name = k.replace("cs2_lineups_", "").trim();
          if (name) maps.add(name);
        }
      }
    } catch {}

    // 3) From existing <option> values in the select (baseline)
    try {
      [...elMapSelect.options].forEach((opt) => {
        const v = (opt.value || "").trim();
        if (v) maps.add(v);
      });
    } catch {}

    // Fallback
    if (maps.size === 0) ["overpass", "mirage", "inferno", "ancient", "anubis", "nuke", "vertigo", "dust2", "train"].forEach(m => maps.add(m));

    // Keep a stable order: prefer index.html order if possible, else alpha
    const indexOrder = [];
    try {
      const res = await fetch(`index.html?cacheBust=${Date.now()}`, { cache: "no-store" });
      if (res.ok) {
        const text = await res.text();
        const re = /viewer\.html\?map=([a-z0-9_-]+)/gi;
        let match;
        while ((match = re.exec(text))) {
          const m = (match[1] || "").toLowerCase();
          if (m && !indexOrder.includes(m)) indexOrder.push(m);
        }
      }
    } catch {}

    const list = [...maps];
    if (indexOrder.length) {
      list.sort((a, b) => {
        const ia = indexOrder.indexOf(a);
        const ib = indexOrder.indexOf(b);
        if (ia === -1 && ib === -1) return a.localeCompare(b);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });
    } else {
      list.sort((a, b) => a.localeCompare(b));
    }
    return list;
  }

  function prettyMapName(name) {
    const n = String(name || "").trim();
    if (!n) return "";
    return n.charAt(0).toUpperCase() + n.slice(1);
  }

  async function hydrateMapSelect(preferredMap) {
    if (!elMapSelect) return { maps: [], selected: preferredMap || "overpass" };

    const maps = await discoverMaps();
    const keep = (preferredMap || "").trim();

    // Rebuild options
    elMapSelect.innerHTML = "";
    maps.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = prettyMapName(m);
      elMapSelect.appendChild(opt);
    });

    // Choose selection
    const selected = keep && maps.includes(keep) ? keep : (maps.includes(elMapSelect.value) ? elMapSelect.value : (maps[0] || "overpass"));
    elMapSelect.value = selected;

    // Persist last chosen map
    try { localStorage.setItem("cs2_editor_last_map", selected); } catch {}
    return { maps, selected };
  }

  function setStatus(msg, ms = 2200) {
    if (!elStatus) return;
    elStatus.textContent = msg || "";
    if (!msg) return;
    setTimeout(() => { if (elStatus.textContent === msg) elStatus.textContent = ""; }, ms);
  }

  function download(filename, text) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function clamp01(n) { return Math.max(0, Math.min(100, n)); }
  function toPct(n) { return Math.round(n * 10) / 10; } // 0.1 precision

  function safeStr(v) { return (v == null) ? "" : String(v); }

  function parseNumOrUndef(v) {
    const s = String(v ?? "").trim();
    if (s === "") return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  }

  function ensureArray(a) { return Array.isArray(a) ? a : []; }

  function ensureUniqueId(base) {
    const root = (base || "lineup").trim() || "lineup";
    let id = root;
    let i = 1;
    const ids = new Set(db.lineups.map(l => l?.id).filter(Boolean));
    while (ids.has(id)) id = `${root}_${i++}`;
    return id;
  }

  function getSelected() {
    return db.lineups.find(l => l && l.id === selectedId) || null;
  }

  function setPickMode(mode) {
    pickMode = (mode === "throw") ? "throw" : "target";
    elPickTarget?.classList.toggle("active", pickMode === "target");
    elPickThrow?.classList.toggle("active", pickMode === "throw");
    setStatus(`Pick mode: ${pickMode}`);
  }

  function scheduleSaveLocal() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveLocalNow, 250);
  }

  function saveLocalNow() {
    try {
      const payload = {
        lineups: ensureArray(db.lineups),
        executes: ensureArray(db.executes),
        _savedAt: new Date().toISOString()
      };
      localStorage.setItem(localKey(currentMap), JSON.stringify(payload));
    } catch (e) {
      console.warn("Editor: failed saving local data", e);
      setStatus("Save failed ❌");
    }
  }

  // ---------- Load / merge ----------
  async function loadMap(mapName) {
    currentMap = (mapName || "overpass").trim() || "overpass";
    selectedId = null;

    // map image
    elMapImg.src = `maps/${currentMap}.png`;

    // base data
    let base = { lineups: [], executes: [] };
    try {
      const res = await fetch(`data/${currentMap}.json`, { cache: "no-store" });
      if (res.ok) base = await res.json();
      else console.warn("Editor: base fetch failed", res.status);
    } catch (e) {
      console.warn("Editor: base fetch error", e);
    }

    // local overlay
    let local = null;
    try {
      const raw = localStorage.getItem(localKey(currentMap));
      if (raw) local = JSON.parse(raw);
    } catch (e) {
      console.warn("Editor: local parse error", e);
    }

    // merge by id (local overrides base; cannot delete base items with this strategy)
    const mergedLineups = (() => {
      const out = new Map();
      ensureArray(base.lineups).forEach(l => { if (l?.id) out.set(l.id, l); });
      ensureArray(local?.lineups).forEach(l => { if (l?.id) out.set(l.id, l); });
      return Array.from(out.values());
    })();

    const mergedExecutes = (() => {
      const out = new Map();
      ensureArray(base.executes).forEach(e => { if (e?.id) out.set(e.id, e); });
      ensureArray(local?.executes).forEach(e => { if (e?.id) out.set(e.id, e); });
      return Array.from(out.values());
    })();

    db = { lineups: mergedLineups, executes: mergedExecutes };
    renderAll();
    setStatus(`Loaded "${currentMap}" ✅`);
  }

  // ---------- Render ----------
  function renderAll() {
    renderLineupList();
    renderExecuteList();
    renderForm();
    updateDots();
  }

  function lineupDisplayTitle(l) {
    const spot = (l.spot || "").trim();
    const name = (l.variant || l.name || l.id || "").trim();
    if (spot && name) return `${spot} — ${name}`;
    return spot || name || "(untitled)";
  }

  function lineupSubTitle(l) {
    const parts = [];
    if (l.type) parts.push(l.type);
    if (l.side) parts.push(l.side);
    if (l.id) parts.push(`id: ${l.id}`);
    return parts.join(" · ");
  }

  function renderLineupList() {
    elLineupList.innerHTML = "";

    const items = ensureArray(db.lineups)
      .filter(l => l && l.id)
      .slice()
      .sort((a, b) => {
        const sa = (a.spot || "").localeCompare(b.spot || "");
        if (sa !== 0) return sa;
        return lineupDisplayTitle(a).localeCompare(lineupDisplayTitle(b));
      });

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "editor-empty";
      empty.textContent = "No lineups yet. Click “+ Add lineup”.";
      elLineupList.appendChild(empty);
      return;
    }

    items.forEach(l => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "editor-row" + (l.id === selectedId ? " active" : "");
      row.innerHTML = `
        <div class="editor-row-title">${escapeHtml(lineupDisplayTitle(l))}</div>
        <div class="editor-row-sub">${escapeHtml(lineupSubTitle(l))}</div>
      `;
      row.onclick = () => {
        selectedId = l.id;
        renderAll();
      };
      elLineupList.appendChild(row);
    });
  }

  function renderExecuteList() {
    elExecList.innerHTML = "";

    const execs = ensureArray(db.executes).filter(e => e && e.id);

    if (!execs.length) {
      const empty = document.createElement("div");
      empty.className = "editor-empty";
      empty.textContent = "No executes yet. Click “+ Add execute”.";
      elExecList.appendChild(empty);
      return;
    }

    execs
      .slice()
      .sort((a, b) => safeStr(a.name || a.id).localeCompare(safeStr(b.name || b.id)))
      .forEach(ex => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "editor-row";
        row.innerHTML = `
          <div class="editor-row-title">${escapeHtml(ex.name || ex.id)}</div>
          <div class="editor-row-sub">${escapeHtml(String((ex.items || []).length))} items</div>
        `;
        row.onclick = () => editExecute(ex.id);
        elExecList.appendChild(row);
      });
  }

  function renderForm() {
    const lu = getSelected();
    if (!lu) {
      elForm.innerHTML = `<p class="editor-hint">Select a lineup on the left or click “+ Add lineup”.</p>`;
      return;
    }

    const stand = safeStr(lu.images?.stand);
    const aim   = safeStr(lu.images?.aim);

    elForm.innerHTML = `
      <div class="editor-grid">
        <label>ID
          <input id="f-id" class="editor-input" value="${escapeAttr(safeStr(lu.id))}">
        </label>

        <label>Type
          <select id="f-type" class="editor-input">
            <option value="smoke" ${lu.type==="smoke"?"selected":""}>smoke</option>
            <option value="flash" ${lu.type==="flash"?"selected":""}>flash</option>
            <option value="molotov" ${lu.type==="molotov"?"selected":""}>molotov</option>
          </select>
        </label>

        <label>Side
          <select id="f-side" class="editor-input">
            <option value="T" ${lu.side==="T"?"selected":""}>T</option>
            <option value="CT" ${lu.side==="CT"?"selected":""}>CT</option>
          </select>
        </label>

        <label>Target group (optional)
          <input id="f-target" class="editor-input" value="${escapeAttr(safeStr(lu.target))}">
        </label>

        <label>Spot (title)
          <input id="f-spot" class="editor-input" value="${escapeAttr(safeStr(lu.spot))}">
        </label>

        <label>Name
          <input id="f-name" class="editor-input" value="${escapeAttr(safeStr(lu.name))}">
        </label>

        <label>Variant (chooser label)
          <input id="f-variant" class="editor-input" value="${escapeAttr(safeStr(lu.variant))}">
        </label>

        <label>SpotKey (optional)
          <input id="f-spotkey" class="editor-input" value="${escapeAttr(safeStr(lu.spotKey))}">
        </label>

        <div class="editor-coords">
          <div class="editor-coords-title">Coordinates</div>
          <div class="editor-coords-grid">
            <label>Target X (%)
              <input id="f-x" class="editor-input" value="${escapeAttr(numToStr(lu.x))}">
            </label>
            <label>Target Y (%)
              <input id="f-y" class="editor-input" value="${escapeAttr(numToStr(lu.y))}">
            </label>
            <label>Throw X (%)
              <input id="f-tx" class="editor-input" value="${escapeAttr(numToStr(lu.throw?.x))}">
            </label>
            <label>Throw Y (%)
              <input id="f-ty" class="editor-input" value="${escapeAttr(numToStr(lu.throw?.y))}">
            </label>
          </div>
          <div class="editor-small">
            Tip: use the map picker above (Pick Target / Pick Throw) then click on the map.
          </div>
        </div>

        <label>Spot image (stand)
          <input id="f-stand" class="editor-input" value="${escapeAttr(stand)}">
        </label>
        <label>Aim image
          <input id="f-aim" class="editor-input" value="${escapeAttr(aim)}">
        </label>

        <label style="grid-column: 1 / -1;">Description
          <textarea id="f-desc" class="editor-input" rows="3">${escapeHtml(safeStr(lu.description))}</textarea>
        </label>
      </div>

      <div class="editor-actions-row">
        <button id="f-apply" class="editor-btn primary" type="button">Apply</button>
        <button id="f-delete" class="editor-btn danger" type="button">Delete</button>
      </div>
    `;

    $("f-apply").onclick = applyForm;
    $("f-delete").onclick = deleteSelected;
  }

  function numToStr(n) {
    return (typeof n === "number" && Number.isFinite(n)) ? String(n) : "";
  }

  function updateDots() {
    const lu = getSelected();
    if (!lu) {
      elDotTarget?.classList.add("hidden");
      elDotThrow?.classList.add("hidden");
      return;
    }

    const tx = lu.x, ty = lu.y;
    if (typeof tx === "number" && typeof ty === "number") {
      elDotTarget.classList.remove("hidden");
      elDotTarget.style.left = `${tx}%`;
      elDotTarget.style.top  = `${ty}%`;
    } else elDotTarget.classList.add("hidden");

    const thx = lu.throw?.x, thy = lu.throw?.y;
    if (typeof thx === "number" && typeof thy === "number") {
      elDotThrow.classList.remove("hidden");
      elDotThrow.style.left = `${thx}%`;
      elDotThrow.style.top  = `${thy}%`;
    } else elDotThrow.classList.add("hidden");
  }

  // ---------- Apply / Delete ----------
  function applyForm() {
    const lu = getSelected();
    if (!lu) return;

    const oldId = lu.id;

    const newId = ($("f-id").value || "").trim();
    if (!newId) return UIModal.open({
      title: "Missing ID",
      body: "ID is required.",
      actions: [{ label: "OK", variant: "primary", onClick: () => UIModal.close() }]
    });

    if (newId !== oldId && db.lineups.some(x => x?.id === newId)) {
      return UIModal.open({
        title: "Duplicate ID",
        body: "This ID already exists.",
        actions: [{ label: "OK", variant: "primary", onClick: () => UIModal.close() }]
      });
    }

    lu.id = newId;
    lu.type = $("f-type").value;
    lu.side = $("f-side").value;

    lu.target = ($("f-target").value || "").trim() || undefined;

    lu.spot = ($("f-spot").value || "").trim();
    lu.name = ($("f-name").value || "").trim();
    lu.variant = ($("f-variant").value || "").trim() || undefined;
    lu.spotKey = ($("f-spotkey").value || "").trim() || undefined;

    const x = parseNumOrUndef($("f-x").value);
    const y = parseNumOrUndef($("f-y").value);
    lu.x = (x == null) ? lu.x : x;
    lu.y = (y == null) ? lu.y : y;

    const txx = parseNumOrUndef($("f-tx").value);
    const tyy = parseNumOrUndef($("f-ty").value);
    if (txx != null && tyy != null) lu.throw = { x: txx, y: tyy };
    else if (txx == null && tyy == null) lu.throw = undefined;

    const stand = ($("f-stand").value || "").trim();
    const aim   = ($("f-aim").value || "").trim();
    lu.images = { stand, aim };

    lu.description = $("f-desc").value || "";

    // Update execute references if ID changed
    if (oldId !== newId) {
      db.executes.forEach(ex => {
        ex.items = ensureArray(ex.items).map(id => (id === oldId ? newId : id));
      });
      selectedId = newId;
    }

    renderAll();
    scheduleSaveLocal();
    setStatus("Applied ✅");
  }

  async function deleteSelected() {
    const lu = getSelected();
    if (!lu) return;

    const ok = await UIModal.confirm({
      title: "Delete lineup",
      message: `Delete lineup "${lu.id}" ?`,
      confirmText: "Delete",
      danger: true
    });
    if (!ok) return;

    const id = lu.id;
    db.lineups = ensureArray(db.lineups).filter(x => x?.id !== id);

    // remove from executes
    db.executes.forEach(ex => {
      ex.items = ensureArray(ex.items).filter(x => x !== id);
    });

    selectedId = null;
    renderAll();
    scheduleSaveLocal();
    setStatus("Deleted ✅");
  }

  // ---------- Map picker ----------
  elMapBox.addEventListener("click", (e) => {
    const lu = getSelected();
    if (!lu) return;

    const rect = elMapImg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const x = toPct(clamp01(((e.clientX - rect.left) / rect.width) * 100));
    const y = toPct(clamp01(((e.clientY - rect.top) / rect.height) * 100));

    if (pickMode === "target") {
      lu.x = x; lu.y = y;
      $("f-x") && ($("f-x").value = x);
      $("f-y") && ($("f-y").value = y);
    } else {
      lu.throw = lu.throw || { x: 0, y: 0 };
      lu.throw.x = x; lu.throw.y = y;
      $("f-tx") && ($("f-tx").value = x);
      $("f-ty") && ($("f-ty").value = y);
    }

    updateDots();
    scheduleSaveLocal();
    setStatus(`${pickMode} set ✅`);
  });

  // ---------- Executes ----------
  async function editExecute(exId) {
    const ex = ensureArray(db.executes).find(e => e?.id === exId);
    if (!ex) return;

    // Step 1 — rename / delete
    const step1 = await new Promise(resolve => {
      const wrap = document.createElement("div");

      const field = document.createElement("div");
      field.className = "ui-field";
      const lab = document.createElement("label");
      lab.textContent = "Execute name";
      const input = document.createElement("input");
      input.className = "ui-input";
      input.placeholder = "e.g. A Execute (banana)";
      input.value = ex.name || ex.id || "";
      field.append(lab, input);
      wrap.appendChild(field);

      const submit = () => {
        const v = input.value.trim();
        if (!v) return;
        resolve({ action: "next", name: v });
        UIModal.close();
      };

      UIModal.open({
        title: "Edit execute",
        body: wrap,
        closeOnBackdrop: false,
        actions: [
          { label: "Cancel", onClick: () => { resolve({ action: "cancel" }); UIModal.close(); } },
          { label: "Delete", variant: "danger", onClick: async () => {
              const ok = await UIModal.confirm({
                title: "Delete execute",
                message: `Delete execute "${(ex.name || ex.id)}" ?`,
                confirmText: "Delete",
                danger: true
              });
              if (!ok) return;
              resolve({ action: "delete" });
              UIModal.close();
            }
          },
          { label: "Next", variant: "primary", onClick: submit }
        ],
        onCloseCb: () => resolve({ action: "cancel" })
      });

      setTimeout(() => input.focus(), 0);
      input.addEventListener("keydown", (ev) => { if (ev.key === "Enter") submit(); });
    });

    if (!step1 || step1.action === "cancel") return;

    if (step1.action === "delete") {
      db.executes = ensureArray(db.executes).filter(e => e?.id !== ex.id);
      renderExecuteList();
      scheduleSaveLocal();
      setStatus("Execute deleted ✅");
      return;
    }

    const name = step1.name;

    // Step 2 — select lineups
    const items = ensureArray(db.lineups)
      .filter(lu => lu && lu.id)
      .slice()
      .sort((a,b) => lineupDisplayTitle(a).localeCompare(lineupDisplayTitle(b)))
      .map(lu => ({
        id: lu.id,
        title: lineupDisplayTitle(lu),
        sub: `${(lu.variant || "").trim()}${lu.variant ? " · " : ""}${(lu.side||"").trim()} ${lu.type || ""}`.trim()
      }));

    const picked = await UIModal.selectList({
      title: "Select lineups for this execute",
      items,
      selected: new Set(ensureArray(ex.items)),
      confirmText: "Save",
      searchPlaceholder: "Search lineups…"
    });
    if (!picked) return;

    ex.name = name;
    ex.items = Array.from(picked);

    renderExecuteList();
    scheduleSaveLocal();
    setStatus("Execute updated ✅");
  }

  // ---------- Buttons wiring ----------
  elAddLineup?.addEventListener("click", () => {
    const id = ensureUniqueId("lineup");
    db.lineups.unshift({
      id,
      type: "smoke",
      side: "T",
      spot: "",
      name: "",
      variant: "",
      x: 50, y: 50,
      throw: { x: 50, y: 60 },
      images: { stand: "", aim: "" },
      description: ""
    });
    selectedId = id;
    renderAll();
    scheduleSaveLocal();
    setStatus("Lineup added ✅");
  });

  elAddExec?.addEventListener("click", () => {
    const next = ensureArray(db.executes).length + 1;
    const id = `exec_${next}`;
    db.executes.push({ id, name: id, items: [] });
    renderExecuteList();
    scheduleSaveLocal();
    setStatus("Execute added ✅");
  });

  elPickTarget?.addEventListener("click", () => setPickMode("target"));
  elPickThrow?.addEventListener("click", () => setPickMode("throw"));

  elImportBtn?.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        db.lineups = ensureArray(data.lineups);
        db.executes = ensureArray(data.executes);
        selectedId = null;
        renderAll();
        saveLocalNow();
        setStatus("Imported ✅");
      } catch (err) {
        console.error(err);
        setStatus("Import failed ❌");
      }
    };
    input.click();
  });

  elExportBtn?.addEventListener("click", () => {
    const data = { lineups: ensureArray(db.lineups), executes: ensureArray(db.executes) };
    download(`${currentMap}.json`, JSON.stringify(data, null, 2));
    setStatus("Exported ✅");
  });

  elMapSelect.addEventListener("change", async () => {
    const next = (elMapSelect.value || "overpass").trim() || "overpass";
    currentMap = next;
    try { localStorage.setItem("cs2_editor_last_map", currentMap); } catch {}
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("map", currentMap);
      history.replaceState(null, "", u);
    } catch {}
    await loadMap(currentMap);
  });

  elMapImg.addEventListener("load", () => setStatus("Map ready ✅", 1400));
  elMapImg.addEventListener("error", () => setStatus("Map image missing ❌"));

  // ---------- Simple escaping ----------
  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }
  function escapeAttr(str) { return escapeHtml(str).replaceAll("\n"," "); }

  // ---------- Universal modal ----------
  const UIModal = (() => {
    let onClose = null;

    function close() {
      modalRoot.classList.add("hidden");
      modalRoot.setAttribute("aria-hidden", "true");
      modalBodyEl && (modalBodyEl.innerHTML = "");
      modalActionsEl && (modalActionsEl.innerHTML = "");
      if (typeof onClose === "function") onClose();
      onClose = null;
    }

    function open({ title, body, actions = [], closeOnBackdrop = true, onCloseCb = null }) {
      onClose = onCloseCb;
      modalTitleEl.textContent = title || "";
      modalBodyEl.innerHTML = "";
      if (typeof body === "string") modalBodyEl.innerHTML = body;
      else if (body instanceof Node) modalBodyEl.appendChild(body);

      modalActionsEl.innerHTML = "";
      actions.forEach(a => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `ui-btn ${a.variant || ""}`.trim();
        b.textContent = a.label || "OK";
        b.onclick = () => a.onClick?.();
        modalActionsEl.appendChild(b);
      });

      modalRoot.classList.remove("hidden");
      modalRoot.setAttribute("aria-hidden", "false");

      modalCloseBtn && (modalCloseBtn.onclick = close);
      const backdrop = modalRoot.querySelector(".ui-modal__backdrop");
      if (backdrop) backdrop.onclick = () => { if (closeOnBackdrop) close(); };

      // Escape key
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
            { label: cancelText, onClick: () => { close(); resolve(false); } },
            { label: confirmText, variant: danger ? "danger" : "primary", onClick: () => { close(); resolve(true); } },
          ],
          onCloseCb: () => resolve(false)
        });
      });
    }

    function selectList({ title, items, selected = new Set(), confirmText = "Save", cancelText = "Cancel", searchPlaceholder = "Search..." }) {
      return new Promise(resolve => {
        const wrap = document.createElement("div");

        const field = document.createElement("div");
        field.className = "ui-field";
        const lab = document.createElement("label");
        lab.textContent = "Search";
        const search = document.createElement("input");
        search.className = "ui-input";
        search.placeholder = searchPlaceholder;
        field.append(lab, search);
        wrap.appendChild(field);

        const list = document.createElement("div");
        list.className = "ui-list";
        wrap.appendChild(list);

        let query = "";
        const sel = new Set(selected);

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
            chip.textContent = sel.has(it.id) ? "Selected" : "";
            if (!chip.textContent) chip.style.visibility = "hidden";

            row.append(meta, chip);

            row.onclick = () => {
              if (sel.has(it.id)) sel.delete(it.id);
              else sel.add(it.id);
              render();
            };

            list.appendChild(row);
          });
        }

        render();
        search.addEventListener("input", () => { query = search.value; render(); });
        setTimeout(() => search.focus(), 0);

        open({
          title,
          body: wrap,
          actions: [
            { label: cancelText, onClick: () => { close(); resolve(null); } },
            { label: confirmText, variant: "primary", onClick: () => { close(); resolve(Array.from(sel)); } }
          ],
          onCloseCb: () => resolve(null)
        });
      });
    }

    return { open, close, confirm, selectList };
  })();

  // ---------- Init ----------
  setPickMode("target");

  // Build map list dynamically (index.html + localStorage) so your added maps show up here too.
  const { selected } = await hydrateMapSelect(preferredMap);
  currentMap = selected;

  // Keep URL in sync (useful for bookmarking: editor.html?map=overpass)
  try {
    const u = new URL(window.location.href);
    u.searchParams.set("map", currentMap);
    history.replaceState(null, "", u);
  } catch {}

  await loadMap(currentMap);
})();
