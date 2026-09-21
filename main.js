window.gameApp = window.gameApp || {};

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function renderError(gameContainer, title, details) {
    gameContainer.innerHTML = `
        <div style="max-width: 760px; margin: 2rem; padding: 1.5rem; border: 1px solid #733; background: rgba(60, 0, 0, 0.45); color: #fff;">
            <h2 style="margin-top: 0;">${escapeHtml(title)}</h2>
            <p>${escapeHtml(details)}</p>
        </div>
    `;
}

function detectMissingGlobals() {
    const checks = [
        { name: "Config", ok: typeof window.Config !== "undefined" },
        { name: "Game", ok: typeof window.Game !== "undefined" },
        { name: "PIXI", ok: typeof window.PIXI !== "undefined" },
        { name: "Bottle", ok: typeof window.Bottle !== "undefined" },
        { name: "Pluck", ok: typeof window.Pluck !== "undefined" }
    ];
    return checks.filter((item) => !item.ok).map((item) => item.name);
}

function initGame() {
    const gameContainer = document.getElementById("game-container");
    if (!gameContainer) {
        console.error("No existe #game-container");
        return;
    }

    const missingGlobals = detectMissingGlobals();
    if (missingGlobals.length > 0) {
        console.error("Dependencias faltantes:", missingGlobals);
        renderError(
            gameContainer,
            "No se pudo iniciar ActionMoneySlot",
            `Faltan dependencias globales: ${missingGlobals.join(", ")}. Revisa que todos los archivos del paquete original estén presentes y accesibles desde la raíz del proyecto.`
        );
        return;
    }

    try {
        const config = new window.Config();
        window.gameApp.config = config;

        const game = new window.Game(config);
        window.gameApp.game = game;

        const loadingElement = document.getElementById("loading");
        if (loadingElement) {
            loadingElement.style.display = "none";
        }

        if (game && game.view) {
            gameContainer.innerHTML = "";
            gameContainer.appendChild(game.view);
            return;
        }

        renderError(
            gameContainer,
            "Runtime cargado sin vista",
            "El motor del juego cargó, pero no expuso una vista renderizable."
        );
    } catch (error) {
        console.error("Error al iniciar el juego:", error);
        renderError(
            gameContainer,
            "Error al iniciar el juego",
            String(error && error.message ? error.message : error)
        );
    }
}

window.addEventListener("load", function () {
    setTimeout(initGame, 250);
});
