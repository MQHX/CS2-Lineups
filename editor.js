// CS2 Lineups – Editor (clean)
// - No "spot" field
// - Always keeps target + variant keys (empty string if not set)
// - Coordinates picked on the map (no manual X/Y inputs)
// - Images kept in JSON, but editor leaves them empty by default

// ===== State =====
let db = { lineups: [], executes: [] };
let selectedId = null;
let pickMode = "target"; // "target" | "throw"

const $ = (id) => document.getElementById(id);
const statusEl = $("ed-status");

// ===== Helpers =====
function setStatus(msg) {
  if (!statusEl) return;
  statusEl.textContent = msg || "";
  if (!msg) return;
  setTimeout(() => { if (statusEl.textContent === msg) statusEl.textContent = ""; }, 2200);
}

function toPct(n) { return Math.round(n * 10) / 10; } // 0.1 precision
function clamp01(n) { return Math.max(0, Math.min(100, n)); }

function getSelected() {
  return db.lineups.find(l => l.id === selectedId) || null;
}

function ensureUniqueId(base) {
  const root = (base || "new_lineup").trim() || "new_lineup";
  let id = root;
  let i = 1;
  while (db.lineups.some(l => l.id === id)) id = `${root}_${i++}`;
  return id;
}

function normalizeLineup(raw) {
  const lu = (raw && typeof raw === "object") ? raw : {};

  const id = String(lu.id || "").trim() || ensureUniqueId("lineup");
  const type = (lu.type === "flash" || lu.type === "molotov" || lu.type === "smoke") ? lu.type : "smoke";
  const side = (lu.side === "CT" || lu.side === "T") ? lu.side : "T";

  const name = String(lu.name ?? "").trim();
  const target = String(lu.target ?? "");   // keep as string (can be "")
  const variant = String(lu.variant ?? ""); // keep as string (can be "")
  const description = String(lu.description ?? "").trim();

  // coords: keep numbers if provided, otherwise defaults
  const x = (typeof lu.x === "number") ? lu.x : 50;
  const y = (typeof lu.y === "number") ? lu.y : 50;

  let thr = lu.throw;
  let throwObj = undefined;
  if (thr && typeof thr === "object" && typeof thr.x === "number" && typeof thr.y === "number") {
    throwObj = { x: thr.x, y: thr.y };
  } else {
    // default throw so map has both dots (you can overwrite by picking throw)
    throwObj = { x: 50, y: 60 };
  }

  const images = (lu.images && typeof lu.images === "object") ? lu.images : {};
  const stand = String(images.stand ?? "").trim();
  const aim = String(images.aim ?? "").trim();

  return {
    id, type, side,
    name,
    target, variant,
    description,
    x, y,
    throw: throwObj,
    images: { stand, aim }
  };
}

function normalizeExecute(raw) {
  const ex = (raw && typeof raw === "object") ? raw : {};
  const id = String(ex.id || "").trim() || `exec_${Math.random().toString(16).slice(2,8)}`;
  const name = String(ex.name ?? id);
  const items = Array.isArray(ex.items) ? ex.items.map(String) : [];
  return { id, name, items };
}

// ===== Import / Export =====
$("import-json")?.addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      db.lineups = Array.isArray(data.lineups) ? data.lineups.map(normalizeLineup) : [];
      db.executes = Array.isArray(data.executes) ? data.executes.map(normalizeExecute) : [];

      selectedId = null;
      renderAll();
      setStatus("Imported ✅");
    } catch (err) {
      console.error(err);
      UIModal.open({
        title: "Import failed",
        body: "Invalid JSON file.",
        actions: [{ label: "OK", variant: "primary", onClick: () => UIModal.close() }]
      });
    }
  };
  input.click();
});

$("export-json")?.addEventListener("click", () => {
  const out = {
    lineups: db.lineups.map(lu => ({
      // build in a stable order (JSON order is not guaranteed, but this helps readability)
      id: lu.id,
      type: lu.type,
      side: lu.side,
      name: lu.name ?? "",
      target: String(lu.target ?? ""),
      variant: String(lu.variant ?? ""),
      description: String(lu.description ?? ""),
      x: Number(lu.x),
      y: Number(lu.y),
      throw: lu.throw && typeof lu.throw.x === "number" && typeof lu.throw.y === "number"
        ? { x: Number(lu.throw.x), y: Number(lu.throw.y) }
        : { x: 0, y: 0 },
      images: {
        // kept but empty by default (user can fill later)
        stand: String(lu.images?.stand ?? ""),
        aim: String(lu.images?.aim ?? "")
      }
    })),
    executes: db.executes.map(ex => ({
      id: ex.id,
      name: ex.name ?? ex.id,
      items: Array.isArray(ex.items) ? ex.items.map(String) : []
    }))
  };

  const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${$("ed-map")?.value || "data"}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus("Exported ✅");
});

