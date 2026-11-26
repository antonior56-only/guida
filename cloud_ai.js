/* GuidaPA – Sincronizzazione Cloud (JSONBin.io), Assistente AI (Google Gemini)
   e Piano Pioggia (alternative al coperto).
   Le chiavi API vengono salvate SOLO in localStorage su questo dispositivo (mai nel database sincronizzato o nei backup). */

const SECRETS_KEY = 'guidapa_secrets_v1';
const LINK_GEMINI_KEY = 'https://aistudio.google.com/apikey';
const LINK_JSONBIN_KEY = 'https://jsonbin.io/app/app/api-keys';

let secrets = loadSecrets();
let syncTimer = null;
let syncInFlight = false;

function loadSecrets() {
  try {
    const s = JSON.parse(localStorage.getItem(SECRETS_KEY)) || {};
    return {
      jsonbinKey: s.jsonbinKey || '',
      jsonbinBinId: s.jsonbinBinId || '',
      autoSync: s.autoSync !== false,
      dirty: !!s.dirty,
      lastSyncAt: s.lastSyncAt || '',
      geminiKey: s.geminiKey || '',
      geminiModel: s.geminiModel || 'gemini-2.5-flash'
    };
  } catch {
    return { jsonbinKey: '', jsonbinBinId: '', autoSync: true, dirty: false, lastSyncAt: '', geminiKey: '', geminiModel: 'gemini-2.5-flash' };
  }
}

function saveSecrets() {
  localStorage.setItem(SECRETS_KEY, JSON.stringify(secrets));
  aggiornaBadgeCloud();
}

const cloudAttivo = () => Boolean(secrets.jsonbinKey.trim() && secrets.jsonbinBinId.trim());
const geminiAttivo = () => Boolean(secrets.geminiKey.trim());

// ---------- UI stato Cloud nella barra in alto ----------
function aggiornaBadgeCloud(statoExtra) {
  const el = document.getElementById('cloudBtn');
  if (!el) return;
  if (!cloudAttivo()) {
    el.textContent = '☁️ Locale';
    el.title = 'Dati salvati solo su questo dispositivo. Clicca per configurare JSONBin.io';
    el.className = 'btn small cloud-off';
    return;
  }
  if (statoExtra === 'syncing' || syncInFlight) {
    el.textContent = '☁️ ⏳';
    el.title = 'Sincronizzazione con JSONBin.io in corso…';
    el.className = 'btn small cloud-wait';
  } else if (!navigator.onLine || secrets.dirty || statoExtra === 'error') {
    el.textContent = '☁️ ⚠️';
    el.title = !navigator.onLine ? 'Offline: i dati verranno inviati al cloud appena torna la rete' : 'Modifiche locali da sincronizzare (clicca per riprovare)';
    el.className = 'btn small cloud-warn';
  } else {
    el.textContent = '☁️ OK';
    el.title = 'Sincronizzato con JSONBin.io' + (secrets.lastSyncAt ? ' (' + new Date(secrets.lastSyncAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) + ')' : '');
    el.className = 'btn small cloud-ok';
  }
}

