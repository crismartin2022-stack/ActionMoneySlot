// main.js
console.log("ActionMoneySlot - Iniciando...");

// Variable global para la aplicación
window.gameApp = {};

// Función para inicializar el juego cuando todo esté cargado
function initGame() {
    console.log("Todos los recursos cargados. Inicializando juego...");
    document.getElementById('loading').style.display = 'none';

    // Aquí irá el código para crear la instancia del juego
    // Por ahora, solo mostraremos un mensaje de prueba
    const gameContainer = document.getElementById('game-container');
    gameContainer.innerHTML = '<h1>¡ActionMoneySlot Cargado!</h1><p>El juego se inicializará aquí próximamente.</p>';
}

// Simular carga de recursos
setTimeout(() => {
    initGame();
}, 2000);