// ===== Render =====
function renderAll() {
  renderLineupList();
  renderExecuteList();
  renderForm();
  updateDots();
}

function renderLineupList() {
  const list = $("ed-list");
  if (!list) return;

  list.innerHTML = "";
  db.lineups.forEach(l => {
    const row = document.createElement("div");
    row.className = "editor-row" + (l.id === selectedId ? " active" : "");
    const title = (l.name || l.id);
    const subParts = [];
    if (String(l.target || "").trim()) subParts.push(`target: ${l.target}`);
    if (String(l.variant || "").trim()) subParts.push(`variant: ${l.variant}`);
    subParts.push(`${l.type} | ${l.side}`);
    row.innerHTML = `
      <div class="editor-row-title">${escapeHtml(title)}</div>
      <div class="editor-row-sub">${escapeHtml(subParts.join(" · "))}</div>
    `;
    row.onclick = () => { selectedId = l.id; renderAll(); };
    list.appendChild(row);
  });
}

function renderExecuteList() {
  const list = $("ex-list");
  if (!list) return;

  list.innerHTML = "";
  db.executes.forEach(ex => {
    const row = document.createElement("div");
    row.className = "editor-row";
    row.innerHTML = `
      <div class="editor-row-title">${escapeHtml(ex.name || ex.id)}</div>
      <div class="editor-row-sub">${(ex.items || []).length} items</div>
    `;
    row.onclick = () => editExecute(ex.id);
    list.appendChild(row);
  });
}

function renderForm() {
  const form = $("ed-form");
  const lu = getSelected();
  if (!form) return;

  if (!lu) {
    form.innerHTML = `<p class="editor-hint">Select a lineup on the left or click “Add lineup”.</p>`;
    return;
  }

  const txy = (typeof lu.x === "number" && typeof lu.y === "number") ? `${lu.x}, ${lu.y}` : "not set";
  const thr = (lu.throw && typeof lu.throw.x === "number" && typeof lu.throw.y === "number") ? `${lu.throw.x}, ${lu.throw.y}` : "not set";

  form.innerHTML = `
    <div class="editor-grid">
      <label>ID (must be unique)<input id="f-id" class="editor-input" value="${escapeAttr(lu.id)}"></label>

      <label>Name<input id="f-name" class="editor-input" value="${escapeAttr(lu.name ?? "")}" placeholder="e.g. Fountain"></label>

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

      <label>Target (group)<input id="f-target" class="editor-input" value="${escapeAttr(lu.target ?? "")}" placeholder="e.g. bank_smoke"></label>
      <label>Variant<input id="f-variant" class="editor-input" value="${escapeAttr(lu.variant ?? "")}" placeholder="e.g. Banana"></label>

      <div style="grid-column: 1 / -1; color:#cbd5e1; font-size:13px; opacity:.9;">
        <div><b>Coordinates :</b> Target = <span style="font-family:ui-monospace,monospace;">${escapeHtml(txy)}</span> · Throw = <span style="font-family:ui-monospace,monospace;">${escapeHtml(thr)}</span></div>
      </div>

      <label style="grid-column: 1 / -1;">Description
        <textarea id="f-desc" class="editor-input" rows="3" placeholder="e.g. Jumpthrow">${escapeHtml(lu.description ?? "")}</textarea>
      </label>
    </div>

    <div class="editor-actions">
      <button id="f-apply" class="editor-btn">Apply</button>
      <button id="f-delete" class="editor-btn editor-btn-danger">Delete</button>
    </div>
  `;

  $("f-apply").onclick = applyForm;
  $("f-delete").onclick = deleteSelected;
}

