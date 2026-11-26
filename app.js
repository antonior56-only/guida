/* GuidaPA – gestione richieste e servizi per guida turistica (Palermo / Cefalù)
   App a pagina singola, dati salvati nel browser (localStorage). Nessun server necessario. */

// ---------- Stato e persistenza ----------
const LS_KEY = 'guidapa_v1';
let db = load();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY));
    if (raw) return migrate(raw);
  } catch (e) { console.error(e); }
  return structuredClone(DEFAULT_DB);
}
function migrate(d) {
  d.agenzie ??= [];
  d.servizi ??= [];
  d.siti ??= structuredClone(DEFAULT_DB.siti);
  const defById = Object.fromEntries(DEFAULT_DB.siti.map(x => [x.id, x]));
  d.siti.forEach(s => {
    const def = defById[s.id];
    if (def) {
      if (s.coperto === undefined) s.coperto = def.coperto;
      if (s.altCoperto === undefined && def.altCoperto) s.altCoperto = [...def.altCoperto];
    } else if (s.coperto === undefined) {
      s.coperto = true;
    }
  });
  if ((d.versione || 1) < 2) {
    DEFAULT_DB.siti.forEach(def => {
      if (!d.siti.some(x => x.id === def.id)) d.siti.push(structuredClone(def));
    });
    d.versione = 2;
  }
  d.profilo = { ...structuredClone(DEFAULT_DB.profilo), ...(d.profilo || {}) };
  d.profilo.tariffe = { ...DEFAULT_DB.profilo.tariffe, ...(d.profilo.tariffe || {}) };
  d.seq ??= 1;
  return d;
}
function save() {
  db.updatedAt = new Date().toISOString();
  localStorage.setItem(LS_KEY, JSON.stringify(db));
  if (typeof pianificaCloudSync === 'function') pianificaCloudSync();
}

// ---------- Utilità ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $('#app');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => Number(String(v ?? '').replace(',', '.')) || 0;
const eur = n => num(n).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const oggiISO = () => iso(new Date());
const addDays = (isoDate, n) => { const d = new Date(isoDate + 'T00:00'); d.setDate(d.getDate() + n); return iso(d); };
const fmtData = d => d ? new Date(d + 'T00:00').toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '';
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

const STATI = [
  { k: 'nuova', l: 'Nuova' },
  { k: 'preventivata', l: 'Preventivata' },
  { k: 'confermata', l: 'Confermata' },
  { k: 'svolta', l: 'Svolta' },
  { k: 'fatturata', l: 'Fatturata' },
  { k: 'pagata', l: 'Pagata' },
  { k: 'annullata', l: 'Annullata' }
];
const statoLabel = k => STATI.find(s => s.k === k)?.l || k;
const FONTI = [['whatsapp', 'WhatsApp'], ['email', 'Email'], ['telefono', 'Telefono'], ['altro', 'Altro']];
const LINGUE = ['Italiano', 'Inglese', 'Francese', 'Tedesco', 'Spagnolo', 'Portoghese', 'Altro'];

const agenzia = id => db.agenzie.find(a => a.id === id);
const sito = id => db.siti.find(s => s.id === id);

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- Logica di dominio ----------
const durataOre = s => (s.durata === 'intera' ? 8 : 4) + num(s.oreExtra);
const minuti = hhmm => { const [h, m] = (hhmm || '09:00').split(':').map(Number); return h * 60 + (m || 0); };
const intervallo = s => { const a = minuti(s.ora); return [a, a + durataOre(s) * 60]; };
const oraFine = s => { const e = intervallo(s)[1]; return String(Math.floor(e / 60) % 24).padStart(2, '0') + ':' + String(e % 60).padStart(2, '0'); };
const attivo = s => s.stato !== 'annullata';

function conflitti(s) {
  if (!attivo(s) || !s.data) return [];
  const [a1, b1] = intervallo(s);
  return db.servizi.filter(o => o.id !== s.id && attivo(o) && o.data === s.data && (() => {
    const [a2, b2] = intervallo(o);
    return a1 < b2 && a2 < b1;
  })());
}

function avvisiSiti(s) {
  if (!s.data) return [];
  const g = new Date(s.data + 'T00:00').getDay();
  return (s.tappe || []).map(sito).filter(t => t && (t.chiuso || []).includes(g))
    .map(t => `${t.nome}: di solito chiuso di ${GIORNI[g]}`);
}

function tariffePer(s) {
  const ag = agenzia(s.agenziaId);
  const t = { ...db.profilo.tariffe };
  if (ag?.tariffe) for (const [k, v] of Object.entries(ag.tariffe)) if (v !== '' && v != null) t[k] = num(v);
  return t;
}

const haPrezzoManuale = s => s.prezzoManuale !== '' && s.prezzoManuale != null;

function calcola(s) {
  const t = tariffePer(s);
  const base = num(s.durata === 'intera' ? t.intera : t.mezza);
  const extra = num(s.oreExtra) * num(t.oraExtra);
  const lingua = s.suppLingua ? num(t.lingua) : 0;
  const festivo = s.festivo ? (base + extra + lingua) * num(t.festivoPct) / 100 : 0;
  const guida = base + extra + lingua + festivo;
  const ingressiPP = (s.tappe || []).reduce((a, id) => a + num(sito(id)?.costo), 0);
  const ingressi = s.ingressiInclusi ? ingressiPP * num(s.pax) : 0;
  const calcolato = guida + ingressi;
  const totale = haPrezzoManuale(s) ? num(s.prezzoManuale) : calcolato;
  return { t, base, extra, lingua, festivo, guida, ingressiPP, ingressi, calcolato, totale };
}

function durataTappe(s) { return (s.tappe || []).reduce((a, id) => a + num(sito(id)?.durata), 0); }
function percorsoTesto(s) { return (s.tappe || []).map(id => sito(id)?.nome).filter(Boolean).join(' → '); }

function scadenzaPagamento(s) {
  if (!s.dataFattura) return '';
  const ag = agenzia(s.agenziaId);
  const gg = num(ag?.giorniPagamento) || num(db.profilo.giorniPagamento) || 30;
  return addDays(s.dataFattura, gg);
}

const ordinaPerData = (a, b) => (a.data + a.ora).localeCompare(b.data + b.ora);

