const { createServer } = require('http');
const { Server } = require('socket.io');
const express = require('express');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

// ==========================================
// 1. CARDS DATABASE & IMAGE STORAGE
// ==========================================
const CANDIDATE_IMAGE_DIRS = [
  process.env.IMAGES_DIR,
  '/opt/cute-mtg/images',
  path.join(__dirname, 'images'),
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'OCTGN', 'Data', 'ImageDatabase', 'A6C8D2E8-7CD8-11DD-8F94-E62B56D89593') : null,
  'C:\\Users\\Emily\\AppData\\Local\\Programs\\OCTGN\\Data\\ImageDatabase\\A6C8D2E8-7CD8-11DD-8F94-E62B56D89593'
].filter(Boolean);

let BASE_IMAGE_DIR = CANDIDATE_IMAGE_DIRS.find(d => fs.existsSync(d)) || path.join(__dirname, 'images');
const CACHE_DIR = path.join(BASE_IMAGE_DIR, 'cache');
try {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
} catch (e) {}

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'cards.db');
let db = null;
let getCardById = null;
let getCardByName = null;
let getCardByFrontName = null;
let searchTokensStmt = null;
let insertCardStmt = null;

try {
  if (fs.existsSync(DB_PATH)) {
    db = new DatabaseSync(DB_PATH);
  } else {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new DatabaseSync(DB_PATH);
    db.exec(`
      CREATE TABLE IF NOT EXISTS cards (
        id TEXT PRIMARY KEY,
        name TEXT COLLATE NOCASE,
        front_name TEXT,
        back_name TEXT,
        is_dfc INTEGER DEFAULT 0,
        has_image INTEGER DEFAULT 0,
        has_back_image INTEGER DEFAULT 0,
        mana_cost TEXT,
        type_line TEXT,
        power TEXT,
        toughness TEXT,
        set_code TEXT,
        set_id TEXT,
        image_subpath TEXT,
        back_image_subpath TEXT,
        updated_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name);
      CREATE INDEX IF NOT EXISTS idx_cards_front ON cards(front_name);
    `);
  }

  getCardById = db.prepare('SELECT * FROM cards WHERE id = ?');
  getCardByName = db.prepare('SELECT * FROM cards WHERE name = ? COLLATE NOCASE LIMIT 1');
  getCardByFrontName = db.prepare('SELECT * FROM cards WHERE front_name = ? COLLATE NOCASE LIMIT 1');
  searchTokensStmt = db.prepare("SELECT * FROM cards WHERE (type_line LIKE '%Token%' OR name LIKE '%Token%') AND (name LIKE ? OR front_name LIKE ?) LIMIT 30");
  insertCardStmt = db.prepare(`
    INSERT OR REPLACE INTO cards (
      id, name, front_name, back_name, is_dfc, has_image, has_back_image,
      mana_cost, type_line, power, toughness, set_code, set_id,
      image_subpath, back_image_subpath, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?
    )
  `);
  console.log(`Cards database loaded successfully from ${DB_PATH}`);
} catch (err) {
  console.error('Failed to initialize cards.db:', err);
}

function formatCardResponse(card) {
  const isDfc = Boolean(card.is_dfc);
  return {
    id: card.id,
    name: card.name,
    frontName: card.front_name || card.name,
    backName: card.back_name,
    isDfc: isDfc,
    imageUrl: `/api/card-image/${card.id}?face=front`,
    frontImageUrl: `/api/card-image/${card.id}?face=front`,
    backImageUrl: (isDfc || card.back_image_subpath) ? `/api/card-image/${card.id}?face=back` : null,
    manaCost: card.mana_cost,
    typeLine: card.type_line,
    power: card.power,
    toughness: card.toughness
  };
}

const activeDownloads = new Map();
async function downloadImage(url, destPath) {
  if (activeDownloads.has(destPath)) {
    return activeDownloads.get(destPath);
  }
  const tempPath = destPath + '.tmp.' + Math.random().toString(36).substring(2);
  const promise = (async () => {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'cute-mtg-lan/1.0' }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      await fs.promises.writeFile(tempPath, Buffer.from(arrayBuffer));
      try {
        await fs.promises.rename(tempPath, destPath);
      } catch (renameErr) {
        await fs.promises.copyFile(tempPath, destPath);
        await fs.promises.unlink(tempPath).catch(() => {});
      }
      return destPath;
    } catch (err) {
      await fs.promises.unlink(tempPath).catch(() => {});
      console.warn(`Failed downloading image from ${url}:`, err.message);
      throw err;
    } finally {
      activeDownloads.delete(destPath);
    }
  })();
  activeDownloads.set(destPath, promise);
  return promise;
}

