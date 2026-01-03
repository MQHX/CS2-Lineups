// ===== State =====
let currentMap = "overpass";
let db = { lineups: [], executes: [] };
let selectedId = null;
let pickMode = "target"; // "target" | "spot"

const $ = (id) => document.getElementById(id);
const statusEl = $("ed-status");

// ===== Helpers =====
function setStatus(msg) {
  statusEl.textContent = msg;
  setTimeout(() => { if (statusEl.textContent === msg) statusEl.textContent = ""; }, 2500);
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

// export propre
function toExportDb(rawDb) {
  const lineups = (rawDb.lineups || []).map(lu => ({
    id: lu.id || "",
    type: lu.type || "",
    side: lu.side || "",
    name: lu.name || "",

    // Toujours présents même si vides
    target: lu.target ?? "",
    variant: lu.variant ?? "",
    description: lu.description ?? "",

    // Coords (numbers)
    x: (typeof lu.x === "number" ? lu.x : Number(lu.x)),
    y: (typeof lu.y === "number" ? lu.y : Number(lu.y)),

    throw: lu.throw
      ? { x: (typeof lu.throw.x === "number" ? lu.throw.x : Number(lu.throw.x)),
          y: (typeof lu.throw.y === "number" ? lu.throw.y : Number(lu.throw.y)) }
      : { x: 0, y: 0 },

    images: {
      stand: lu.images?.stand || "",
      aim: lu.images?.aim || ""
    }
  }));

  const executes = (rawDb.executes || []).map(ex => ({
    id: ex.id || "",
    name: ex.name || "",
    items: Array.isArray(ex.items) ? ex.items : []
  }));

  return { lineups, executes };
}

// EXPORT JSON
document.getElementById("export-json").addEventListener("click", () => {
  const data = toExportDb(db);

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${document.getElementById("ed-map").value}.json`;
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

    <label>Name
         <input id="f-name" class="editor-input" value="${lu.name || ""}">
    </label>

    <label>Target (impact group)
        <input id="f-target" class="editor-input" value="${lu.target || ""}">
    </label>

    <label>Variant
        <input id="f-variant" class="editor-input" value="${lu.variant || ""}">
     </label>

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
  if (!newId) return alert("ID required");

  // ID change: ensure uniqueness
  if (newId !== lu.id && db.lineups.some(x => x.id === newId)) {
    return alert("ID already exists");
  }

  // apply
  lu.id = newId;
  lu.type = $("f-type").value;
  lu.side = $("f-side").value;

lu.target  = ($("f-target").value  || "").trim();   // toujours présent ("" si vide)
lu.variant = ($("f-variant").value || "").trim();   // toujours présent ("" si vide)

  lu.name = ($("f-name").value || "").trim();

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

function deleteSelected() {
  const lu = getSelected();
  if (!lu) return;
  if (!confirm(`Delete lineup "${lu.id}"?`)) return;

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
  lu.x = x;
  lu.y = y;
  $("f-x") && ($("f-x").value = x);
  $("f-y") && ($("f-y").value = y);
} else {
  lu.throw = lu.throw || { x: 0, y: 0 };
  lu.throw.x = x;
  lu.throw.y = y;
  $("f-tx") && ($("f-tx").value = x);
  $("f-ty") && ($("f-ty").value = y);
}


  updateDots();
  setStatus(`${pickMode} set: ${x}, ${y}`);
});

// ===== Executes editor (simple prompt) =====
function editExecute(exId) {
  const ex = db.executes.find(e => e.id === exId);
  if (!ex) return;

  const name = prompt("Execute name:", ex.name || ex.id);
  if (name === null) return;
  ex.name = name;

  const ids = prompt("Items (comma-separated lineup IDs):", (ex.items || []).join(","));
  if (ids === null) return;
  ex.items = ids.split(",").map(s => s.trim()).filter(Boolean);

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

const btnTarget = $("pick-target");
const btnSpot   = $("pick-spot");

function setPickMode(mode) {
  pickMode = mode;

  btnTarget.classList.toggle("active", mode === "target");
  btnSpot.classList.toggle("active", mode === "spot");

  setStatus(mode === "target"
    ? "Target: grenade landing point"
    : "Spot: player throw position"
  );
}

btnTarget.onclick = () => setPickMode("target");
btnSpot.onclick   = () => setPickMode("spot");




// initial
$("ed-map").addEventListener("change", () => {
  $("ed-mapimg").src = `maps/${$("ed-map").value}.png`;
});

$("ed-mapimg").onload = () => setStatus("Map ready");

$("ed-mapimg").src = `maps/${$("ed-map").value}.png`;

