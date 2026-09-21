(function () {
  var OPEN_SOURCE_LIBS = [
    "https://code.jquery.com/jquery-3.7.1.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/pixi.js/4.8.9/pixi.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/gsap/2.1.3/TweenMax.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/gsap/2.1.3/plugins/CustomEase.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/gsap/2.1.3/plugins/Physics2DPlugin.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/gsap/2.1.3/plugins/PixiPlugin.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/webfont/1.6.28/webfontloader.js",
    "https://cdnjs.cloudflare.com/ajax/libs/bottlejs/1.7.1/bottle.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/howler/2.2.4/howler.min.js",
    "https://unpkg.com/puremvc@1.0.1/lib/puremvc-1.0.1.min.js"
  ];

  var LOCAL_ENGINE_LIBS = [
    "lib/gamy.min.js",
    "lib/egt-library.min.js"
  ];

  var LOCAL_GAME_BUNDLES = [
    "gpts.min.js",
    "Game.min.js",
    "BonusAnimation.min.js",
    "FreespinAnimation.min.js"
  ];

  var LOCAL_REQUIRED_FILES = [
    "content.json",
    "assets/images/background.jpg",
    "assets/images/mainResources.json",
    "assets/images/reelImages.json",
    "assets/sounds/mainSounds.mp3"
  ];

  function getContainer() {
    return document.getElementById("game-container");
  }

  function getMessageNode() {
    return document.getElementById("boot-message");
  }

  function setStatus(message) {
    var messageNode = getMessageNode();
    if (messageNode) {
      messageNode.textContent = message;
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function createLoaderApi() {
    return {
      loadScript: function (src, onComplete, query) {
        var script = document.createElement("script");
        script.async = true;
        script.onload = onComplete || function () {};
        script.src = src + this.getQueryString(query);
        document.head.appendChild(script);
      },
      loadQueue: function (srcs, onComplete) {
        var queue = srcs.slice();
        var that = this;

        function next() {
          if (!queue.length) {
            if (onComplete) {
              onComplete();
            }
            return;
          }

          var item = queue.shift();
          if (typeof item === "string") {
            item = { src: item };
          }

          that.loadScript(item.src, next, item.query);
        }

        next();
      },
      loadQueues: function (srcs, onComplete) {
        var queues = srcs.slice();
        var that = this;

        function next() {
          if (!queues.length) {
            if (onComplete) {
              onComplete();
            }
            return;
          }

          that.loadQueue(queues.shift(), next);
        }

        next();
      },
      getQueryString: function (query) {
        if (!query) {
          return "";
        }

        var params = new URLSearchParams();
        Object.keys(query).forEach(function (key) {
          params.set(key, query[key]);
        });
        return "?" + params.toString();
      }
    };
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.async = false;
      script.src = src;
      script.onload = function () {
        resolve(src);
      };
      script.onerror = function () {
        reject(new Error("No se pudo cargar " + src));
      };
      document.head.appendChild(script);
    });
  }

  function checkAsset(path) {
    return new Promise(function (resolve) {
      if (/\.(png|jpg|jpeg|gif|webp)$/i.test(path)) {
        var image = new Image();
        image.onload = function () {
          resolve(true);
        };
        image.onerror = function () {
          resolve(false);
        };
        image.src = path;
        return;
      }

      if (/\.(mp3|ogg|wav)$/i.test(path)) {
        var audio = document.createElement("audio");
        var onReady = function () {
          cleanup();
          resolve(true);
        };
        var onFailure = function () {
          cleanup();
          resolve(false);
        };
        var cleanup = function () {
          audio.removeEventListener("loadedmetadata", onReady);
          audio.removeEventListener("canplaythrough", onReady);
          audio.removeEventListener("error", onFailure);
        };

        audio.preload = "metadata";
        audio.addEventListener("loadedmetadata", onReady, { once: true });
        audio.addEventListener("canplaythrough", onReady, { once: true });
        audio.addEventListener("error", onFailure, { once: true });
        audio.src = path;
        audio.load();
        return;
      }

      var request = new XMLHttpRequest();
      request.open("GET", path, true);
      request.onreadystatechange = function () {
        if (request.readyState !== XMLHttpRequest.DONE) {
          return;
        }

        resolve(request.status >= 200 && request.status < 300);
      };
      request.onerror = function () {
        resolve(false);
      };
      request.send();
    });
  }

  function getBootstrapParams() {
    var search = new URLSearchParams(window.location.search);
    var tcpPort = parseInt(search.get("tcpPort") || "", 10);

    if (!Number.isFinite(tcpPort)) {
      tcpPort = 8095;
    }

    return {
      sessionKey: search.get("sessionKey") || "INT:EUR:5000000:IPC:taenagent",
      tcpHost: search.get("tcpHost") || "wss://mgs-demo.egtmgs.com",
      tcpPort: tcpPort,
      lang: search.get("lang") || "es"
    };
  }

  function renderFallback(details) {
    var container = getContainer();
    if (!container) {
      return;
    }

    var missingAssets = details.missingAssets
      .map(function (item) {
        return "<li><code>" + escapeHtml(item) + "</code></li>";
      })
      .join("");

    var missingEngine = details.missingEngine
      .map(function (item) {
        return "<li><code>" + escapeHtml(item) + "</code></li>";
      })
      .join("");

    container.innerHTML = [
      '<section class="panel shell">',
      '  <div class="shell-copy">',
      '    <p class="eyebrow">ActionMoneySlot</p>',
      "    <h1>Bundle local listo, pero el runtime sigue incompleto</h1>",
      "    <p>El repositorio ya arranca con <code>npm start</code>, pero el juego EGT completo no puede inicializarse mientras falten librerías del engine o archivos base del bundle.</p>",
      '    <div class="hero-actions">',
      '      <a class="button" href="assets/images/background.jpg" target="_blank" rel="noopener noreferrer">Ver arte principal</a>',
      '      <a class="button button-secondary" href="content.json" target="_blank" rel="noopener noreferrer">Abrir content.json</a>',
      "    </div>",
      "  </div>",
      '  <div class="shell-art" aria-hidden="true"></div>',
      "</section>",
      '<section class="panel checklist">',
      "  <div>",
      "    <h2>Estado del bootstrap</h2>",
      "    <ul>",
      "      <li>Servidor estático local listo.</li>",
      "      <li>Assets principales del juego detectados.</li>",
      "      <li>Bootstrap preparado para arrancar automáticamente cuando se repongan las dependencias faltantes.</li>",
      "    </ul>",
      "  </div>",
      "  <div>",
      "    <h2>Archivos de runtime faltantes</h2>",
      "    <ul>" + missingEngine + "</ul>",
      "  </div>",
      "  <div>",
      "    <h2>Assets faltantes</h2>",
      "    <ul>" + (missingAssets || "<li>Ninguno</li>") + "</ul>",
      "  </div>",
      "</section>"
    ].join("");
  }

  function renderFatalError(error) {
    var container = getContainer();
    if (!container) {
      return;
    }

    container.innerHTML = [
      '<section class="panel fatal">',
      "  <p class=\"eyebrow\">Error de arranque</p>",
      "  <h1>No se pudo preparar ActionMoneySlot</h1>",
      "  <p>" + escapeHtml(error.message) + "</p>",
      "</section>"
    ].join("");
  }

  function bootRealGame() {
    window.gptsInit = createLoaderApi();
    window.closePopup = function () {
      if (window.parent) {
        window.parent.postMessage({ command: "com.egt-bg.exit" }, "*");
      }

      if (window.parent && typeof window.parent.onExitGamePlatformEGT === "function") {
        window.parent.onExitGamePlatformEGT.call(window.parent);
        return;
      }

      window.close();
    };

    window.gptsOptions = Object.assign({}, window.gptsOptions || {}, {
      moduleQueues: []
    });

    return OPEN_SOURCE_LIBS.reduce(function (promise, src) {
      return promise.then(function () {
        return loadScript(src);
      });
    }, Promise.resolve())
      .then(function () {
        return LOCAL_ENGINE_LIBS.concat(LOCAL_GAME_BUNDLES).reduce(function (promise, src) {
          return promise.then(function () {
            return loadScript(src);
          });
        }, Promise.resolve());
      })
      .then(function () {
        if (!window.gpts || typeof window.gpts.start !== "function" || typeof window.gpts.Main !== "function") {
          throw new Error("El runtime del juego no expuso gpts.start/gpts.Main.");
        }

        setStatus("Inicializando el runtime EGT…");
        window.gpts.start(function () {
          new window.gpts.Main(getBootstrapParams());
        });
      });
  }

  function initGame() {
    setStatus("Validando archivos del bundle…");

    Promise.all(
      LOCAL_REQUIRED_FILES.concat(LOCAL_ENGINE_LIBS, LOCAL_GAME_BUNDLES).map(function (path) {
        return checkAsset(path).then(function (exists) {
          return { path: path, exists: exists };
        });
      })
    )
      .then(function (results) {
        var missingAssets = [];
        var missingEngine = [];

        results.forEach(function (result) {
          if (result.exists) {
            return;
          }

          if (LOCAL_ENGINE_LIBS.indexOf(result.path) !== -1 || LOCAL_GAME_BUNDLES.indexOf(result.path) !== -1) {
            missingEngine.push(result.path);
            return;
          }

          missingAssets.push(result.path);
        });

        if (missingEngine.length || missingAssets.length) {
          setStatus("El bundle quedó accesible, pero faltan archivos necesarios para arrancar el juego completo.");
          renderFallback({
            missingAssets: missingAssets,
            missingEngine: missingEngine
          });
          return;
        }

        setStatus("Todas las dependencias locales están presentes. Arrancando runtime…");
        return bootRealGame();
      })
      .catch(renderFatalError);
  }

  window.addEventListener("DOMContentLoaded", initGame);
})();
