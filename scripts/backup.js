const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dataDir = path.join(root, 'data');
const srcDb = path.join(dataDir, 'app.db');
const srcWal = path.join(dataDir, 'app.db-wal');
const srcShm = path.join(dataDir, 'app.db-shm');
const outDir = path.join(root, 'backups');

fs.mkdirSync(outDir, { recursive: true });

function ts() {
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

(function main(){
  if (!fs.existsSync(srcDb)) {
    console.error('DB bulunamadı:', srcDb);
    process.exit(1);
  }

  const stamp = ts();
  const destDb = path.join(outDir, `app-${stamp}.db`);
  const destWal = path.join(outDir, `app-${stamp}.db-wal`);
  const destShm = path.join(outDir, `app-${stamp}.db-shm`);

  // Kopyala
  fs.copyFileSync(srcDb, destDb);
  copyIfExists(srcWal, destWal);
  copyIfExists(srcShm, destShm);

  console.log('Yedek alındı:', destDb);

  // Elde tutma: son 10 set
  const files = fs.readdirSync(outDir)
    .filter(f => f.startsWith('app-'))
    .map(f => ({ name: f, time: fs.statSync(path.join(outDir, f)).mtimeMs }))
    .sort((a,b) => b.time - a.time);

  const keep = 30; // istersen 10 yap, ben 30 bıraktım
  const toDelete = files.slice(keep);
  for (const f of toDelete) {
    const p = path.join(outDir, f.name);
    try { fs.unlinkSync(p); } catch {}
  }
})();