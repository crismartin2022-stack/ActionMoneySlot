const crypto = require('crypto');

const DEFAULT_SYMBOLS = [
  { id: 0, key: 'sun', payouts: { 3: 6, 4: 12, 5: 30 } },
  { id: 1, key: 'moon', payouts: { 3: 8, 4: 16, 5: 40 } },
  { id: 2, key: 'star', payouts: { 3: 10, 4: 24, 5: 60 } },
  { id: 3, key: 'gem', payouts: { 3: 12, 4: 30, 5: 80 } },
  { id: 4, key: 'lantern', payouts: { 3: 15, 4: 40, 5: 100 } },
  { id: 5, key: 'crown', payouts: { 3: 18, 4: 60, 5: 140 } },
  { id: 6, key: 'dragon', payouts: { 3: 25, 4: 90, 5: 220 } },
  { id: 7, key: 'phoenix', payouts: { 3: 30, 4: 120, 5: 320 } },
  { id: 8, key: 'wild', payouts: { 3: 40, 4: 160, 5: 400 }, wild: true, multiplier: 2 },
  { id: 9, key: 'scatter', payouts: { 3: 2, 4: 10, 5: 50 }, scatter: true },
  { id: 10, key: 'bonus', payouts: { 3: 5, 4: 20, 5: 75 }, bonus: true }
];

const DEFAULT_PAYLINES = [
  [0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 0, 0],
  [2, 2, 1, 2, 2],
  [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1],
  [0, 1, 1, 1, 0]
];

const DEFAULT_REELS = [
  [0, 1, 8, 3, 4, 2, 9, 1, 5, 8, 4, 10, 6, 0, 2, 7, 9, 3, 1, 4, 8, 2, 10, 5],
  [1, 4, 2, 9, 3, 8, 0, 5, 10, 2, 6, 1, 4, 8, 7, 3, 9, 0, 2, 5, 10, 4, 1, 6],
  [2, 5, 1, 8, 9, 3, 0, 6, 10, 4, 2, 7, 8, 1, 5, 9, 3, 0, 4, 10, 6, 2, 1, 8],
  [3, 0, 8, 4, 1, 9, 2, 5, 10, 6, 3, 8, 7, 0, 4, 1, 9, 5, 2, 10, 6, 3, 8, 4],
  [4, 2, 9, 1, 8, 5, 3, 10, 0, 6, 4, 7, 2, 9, 1, 8, 5, 3, 10, 0, 6, 4, 2, 8]
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function createSeed() {
  return crypto.randomBytes(8).readBigUInt64BE(0);
}

function createRngState(seed) {
  return {
    value: typeof seed === 'bigint' ? seed : BigInt(seed || createSeed())
  };
}

function randomFloat(state) {
  state.value = (state.value * 6364136223846793005n + 1442695040888963407n) % (1n << 64n);
  return Number(state.value >> 11n) / Number(1n << 53n);
}

function randomInt(state, maxExclusive) {
  return Math.floor(randomFloat(state) * maxExclusive);
}

function serializeSeed(seed) {
  return String(typeof seed === 'bigint' ? seed : BigInt(seed));
}

function buildDefaultMathConfig(overrides = {}) {
  return normalizeMathConfig({
    id: overrides.id || 'original-action-money-slot',
    status: overrides.status || 'published',
    displayName: overrides.displayName || 'Original Action Money Slot',
    engineVersion: overrides.engineVersion || '1.0.0',
    layout: {
      mode: 'lines',
      reels: 5,
      rows: 3,
      paylines: DEFAULT_PAYLINES,
      ...clone(overrides.layout || {})
    },
    symbols: clone(overrides.symbols || DEFAULT_SYMBOLS),
    reels: clone(overrides.reels || DEFAULT_REELS),
    denominations: clone(overrides.denominations || [3, 5, 10, 20]),
    bets: clone(overrides.bets || [1, 2, 5, 10, 20]),
    wildSymbolId: overrides.wildSymbolId !== undefined ? overrides.wildSymbolId : 8,
    scatterSymbolId: overrides.scatterSymbolId !== undefined ? overrides.scatterSymbolId : 9,
    bonusSymbolId: overrides.bonusSymbolId !== undefined ? overrides.bonusSymbolId : 10,
    freeSpinAwards: {
      3: 5,
      4: 8,
      5: 12,
      ...(overrides.freeSpinAwards || {})
    },
    bonusAwards: {
      3: { multiplier: 2, respins: 1 },
      4: { multiplier: 5, respins: 2 },
      5: { multiplier: 10, respins: 3 },
      ...(overrides.bonusAwards || {})
    }
  });
}

function ensurePositiveSeries(name, values) {
  if (!Array.isArray(values) || !values.length) {
    throw new Error(`${name} must contain at least one value.`);
  }
  values.forEach((value) => {
    if (!Number.isFinite(Number(value)) || Number(value) <= 0) {
      throw new Error(`${name} entries must be positive numbers.`);
    }
  });
}

function validateMathConfig(config) {
  if (!Array.isArray(config.symbols) || !config.symbols.length) {
    throw new Error('Math config must define at least one symbol.');
  }
  const symbolIds = new Set(config.symbols.map((symbol) => symbol.id));
  if (symbolIds.size !== config.symbols.length) {
    throw new Error('Symbol ids must be unique.');
  }
  [config.wildSymbolId, config.scatterSymbolId, config.bonusSymbolId].forEach((symbolId) => {
    if (!symbolIds.has(symbolId)) {
      throw new Error(`Referenced symbol ${symbolId} is missing from symbols.`);
    }
  });
  if (!Array.isArray(config.reels) || config.reels.length !== config.layout.reels) {
    throw new Error('Reel strips must match the configured reel count.');
  }
  config.reels.forEach((strip, index) => {
    if (!Array.isArray(strip) || !strip.length) {
      throw new Error(`Reel ${index} must contain at least one symbol.`);
    }
    strip.forEach((symbolId) => {
      if (!symbolIds.has(symbolId)) {
        throw new Error(`Reel ${index} references unknown symbol ${symbolId}.`);
      }
    });
  });
  ensurePositiveSeries('Denominations', config.denominations);
  ensurePositiveSeries('Bets', config.bets);
  if (config.layout.mode === 'lines') {
    if (!Array.isArray(config.layout.paylines) || !config.layout.paylines.length) {
      throw new Error('Line mode requires at least one payline.');
    }
    config.layout.paylines.forEach((line, lineIndex) => {
      if (!Array.isArray(line) || line.length !== config.layout.reels) {
        throw new Error(`Payline ${lineIndex} must contain exactly ${config.layout.reels} positions.`);
      }
      line.forEach((rowIndex) => {
        if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= config.layout.rows) {
          throw new Error(`Payline ${lineIndex} contains an invalid row index.`);
        }
      });
    });
  }
  return config;
}

