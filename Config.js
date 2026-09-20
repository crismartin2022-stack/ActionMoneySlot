// Config.js - VERSIÓN DE PRUEBA MÍNIMA
var com = window.com || {};
com.egt = com.egt || {};
com.egt.baseslot = com.egt.baseslot || {};

var Config = function() {
    // Propiedades básicas sin objetos complejos que puedan causar errores
    this.reelWidth = 172;
    this.reelHeight = 516;
    this.reelSpacing = 17;
    this.numReels = 5;
    this.numReelCards = 3;
    this.numImages = 11;
    this.wildIndex = 8;
    this.linesCount = [1, 5, 10, 15, 20];
    this.hasFreespins = true;
    this.coinAnimationCoef = 20;
}

// Asigna la configuración al espacio de nombres global
com.egt.baseslot.Config = Config;
