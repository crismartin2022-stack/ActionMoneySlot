// main.js - VERSIÓN DE PRUEBA MÍNIMA
console.log("ActionMoneySlot - Versión de prueba iniciada.");

// Variable global para la aplicación
window.gameApp = {};

// Función para inicializar el juego cuando todo esté cargado
function initGame() {
    console.log("Todos los recursos cargados. Inicializando juego...");
    
    // Ocultar el loader
    const loadingElement = document.getElementById('loading');
    if (loadingElement) {
        loadingElement.style.display = 'none';
    }

    // Mostrar un mensaje de prueba simple
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
        gameContainer.innerHTML = '<h1>¡ActionMoneySlot Cargado!</h1><p>El juego se inicializará aquí próximamente.</p>';
    }
}

// Simular carga de recursos y luego inicializar
setTimeout(() => {
    initGame();
}, 1000);
