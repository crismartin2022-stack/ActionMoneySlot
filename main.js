window.gameApp = window.gameApp || {};

function showBootError(message) {
  const loadingElement = document.getElementById("loading");
  if (loadingElement) {
    loadingElement.replaceChildren();
    const title = document.createElement("h2");
    title.textContent = "Error de arranque";
    const details = document.createElement("p");
    details.textContent = message;
    loadingElement.appendChild(title);
    loadingElement.appendChild(details);
  }
}

function bootActionMoneySlot() {
  try {
    const GameMain = window?.com?.egt?.actionMoneySlot?.Main;

    if (typeof GameMain !== "function") {
      throw new Error("No se encontró com.egt.actionMoneySlot.Main.");
    }

    const game = new GameMain();

    if (typeof game.start === "function") {
      game.start();
    } else if (typeof game.init === "function") {
      game.init();
    } else {
      throw new Error("La clase principal no expone start() ni init().");
    }

    window.gameApp.instance = game;
    window.gameApp.ready = true;

    const loadingElement = document.getElementById("loading");
    if (loadingElement) {
      loadingElement.style.display = "none";
    }
  } catch (error) {
    console.error("Error iniciando ActionMoneySlot:", error);
    showBootError(error?.message || "No se pudo inicializar el juego.");
  }
}

window.addEventListener("DOMContentLoaded", bootActionMoneySlot);