function normalizeMathConfig(config = {}) {
  const layout = config.layout || {};
  const reels = Array.isArray(config.reels) && config.reels.length ? clone(config.reels) : clone(DEFAULT_REELS);
  const rows = Math.max(3, normalizeNumber(layout.rows, 3));
  const reelCount = Math.max(3, normalizeNumber(layout.reels, reels.length));
  const paylines = Array.isArray(layout.paylines) && layout.paylines.length
    ? layout.paylines.map((line) => line.map((value) => normalizeNumber(value, 0)))
    : clone(DEFAULT_PAYLINES);
  const symbols = Array.isArray(config.symbols) && config.symbols.length ? clone(config.symbols) : clone(DEFAULT_SYMBOLS);
  return validateMathConfig({
    id: String(config.id || 'original-action-money-slot'),
    displayName: String(config.displayName || 'Original Action Money Slot'),
    engineVersion: String(config.engineVersion || '1.0.0'),
    status: String(config.status || 'published'),
    layout: {
      mode: layout.mode === 'ways' ? 'ways' : 'lines',
      reels: reelCount,
      rows,
      paylines
    },
    symbols,
    symbolMap: Object.fromEntries(symbols.map((symbol) => [symbol.id, symbol])),
    reels,
    denominations: (Array.isArray(config.denominations) && config.denominations.length ? config.denominations : [3, 5, 10, 20])
      .map((value) => normalizeNumber(value, 3)),
    bets: (Array.isArray(config.bets) && config.bets.length ? config.bets : [1, 2, 5, 10, 20])
      .map((value) => normalizeNumber(value, 1)),
    wildSymbolId: normalizeNumber(config.wildSymbolId, 8),
    scatterSymbolId: normalizeNumber(config.scatterSymbolId, 9),
    bonusSymbolId: normalizeNumber(config.bonusSymbolId, 10),
    freeSpinAwards: Object.fromEntries(Object.entries(config.freeSpinAwards || { 3: 5, 4: 8, 5: 12 }).map(([key, value]) => [key, normalizeNumber(value, 0)])),
    bonusAwards: Object.fromEntries(Object.entries(config.bonusAwards || { 3: { multiplier: 2, respins: 1 }, 4: { multiplier: 5, respins: 2 }, 5: { multiplier: 10, respins: 3 } }).map(([key, value]) => [key, {
      multiplier: normalizeNumber(value.multiplier, 0),
      respins: normalizeNumber(value.respins, 0)
    }]))
  });
}

