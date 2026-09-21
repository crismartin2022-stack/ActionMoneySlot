console.log("ActionMoneySlot - inicializando runtime EGT...");

window.gameApp = window.gameApp || {};

function initGame() {
    const loadingElement = document.getElementById("loading");
    if (loadingElement) {
        loadingElement.style.display = "none";
    }

    const gameContainer = document.getElementById("game-container");
    if (!gameContainer) {
        console.error("No existe #game-container");
        return;
    }

    if (typeof Config === "undefined") {
        console.error("Config no está cargado.");
        gameContainer.innerHTML = `
            <div style="padding:2rem;font-family:sans-serif;color:#c00;">
                <h2>Error: Config.js no cargó</h2>
                <p>Falta cargar la config del juego.</p>
            </div>
        `;
        return;
    }

    if (typeof Game === "undefined") {
        console.error("Game no está cargado.");
        gameContainer.innerHTML = `
            <div style="padding:2rem;font-family:sans-serif;color:#c00;">
                <h2>Error: Game.min.js no cargó</h2>
                <p>Falta el runtime del juego.</p>
            </div>
        `;
        return;
    }

    try {
        const config = new Config();
        window.gameApp.config = config;

        const game = new Game(config);
        window.gameApp.game = game;

        if (game && game.view) {
            gameContainer.innerHTML = "";
            gameContainer.appendChild(game.view);
            console.log("Juego iniciado correctamente.");
        } else {
            console.warn("Game creado, pero no tiene vista visible.");
            gameContainer.innerHTML = `
                <div style="padding:2rem;font-family:sans-serif;color:#0a0;">
                    <h2>ActionMoneySlot</h2>
                    <p>Runtime cargado correctamente.</p>
                </div>
            `;
        }
    } catch (error) {
        console.error("Error al iniciar el juego:", error);
        gameContainer.innerHTML = `
            <div style="padding:2rem;font-family:sans-serif;color:#c00;">
                <h2>Error al iniciar el juego</h2>
                <pre>${String(error)}</pre>
            </div>
        `;
    }
}

window.addEventListener("load", function () {
    setTimeout(initGame, 250);
});
