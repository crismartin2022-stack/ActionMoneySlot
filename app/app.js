(function () {
  const runtimeConfig = window.__ACTION_MONEY_SLOT_CONFIG || {};
  const versionedApiBase = ((runtimeConfig.apiBase || '/api').replace(/\/$/, '')) + '/v1';
  const state = {
    socket: null,
    socketQueue: new Map(),
    session: null,
    games: [],
    selectedGame: null,
    settings: null,
    currentState: null,
    history: [],
    connected: false
  };

  const symbolLabels = {
    0: 'Sun', 1: 'Moon', 2: 'Star', 3: 'Gem', 4: 'Lantern', 5: 'Crown',
    6: 'Dragon', 7: 'Phoenix', 8: 'Wild', 9: 'Scatter', 10: 'Bonus'
  };

  const elements = {
    sessionId: document.getElementById('session-id'),
    balance: document.getElementById('balance'),
    connectionStatus: document.getElementById('connection-status'),
    gameList: document.getElementById('game-list'),
    selectedGameName: document.getElementById('selected-game-name'),
    modePill: document.getElementById('mode-pill'),
    versionPill: document.getElementById('version-pill'),
    reels: document.getElementById('reels'),
    betSelect: document.getElementById('bet-select'),
    denominationSelect: document.getElementById('denomination-select'),
    linesSelect: document.getElementById('lines-select'),
    connectButton: document.getElementById('connect-button'),
    spinButton: document.getElementById('spin-button'),
    lastTotalBet: document.getElementById('last-total-bet'),
    lastTotalWin: document.getElementById('last-total-win'),
    lastFreeSpins: document.getElementById('last-free-spins'),
    lastBonus: document.getElementById('last-bonus'),
    transportLog: document.getElementById('transport-log'),
    history: document.getElementById('client-history'),
    refreshGames: document.getElementById('refresh-games'),
    clearHistory: document.getElementById('clear-history'),
    sessionAction: document.getElementById('session-action')
  };

  function queryParam(name) {
    return new URL(window.location.href).searchParams.get(name);
  }

  function setStatus(text) {
    elements.connectionStatus.textContent = text;
  }

  function pushHistory(message) {
    state.history.unshift(message);
    state.history = state.history.slice(0, 12);
    elements.history.innerHTML = '';
    state.history.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      elements.history.appendChild(li);
    });
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value || 0));
  }

  function resolveWsUrl() {
    const host = runtimeConfig.tcpHost || window.location.hostname;
    const port = runtimeConfig.tcpPort || window.location.port;
    const protocol = runtimeConfig.sslHost ? 'wss' : 'ws';
    const portPart = port && !['80', '443'].includes(String(port)) ? ':' + port : '';
    return protocol + '://' + host + portPart + '/';
  }

  async function request(path, options) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options && options.headers ? options.headers : {}) },
      ...options
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(data.error || ('Request failed: ' + response.status));
    }
    return data;
  }

  async function ensureSession() {
    const storedId = queryParam('sessionId') || window.localStorage.getItem('ams_session_id');
    if (storedId) {
      try {
        const payload = await request(versionedApiBase + '/sessions/' + encodeURIComponent(storedId));
        state.session = payload.session;
        window.localStorage.setItem('ams_session_id', state.session.id);
        return;
      } catch (error) {}
    }
    const created = await request(versionedApiBase + '/sessions', {
      method: 'POST',
      body: JSON.stringify({
        playerName: 'web-player',
        balance: 15000,
        currency: runtimeConfig.currency || 'EUR',
        language: runtimeConfig.language || 'en'
      })
    });
    state.session = created.session;
    window.localStorage.setItem('ams_session_id', state.session.id);
  }

  function renderLobby() {
    elements.gameList.innerHTML = '';
    state.games.forEach((game) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'game-card' + (state.selectedGame && state.selectedGame.gameIdentificationNumber === game.gameIdentificationNumber ? ' active' : '');
      button.innerHTML = '<strong>' + game.displayName + '</strong><small>' + game.gameType + ' · ' + game.status + '</small>';
      button.addEventListener('click', async function () {
        await request(versionedApiBase + '/sessions/' + encodeURIComponent(state.session.id) + '/select-game', {
          method: 'POST',
          body: JSON.stringify({ gameIdentificationNumber: game.gameIdentificationNumber })
        });
        state.selectedGame = game;
        renderGameMeta();
        await connectAndPrime();
      });
      elements.gameList.appendChild(button);
    });
  }

  function fillSelect(select, values, selected) {
    select.innerHTML = '';
    values.forEach((value) => {
      const option = document.createElement('option');
      option.value = String(value);
      option.textContent = String(value);
      option.selected = String(value) === String(selected);
      select.appendChild(option);
    });
  }

  function renderGameMeta() {
    if (!state.selectedGame) return;
    const settings = state.selectedGame.settings || {};
    const mathConfig = state.selectedGame.mathConfig || {};
    elements.selectedGameName.textContent = state.selectedGame.displayName;
    elements.modePill.textContent = (mathConfig.layout && mathConfig.layout.mode) || settings.mode || 'lines';
    elements.versionPill.textContent = settings.gameVersion || 'custom';
    fillSelect(elements.betSelect, settings.bets || [1], settings.bets && settings.bets[0]);
    fillSelect(elements.denominationSelect, (mathConfig.denominations || [1]), (mathConfig.denominations || [1])[0]);
    const lines = Array.isArray(settings.linesCount)
      ? settings.linesCount
      : (Array.isArray(settings.lines)
        ? settings.lines
        : Array.from({ length: Number(settings.linesCount || ((mathConfig.layout && mathConfig.layout.paylines && mathConfig.layout.paylines.length) || (mathConfig.layout && mathConfig.layout.reels) || 1)) }, (_, index) => index + 1));
    fillSelect(elements.linesSelect, lines, lines[0]);
  }

  function renderBalance() {
    elements.sessionId.textContent = state.session ? state.session.id : '—';
    elements.balance.textContent = formatNumber(state.session && state.session.balance);
  }

  function renderReelsFromState(currentState) {
    const reels = Array.isArray(currentState && currentState.reels) ? currentState.reels : [];
    const reelCount = Number((state.selectedGame && state.selectedGame.mathConfig && state.selectedGame.mathConfig.layout && state.selectedGame.mathConfig.layout.reels) || 5);
    elements.reels.style.gridTemplateColumns = 'repeat(' + reelCount + ', minmax(88px, 1fr))';
    elements.reels.innerHTML = '';
    if (!reels.length) {
      for (let columnIndex = 0; columnIndex < reelCount; columnIndex += 1) {
        const column = document.createElement('div');
        column.className = 'reel-column';
        for (let rowIndex = 0; rowIndex < 3; rowIndex += 1) {
          const cell = document.createElement('div');
          cell.className = 'symbol-cell';
          cell.textContent = '—';
          column.appendChild(cell);
        }
        elements.reels.appendChild(column);
      }
      return;
    }
    for (let reelIndex = 0; reelIndex < reels.length; reelIndex += 5) {
      const transport = reels.slice(reelIndex, reelIndex + 5);
      const visible = transport.slice(1, 4);
      const column = document.createElement('div');
      column.className = 'reel-column';
      visible.forEach((symbolId) => {
        const cell = document.createElement('div');
        const symbolLabel = symbolLabels[symbolId] || ('S' + symbolId);
        cell.className = 'symbol-cell';
        if (symbolLabel === 'Wild') cell.classList.add('wild');
        if (symbolLabel === 'Scatter') cell.classList.add('scatter');
        if (symbolLabel === 'Bonus') cell.classList.add('bonus');
        cell.textContent = symbolLabel;
        column.appendChild(cell);
      });
      elements.reels.appendChild(column);
    }
  }

  function updateSummary(response) {
    const complex = response.complex || {};
    const result = complex.result || {};
    const freeSpins = complex.freeSpins || {};
    const bonus = complex.bonus || {};
    elements.lastTotalBet.textContent = formatNumber(result.totalBet || 0);
    elements.lastTotalWin.textContent = formatNumber(result.totalWin || response.winAmount || 0);
    elements.lastFreeSpins.textContent = String(freeSpins.remaining || complex.freespins || 0);
    elements.lastBonus.textContent = bonus.triggered ? formatNumber(bonus.winAmount || 0) : 'inactive';
    elements.transportLog.textContent = JSON.stringify(response, null, 2);
    renderReelsFromState(complex.currentState || complex);
  }

  function sendSocket(payload) {
    return new Promise(function (resolve, reject) {
      if (!state.socket || state.socket.readyState !== window.WebSocket.OPEN) {
        reject(new Error('WebSocket is not connected.'));
        return;
      }
      const messageId = payload.messageId || ('web-' + Math.random().toString(36).slice(2));
      payload.messageId = messageId;
      state.socketQueue.set(messageId, { resolve: resolve, reject: reject });
      state.socket.send(':::' + JSON.stringify(payload));
      setTimeout(function () {
        const pending = state.socketQueue.get(messageId);
        if (pending) {
          state.socketQueue.delete(messageId);
          reject(new Error('Timed out waiting for socket response.'));
        }
      }, 8000);
    });
  }

  async function primeGame() {
    const game = state.selectedGame;
    if (!game || !state.session) return;
    const loginResponse = await sendSocket({ command: 'login', qName: 'jServer.gameManager.login', sessionKey: 'LOCAL:web', sessionId: state.session.id });
    const settingsResponse = await sendSocket({ command: 'settings', qName: 'jServer.' + game.gameType + '.settings', sessionKey: 'LOCAL:web', sessionId: state.session.id, gameIdentificationNumber: game.gameIdentificationNumber });
    const subscribeResponse = await sendSocket({ command: 'subscribe', qName: 'jServer.' + game.gameType + '.subscribe', sessionKey: 'LOCAL:web', sessionId: state.session.id, gameIdentificationNumber: game.gameIdentificationNumber, gameNumber: -1 });
    state.settings = settingsResponse.complex || game.settings;
    state.currentState = subscribeResponse.complex.currentState || null;
    state.session.balance = loginResponse.balance;
    renderBalance();
    renderGameMeta();
    renderReelsFromState(state.currentState);
    pushHistory('Connected to ' + game.displayName + ' via WebSocket.');
  }

  async function connectAndPrime() {
    if (state.socket && state.socket.readyState === window.WebSocket.OPEN) {
      await primeGame();
      return;
    }
    if (state.socket) {
      try { state.socket.close(); } catch (error) {}
    }
    setStatus('connecting');
    state.socket = new window.WebSocket(resolveWsUrl());
    state.socket.addEventListener('open', async function () {
      state.connected = true;
      setStatus('online');
      try {
        await primeGame();
      } catch (error) {
        setStatus('error');
        elements.transportLog.textContent = error.message;
      }
    });
    state.socket.addEventListener('message', function (event) {
      const text = String(event.data || '');
      if (text === '1::') return;
      const normalized = text.indexOf(':::') === 0 ? text.slice(3) : text;
      const payload = JSON.parse(normalized);
      const pending = state.socketQueue.get(payload.messageId);
      if (pending) {
        state.socketQueue.delete(payload.messageId);
        pending.resolve(payload);
      }
      if (typeof payload.balance === 'number' && state.session) {
        state.session.balance = payload.balance;
        renderBalance();
      }
      if (payload.command === 'result' || payload.command === 'bet' || payload.command === 'subscribe') {
        updateSummary(payload);
      }
    });
    state.socket.addEventListener('close', function () {
      state.connected = false;
      setStatus('offline');
    });
    state.socket.addEventListener('error', function () {
      setStatus('error');
    });
  }

  async function runAction() {
    if (elements.sessionAction.value === 'balance') {
      const response = await sendSocket({ command: 'balance', qName: 'jServer.gameManager.balance', sessionKey: 'LOCAL:web', sessionId: state.session.id });
      state.session.balance = response.balance;
      renderBalance();
      updateSummary(response);
      pushHistory('Balance refreshed: ' + formatNumber(response.balance));
      return;
    }
    const game = state.selectedGame;
    const response = await sendSocket({
      command: 'spin',
      qName: 'jServer.' + game.gameType + '.spin',
      sessionKey: 'LOCAL:web',
      sessionId: state.session.id,
      gameIdentificationNumber: game.gameIdentificationNumber,
      spin: {
        bet: Number(elements.betSelect.value),
        denomination: Number(elements.denominationSelect.value),
        lines: Number(elements.linesSelect.value)
      }
    });
    state.session.balance = response.balance;
    renderBalance();
    updateSummary(response);
    const totalWin = response.complex && response.complex.result ? response.complex.result.totalWin : 0;
    pushHistory('Spin completed · win ' + formatNumber(totalWin));
  }

  async function bootstrap() {
    elements.connectButton.addEventListener('click', function () { connectAndPrime().catch((error) => { elements.transportLog.textContent = error.message; }); });
    elements.spinButton.addEventListener('click', function () { runAction().catch((error) => { elements.transportLog.textContent = error.message; }); });
    elements.refreshGames.addEventListener('click', function () { bootstrap().catch((error) => { elements.transportLog.textContent = error.message; }); });
    elements.clearHistory.addEventListener('click', function () { state.history = []; elements.history.innerHTML = ''; });

    const catalog = await request(versionedApiBase + '/games');
    state.games = catalog.games || [];
    await ensureSession();
    state.selectedGame = state.games.find((game) => game.gameIdentificationNumber === state.session.selectedGameId) || state.games[0] || null;
    renderLobby();
    renderGameMeta();
    renderBalance();
    renderReelsFromState(null);
    if (state.selectedGame) {
      await connectAndPrime();
    }
  }

  bootstrap().catch(function (error) {
    setStatus('error');
    elements.transportLog.textContent = error && error.stack ? error.stack : String(error);
  });
}());
