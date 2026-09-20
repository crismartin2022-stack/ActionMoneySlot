// main.js - Versión Original Completa
(function (window) {
    'use strict';

    // Espacio de nombres global para EGT
    var com = window.com || {};
    com.egt = com.egt || {};
    com.egt.core = com.egt.core || {};
    com.egt.core.main = com.egt.core.main || {};

    // Configuración global del juego
    var gameConfig = {
        autoResize: true,
        scaleMode: "fit",
        orientation: "landscape",
        width: 1280,
        height: 720
    };

    // Función principal que inicia todo
    function startGame() {
        console.log("EGT ActionMoneySlot - Iniciando juego...");

        // Crear la aplicación PIXI
        var app = new PIXI.Application({
            width: gameConfig.width,
            height: gameConfig.height,
            backgroundColor: 0x000000,
            antialias: true
        });

        // Añadir el canvas de PIXI al DOM
        document.getElementById('game-container').appendChild(app.view);

        // Ajustar el tamaño del canvas si es necesario
        if (gameConfig.autoResize) {
            window.addEventListener('resize', function () {
                resizeCanvas(app.view);
            });
            resizeCanvas(app.view);
        }

        // Cargar los recursos del juego
        loadGameAssets(app);
    }

    // Función para redimensionar el canvas
    function resizeCanvas(canvas) {
        var resizeMode = gameConfig.scaleMode;
        var gameW = gameConfig.width;
        var gameH = gameConfig.height;

        var windowW = window.innerWidth;
        var windowH = window.innerHeight;

        var scaleW = windowW / gameW;
        var scaleH = windowH / gameH;

        var scale;
        var offsetX = 0;
        var offsetY = 0;

        if (resizeMode === 'fit') {
            scale = Math.min(scaleW, scaleH);
            offsetX = (windowW - gameW * scale) / 2;
            offsetY = (windowH - gameH * scale) / 2;
        } else if (resizeMode === 'fill') {
            scale = Math.max(scaleW, scaleH);
        } else {
            scale = 1;
        }

        canvas.style.width = gameW * scale + 'px';
        canvas.style.height = gameH * scale + 'px';
        canvas.style.marginLeft = offsetX + 'px';
        canvas.style.marginTop = offsetY + 'px';
    }

    // Asignar la función de inicio al objeto global
    com.egt.core.main.startGame = startGame;

    // Iniciar el juego cuando el DOM esté listo
    document.addEventListener('DOMContentLoaded', function () {
        startGame();
    });

}(window));
// Función para cargar todos los recursos del juego
function loadGameAssets(app) {
    console.log("Cargando recursos del juego...");

    // Crear el cargador de recursos
    var loader = new PIXI.Loader();

    // Añadir los recursos a cargar
    loader
        .add('reelImages', 'assets/images/reelImages.json')
        .add('gambleResources', 'assets/images/gambleResources.json')
        .add('jackpotResources', 'assets/images/jackpotResources.json')
        .add('jackpotTitle', 'assets/images/jackpotTitle/jackpotTitle.json');

    // Añadir los videos de los símbolos
    var reelVideos = new Config().reelVideos;
    for (var i = 0; i < reelVideos.length; i++) {
        if (reelVideos[i] && reelVideos[i].src) {
            for (var j = 0; j < reelVideos[i].src.length; j++) {
                loader.add('video_' + i + '_' + j, reelVideos[i].src[j]);
            }
        }
    }

    // Añadir los sonidos
    var gameSounds = new Config().gameSounds;
    for (var i = 0; i < gameSounds.length; i++) {
        loader.add(gameSounds[i].src, gameSounds[i].src);
    }

    var freespinSounds = new Config().freespinSounds;
    for (var i = 0; i < freespinSounds.length; i++) {
        loader.add(freespinSounds[i].id, freespinSounds[i].src);
    }

    // Evento cuando los recursos se cargan correctamente
    loader.load(function (loader, resources) {
        console.log("Todos los recursos cargados. Iniciando interfaz del juego.");
        initGameInterface(app, resources);
    });

    // Evento si hay un error al cargar
    loader.onError.add(function (error) {
        console.error("Error al cargar recursos:", error);
        showError("Error al cargar los recursos del juego. Por favor, recarga la página.");
    });
}
// Función para inicializar la interfaz del juego
function initGameInterface(app, resources) {
    // Ocultar el loader
    var loadingElement = document.getElementById('loading');
    if (loadingElement) {
        loadingElement.style.display = 'none';
    }

    // Crear la configuración global
    var config = new Config();

    // Inicializar el gestor de sonido
    var soundManager = new SoundManager();
    soundManager.init(config, resources);

    // Crear la vista principal del juego
    var mainView = new MainView();
    mainView.init(app, config, soundManager);
    app.stage.addChild(mainView);

    // Añadir la vista del juego al espacio de nombres global
    window.gameApp.mainView = mainView;
}

// Función para mostrar errores
function showError(message) {
    var loadingElement = document.getElementById('loading');
    if (loadingElement) {
        loadingElement.innerHTML = '<h2 style="color: red;">Error</h2><p>' + message + '</p>';
    }
}

// Clase MainView (vista principal del juego)
function MainView() {
    this.container = new PIXI.Container();
    this.reelsContainer = new PIXI.Container();

    this.init = function (app, config, soundManager) {
        this.app = app;
        this.config = config;
        this.soundManager = soundManager;

        // Añadir el contenedor de los carretes
        this.container.addChild(this.reelsContainer);

        // Inicializar los carretes
        this.reels = [];
        var reelX = 184;
        for (var i = 0; i < config.numReels; i++) {
            var reel = new Reel(i, reelX + i * (config.reelWidth + config.reelSpacing), 150, config);
            this.reels.push(reel);
            this.reelsContainer.addChild(reel.container);
        }

        // Añadir eventos de botones
        this.addButtons();
    };

    this.addButtons = function () {
        // Botón de start/spin
        var spinButton = new PIXI.Text('SPIN', {fill: 0xFFFFFF, fontSize: 24});
        spinButton.interactive = true;
        spinButton.buttonMode = true;
        spinButton.position.set(550, 620);
        spinButton.on('pointerdown', this.startSpin.bind(this));
        this.container.addChild(spinButton);
    };

    this.startSpin = function () {
        console.log('Iniciando spin...');
        for (var i = 0; i < this.reels.length; i++) {
            this.reels[i].startSpin();
        }
    };
}

// Clase Reel (carrete individual)
function Reel(index, x, y, config) {
    this.container = new PIXI.Container();
    this.container.position.set(x, y);
    this.config = config;
    this.index = index;

    this.startSpin = function () {
        console.log('Carrete ' + this.index + ' girando.');
    };
}