function applyForm() {
  const lu = getSelected();
  if (!lu) return;

  const oldId = lu.id;
  const newId = ($("f-id").value || "").trim();
  if (!newId) {
    return UIModal.open({
      title: "Missing ID",
      body: "ID is required.",
      actions: [{ label: "OK", variant: "primary", onClick: () => UIModal.close() }]
    });
  }
  if (newId !== oldId && db.lineups.some(x => x.id === newId)) {
    return UIModal.open({
      title: "Duplicate ID",
      body: "This ID already exists.",
      actions: [{ label: "OK", variant: "primary", onClick: () => UIModal.close() }]
    });
  }

  lu.id = newId;
  lu.type = $("f-type").value;
  lu.side = $("f-side").value;

  lu.target = String(($("f-target").value || "")).trim();   // keep ""
  lu.variant = String(($("f-variant").value || "")).trim(); // keep ""
  lu.name = String(($("f-name").value || "")).trim();
  lu.description = String(($("f-desc").value || "")).trim();

  // ID changed: update executes references
  if (newId !== oldId) {
    db.executes.forEach(ex => {
      ex.items = (ex.items || []).map(id => (id === oldId ? newId : id));
    });
    selectedId = newId;
  }

  renderAll();
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

  const delId = lu.id;
  db.lineups = db.lineups.filter(x => x.id !== delId);
  db.executes.forEach(ex => {
    ex.items = (ex.items || []).filter(id => id !== delId);
  });

  selectedId = null;
  renderAll();
  setStatus("Deleted");
}

// ===== Map picker =====
function updateDots() {
  const lu = getSelected();
  const t = $("ed-dot-target");
  const th = $("ed-dot-throw");
  if (!t || !th) return;

  if (!lu) {
    t.classList.add("hidden");
    th.classList.add("hidden");
    return;
  }

  if (typeof lu.x === "number" && typeof lu.y === "number") {
    t.classList.remove("hidden");
    t.style.left = lu.x + "%";
    t.style.top = lu.y + "%";
  } else t.classList.add("hidden");

  if (lu.throw && typeof lu.throw.x === "number" && typeof lu.throw.y === "number") {
    th.classList.remove("hidden");
    th.style.left = lu.throw.x + "%";
    th.style.top = lu.throw.y + "%";
  } else th.classList.add("hidden");
}

$("ed-mapbox")?.addEventListener("click", (e) => {
  const lu = getSelected();
  if (!lu) return;

  const img = $("ed-mapimg");
  if (!img) return;

  const rect = img.getBoundingClientRect();
  const x = toPct(clamp01(((e.clientX - rect.left) / rect.width) * 100));
  const y = toPct(clamp01(((e.clientY - rect.top) / rect.height) * 100));

  if (pickMode === "target") {
    lu.x = x; lu.y = y;
  } else {
    lu.throw = lu.throw || { x: 0, y: 0 };
    lu.throw.x = x; lu.throw.y = y;
  }

  updateDots();
  renderForm(); // refresh read-only coords
  setStatus(`${pickMode} set: ${x}, ${y}`);
});

$("pick-target")?.addEventListener("click", () => {
  pickMode = "target";
  $("pick-target").classList.remove("editor-btn-weak");
  $("pick-throw").classList.add("editor-btn-weak");
  setStatus("Pick mode: target");
});
$("pick-throw")?.addEventListener("click", () => {
  pickMode = "throw";
  $("pick-throw").classList.remove("editor-btn-weak");
  $("pick-target").classList.add("editor-btn-weak");
  setStatus("Pick mode: throw");
});

// ===== Executes editor =====
async function editExecute(exId) {
  const ex = db.executes.find(e => e.id === exId);
  if (!ex) return;

  const name = await UIModal.prompt({
    title: "Edit execute",
    label: "Execute name",
    placeholder: "e.g. A Execute (banana)",
    value: ex.name || ex.id || "",
    confirmText: "Next"
  });
  if (!name) return;

  const items = db.lineups.slice()
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id))
    .map(lu => ({
      id: lu.id,
      title: `${lu.name || lu.id}${lu.variant ? ` · ${lu.variant}` : ""}`,
      sub: `${lu.side} ${lu.type}${lu.target ? ` · target:${lu.target}` : ""}`
    }));

  const picked = await UIModal.selectList({
    title: "Select lineups for this execute",
    items,
    selected: new Set(ex.items || []),
    confirmText: "Save",
    searchPlaceholder: "Search by name / variant / id…"
  });
  if (!picked) return;

  ex.name = name;
  ex.items = picked;

  renderExecuteList();
  setStatus("Execute updated ✅");
}

// ===== Buttons wiring =====
$("ed-add")?.addEventListener("click", () => {
  const id = ensureUniqueId("lineup");
  const lu = normalizeLineup({
    id,
    type: "smoke",
    side: "T",
    name: "",
    target: "",
    variant: "",
    description: "",
    x: 50, y: 50,
    throw: { x: 50, y: 60 },
    images: { stand: "", aim: "" }
  });
  db.lineups.unshift(lu);
  selectedId = lu.id;
  renderAll();
  setStatus("Lineup added");
});

