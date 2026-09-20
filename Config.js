// game/Config.js - Versión de prueba simplificada y segura
var com = window.com || {};
com.egt = com.egt || {};
com.egt.baseslot = com.egt.baseslot || {};

var Config = function() {
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
    
    // Ruta a los spritesheets de los carretes
    this.reelImages = ["assets/images/reelImages.json"];
}

// Asigna la configuración al espacio de nombres global de EGT
com.egt.baseslot.Config = Config;
