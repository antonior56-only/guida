/* GuidaPA – Calcolo distanze dal punto d'incontro, verifica fasce orarie di apertura/chiusura
   e ottimizzazione intelligente dell'ordine delle tappe. */

const fmtOrario = m => {
  const mm = ((Math.round(m) % 1440) + 1440) % 1440;
  return String(Math.floor(mm / 60)).padStart(2, '0') + ':' + String(mm % 60).padStart(2, '0');
};

// ---------- Distanza geografica e tempi di spostamento ----------
function distanzaKm(a, b) {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s1 = Math.sin(dLat / 2), s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function stimaSpostamento(a, b) {
  const base = num(db.profilo?.spostamento) || 10;
  const km = distanzaKm(a, b);
  if (km == null) return { min: base, mezzo: '🚶', km: null };
  if (km < 0.13) return { min: 3, mezzo: '🚶', km };
  if (km <= 2.3) {
    // Passo di gruppo turistico nel centro storico (~3.8 km/h con fattore tortuosità vicoli 1.35)
    return { min: Math.max(5, Math.round((km * 1.35 / 3.8) * 60)), mezzo: '🚶', km };
  }
  if (km <= 15) {
    // Trasferimento urbano/suburbano in bus/van (es. Palermo ↔ Monreale o Mondello) + salita/discesa gruppo
    return { min: Math.round(12 + (km * 1.3 / 32) * 60), mezzo: '🚌', km };
  }
  // Trasferimento extraurbano (es. Palermo ↔ Cefalù o Aeroporto)
  return { min: Math.round(15 + (km * 1.2 / 70) * 60), mezzo: '🚌', km };
}

// ---------- Risoluzione coordinate del Punto d'incontro ----------
function risolviPuntoIncontro(s) {
  const testo = String(s?.puntoIncontro || '').trim();
  if (s?.puntoCoords?.lat != null && s?.puntoCoords?.lng != null && (!s.puntoCoords.testo || s.puntoCoords.testo === testo)) {
    return { lat: Number(s.puntoCoords.lat), lng: Number(s.puntoCoords.lng), nome: testo || 'Punto d\'incontro', fonte: 'gps' };
  }
  if (!testo) return null;
  const low = testo.toLowerCase();

  // 1. Ricerca nei luoghi di incontro predefiniti
  const esatto = LUOGHI_INCONTRO.find(l => l.nome.toLowerCase() === low);
  if (esatto) return { ...esatto, fonte: 'predefinito' };

  const parziale = LUOGHI_INCONTRO.find(l => low.includes(l.nome.toLowerCase().split('(')[0].trim()) || l.nome.toLowerCase().includes(low));
  if (parziale) return { ...parziale, fonte: 'predefinito' };

  // 2. Parole chiave frequenti
  const alias = [
    [/porto|marittima|crocier|molo\b/, 'Porto di Palermo – Stazione Marittima'],
    [/aeroporto|falcone|borsellino|punta raisi/, 'Aeroporto Falcone-Borsellino'],
    [/politeama|ruggero settimo/, 'Piazza Politeama (Teatro Politeama)'],
    [/indipendenza/, 'Piazza Indipendenza (Palazzo dei Normanni)'],
    [/porta nuova/, 'Porta Nuova'],
    [/stazione centrale/, 'Stazione Centrale di Palermo'],
    [/des palmes/, 'Grand Hotel et Des Palmes'],
    [/villa igiea/, 'Grand Hotel Villa Igiea'],
    [/foro italico|piazza marina/, 'Piazza Marina / Foro Italico (parcheggio bus)'],
    [/stazione.*cefal|cefal.*stazione/, 'Cefalù – Stazione Ferroviaria'],
    [/lungomare.*cefal|giardina/, 'Cefalù – Lungomare Giardina (parcheggio bus)'],
    [/piazza garibaldi/, 'Cefalù – Piazza Garibaldi']
  ];
  for (const [re, target] of alias) {
    if (re.test(low)) {
      const m = LUOGHI_INCONTRO.find(l => l.nome === target);
      if (m) return { ...m, fonte: 'predefinito' };
    }
  }

  // 3. Ricerca tra i monumenti stessi (es. incontro direttamente in Cattedrale o al Teatro Massimo)
  const sitoMatch = db.siti.find(x => x.lat != null && (x.nome.toLowerCase().includes(low) || low.includes(x.nome.toLowerCase().split('–')[0].trim())));
  if (sitoMatch) return { lat: sitoMatch.lat, lng: sitoMatch.lng, nome: sitoMatch.nome, fonte: 'sito' };

  return null;
}

async function geocodificaIndirizzo(testo, zonaDefault = 'Palermo') {
  const q = String(testo || '').trim();
  if (!q) throw new Error('Scrivi prima il luogo o l\'hotel nel campo Punto d\'incontro');
  if (!navigator.onLine) throw new Error('Sei offline: scegli uno dei punti d\'incontro predefiniti oppure riprova con connessione attiva');
  const haCitta = /palermo|cefal|monreale|mondello|sicilia/i.test(q);
  const query = haCitta ? q : `${q}, ${zonaDefault}, Sicilia`;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=it&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'it' } });
  const arr = await res.json().catch(() => []);
  if (!Array.isArray(arr) || !arr.length) throw new Error(`Indirizzo non trovato per "${q}". Prova a specificare anche la città (es. "${q}, Palermo").`);
  return { lat: Number(arr[0].lat), lng: Number(arr[0].lon), display: arr[0].display_name };
}