function getVisibleGrid(config, state) {
  const stops = [];
  const columns = config.reels.slice(0, config.layout.reels).map((strip) => {
    const stop = randomInt(state, strip.length);
    stops.push(stop);
    const column = [];
    for (let rowIndex = 0; rowIndex < config.layout.rows; rowIndex += 1) {
      column.push(strip[(stop + rowIndex) % strip.length]);
    }
    return column;
  });
  return { columns, stops };
}

function gridToTransportReels(config, grid, stops) {
  return grid.flatMap((column, reelIndex) => {
    const strip = config.reels[reelIndex];
    const stop = stops[reelIndex];
    const top = strip[(stop - 1 + strip.length) % strip.length];
    const bottom = strip[(stop + column.length) % strip.length];
    return [top, ...column, bottom];
  });
}

function buildScatterCells(grid, symbolId) {
  const cells = [];
  grid.forEach((column, reelIndex) => {
    column.forEach((symbol, rowIndex) => {
      if (symbol === symbolId) {
        cells.push([reelIndex, rowIndex]);
      }
    });
  });
  return cells;
}

function resolveLineSymbol(symbolIds, wildSymbolId, scatterSymbolId, bonusSymbolId) {
  for (const symbolId of symbolIds) {
    if (symbolId !== wildSymbolId && symbolId !== scatterSymbolId && symbolId !== bonusSymbolId) {
      return symbolId;
    }
  }
  return symbolIds[0];
}

function calculateLineWins(config, grid, betPerLine) {
  const wildSymbolId = config.wildSymbolId;
  const scatterSymbolId = config.scatterSymbolId;
  const bonusSymbolId = config.bonusSymbolId;
  const lineWins = [];
  (config.layout.paylines || []).forEach((line, lineIndex) => {
    const symbolIds = line.map((rowIndex, reelIndex) => grid[reelIndex][rowIndex]);
    const baseSymbolId = resolveLineSymbol(symbolIds, wildSymbolId, scatterSymbolId, bonusSymbolId);
    if (baseSymbolId === scatterSymbolId || baseSymbolId === bonusSymbolId) {
      return;
    }
    let count = 0;
    let multiplier = 1;
    for (const symbolId of symbolIds) {
      if (symbolId === baseSymbolId || symbolId === wildSymbolId || (baseSymbolId === wildSymbolId && symbolId === wildSymbolId)) {
        count += 1;
        if (symbolId === wildSymbolId) {
          multiplier *= normalizeNumber(config.symbolMap[wildSymbolId] && config.symbolMap[wildSymbolId].multiplier, 2);
        }
      } else {
        break;
      }
    }
    if (count < 3) {
      return;
    }
    const payoutTable = (config.symbolMap[baseSymbolId] && config.symbolMap[baseSymbolId].payouts) || {};
    const payoutMultiplier = normalizeNumber(payoutTable[count], 0);
    if (!payoutMultiplier) {
      return;
    }
    const winAmount = betPerLine * payoutMultiplier * multiplier;
    lineWins.push({
      line: lineIndex,
      symbolId: baseSymbolId,
      count,
      multiplier,
      winAmount,
      cells: line.flatMap((rowIndex, reelIndex) => [reelIndex, rowIndex]),
      card: baseSymbolId
    });
  });
  return lineWins;
}

