const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'app.db');
const db = new sqlite3.Database(dbPath);

// ŞEMA
db.serialize(() => {
  // Daha güvenli dosya kopyası için WAL
  db.run(`PRAGMA journal_mode = WAL;`);
  db.run(`PRAGMA synchronous = NORMAL;`);

  db.run(`
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      talep_id TEXT UNIQUE,
      musteri_ad TEXT,
      musteri_telefon TEXT,
      criteria_json TEXT,
      filter_json TEXT,
      count INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      talep_id TEXT,
      tedarikci TEXT,
      telefon TEXT,
      sehir TEXT,
      durum TEXT,
      fiyatTL REAL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ad TEXT NOT NULL,
      telefon TEXT NOT NULL UNIQUE,
      sehir TEXT,
      durumlar TEXT, -- JSON array: ["sıfır","çıkma",...]
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // 🔹 İNDEKSLER
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_requests_talep ON requests(talep_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_requests_created ON requests(created_at);`);

  db.run(`CREATE INDEX IF NOT EXISTS idx_matches_talep ON matches(talep_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_matches_created ON matches(created_at);`);

  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_vendors_tel ON vendors(telefon);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_vendors_sehir ON vendors(sehir);`);
});

module.exports = db;