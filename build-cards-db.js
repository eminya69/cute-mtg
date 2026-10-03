const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// Resolve OCTGN Game Sets Directory
const candidateSetsDirs = [
  process.env.OCTGN_SETS_DIR,
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'OCTGN', 'Data', 'GameDatabase', 'a6c8d2e8-7cd8-11dd-8f94-e62b56d89593', 'Sets') : null,
  path.join(__dirname, 'data', 'Sets'),
  path.join(__dirname, 'Sets')
].filter(Boolean);

const OCTGN_SETS_DIR = candidateSetsDirs.find(d => fs.existsSync(d));

if (!OCTGN_SETS_DIR) {
  console.error('\n[ERROR] OCTGN Sets directory not found!');
  console.error('Checked candidate paths:');
  candidateSetsDirs.forEach(d => console.error('  -', d));
  console.error('\nPlease specify the OCTGN Sets path using the OCTGN_SETS_DIR environment variable:');
  console.error('  PowerShell: $env:OCTGN_SETS_DIR="C:\\Path\\To\\OCTGN\\Data\\GameDatabase\\...\\Sets"; node build-cards-db.js');
  console.error('  Bash/Linux: OCTGN_SETS_DIR="/path/to/Sets" node build-cards-db.js\n');
  process.exit(1);
}

// Resolve OCTGN Images Directory (optional, for image index verification)
const candidateImagesDirs = [
  process.env.OCTGN_IMAGES_DIR,
  process.env.IMAGES_DIR,
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'OCTGN', 'Data', 'ImageDatabase', 'A6C8D2E8-7CD8-11DD-8F94-E62B56D89593', 'Sets') : null,
  path.join(__dirname, 'images', 'Sets'),
  path.join(__dirname, 'images')
].filter(Boolean);

const OCTGN_IMAGES_DIR = candidateImagesDirs.find(d => fs.existsSync(d)) || null;

const OUTPUT_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = process.env.DB_PATH || path.join(OUTPUT_DIR, 'cards.db');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

if (fs.existsSync(DB_PATH)) {
  try {
    fs.unlinkSync(DB_PATH);
  } catch (err) {
    if (err.code === 'EBUSY' || err.code === 'EPERM') {
      console.error(`\n[ERROR] Database file is currently locked by another process (e.g. running game server): ${DB_PATH}`);
      console.error('Please stop the server before rebuilding cards.db, or set DB_PATH to an alternate output path.\n');
      process.exit(1);
    }
    throw err;
  }
}

const db = new DatabaseSync(DB_PATH);

console.log('Initializing SQLite database schema...');
db.exec(`
  CREATE TABLE cards (
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
  CREATE INDEX idx_cards_name ON cards(name);
  CREATE INDEX idx_cards_front ON cards(front_name);
`);

const insertStmt = db.prepare(`
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

console.log('Scanning OCTGN sets from:', OCTGN_SETS_DIR);
const setFolders = fs.readdirSync(OCTGN_SETS_DIR);
let totalCards = 0;
let dfcCards = 0;
const now = Date.now();

db.exec('BEGIN TRANSACTION;');

for (const setFolder of setFolders) {
  const xmlPath = path.join(OCTGN_SETS_DIR, setFolder, 'set.xml');
  if (!fs.existsSync(xmlPath)) continue;

  const xmlContent = fs.readFileSync(xmlPath, 'utf8');

  // Extract set shortName
  const setMatch = xmlContent.match(/<set\s+[^>]*shortName="([^"]+)"/i);
  const setCode = setMatch ? setMatch[1].toLowerCase() : '';

  // Extract card tags
  // Regex to match <card ...> ... </card>
  const cardRegex = /<card\s+name="([^"]+)"\s+id="([^"]+)"(?:\s+size="[^"]*")?>([\s\S]*?)<\/card>/gi;
  let match;

  while ((match = cardRegex.exec(xmlContent)) !== null) {
    const cardName = match[1];
    const cardId = match[2].toLowerCase();
    const body = match[3];

    // Check properties
    const costMatch = body.match(/<property\s+name="Cost"[^>]*>([\s\S]*?)<\/property>/i);
    let manaCost = '';
    if (costMatch) {
      const sMatches = costMatch[1].matchAll(/<s\s+value="([^"]+)"/gi);
      for (const sm of sMatches) {
        manaCost += `{${sm[1]}}`;
      }
    }

    const typeMatch = body.match(/<property\s+name="Type"\s+value="([^"]+)"/i);
    const subTypeMatch = body.match(/<property\s+name="Subtype"\s+value="([^"]+)"/i);
    const typeLine = (typeMatch ? typeMatch[1] : '') + (subTypeMatch ? ` — ${subTypeMatch[1]}` : '');

    const pMatch = body.match(/<property\s+name="Power"\s+value="([^"]+)"/i);
    const power = pMatch ? pMatch[1] : '';

    const tMatch = body.match(/<property\s+name="Toughness"\s+value="([^"]+)"/i);
    const toughness = tMatch ? tMatch[1] : '';

    // Check for DFC alternate
    const altMatch = body.match(/<alternate\s+name="([^"]+)"\s+type="transform"/i);
    const isDfc = altMatch ? 1 : 0;
    const backName = altMatch ? altMatch[1] : null;

    if (isDfc) dfcCards++;

    // Image subpaths relative to Sets root
    const imageSubpath = `Sets/${setFolder}/Cards/${cardId}.jpg`;
    const backImageSubpath = isDfc ? `Sets/${setFolder}/Cards/${cardId}.transform.jpg` : null;

    // Check local image existence if available
    let hasImg = 1;
    let hasBackImg = isDfc ? 1 : 0;

    insertStmt.run(
      cardId,
      cardName,
      cardName,
      backName,
      isDfc,
      hasImg,
      hasBackImg,
      manaCost,
      typeLine,
      power,
      toughness,
      setCode,
      setFolder,
      imageSubpath,
      backImageSubpath,
      now
    );

    totalCards++;
  }
}

db.exec('COMMIT;');

console.log(`Compilation complete!`);
console.log(`Total Cards Ingested: ${totalCards}`);
console.log(`DFC Cards Ingested: ${dfcCards}`);
const stat = fs.statSync(DB_PATH);
console.log(`Database Size: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
db.close();