function calculateWaysWins(config, grid, betPerLine) {
  if (config.layout.mode !== 'ways') {
    return [];
  }
  const wins = [];
  Object.values(config.symbolMap).forEach((symbol) => {
    if (symbol.scatter || symbol.bonus || symbol.wild) {
      return;
    }
    let ways = 1;
    let count = 0;
    for (let reelIndex = 0; reelIndex < grid.length; reelIndex += 1) {
      const reelMatches = grid[reelIndex].filter((entry) => entry === symbol.id || entry === config.wildSymbolId).length;
      if (!reelMatches) {
        break;
      }
      count += 1;
      ways *= reelMatches;
    }
    if (count < 3) {
      return;
    }
    const payoutMultiplier = normalizeNumber(symbol.payouts && symbol.payouts[count], 0);
    if (!payoutMultiplier) {
      return;
    }
    wins.push({
      symbolId: symbol.id,
      count,
      ways,
      winAmount: ways * payoutMultiplier * betPerLine
    });
  });
  return wins;
}

function resolveScatterAndBonus(config, grid, totalBet) {
  const scatterCells = buildScatterCells(grid, config.scatterSymbolId);
  const bonusCells = buildScatterCells(grid, config.bonusSymbolId);
  const scatterCount = scatterCells.length;
  const bonusCount = bonusCells.length;
  const scatterSymbol = config.symbolMap[config.scatterSymbolId] || {};
  const scatterMultiplier = normalizeNumber(scatterSymbol.payouts && scatterSymbol.payouts[scatterCount], 0);
  const scatterWin = scatterMultiplier ? totalBet * scatterMultiplier : 0;
  const freeSpinsAwarded = normalizeNumber(config.freeSpinAwards[scatterCount], 0);
  const bonusAward = config.bonusAwards[bonusCount] || { multiplier: 0, respins: 0 };
  const bonusWin = totalBet * normalizeNumber(bonusAward.multiplier, 0);
  const respinsAwarded = normalizeNumber(bonusAward.respins, 0);
  return {
    scatterCells,
    bonusCells,
    scatterCount,
    bonusCount,
    scatterWin,
    bonusWin,
    freeSpinsAwarded,
    respinsAwarded
  };
}

function buildSpinState(config, result, options) {
  const { previousState, denomination, lines, betPerLine } = options;
  return {
    ...clone(previousState || {}),
    state: 'idle',
    bet: betPerLine,
    denomination,
    numberOfLines: lines,
    winAmount: result.totalWin,
    reels: gridToTransportReels(config, result.grid, result.stops),
    lines: clone(result.lineWins),
    combos: clone(result.lineWins.length ? result.lineWins : result.waysWins),
    scatters: clone(result.scatterCells),
    expand: clone(result.bonusCells),
    gambles: 0,
    jackpot: false,
    freespins: result.remainingFreeSpins,
    freespinsUsed: result.freeSpinsConsumed ? ((previousState && previousState.freespinsUsed) || 0) + 1 : 0,
    freespinScatters: clone(result.scatterCells),
    freespinsPerLine: result.freeSpinsAwarded || null,
    previousGambles: [],
    gamblesUsed: 0,
    respin: result.respinsAwarded > 0,
    holdReels: null,
    featureLog: clone(result.featureLog)
  };
}

