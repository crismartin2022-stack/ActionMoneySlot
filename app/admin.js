(function () {
  const config = window.__ACTION_MONEY_SLOT_ADMIN__ || { apiBase: '/api/v1', csrfToken: '' };
  const sections = document.querySelectorAll('[data-admin-section]');
  const navButtons = document.querySelectorAll('[data-nav-target]');
  const state = { games: [], selectedGameId: null, images: [], apiKeys: [] };

  async function call(path, options) {
    const method = ((options && options.method) || 'GET').toUpperCase();
    const headers = { ...(options && options.headers ? options.headers : {}) };
    if (!headers['Content-Type'] && method !== 'GET' && method !== 'HEAD') {
      headers['Content-Type'] = 'application/json';
    }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      headers['X-CSRF-Token'] = config.csrfToken;
    }
    const response = await fetch(path, { credentials: 'same-origin', ...options, headers });
    const text = await response.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        data = { raw: text };
      }
    }
    if (!response.ok) throw new Error(data.error || data.raw || ('Request failed: ' + response.status));
    return data;
  }

  function showSection(id) {
    sections.forEach((section) => section.classList.toggle('hidden', section.dataset.adminSection !== id));
    navButtons.forEach((button) => {
      const active = button.dataset.navTarget === id;
      button.classList.toggle('primary', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function parseCsvNumbers(value) {
    return String(value || '').split(',').map((entry) => Number(entry.trim())).filter((entry) => Number.isFinite(entry));
  }

  function getSelectedGame() {
    return state.games.find((game) => game.gameIdentificationNumber === state.selectedGameId) || state.games[0] || null;
  }

  function renderGameOptions() {
    const select = document.getElementById('game-select');
    select.innerHTML = '';
    state.games.forEach((game) => {
      const option = document.createElement('option');
      option.value = String(game.gameIdentificationNumber);
      option.textContent = game.displayName + ' #' + game.gameIdentificationNumber + ' (' + game.status + ')';
      option.selected = game.gameIdentificationNumber === state.selectedGameId;
      select.appendChild(option);
    });
  }

  function fillGameForm() {
    const game = getSelectedGame();
    if (!game) return;
    state.selectedGameId = game.gameIdentificationNumber;
    const math = game.mathConfig || {};
    const layout = math.layout || {};
    document.getElementById('game-display-name').value = game.displayName || '';
    document.getElementById('game-name').value = game.gameName || '';
    document.getElementById('game-type').value = game.gameType || '';
    document.getElementById('engine-type').value = game.engineType || '';
    document.getElementById('game-status').value = game.status || 'draft';
    document.getElementById('layout-mode').value = layout.mode || 'lines';
    document.getElementById('layout-reels').value = layout.reels || 5;
    document.getElementById('layout-rows').value = layout.rows || 3;
    document.getElementById('bets-input').value = (game.settings && game.settings.bets ? game.settings.bets : []).join(', ');
    document.getElementById('denominations-input').value = (math.denominations || []).join(', ');
    document.getElementById('free-spins-input').value = JSON.stringify(math.freeSpinAwards || {}, null, 2);
    document.getElementById('bonus-awards-input').value = JSON.stringify(math.bonusAwards || {}, null, 2);
    document.getElementById('paylines-input').value = JSON.stringify(layout.paylines || [], null, 2);
    document.getElementById('reels-input').value = JSON.stringify(math.reels || [], null, 2);
    document.getElementById('symbols-input').value = JSON.stringify(math.symbols || [], null, 2);
    renderGameOptions();
  }

  function renderList(id, items, render) {
    const root = document.getElementById(id);
    root.innerHTML = '';
    items.forEach((item) => root.appendChild(render(item)));
  }

  function card(title, subtitle, bodyText) {
    const node = document.createElement('article');
    node.className = 'item-card';
    node.innerHTML = '<h4>' + title + '</h4><small>' + subtitle + '</small><pre>' + bodyText + '</pre>';
    return node;
  }

  async function loadGames() {
    const payload = await call(config.apiBase + '/admin/games');
    state.games = payload.games || [];
    state.selectedGameId = state.selectedGameId || (state.games[0] && state.games[0].gameIdentificationNumber);
    renderGameOptions();
    fillGameForm();
    renderList('catalog-list', state.games, (game) => card(
      game.displayName + ' #' + game.gameIdentificationNumber,
      game.gameType + ' · ' + game.status,
      JSON.stringify({ launchUrl: game.launchUrl, legacyLaunchUrl: game.legacyLaunchUrl }, null, 2)
    ));
  }

  async function saveGame() {
    const game = getSelectedGame();
    if (!game) return;
    const payload = {
      displayName: document.getElementById('game-display-name').value,
      gameName: document.getElementById('game-name').value,
      gameType: document.getElementById('game-type').value,
      engineType: document.getElementById('engine-type').value,
      status: document.getElementById('game-status').value,
      mathConfig: {
        displayName: document.getElementById('game-display-name').value,
        layout: {
          mode: document.getElementById('layout-mode').value,
          reels: Number(document.getElementById('layout-reels').value),
          rows: Number(document.getElementById('layout-rows').value),
          paylines: JSON.parse(document.getElementById('paylines-input').value || '[]')
        },
        symbols: JSON.parse(document.getElementById('symbols-input').value || '[]'),
        reels: JSON.parse(document.getElementById('reels-input').value || '[]'),
        denominations: parseCsvNumbers(document.getElementById('denominations-input').value),
        bets: parseCsvNumbers(document.getElementById('bets-input').value),
        freeSpinAwards: JSON.parse(document.getElementById('free-spins-input').value || '{}'),
        bonusAwards: JSON.parse(document.getElementById('bonus-awards-input').value || '{}')
      }
    };
    await call(config.apiBase + '/admin/games/' + game.gameIdentificationNumber + '/config', { method: 'PUT', body: JSON.stringify(payload) });
    await loadGames();
    await loadVersions();
    await loadAudit();
  }

  async function createGame() {
    const payload = { displayName: 'New Game', status: 'draft' };
    const response = await call(config.apiBase + '/admin/games', { method: 'POST', body: JSON.stringify(payload) });
    state.selectedGameId = response.game.gameIdentificationNumber;
    await loadGames();
    await loadVersions();
    await loadAudit();
  }

  async function duplicateGame() {
    const game = getSelectedGame();
    if (!game) return;
    const response = await call(config.apiBase + '/admin/games/' + game.gameIdentificationNumber + '/duplicate', { method: 'POST', body: JSON.stringify({ displayName: game.displayName + ' Copy' }) });
    state.selectedGameId = response.game.gameIdentificationNumber;
    await loadGames();
    await loadVersions();
    await loadAudit();
  }

  async function publishGame() {
    const game = getSelectedGame();
    if (!game) return;
    await call(config.apiBase + '/admin/games/' + game.gameIdentificationNumber + '/publish', { method: 'POST' });
    await loadGames();
    await loadVersions();
    await loadAudit();
  }

  async function loadVersions() {
    const game = getSelectedGame();
    if (!game) return;
    const payload = await call(config.apiBase + '/admin/games/' + game.gameIdentificationNumber + '/versions');
    renderList('versions-list', payload.versions || [], (version) => card(
      version.versionLabel,
      version.status + ' · ' + version.createdAt,
      JSON.stringify({ displayName: version.displayName, buildTime: version.buildTime }, null, 2)
    ));
  }

  async function runRtp() {
    const game = getSelectedGame();
    if (!game) return;
    const paylineSource = JSON.parse(document.getElementById('paylines-input').value || '[]');
    const layoutMode = document.getElementById('layout-mode').value;
    const simulationPayload = {
      spins: Number(document.getElementById('rtp-spins').value),
      denomination: Number(document.getElementById('denominations-input').value.split(',')[0].trim() || 1),
      betPerLine: Number(document.getElementById('bets-input').value.split(',')[0].trim() || 1)
    };
    if (layoutMode !== 'ways') {
      simulationPayload.lines = Math.max(1, Array.isArray(paylineSource) ? paylineSource.length : 1);
    }
    const payload = await call(config.apiBase + '/games/' + game.gameIdentificationNumber + '/rtp', {
      method: 'POST',
      body: JSON.stringify(simulationPayload)
    });
    document.getElementById('rtp-result').textContent = JSON.stringify(payload.simulation, null, 2);
    await loadRtpHistory();
    await loadAudit();
  }

  async function loadRtpHistory() {
    const game = getSelectedGame();
    if (!game) return;
    const payload = await call(config.apiBase + '/games/' + game.gameIdentificationNumber + '/rtp/history');
    renderList('rtp-history-list', payload.runs || [], (run) => card(
      (run.versionLabel || 'simulation') + ' · RTP ' + Number(run.simulation.rtp || 0).toFixed(4),
      run.createdAt,
      JSON.stringify(run.simulation, null, 2)
    ));
  }

  async function loadImages() {
    const payload = await call(config.apiBase + '/images');
    state.images = payload.images || [];
    renderList('images-list', state.images, (image) => {
      const node = card(image.fileName, image.createdAt, JSON.stringify({ id: image.id, gameIdentificationNumber: image.gameIdentificationNumber, url: image.url }, null, 2));
      const button = document.createElement('button');
      button.textContent = 'Delete';
      button.addEventListener('click', async function () {
        await call(config.apiBase + '/images/' + image.id, { method: 'DELETE' });
        await loadImages();
        await loadAudit();
      });
      node.appendChild(button);
      return node;
    });
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.onload = () => {
        const result = String(reader.result || '');
        const marker = 'base64,';
        const index = result.indexOf(marker);
        resolve(index >= 0 ? result.slice(index + marker.length) : result);
      };
      reader.readAsDataURL(file);
    });
  }

  async function uploadImage() {
    const file = document.getElementById('image-file').files[0];
    if (!file) throw new Error('Select an image first.');
    const base64 = await fileToBase64(file);
    await call(config.apiBase + '/images', {
      method: 'POST',
      body: JSON.stringify({
        gameIdentificationNumber: getSelectedGame() ? getSelectedGame().gameIdentificationNumber : null,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        description: document.getElementById('image-description').value,
        contentBase64: base64
      })
    });
    await loadImages();
    await loadAudit();
  }

  async function loadApiKeys() {
    const payload = await call(config.apiBase + '/api-keys');
    state.apiKeys = payload.apiKeys || [];
    renderList('api-keys-list', state.apiKeys, (apiKey) => {
      const node = card(apiKey.label, apiKey.createdAt, JSON.stringify(apiKey, null, 2));
      const button = document.createElement('button');
      button.textContent = 'Revoke';
      button.addEventListener('click', async function () {
        await call(config.apiBase + '/api-keys/' + apiKey.id, { method: 'DELETE' });
        await loadApiKeys();
        await loadAudit();
      });
      node.appendChild(button);
      return node;
    });
  }

  async function createApiKey() {
    const payload = await call(config.apiBase + '/api-keys', { method: 'POST', body: JSON.stringify({ label: document.getElementById('api-key-label').value }) });
    document.getElementById('api-key-created').textContent = JSON.stringify(payload.apiKey, null, 2);
    await loadApiKeys();
    await loadAudit();
  }

  async function loadAudit() {
    const payload = await call(config.apiBase + '/admin/audit');
    renderList('audit-list', payload.entries || [], (entry) => card(
      entry.action + ' · ' + entry.targetType,
      entry.createdAt,
      JSON.stringify(entry.details, null, 2)
    ));
  }

  async function logout() {
    await fetch('/admin/session', { method: 'DELETE', credentials: 'same-origin', headers: { 'X-CSRF-Token': config.csrfToken } });
    window.location.reload();
  }

  async function boot() {
    navButtons.forEach((button) => button.addEventListener('click', function () { showSection(button.dataset.navTarget); }));
    document.getElementById('game-select').addEventListener('change', function (event) {
      state.selectedGameId = Number(event.target.value);
      fillGameForm();
      loadVersions().catch(console.error);
      loadRtpHistory().catch(console.error);
    });
    document.getElementById('load-games').addEventListener('click', () => loadGames().then(loadVersions).then(loadRtpHistory));
    document.getElementById('create-game').addEventListener('click', () => createGame().catch(showError));
    document.getElementById('duplicate-game').addEventListener('click', () => duplicateGame().catch(showError));
    document.getElementById('save-game').addEventListener('click', () => saveGame().catch(showError));
    document.getElementById('publish-game').addEventListener('click', () => publishGame().catch(showError));
    document.getElementById('run-rtp').addEventListener('click', () => runRtp().catch(showError));
    document.getElementById('upload-image').addEventListener('click', () => uploadImage().catch(showError));
    document.getElementById('create-api-key').addEventListener('click', () => createApiKey().catch(showError));
    document.getElementById('logout-button').addEventListener('click', () => logout().catch(showError));

    await loadGames();
    await loadVersions();
    await loadRtpHistory();
    await loadImages();
    await loadApiKeys();
    await loadAudit();
    showSection('catalog');
  }

  function showError(error) {
    const message = error && error.message ? error.message : String(error);
    document.getElementById('global-error').textContent = message;
  }

  boot().catch(showError);
}());
