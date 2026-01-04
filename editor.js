// ===== State =====
let currentMap = "overpass";
let db = { lineups: [], executes: [] };
let selectedId = null;
let pickMode = "target"; // "target" | "throw"

const $ = (id) => document.getElementById(id);
const statusEl = $("ed-status");

// ===== Helpers =====
function setStatus(msg) {
  statusEl.textContent = msg;
  setTimeout(() => { if (statusEl.textContent === msg) statusEl.textContent = ""; }, 2500);
}

function localKey(map) { return `cs2_lineups_${map}`; }

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
function toPct(n) { return Math.round(n * 10) / 10; } // 0.1

function getSelected() {
  return db.lineups.find(l => l.id === selectedId) || null;
}

function ensureUniqueId(base) {
  let id = base || "new_lineup";
  let i = 1;
  while (db.lineups.some(l => l.id === id)) {
    id = `${base || "new_lineup"}_${i++}`;
  }
  return id;
}

// ===== Load/save =====
// IMPORT JSON
document.getElementById("import-json").addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";

  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const data = JSON.parse(reader.result);
      db.lineups = data.lineups || [];
      db.executes = data.executes || [];
      selectedId = null;
      renderAll();
      setStatus("Imported ✅");
    };
    reader.readAsText(file);
  };

  input.click();
});


