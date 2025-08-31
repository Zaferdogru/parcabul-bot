const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dataDir = path.join(root, 'data');        // <- PERSISTENT DISK
const srcDb = path.join(dataDir, 'app.db');
const srcWal = path.join(dataDir, 'app.db-wal');
const srcShm = path.join(dataDir, 'app.db-shm');
const outDir = path.join(dataDir, 'backups');   // <- BACKUPS: data/backups

function stamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  const ss = String(d.getSeconds()).padStart(2,'0');
  return `${y}${m}${day}-${hh}${mm}${ss}`;
}

function copyIfExists(src, dest) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    return true;
  }
  return false;
}

function runBackup({ keep = 30 } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  if (!fs.existsSync(srcDb)) throw new Error('DB bulunamadı: ' + srcDb);

  const ts = stamp();
  const destDb  = path.join(outDir, `app-${ts}.db`);
  const destWal = path.join(outDir, `app-${ts}.db-wal`);
  const destShm = path.join(outDir, `app-${ts}.db-shm`);

  fs.copyFileSync(srcDb, destDb);
  const wal = copyIfExists(srcWal, destWal);
  const shm = copyIfExists(srcShm, destShm);

  // elde tut: son 30 dosya
  const files = fs.readdirSync(outDir)
    .filter(f => f.startsWith('app-'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(outDir, f)).mtimeMs }))
    .sort((a,b) => b.mtime - a.mtime);

  for (const f of files.slice(30)) {
    try { fs.unlinkSync(path.join(outDir, f.name)); } catch {}
  }

  return {
    ok: true,
    saved: [destDb, wal ? destWal : null, shm ? destShm : null].filter(Boolean)
  };
}

// CLI kullanımında
if (require.main === module) {
  try {
    const info = runBackup();
    console.log('Backup OK:', info);
    process.exit(0);
  } catch (e) {
    console.error('Backup ERROR:', e.message);
    process.exit(1);
  }
}

module.exports = { runBackup };