// ---------- Analisi fasce orarie di apertura e chiusura ----------
function parseFasceOrarie(str) {
  const out = [];
  const re = /(\d{1,2})[:.](\d{2})\s*[-–/]\s*(\d{1,2})[:.](\d{2})/g;
  let m;
  while ((m = re.exec(String(str || '')))) {
    const a = Number(m[1]) * 60 + Number(m[2]);
    const b = Number(m[3]) * 60 + Number(m[4]);
    if (b > a) out.push([a, b]);
  }
  return out.sort((x, y) => x[0] - y[0]);
}

function fasceOrarieSito(st, dataISO, flagFestivo) {
  if (!st) return { statoGiorno: 'sempre', fasce: [[0, 1440]], testo: '' };
  if (dataISO) {
    const g = new Date(dataISO + 'T00:00').getDay();
    if ((st.chiuso || []).includes(g)) {
      return { statoGiorno: 'chiuso_giorno', fasce: [], testo: `Chiuso di ${GIORNI[g]}` };
    }
  }
  const isFest = Boolean(flagFestivo || (dataISO && new Date(dataISO + 'T00:00').getDay() === 0));
  const rawFest = String(st.orariFestivi ?? '').trim();
  const rawFer = String(st.orariFeriali ?? '').trim();
  const raw = isFest && rawFest !== '' ? rawFest : rawFer;
  if (!raw) return { statoGiorno: 'sempre', fasce: [[0, 1440]], testo: 'Sempre accessibile' };
  if (/^chius/i.test(raw)) return { statoGiorno: 'chiuso_festivo', fasce: [], testo: isFest ? 'Chiuso nei festivi' : 'Chiuso' };
  const fasce = parseFasceOrarie(raw);
  if (!fasce.length) return { statoGiorno: 'sempre', fasce: [[0, 1440]], testo: raw };
  return { statoGiorno: 'fasce', fasce, testo: raw, isFest };
}

// ---------- Simulazione scaletta oraria del percorso ----------
function simulaScaletta(s, tappeIds) {
  const ids = tappeIds || s.tappe || [];
  const startCoord = risolviPuntoIncontro(s);
  let clock = minuti(s.ora || '09:00');
  let prevCoord = startCoord;
  let totSpost = 0;
  let totAttesa = 0;
  let violazioni = 0;
  let penalitaOrario = 0;
  let cambiZona = 0;
  let prevZona = null;

  const steps = ids.map((id, idx) => {
    const st = sito(id) || { id, nome: id, durata: 30, zona: '' };
    const dur = num(st.durata) || 30;
    let sp = { min: 0, mezzo: '🚶', km: 0 };
    if (idx === 0) {
      if (prevCoord) {
        const d0 = distanzaKm(prevCoord, st);
        sp = d0 != null && d0 < 0.15 ? { min: 0, mezzo: '🚶', km: d0 } : stimaSpostamento(prevCoord, st);
      }
    } else {
      sp = stimaSpostamento(prevCoord, st);
    }
    totSpost += sp.min;
    if (prevZona && st.zona && st.zona !== prevZona) cambiZona++;
    if (st.zona) prevZona = st.zona;

    const arrivo = clock + sp.min;
    const info = fasceOrarieSito(st, s.data, s.festivo);
    let inizio = arrivo;
    let fine = inizio + dur;
    let esito = 'ok';
    let notaOrario = '';

    if (!info.fasce.length) {
      esito = 'chiuso';
      violazioni++;
      penalitaOrario += 100000;
      notaOrario = `🚫 ${info.testo}`;
    } else if (info.statoGiorno === 'fasce') {
      // Verifica se rientra in una fascia aperta
      const fasciaOk = info.fasce.find(([a, b]) => arrivo >= a && arrivo + dur <= b);
      if (fasciaOk) {
        const margine = fasciaOk[1] - (arrivo + dur);
        if (margine <= 15) notaOrario = `⚠️ Chiude alle ${fmtOrario(fasciaOk[1])} (margine ${margine}')`;
        else notaOrario = `✅ Aperto (${info.testo})`;
      } else {
        // Verifica se arriva poco prima dell'apertura (es. fine pausa pranzo entro 40 min)
        const prossima = info.fasce.find(([a, b]) => arrivo < a && (a - arrivo) <= 40 && (a + dur) <= b);
        if (prossima) {
          const att = prossima[0] - arrivo;
          totAttesa += att;
          inizio = prossima[0];
          fine = inizio + dur;
          esito = 'attesa';
          notaOrario = `⏳ Apre alle ${fmtOrario(prossima[0])} (attesa ${att}')`;
        } else {
          esito = 'fuori_orario';
          violazioni++;
          // Calcola di quanti minuti sfora per graduare il meno peggio se nessuna combinazione è perfetta
          const sforo = Math.min(...info.fasce.map(([a, b]) => (arrivo < a ? a - arrivo : Math.max(0, (arrivo + dur) - b))));
          penalitaOrario += 100000 + sforo * 50;
          notaOrario = `⏰ Fuori orario! Apertura: ${info.testo}`;
        }
      }
    }

    clock = fine;
    if (st.lat != null && st.lng != null) prevCoord = st;
    return { idx, id, st, spost: sp, arrivo, inizio, fine, esito, notaOrario, orariTesto: info.testo };
  });

  const score = penalitaOrario + cambiZona * 90 + totSpost * 10 + totAttesa * 8;
  return { steps, startCoord, totSpost, totAttesa, fineTotale: clock, violazioni, score };
}

