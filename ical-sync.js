// Synchronisation iCal automatique, exécutée par GitHub Actions.
// Lit le document Firebase, récupère les calendriers iCal de chaque logement,
// importe les nouvelles réservations (arrivées/départs) et réécrit le document.
// Aucune dépendance externe : Node 20+ (fetch global).

const PROJECT = 'planning-conciergerie-52d46';
const API_KEY = 'AIzaSyB_KhqzC9kSJMUKMmzYhSTuQMYRECCEiqE';
const DOC_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/planning/main?key=${API_KEY}`;

function uid(){ return 'ev_' + Math.random().toString(36).slice(2,10) + Date.now().toString(36); }

function unfoldICS(text){
  const raw = text.split(/\r\n|\n|\r/), out = [];
  raw.forEach(l => { if((l.startsWith(' ')||l.startsWith('\t')) && out.length>0) out[out.length-1]+=l.slice(1); else out.push(l); });
  return out;
}
function decodeICS(s){ return s.replace(/\\n/gi,' ').replace(/\\,/g,',').replace(/\\;/g,';').replace(/\\\\/g,'\\').trim(); }
function parseICSDate(v){
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(T(\d{2})(\d{2})(\d{2})?Z?)?$/);
  if(!m) return null;
  return m[1]+'-'+m[2]+'-'+m[3];
}
function parseIcalBookings(text){
  const lines = unfoldICS(text); const out = []; let cur = null;
  lines.forEach(line => {
    if(line.startsWith('BEGIN:VEVENT')) cur = {};
    else if(line.startsWith('END:VEVENT')){ if(cur && cur.dtstart) out.push(cur); cur = null; }
    else if(cur){
      const idx = line.indexOf(':'); if(idx === -1) return;
      const key = line.slice(0, idx).split(';')[0].toUpperCase();
      const val = line.slice(idx+1);
      if(key === 'UID') cur.uid = val;
      else if(key === 'DTSTART') cur.dtstart = val;
      else if(key === 'DTEND') cur.dtend = val;
      else if(key === 'SUMMARY') cur.summary = decodeICS(val);
    }
  });
  return out;
}
function isBlocked(s){ return /not available|unavailable|blocked|closed|indisponible|ferm/i.test(s||''); }

async function main(){
  // 1. Lire le document Firebase
  const res = await fetch(DOC_URL);
  if(!res.ok){ console.error('Lecture Firebase échouée:', res.status); process.exit(0); }
  const doc = await res.json();
  if(!doc.fields || !doc.fields.payload){ console.log('Document vide, rien à faire.'); return; }
  const data = JSON.parse(doc.fields.payload.stringValue);
  const events = data.events || [];
  const owners = data.owners || [];

  // 2. Collecter les logements avec URL iCal
  const props = [];
  owners.forEach(o => (o.properties||[]).forEach(p => {
    if(p.details && p.details.icalUrl) props.push(p);
  }));
  if(props.length === 0){ console.log('Aucune URL iCal renseignée.'); return; }

  const existing = new Set(events.filter(e => e.icalUid).map(e => e.icalUid));
  let added = 0, errors = 0;

  // 3. Récupérer et importer chaque calendrier
  for(const prop of props){
    let txt = null;
    try {
      const r = await fetch(prop.details.icalUrl, { headers: { 'User-Agent': 'planning-conciergerie-sync' } });
      if(r.ok){ const t = await r.text(); if(t.includes('BEGIN:VCALENDAR')) txt = t; }
    } catch(e){ /* ignore */ }
    if(!txt){ errors++; console.warn('Calendrier inaccessible:', (prop.name||prop.address)); continue; }

    const pname = prop.name || prop.address;
    parseIcalBookings(txt).forEach(b => {
      if(isBlocked(b.summary)) return;
      const baseUid = b.uid || (b.dtstart + '|' + prop.id);
      const inDate = parseICSDate(b.dtstart);
      const outDate = b.dtend ? parseICSDate(b.dtend) : null;
      const guest = (b.summary && !/^reserved$/i.test(b.summary.trim())) ? b.summary.trim() : '';
      if(inDate){
        const u = baseUid + '-in';
        if(!existing.has(u)){ existing.add(u); events.push({ id: uid(), title: 'Arrivée — '+pname, date: inDate, time: '', type: 'arrivee', propertyId: prop.id, location: prop.address, icalUid: u, source: 'iCal auto '+pname, guestName: guest }); added++; }
      }
      if(outDate){
        const u = baseUid + '-out';
        if(!existing.has(u)){ existing.add(u); events.push({ id: uid(), title: 'Départ — '+pname, date: outDate, time: '', type: 'depart', propertyId: prop.id, location: prop.address, icalUid: u, source: 'iCal auto '+pname }); added++; }
      }
    });
  }

  console.log(`Logements: ${props.length} · Nouvelles réservations: ${added} · Erreurs: ${errors}`);

  // 4. Réécrire si des événements ont été ajoutés
  if(added > 0){
    data.events = events;
    data.updatedAt = Date.now();
    const body = { fields: { payload: { stringValue: JSON.stringify(data) } } };
    const w = await fetch(DOC_URL, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    console.log('Écriture Firebase:', w.status);
  } else {
    console.log('Aucune nouvelle réservation, document inchangé.');
  }
}

main().catch(e => { console.error(e); process.exit(0); });
