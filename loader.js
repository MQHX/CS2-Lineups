(async function () {
  const params = new URLSearchParams(window.location.search);
  const mapName = params.get("map") || "overpass";

  // UI
  const title = document.getElementById("page-title");
  if (title) title.textContent = `CS2 Lineups – ${mapName[0].toUpperCase() + mapName.slice(1)}`;

  const mapImg = document.getElementById("map");
  if (mapImg) mapImg.src = `maps/${mapName}.png`;

  const baseUrl = `data/${mapName}.json`;

  // Local edits (saved by editor) — we MERGE them on top of the base JSON
  const localKey = `cs2_lineups_${mapName}`;
  const localRaw = localStorage.getItem(localKey);

  try {
    // 1) Always load base (admin) data
    const res = await fetch(baseUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`fetch ${baseUrl} failed: ${res.status}`);
    const base = await res.json();

    let mergedLineups = Array.isArray(base.lineups) ? base.lineups.slice() : [];
    let mergedExecutes = Array.isArray(base.executes) ? base.executes.slice() : [];

    // 2) If local exists, merge by id (never delete admin items)
    if (localRaw) {
      try {
        const local = JSON.parse(localRaw);

        if (Array.isArray(local.lineups)) {
          const byId = new Map(mergedLineups.map(l => [l.id, l]));
          for (const l of local.lineups) {
            if (!l || !l.id) continue;
            byId.set(l.id, l); // override or add
          }
          mergedLineups = Array.from(byId.values());
        }

        if (Array.isArray(local.executes)) {
          const byId = new Map(mergedExecutes.map(e => [e.id, e]));
          for (const e of local.executes) {
            if (!e || !e.id) continue;
            byId.set(e.id, e);
          }
          mergedExecutes = Array.from(byId.values());
        }
      } catch (e) {
        console.warn("Local data is invalid JSON, ignoring.", e);
      }
    }

    window.lineups = mergedLineups;
    window.executes = mergedExecutes;

    // 3) Load main app script
    const appScript = document.createElement("script");
    appScript.src = "script.js";
    document.body.appendChild(appScript);
  } catch (err) {
    console.error(err);
    alert(`Impossible de charger les données pour "${mapName}". Vérifie ${baseUrl}`);
  }
})();
