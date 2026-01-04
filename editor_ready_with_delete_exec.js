// Editor logic with execute delete support
// This file replaces editor.js

// NOTE: This is a drop-in replacement of editor_READY.js
// Adds a Delete Execute button in the Edit Execute modal

// --------------------------------------------------
// Helpers
// --------------------------------------------------
const $ = (id) => document.getElementById(id);

// --------------------------------------------------
// State
// --------------------------------------------------
let db = {
  lineups: [],
  executes: []
};

let currentMap = "overpass";

// --------------------------------------------------
// Execute editor (wizard)
// --------------------------------------------------
async function editExecute(execute = null) {
  const isNew = !execute;
  const ex = execute
    ? { ...execute }
    : { id: crypto.randomUUID(), name: "", items: [] };

  // STEP 1 — name + delete
  const action = await UIModal.open({
    title: isNew ? "Add execute" : "Edit execute",
    content: `
      <label class="modal-label">Execute name</label>
      <input id="exec-name" class="modal-input" value="${ex.name || ""}" placeholder="e.g. B execute" />
    `,
    buttons: [
      {
        label: "Cancel",
        variant: "secondary",
        value: "cancel"
      },
      !isNew && {
        label: "Delete execute",
        variant: "danger",
        value: "delete"
      },
      {
        label: "Next",
        variant: "primary",
        value: "next"
      }
    ].filter(Boolean)
  });

  if (action === "cancel" || action === null) return;

  if (action === "delete") {
    const ok = await UIModal.confirm({
      title: "Delete execute",
      message: `Delete execute "${ex.name || ex.id}" ?`,
      confirmText: "Delete",
      danger: true
    });

    if (!ok) return;

    db.executes = db.executes.filter(e => e.id !== ex.id);
    renderExecuteList();
    setStatus("Execute deleted");
    return;
  }

  const nameInput = $("exec-name");
  if (!nameInput || !nameInput.value.trim()) return;
  ex.name = nameInput.value.trim();

  // STEP 2 — lineup selection
  const selected = new Set(ex.items || []);

  const listHtml = db.lineups.map(lu => {
    const checked = selected.has(lu.id) ? "checked" : "";
    return `
      <label class="select-row">
        <input type="checkbox" data-id="${lu.id}" ${checked} />
        <span>${lu.name} ${lu.variant ? `(${lu.variant})` : ""}</span>
      </label>
    `;
  }).join("");

  const action2 = await UIModal.open({
    title: "Select lineups",
    content: `<div class="select-list">${listHtml}</div>`,
    buttons: [
      { label: "Back", variant: "secondary", value: "back" },
      { label: "Save", variant: "primary", value: "save" }
    ]
  });

  if (action2 !== "save") return;

  const checks = document.querySelectorAll('.select-list input[type="checkbox"]');
  ex.items = Array.from(checks)
    .filter(c => c.checked)
    .map(c => c.dataset.id);

  if (isNew) db.executes.push(ex);
  else db.executes = db.executes.map(e => e.id === ex.id ? ex : e);

  renderExecuteList();
  setStatus("Execute saved");
}

// --------------------------------------------------
// Rendering (stubs – same as before)
// --------------------------------------------------
function renderExecuteList() {
  // existing render logic
}

function setStatus(msg) {
  const el = document.getElementById("status");
  if (el) el.textContent = msg;
}
