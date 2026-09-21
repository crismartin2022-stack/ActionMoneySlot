// main.js - bootstrap del shell del juego
console.log("ActionMoneySlot - inicializado.");

window.gameApp = window.gameApp || {};

function initGame() {
  const loadingElement = document.getElementById("loading");
  const gameContainer = document.getElementById("game-container");

  if (loadingElement) {
    loadingElement.style.display = "none";
  }

  if (gameContainer) {
    gameContainer.innerHTML = `
      <div class="game-shell">
        <h1>¡ActionMoneySlot cargado!</h1>
        <p>La configuración y el boot del juego están listos para inicializarse.</p>
      </div>
    `;
  }

  window.gameApp.ready = true;
  console.log("Boot del juego completado.");
}

window.addEventListener("DOMContentLoaded", function () {
  setTimeout(initGame, 1000);
});