// ---------- Componenti form ----------
const field = (label, html, cls = '') => `<label class="f ${cls}"><span>${label}</span>${html}</label>`;
const inp = (name, val, type = 'text', extra = '') => `<input name="${name}" type="${type}" value="${esc(val ?? '')}" ${extra}>`;
const sel = (name, val, opts) => `<select name="${name}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(val ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const chk = (name, val, label) => `<label class="chk"><input type="checkbox" name="${name}" ${val ? 'checked' : ''}> ${label}</label>`;
const ta = (name, val, rows = 3, extra = '') => `<textarea name="${name}" rows="${rows}" ${extra}>${esc(val ?? '')}</textarea>`;
function formData(form) {
  const o = {};
  $$('[name]', form).forEach(el => { o[el.name] = el.type === 'checkbox' ? el.checked : el.value; });
  return o;
}

function card(s) {
  const ag = agenzia(s.agenziaId);
  const c = conflitti(s);
  const titolo = s.titolo || percorsoTesto(s) || 'Itinerario da definire';
  return `<a class="card st-${s.stato}" href="#/servizio/${s.id}">
    <div class="card-h"><strong>${fmtData(s.data)} · ${esc(s.ora)}–${oraFine(s)}</strong><span class="badge b-${s.stato}">${statoLabel(s.stato)}</span></div>
    <div>${esc(ag?.nome || '— agenzia non indicata')} · ${s.pax || '?'} pax · ${esc(s.lingua || '')}</div>
    <div class="muted">${esc(titolo)}</div>
    ${c.length ? `<div class="warn">⚠️ Si sovrappone a ${c.length} altro/i servizio/i</div>` : ''}
  </a>`;
}
const lista = (arr, vuoto = 'Nessun servizio') => arr.length ? `<div class="cards">${arr.map(card).join('')}</div>` : `<p class="muted">${vuoto}</p>`;

// ---------- Router ----------
const routes = {
  dashboard: vDashboard, richieste: vRichieste, agenda: vAgenda, agenzie: vAgenzie,
  siti: vSiti, impostazioni: vImpostazioni, servizio: vServizio, preventivo: vPreventivo,
  tour: p => vTour(p) // definita in tour.js
};
function render() {
  const [r, p] = (location.hash.slice(2) || 'dashboard').split('/');
  const route = routes[r] ? r : 'dashboard';
  $$('.tabs a').forEach(a => a.classList.toggle('active', a.dataset.route === route || (route === 'servizio' && a.dataset.route === 'richieste')));
  window.scrollTo(0, 0);
  routes[route](p ? decodeURIComponent(p) : undefined);
}
window.addEventListener('hashchange', render);

// ---------- Dashboard ----------
function vDashboard() {
  const oggi = oggiISO(), domani = addDays(oggi, 1), settimana = addDays(oggi, 7);
  const att = db.servizi.filter(attivo).sort(ordinaPerData);
  const diOggi = att.filter(s => s.data === oggi && ['confermata', 'preventivata', 'nuova'].includes(s.stato));
  const diDomani = att.filter(s => s.data === domani && ['confermata', 'preventivata', 'nuova'].includes(s.stato));
  const prossimi = att.filter(s => s.data > domani && s.data <= settimana && s.stato === 'confermata');
  const daPrev = att.filter(s => s.stato === 'nuova');
  const inAttesa = att.filter(s => s.stato === 'preventivata');
  const daFatt = att.filter(s => s.stato === 'svolta' || (s.stato === 'confermata' && s.data < oggi));
  const daIncassare = att.filter(s => s.stato === 'fatturata');
  const totIncassare = daIncassare.reduce((a, s) => a + calcola(s).totale, 0);
  const scaduti = daIncassare.filter(s => scadenzaPagamento(s) && scadenzaPagamento(s) < oggi);
  const conConflitti = att.filter(s => s.data >= oggi && conflitti(s).length);

  const vuoto = !db.servizi.length;
  app.innerHTML = `
    ${vuoto ? `<div class="panel hint">
      <h2>Benvenuta/o in GuidaPA 👋</h2>
      <ol>
        <li>Compila il tuo <a href="#/impostazioni">profilo, le tariffe, il salvataggio Cloud (JSONBin) e Gemini AI</a>.</li>
        <li>Aggiungi le <a href="#/agenzie">agenzie</a> con cui lavori (anche con tariffe dedicate).</li>
        <li>Quando arriva un messaggio WhatsApp o un'email, premi <b>+ Nuova richiesta</b> e incolla il testo.</li>
      </ol>
      <div class="row wrap">
        <button class="btn primary" id="btnEsempio">Carica dati di esempio</button>
        <a class="btn" href="Manuale_Uso_GuidaPA.pdf" target="_blank" rel="noopener">📖 Apri Manuale d'uso (PDF)</a>
      </div>
    </div>` : ''}
    <div class="stats">
      <a class="stat" href="#/richieste/nuova"><b>${daPrev.length}</b><span>da preventivare</span></a>
      <a class="stat" href="#/richieste/preventivata"><b>${inAttesa.length}</b><span>in attesa di conferma</span></a>
      <a class="stat" href="#/richieste/svolta"><b>${daFatt.length}</b><span>da fatturare</span></a>
      <a class="stat ${scaduti.length ? 'alert' : ''}" href="#/richieste/fatturata"><b>${eur(totIncassare)}</b><span>da incassare${scaduti.length ? ` · ${scaduti.length} scaduti` : ''}</span></a>
    </div>
    ${conConflitti.length ? `<div class="panel warnbox"><h3>⚠️ Sovrapposizioni in agenda</h3>${lista(conConflitti)}</div>` : ''}
    ${daFatt.some(s => s.stato === 'confermata') ? `<div class="panel warnbox"><b>Hai servizi confermati con data passata</b>: segnali come "Svolta" per tenere aggiornato lo storico.</div>` : ''}
    <section class="panel"><h2>Oggi · ${fmtData(oggi)}</h2>
      ${diOggi.filter(s => s.stato === 'confermata').map(s => `<a class="bigbtn go" href="#/tour/${s.id}"><b>▶ Modalità tour · ${esc(s.ora)} ${esc(s.titolo || percorsoTesto(s) || '')}</b><span>${esc(agenzia(s.agenziaId)?.nome || '')} · ${s.pax || '?'} pax${s.tour?.avviatoIl && !s.tour?.chiusoIl ? ' · IN CORSO' : s.tour?.chiusoIl ? ' · concluso' : ''}</span></a>`).join('')}
      ${lista(diOggi, 'Nessun servizio oggi')}</section>
    <section class="panel"><h2>Domani</h2>${lista(diDomani, 'Nessun servizio domani')}</section>
    <section class="panel"><h2>Prossimi 7 giorni (confermati)</h2>${lista(prossimi, 'Niente in programma')}</section>
    <section class="panel"><h2>Nuove richieste da preventivare</h2>${lista(daPrev, 'Tutto preventivato 👍')}</section>
  `;
  $('#btnEsempio')?.addEventListener('click', caricaEsempio);
}

function caricaEsempio() {
  const a1 = { id: uid(), nome: 'Sicilia Travel Srl', referente: 'Giulia', telefono: '+39 333 0000000', email: 'booking@esempio.it', piva: '', giorniPagamento: 60, tariffe: { mezza: 170, intera: 290 }, note: 'Gruppi da crociera, porto di Palermo.' };
  const a2 = { id: uid(), nome: 'Cefalù Incoming', referente: 'Marco', telefono: '+39 333 1111111', email: 'info@esempio.it', piva: '', giorniPagamento: 30, tariffe: {}, note: '' };
  db.agenzie.push(a1, a2);
  const o = oggiISO();
  db.servizi.push(
    { id: uid(), agenziaId: a1.id, fonte: 'whatsapp', rifAgenzia: 'MSC-1203', data: o, ora: '09:00', durata: 'mezza', oreExtra: 0, pax: 32, lingua: 'Inglese', puntoIncontro: 'Porto di Palermo – Stazione Marittima', titolo: 'Palermo arabo-normanna', tappe: ['normanni', 'cattedrale', 'quattrocanti', 'martorana'], stato: 'confermata', suppLingua: false, festivo: false, ingressiInclusi: false, prezzoManuale: '', contatto: 'Tour leader John', telContatto: '+44 7700 900000', autista: 'Bus 54 posti – Salvo', telAutista: '333 2222222', orarioLimite: '13:30', nomi: 'John Smith\nMary Smith\nPaul Brown\nLinda Brown\nGeorge White', esigenze: '1 persona con difficoltà a camminare', note: '', testoOriginale: 'Hi! Confirm 32 pax tomorrow 9am port, Norman Palermo tour. Thanks', creato: new Date().toISOString() },
    { id: uid(), agenziaId: a2.id, fonte: 'email', rifAgenzia: '', data: addDays(o, 3), ora: '10:00', durata: 'mezza', oreExtra: 0, pax: 18, lingua: 'Tedesco', puntoIncontro: 'Cefalù – Piazza Duomo', titolo: '', tappe: ['duomocefalu', 'corsoruggero', 'lavatoio', 'lungomare'], stato: 'nuova', suppLingua: true, festivo: false, ingressiInclusi: false, prezzoManuale: '', contatto: '', telContatto: '', autista: '', esigenze: '', note: '', testoOriginale: 'Buongiorno, ci servirebbe una guida in tedesco per 18 persone a Cefalù...', creato: new Date().toISOString() },
    { id: uid(), agenziaId: a1.id, fonte: 'telefono', rifAgenzia: '', data: addDays(o, 3), ora: '12:00', durata: 'mezza', oreExtra: 0, pax: 25, lingua: 'Francese', puntoIncontro: 'Hotel Politeama', titolo: 'Monreale', tappe: ['monreale', 'chiostro'], stato: 'preventivata', suppLingua: false, festivo: false, ingressiInclusi: false, prezzoManuale: '', contatto: '', telContatto: '', autista: '', esigenze: '', note: '', testoOriginale: '', creato: new Date().toISOString() }
  );
  save();
  toast('Dati di esempio caricati');
  render();
}

// ---------- Elenco richieste ----------
function vRichieste(filtro) {
  const f = filtro || 'tutte';
  app.innerHTML = `
    <div class="panel">
      <div class="row wrap">
        <input id="q" type="search" placeholder="Cerca agenzia, luogo, riferimento, note…" class="grow">
        <select id="fAg"><option value="">Tutte le agenzie</option>${db.agenzie.map(a => `<option value="${a.id}">${esc(a.nome)}</option>`).join('')}</select>
        <label class="chk"><input type="checkbox" id="fPassati"> mostra passati</label>
      </div>
      <div class="chips">
        ${[['tutte', 'Tutte'], ...STATI.map(s => [s.k, s.l])].map(([k, l]) => `<a class="chip ${k === f ? 'on' : ''}" href="#/richieste/${k}">${l} <small>${k === 'tutte' ? db.servizi.length : db.servizi.filter(s => s.stato === k).length}</small></a>`).join('')}
      </div>
    </div>
    <div id="out"></div>`;
  const out = $('#out');
  // Per stati "amministrativi" mostra di default anche i passati
  if (['svolta', 'fatturata', 'pagata', 'annullata'].includes(f)) $('#fPassati').checked = true;
  const draw = () => {
    const q = $('#q').value.toLowerCase().trim();
    const ag = $('#fAg').value;
    const passati = $('#fPassati').checked;
    const oggi = oggiISO();
    let arr = db.servizi.filter(s => (f === 'tutte' || s.stato === f) && (!ag || s.agenziaId === ag) && (passati || s.data >= oggi));
    if (q) arr = arr.filter(s => [agenzia(s.agenziaId)?.nome, s.puntoIncontro, s.rifAgenzia, s.note, s.titolo, s.contatto, s.testoOriginale, percorsoTesto(s)].join(' ').toLowerCase().includes(q));
    arr.sort(ordinaPerData);
    if (passati) arr.reverse();
    out.innerHTML = lista(arr, 'Nessuna richiesta con questi filtri');
  };
  $('#q').oninput = draw;
  $('#fAg').onchange = draw;
  $('#fPassati').onchange = draw;
  draw();
}

// ---------- Scheda servizio (nuovo / modifica) ----------
function vServizio(id) {
  const nuovo = id === 'nuovo' || !id;
  const orig = nuovo ? null : db.servizi.find(x => x.id === id);
  if (!nuovo && !orig) { app.innerHTML = '<p class="panel">Servizio non trovato.</p>'; return; }
  const s = nuovo ? {
    id: uid(), stato: 'nuova', fonte: 'whatsapp', agenziaId: db.agenzie[0]?.id || '', rifAgenzia: '',
    data: addDays(oggiISO(), 1), ora: '09:00', durata: 'mezza', oreExtra: 0, pax: '', lingua: 'Inglese',
    puntoIncontro: '', titolo: '', tappe: [], suppLingua: false, festivo: false, ingressiInclusi: false, prezzoManuale: '',
    contatto: '', telContatto: '', autista: '', esigenze: '', note: '', testoOriginale: ''
  } : structuredClone(orig);
  let tappe = [...(s.tappe || [])];

  const zone = [...new Set(db.siti.map(x => x.zona))];
  const agOpts = [['', '— seleziona —'], ...db.agenzie.map(a => [a.id, a.nome])];

  app.innerHTML = `
  <form id="fServ" class="grid2">
    <div class="col">
      <section class="panel">
        <div class="row between"><h2>${nuovo ? 'Nuova richiesta' : 'Servizio'}</h2>
          ${!nuovo ? `<div class="row"><a class="btn primary" href="#/tour/${s.id}">🚶 Modalità tour</a><a class="btn" href="#/preventivo/${s.id}">📄 Preventivo</a><button type="button" class="btn" id="btnDup">⧉ Duplica</button></div>` : ''}
        </div>
        ${field('📋 Testo originale (incolla qui il messaggio WhatsApp o l\'email)', ta('testoOriginale', s.testoOriginale, 4, 'placeholder="Incolla il messaggio dell\'agenzia: resta salvato come riferimento"'))}
        <div class="row wrap">
          ${field('Arrivata via', sel('fonte', s.fonte, FONTI))}
          ${field('Agenzia', `<div class="row">${sel('agenziaId', s.agenziaId, agOpts)}<button type="button" class="btn small" id="btnNuovaAg" title="Nuova agenzia">+</button></div>`, 'grow')}
          ${field('Rif. pratica agenzia', inp('rifAgenzia', s.rifAgenzia))}
        </div>
      </section>

      <section class="panel">
        <h3>Quando e chi</h3>
        <div class="row wrap">
          ${field('Data', inp('data', s.data, 'date', 'required'))}
          ${field('Ora inizio', inp('ora', s.ora, 'time', 'required'))}
          ${field('Durata', sel('durata', s.durata, [['mezza', 'Mezza giornata (4h)'], ['intera', 'Giornata intera (8h)']]))}
          ${field('Ore extra', inp('oreExtra', s.oreExtra, 'number', 'min="0" step="0.5"'))}
        </div>
        <div class="row wrap">
          ${field('N° partecipanti', inp('pax', s.pax, 'number', 'min="1"'))}
          ${field('Lingua', sel('lingua', s.lingua, LINGUE.map(l => [l, l])))}
          ${field('Punto d\'incontro', inp('puntoIncontro', s.puntoIncontro, 'text', 'placeholder="Hotel, porto, aeroporto, piazza…" list="luoghi"'), 'grow')}
        </div>
        <datalist id="luoghi">${[...new Set(['Porto di Palermo – Stazione Marittima', 'Aeroporto Falcone-Borsellino', 'Piazza Politeama', 'Teatro Massimo', 'Cefalù – Piazza Duomo', 'Cefalù – Stazione', ...db.servizi.map(x => x.puntoIncontro).filter(Boolean)])].map(l => `<option value="${esc(l)}">`).join('')}</datalist>
        <div class="row wrap">
          ${field('Capogruppo / contatto', inp('contatto', s.contatto), 'grow')}
          ${field('Tel. contatto', inp('telContatto', s.telContatto, 'tel'))}
        </div>
        <div class="row wrap">
          ${field('Autista / bus', inp('autista', s.autista), 'grow')}
          ${field('Tel. autista (WhatsApp)', inp('telAutista', s.telAutista, 'tel'))}
          ${field('Orario limite rientro (nave/volo)', inp('orarioLimite', s.orarioLimite, 'time'))}
        </div>
        ${field('Esigenze speciali (mobilità, allergie, bambini…)', inp('esigenze', s.esigenze))}
        ${field('Lista partecipanti (un nome per riga, facoltativa – serve per l\'appello in modalità tour)', ta('nomi', s.nomi, 3))}
      </section>

      <section class="panel">
        <div class="row between">
          <h3>Itinerario</h3>
          <div class="row wrap">
            <button type="button" class="btn small" id="btnPioggiaServ">🌧️ Cattivo tempo (al coperto)</button>
            <button type="button" class="btn small" id="btnAiServ">✨ Approfondisci con Gemini</button>
          </div>
        </div>
        ${field('Titolo del tour (facoltativo)', inp('titolo', s.titolo, 'text', 'placeholder="es. Palermo arabo-normanna"'))}
        <p class="muted small">Seleziona le tappe nell'ordine di visita (🏛️ al coperto · ☀️ all'aperto).</p>
        <div class="tappe">
          ${zone.map(z => `<fieldset><legend>${esc(z)}</legend>${db.siti.filter(x => x.zona === z).map(t => `
            <label class="chk tappa"><input type="checkbox" data-sito="${t.id}" ${tappe.includes(t.id) ? 'checked' : ''}> <span title="${t.coperto ? 'Al coperto' : 'All\'aperto'}">${t.coperto ? '🏛️' : '☀️'}</span> ${esc(t.nome)} <small class="muted">${t.durata}'</small></label>`).join('')}</fieldset>`).join('')}
        </div>
        <div id="percorso" class="percorso"></div>
      </section>

      <section class="panel">
        <h3>Note</h3>
        ${ta('note', s.note, 3, 'placeholder="Note interne (non compaiono nel preventivo)"')}
      </section>
    </div>

    <div class="col side">
      <section class="panel sticky">
        ${field('Stato', sel('stato', s.stato, STATI.map(x => [x.k, x.l])))}
        <div id="avvisi"></div>
        <h3>Prezzo</h3>
        ${chk('suppLingua', s.suppLingua, 'Supplemento lingua')}
        ${chk('festivo', s.festivo, 'Festivo / domenica')}
        ${chk('ingressiInclusi', s.ingressiInclusi, 'Ingressi inclusi nel prezzo')}
        <div id="riepilogo"></div>
        ${field('Prezzo concordato (lascia vuoto per usare il calcolo)', inp('prezzoManuale', s.prezzoManuale, 'number', 'step="0.01" min="0"'))}
        <details ${['fatturata', 'pagata', 'svolta'].includes(s.stato) ? 'open' : ''}>
          <summary>Fattura e pagamento</summary>
          ${field('N° fattura', inp('numFattura', s.numFattura))}
          ${field('Data fattura', inp('dataFattura', s.dataFattura, 'date'))}
          ${field('Data incasso', inp('dataPagamento', s.dataPagamento, 'date'))}
          <div id="scadenza" class="muted small"></div>
        </details>
        <div class="row actions">
          <button class="btn primary grow" type="submit">💾 Salva</button>
          ${!nuovo ? `<button type="button" class="btn danger" id="btnDel">🗑</button>` : ''}
        </div>
      </section>
    </div>
  </form>`;

  const form = $('#fServ');
  const read = () => {
    const o = formData(form);
    o.tappe = tappe;
    o.pax = num(o.pax) || '';
    o.oreExtra = num(o.oreExtra);
    return o;
  };

  const upd = () => {
    const cur = { ...s, ...read() };
    const c = calcola(cur);
    const confl = conflitti(cur);
    const chiusi = avvisiSiti(cur);
    const minTappe = durataTappe(cur);
    const minDisp = durataOre(cur) * 60;
    const av = [];
    confl.forEach(o => av.push(`⚠️ Sovrapposto a: <a href="#/servizio/${o.id}">${esc(agenzia(o.agenziaId)?.nome || 'servizio')} ${esc(o.ora)}–${oraFine(o)}</a>`));
    chiusi.forEach(m => av.push(`🚫 ${esc(m)}`));
    if (minTappe > minDisp) av.push(`⏱️ Le tappe richiedono circa ${Math.round(minTappe / 6) / 10}h, più della durata prevista (${durataOre(cur)}h), spostamenti esclusi.`);
    if (cur.data && cur.data < oggiISO() && ['nuova', 'preventivata'].includes(cur.stato)) av.push('📆 La data è già passata.');
    $('#avvisi').innerHTML = av.length ? `<div class="warn">${av.join('<br>')}</div>` : `<div class="ok">✅ Nessun conflitto · fine prevista ${oraFine(cur)}</div>`;

    $('#riepilogo').innerHTML = `<table class="tot">
      <tr><td>${cur.durata === 'intera' ? 'Giornata intera' : 'Mezza giornata'}</td><td>${eur(c.base)}</td></tr>
      ${c.extra ? `<tr><td>Ore extra (${cur.oreExtra} × ${eur(c.t.oraExtra)})</td><td>${eur(c.extra)}</td></tr>` : ''}
      ${c.lingua ? `<tr><td>Supplemento lingua</td><td>${eur(c.lingua)}</td></tr>` : ''}
      ${c.festivo ? `<tr><td>Festivo (+${c.t.festivoPct}%)</td><td>${eur(c.festivo)}</td></tr>` : ''}
      ${cur.ingressiInclusi ? `<tr><td>Ingressi (${eur(c.ingressiPP)} × ${cur.pax || 0} pax)</td><td>${eur(c.ingressi)}</td></tr>` : ''}
      <tr class="big"><td>Totale${haPrezzoManuale(cur) ? ' (concordato)' : ''}</td><td>${eur(c.totale)}</td></tr>
      ${haPrezzoManuale(cur) ? `<tr class="muted"><td>Calcolato da listino</td><td>${eur(c.calcolato)}</td></tr>` : ''}
    </table>
    ${!cur.ingressiInclusi && c.ingressiPP ? `<p class="muted small">Ingressi stimati a carico turisti/agenzia: ${eur(c.ingressiPP)} a persona.</p>` : ''}`;

    $('#percorso').innerHTML = tappe.length
      ? `<b>Percorso:</b> ${tappe.map((id, i) => {
          const st = sito(id);
          return `<span class="step">${st?.coperto ? '🏛️' : '☀️'} ${i + 1}. ${esc(st?.nome || id)}</span>`;
        }).join(' → ')} <span class="muted">(${minTappe}' di visita${s.tappePrePioggia ? ' · 🌧️ variante pioggia attiva' : ''})</span>`
      : '<span class="muted">Nessuna tappa selezionata</span>';

    const sc = scadenzaPagamento(cur);
    $('#scadenza').innerHTML = sc ? `Scadenza pagamento: <b>${fmtData(sc)}</b>` : '';
  };

  form.addEventListener('input', upd);
  form.addEventListener('change', upd);
  $$('[data-sito]', form).forEach(cb => cb.addEventListener('change', () => {
    const v = cb.dataset.sito;
    tappe = cb.checked ? [...tappe, v] : tappe.filter(x => x !== v);
    upd();
  }));
  form.elements['data'].addEventListener('change', () => {
    const d = form.elements['data'].value;
    if (d && new Date(d + 'T00:00').getDay() === 0) form.elements['festivo'].checked = true;
    upd();
  });
  form.elements['stato'].addEventListener('change', () => {
    if (form.elements['stato'].value === 'pagata' && !form.elements['dataPagamento'].value) form.elements['dataPagamento'].value = oggiISO();
    if (form.elements['stato'].value === 'fatturata' && !form.elements['dataFattura'].value) form.elements['dataFattura'].value = oggiISO();
    upd();
  });
  $('#btnPioggiaServ').addEventListener('click', () => {
    const draft = { ...s, ...read() };
    apriPianoPioggia(draft, {
      inTour: false,
      onApply: (nuove, ripristino) => {
        tappe = nuove;
        if (ripristino) delete s.tappePrePioggia;
        else if (draft.tappePrePioggia) s.tappePrePioggia = draft.tappePrePioggia;
        $$('[data-sito]', form).forEach(cb => { cb.checked = tappe.includes(cb.dataset.sito); });
        upd();
      }
    });
  });
  $('#btnAiServ').addEventListener('click', () => {
    Object.assign(s, read());
    apriAssistenteAI(s);
  });
  $('#btnNuovaAg').addEventListener('click', () => modaleAgenzia(null, nuovoId => {
    const selAg = form.elements['agenziaId'];
    selAg.innerHTML = [['', '— seleziona —'], ...db.agenzie.map(a => [a.id, a.nome])].map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
    selAg.value = nuovoId;
    upd();
  }));
  $('#btnDup')?.addEventListener('click', () => {
    const copia = { ...structuredClone(s), ...read(), id: uid(), stato: 'nuova', numPrev: '', numFattura: '', dataFattura: '', dataPagamento: '', tour: undefined, creato: new Date().toISOString() };
    db.servizi.push(copia); save(); toast('Servizio duplicato: modifica la data');
    location.hash = '#/servizio/' + copia.id;
  });
  $('#btnDel')?.addEventListener('click', () => {
    if (!confirm('Eliminare definitivamente questo servizio? (In alternativa puoi impostarlo come "Annullata")')) return;
    db.servizi = db.servizi.filter(x => x.id !== s.id); save(); toast('Servizio eliminato');
    location.hash = '#/richieste';
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    Object.assign(s, read(), { aggiornato: new Date().toISOString() });
    if (nuovo) { s.creato = s.aggiornato; db.servizi.push(s); }
    else db.servizi[db.servizi.findIndex(x => x.id === s.id)] = s;
    save();
    toast('Salvato ✔');
    if (nuovo) location.hash = '#/servizio/' + s.id; else render();
  });
  upd();
}

// ---------- Preventivo stampabile ----------
function vPreventivo(id) {
  const s = db.servizi.find(x => x.id === id);
  if (!s) { app.innerHTML = '<p class="panel">Servizio non trovato.</p>'; return; }
  if (!s.numPrev) { s.numPrev = `${new Date().getFullYear()}/${String(db.seq++).padStart(3, '0')}`; s.dataPrev = oggiISO(); save(); }
  const p = db.profilo, ag = agenzia(s.agenziaId), c = calcola(s);
  const profiloIncompleto = !p.nome;

  app.innerHTML = `
  <div class="row between no-print panel">
    <a class="btn" href="#/servizio/${s.id}">← Torna al servizio</a>
    <div class="row wrap">
      <button class="btn" id="btnCopia">📋 Copia testo per WhatsApp/email</button>
      ${s.stato === 'nuova' ? '<button class="btn" id="btnSegna">✔ Segna come preventivata</button>' : ''}
      <button class="btn primary" onclick="window.print()">🖨️ Stampa / Salva PDF</button>
    </div>
  </div>
  ${profiloIncompleto ? '<div class="panel warnbox no-print">Compila il tuo <a href="#/impostazioni">profilo</a> per avere intestazione, P.IVA e IBAN nel preventivo.</div>' : ''}
  <article class="doc">
    <header class="doc-h">
      <div>
        <h1>${esc(p.nome || 'Nome Guida')}</h1>
        <div>Guida turistica abilitata${p.tesserino ? ' · Tesserino n. ' + esc(p.tesserino) : ''}</div>
        <div>${[p.piva && 'P.IVA ' + esc(p.piva), p.cf && 'C.F. ' + esc(p.cf)].filter(Boolean).join(' · ')}</div>
        <div>${[esc(p.telefono), esc(p.email)].filter(Boolean).join(' · ')}</div>
      </div>
      <div class="right">
        <h2>PREVENTIVO</h2>
        <div>N. <b>${esc(s.numPrev)}</b></div>
        <div>del ${fmtData(s.dataPrev)}</div>
      </div>
    </header>
    <section class="doc-to">
      <div class="muted">Spett.le</div>
      <b>${esc(ag?.nome || '—')}</b>
      ${ag?.referente ? `<div>c.a. ${esc(ag.referente)}</div>` : ''}
      ${s.rifAgenzia ? `<div>Vs. rif.: ${esc(s.rifAgenzia)}</div>` : ''}
    </section>
    <section>
      <h3>${esc(s.titolo || 'Servizio di visita guidata')}</h3>
      <table class="kv">
        <tr><td>Data</td><td>${fmtData(s.data)}</td></tr>
        <tr><td>Orario</td><td>${esc(s.ora)} – ${oraFine(s)} (${s.durata === 'intera' ? 'giornata intera' : 'mezza giornata'}${num(s.oreExtra) ? ` + ${s.oreExtra}h extra` : ''})</td></tr>
        <tr><td>Partecipanti</td><td>${s.pax || '—'}</td></tr>
        <tr><td>Lingua</td><td>${esc(s.lingua)}</td></tr>
        <tr><td>Punto d'incontro</td><td>${esc(s.puntoIncontro || 'da definire')}</td></tr>
      </table>
      ${s.tappe?.length ? `<h4>Itinerario</h4><ol class="itin">${s.tappe.map(id => sito(id)).filter(Boolean).map(t => `<li>${esc(t.nome)} <span class="muted">(${t.zona}, ~${t.durata}')</span></li>`).join('')}</ol>` : ''}
    </section>
    <section>
      <table class="tot doc-tot">
        <tr><td>Servizio guida – ${s.durata === 'intera' ? 'giornata intera' : 'mezza giornata'}</td><td>${eur(c.base)}</td></tr>
        ${c.extra ? `<tr><td>Ore aggiuntive (${s.oreExtra})</td><td>${eur(c.extra)}</td></tr>` : ''}
        ${c.lingua ? `<tr><td>Supplemento lingua ${esc(s.lingua)}</td><td>${eur(c.lingua)}</td></tr>` : ''}
        ${c.festivo ? `<tr><td>Maggiorazione festiva</td><td>${eur(c.festivo)}</td></tr>` : ''}
        ${s.ingressiInclusi ? `<tr><td>Biglietti d'ingresso (${s.pax} pax)</td><td>${eur(c.ingressi)}</td></tr>` : ''}
        ${haPrezzoManuale(s) && num(s.prezzoManuale) !== c.calcolato ? `<tr><td>Adeguamento prezzo concordato</td><td>${eur(c.totale - c.calcolato)}</td></tr>` : ''}
        <tr class="big"><td>TOTALE</td><td>${eur(c.totale)}</td></tr>
      </table>
      <p class="small muted">Importi da intendersi secondo il regime fiscale della guida.</p>
    </section>
    <section class="small">
      <h4>Condizioni</h4>
      <p>${esc(p.condizioni).replace(/\n/g, '<br>')}</p>
      ${p.iban ? `<p>IBAN: <b>${esc(p.iban)}</b></p>` : ''}
    </section>
  </article>`;

  $('#btnCopia').addEventListener('click', async () => {
    const testo = [
      `Preventivo n. ${s.numPrev} – ${s.titolo || 'Visita guidata'}`,
      `📅 ${fmtData(s.data)}, ${s.ora}–${oraFine(s)}`,
      `👥 ${s.pax || '?'} pax · ${s.lingua}`,
      s.puntoIncontro ? `📍 Incontro: ${s.puntoIncontro}` : '',
      s.tappe?.length ? `🏛️ ${percorsoTesto(s)}` : '',
      `💶 Totale: ${eur(c.totale)}${s.ingressiInclusi ? ' (ingressi inclusi)' : ' (ingressi esclusi)'}`,
      '',
      p.nome ? `${p.nome}${p.telefono ? ' – ' + p.telefono : ''}` : ''
    ].filter((r, i, a) => r !== '' || (i > 0 && a[i - 1] !== '')).join('\n');
    try { await navigator.clipboard.writeText(testo); toast('Testo copiato: incollalo su WhatsApp o nell\'email'); }
    catch { prompt('Copia il testo:', testo); }
  });
  $('#btnSegna')?.addEventListener('click', () => { s.stato = 'preventivata'; save(); toast('Segnato come preventivato'); render(); });
}

// ---------- Agenda mensile ----------
function vAgenda(p) {
  const [y, m] = (p || oggiISO().slice(0, 7)).split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const start = (first.getDay() + 6) % 7; // lunedì = 0
  const giorni = new Date(y, m, 0).getDate();
  const prev = iso(new Date(y, m - 2, 1)).slice(0, 7), next = iso(new Date(y, m, 1)).slice(0, 7);
  const oggi = oggiISO();
  const mese = first.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  const mesePrefix = `${y}-${String(m).padStart(2, '0')}`;
  const delMese = db.servizi.filter(s => s.data?.startsWith(mesePrefix) && attivo(s));
  const confermati = delMese.filter(s => s.stato !== 'nuova' && s.stato !== 'preventivata');
  const totMese = confermati.reduce((a, s) => a + calcola(s).totale, 0);

  let celle = '';
  for (let i = 0; i < start; i++) celle += '<div class="cell empty"></div>';
  for (let d = 1; d <= giorni; d++) {
    const ds = `${mesePrefix}-${String(d).padStart(2, '0')}`;
    const sv = db.servizi.filter(s => s.data === ds && attivo(s)).sort(ordinaPerData);
    celle += `<div class="cell ${ds === oggi ? 'today' : ''} ${sv.some(s => conflitti(s).length) ? 'conf' : ''}">
      <div class="dnum">${d}</div>
      ${sv.map(s => `<a class="ev b-${s.stato}" href="#/servizio/${s.id}" title="${esc(statoLabel(s.stato))}">${esc(s.ora)} ${esc(agenzia(s.agenziaId)?.nome || '')}</a>`).join('')}
    </div>`;
  }
  app.innerHTML = `
  <section class="panel">
    <div class="row between">
      <a class="btn" href="#/agenda/${prev}">‹</a>
      <h2 class="cap">${mese}</h2>
      <a class="btn" href="#/agenda/${next}">›</a>
    </div>
    <p class="muted center">${delMese.length} servizi nel mese · ${confermati.length} confermati/svolti · ${eur(totMese)}</p>
    <div class="cal">
      ${['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map(g => `<div class="dow">${g}</div>`).join('')}
      ${celle}
    </div>
    <div class="legend">${STATI.filter(s => s.k !== 'annullata').map(s => `<span class="ev b-${s.k}">${s.l}</span>`).join('')}</div>
  </section>`;
}

// ---------- Agenzie ----------
function vAgenzie() {
  const righe = db.agenzie.map(a => {
    const sv = db.servizi.filter(s => s.agenziaId === a.id && attivo(s));
    const fatt = sv.filter(s => ['fatturata', 'pagata'].includes(s.stato)).reduce((t, s) => t + calcola(s).totale, 0);
    const daInc = sv.filter(s => s.stato === 'fatturata').reduce((t, s) => t + calcola(s).totale, 0);
    const tar = Object.entries(a.tariffe || {}).filter(([, v]) => v !== '' && v != null);
    return `<div class="card">
      <div class="card-h"><strong>${esc(a.nome)}</strong><button class="btn small" data-edit="${a.id}">Modifica</button></div>
      <div class="muted">${[esc(a.referente), esc(a.telefono), esc(a.email)].filter(Boolean).join(' · ')}</div>
      <div>${sv.length} servizi · fatturato ${eur(fatt)} · <b>da incassare ${eur(daInc)}</b> · pagamento a ${a.giorniPagamento || db.profilo.giorniPagamento} gg</div>
      ${tar.length ? `<div class="small">Tariffe dedicate: ${tar.map(([k, v]) => `${k} ${k === 'festivoPct' ? v + '%' : eur(v)}`).join(', ')}</div>` : '<div class="small muted">Tariffe standard</div>'}
      ${a.note ? `<div class="small">${esc(a.note)}</div>` : ''}
      <div class="row"><a class="btn small" href="#/richieste/tutte" data-filtra="${a.id}">Vedi servizi</a></div>
    </div>`;
  }).join('');
  app.innerHTML = `
    <section class="panel">
      <div class="row between"><h2>Agenzie</h2><button class="btn primary" id="btnAddAg">+ Nuova agenzia</button></div>
      ${db.agenzie.length ? `<div class="cards">${righe}</div>` : '<p class="muted">Nessuna agenzia. Aggiungi quelle con cui lavori.</p>'}
    </section>`;
  $('#btnAddAg').addEventListener('click', () => modaleAgenzia(null, render));
  $$('[data-edit]').forEach(b => b.addEventListener('click', () => modaleAgenzia(b.dataset.edit, render)));
  $$('[data-filtra]').forEach(b => b.addEventListener('click', () => setTimeout(() => {
    const f = $('#fAg'); if (f) { f.value = b.dataset.filtra; $('#fPassati').checked = true; f.dispatchEvent(new Event('change', { bubbles: true })); }
  }, 0)));
}

function modaleAgenzia(id, onSave) {
  const a = id ? structuredClone(agenzia(id)) : { id: uid(), nome: '', referente: '', telefono: '', email: '', piva: '', giorniPagamento: '', tariffe: {}, note: '' };
  const t = a.tariffe || {};
  const def = db.profilo.tariffe;
  const dlg = $('#modal');
  $('#modalBody').innerHTML = `
    <form id="fAgz" method="dialog">
      <h2>${id ? 'Modifica agenzia' : 'Nuova agenzia'}</h2>
      ${field('Nome agenzia *', inp('nome', a.nome, 'text', 'required autofocus'))}
      <div class="row wrap">
        ${field('Referente', inp('referente', a.referente), 'grow')}
        ${field('Telefono / WhatsApp', inp('telefono', a.telefono, 'tel'), 'grow')}
      </div>
      <div class="row wrap">
        ${field('Email', inp('email', a.email, 'email'), 'grow')}
        ${field('P.IVA / Cod. SDI', inp('piva', a.piva), 'grow')}
        ${field('Pagamento a (giorni)', inp('giorniPagamento', a.giorniPagamento, 'number', `min="0" placeholder="${db.profilo.giorniPagamento}"`))}
      </div>
      <fieldset><legend>Tariffe dedicate (vuoto = tariffa standard)</legend>
        <div class="row wrap">
          ${field('Mezza giornata €', inp('t_mezza', t.mezza, 'number', `step="0.01" placeholder="${def.mezza}"`))}
          ${field('Giornata intera €', inp('t_intera', t.intera, 'number', `step="0.01" placeholder="${def.intera}"`))}
          ${field('Ora extra €', inp('t_oraExtra', t.oraExtra, 'number', `step="0.01" placeholder="${def.oraExtra}"`))}
          ${field('Suppl. lingua €', inp('t_lingua', t.lingua, 'number', `step="0.01" placeholder="${def.lingua}"`))}
          ${field('Festivo %', inp('t_festivoPct', t.festivoPct, 'number', `step="1" placeholder="${def.festivoPct}"`))}
        </div>
      </fieldset>
      ${field('Note', ta('note', a.note, 2))}
      <div class="row actions">
        ${id ? '<button type="button" class="btn danger" id="btnDelAg">Elimina</button>' : ''}
        <span class="grow"></span>
        <button type="button" class="btn" id="btnAnnulla">Annulla</button>
        <button type="submit" class="btn primary">Salva</button>
      </div>
    </form>`;
  dlg.showModal();
  $('#btnAnnulla').onclick = () => dlg.close();
  $('#btnDelAg')?.addEventListener('click', () => {
    const n = db.servizi.filter(s => s.agenziaId === id).length;
    if (n) { alert(`Non puoi eliminarla: ha ${n} servizi collegati.`); return; }
    if (!confirm('Eliminare questa agenzia?')) return;
    db.agenzie = db.agenzie.filter(x => x.id !== id); save(); dlg.close(); onSave?.();
  });
  $('#fAgz').addEventListener('submit', e => {
    e.preventDefault();
    const o = formData(e.target);
    const tariffe = {};
    for (const k of ['mezza', 'intera', 'oraExtra', 'lingua', 'festivoPct']) if (o['t_' + k] !== '') tariffe[k] = num(o['t_' + k]);
    const rec = { id: a.id, nome: o.nome.trim(), referente: o.referente, telefono: o.telefono, email: o.email, piva: o.piva, giorniPagamento: o.giorniPagamento === '' ? '' : num(o.giorniPagamento), tariffe, note: o.note };
    const i = db.agenzie.findIndex(x => x.id === a.id);
    if (i >= 0) db.agenzie[i] = rec; else db.agenzie.push(rec);
    db.agenzie.sort((x, y) => x.nome.localeCompare(y.nome));
    save(); dlg.close(); toast('Agenzia salvata');
    onSave?.(rec.id);
  });
}

// ---------- Siti ----------
function vSiti() {
  const zone = [...new Set(db.siti.map(x => x.zona))];
  app.innerHTML = `
  <section class="panel">
    <div class="row between"><h2>Siti e tappe</h2><button class="btn primary" id="btnAddSito">+ Nuovo sito</button></div>
    <p class="muted small">⚠️ Costi d'ingresso e giorni di chiusura sono da inserire/verificare: orari e tariffe cambiano spesso. La data dell'ultima modifica è mostrata accanto a ogni sito.</p>
    ${zone.map(z => `<h3>${esc(z)}</h3><div class="cards">${db.siti.filter(x => x.zona === z).map(t => `
      <div class="card">
        <div class="card-h"><strong>${t.coperto ? '🏛️' : '☀️'} ${esc(t.nome)}</strong><button class="btn small" data-edit="${t.id}">Modifica</button></div>
        <div>${t.coperto ? 'Al coperto' : 'All\'aperto'} · ~${t.durata}' · ingresso ${num(t.costo) ? eur(t.costo) : '<span class="muted">n.d.</span>'} · ${(t.chiuso || []).length ? 'chiuso ' + t.chiuso.map(g => GIORNI[g]).join(', ') : '<span class="muted">chiusure n.d.</span>'}</div>
        ${t.note ? `<div class="small muted">${esc(t.note)}</div>` : ''}
        <div class="small muted">${t.verificato ? 'Verificato il ' + fmtData(t.verificato) : 'Mai verificato'}</div>
      </div>`).join('')}</div>`).join('')}
  </section>`;
  $('#btnAddSito').addEventListener('click', () => modaleSito(null));
  $$('[data-edit]').forEach(b => b.addEventListener('click', () => modaleSito(b.dataset.edit)));
}

function modaleSito(id) {
  const t = id ? structuredClone(sito(id)) : { id: uid(), zona: 'Palermo', nome: '', durata: 30, costo: 0, coperto: true, chiuso: [], note: '' };
  const dlg = $('#modal');
  $('#modalBody').innerHTML = `
    <form id="fSito">
      <h2>${id ? 'Modifica sito' : 'Nuovo sito'}</h2>
      ${field('Nome *', inp('nome', t.nome, 'text', 'required'))}
      <div class="row wrap">
        ${field('Zona', inp('zona', t.zona, 'text', 'list="zone"'))}
        <datalist id="zone">${[...new Set(db.siti.map(x => x.zona))].map(z => `<option value="${esc(z)}">`).join('')}</datalist>
        ${field('Durata visita (min)', inp('durata', t.durata, 'number', 'min="0"'))}
        ${field('Ingresso a persona €', inp('costo', t.costo, 'number', 'step="0.01" min="0"'))}
      </div>
      ${chk('coperto', t.coperto !== false, '🏛️ Sito al coperto (idoneo come alternativa in caso di pioggia/maltempo)')}
      <fieldset><legend>Chiuso di solito il</legend>
        ${[1, 2, 3, 4, 5, 6, 0].map(g => `<label class="chk inline"><input type="checkbox" data-g="${g}" ${(t.chiuso || []).includes(g) ? 'checked' : ''}> ${GIORNI[g]}</label>`).join('')}
      </fieldset>
      ${field('Note operative (prenotazioni, accessibilità, bagni, parcheggio bus…)', ta('note', t.note, 3))}
      <div class="row actions">
        ${id ? '<button type="button" class="btn danger" id="btnDelSito">Elimina</button>' : ''}
        <span class="grow"></span>
        <button type="button" class="btn" id="btnAnnulla">Annulla</button>
        <button type="submit" class="btn primary">Salva (segna come verificato oggi)</button>
      </div>
    </form>`;
  dlg.showModal();
  $('#btnAnnulla').onclick = () => dlg.close();
  $('#btnDelSito')?.addEventListener('click', () => {
    if (db.servizi.some(s => (s.tappe || []).includes(id)) && !confirm('Il sito è usato in alcuni servizi. Eliminarlo comunque?')) return;
    db.siti = db.siti.filter(x => x.id !== id); save(); dlg.close(); render();
  });
  $('#fSito').addEventListener('submit', e => {
    e.preventDefault();
    const o = formData(e.target);
    const rec = { ...t, nome: o.nome.trim(), zona: o.zona.trim() || 'Altro', durata: num(o.durata), costo: num(o.costo), coperto: !!o.coperto, note: o.note,
      chiuso: $$('[data-g]', e.target).filter(c => c.checked).map(c => Number(c.dataset.g)), verificato: oggiISO() };
    const i = db.siti.findIndex(x => x.id === t.id);
    if (i >= 0) db.siti[i] = rec; else db.siti.push(rec);
    save(); dlg.close(); toast('Sito salvato'); render();
  });
}

// ---------- Profilo e dati ----------
function vImpostazioni() {
  const p = db.profilo, t = p.tariffe;
  const baseModelli = secrets.geminiModelsCache?.length ? secrets.geminiModelsCache : DEFAULT_GEMINI_MODELS;
  const curMod = secrets.geminiModel || 'gemini-2.5-flash';
  const gemOpts = baseModelli.some(m => m.id === curMod)
    ? baseModelli.map(m => [m.id, m.label])
    : [[curMod, curMod], ...baseModelli.map(m => [m.id, m.label])];
  app.innerHTML = `
  <form id="fProf" class="panel">
    <h2>Il mio profilo (intestazione preventivi)</h2>
    <div class="row wrap">
      ${field('Nome e cognome', inp('nome', p.nome), 'grow')}
      ${field('N° tesserino guida', inp('tesserino', p.tesserino))}
    </div>
    <div class="row wrap">
      ${field('P.IVA', inp('piva', p.piva))}
      ${field('Codice fiscale', inp('cf', p.cf))}
      ${field('Telefono', inp('telefono', p.telefono, 'tel'))}
      ${field('Email', inp('email', p.email, 'email'), 'grow')}
    </div>
    ${field('IBAN', inp('iban', p.iban))}
    <h3>Tariffe standard</h3>
    <div class="row wrap">
      ${field('Mezza giornata €', inp('t_mezza', t.mezza, 'number', 'step="0.01"'))}
      ${field('Giornata intera €', inp('t_intera', t.intera, 'number', 'step="0.01"'))}
      ${field('Ora extra €', inp('t_oraExtra', t.oraExtra, 'number', 'step="0.01"'))}
      ${field('Suppl. lingua €', inp('t_lingua', t.lingua, 'number', 'step="0.01"'))}
      ${field('Festivo %', inp('t_festivoPct', t.festivoPct, 'number'))}
      ${field('Pagamento a (giorni)', inp('giorniPagamento', p.giorniPagamento, 'number'))}
      ${field('Minuti di spostamento tra tappe', inp('spostamento', p.spostamento, 'number', 'min="0"'))}
    </div>
    ${field('Condizioni riportate nel preventivo', ta('condizioni', p.condizioni, 4))}
    <button class="btn primary" type="submit">💾 Salva profilo</button>
  </form>

  <form id="fCloud" class="panel">
    <h2>☁️ Salvataggio Cloud e sincronizzazione PC ↔ Telefono (JSONBin.io)</h2>
    <p class="muted small">Permette di salvare automaticamente i dati online e ritrovarli sincronizzati sia sul computer sia sullo smartphone quando l'app è pubblicata su GitHub Pages. Se sei senza rete nei vicoli o nelle chiese, l'app continua a funzionare offline e invia le modifiche appena torna il segnale.</p>
    <ol class="small muted">
      <li>Registrati gratis su <a href="https://jsonbin.io/app/app/api-keys" target="_blank" rel="noopener"><b>jsonbin.io → API Keys</b></a> e copia la tua <b>X-Master-Key</b>.</li>
      <li>Incollala qui sotto e premi <b>"✨ Crea nuovo archivio (Bin)"</b>: verrà generato il tuo <b>Bin ID</b> personale.</li>
      <li>Sul secondo dispositivo (es. smartphone) incolla la stessa Master Key e lo stesso Bin ID, poi premi <b>"⬇️ Scarica da Cloud"</b>.</li>
    </ol>
    <div class="row wrap">
      ${field('JSONBin Master Key', `<div class="row"><input name="jsonbinKey" id="inpJbKey" type="password" value="${esc(secrets.jsonbinKey)}" placeholder="$2a$10$..." autocomplete="off"><button type="button" class="btn small" id="toggleJbKey" title="Mostra/Nascondi">👁️</button></div>`, 'grow')}
      ${field('Bin ID (archivio dati)', `<input name="jsonbinBinId" id="inpJbBin" value="${esc(secrets.jsonbinBinId)}" placeholder="es. 6745a1b2e41b4d34e45...">`, 'grow')}
    </div>
    ${chk('autoSync', secrets.autoSync, 'Sincronizza automaticamente ad ogni modifica')}
    <div class="row wrap actions">
      <button class="btn primary" type="submit">💾 Salva impostazioni Cloud</button>
      <button class="btn" type="button" id="btnJbCrea">✨ Crea nuovo archivio (Bin)</button>
      <button class="btn" type="button" id="btnJbPush" ${cloudAttivo() ? '' : 'disabled'}>⬆️ Invia ora al Cloud</button>
      <button class="btn" type="button" id="btnJbPull" ${cloudAttivo() ? '' : 'disabled'}>⬇️ Scarica da Cloud</button>
    </div>
    <p class="small muted">${secrets.lastSyncAt ? 'Ultima sincronizzazione: ' + new Date(secrets.lastSyncAt).toLocaleString('it-IT') : 'Nessuna sincronizzazione effettuata su questo dispositivo.'}</p>
  </form>

  <form id="fGemini" class="panel">
    <h2>✨ Assistente AI per l'itinerario e il gruppo (Google Gemini)</h2>
    <p class="muted small">Usa l'intelligenza artificiale di Google Gemini per preparare aneddoti storici, collegamenti con la cultura del gruppo, glossari in lingua, consigli per giornate di pioggia o rispondere al volo alle curiosità dei turisti.</p>
    <p class="small">🔑 <b>Come ottenere la chiave gratuita:</b> apri <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener"><b>Google AI Studio – Crea API Key (aistudio.google.com/apikey)</b></a> col tuo account Google, clicca su <b>"Create API key"</b> e incolla il codice qui sotto.</p>
    <div class="row wrap">
      ${field('Google Gemini API Key', `<div class="row"><input name="geminiKey" id="inpGemKey" type="password" value="${esc(secrets.geminiKey)}" placeholder="AIzaSy..." autocomplete="off"><button type="button" class="btn small" id="toggleGemKey" title="Mostra/Nascondi">👁️</button></div>`, 'grow')}
      ${field('Modello Gemini (si aggiorna anche in automatico se disabilitato)', `<div class="row">${sel('geminiModel', curMod, gemOpts)}<button type="button" class="btn small" id="btnGemModels" title="Scarica l'elenco aggiornato dei modelli attivi direttamente da Google">🔄 Aggiorna modelli</button></div>`, 'grow')}
    </div>
    <div class="row wrap actions">
      <button class="btn primary" type="submit">💾 Salva chiave Gemini</button>
      <button class="btn" type="button" id="btnGemTest">🧪 Testa connessione Gemini</button>
    </div>
    <p class="small muted">🔒 Sicurezza per GitHub: le tue chiavi JSONBin e Gemini vengono salvate esclusivamente nella memoria privata di questo browser (<code>localStorage</code>) e non vengono mai inserite nel codice pubblico o nei file di backup.</p>
  </form>

  <section class="panel">
    <h2>📖 Manuale d'uso e Guida alla pubblicazione su GitHub</h2>
    <p class="muted small">Consulta o scarica il manuale completo in PDF con le istruzioni passo-passo per pubblicare gratis GuidaPA su GitHub Pages, collegare JSONBin.io e Gemini AI, usare la Modalità Tour e il Piano Pioggia.</p>
    <div class="row wrap">
      <a class="btn primary" href="Manuale_Uso_GuidaPA.pdf" target="_blank" rel="noopener">📕 Apri / Scarica Manuale d'uso (PDF)</a>
      <a class="btn" href="manuale.html" target="_blank" rel="noopener">🖨️ Versione web stampabile</a>
    </div>
  </section>

  <section class="panel">
    <h2>Backup locale dei dati</h2>
    <p class="muted small">Oltre a JSONBin.io, è buona abitudine scaricare periodicamente una copia di sicurezza sul computer o su Google Drive.</p>
    <div class="row wrap">
      <button class="btn" id="btnExport">⬇️ Scarica backup (JSON)</button>
      <label class="btn">⬆️ Ripristina backup<input type="file" id="fileImport" accept=".json,application/json" hidden></label>
      <button class="btn" id="btnCsv">📊 Esporta servizi (Excel/CSV)</button>
      <button class="btn danger" id="btnReset">Cancella tutti i dati</button>
    </div>
    <p class="muted small">${db.servizi.length} servizi · ${db.agenzie.length} agenzie · ${db.siti.length} siti</p>
  </section>`;

  $('#fProf').addEventListener('submit', e => {
    e.preventDefault();
    const o = formData(e.target);
    db.profilo = {
      ...p, nome: o.nome, tesserino: o.tesserino, piva: o.piva, cf: o.cf, telefono: o.telefono, email: o.email, iban: o.iban,
      condizioni: o.condizioni, giorniPagamento: num(o.giorniPagamento) || 30, spostamento: o.spostamento === '' ? 10 : num(o.spostamento),
      tariffe: { mezza: num(o.t_mezza), intera: num(o.t_intera), oraExtra: num(o.t_oraExtra), lingua: num(o.t_lingua), festivoPct: num(o.t_festivoPct) }
    };
    save(); toast('Profilo salvato');
  });

  const bindTogglePwd = (btnId, inpId) => {
    $(btnId).onclick = () => { const i = $(inpId); i.type = i.type === 'password' ? 'text' : 'password'; };
  };
  bindTogglePwd('#toggleJbKey', '#inpJbKey');
  bindTogglePwd('#toggleGemKey', '#inpGemKey');

  $('#fCloud').addEventListener('submit', e => {
    e.preventDefault();
    const o = formData(e.target);
    secrets.jsonbinKey = o.jsonbinKey.trim();
    secrets.jsonbinBinId = o.jsonbinBinId.trim();
    secrets.autoSync = !!o.autoSync;
    saveSecrets();
    toast('Impostazioni Cloud salvate');
    render();
  });
  $('#btnJbCrea').addEventListener('click', () => {
    secrets.jsonbinKey = $('#inpJbKey').value.trim();
    secrets.autoSync = $('#fCloud').elements.autoSync.checked;
    saveSecrets();
    jsonbinCreaBin();
  });
  $('#btnJbPush').addEventListener('click', () => {
    secrets.jsonbinKey = $('#inpJbKey').value.trim();
    secrets.jsonbinBinId = $('#inpJbBin').value.trim();
    saveSecrets();
    jsonbinPush();
  });
  $('#btnJbPull').addEventListener('click', () => {
    secrets.jsonbinKey = $('#inpJbKey').value.trim();
    secrets.jsonbinBinId = $('#inpJbBin').value.trim();
    saveSecrets();
    jsonbinPull();
  });

  $('#fGemini').addEventListener('submit', e => {
    e.preventDefault();
    const o = formData(e.target);
    secrets.geminiKey = o.geminiKey.trim();
    secrets.geminiModel = o.geminiModel.trim() || 'gemini-2.5-flash';
    saveSecrets();
    toast('Chiave Gemini salvata');
  });
  $('#btnGemModels').addEventListener('click', async () => {
    secrets.geminiKey = $('#inpGemKey').value.trim();
    saveSecrets();
    if (!geminiAttivo()) { alert('Inserisci prima la API Key di Google Gemini.'); return; }
    toast('Recupero modelli attivi da Google…');
    try {
      const lista = await caricaModelliGemini(secrets.geminiKey);
      if (!lista.some(m => m.id === secrets.geminiModel)) {
        secrets.geminiModel = scegliMigliorModelloGemini(lista) || lista[0].id;
        saveSecrets();
      }
      toast(`✅ Caricati ${lista.length} modelli attivi da Google`);
      render();
    } catch (err) {
      alert('Impossibile recuperare l\'elenco modelli:\n' + err.message);
    }
  });
  $('#btnGemTest').addEventListener('click', async () => {
    secrets.geminiKey = $('#inpGemKey').value.trim();
    secrets.geminiModel = $('#fGemini').elements.geminiModel.value.trim() || 'gemini-2.5-flash';
    saveSecrets();
    if (!geminiAttivo()) { alert('Inserisci prima la API Key di Google Gemini.'); return; }
    toast('Test connessione Gemini in corso…');
    try {
      const r = await chiamaGemini('Rispondi in una sola riga con un saluto cordiale in siciliano e italiano per una guida turistica di Palermo e Cefalù.');
      render();
      alert(`✅ Connessione riuscita (modello: ${secrets.geminiModel})!\n\n` + r);
    } catch (err) {
      alert('❌ Connessione non riuscita:\n' + err.message);
    }
  });
  $('#btnExport').addEventListener('click', () => scarica(`guidapa-backup-${oggiISO()}.json`, JSON.stringify(db, null, 2), 'application/json'));
  $('#btnCsv').addEventListener('click', () => {
    const cols = ['Data', 'Ora', 'Fine', 'Agenzia', 'Rif', 'Stato', 'Pax', 'Lingua', 'Incontro', 'Itinerario', 'Totale', 'N. fattura', 'Data fattura', 'Scadenza', 'Incassato il'];
    const rows = [...db.servizi].sort(ordinaPerData).map(s => [s.data, s.ora, oraFine(s), agenzia(s.agenziaId)?.nome || '', s.rifAgenzia, statoLabel(s.stato), s.pax, s.lingua, s.puntoIncontro, s.titolo || percorsoTesto(s), calcola(s).totale.toFixed(2).replace('.', ','), s.numFattura, s.dataFattura, scadenzaPagamento(s), s.dataPagamento]);
    const csv = [cols, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    scarica(`guidapa-servizi-${oggiISO()}.csv`, '\ufeff' + csv, 'text/csv');
  });
  $('#fileImport').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!Array.isArray(d.servizi) || !Array.isArray(d.agenzie)) throw new Error('formato');
      if (!confirm(`Ripristinare il backup? (${d.servizi.length} servizi, ${d.agenzie.length} agenzie) I dati attuali verranno sostituiti.`)) return;
      db = migrate(d); save(); toast('Backup ripristinato'); render();
    } catch { alert('File non valido.'); }
  });
  $('#btnReset').addEventListener('click', () => {
    if (!confirm('Cancellare TUTTI i dati? Scarica prima un backup!')) return;
    if (prompt('Scrivi CANCELLA per confermare') !== 'CANCELLA') return;
    db = structuredClone(DEFAULT_DB); save(); toast('Dati cancellati'); render();
  });
}

function scarica(nome, contenuto, tipo) {
  const url = URL.createObjectURL(new Blob([contenuto], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Avvio ----------
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') e.target.close(); });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
document.addEventListener('DOMContentLoaded', () => {
  $('#cloudBtn')?.addEventListener('click', async () => {
    if (!cloudAttivo()) { location.hash = '#/impostazioni'; toast('Configura qui JSONBin.io per il salvataggio Cloud'); return; }
    if (secrets.dirty) await jsonbinPush();
    else { const ok = await jsonbinPull({ auto: true }); if (ok) toast('☁️ Cloud verificato e aggiornato'); }
  });
  aggiornaBadgeCloud();
  render();
  if (cloudAttivo() && navigator.onLine) jsonbinPull({ auto: true });
});