// ---------- Chiamate REST JSONBin.io v3 ----------
async function jsonbinFetch(path, method = 'GET', bodyObj = null, extraHeaders = {}) {
  const key = secrets.jsonbinKey.trim();
  if (!key) throw new Error('Inserisci prima la API Key di JSONBin.io');
  const makeReq = headerName => fetch('https://api.jsonbin.io/v3' + path, {
    method,
    headers: {
      ...(bodyObj ? { 'Content-Type': 'application/json' } : {}),
      [headerName]: key,
      ...extraHeaders
    },
    body: bodyObj ? JSON.stringify(bodyObj) : undefined
  });
  let res = await makeReq('X-Master-Key');
  // Se l'utente ha incollato una Access Key anziché la Master Key, riprova automaticamente con X-Access-Key
  if (res.status === 401 || res.status === 403) {
    const res2 = await makeReq('X-Access-Key');
    if (res2.ok) res = res2;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Errore JSONBin (${res.status})`);
  return data;
}

async function jsonbinCreaBin() {
  if (!secrets.jsonbinKey.trim()) { alert('Incolla prima la tua Master Key di JSONBin.io.'); return; }
  try {
    aggiornaBadgeCloud('syncing');
    db.updatedAt = new Date().toISOString();
    localStorage.setItem(LS_KEY, JSON.stringify(db));
    const res = await jsonbinFetch('/b', 'POST', db, { 'X-Bin-Name': 'GuidaPA', 'X-Bin-Private': 'true' });
    const id = res?.metadata?.id;
    if (!id) throw new Error('ID del Bin non ricevuto');
    secrets.jsonbinBinId = id;
    secrets.dirty = false;
    secrets.lastSyncAt = new Date().toISOString();
    saveSecrets();
    toast('☁️ Archivio JSONBin creato e sincronizzato!');
    render();
  } catch (e) {
    aggiornaBadgeCloud('error');
    alert('Impossibile creare il Bin su JSONBin.io:\n' + e.message);
  }
}

async function jsonbinPush({ silent = false } = {}) {
  if (!cloudAttivo()) return false;
  if (!navigator.onLine) {
    secrets.dirty = true;
    saveSecrets();
    if (!silent) toast('Offline: salvato sul dispositivo, invierò al cloud appena torna la rete');
    return false;
  }
  syncInFlight = true;
  aggiornaBadgeCloud('syncing');
  try {
    if (!db.updatedAt) db.updatedAt = new Date().toISOString();
    await jsonbinFetch('/b/' + encodeURIComponent(secrets.jsonbinBinId.trim()), 'PUT', db);
    secrets.dirty = false;
    secrets.lastSyncAt = new Date().toISOString();
    syncInFlight = false;
    saveSecrets();
    if (!silent) toast('☁️ Dati salvati su JSONBin.io');
    return true;
  } catch (e) {
    syncInFlight = false;
    secrets.dirty = true;
    saveSecrets();
    aggiornaBadgeCloud('error');
    if (!silent) alert('Errore durante il salvataggio su JSONBin.io:\n' + e.message);
    return false;
  }
}

async function jsonbinPull({ auto = false } = {}) {
  if (!cloudAttivo() || !navigator.onLine) return false;
  syncInFlight = true;
  aggiornaBadgeCloud('syncing');
  try {
    const res = await jsonbinFetch('/b/' + encodeURIComponent(secrets.jsonbinBinId.trim()) + '/latest', 'GET');
    const rem = res?.record;
    syncInFlight = false;
    if (!rem || !Array.isArray(rem.servizi)) throw new Error('Il Bin non contiene dati validi di GuidaPA');

    if (auto) {
      const remTime = rem.updatedAt || '';
      const locTime = db.updatedAt || '';
      if (secrets.dirty && remTime && locTime && remTime > locTime) {
        if (confirm(`Sul cloud (JSONBin) c'è una versione più recente (${new Date(remTime).toLocaleString('it-IT')}), ma hai modifiche locali non inviate.\n\nPremi OK per scaricare i dati dal Cloud, oppure Annulla per inviare al Cloud i dati di questo dispositivo.`)) {
          applicaDbRemoto(rem);
          toast('☁️ Dati aggiornati dal cloud');
        } else {
          await jsonbinPush({ silent: true });
        }
      } else if (secrets.dirty) {
        await jsonbinPush({ silent: true });
      } else if (remTime && (!locTime || remTime > locTime)) {
        applicaDbRemoto(rem);
        toast('☁️ Dati aggiornati dal cloud');
      } else {
        secrets.lastSyncAt = new Date().toISOString();
        saveSecrets();
      }
      return true;
    }

    if (db.servizi.length && !confirm(`Sostituire i dati locali con quelli salvati su JSONBin.io?\n(${rem.servizi.length} servizi, ${rem.agenzie?.length || 0} agenzie)`)) {
      aggiornaBadgeCloud();
      return false;
    }
    applicaDbRemoto(rem);
    toast('☁️ Dati scaricati da JSONBin.io');
    return true;
  } catch (e) {
    syncInFlight = false;
    aggiornaBadgeCloud('error');
    if (!auto) alert('Errore lettura da JSONBin.io:\n' + e.message);
    return false;
  }
}

function applicaDbRemoto(rem) {
  db = migrate(rem);
  localStorage.setItem(LS_KEY, JSON.stringify(db));
  secrets.dirty = false;
  secrets.lastSyncAt = new Date().toISOString();
  saveSecrets();
  render();
}