function saveScryfallCardToDb(sCard) {
  if (!db || !insertCardStmt) return null;
  const isDfc = sCard.card_faces && sCard.card_faces.length > 1;
  const frontFace = isDfc ? sCard.card_faces[0] : sCard;
  const backFace = isDfc ? sCard.card_faces[1] : null;

  const cardRecord = {
    id: sCard.id.toLowerCase(),
    name: sCard.name,
    front_name: frontFace.name || sCard.name,
    back_name: backFace ? backFace.name : null,
    is_dfc: isDfc ? 1 : 0,
    has_image: 1,
    has_back_image: isDfc ? 1 : 0,
    mana_cost: sCard.mana_cost || frontFace.mana_cost || '',
    type_line: sCard.type_line || frontFace.type_line || '',
    power: sCard.power || frontFace.power || '',
    toughness: sCard.toughness || frontFace.toughness || '',
    set_code: (sCard.set || '').toLowerCase(),
    set_id: sCard.set_id || '',
    image_subpath: `cache/${sCard.id.toLowerCase()}.jpg`,
    back_image_subpath: isDfc ? `cache/${sCard.id.toLowerCase()}_back.jpg` : null,
    updated_at: Date.now()
  };

  try {
    insertCardStmt.run(
      cardRecord.id,
      cardRecord.name,
      cardRecord.front_name,
      cardRecord.back_name,
      cardRecord.is_dfc,
      cardRecord.has_image,
      cardRecord.has_back_image,
      cardRecord.mana_cost,
      cardRecord.type_line,
      cardRecord.power,
      cardRecord.toughness,
      cardRecord.set_code,
      cardRecord.set_id,
      cardRecord.image_subpath,
      cardRecord.back_image_subpath,
      cardRecord.updated_at
    );
  } catch (err) {
    console.error(`Failed to insert Scryfall card ${sCard.id}:`, err);
  }

  // Pre-fetch images in background
  const frontImgUrl = sCard.image_uris?.normal || frontFace.image_uris?.normal;
  if (frontImgUrl) {
    const dest = path.join(CACHE_DIR, `${cardRecord.id}.jpg`);
    downloadImage(frontImgUrl, dest).catch(() => {});
  }
  const backImgUrl = backFace?.image_uris?.normal;
  if (backImgUrl) {
    const dest = path.join(CACHE_DIR, `${cardRecord.id}_back.jpg`);
    downloadImage(backImgUrl, dest).catch(() => {});
  }

  return cardRecord;
}

// ==========================================
// 2. API ROUTES
// ==========================================
app.use(express.json({ limit: '20mb' }));

