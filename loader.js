(function () {
  const params = new URLSearchParams(window.location.search);
  const mapName = params.get("map") || "overpass";

  // Titre + image de map
  const title = document.getElementById("page-title");
  if (title) title.textContent = `CS2 Lineups – ${mapName[0].toUpperCase() + mapName.slice(1)}`;

  const mapImg = document.getElementById("map");
  if (mapImg) mapImg.src = `maps/${mapName}.png`;

  // Charge le fichier data/<map>.js
  const dataScript = document.createElement("script");
  dataScript.src = `data/${mapName}.js`;

  dataScript.onload = () => {
    // Puis charge ton script principal une fois que lineups existe
    const appScript = document.createElement("script");
    appScript.src = "script.js";
    document.body.appendChild(appScript);
  };

  dataScript.onerror = () => {
    alert(`Impossible de charger data/${mapName}.js`);
  };

  document.body.appendChild(dataScript);
})();