function pianificaCloudSync() {
  if (!cloudAttivo()) return;
  secrets.dirty = true;
  saveSecrets();
  if (!secrets.autoSync) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => jsonbinPush({ silent: true }), 1500);
}

window.addEventListener('online', () => {
  aggiornaBadgeCloud();
  if (cloudAttivo() && secrets.dirty && secrets.autoSync) jsonbinPush({ silent: true });
});
window.addEventListener('offline', () => aggiornaBadgeCloud());

// ---------- Piano Pioggia / Alternativa al coperto ----------
function proposteAlCoperto(s, soloNonSvolte = false) {
  const giorno = s.data ? new Date(s.data + 'T00:00').getDay() : null;
  const tappeAttuali = s.tappe || [];
  const T = s.tour;
  const usati = new Set(tappeAttuali);

  return tappeAttuali.map((id, idx) => {
    const t = sito(id);
    const svolta = Boolean(soloNonSvolte && T?.tappe?.[idx]?.fine);
    if (!t || t.coperto || svolta) return { idx, id, t, svolta, sostituisci: false, candidati: [], scelta: id };

    // Cerca alternative al coperto nella stessa zona (prima quelle consigliate in altCoperto), aperte in quel giorno
    const preferiti = (t.altCoperto || []).map(sito).filter(Boolean);
    const altriZona = db.siti.filter(x => x.coperto && x.zona === t.zona && !(t.altCoperto || []).includes(x.id));
    const altriVicini = db.siti.filter(x => x.coperto && x.zona !== t.zona && (
      (t.zona === 'Palermo' && x.zona === 'Monreale') || (t.zona === 'Monreale' && x.zona === 'Palermo')
    ));
    const tutti = [...preferiti, ...altriZona, ...altriVicini];
    const aperti = tutti.filter(x => giorno == null || !(x.chiuso || []).includes(giorno));
    const candidati = aperti.length ? aperti : tutti;

    // Prima scelta non ancora presente nell'itinerario
    const primaLibera = candidati.find(x => !usati.has(x.id)) || candidati[0] || null;
    const scelta = primaLibera ? primaLibera.id : '';
    if (scelta) usati.add(scelta);
    return { idx, id, t, svolta: false, sostituisci: true, candidati, scelta, giorno };
  });
}

