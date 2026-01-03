(async function () {
  const params = new URLSearchParams(window.location.search);
  const mapName = params.get("map") || "overpass";

  // UI
  const title = document.getElementById("page-title");
  if (title) title.textContent = `CS2 Lineups – ${mapName[0].toUpperCase() + mapName.slice(1)}`;

  const mapImg = document.getElementById("map");
  if (mapImg) mapImg.src = `maps/${mapName}.png`;

  // 1) Essaie d'abord la version locale (pour toi, en test)
  const localKey = `cs2_lineups_${mapName}`;
  const localRaw = localStorage.getItem(localKey);

  try {
    if (localRaw) {
      const parsed = JSON.parse(localRaw);
      window.lineups = parsed.lineups || [];
      window.executes = parsed.executes || [];
    } else {
      // 2) Sinon charge le JSON du repo (pour tout le monde)
      const res = await fetch(`data/${mapName}.json`, { cache: "no-store" });
      if (!res.ok) throw new Error(`fetch data/${mapName}.json failed: ${res.status}`);
      const data = await res.json();
      window.lineups = data.lineups || [];
      window.executes = data.executes || [];
    }

    // Charge ton script principal
    const appScript = document.createElement("script");
    appScript.src = "script.js";
    document.body.appendChild(appScript);
  } catch (err) {
    console.error(err);
    alert(`Impossible de charger les données pour "${mapName}". Vérifie data/${mapName}.json`);
  }
})();
