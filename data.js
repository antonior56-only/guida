// Dati iniziali di GuidaPA.
// Tariffe, costi d'ingresso, giorni di chiusura e fasce orarie sono INDICATIVI:
// verificali sui siti ufficiali (icona 🌐) e aggiornali dalla schermata "Siti".

const LUOGHI_INCONTRO = [
  { nome: 'Porto di Palermo – Stazione Marittima', lat: 38.1287, lng: 13.3647, zona: 'Palermo' },
  { nome: 'Piazza Politeama (Teatro Politeama)', lat: 38.1251, lng: 13.3563, zona: 'Palermo' },
  { nome: 'Teatro Massimo (Piazza Verdi)', lat: 38.1203, lng: 13.3572, zona: 'Palermo' },
  { nome: 'Piazza Indipendenza (Palazzo dei Normanni)', lat: 38.1109, lng: 13.3518, zona: 'Palermo' },
  { nome: 'Porta Nuova', lat: 38.1119, lng: 13.3526, zona: 'Palermo' },
  { nome: 'Quattro Canti', lat: 38.1157, lng: 13.3614, zona: 'Palermo' },
  { nome: 'Piazza Marina / Foro Italico (parcheggio bus)', lat: 38.1180, lng: 13.3688, zona: 'Palermo' },
  { nome: 'Stazione Centrale di Palermo', lat: 38.1098, lng: 13.3675, zona: 'Palermo' },
  { nome: 'Grand Hotel et Des Palmes', lat: 38.1235, lng: 13.3592, zona: 'Palermo' },
  { nome: 'Grand Hotel Villa Igiea', lat: 38.1469, lng: 13.3698, zona: 'Palermo' },
  { nome: 'NH Palermo (Foro Italico)', lat: 38.1150, lng: 13.3732, zona: 'Palermo' },
  { nome: 'Aeroporto Falcone-Borsellino', lat: 38.1824, lng: 13.0998, zona: 'Palermo' },
  { nome: 'Monreale – Parcheggio Bus / Piazzale Candido', lat: 38.0798, lng: 13.2905, zona: 'Monreale' },
  { nome: 'Monreale – Piazza Guglielmo II', lat: 38.0819, lng: 13.2922, zona: 'Monreale' },
  { nome: 'Cefalù – Piazza Duomo', lat: 38.0396, lng: 14.0229, zona: 'Cefalù' },
  { nome: 'Cefalù – Piazza Garibaldi', lat: 38.0365, lng: 14.0216, zona: 'Cefalù' },
  { nome: 'Cefalù – Lungomare Giardina (parcheggio bus)', lat: 38.0348, lng: 14.0145, zona: 'Cefalù' },
  { nome: 'Cefalù – Stazione Ferroviaria', lat: 38.0335, lng: 14.0191, zona: 'Cefalù' }
];