function apriPianoPioggia(servizioRef, { inTour = false, onApply = null } = {}) {
  const righe = proposteAlCoperto(servizioRef, inTour);
  const daCambiare = righe.filter(r => r.sostituisci);
  const dlg = $('#modal');
  const giorno = servizioRef.data ? new Date(servizioRef.data + 'T00:00').getDay() : null;
  const tuttiCoperti = db.siti.filter(x => x.coperto);

  const renderOpzioni = r => {
    const pool = [...r.candidati, ...tuttiCoperti.filter(x => !r.candidati.some(c => c.id === x.id))];
    return [
      `<option value="${esc(r.id)}">☀️ Mantieni comunque: ${esc(r.t.nome)} (${r.t.durata}')</option>`,
      ...pool.map(c => {
        const chiusoG = giorno != null && (c.chiuso || []).includes(giorno);
        const gia = (servizioRef.tappe || []).includes(c.id);
        return `<option value="${esc(c.id)}" ${c.id === r.scelta ? 'selected' : ''}>🏛️ ${esc(c.nome)} (${c.zona}, ${c.durata}'${chiusoG ? ' · ⚠️ chiuso ' + GIORNI[giorno] : ''}${gia ? ' · già nel tour' : ''})</option>`;
      }),
      `<option value="__remove__" ${!r.scelta ? 'selected' : ''}>✕ Rimuovi tappa senza sostituire</option>`
    ].join('');
  };

  const haOriginale = Array.isArray(servizioRef.tappePrePioggia) && servizioRef.tappePrePioggia.length > 0;

  $('#modalBody').innerHTML = `
    <div class="rain-modal">
      <h2>🌧️ Piano Pioggia – Alternativa al coperto</h2>
      <p class="muted small">Sostituisce le tappe all'aperto${inTour ? ' non ancora concluse' : ''} con monumenti, chiese o musei al chiuso nella stessa zona, tenendo conto dei giorni di chiusura.</p>
      ${haOriginale ? `<div class="ok row between"><span>È attiva una variante maltempo.</span><button type="button" class="btn small" id="btnRipristinaSole">☀️ Ripristina itinerario originale</button></div>` : ''}
      ${!servizioRef.tappe?.length
        ? `<p class="warn">Nessuna tappa selezionata nell'itinerario. Puoi aggiungere direttamente le tappe al coperto (contraddistinte da 🏛️).</p>`
        : !daCambiare.length
          ? `<div class="ok">🎉 Tutte le tappe ${inTour ? 'rimanenti ' : ''}sono già al coperto!</div>`
          : `<div class="rain-list">${daCambiare.map(r => `
            <div class="rain-row">
              <div class="rain-from">☀️ <b>${esc(r.t.nome)}</b> <span class="muted">(${r.t.zona}, ${r.t.durata}')</span></div>
              <div class="rain-arrow">↳ sostituisci con:</div>
              <select class="rain-sel" data-idx="${r.idx}">${renderOpzioni(r)}</select>
            </div>`).join('')}</div>`
      }
      <details class="small">
        <summary>➕ Aggiungi un'altra tappa al coperto</summary>
        <div class="row wrap" style="margin-top:6px">
          <select id="rainExtra" class="grow">
            <option value="">— Nessuna tappa aggiuntiva —</option>
            ${tuttiCoperti.map(c => `<option value="${esc(c.id)}">🏛️ ${esc(c.nome)} (${c.zona}, ${c.durata}')</option>`).join('')}
          </select>
        </div>
      </details>
      <div id="rainRiepilogo" class="percorso small"></div>
      <div id="rainAiBox"></div>
      <div class="row wrap actions">
        <button type="button" class="btn" id="btnRainAi">✨ Consigli pioggia con Gemini</button>
        <span class="grow"></span>
        <button type="button" class="btn" id="btnRainClose">Annulla</button>
        ${(daCambiare.length || servizioRef.tappe?.length != null) ? '<button type="button" class="btn primary" id="btnRainApply">✅ Applica variante al coperto</button>' : ''}
      </div>
    </div>`;
  dlg.showModal();

  const calcolaNuoveTappe = () => {
    const scelte = {};
    $$('.rain-sel', dlg).forEach(sel => { scelte[Number(sel.dataset.idx)] = sel.value; });
    const out = [];
    (servizioRef.tappe || []).forEach((id, idx) => {
      const val = scelte[idx] ?? id;
      if (val === '__remove__') return;
      // Evita duplicati consecutivi o doppioni involontari, ma mantieni tappe già svolte
      const svolta = Boolean(inTour && servizioRef.tour?.tappe?.[idx]?.fine);
      if (svolta || !out.includes(val)) out.push(val);
    });
    const extra = $('#rainExtra', dlg)?.value;
    if (extra && !out.includes(extra)) out.push(extra);
    return out;
  };

  const aggiornaAnteprima = () => {
    const nuove = calcolaNuoveTappe();
    const minPrima = (servizioRef.tappe || []).reduce((a, id) => a + num(sito(id)?.durata), 0);
    const minDopo = nuove.reduce((a, id) => a + num(sito(id)?.durata), 0);
    $('#rainRiepilogo', dlg).innerHTML = nuove.length
      ? `<b>Nuovo percorso (${minDopo}' vs ${minPrima}' prima):</b><br>${nuove.map((id, i) => {
          const st = sito(id);
          return `<span class="step">${st?.coperto ? '🏛️' : '☀️'} ${i + 1}. ${esc(st?.nome || id)}</span>`;
        }).join(' → ')}`
      : '<span class="muted">Nessuna tappa nel nuovo percorso.</span>';
  };
  aggiornaAnteprima();
  dlg.addEventListener('change', aggiornaAnteprima);

  $('#btnRainClose', dlg).onclick = () => dlg.close();

  $('#btnRipristinaSole', dlg)?.addEventListener('click', () => {
    const orig = [...servizioRef.tappePrePioggia];
    delete servizioRef.tappePrePioggia;
    if (onApply) onApply(orig, true);
    dlg.close();
    toast('☀️ Ripristinato itinerario originale');
  });

  $('#btnRainApply', dlg)?.addEventListener('click', () => {
    const nuove = calcolaNuoveTappe();
    if (!servizioRef.tappePrePioggia && (servizioRef.tappe || []).length) {
      servizioRef.tappePrePioggia = [...servizioRef.tappe];
    }
    if (onApply) onApply(nuove, false);
    dlg.close();
    toast('🌧️ Variante al coperto applicata');
  });

  $('#btnRainAi', dlg).onclick = async () => {
    const box = $('#rainAiBox', dlg);
    if (!geminiAttivo()) {
      box.innerHTML = `<div class="warn">Per ricevere suggerimenti su misura, inserisci la tua API Key gratuita di Google Gemini in <b>⚙️ Profilo e dati</b> (<a href="${LINK_GEMINI_KEY}" target="_blank" rel="noopener">creala qui su Google AI Studio</a>).</div>`;
      return;
    }
    const nuove = calcolaNuoveTappe();
    box.innerHTML = '<div class="muted small">⏳ Chiedo a Gemini consigli logistici per il maltempo…</div>';
    try {
      const nomiPrima = (servizioRef.tappe || []).map(id => sito(id)?.nome || id).join(', ');
      const nomiDopo = nuove.map(id => sito(id)?.nome || id).join(', ');
      const prompt = `Piove durante un tour guidato (${servizioRef.pax || 'gruppo'} persone, lingua ${servizioRef.lingua || 'Italiano'}${servizioRef.esigenze ? ', esigenze: ' + servizioRef.esigenze : ''}).
Percorso iniziale: ${nomiPrima || 'da definire'}.
Nuovo percorso al coperto: ${nomiDopo || 'da definire'}.
Dammi in massimo 6 punti brevi e praticissimi:
1) Passaggi riparati, portici o tragitti più brevi tra queste tappe;
2) 1-2 soste storiche al chiuso (caffè, pasticcerie, chiostri coperti o chiese vicine) utili per riparare il gruppo;
3) Una frase brillante e positiva (anche in ${servizioRef.lingua || 'Italiano'}) per presentare il cambio programma al gruppo valorizzando i siti al coperto.`;
      const txt = await chiamaGemini(prompt);
      box.innerHTML = `<div class="ai-res">${formattaMarkdown(txt)}</div>`;
    } catch (e) {
      box.innerHTML = `<div class="warn">Errore Gemini: ${esc(e.message)}</div>`;
    }
  };
}

// ---------- Assistente AI Google Gemini ----------
async function chiamaGemini(promptUtente) {
  const key = secrets.geminiKey.trim();
  if (!key) throw new Error('API Key di Gemini mancante');
  if (!navigator.onLine) throw new Error('Connessione internet assente: consulta gli appunti già salvati oppure riprova appena hai segnale');
  const model = (secrets.geminiModel || 'gemini-2.5-flash').trim();
  const sys = "Sei un assistente esperto per una guida turistica abilitata siciliana che opera a Palermo, Monreale e Cefalù. " +
    "Fornisci informazioni storiche, artistiche, architettoniche, demo-etno-antropologiche e gastronomiche rigorose, coinvolgenti e subito spendibili davanti a un gruppo di turisti. " +
    "Distinguere sempre i fatti storici accertati dalle leggende popolari (segnalandole come tali). " +
    "Usa elenchi puntati chiari e paragrafi brevi, facili da leggere rapidamente sullo schermo dello smartphone.";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: 'user', parts: [{ text: promptUtente }] }],
      generationConfig: { temperature: 0.65, maxOutputTokens: 1400 }
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Errore API Gemini (${res.status})`);
  const txt = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n').trim();
  if (!txt) throw new Error('Risposta vuota da Gemini');
  return txt;
}

