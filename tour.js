/* GuidaPA – Modalità Tour sul campo
   Schermata da usare durante la visita: tempi live, conta partecipanti, punto di ritrovo con QR,
   messaggi rapidi all'autista, spese, diario ed emergenze. Funziona offline (i link WhatsApp/mappe
   richiedono rete solo quando vengono aperti). */

let tourTimer = null;
let wakeLock = null;

// ---------- Utilità ----------
function telWa(t) {
  let d = String(t || '').replace(/[^\d+]/g, '');
  if (!d) return '';
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.length <= 10 && d.startsWith('3')) d = '39' + d; // cellulare italiano senza prefisso
  return d;
}
const waLink = (tel, testo) => `https://wa.me/${telWa(tel)}?text=${encodeURIComponent(testo)}`;
const telLink = t => `tel:${String(t || '').replace(/[^\d+]/g, '')}`;
const hhmm = v => { const d = new Date(v); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const minDa = v => { const d = new Date(v); return d.getHours() * 60 + d.getMinutes(); };
const fmtMin = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const oraMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const segno = m => (m > 0 ? '+' : m < 0 ? '−' : '±') + Math.abs(Math.round(m)) + "'";
const spostamento = () => num(db.profilo.spostamento) || 10;

function qrSvg(text) {
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
}

function mapsUrl(r, zona) {
  if (r.coords) return `https://www.google.com/maps/search/?api=1&query=${r.coords}`;
  const luogo = r.luogo || '';
  const citta = /palermo|cefal|monreale|mondello/i.test(luogo) ? '' : ', ' + (zona || 'Palermo');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(luogo + citta)}`;
}

async function richiediWakeLock() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } }
  catch { /* non supportato (es. file://): nessun problema */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && location.hash.startsWith('#/tour/')) richiediWakeLock(); });

// ---------- Modello ----------
function ensureTour(s) {
  s.tour ??= {};
  const T = s.tour;
  T.tappe ??= {};
  T.conta ??= 0;
  T.check ??= {};
  T.spese ??= [];
  T.log ??= [];
  T.raccolta ??= { luogo: '', ora: '', coords: '' };
  return T;
}

// Orari pianificati delle tappe (minuti dalla mezzanotte)
function piano(s) {
  const sp = spostamento();
  let c = minuti(s.ora);
  return (s.tappe || []).map((id, i) => {
    const t = sito(id) || { nome: id, durata: 30, zona: '' };
    const p = { i, id, t, inizio: c, fine: c + num(t.durata) };
    c = p.fine + sp;
    return p;
  });
}

// Previsione dell'orario di fine in base a quanto già svolto
function fineprevista(s) {
  const P = piano(s), T = s.tour, sp = spostamento(), now = oraMin();
  if (!P.length) return intervallo(s)[1];
  const avviato = !!T.avviatoIl;
  let cursor = null;
  for (const p of P) {
    const r = T.tappe[p.i] || {};
    const dur = num(p.t.durata);
    if (r.fine) cursor = minDa(r.fine) + sp;
    else if (r.inizio) cursor = Math.max(now, minDa(r.inizio) + dur) + sp;
    else {
      const start = Math.max(cursor ?? p.inizio, avviato ? now : 0);
      cursor = start + dur + sp;
    }
  }
  return cursor - sp;
}

function tappaCorrente(s) {
  const P = piano(s), T = s.tour;
  return P.find(p => T.tappe[p.i]?.inizio && !T.tappe[p.i]?.fine) || P.find(p => !T.tappe[p.i]?.inizio) || null;
}

function limiteMin(s) { return s.orarioLimite ? minuti(s.orarioLimite) : intervallo(s)[1]; }

function bannerHTML(s) {
  const T = s.tour;
  const fine = fineprevista(s);
  const lim = limiteMin(s);
  const margine = lim - fine;
  const cls = margine < 0 ? 'bad' : margine < 15 ? 'mid' : 'good';
  const stato = T.chiusoIl ? `🏁 Tour concluso alle ${hhmm(T.chiusoIl)}` : T.avviatoIl ? `In corso dalle ${hhmm(T.avviatoIl)}` : `Inizio previsto ${s.ora}`;
  return `<div class="tb ${T.chiusoIl ? 'good' : cls}">
    <div>${stato}</div>
    ${T.chiusoIl ? '' : `<div><b>Fine prevista ${fmtMin(fine)}</b> · ${s.orarioLimite ? 'limite rientro' : 'fine servizio'} ${fmtMin(lim)} <b>(${margine >= 0 ? 'margine ' + Math.round(margine) + "'" : 'RITARDO ' + Math.round(-margine) + "'"})</b></div>`}
  </div>`;
}

// ---------- Scelta del tour ----------
function vTourScelta() {
  const oggi = oggiISO();
  const att = db.servizi.filter(s => attivo(s) && !['pagata', 'fatturata'].includes(s.stato)).sort(ordinaPerData);
  const diOggi = att.filter(s => s.data === oggi);
  const prossimi = att.filter(s => s.data > oggi).slice(0, 6);
  const btn = s => `<a class="bigbtn" href="#/tour/${s.id}"><b>${s.data === oggi ? '' : fmtData(s.data) + ' · '}${esc(s.ora)} · ${esc(s.titolo || percorsoTesto(s) || 'Tour')}</b><span>${esc(agenzia(s.agenziaId)?.nome || '')} · ${s.pax || '?'} pax · ${esc(s.lingua)} · ${statoLabel(s.stato)}${s.tour?.chiusoIl ? ' · concluso' : s.tour?.avviatoIl ? ' · IN CORSO' : ''}</span></a>`;
  app.innerHTML = `
    <section class="panel"><h2>🚶 Tour di oggi</h2>${diOggi.length ? diOggi.map(btn).join('') : '<p class="muted">Nessun servizio oggi.</p>'}</section>
    <section class="panel"><h2>Prossimi</h2>${prossimi.length ? prossimi.map(btn).join('') : '<p class="muted">Nessun servizio in programma.</p>'}</section>`;
}

// ---------- Schermata tour ----------
function vTour(id) {
  clearInterval(tourTimer);
  if (!id) return vTourScelta();
  const s = db.servizi.find(x => x.id === id);
  if (!s) { app.innerHTML = '<p class="panel">Servizio non trovato.</p>'; return; }
  const T = ensureTour(s);
  const P = piano(s);
  const ag = agenzia(s.agenziaId);
  const cur = tappaCorrente(s);
  const nomi = (s.nomi || '').split('\n').map(x => x.trim()).filter(Boolean);
  const presenti = nomi.filter(n => T.check[n]).length;
  const pax = num(s.pax);
  const zona = cur?.t.zona || P[0]?.t.zona || 'Palermo';
  const R = T.raccolta;
  const totSpese = T.spese.reduce((a, x) => a + num(x.importo), 0);

  const rigaTappa = p => {
    const r = T.tappe[p.i] || {};
    const inCorso = r.inizio && !r.fine;
    const rit = r.inizio ? minDa(r.inizio) - p.inizio : null;
    return `<li class="tp ${inCorso ? 'now' : ''} ${r.fine ? 'done' : ''}">
      <div class="tp-h">
        <div><b>${p.t.coperto ? '🏛️' : '☀️'} ${p.i + 1}. ${esc(p.t.nome)}</b>
          <div class="small muted">Previsto ${fmtMin(p.inizio)}–${fmtMin(p.fine)} (${p.t.durata}')</div>
          ${r.inizio ? `<div class="small">Effettivo ${hhmm(r.inizio)}${r.fine ? '–' + hhmm(r.fine) : ''} <span class="rit ${rit > 10 ? 'bad' : rit > 0 ? 'mid' : 'good'}">${segno(rit)}</span>${r.conta != null ? ` · contati ${r.conta}` : ''}</div>` : ''}
          ${inCorso ? `<div class="small"><b id="elapsed" data-inizio="${r.inizio}" data-durata="${p.t.durata}"></b></div>` : ''}
        </div>
        <div class="tp-b">
          <button class="btn small" data-ai="${esc(p.id)}" title="Approfondisci questa tappa con Gemini AI">✨</button>
          ${!r.inizio ? `<button class="btn ${cur?.i === p.i ? 'primary' : ''}" data-start="${p.i}">▶ Inizia</button>` : ''}
          ${inCorso ? `<button class="btn primary" data-end="${p.i}">■ Fine</button>` : ''}
          ${r.inizio ? `<button class="btn small" data-undo="${p.i}" title="Annulla orari registrati">↺</button>` : ''}
        </div>
      </div>
      ${(inCorso || (!r.inizio && cur?.i === p.i)) && p.t.note ? `<div class="tip">💡 ${esc(p.t.note)}</div>` : ''}
    </li>`;
  };

  app.innerHTML = `
  <div class="tour">
    <div class="tour-top">
      <a class="btn small" href="#/servizio/${s.id}">← Scheda</a>
      <div class="grow center"><b>${esc(s.titolo || percorsoTesto(s) || 'Tour')}</b><div class="small muted">${esc(ag?.nome || '')} · ${esc(s.lingua)} · ${fmtData(s.data)}</div></div>
      <div class="clock" id="tClock"></div>
    </div>
    ${s.data !== oggiISO() ? `<div class="warn">📆 Questo servizio è previsto per ${fmtData(s.data)}, non oggi.</div>` : ''}
    <div id="tBanner">${bannerHTML(s)}</div>
    ${s.esigenze ? `<div class="warn">♿ ${esc(s.esigenze)}</div>` : ''}

    <section class="panel">
      <h3>👥 Conta partecipanti</h3>
      <div class="counter ${T.conta === pax && pax ? 'full' : ''}">
        <button class="cbtn" data-conta="-1">−</button>
        <div class="cval"><b>${T.conta}</b><span>/ ${pax || '?'}</span></div>
        <button class="cbtn plus" data-conta="1">+</button>
      </div>
      <div class="row center-row">
        <button class="btn small" id="contaZero">Azzera</button>
        ${pax ? `<button class="btn small" id="contaTutti">Tutti presenti (${pax})</button>` : ''}
      </div>
      ${nomi.length ? `<details ${presenti && presenti < nomi.length ? 'open' : ''}>
        <summary>Lista nomi · presenti ${presenti}/${nomi.length}</summary>
        <div class="nomi">${nomi.map((n, k) => `<label class="chk nome ${T.check[n] ? 'on' : ''}"><input type="checkbox" data-nome="${k}" ${T.check[n] ? 'checked' : ''}> ${esc(n)}</label>`).join('')}</div>
        <button class="btn small" id="checkZero">Azzera spunte</button>
      </details>` : '<p class="small muted">Puoi inserire la lista dei nomi nella scheda del servizio.</p>'}
    </section>

    <section class="panel">
      <div class="row between">
        <h3>🗺️ Percorso${s.tappePrePioggia ? ' <span class="badge b-nuova">🌧️ variante al coperto</span>' : ''}</h3>
        <button class="btn small rain-btn" id="btnTourPioggia">🌧️ Cattivo tempo: al coperto</button>
      </div>
      ${P.length ? `<ol class="tps">${P.map(rigaTappa).join('')}</ol>` : '<p class="muted">Nessuna tappa: aggiungile nella scheda del servizio.</p>'}
    </section>

    <section class="panel">
      <div class="row between">
        <h3>✨ Approfondimenti e curiosità per il gruppo</h3>
        <button class="btn primary small" id="btnTourAi">✨ Chiedi a Gemini</button>
      </div>
      <p class="small muted">Aneddoti storici, collegamenti col paese del gruppo, gastronomia locale o risposte rapide alle domande dei turisti.</p>
      ${s.appuntiAI?.length ? `<details open>
        <summary>📌 Appunti salvati (${s.appuntiAI.length} – consultabili anche offline)</summary>
        <div class="ai-saved">${s.appuntiAI.map(a => `<div class="ai-card"><b>${esc(a.titolo)}</b><div class="small">${formattaMarkdown(a.testo)}</div></div>`).join('')}</div>
      </details>` : ''}
    </section>

    <section class="panel">
      <h3>📍 Punto di ritrovo</h3>
      <div class="row wrap">
        ${field('Luogo', `<input id="rLuogo" value="${esc(R.luogo)}" placeholder="es. Fontana di Piazza Pretoria">`, 'grow')}
        ${field('Ora', `<input id="rOra" type="time" value="${esc(R.ora)}">`)}
      </div>
      <div class="row wrap">
        <button class="btn small" data-plus="15">+15'</button>
        <button class="btn small" data-plus="20">+20'</button>
        <button class="btn small" data-plus="30">+30'</button>
        <button class="btn small" data-plus="45">+45'</button>
        <button class="btn small" id="rGeo">📍 Sono qui (GPS)</button>
        ${R.coords ? `<span class="small muted">GPS: ${esc(R.coords)} <a href="#" id="rGeoX">rimuovi</a></span>` : ''}
      </div>
      <div class="row wrap actions">
        <button class="btn primary" id="qrRitrovo" ${R.luogo || R.coords ? '' : 'disabled'}>🔳 QR mappa per i turisti</button>
        <button class="btn" id="shareRitrovo" ${R.luogo || R.coords ? '' : 'disabled'}>📤 Condividi messaggio</button>
        ${db.profilo.telefono ? '<button class="btn" id="qrGuida">🔳 QR WhatsApp guida</button>' : ''}
      </div>
    </section>

    <section class="panel">
      <h3>🚌 Autista ${s.autista ? '· ' + esc(s.autista) : ''}</h3>
      ${s.telAutista ? `<div class="grid-btn">
        <a class="btn" target="_blank" href="${waLink(s.telAutista, `Ciao, gruppo ${ag?.nome || ''} pronto tra 10 minuti${R.luogo ? ' a ' + R.luogo : ''}.`)}">✅ Pronti tra 10'</a>
        <a class="btn" target="_blank" href="${waLink(s.telAutista, `Ciao, siamo in ritardo di circa 15 minuti. Ti aggiorno a breve.`)}">⏱️ Ritardo 15'</a>
        <a class="btn" target="_blank" href="${waLink(s.telAutista, `Ritrovo${R.ora ? ' alle ' + R.ora : ''}${R.luogo ? ': ' + R.luogo : ''} ${R.luogo || R.coords ? mapsUrl(R, zona) : ''}`.trim())}">📍 Invia ritrovo</a>
        <a class="btn" href="${telLink(s.telAutista)}">📞 Chiama</a>
      </div>` : '<p class="small muted">Aggiungi il telefono dell\'autista nella scheda del servizio per i messaggi rapidi.</p>'}
    </section>

    <section class="panel">
      <h3>💶 Spese anticipate ${totSpese ? '· ' + eur(totSpese) : ''}</h3>
      <form id="fSpesa" class="row wrap">
        <input name="desc" placeholder="es. Biglietti Cappella Palatina" class="grow" required>
        <input name="importo" type="number" step="0.01" min="0" placeholder="€" style="max-width:110px" required>
        <button class="btn">Aggiungi</button>
      </form>
      ${T.spese.length ? `<table class="tot">${T.spese.map((x, k) => `<tr><td>${hhmm(x.t)} · ${esc(x.desc)}</td><td>${eur(x.importo)} <a href="#" data-delspesa="${k}">✕</a></td></tr>`).join('')}</table>` : ''}
    </section>

    <section class="panel">
      <h3>📝 Diario e imprevisti</h3>
      <form id="fLog" class="row">
        <input name="testo" placeholder="es. Cattedrale chiusa per funzione, invertite le tappe" class="grow" required>
        <button class="btn">Annota</button>
      </form>
      ${T.log.length ? `<ul class="log">${T.log.map((x, k) => `<li><b>${hhmm(x.t)}</b> ${esc(x.testo)} <a href="#" data-dellog="${k}">✕</a></li>`).join('')}</ul>` : ''}
    </section>

    <section class="panel">
      <h3>🆘 Emergenze e contatti</h3>
      <div class="grid-btn">
        <a class="btn danger" href="tel:112">🚑 Emergenza 112</a>
        ${ag?.telefono ? `<a class="btn" href="${telLink(ag.telefono)}">🏢 ${esc(ag.nome)}</a>` : ''}
        ${s.telContatto ? `<a class="btn" href="${telLink(s.telContatto)}">👤 ${esc(s.contatto || 'Capogruppo')}</a>` : ''}
        ${s.telAutista ? `<a class="btn" href="${telLink(s.telAutista)}">🚌 Autista</a>` : ''}
        <a class="btn" target="_blank" href="https://www.google.com/maps/search/farmacia/">💊 Farmacie vicine</a>
        <a class="btn" target="_blank" href="https://www.google.com/maps/search/pronto+soccorso/">🏥 Pronto soccorso</a>
      </div>
    </section>

    <div class="row actions">
      ${T.chiusoIl
        ? `<button class="btn primary grow" id="btnReport">📄 Report per l'agenzia</button><button class="btn" id="btnRiapri">Riapri tour</button>`
        : `<button class="btn primary grow big" id="btnChiudi">🏁 Chiudi tour e crea report</button>`}
    </div>
  </div>`;

  // --- azioni ---
  const act = fn => { fn(); T.agg = new Date().toISOString(); save(); const y = scrollY; vTour(id); scrollTo(0, y); };
  const now = () => new Date().toISOString();

  $$('[data-conta]').forEach(b => b.onclick = () => act(() => { T.conta = Math.max(0, T.conta + Number(b.dataset.conta)); if (navigator.vibrate) navigator.vibrate(15); }));
  $('#contaZero').onclick = () => act(() => { T.conta = 0; });
  $('#contaTutti') && ($('#contaTutti').onclick = () => act(() => { T.conta = pax; }));
  $$('[data-nome]').forEach(cb => cb.onchange = () => act(() => { const n = nomi[Number(cb.dataset.nome)]; T.check[n] = cb.checked; T.conta = nomi.filter(x => T.check[x]).length; }));
  $('#checkZero') && ($('#checkZero').onclick = () => act(() => { T.check = {}; T.conta = 0; }));

  $$('[data-start]').forEach(b => b.onclick = () => act(() => {
    const i = Number(b.dataset.start);
    // chiude automaticamente un'eventuale tappa ancora aperta
    Object.entries(T.tappe).forEach(([k, r]) => { if (r.inizio && !r.fine) { r.fine = now(); r.conta = T.conta; } });
    T.tappe[i] = { inizio: now() };
    if (!T.avviatoIl) T.avviatoIl = T.tappe[i].inizio;
    if (['nuova', 'preventivata'].includes(s.stato)) s.stato = 'confermata';
  }));
  $$('[data-end]').forEach(b => b.onclick = () => act(() => {
    const i = Number(b.dataset.end);
    T.tappe[i].fine = now();
    T.tappe[i].conta = T.conta;
  }));
  $$('[data-undo]').forEach(b => b.onclick = () => { if (confirm('Annullare gli orari registrati per questa tappa?')) act(() => { delete T.tappe[Number(b.dataset.undo)]; if (!Object.keys(T.tappe).length) delete T.avviatoIl; }); });
  $$('[data-ai]').forEach(b => b.onclick = () => apriAssistenteAI(s.id, b.dataset.ai));
  $('#btnTourAi').onclick = () => apriAssistenteAI(s.id, cur?.id || '');
  $('#btnTourPioggia').onclick = () => apriPianoPioggia(s, {
    inTour: true,
    onApply: (nuove, ripristino) => act(() => {
      const perId = {};
      (s.tappe || []).forEach((oldId, idx) => { if (T.tappe[idx]) perId[oldId] = T.tappe[idx]; });
      const vecchie = percorsoTesto(s);
      s.tappe = nuove;
      const nuovoMappa = {};
      nuove.forEach((nid, idx) => { if (perId[nid]) nuovoMappa[idx] = perId[nid]; });
      T.tappe = nuovoMappa;
      T.log.push({
        t: now(),
        testo: ripristino
          ? `☀️ Ripristinato itinerario originale: ${percorsoTesto(s)}`
          : `🌧️ Attivata variante al coperto per maltempo: ${percorsoTesto(s)} (prima: ${vecchie})`
      });
    })
  });

  const saveR = () => { R.luogo = $('#rLuogo').value.trim(); R.ora = $('#rOra').value; save(); };
  $('#rLuogo').onchange = () => act(saveR);
  $('#rOra').onchange = () => act(saveR);
  $$('[data-plus]').forEach(b => b.onclick = () => act(() => { saveR(); R.ora = fmtMin(oraMin() + Number(b.dataset.plus)); }));
  $('#rGeo').onclick = () => {
    if (!navigator.geolocation) return toast('GPS non disponibile');
    toast('Rilevo la posizione…');
    navigator.geolocation.getCurrentPosition(
      pos => act(() => { saveR(); R.coords = pos.coords.latitude.toFixed(6) + ',' + pos.coords.longitude.toFixed(6); if (!R.luogo) R.luogo = 'Punto di ritrovo'; }),
      () => toast('Posizione non disponibile (permessi o connessione)'),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };
  $('#rGeoX') && ($('#rGeoX').onclick = e => { e.preventDefault(); act(() => { R.coords = ''; }); });

  const msgRitrovo = () => [
    `📍 ${R.ora ? 'Meeting point at ' + R.ora + ' / Ritrovo alle ' + R.ora : 'Meeting point / Ritrovo'}`,
    R.luogo, mapsUrl(R, zona),
    db.profilo.nome || db.profilo.telefono ? `${db.profilo.nome}${db.profilo.telefono ? ' – ' + db.profilo.telefono : ''}` : ''
  ].filter(Boolean).join('\n');
  $('#qrRitrovo').onclick = () => mostraQR('Ritrovo' + (R.ora ? ' alle ' + R.ora : ''), R.luogo, mapsUrl(R, zona), 'Inquadra con la fotocamera per aprire la mappa');
  $('#shareRitrovo').onclick = async () => {
    const t = msgRitrovo();
    if (navigator.share) { try { await navigator.share({ text: t }); return; } catch { /* annullato */ } }
    try { await navigator.clipboard.writeText(t); toast('Messaggio copiato: incollalo nel gruppo WhatsApp'); } catch { prompt('Copia il messaggio:', t); }
  };
  $('#qrGuida') && ($('#qrGuida').onclick = () => mostraQR('Contatta la guida', db.profilo.nome, `https://wa.me/${telWa(db.profilo.telefono)}`, 'Inquadra per scrivermi su WhatsApp'));

  $('#fSpesa').onsubmit = e => { e.preventDefault(); const o = formData(e.target); act(() => T.spese.push({ t: now(), desc: o.desc, importo: num(o.importo) })); };
  $$('[data-delspesa]').forEach(a => a.onclick = e => { e.preventDefault(); act(() => T.spese.splice(Number(a.dataset.delspesa), 1)); });
  $('#fLog').onsubmit = e => { e.preventDefault(); const o = formData(e.target); act(() => T.log.push({ t: now(), testo: o.testo })); };
  $$('[data-dellog]').forEach(a => a.onclick = e => { e.preventDefault(); act(() => T.log.splice(Number(a.dataset.dellog), 1)); });

  $('#btnChiudi') && ($('#btnChiudi').onclick = () => {
    if (!confirm('Chiudere il tour? Il servizio verrà segnato come "Svolta".')) return;
    act(() => {
      Object.values(T.tappe).forEach(r => { if (r.inizio && !r.fine) { r.fine = now(); r.conta = T.conta; } });
      T.chiusoIl = now();
      if (['nuova', 'preventivata', 'confermata'].includes(s.stato)) s.stato = 'svolta';
    });
    mostraReport(s);
  });
  $('#btnReport') && ($('#btnReport').onclick = () => mostraReport(s));
  $('#btnRiapri') && ($('#btnRiapri').onclick = () => act(() => { delete T.chiusoIl; }));

  // --- aggiornamento periodico ---
  const tick = () => {
    if (!location.hash.startsWith('#/tour/' + id)) { clearInterval(tourTimer); return; }
    $('#tClock').textContent = hhmm(new Date());
    $('#tBanner').innerHTML = bannerHTML(s);
    const el = $('#elapsed');
    if (el) {
      const trasc = Math.max(0, Math.round((Date.now() - new Date(el.dataset.inizio)) / 60000));
      const resto = num(el.dataset.durata) - trasc;
      el.textContent = `In corso da ${trasc}' · ${resto >= 0 ? 'restano ~' + resto + "'" : 'oltre il previsto di ' + -resto + "'"}`;
      el.className = resto < 0 ? 'bad-t' : '';
    }
  };
  tick();
  tourTimer = setInterval(tick, 15000);
  richiediWakeLock();
}

// ---------- QR e report ----------
function mostraQR(titolo, sottotitolo, url, istruzioni) {
  const dlg = $('#modal');
  $('#modalBody').innerHTML = `
    <div class="qrbox">
      <h2>${esc(titolo)}</h2>
      ${sottotitolo ? `<p class="big-t">${esc(sottotitolo)}</p>` : ''}
      <div class="qr">${qrSvg(url)}</div>
      <p class="muted">${esc(istruzioni)}</p>
      <p class="small muted wrap-any">${esc(url)}</p>
      <button class="btn primary" id="qrClose">Chiudi</button>
    </div>`;
  dlg.showModal();
  $('#qrClose').onclick = () => dlg.close();
}

function reportTesto(s) {
  const T = s.tour, ag = agenzia(s.agenziaId), P = piano(s);
  const tappe = P.map(p => {
    const r = T.tappe[p.i] || {};
    return `${p.i + 1}. ${p.t.nome}: ${r.inizio ? hhmm(r.inizio) + (r.fine ? '–' + hhmm(r.fine) : '') : 'non effettuata'}`;
  });
  const conte = Object.values(T.tappe).map(r => r.conta).filter(c => c != null);
  const tot = T.spese.reduce((a, x) => a + num(x.importo), 0);
  return [
    `REPORT SERVIZIO – ${s.titolo || percorsoTesto(s) || 'Visita guidata'}`,
    `Agenzia: ${ag?.nome || '—'}${s.rifAgenzia ? ' (rif. ' + s.rifAgenzia + ')' : ''}`,
    `Data: ${fmtData(s.data)}`,
    `Lingua: ${s.lingua} · Partecipanti previsti: ${s.pax || '—'}${conte.length ? ' · contati: ' + Math.max(...conte) : ''}`,
    `Orario effettivo: ${T.avviatoIl ? hhmm(T.avviatoIl) : '—'} – ${T.chiusoIl ? hhmm(T.chiusoIl) : '—'} (previsto ${s.ora}–${oraFine(s)})`,
    '',
    'Tappe:',
    ...tappe,
    ...(T.spese.length ? ['', `Spese anticipate (totale ${eur(tot)}):`, ...T.spese.map(x => `- ${x.desc}: ${eur(x.importo)}`)] : []),
    ...(T.log.length ? ['', 'Note:', ...T.log.map(x => `- ${hhmm(x.t)} ${x.testo}`)] : []),
    '',
    db.profilo.nome || ''
  ].join('\n').trim();
}

function mostraReport(s) {
  const testo = reportTesto(s);
  const ag = agenzia(s.agenziaId);
  const dlg = $('#modal');
  $('#modalBody').innerHTML = `
    <h2>📄 Report per l'agenzia</h2>
    <textarea id="repTxt" rows="16">${esc(testo)}</textarea>
    <div class="row wrap actions">
      <button class="btn primary" id="repCopy">📋 Copia</button>
      ${ag?.telefono ? `<a class="btn" target="_blank" id="repWa" href="#">WhatsApp agenzia</a>` : ''}
      ${ag?.email ? `<a class="btn" id="repMail" href="#">✉️ Email agenzia</a>` : ''}
      <span class="grow"></span>
      <button class="btn" id="repClose">Chiudi</button>
    </div>`;
  dlg.showModal();
  const txt = () => $('#repTxt').value;
  $('#repCopy').onclick = async () => { try { await navigator.clipboard.writeText(txt()); toast('Report copiato'); } catch { $('#repTxt').select(); } };
  $('#repWa') && ($('#repWa').onclick = e => { e.currentTarget.href = waLink(ag.telefono, txt()); });
  $('#repMail') && ($('#repMail').onclick = e => { e.currentTarget.href = `mailto:${ag.email}?subject=${encodeURIComponent('Report servizio ' + fmtData(s.data) + (s.rifAgenzia ? ' – rif. ' + s.rifAgenzia : ''))}&body=${encodeURIComponent(txt())}`; });
  $('#repClose').onclick = () => dlg.close();
}