function spin(configInput, rngStateInput, options = {}) {
  const config = normalizeMathConfig(configInput);
  const state = rngStateInput && typeof rngStateInput.value === 'bigint'
    ? rngStateInput
    : createRngState(rngStateInput && rngStateInput.value);
  const previousState = clone(options.previousState || {});
  const denomination = normalizeNumber(options.denomination, config.denominations[0]);
  const lines = normalizeNumber(options.lines, config.layout.mode === 'ways' ? config.layout.reels : Math.min(config.layout.paylines.length, 10));
  const betPerLine = normalizeNumber(options.betPerLine, denomination);
  const totalBet = config.layout.mode === 'ways' ? betPerLine : betPerLine * Math.max(1, lines);
  const freeSpinsBalance = normalizeNumber(previousState.freespins, 0);
  const freeSpinsConsumed = freeSpinsBalance > 0 ? 1 : 0;
  const wageredAmount = freeSpinsConsumed ? 0 : totalBet;
  const rngBefore = serializeSeed(state.value);
  const visibleGrid = getVisibleGrid(config, state);
  const grid = visibleGrid.columns;
  const lineWins = config.layout.mode === 'lines' ? calculateLineWins(config, grid, betPerLine).slice(0, lines) : [];
  const waysWins = calculateWaysWins(config, grid, betPerLine);
  const featureOutcome = resolveScatterAndBonus(config, grid, totalBet);
  const lineWinAmount = lineWins.reduce((sum, entry) => sum + entry.winAmount, 0);
  const waysWinAmount = waysWins.reduce((sum, entry) => sum + entry.winAmount, 0);
  const totalWin = lineWinAmount + waysWinAmount + featureOutcome.scatterWin + featureOutcome.bonusWin;
  const remainingFreeSpins = Math.max(0, freeSpinsBalance - freeSpinsConsumed) + featureOutcome.freeSpinsAwarded;
  const featureLog = [];
  if (featureOutcome.freeSpinsAwarded) {
    featureLog.push({ type: 'freeSpins', awarded: featureOutcome.freeSpinsAwarded });
  }
  if (featureOutcome.bonusWin) {
    featureLog.push({ type: 'bonus', awarded: featureOutcome.bonusWin, respins: featureOutcome.respinsAwarded });
  }
  const result = {
    grid,
    stops: visibleGrid.stops,
    totalBet: wageredAmount,
    lineWins,
    waysWins,
    scatterCells: featureOutcome.scatterCells,
    bonusCells: featureOutcome.bonusCells,
    scatterWin: featureOutcome.scatterWin,
    bonusWin: featureOutcome.bonusWin,
    totalWin,
    freeSpinsAwarded: featureOutcome.freeSpinsAwarded,
    respinsAwarded: featureOutcome.respinsAwarded,
    remainingFreeSpins,
    freeSpinsConsumed,
    featureLog,
    balanceDelta: totalWin - wageredAmount,
    rngBefore,
    rngAfter: serializeSeed(state.value)
  };
  result.currentState = buildSpinState(config, result, {
    previousState,
    denomination,
    lines,
    betPerLine
  });
  return result;
}

function simulateRtp(configInput, simulationOptions = {}) {
  const config = normalizeMathConfig(configInput);
  const spins = Math.max(1, normalizeNumber(simulationOptions.spins, 1000));
  const denomination = normalizeNumber(simulationOptions.denomination, config.denominations[0]);
  const lines = normalizeNumber(simulationOptions.lines, config.layout.mode === 'ways' ? config.layout.reels : Math.min(config.layout.paylines.length, 10));
  const betPerLine = normalizeNumber(simulationOptions.betPerLine, denomination);
  const state = createRngState(simulationOptions.seed);
  const metrics = {
    spins,
    totalBet: 0,
    totalWin: 0,
    hitCount: 0,
    bonusCount: 0,
    freeSpinTriggers: 0
  };
  let currentState = {};
  let mean = 0;
  let m2 = 0;
  let observations = 0;
  for (let spinIndex = 0; spinIndex < spins; spinIndex += 1) {
    const result = spin(config, state, {
      previousState: currentState,
      denomination,
      lines,
      betPerLine
    });
    metrics.totalBet += result.totalBet;
    metrics.totalWin += result.totalWin;
    if (result.totalWin > 0) {
      metrics.hitCount += 1;
    }
    if (result.bonusWin > 0) {
      metrics.bonusCount += 1;
    }
    if (result.freeSpinsAwarded > 0) {
      metrics.freeSpinTriggers += 1;
    }
    const returnRatio = result.totalBet > 0 ? result.totalWin / result.totalBet : 0;
    observations += 1;
    const delta = returnRatio - mean;
    mean += delta / observations;
    m2 += delta * (returnRatio - mean);
    currentState = result.currentState;
  }
  const variance = observations > 1 ? m2 / (observations - 1) : 0;
  const standardDeviation = Math.sqrt(Math.max(0, variance));
  const standardError = observations > 0 ? standardDeviation / Math.sqrt(observations) : 0;
  const confidence95 = {
    low: Math.max(0, mean - (1.96 * standardError)),
    high: mean + (1.96 * standardError)
  };
  return {
    ...metrics,
    seed: simulationOptions.seed === undefined ? null : serializeSeed(simulationOptions.seed),
    averageReturn: mean,
    variance,
    standardDeviation,
    confidence95,
    rtp: metrics.totalBet ? metrics.totalWin / metrics.totalBet : 0,
    hitRate: metrics.hitCount / spins,
    bonusRate: metrics.bonusCount / spins,
    freeSpinRate: metrics.freeSpinTriggers / spins
  };
}

module.exports = {
  buildDefaultMathConfig,
  clone,
  createRngState,
  createSeed,
  normalizeMathConfig,
  validateMathConfig,
  randomFloat,
  randomInt,
  serializeSeed,
  simulateRtp,
  spin
};