// EXPORT JSON
document.getElementById("export-json").addEventListener("click", () => {
  const data = {
    lineups: db.lineups,
    executes: db.executes
  };

  const blob = new Blob(
    [JSON.stringify(data, null, 2)],
    { type: "application/json" }
  );

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${$("ed-map").value}.json`;
  a.click();
});



// ===== Render lists =====
function renderAll() {
  renderLineupList();
  renderExecuteList();
  renderForm();
  updateDots();
}

function renderLineupList() {
  const list = $("ed-list");
  const q = ($("ed-search").value || "").toLowerCase();

  const filtered = db.lineups.filter(l => {
    const hay = `${l.id} ${l.spot||""} ${l.name||""} ${l.variant||""}`.toLowerCase();
    return hay.includes(q);
  });

  list.innerHTML = "";
  filtered.forEach(l => {
    const row = document.createElement("div");
    row.className = "editor-row" + (l.id === selectedId ? " active" : "");
    row.innerHTML = `
      <div class="editor-row-title">${l.spot || "(no spot)"} — ${l.variant || l.name || l.id}</div>
      <div class="editor-row-sub">${l.type || "?"} | ${l.side || "?"} | id: ${l.id}</div>
    `;
    row.onclick = () => { selectedId = l.id; renderAll(); };
    list.appendChild(row);
  });
}

function renderExecuteList() {
  const list = $("ex-list");
  list.innerHTML = "";

  db.executes.forEach(ex => {
    const row = document.createElement("div");
    row.className = "editor-row";
    row.innerHTML = `
      <div class="editor-row-title">${ex.name || ex.id}</div>
      <div class="editor-row-sub">${(ex.items||[]).length} items</div>
    `;
    row.onclick = () => editExecute(ex.id);
    list.appendChild(row);
  });
}

// ===== Form (lineup) =====
function renderForm() {
  const form = $("ed-form");
  const lu = getSelected();

  if (!lu) {
    form.innerHTML = `<p class="editor-hint">Sélectionne une lineup à gauche ou clique “Add lineup”.</p>`;
    return;
  }

  form.innerHTML = `
    <div class="editor-grid">
      <label>ID<input id="f-id" class="editor-input" value="${lu.id || ""}"></label>
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
      <label>Target group (optional)<input id="f-target" class="editor-input" value="${lu.target || ""}"></label>

      <label>Spot (title)<input id="f-spot" class="editor-input" value="${lu.spot || ""}"></label>
      <label>Name<input id="f-name" class="editor-input" value="${lu.name || ""}"></label>
      <label>Variant (chooser label)<input id="f-variant" class="editor-input" value="${lu.variant || ""}"></label>
      <label>SpotKey (optional)<input id="f-spotkey" class="editor-input" value="${lu.spotKey || ""}"></label>

      <label>Target X (%)<input id="f-x" class="editor-input" value="${lu.x ?? ""}"></label>
      <label>Target Y (%)<input id="f-y" class="editor-input" value="${lu.y ?? ""}"></label>
      <label>Throw X (%)<input id="f-tx" class="editor-input" value="${lu.throw?.x ?? ""}"></label>
      <label>Throw Y (%)<input id="f-ty" class="editor-input" value="${lu.throw?.y ?? ""}"></label>

      <label>Spot image (stand)<input id="f-stand" class="editor-input" value="${lu.images?.stand || ""}"></label>
      <label>Aim image<input id="f-aim" class="editor-input" value="${lu.images?.aim || ""}"></label>

      <label style="grid-column: 1 / -1;">Description
        <textarea id="f-desc" class="editor-input" rows="3">${lu.description || ""}</textarea>
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

  const newId = ($("f-id").value || "").trim();
  if (!newId) return UIModal.open({ title: "Missing ID", body: "ID required.", actions: [{label:"OK", variant:"primary", onClick:()=>UIModal.close()}] });

  // ID change: ensure uniqueness
  if (newId !== lu.id && db.lineups.some(x => x.id === newId)) {
    return UIModal.open({ title: "Duplicate ID", body: "ID already exists.", actions: [{label:"OK", variant:"primary", onClick:()=>UIModal.close()}] });
  }

  // apply
  lu.id = newId;
  lu.type = $("f-type").value;
  lu.side = $("f-side").value;

  lu.target = ($("f-target").value || "").trim() || undefined;

  lu.spot = ($("f-spot").value || "").trim();
  lu.name = ($("f-name").value || "").trim();
  lu.variant = ($("f-variant").value || "").trim() || undefined;
  lu.spotKey = ($("f-spotkey").value || "").trim() || undefined;

  lu.x = Number($("f-x").value);
  lu.y = Number($("f-y").value);

  const tx = $("f-tx").value;
  const ty = $("f-ty").value;
  if (tx !== "" && ty !== "") {
    lu.throw = { x: Number(tx), y: Number(ty) };
  } else {
    lu.throw = undefined;
  }

  const stand = ($("f-stand").value || "").trim();
  const aim = ($("f-aim").value || "").trim();
  lu.images = { stand, aim };

  lu.description = $("f-desc").value || "";

  // if ID changed, update selectedId + executes references
  selectedId = newId;
  db.executes.forEach(ex => {
    ex.items = (ex.items || []).map(id => (id === lu.id ? newId : id));
  });

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

  db.lineups = db.lineups.filter(x => x.id !== lu.id);
  db.executes.forEach(ex => {
    ex.items = (ex.items || []).filter(id => id !== lu.id);
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
  if (!lu || !t || !th) return;

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

$("ed-mapbox").addEventListener("click", (e) => {
  const lu = getSelected();
  if (!lu) return;

  const img = $("ed-mapimg");
  const rect = img.getBoundingClientRect();

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
  setStatus(`${pickMode} set: ${x}, ${y}`);
});

// ===== Executes editor (clean modal) =====
async function editExecute(exId) {
  const ex = db.executes.find(e => e.id === exId);
  if (!ex) return;

  // Step 1: name (+ delete)
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
        { label: "Delete execute", variant: "danger", onClick: async () => {
            // confirm delete
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
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  });

  if (!step1 || step1.action === "cancel") return;

  if (step1.action === "delete") {
    db.executes = db.executes.filter(e => e.id !== ex.id);
    renderExecuteList();
    setStatus("Execute deleted ✅");
    return;
  }

  const name = step1.name;

  // Step 2: pick lineups
  const items = (Array.isArray(db.lineups) ? db.lineups : []).slice()
    .sort((a,b) => (a.name || a.id).localeCompare(b.name || b.id))
    .map(lu => ({
      id: lu.id,
      title: `${lu.name || lu.id}`,
      sub: `${(lu.variant || "").trim()}${lu.variant ? " · " : ""}${(lu.side||"").trim()} ${lu.type || ""}`.trim()
    }));

  const picked = await UIModal.selectList({
    title: "Select lineups for this execute",
    items,
    selected: new Set(ex.items || []),
    confirmText: "Save",
    searchPlaceholder: "Search lineups…"
  });
  if (!picked) return;

  ex.name = name;
  ex.items = Array.from(picked);

  renderExecuteList();
  setStatus("Execute updated ✅");
}

// ===== Buttons wiring =====

$("ed-search").addEventListener("input", renderLineupList);

$("ed-add").onclick = () => {
  const id = ensureUniqueId("lineup");
  db.lineups.unshift({
    id,
    type: "smoke",
    side: "T",
    spot: "",
    name: "",
    x: 50, y: 50,
    throw: { x: 50, y: 60 },
    images: { stand: "", aim: "" },
    description: ""
  });
  selectedId = id;
  renderAll();
};

$("ex-add").onclick = () => {
  const id = `exec_${db.executes.length + 1}`;
  db.executes.push({ id, name: id, items: [] });
  renderExecuteList();
  setStatus("Execute added");
};

$("pick-target").onclick = () => { pickMode = "target"; setStatus("Pick mode: target"); };
$("pick-throw").onclick = () => { pickMode = "throw"; setStatus("Pick mode: throw"); };

$("ed-export-json").onclick = () => {
  currentMap = $("ed-map").value;
  download(`${currentMap}.json`, JSON.stringify(db, null, 2));
};

$("ed-import-btn").onclick = () => $("ed-import").click();
$("ed-import").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  db = JSON.parse(text);
  db.lineups ||= [];
  db.executes ||= [];
  selectedId = null;
  renderAll();
  setStatus("Imported ✅");
});

// initial
$("ed-map").addEventListener("change", () => {
  $("ed-mapimg").src = `maps/${$("ed-map").value}.png`;
});

$("ed-mapimg").onload = () => setStatus("Map ready");

$("ed-mapimg").src = `maps/${$("ed-map").value}.png`;

// ===== Universal modal (no browser prompt/confirm) =====
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
    if (!root || !titleEl || !bodyEl || !actionsEl) return;
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
        close();
        resolve(v);
      };

      open({
        title,
        body: wrap,
        actions: [
          { label: cancelText, onClick: () => { close(); resolve(null); } },
          { label: confirmText, variant: "primary", onClick: submit }
        ],
        onCloseCb: () => resolve(null)
      });

      setTimeout(() => input.focus(), 0);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
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

  return { open, close, confirm, prompt, selectList };
})();