const DEFAULT_DB = {
  versione: 4,
  seq: 1, // contatore numerazione preventivi
  updatedAt: '',
  profilo: {
    nome: '',
    piva: '',
    cf: '',
    tesserino: '',
    telefono: '',
    email: '',
    iban: '',
    tariffe: { mezza: 180, intera: 300, oraExtra: 45, lingua: 30, festivoPct: 20 },
    giorniPagamento: 30,
    spostamento: 10, // minuti medi minimi di spostamento a piedi tra tappe
    condizioni:
      "Il prezzo si riferisce al solo servizio di guida, salvo diversa indicazione. " +
      "Ingressi, auricolari e trasporti esclusi se non specificato. " +
      "Cancellazione gratuita fino a 48 ore prima del servizio; successivamente verrà addebitato il 50%. " +
      "Pagamento tramite bonifico bancario entro i termini concordati."
  },
  agenzie: [],
  servizi: [],
  // chiuso: giorni della settimana di chiusura abituale (0 = domenica ... 6 = sabato)
  // orariFeriali / orariFestivi: es. "08:30-16:30" o "09:00-13:00, 15:30-18:30" (vuoto = sempre accessibile; "chiuso" = non visitabile)
  siti: [
    { id: 'normanni', zona: 'Palermo', nome: 'Palazzo dei Normanni – Cappella Palatina', durata: 75, costo: 0, coperto: true, lat: 38.1111, lng: 13.3535, orariFeriali: '08:30-16:30', orariFestivi: '08:30-12:30', url: 'https://www.federicosecondo.org', chiuso: [], note: 'Verificare slot/prenotazione. Domenica sospensione visite durante messa (ca. 09:45-11:00). Abbigliamento consono.' },
    { id: 'cattedrale', zona: 'Palermo', nome: 'Cattedrale di Palermo', durata: 45, costo: 0, coperto: true, lat: 38.1145, lng: 13.3561, orariFeriali: '09:00-17:30', orariFestivi: '09:00-13:00, 16:00-18:00', url: 'https://www.cattedrale.palermo.it', chiuso: [], note: 'Biglietti separati per tetti (scoperti), tesoro, cripta. Possibili funzioni religiose.' },
    { id: 'quattrocanti', zona: 'Palermo', nome: 'Quattro Canti e Piazza Pretoria', durata: 20, costo: 0, coperto: false, lat: 38.1157, lng: 13.3614, orariFeriali: '', orariFestivi: '', url: '', altCoperto: ['gesu', 'santacita', 'martorana'], chiuso: [], note: 'Sosta racconto e foto all\'aperto (sempre accessibile).' },
    { id: 'martorana', zona: 'Palermo', nome: 'Martorana e San Cataldo', durata: 40, costo: 0, coperto: true, lat: 38.1148, lng: 13.3627, orariFeriali: '09:30-13:00, 15:30-17:30', orariFestivi: '10:30-13:00', url: 'https://turismo.comune.palermo.it', chiuso: [], note: 'Ingressi separati. Domenica mattina funzioni di rito bizantino.' },
    { id: 'gesu', zona: 'Palermo', nome: 'Chiesa del Gesù (Casa Professa)', durata: 35, costo: 0, coperto: true, lat: 38.1128, lng: 13.3612, orariFeriali: '09:30-16:30', orariFestivi: '09:30-12:30', url: 'https://www.casaprofessa.it', chiuso: [], note: 'Capolavoro barocco a due passi da Ballarò. Ottima tappa al coperto.' },
    { id: 'santacita', zona: 'Palermo', nome: 'Oratori del Serpotta (Santa Cita / San Lorenzo)', durata: 45, costo: 0, coperto: true, lat: 38.1211, lng: 13.3638, orariFeriali: '10:00-17:30', orariFestivi: '10:00-17:30', url: 'https://www.amicimuseisiciliani.it', chiuso: [], note: 'Stucchi di Giacomo Serpotta. San Lorenzo è in via Immacolatella (Kalsa).' },
    { id: 'ballaro', zona: 'Palermo', nome: 'Mercato di Ballarò', durata: 40, costo: 0, coperto: false, lat: 38.1110, lng: 13.3608, orariFeriali: '08:00-14:30', orariFestivi: '08:30-13:30', url: '', altCoperto: ['gesu', 'cattedrale', 'normanni'], chiuso: [], note: 'Più vivo al mattino. Alto rischio dispersione: fissare punto di raccolta.' },
    { id: 'capo', zona: 'Palermo', nome: 'Mercato del Capo', durata: 30, costo: 0, coperto: false, lat: 38.1180, lng: 13.3555, orariFeriali: '08:00-14:00', orariFestivi: '08:30-13:00', url: '', altCoperto: ['massimo', 'salinas', 'santacita'], chiuso: [], note: 'Più vivo al mattino. Fissare punto di raccolta.' },
    { id: 'vucciria', zona: 'Palermo', nome: 'Vucciria', durata: 25, costo: 0, coperto: false, lat: 38.1176, lng: 13.3647, orariFeriali: '', orariFestivi: '', url: '', altCoperto: ['santacita', 'salinas', 'gam'], chiuso: [], note: '' },
    { id: 'massimo', zona: 'Palermo', nome: 'Teatro Massimo (visita interna)', durata: 40, costo: 0, coperto: true, lat: 38.1203, lng: 13.3572, orariFeriali: '09:30-18:00', orariFestivi: '09:30-18:00', url: 'https://www.teatromassimo.it', chiuso: [], note: 'Visite interne a orari fissi, verificare prove/spettacoli.' },
    { id: 'politeama', zona: 'Palermo', nome: 'Politeama e via Libertà', durata: 20, costo: 0, coperto: false, lat: 38.1251, lng: 13.3563, orariFeriali: '', orariFestivi: '', url: '', altCoperto: ['massimo', 'salinas'], chiuso: [], note: 'Passeggiata esterna.' },
    { id: 'zisa', zona: 'Palermo', nome: 'Castello della Zisa', durata: 45, costo: 0, coperto: true, lat: 38.1167, lng: 13.3411, orariFeriali: '09:00-18:30', orariFestivi: '09:00-13:00', url: 'https://www.coopculture.it', chiuso: [1], note: 'Serve bus o taxi dal centro.' },
    { id: 'eremiti', zona: 'Palermo', nome: 'San Giovanni degli Eremiti', durata: 30, costo: 0, coperto: false, lat: 38.1095, lng: 13.3547, orariFeriali: '09:00-18:30', orariFestivi: '09:00-13:00', url: 'https://www.coopculture.it', altCoperto: ['normanni', 'gesu', 'zisa'], chiuso: [], note: 'Chiostro e giardino arabo all\'aperto.' },
    { id: 'salinas', zona: 'Palermo', nome: 'Museo Archeologico Salinas', durata: 60, costo: 0, coperto: true, lat: 38.1210, lng: 13.3606, orariFeriali: '09:00-18:30', orariFestivi: '09:00-13:00', url: 'https://www.coopculture.it', chiuso: [1], note: 'Ottima alternativa museale al coperto.' },
    { id: 'abatellis', zona: 'Palermo', nome: 'Palazzo Abatellis', durata: 60, costo: 0, coperto: true, lat: 38.1165, lng: 13.3693, orariFeriali: '09:00-18:00', orariFestivi: '09:00-13:00', url: 'https://www.coopculture.it', chiuso: [1], note: 'Annunziata di Antonello da Messina e Trionfo della Morte.' },
    { id: 'gam', zona: 'Palermo', nome: 'Galleria d\'Arte Moderna (GAM)', durata: 50, costo: 0, coperto: true, lat: 38.1151, lng: 13.3659, orariFeriali: '09:30-18:30', orariFestivi: '09:30-18:30', url: 'https://www.gampalermo.it', chiuso: [1], note: 'Complesso monumentale Sant\'Anna, al coperto.' },
    { id: 'palazzomirto', zona: 'Palermo', nome: 'Palazzo Mirto', durata: 45, costo: 0, coperto: true, lat: 38.1169, lng: 13.3676, orariFeriali: '09:00-18:00', orariFestivi: '09:00-13:00', url: 'https://www.coopculture.it', chiuso: [1], note: 'Dimora storica arredata alla Kalsa.' },
    { id: 'cappuccini', zona: 'Palermo', nome: 'Catacombe dei Cappuccini', durata: 40, costo: 0, coperto: true, lat: 38.1117, lng: 13.3396, orariFeriali: '09:00-17:00', orariFestivi: '09:00-17:00', url: 'https://www.catacombefraticappuccini.com', chiuso: [], note: 'Biglietti solo in cassa sul posto. Avvisare il gruppo sul contenuto; foto vietate.' },
    { id: 'mondello', zona: 'Palermo', nome: 'Mondello', durata: 60, costo: 0, coperto: false, lat: 38.2008, lng: 13.3262, orariFeriali: '', orariFestivi: '', url: '', altCoperto: ['palazzomirto', 'abatellis', 'salinas'], chiuso: [], note: 'Trasferimento bus. Sconsigliato con pioggia/vento forte.' },
    { id: 'monreale', zona: 'Monreale', nome: 'Duomo di Monreale', durata: 60, costo: 0, coperto: true, lat: 38.0819, lng: 13.2922, orariFeriali: '09:00-12:45, 14:00-17:00', orariFestivi: '14:00-17:00', url: 'https://www.duomomonreale.com', chiuso: [], note: 'Domenica mattina sospese visite turistiche per messe. Parcheggio bus dedicato.' },
    { id: 'chiostro', zona: 'Monreale', nome: 'Chiostro di Monreale', durata: 30, costo: 0, coperto: false, lat: 38.0814, lng: 13.2918, orariFeriali: '09:00-18:30', orariFestivi: '09:00-13:00', url: 'https://www.coopculture.it', altCoperto: ['museomonreale', 'monreale'], chiuso: [], note: 'Porticato aperto: esposto a pioggia e vento.' },
    { id: 'museomonreale', zona: 'Monreale', nome: 'Museo Diocesano di Monreale', durata: 45, costo: 0, coperto: true, lat: 38.0820, lng: 13.2927, orariFeriali: '09:30-13:00, 14:30-17:00', orariFestivi: '14:30-17:00', url: 'https://www.diocesimonreale.it', chiuso: [], note: 'Ottima estensione al coperto accanto al Duomo.' },
    { id: 'duomocefalu', zona: 'Cefalù', nome: 'Duomo di Cefalù', durata: 40, costo: 0, coperto: true, lat: 38.0396, lng: 14.0229, orariFeriali: '08:30-13:00, 15:30-18:30', orariFestivi: '08:30-10:45, 15:30-18:00', url: 'https://duomocefalu.it', chiuso: [], note: 'Abbigliamento consono. Verificare orari messe domenicali e percorsi torri/chiostro.' },
    { id: 'corsoruggero', zona: 'Cefalù', nome: 'Corso Ruggero (passeggiata esterna)', durata: 20, costo: 0, coperto: false, lat: 38.0383, lng: 14.0218, orariFeriali: '', orariFestivi: '', url: '', altCoperto: ['osteriomagno', 'mandralisca', 'duomocefalu'], chiuso: [], note: '' },
    { id: 'osteriomagno', zona: 'Cefalù', nome: 'Osterio Magno (sale interne)', durata: 30, costo: 0, coperto: true, lat: 38.0378, lng: 14.0216, orariFeriali: '10:00-13:00, 15:30-18:30', orariFestivi: '10:00-13:00, 15:30-18:30', url: 'https://duomocefalu.it', chiuso: [], note: 'Residenza normanna su Corso Ruggero, verificare mostre/orari.' },
    { id: 'lavatoio', zona: 'Cefalù', nome: 'Lavatoio medievale', durata: 15, costo: 0, coperto: false, lat: 38.0397, lng: 14.0201, orariFeriali: '09:00-19:00', orariFestivi: '09:00-19:00', url: 'https://visitcefalu.com', altCoperto: ['mandralisca', 'osteriomagno'], chiuso: [], note: 'Scalinata in pietra scivolosa in caso di pioggia; attenzione a mobilità ridotta.' },
    { id: 'mandralisca', zona: 'Cefalù', nome: 'Museo Mandralisca', durata: 35, costo: 0, coperto: true, lat: 38.0395, lng: 14.0215, orariFeriali: '09:00-19:00', orariFestivi: '09:00-19:00', url: 'https://www.fondazionemandralisca.it', chiuso: [], note: "Ritratto d'ignoto di Antonello da Messina. Perfetto in caso di maltempo." },
    { id: 'teatrocicero', zona: 'Cefalù', nome: 'Teatro Comunale Salvatore Cicero', durata: 25, costo: 0, coperto: true, lat: 38.0389, lng: 14.0228, orariFeriali: '09:30-13:00, 16:00-19:00', orariFestivi: '10:00-13:00', url: 'https://visitcefalu.com', chiuso: [], note: 'Gioiello ottocentesco al coperto, verificare apertura effettiva.' },
    { id: 'rocca', zona: 'Cefalù', nome: 'Rocca e Tempio di Diana', durata: 120, costo: 0, coperto: false, lat: 38.0373, lng: 14.0235, orariFeriali: '08:30-16:30', orariFestivi: '08:30-16:30', url: 'https://visitcefalu.com', altCoperto: ['mandralisca', 'osteriomagno', 'duomocefalu'], chiuso: [], note: 'Ultimo ingresso 1-2h prima della chiusura (estivo fino alle 19). Solo gruppi allenati.' },
    { id: 'lungomare', zona: 'Cefalù', nome: 'Lungomare e porticciolo', durata: 20, costo: 0, coperto: false, lat: 38.0402, lng: 14.0197, orariFeriali: '', orariFestivi: '', url: '', altCoperto: ['mandralisca', 'teatrocicero'], chiuso: [], note: 'Buon punto di raccolta finale col bel tempo.' }
  ]
};
