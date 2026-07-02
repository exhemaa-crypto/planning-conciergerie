// Sauvegarde automatique : lit le document Firebase et écrit une copie datée
// dans le dossier backups/. Exécuté par GitHub Actions (Node 20+, fetch global).

const fs = require('fs');
const path = require('path');

const PROJECT = 'planning-conciergerie-52d46';
const API_KEY = 'AIzaSyB_KhqzC9kSJMUKMmzYhSTuQMYRECCEiqE';
const DOC_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/planning/main?key=${API_KEY}`;

(async () => {
  const res = await fetch(DOC_URL);
  if (!res.ok) { console.error('Lecture Firebase échouée:', res.status); process.exit(0); }
  const doc = await res.json();
  if (!doc.fields || !doc.fields.payload) { console.log('Document vide, rien à sauvegarder.'); process.exit(0); }
  const data = JSON.parse(doc.fields.payload.stringValue);

  const out = {
    type: 'planning-v2-backup',
    exportedAt: new Date().toISOString(),
    events: data.events || [],
    owners: data.owners || [],
    prestataires: data.prestataires || [],
    expenses: data.expenses || [],
    settings: data.settings || {}
  };

  const dir = 'backups';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  const today = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(dir, `backup-${today}.json`), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify(out, null, 2));
  console.log(`Sauvegarde écrite : backup-${today}.json (${out.events.length} événements)`);
})().catch(e => { console.error(e); process.exit(0); });