$("ex-add")?.addEventListener("click", async () => {
  const id = `exec_${db.executes.length + 1}`;
  const ex = normalizeExecute({ id, name: "", items: [] });
  db.executes.push(ex);
  renderExecuteList();
  setStatus("Execute added");
  // immediately open editor so user can pick lineups
  await editExecute(ex.id);
});

$("ed-map")?.addEventListener("change", () => {
  const v = $("ed-map").value;
  const img = $("ed-mapimg");
  if (img) img.src = `maps/${v}.png`;
  setStatus(`Map: ${v}`);
});

$("ed-mapimg")?.addEventListener("load", () => setStatus("Map ready"));

// init
(function init() {
  // default empty DB
  db = { lineups: [], executes: [] };
  // set map image
  const img = $("ed-mapimg");
  const map = $("ed-map")?.value || "overpass";
  if (img) img.src = `maps/${map}.png`;
  renderAll();
})();

// ===== Universal modal (no browser prompt/confirm) =====
const UIModal = (() => {
  const root = document.getElementById("ui-modal");
  const titleEl = document.getElementById("ui-modal-title");
  const bodyEl  = document.getElementById("ui-modal-body");
  const actionsEl = document.getElementById("ui-modal-actions");
  const closeBtn = document.getElementById("ui-modal-x");
  let onClose = null;
  let isOpen = false;

  function close() {
    if (!root || !isOpen) return;
    isOpen = false;
    root.classList.add("hidden");
    root.setAttribute("aria-hidden", "true");
    if (bodyEl) bodyEl.innerHTML = "";
    if (actionsEl) actionsEl.innerHTML = "";
    const cb = onClose;
    onClose = null;
    if (typeof cb === "function") cb();
  }

  function open({ title, body, actions = [], closeOnBackdrop = true, onCloseCb = null }) {
    if (!root || !titleEl || !bodyEl || !actionsEl) return;
    isOpen = true;
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
      b.onclick = () => a.onClick?.();
      actionsEl.appendChild(b);
    });

    root.classList.remove("hidden");
    root.setAttribute("aria-hidden", "false");

    if (closeBtn) closeBtn.onclick = close;
    const backdrop = root.querySelector(".ui-modal__backdrop");
    if (backdrop) backdrop.onclick = () => { if (closeOnBackdrop) close(); };

    document.addEventListener("keydown", escClose, { once: true });
    function escClose(e) {
      if (e.key === "Escape") close();
      else document.addEventListener("keydown", escClose, { once: true });
    }
  }

  function confirm({ title, message, confirmText = "Confirm", cancelText = "Cancel", danger = false }) {
    return new Promise(resolve => {
      let resolved = false;
      const finish = (v) => { if (resolved) return; resolved = true; resolve(v); };

      const body = document.createElement("div");
      body.textContent = message || "";

      open({
        title,
        body,
        actions: [
          { label: cancelText, onClick: () => { finish(false); close(); } },
          { label: confirmText, variant: danger ? "danger" : "primary", onClick: () => { finish(true); close(); } },
        ],
        onCloseCb: () => finish(false)
      });
    });
  }

  function prompt({ title, label, placeholder = "", value = "", confirmText = "OK", cancelText = "Cancel" }) {
    return new Promise(resolve => {
      let resolved = false;
      const finish = (v) => { if (resolved) return; resolved = true; resolve(v); };

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
        finish(v);
        close();
      };

      open({
        title,
        body: wrap,
        actions: [
          { label: cancelText, onClick: () => { finish(null); close(); } },
          { label: confirmText, variant: "primary", onClick: submit }
        ],
        onCloseCb: () => finish(null)
      });

      setTimeout(() => input.focus(), 0);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    });
  }

  function selectList({ title, items, selected = new Set(), confirmText = "Save", cancelText = "Cancel", searchPlaceholder = "Search..." }) {
    return new Promise(resolve => {
      let resolved = false;
      const finish = (v) => { if (resolved) return; resolved = true; resolve(v); };

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
          const hay = `${it.id||""} ${it.title||""} ${it.sub||""}`.toLowerCase();
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
          t.textContent = it.title || it.id;
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
          { label: cancelText, onClick: () => { finish(null); close(); } },
          { label: confirmText, variant: "primary", onClick: () => { finish(Array.from(sel)); close(); } }
        ],
        onCloseCb: () => finish(null)
      });
    });
  }

  return { open, close, confirm, prompt, selectList };
})();

// ===== tiny sanitizers =====
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
function escapeAttr(s) {
  return escapeHtml(s).replaceAll('"', "&quot;");
}