function formattaMarkdown(txt) {
  return esc(txt)
    .replace(/^###\s+(.+)$/gm, '<h4>$1</h4>')
    .replace(/^##\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.+?)\*/g, '<i>$1</i>')
    .replace(/^\s*[-*]\s+(.+)$/gm, '• $1')
    .replace(/\n/g, '<br>');
}

function contestoServizioAI(s, tappaIdSpecifica) {
  if (!s) return 'Zona: Palermo, Monreale e Cefalù.';
  const tappeNomi = (s.tappe || []).map(id => sito(id)?.nome || id);
  const focus = tappaIdSpecifica ? sito(tappaIdSpecifica)?.nome : '';
  return [
    s.titolo ? `Tour: ${s.titolo}` : '',
    focus ? `Tappa attuale su cui concentrarsi: ${focus}` : '',
    tappeNomi.length ? `Itinerario completo: ${tappeNomi.join(' → ')}` : '',
    `Gruppo: ${s.pax || 'n.d.'} partecipanti, lingua del tour: ${s.lingua || 'Italiano'}`,
    s.esigenze ? `Esigenze particolari del gruppo: ${s.esigenze}` : ''
  ].filter(Boolean).join('\n');
}

function apriAssistenteAI(servizioOrId, tappaIdDefault = '') {
  const s = typeof servizioOrId === 'object' && servizioOrId
    ? servizioOrId
    : (servizioOrId ? db.servizi.find(x => x.id === servizioOrId) : null);
  const inDb = Boolean(s && db.servizi.some(x => x.id === s.id));
  if (s) s.appuntiAI ??= [];
  const dlg = $('#modal');

  const tappeOpts = (s?.tappe || []).map(id => [id, sito(id)?.nome || id]);
  let ultimaRisposta = null;

  const draw = () => {
    $('#modalBody').innerHTML = `
      <div class="ai-modal">
        <div class="row between">
          <h2>✨ Approfondisci con Gemini AI</h2>
          <button type="button" class="btn small" id="aiClose">✕</button>
        </div>
        ${!geminiAttivo() ? `
          <div class="panel warnbox">
            <b>Configura la tua API Key gratuita di Google Gemini</b>
            <ol class="small">
              <li>Apri <a href="${LINK_GEMINI_KEY}" target="_blank" rel="noopener"><b>Google AI Studio – Crea API Key (${LINK_GEMINI_KEY})</b></a> accedendo col tuo account Google.</li>
              <li>Premi <b>"Create API key"</b> e copia il codice che inizia con <code>AIza...</code>.</li>
              <li>Incollalo qui sotto (resta salvato solo sul tuo dispositivo):</li>
            </ol>
            <div class="row wrap">
              <input id="aiQuickKey" type="password" placeholder="Incolla qui la chiave AIza..." class="grow">
              <button type="button" class="btn primary" id="aiSaveKey">Salva e attiva</button>
            </div>
          </div>` : ''}

        ${s ? `<div class="small muted" style="margin-bottom:8px">Contesto attivo: <b>${esc(s.lingua || 'Italiano')}</b> · ${s.pax || '?'} pax${s.esigenze ? ' · ' + esc(s.esigenze) : ''}</div>` : ''}
        ${tappeOpts.length ? field('Focus su una tappa (o intero itinerario)', `<select id="aiFocus">
          <option value="">🗺️ Intero itinerario (${tappeOpts.length} tappe)</option>
          ${tappeOpts.map(([id, n]) => `<option value="${esc(id)}" ${id === tappaIdDefault ? 'selected' : ''}>📍 ${esc(n)}</option>`).join('')}
        </select>`) : ''}

        <div class="chips" style="margin-bottom:10px">
          <button type="button" class="chip ai-preset" data-tipo="aneddoti">🎭 Aneddoti e curiosità</button>
          <button type="button" class="chip ai-preset" data-tipo="ponti">🌍 Legami col paese/lingua del gruppo</button>
          <button type="button" class="chip ai-preset" data-tipo="gastro">🍋 Gastronomia e tradizioni vicine</button>
          <button type="button" class="chip ai-preset" data-tipo="lingua">🗣️ Frasi e termini in ${esc(s?.lingua || 'lingua')}</button>
          <button type="button" class="chip ai-preset" data-tipo="bambini">👨‍👩‍👧 Coinvolgere il gruppo / quiz</button>
        </div>

        <form id="fAiAsk" class="row wrap">
          <input id="aiDomanda" placeholder="Oppure scrivi una domanda fatta da un turista o un tema specifico…" class="grow" required>
          <button type="submit" class="btn primary" ${geminiAttivo() ? '' : 'disabled'}>Chiedi a Gemini</button>
        </form>

        <div id="aiOut" style="margin-top:10px"></div>

        ${s?.appuntiAI?.length ? `
          <details open style="margin-top:12px">
            <summary>📌 Appunti AI salvati per questo tour (${s.appuntiAI.length} – leggibili anche offline)</summary>
            <div class="ai-saved">
              ${s.appuntiAI.map((a, idx) => `
                <div class="ai-card">
                  <div class="row between"><b>${esc(a.titolo)}</b><a href="#" data-delai="${idx}" class="small">✕</a></div>
                  <div class="small">${formattaMarkdown(a.testo)}</div>
                </div>`).join('')}
            </div>
          </details>` : ''}
      </div>`;

    $('#aiClose', dlg).onclick = () => dlg.close();
    $('#aiSaveKey', dlg)?.addEventListener('click', () => {
      const k = $('#aiQuickKey', dlg).value.trim();
      if (!k) return;
      secrets.geminiKey = k;
      saveSecrets();
      toast('Chiave Gemini salvata!');
      draw();
    });

    const esegui = async (titoloBreve, istruzione) => {
      if (!geminiAttivo()) { toast('Inserisci prima la API Key di Gemini'); return; }
      const focusId = $('#aiFocus', dlg)?.value || '';
      const out = $('#aiOut', dlg);
      out.innerHTML = '<div class="panel muted">✨ Gemini sta preparando la scheda…</div>';
      try {
        const ctx = contestoServizioAI(s, focusId);
        const testo = await chiamaGemini(`${ctx}\n\nRichiesta della guida:\n${istruzione}`);
        ultimaRisposta = { titolo: (focusId ? (sito(focusId)?.nome + ' – ') : '') + titoloBreve, testo };
        out.innerHTML = `
          <div class="ai-res">
            <div class="row between" style="margin-bottom:6px">
              <b>${esc(ultimaRisposta.titolo)}</b>
              <div class="row">
                <button type="button" class="btn small" id="aiCopy">📋 Copia</button>
                ${s ? '<button type="button" class="btn small primary" id="aiPin">📌 Salva offline nel tour</button>' : ''}
              </div>
            </div>
            <div>${formattaMarkdown(testo)}</div>
          </div>`;
        $('#aiCopy', out).onclick = async () => {
          try { await navigator.clipboard.writeText(testo); toast('Testo copiato'); } catch {}
        };
        $('#aiPin', out)?.addEventListener('click', () => {
          s.appuntiAI.unshift({ id: uid(), t: new Date().toISOString(), ...ultimaRisposta });
          if (inDb) save();
          toast('📌 Salvato negli appunti offline del servizio');
          draw();
        });
      } catch (e) {
        out.innerHTML = `<div class="warn">⚠️ ${esc(e.message)}</div>`;
      }
    };

    $$('.ai-preset', dlg).forEach(b => b.onclick = () => {
      const prompts = {
        aneddoti: ['Aneddoti e curiosità', 'Suggerisci 4-5 dettagli sorprendenti, aneddoti storici verificati, simboli nascosti o leggende popolari (specificando quando è leggenda) da raccontare dal vivo per catturare l\'attenzione dei turisti.'],
        ponti: ['Ponti culturali', `Evidenzia i collegamenti storici, artistici, dinastici o culturali tra questi luoghi siciliani e il mondo di lingua/cultura ${s?.lingua || 'internazionale'}, con riferimenti che facciano sentire i visitatori coinvolti.`],
        gastro: ['Gastronomia e tradizioni', 'Suggerisci specialità gastronomiche storiche (es. cucina arabo-sicula, dolci dei monasteri, street food, presidi locali), feste o botteghe tradizionali legate a questa zona, con brevi cenni storici da raccontare.'],
        lingua: [`Frasi e glossario (${s?.lingua || 'lingua'})`, `Scrivi una breve introduzione d'effetto e un mini-glossario dei 6-8 termini architettonici/artistici chiave di queste tappe tradotti e spiegati direttamente in ${s?.lingua || 'Inglese'}.`],
        bambini: ['Coinvolgimento del gruppo', 'Proponi 3 domande-gioco, dettagli visivi da far cercare ("caccia al dettaglio") o spunti interattivi adatti a mantenere alta l\'attenzione del gruppo.']
      };
      const [tit, p] = prompts[b.dataset.tipo];
      esegui(tit, p);
    });

    $('#fAiAsk', dlg).onsubmit = e => {
      e.preventDefault();
      const dom = $('#aiDomanda', dlg).value.trim();
      if (!dom) return;
      esegui(dom.slice(0, 50), dom + `\n(Se utile, aggiungi anche una sintesi pronta da dire in ${s?.lingua || 'Italiano'}).`);
    };

    $$('[data-delai]', dlg).forEach(a => a.onclick = e => {
      e.preventDefault();
      s.appuntiAI.splice(Number(a.dataset.delai), 1);
      if (inDb) save();
      draw();
    });
  };

  dlg.showModal();
  draw();
}