// ---------- Ottimizzazione ordine tappe (Branch-and-Bound esatto fino a 8 tappe) ----------
function ottimizzaOrdineTappe(s) {
  const tappe = [...(s.tappe || [])];
  if (tappe.length <= 1) return { ordine: tappe, simulazione: simulaScaletta(s, tappe), cambiato: false };

  const attualeSim = simulaScaletta(s, tappe);
  let bestOrdine = tappe;
  let bestScore = attualeSim.score;

  if (tappe.length <= 8) {
    // Ricerca esatta con potatura per garantire il percorso migliore per vicinanza + orari di apertura
    const n = tappe.length;
    const usati = new Array(n).fill(false);
    const corrente = [];

    const esplora = () => {
      if (corrente.length === n) {
        const sim = simulaScaletta(s, corrente);
        if (sim.score < bestScore - 0.5) {
          bestScore = sim.score;
          bestOrdine = [...corrente];
        }
        return;
      }
      // Valuta il parziale per potare subito rami già peggiori del miglior risultato trovato
      if (corrente.length >= 2) {
        const parz = simulaScaletta(s, corrente);
        if (parz.score >= bestScore) return;
      }
      for (let i = 0; i < n; i++) {
        if (usati[i]) continue;
        usati[i] = true;
        corrente.push(tappe[i]);
        esplora();
        corrente.pop();
        usati[i] = false;
      }
    };
    esplora();
  } else {
    // Per itinerari molto lunghi (>8 tappe): euristica greedy vicinanza + urgenza chiusura
    const restanti = [...tappe];
    const ord = [];
    while (restanti.length) {
      let bestIdx = 0, minCost = Infinity;
      for (let i = 0; i < restanti.length; i++) {
        const cand = [...ord, restanti[i]];
        const sim = simulaScaletta(s, cand);
        const st = sito(restanti[i]);
        const info = fasceOrarieSito(st, s.data, s.festivo);
        const primaChiusura = info.fasce.length ? info.fasce[0][1] : 1440;
        const urgenza = primaChiusura < 1440 ? (primaChiusura - sim.fineTotale) * 0.15 : 0;
        const c = sim.score + urgenza;
        if (c < minCost) { minCost = c; bestIdx = i; }
      }
      ord.push(restanti.splice(bestIdx, 1)[0]);
    }
    const simOrd = simulaScaletta(s, ord);
    if (simOrd.score < bestScore) bestOrdine = ord;
  }

  const cambiato = bestOrdine.some((id, i) => id !== tappe[i]);
  return { ordine: bestOrdine, simulazione: simulaScaletta(s, bestOrdine), prima: attualeSim, cambiato };
}

function urlGoogleMapsPercorso(s) {
  const tappe = (s.tappe || []).map(sito).filter(Boolean);
  if (!tappe.length) return '';
  const start = risolviPuntoIncontro(s);
  const ptStr = p => (p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : encodeURIComponent(`${p.nome}, ${p.zona || 'Sicilia'}`));
  const punti = [...(start ? [ptStr(start)] : (s.puntoIncontro ? [encodeURIComponent(s.puntoIncontro)] : [])), ...tappe.map(ptStr)];
  if (punti.length === 1) return `https://www.google.com/maps/search/?api=1&query=${punti[0]}`;
  const origin = punti[0];
  const destination = punti[punti.length - 1];
  const waypoints = punti.slice(1, -1).join('|');
  const zoneUniche = new Set(tappe.map(t => t.zona));
  const mode = zoneUniche.size > 1 ? 'driving' : 'walking';
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints ? '&waypoints=' + waypoints : ''}&travelmode=${mode}`;
}