const cardPathCache = new Map();
async function fileExistsAsync(filePath) {
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

const CUSTOM_ASSETS_DIR = path.join(BASE_IMAGE_DIR, 'custom_assets');
try { fs.mkdirSync(CUSTOM_ASSETS_DIR, { recursive: true }); } catch (e) {}

app.post('/api/upload-asset', async (req, res) => {
  try {
    const { data } = req.body || {};
    if (!data || typeof data !== 'string') return res.status(400).json({ error: 'Missing data' });
    const matches = data.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Invalid base64 Data URI' });
    }
    const ext = matches[1].includes('png') ? 'png' : 'jpg';
    const buffer = Buffer.from(matches[2], 'base64');
    const hash = require('crypto').createHash('md5').update(buffer).digest('hex').substring(0, 16);
    const filename = `asset_${hash}.${ext}`;
    const filePath = path.join(CUSTOM_ASSETS_DIR, filename);
    await fs.promises.writeFile(filePath, buffer);
    res.json({ url: `/api/custom-asset/${filename}` });
  } catch (err) {
    console.error('Failed to upload custom asset:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/custom-asset/:filename', async (req, res) => {
  const safeName = path.basename(req.params.filename);
  const filePath = path.join(CUSTOM_ASSETS_DIR, safeName);
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Type', safeName.endsWith('.png') ? 'image/png' : 'image/jpeg');
    fs.createReadStream(filePath).pipe(res);
  } catch {
    res.status(404).send('Asset not found');
  }
});

app.get('/api/card-image/:id', async (req, res) => {
  const cardId = req.params.id.toLowerCase();
  const face = req.query.face === 'back' ? 'back' : 'front';
  const cacheKey = `${cardId}_${face}`;

  if (cardPathCache.has(cacheKey)) {
    const cachedP = cardPathCache.get(cacheKey);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Type', 'image/jpeg');
    return fs.createReadStream(cachedP).pipe(res);
  }

  let card = null;
  if (getCardById) {
    try {
      card = getCardById.get(cardId);
    } catch (e) {
      console.warn(`Database lookup failed for card id ${cardId}:`, e.message);
    }
  }

  // 1. Check primary image store if subpath is known
  let subpath = null;
  if (card) {
    subpath = (face === 'back' && card.back_image_subpath) ? card.back_image_subpath : card.image_subpath;
  }

  if (subpath) {
    for (const baseDir of CANDIDATE_IMAGE_DIRS) {
      const p = path.join(baseDir, subpath);
      if (await fileExistsAsync(p)) {
        cardPathCache.set(cacheKey, p);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('Content-Type', 'image/jpeg');
        return fs.createReadStream(p).pipe(res);
      }
    }
  }

  // 2. Check cache directory
  const cacheFile = path.join(CACHE_DIR, `${cardId}${face === 'back' ? '_back' : ''}.jpg`);
  if (await fileExistsAsync(cacheFile)) {
    cardPathCache.set(cacheKey, cacheFile);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Type', 'image/jpeg');
    return fs.createReadStream(cacheFile).pipe(res);
  }

  // 3. Fallback: Fetch missing card / image from Scryfall on demand
  try {
    const sRes = await fetch(`https://api.scryfall.com/cards/${cardId}`, {
      headers: { 'User-Agent': 'cute-mtg-lan/1.0' }
    });
    if (sRes.ok) {
      const sCard = await sRes.json();
      saveScryfallCardToDb(sCard);

      const isDfc = sCard.card_faces && sCard.card_faces.length > 1;
      let imgUrl = null;
      if (face === 'back' && isDfc) {
        imgUrl = sCard.card_faces[1]?.image_uris?.normal;
      } else if (isDfc) {
        imgUrl = sCard.card_faces[0]?.image_uris?.normal;
      } else {
        imgUrl = sCard.image_uris?.normal;
      }

      if (imgUrl) {
        await downloadImage(imgUrl, cacheFile);
        if (await fileExistsAsync(cacheFile)) {
          cardPathCache.set(cacheKey, cacheFile);
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          res.setHeader('Content-Type', 'image/jpeg');
          return fs.createReadStream(cacheFile).pipe(res);
        }
      }
    }
  } catch (err) {
    console.warn(`Scryfall on-demand fetch failed for ${cardId}:`, err.message);
  }

  // 4. Default fallback: card back image
  const cardBackCandidates = [
    path.join(__dirname, 'data', 'card-back.jpg'),
    path.join(__dirname, 'dist', 'card-back.jpg'),
    path.join(__dirname, 'public', 'card-back.jpg')
  ];
  for (const fallback of cardBackCandidates) {
    if (await fileExistsAsync(fallback)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Content-Type', 'image/jpeg');
      return fs.createReadStream(fallback).pipe(res);
    }
  }

  res.status(404).send('Card image not found');
});

app.get('/api/card-back', async (req, res) => {
  const cardBackCandidates = [
    path.join(__dirname, 'data', 'card-back.jpg'),
    path.join(__dirname, 'dist', 'card-back.jpg'),
    path.join(__dirname, 'public', 'card-back.jpg')
  ];
  for (const fallback of cardBackCandidates) {
    if (await fileExistsAsync(fallback)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Content-Type', 'image/jpeg');
      return fs.createReadStream(fallback).pipe(res);
    }
  }
  res.status(404).send('Card back not found');
});

app.post('/api/cards/batch', async (req, res) => {
  const rawIdentifiers = req.body?.identifiers || [];
  if (!Array.isArray(rawIdentifiers) || rawIdentifiers.length === 0) {
    return res.json({ data: [], notFound: [] });
  }
  const identifiers = rawIdentifiers.filter(i => i && typeof i === 'object');

  const results = [];
  const missing = [];
  const notFoundNames = [];

  for (const ident of identifiers) {
    let card = null;
    if (ident.id && getCardById) {
      try {
        card = getCardById.get(ident.id.toLowerCase());
      } catch (e) {
        console.warn(`Database lookup by ID failed for ${ident.id}:`, e.message);
      }
    }
    if (!card && ident.name) {
      try {
        if (getCardByName) card = getCardByName.get(ident.name);
        if (!card && getCardByFrontName) card = getCardByFrontName.get(ident.name);
      } catch (e) {
        console.warn(`Database lookup by name failed for ${ident.name}:`, e.message);
      }
    }

    if (card) {
      results.push(formatCardResponse(card));
    } else {
      missing.push(ident);
    }
  }

  // If there are missing cards and we can reach Scryfall, batch fetch them
  if (missing.length > 0) {
    for (let i = 0; i < missing.length; i += 75) {
      const chunk = missing.slice(i, i + 75).map(m => {
        if (m.id && m.id.length === 36) return { id: m.id };
        return { name: m.name };
      });
      try {
        const sRes = await fetch('https://api.scryfall.com/cards/collection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'cute-mtg-lan/1.0' },
          body: JSON.stringify({ identifiers: chunk })
        });
        if (sRes.ok) {
          const sData = await sRes.json();
          if (sData.data && Array.isArray(sData.data)) {
            for (const sCard of sData.data) {
              const inserted = saveScryfallCardToDb(sCard);
              if (inserted) results.push(formatCardResponse(inserted));
            }
          }
          if (sData.not_found && Array.isArray(sData.not_found)) {
            // For any that failed by ID, retry exact name query if name was provided
            for (const nf of sData.not_found) {
              const original = missing.find(m => (nf.id ? m.id === nf.id : (nf.name && m.name && m.name.toLowerCase() === nf.name.toLowerCase())));
              if (original && original.name && nf.id) {
                await new Promise(r => setTimeout(r, 75));
                try {
                  const sResName = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(original.name)}`, {
                    headers: { 'User-Agent': 'cute-mtg-lan/1.0' }
                  });
                  if (sResName.ok) {
                    const sCardName = await sResName.json();
                    const inserted = saveScryfallCardToDb(sCardName);
                    if (inserted) results.push(formatCardResponse(inserted));
                  } else {
                    notFoundNames.push(original.name);
                  }
                } catch (e) {
                  notFoundNames.push(original.name);
                }
              } else {
                notFoundNames.push(original?.name || nf.name || nf.id || 'Unknown');
              }
            }
          }
        }
      } catch (err) {
        console.warn('Failed Scryfall collection query for missing cards:', err.message);
        chunk.forEach(m => {
          if (m && m.name) notFoundNames.push(m.name);
          else if (m && m.id) notFoundNames.push(m.id);
        });
      }
    }
  }

  res.json({ data: results, notFound: notFoundNames });
});

app.get('/api/tokens/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ data: [] });

  const results = [];
  try {
    if (searchTokensStmt) {
      const localTokens = searchTokensStmt.all(`%${q}%`, `%${q}%`);
      for (const card of localTokens) {
        results.push(formatCardResponse(card));
      }
    }

    if (results.length < 10) {
      try {
        const sRes = await fetch(`https://api.scryfall.com/cards/search?q=t:token+${encodeURIComponent(q)}`, {
          headers: { 'User-Agent': 'cute-mtg-lan/1.0' }
        });
        if (sRes.ok) {
          const sData = await sRes.json();
          if (sData.data && Array.isArray(sData.data)) {
            for (const sCard of sData.data.slice(0, 20)) {
              if (!results.find(r => r.name.toLowerCase() === sCard.name.toLowerCase())) {
                const inserted = saveScryfallCardToDb(sCard);
                if (inserted) results.push(formatCardResponse(inserted));
              }
            }
          }
        }
      } catch (e) {
        // Scryfall unreachable / offline
      }
    }
  } catch (err) {
    console.error('Token search error:', err);
  }

  res.json({ data: results });
});

// ==========================================
// 3. STATIC FILES & CATCH-ALL
// ==========================================
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  if (req.path.startsWith('/assets/')) {
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    return next();
  }
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ==========================================
// 4. GAME STATE & SOCKET.IO
// ==========================================
let gameState = {
  cards: [],
  players: {}, // playerId -> { name, life: 20, mana: { w:0, u:0, b:0, r:0, g:0, c:0 } }
  activePlayerId: null,
  logs: [],
  targetArrows: [],
  monarch: null,
  dayNight: 'none',
  stormCount: 0,
  funnyMode: false
};

let undoStack = [];
let redoStack = [];

function safe(handler) {
  return (...args) => {
    try {
      const res = handler(...args);
      if (res && typeof res.catch === 'function') {
        res.catch(err => console.error('Async socket error:', err));
      }
    } catch (err) {
      console.error('Socket error:', err);
    }
  };
}

function isBattlefieldOnlyMove(updatedCards) {
  if (!Array.isArray(updatedCards) || updatedCards.length === 0) return false;
  return updatedCards.every(u => {
    if (!u || u.delete) return false;
    const existing = gameState.cards.find(c => c.id === u.id);
    if (!existing) return false;
    const oldZone = existing.zone;
    const newZone = u.zone || oldZone;
    if (oldZone !== 'battlefield' || newZone !== 'battlefield') return false;

    if (u.isTapped !== undefined && u.isTapped !== existing.isTapped) return false;
    if (u.noUntap !== undefined && u.noUntap !== existing.noUntap) return false;
    if (u.faceDown !== undefined && u.faceDown !== existing.faceDown) return false;
    if (u.isTransformed !== undefined && u.isTransformed !== existing.isTransformed) return false;
    if (u.counters !== undefined && u.counters !== existing.counters) return false;
    if (u.customCounters !== undefined) {
      const uKeys = Object.keys(u.customCounters || {}).filter(k => (u.customCounters[k] || 0) > 0).sort();
      const exKeys = Object.keys(existing.customCounters || {}).filter(k => (existing.customCounters[k] || 0) > 0).sort();
      if (uKeys.length !== exKeys.length) return false;
      for (const k of uKeys) {
        if (u.customCounters[k] !== existing.customCounters?.[k]) return false;
      }
    }
    if (u.tempPower !== undefined && u.tempPower !== existing.tempPower) return false;
    if (u.tempToughness !== undefined && u.tempToughness !== existing.tempToughness) return false;
    if (u.attachedTo !== undefined && u.attachedTo !== existing.attachedTo) return false;
    if (u.commanderTax !== undefined && u.commanderTax !== existing.commanderTax) return false;
    if (u.controllerId !== undefined && u.controllerId !== existing.controllerId) return false;
    if (u.ownerId !== undefined && u.ownerId !== existing.ownerId) return false;

    return true;
  });
}

function saveState() {
  undoStack.push({
    cards: JSON.parse(JSON.stringify(gameState.cards)),
    players: JSON.parse(JSON.stringify(gameState.players)),
    activePlayerId: gameState.activePlayerId,
    monarch: gameState.monarch,
    dayNight: gameState.dayNight,
    stormCount: gameState.stormCount
  });
  if (undoStack.length > 30) undoStack.shift();
  redoStack = [];
}

function addLog(msg) {
  gameState.logs.push({ id: Date.now() + Math.random(), text: msg });
  if (gameState.logs.length > 100) gameState.logs.shift();
}

io.on('connection', (socket) => {
  const playerId = socket.handshake.auth.playerId || socket.id;
  const playerName = socket.handshake.auth.playerName || "Unknown";
  
  if (!gameState.players[playerId]) {
    gameState.players[playerId] = { 
      name: playerName, 
      life: 20, 
      startingLife: 20,
      poison: 0, 
      energy: 0, 
      experience: 0, 
      mana: { w:0, u:0, b:0, r:0, g:0, c:0 },
      commanderDamage: {},
      revealedHand: false
    };
    addLog(`${playerName} joined the table.`);
  } else {
    gameState.players[playerId].name = playerName; // Update name on reconnect
  }
  
  socket.emit('sync', gameState);

  socket.on('undo', safe(() => {
    if (undoStack.length > 0) {
      redoStack.push({
        cards: JSON.parse(JSON.stringify(gameState.cards)),
        players: JSON.parse(JSON.stringify(gameState.players)),
        activePlayerId: gameState.activePlayerId,
        monarch: gameState.monarch,
        dayNight: gameState.dayNight,
        stormCount: gameState.stormCount
      });
      if (redoStack.length > 30) redoStack.shift();
      const restored = undoStack.pop();
      gameState.cards = restored.cards;
      if (restored.players) gameState.players = restored.players;
      gameState.activePlayerId = restored.activePlayerId;
      gameState.monarch = restored.monarch;
      gameState.dayNight = restored.dayNight;
      gameState.stormCount = restored.stormCount;
      addLog(`${gameState.players[playerId]?.name || 'Someone'} undid the last action.`);
      io.emit('sync', gameState);
    }
  }));

  socket.on('redo', safe(() => {
    if (redoStack.length > 0) {
      undoStack.push({
        cards: JSON.parse(JSON.stringify(gameState.cards)),
        players: JSON.parse(JSON.stringify(gameState.players)),
        activePlayerId: gameState.activePlayerId,
        monarch: gameState.monarch,
        dayNight: gameState.dayNight,
        stormCount: gameState.stormCount
      });
      const restored = redoStack.pop();
      gameState.cards = restored.cards;
      if (restored.players) gameState.players = restored.players;
      gameState.activePlayerId = restored.activePlayerId;
      gameState.monarch = restored.monarch;
      gameState.dayNight = restored.dayNight;
      gameState.stormCount = restored.stormCount;
      addLog(`${gameState.players[playerId]?.name || 'Someone'} redid an action.`);
      io.emit('sync', gameState);
    }
  }));

  socket.on('reset-turn', safe(() => {
    gameState.activePlayerId = null;
    io.emit('sync', gameState);
  }));

  socket.on('update-cards', safe((updatedCards) => {
    if (!Array.isArray(updatedCards)) return;
    if (!isBattlefieldOnlyMove(updatedCards)) {
      saveState();
    }
    updatedCards.forEach(cardUpdate => {
      if (!cardUpdate || typeof cardUpdate !== 'object' || !cardUpdate.id) return;
      const idx = gameState.cards.findIndex(c => c.id === cardUpdate.id);
      
      if (cardUpdate.delete) {
        if (idx !== -1) gameState.cards.splice(idx, 1);
        return;
      }

      if (idx !== -1) {
        gameState.cards[idx] = { ...gameState.cards[idx], ...cardUpdate };
      } else {
        gameState.cards.push(cardUpdate);
      }
    });
    io.emit('sync', gameState);
  }));

  socket.on('update-player', safe((updates) => {
    if (!updates || typeof updates !== 'object') return;
    if (gameState.players[playerId]) {
      const p = gameState.players[playerId];
      const hasMeaningfulChange = (updates.life !== undefined && updates.life !== p.life) ||
        (updates.poison !== undefined && updates.poison !== p.poison) ||
        (updates.energy !== undefined && updates.energy !== p.energy) ||
        (updates.experience !== undefined && updates.experience !== p.experience) ||
        (updates.commanderDamage !== undefined && JSON.stringify(updates.commanderDamage) !== JSON.stringify(p.commanderDamage || {}));
      if (hasMeaningfulChange) {
        saveState();
      }
      gameState.players[playerId] = { ...gameState.players[playerId], ...updates };
    }
    io.emit('sync', gameState);
  }));

  socket.on('reset-round', safe((targetPlayerId) => {
    saveState();
    const pid = targetPlayerId || playerId;
    // 1. Delete tokens belonging to this player
    gameState.cards = gameState.cards.filter(c => !(c.ownerId === pid && c.isToken));

    // 2. Return non-tokens to originalZone (library, command_zone, sideboard)
    gameState.cards.forEach(c => {
      const cardOwner = c.originalOwnerId || c.ownerId;
      if (cardOwner === pid) {
        c.ownerId = pid;
        c.controllerId = pid;
        const destZone = c.originalZone || 'library';
        c.zone = destZone;
        c.faceDown = (destZone === 'library');
        c.x = 0;
        c.y = 0;
        c.isTapped = false;
        c.counters = 0;
        c.customCounters = {};
        c.commanderTax = 0;
        c.tempPower = 0;
        c.tempToughness = 0;
        c.attachedTo = null;
        c.isTransformed = false;
        if (c.frontImageUrl) c.imageUrl = c.frontImageUrl;
        if (c.frontName) c.name = c.frontName;
        c.order = Math.random();
      } else if (c.ownerId === pid && c.originalOwnerId !== pid) {
        // Revert control of opponent's stolen card
        c.ownerId = c.originalOwnerId;
        c.controllerId = c.originalOwnerId;
      }
    });

    if (gameState.players[pid]) {
      const p = gameState.players[pid];
      p.life = p.startingLife ?? 20;
      p.poison = 0;
      p.energy = 0;
      p.experience = 0;
      p.mana = { w:0, u:0, b:0, r:0, g:0, c:0 };
      p.commanderDamage = {};
      p.revealedHand = false;
      addLog(`${p.name} reset their deck (tokens removed, commanders/sideboard preserved, deck shuffled).`);
    }
    io.emit('sync', gameState);
  }));

  socket.on('reset-game', safe(() => {
    saveState();
    gameState.cards = [];
    gameState.activePlayerId = null;
    gameState.targetArrows = [];
    gameState.monarch = null;
    gameState.dayNight = 'none';
    gameState.stormCount = 0;
    Object.values(gameState.players).forEach(p => {
      p.life = p.startingLife ?? 20;
      p.poison = 0;
      p.energy = 0;
      p.experience = 0;
      p.mana = { w:0, u:0, b:0, r:0, g:0, c:0 };
      p.commanderDamage = {};
      p.revealedHand = false;
    });
    addLog(`The entire table was cleared!`);
    io.emit('sync', gameState);
  }));

  socket.on('hard-reset', safe(() => {
    undoStack = [];
    redoStack = [];
    gameState.cards = [];
    gameState.activePlayerId = null;
    gameState.targetArrows = [];
    gameState.monarch = null;
    gameState.dayNight = 'none';
    gameState.stormCount = 0;
    Object.values(gameState.players).forEach(p => {
      p.life = p.startingLife ?? 20;
      p.poison = 0;
      p.energy = 0;
      p.experience = 0;
      p.mana = { w:0, u:0, b:0, r:0, g:0, c:0 };
      p.commanderDamage = {};
      p.revealedHand = false;
    });
    addLog(`The game was hard reset.`);
    io.emit('sync', gameState);
  }));

  socket.on('send-log', safe((msg) => {
    if (typeof msg === 'string') addLog(msg);
    io.emit('sync', gameState);
  }));

  socket.on('clear-logs', safe(() => {
    gameState.logs = [];
    io.emit('sync', gameState);
  }));

  socket.on('trigger-animation', safe((anim) => {
    io.emit('play-animation', anim);
  }));

  socket.on('toggle-funny-mode', safe(() => {
    gameState.funnyMode = !gameState.funnyMode;
    const callerId = socket.handshake.auth.playerId || socket.id;
    const name = gameState.players[callerId]?.name || 'Someone';
    addLog(`${name} turned Funny Mode ${gameState.funnyMode ? 'ON 🎉 (Creature sound themes active)' : 'OFF'}.`);
    io.emit('sync', gameState);
  }));

  socket.on('play-funny-sound', safe((data) => {
    let types = Array.isArray(data?.creatureTypes) ? [...data.creatureTypes] : [];
    if (types.length === 0 && data?.cardName) {
      try {
        let dbCard = null;
        if (getCardByName) dbCard = getCardByName.get(data.cardName);
        if (!dbCard && getCardByFrontName) dbCard = getCardByFrontName.get(data.cardName);
        if (dbCard && dbCard.type_line) {
          const parts = dbCard.type_line.split(/[—\-]/);
          if (parts.length > 1) {
            types = parts[1].trim().split(/\s+/).map(s => s.replace(/[^a-zA-Z]/g, '')).filter(Boolean);
          }
        }
      } catch (err) {
        console.warn('DB lookup for funny sound failed:', err);
      }
    }
    if (types.length > 0) {
      io.emit('play-funny-sound', { creatureTypes: types, cardName: data?.cardName });
    }
  }));

  socket.on('take-turn', safe((targetPid) => {
    saveState();
    gameState.activePlayerId = targetPid || playerId;
    io.emit('sync', gameState);
  }));

  socket.on('set-target-arrows', safe((arrows) => {
    gameState.targetArrows = Array.isArray(arrows) ? arrows : [];
    io.emit('sync', gameState);
  }));

  socket.on('clear-target-arrows', safe(() => {
    gameState.targetArrows = [];
    io.emit('sync', gameState);
  }));

  socket.on('set-monarch', safe((pId) => {
    saveState();
    gameState.monarch = pId;
    if (pId && gameState.players[pId]) {
      addLog(`${gameState.players[pId].name} claimed the Crown and became the Monarch! 👑`);
    } else {
      addLog(`The Monarch crown is now unclaimed.`);
    }
    io.emit('sync', gameState);
  }));

  socket.on('set-day-night', safe((val) => {
    saveState();
    gameState.dayNight = val;
    if (val === 'day') addLog(`☀️ It is now DAY.`);
    else if (val === 'night') addLog(`🌙 It is now NIGHT.`);
    else addLog(`Day/Night tracker was reset.`);
    io.emit('sync', gameState);
  }));

  socket.on('set-storm-count', safe((val) => {
    gameState.stormCount = Math.max(0, parseInt(val, 10) || 0);
    io.emit('sync', gameState);
  }));

  socket.on('pass-turn', safe(() => {
    const callerId = socket.handshake.auth.playerId || socket.id;
    saveState();
    gameState.stormCount = 0;
    gameState.targetArrows = [];

    const connectedPlayerIds = new Set([...io.sockets.sockets.values()].map(s => s.handshake.auth?.playerId || s.id));
    const registeredIds = Object.keys(gameState.players);
    // Stable turn order: consistently preserve registration sequence
    let orderedPlayers = registeredIds.filter(id => connectedPlayerIds.has(id));
    if (orderedPlayers.length === 0) orderedPlayers = registeredIds;

    let nextPlayerId = null;
    if (orderedPlayers.length > 1) {
      const currentIdx = orderedPlayers.indexOf(callerId);
      const nextIdx = (currentIdx === -1) ? 0 : (currentIdx + 1) % orderedPlayers.length;
      nextPlayerId = orderedPlayers[nextIdx];
    } else if (orderedPlayers.length === 1) {
      nextPlayerId = orderedPlayers[0];
    }
    gameState.activePlayerId = nextPlayerId;

    // MTG Rule 514.2 (Cleanup Step): all until-end-of-turn buffs wear off
    gameState.cards.forEach(c => {
      if (c.zone === 'battlefield') {
        c.tempPower = 0;
        c.tempToughness = 0;
      }
    });

    if (nextPlayerId && gameState.players[nextPlayerId]) {
      // MTG Rule 502.2 (Untap Step): automatically untap active player's permanents unless disabled
      if (!gameState.players[nextPlayerId].disableAutoUntap) {
        let untappedCount = 0;
        let stunRemovedCount = 0;
        gameState.cards.forEach(c => {
          if ((c.controllerId ? c.controllerId === nextPlayerId : c.ownerId === nextPlayerId) && c.zone === 'battlefield' && c.isTapped) {
            if (c.noUntap) return; // M3: skips if flagged or effect forbids untapping
            if (c.customCounters && (c.customCounters['Stun'] || 0) > 0) {
              c.customCounters['Stun'] -= 1;
              if (c.customCounters['Stun'] <= 0) delete c.customCounters['Stun'];
              stunRemovedCount++;
              return;
            }
            c.isTapped = false;
            untappedCount++;
          }
        });
        if (untappedCount > 0) {
          addLog(`${gameState.players[nextPlayerId].name} untapped their permanents for turn start.`);
        }
        if (stunRemovedCount > 0) {
          addLog(`${gameState.players[nextPlayerId].name} removed ${stunRemovedCount} Stun counter(s) instead of untapping (Rule 122.1b).`);
        }
      }

      // MTG Rule 504.1 (Draw Step): draw a card for turn unless disabled
      if (!gameState.players[nextPlayerId].disableAutoDraw) {
        const myLibrary = gameState.cards
          .filter(c => c.ownerId === nextPlayerId && c.zone === 'library')
          .sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
        
        if (myLibrary.length > 0) {
          const topCard = myLibrary[myLibrary.length - 1];
          topCard.zone = 'hand';
          topCard.faceDown = false;
          topCard.order = Date.now();
          addLog(`${gameState.players[nextPlayerId].name} automatically drew a card for their turn.`);
        } else {
          addLog(`${gameState.players[nextPlayerId].name} attempted to draw from an empty library! (Rule 704.5b) 💀`);
        }
      }
    }

    io.emit('sync', gameState);
  }));
});

app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`LAN Server running on port ${PORT}`);
});
