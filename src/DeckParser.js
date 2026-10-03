import { XMLParser } from 'fast-xml-parser';

export function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export function getServerUrl() {
  if (typeof window !== 'undefined') {
    if (window.location.protocol === 'file:') {
      return localStorage.getItem('mtg-server-url') || 'http://localhost:3000';
    }
    // In dev mode on vite port (e.g. 5173), default to port 3000 if not specified
    if (window.location.port && window.location.port !== '3000' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return localStorage.getItem('mtg-server-url') || `http://${window.location.hostname}:3000`;
    }
    return window.location.origin;
  }
  return 'http://localhost:3000';
}

export async function parseDeckXml(inputData) {
  if (typeof inputData !== 'string') throw new Error("Deck data must be a string.");
  const text = inputData.trim();
  const allCards = [];

  const isXml = text.startsWith('<') || text.includes('<deck');

  if (isXml) {
    const parser = new XMLParser({ 
      ignoreAttributes: false, 
      attributeNamePrefix: "@_",
      parseTagValue: false // Preserve string card names (e.g. numeric names like '1996 World Champion')
    });
    const result = parser.parse(text);

    if (!result || !result.deck) {
      throw new Error("Invalid deck file: missing <deck> element.");
    }

    const sections = result.deck.section;
    if (sections) {
      const sectionArray = Array.isArray(sections) ? sections : [sections];

      sectionArray.forEach(section => {
        if (!section || !section.card) return;
        const zoneName = String(section['@_name'] || 'Main');
        const cards = Array.isArray(section.card) ? section.card : [section.card];
        cards.forEach(card => {
          if (!card) return;
          const parsedQty = parseInt(card['@_qty'], 10);
          const qty = Number.isNaN(parsedQty) ? 1 : parsedQty;
          if (qty <= 0) return;
          const cardName = String(card['#text'] || card['@_name'] || '').trim();
          if (!cardName) return;
          const scryfallId = card['@_id'] ? String(card['@_id']).trim() : null;
          for (let i = 0; i < qty; i++) {
            allCards.push({
              name: cardName,
              zone: zoneName,
              scryfallId: scryfallId, // Save the exact ID from OCTGN
              id: generateId(),
              order: Math.random()
            });
          }
        });
      });
    }
  } else {
    // Parse plain text decklist (MTG Arena, MTGO, Moxfield, etc.)
    const lines = text.split(/\r?\n/);
    let currentZone = 'Main';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const lower = line.toLowerCase();
      if (lower === '// commander' || lower === 'commander' || lower === '// commander:' || lower === 'commander:') {
        currentZone = 'Commander';
        continue;
      }
      if (lower === '// companion' || lower === 'companion' || lower === '// companion:' || lower === 'companion:') {
        currentZone = 'Companion';
        continue;
      }
      if (lower === '// sideboard' || lower === 'sideboard' || lower === '// sideboard:' || lower === 'sideboard:') {
        currentZone = 'Sideboard';
        continue;
      }
      if (lower === '// deck' || lower === 'deck' || lower === '// main' || lower === 'main' || lower === '// mainboard' || lower === 'mainboard') {
        currentZone = 'Main';
        continue;
      }
      if (line.startsWith('//')) continue;

      const match = line.match(/^(\d+)[xX]?\s+(.+)$/);
      let qty = 1;
      let rawName = line;
      if (match) {
        qty = parseInt(match[1], 10) || 1;
        rawName = match[2].trim();
      }

      let cleanName = rawName
        .replace(/\s*\([A-Za-z0-9_-]+\)(?:\s+[A-Za-z0-9_-]+)?$/, '')
        .replace(/\s*\[[A-Za-z0-9_-]+\](?:\s+[A-Za-z0-9_-]+)?$/, '')
        .replace(/\s*\*F\*|\*E\*$/i, '')
        .trim();

      if (!cleanName) continue;

      for (let i = 0; i < qty; i++) {
        allCards.push({
          name: cleanName,
          zone: currentZone,
          scryfallId: null,
          id: generateId(),
          order: Math.random()
        });
      }
    }

    if (allCards.length === 0) {
      throw new Error("Could not parse any cards from text deck file.");
    }
  }

  // Unique printing identifiers
  const uniqueCards = [...new Map(allCards.map(c => [c.scryfallId || c.name, c])).values()];
  const cardData = {};
  const serverUrl = getServerUrl();

  // Send both ID and Name so server can fall back to name if ID lookup fails
  const identifiers = uniqueCards.map(c => {
    const item = { name: c.name };
    if (c.scryfallId && typeof c.scryfallId === 'string' && c.scryfallId.trim().length > 0) {
      item.id = c.scryfallId.trim();
    }
    return item;
  });

  // 1. First attempt: resolve via local server batch API (fast indexed SQLite + local image store)
  let resolvedViaServer = false;
  let serverNotFound = [];
  try {
    const response = await fetch(`${serverUrl}/api/cards/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers }),
      signal: AbortSignal.timeout(8000)
    });
    if (response.ok) {
      const data = await response.json();
      if (data && Array.isArray(data.data)) {
        data.data.forEach(c => {
          if (c.id) cardData[c.id.toLowerCase()] = c;
          if (c.name) cardData[c.name.toLowerCase()] = c;
          if (c.frontName) cardData[c.frontName.toLowerCase()] = c;
        });
        resolvedViaServer = true;
        if (Array.isArray(data.notFound)) {
          serverNotFound = data.notFound;
        }
      }
    }
  } catch (e) {
    console.warn("Server batch API lookup failed, falling back to direct Scryfall", e);
  }

  // 2. Direct Scryfall fallback only if server was completely unreachable
  if (!resolvedViaServer) {
    for (let i = 0; i < identifiers.length; i += 75) {
      const batch = identifiers.slice(i, i + 75);
      // Scryfall collection API requires exactly one key per identifier (id OR name)
      const scryfallBatch = batch.map(b => (b.id && b.id.length === 36 ? { id: b.id } : { name: b.name }));
      try {
        const response = await fetch('https://api.scryfall.com/cards/collection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'cute-mtg-lan/1.0' },
          body: JSON.stringify({ identifiers: scryfallBatch }),
          signal: AbortSignal.timeout(8000)
        });
        if (response.ok) {
          const data = await response.json();
          if (data && data.data) {
            data.data.forEach(c => {
              const isDfc = c.card_faces && c.card_faces.length > 1;
              const frontFace = isDfc ? c.card_faces[0] : c;
            const backFace = isDfc ? c.card_faces[1] : null;
            const cObj = {
              id: c.id,
              name: c.name,
              frontName: frontFace.name || c.name,
              backName: backFace ? backFace.name : null,
              isDfc: isDfc,
              imageUrl: frontFace.image_uris?.normal || c.image_uris?.normal,
              frontImageUrl: frontFace.image_uris?.normal || c.image_uris?.normal,
              backImageUrl: backFace?.image_uris?.normal || null,
              manaCost: c.mana_cost || frontFace.mana_cost,
              typeLine: c.type_line,
              power: c.power,
              toughness: c.toughness
            };
            if (c.id) cardData[c.id.toLowerCase()] = cObj;
            if (c.name) cardData[c.name.toLowerCase()] = cObj;
            if (cObj.frontName) cardData[cObj.frontName.toLowerCase()] = cObj;
          });
        }
      }
    } catch (err) {
      console.warn("Direct Scryfall batch fallback failed", err);
    }
    }
  }

  const fallbackBack = `${serverUrl}/api/card-back`;

  const finalDeck = allCards.map(deckCard => {
    const rawName = deckCard.name || '';
    const frontOnlyName = rawName.split(' // ')[0].trim();
    const sCard = cardData[deckCard.scryfallId?.toLowerCase()] || 
                  cardData[rawName.toLowerCase()] || 
                  cardData[frontOnlyName.toLowerCase()];
    let img = fallbackBack;
    let backImg = null;
    let frontName = deckCard.name;
    let backName = null;

    if (sCard) {
      img = sCard.imageUrl ? (sCard.imageUrl.startsWith('http') ? sCard.imageUrl : `${serverUrl}${sCard.imageUrl}`) : fallbackBack;
      backImg = sCard.backImageUrl ? (sCard.backImageUrl.startsWith('http') ? sCard.backImageUrl : `${serverUrl}${sCard.backImageUrl}`) : null;
      frontName = sCard.frontName || deckCard.name;
      backName = sCard.backName || null;
    }

    const zLow = (deckCard.zone || '').toLowerCase();
    const isCompanion = zLow.includes('companion');
    const isCommander = zLow.includes('command') && !isCompanion;
    const isSideboard = zLow.includes('sideboard');

    return {
      ...deckCard,
      imageUrl: img,
      frontImageUrl: img,
      backImageUrl: backImg,
      frontName: frontName,
      backName: backName,
      manaCost: sCard?.manaCost || '',
      typeLine: sCard?.typeLine || '',
      power: sCard?.power || '',
      toughness: sCard?.toughness || '',
      isTransformed: false,
      isCommander: isCommander,
      isCompanion: isCompanion,
      faceDown: !isCommander && !isCompanion && !isSideboard
    };
  });

  const unresolved = uniqueCards.filter(c => {
    const raw = c.name || '';
    const front = raw.split(' // ')[0].trim();
    return !cardData[c.scryfallId?.toLowerCase()] && !cardData[raw.toLowerCase()] && !cardData[front.toLowerCase()];
  });
  const names = [...new Set([...unresolved.map(u => u.name), ...serverNotFound])];
  if (names.length > 0) {
    console.warn("Unresolved cards:", names);
  }

  finalDeck._unresolvedCards = names;
  return {
    cards: finalDeck,
    unresolved: names
  };
}

export async function parseDeckFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const deck = await parseDeckXml(e.target.result);
        resolve(deck);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsText(file);
  });
}
