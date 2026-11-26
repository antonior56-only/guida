// Dati iniziali di GuidaPA.
// Tariffe, costi d'ingresso e giorni di chiusura sono SEGNAPOSTO: aggiornali dalle schermate
// "Profilo e dati" e "Siti" con i valori reali e verificati.
const DEFAULT_DB = {
  versione: 2,
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
    spostamento: 10, // minuti medi di spostamento a piedi tra una tappa e l'altra
    condizioni:
      "Il prezzo si riferisce al solo servizio di guida, salvo diversa indicazione. " +
      "Ingressi, auricolari e trasporti esclusi se non specificato. " +
      "Cancellazione gratuita fino a 48 ore prima del servizio; successivamente verrà addebitato il 50%. " +
      "Pagamento tramite bonifico bancario entro i termini concordati."
  },
  agenzie: [],
  servizi: [],
  // chiuso: giorni della settimana di chiusura abituale (0 = domenica ... 6 = sabato)
  // coperto: true se la visita si svolge prevalentemente al chiuso (adatta in caso di pioggia/maltempo)
  // altCoperto: id suggeriti come prima scelta al coperto in caso di maltempo
  siti: [
    { id: 'normanni', zona: 'Palermo', nome: 'Palazzo dei Normanni – Cappella Palatina', durata: 75, costo: 0, coperto: true, chiuso: [], note: 'Verificare slot/prenotazione. Controllo sicurezza. Abbigliamento consono.' },
    { id: 'cattedrale', zona: 'Palermo', nome: 'Cattedrale di Palermo', durata: 45, costo: 0, coperto: true, chiuso: [], note: 'Biglietti separati per tetti (scoperti), tesoro, cripta. Possibili funzioni religiose.' },
    { id: 'quattrocanti', zona: 'Palermo', nome: 'Quattro Canti e Piazza Pretoria', durata: 20, costo: 0, coperto: false, altCoperto: ['gesu', 'santacita', 'martorana'], chiuso: [], note: 'Sosta racconto e foto all\'aperto.' },
    { id: 'martorana', zona: 'Palermo', nome: 'Martorana e San Cataldo', durata: 40, costo: 0, coperto: true, chiuso: [], note: 'Ingressi separati.' },
    { id: 'gesu', zona: 'Palermo', nome: 'Chiesa del Gesù (Casa Professa)', durata: 35, costo: 0, coperto: true, chiuso: [], note: 'Capolavoro barocco a due passi da Ballarò. Ottima tappa al coperto.' },
    { id: 'santacita', zona: 'Palermo', nome: 'Oratori del Serpotta (Santa Cita / San Lorenzo)', durata: 45, costo: 0, coperto: true, chiuso: [], note: 'Stucchi di Giacomo Serpotta. Ideale visita al chiuso in centro storico.' },
    { id: 'ballaro', zona: 'Palermo', nome: 'Mercato di Ballarò', durata: 40, costo: 0, coperto: false, altCoperto: ['gesu', 'cattedrale', 'normanni'], chiuso: [], note: 'Street food. Alto rischio dispersione: fissare punto di raccolta.' },
    { id: 'capo', zona: 'Palermo', nome: 'Mercato del Capo', durata: 30, costo: 0, coperto: false, altCoperto: ['massimo', 'salinas', 'santacita'], chiuso: [], note: 'Fissare punto di raccolta.' },
    { id: 'vucciria', zona: 'Palermo', nome: 'Vucciria', durata: 25, costo: 0, coperto: false, altCoperto: ['santacita', 'salinas', 'gam'], chiuso: [], note: '' },
    { id: 'massimo', zona: 'Palermo', nome: 'Teatro Massimo (visita interna)', durata: 40, costo: 0, coperto: true, chiuso: [], note: 'Visite interne a orari fissi, verificare prove/spettacoli.' },
    { id: 'politeama', zona: 'Palermo', nome: 'Politeama e via Libertà', durata: 20, costo: 0, coperto: false, altCoperto: ['massimo', 'salinas'], chiuso: [], note: 'Passeggiata esterna.' },
    { id: 'zisa', zona: 'Palermo', nome: 'Castello della Zisa', durata: 45, costo: 0, coperto: true, chiuso: [], note: 'Serve bus o taxi dal centro.' },
    { id: 'eremiti', zona: 'Palermo', nome: 'San Giovanni degli Eremiti', durata: 30, costo: 0, coperto: false, altCoperto: ['normanni', 'gesu', 'zisa'], chiuso: [], note: 'Chiostro e giardino arabo all\'aperto.' },
    { id: 'salinas', zona: 'Palermo', nome: 'Museo Archeologico Salinas', durata: 60, costo: 0, coperto: true, chiuso: [1], note: 'Ottima alternativa museale al coperto.' },
    { id: 'abatellis', zona: 'Palermo', nome: 'Palazzo Abatellis', durata: 60, costo: 0, coperto: true, chiuso: [1], note: 'Annunziata di Antonello da Messina e Trionfo della Morte.' },
    { id: 'gam', zona: 'Palermo', nome: 'Galleria d\'Arte Moderna (GAM)', durata: 50, costo: 0, coperto: true, chiuso: [1], note: 'Complesso monumentale Sant\'Anna, al coperto.' },
    { id: 'palazzomirto', zona: 'Palermo', nome: 'Palazzo Mirto', durata: 45, costo: 0, coperto: true, chiuso: [1], note: 'Dimora storica arredata alla Kalsa.' },
    { id: 'cappuccini', zona: 'Palermo', nome: 'Catacombe dei Cappuccini', durata: 40, costo: 0, coperto: true, chiuso: [], note: 'Avvisare il gruppo sul contenuto (resti umani). Foto vietate.' },
    { id: 'mondello', zona: 'Palermo', nome: 'Mondello', durata: 60, costo: 0, coperto: false, altCoperto: ['palazzomirto', 'abatellis', 'salinas'], chiuso: [], note: 'Trasferimento bus. Sconsigliato con pioggia/vento forte.' },
    { id: 'monreale', zona: 'Monreale', nome: 'Duomo di Monreale', durata: 60, costo: 0, coperto: true, chiuso: [], note: 'Parcheggio bus dedicato. Abbigliamento consono.' },
    { id: 'chiostro', zona: 'Monreale', nome: 'Chiostro di Monreale', durata: 30, costo: 0, coperto: false, altCoperto: ['museomonreale', 'monreale'], chiuso: [], note: 'Porticato aperto: esposto a pioggia e vento.' },
    { id: 'museomonreale', zona: 'Monreale', nome: 'Museo Diocesano di Monreale', durata: 45, costo: 0, coperto: true, chiuso: [], note: 'Ottima estensione al coperto accanto al Duomo.' },
    { id: 'duomocefalu', zona: 'Cefalù', nome: 'Duomo di Cefalù', durata: 40, costo: 0, coperto: true, chiuso: [], note: 'Abbigliamento consono. Possibili funzioni.' },
    { id: 'corsoruggero', zona: 'Cefalù', nome: 'Corso Ruggero (passeggiata esterna)', durata: 20, costo: 0, coperto: false, altCoperto: ['osteriomagno', 'mandralisca', 'duomocefalu'], chiuso: [], note: '' },
    { id: 'osteriomagno', zona: 'Cefalù', nome: 'Osterio Magno (sale interne)', durata: 30, costo: 0, coperto: true, chiuso: [], note: 'Residenza normanna su Corso Ruggero, verificare mostre/orari.' },
    { id: 'lavatoio', zona: 'Cefalù', nome: 'Lavatoio medievale', durata: 15, costo: 0, coperto: false, altCoperto: ['mandralisca', 'osteriomagno'], chiuso: [], note: 'Scalinata in pietra scivolosa in caso di pioggia; attenzione a mobilità ridotta.' },
    { id: 'mandralisca', zona: 'Cefalù', nome: 'Museo Mandralisca', durata: 35, costo: 0, coperto: true, chiuso: [], note: "Ritratto d'ignoto di Antonello da Messina. Perfetto in caso di maltempo." },
    { id: 'teatrocicero', zona: 'Cefalù', nome: 'Teatro Comunale Salvatore Cicero', durata: 25, costo: 0, coperto: true, chiuso: [], note: 'Gioiello ottocentesco al coperto, verificare apertura.' },
    { id: 'rocca', zona: 'Cefalù', nome: 'Rocca e Tempio di Diana', durata: 120, costo: 0, coperto: false, altCoperto: ['mandralisca', 'osteriomagno', 'duomocefalu'], chiuso: [], note: 'Solo gruppi allenati. Da evitare con pioggia, vento o caldo estremo.' },
    { id: 'lungomare', zona: 'Cefalù', nome: 'Lungomare e porticciolo', durata: 20, costo: 0, coperto: false, altCoperto: ['mandralisca', 'teatrocicero'], chiuso: [], note: 'Buon punto di raccolta finale col bel tempo.' }
  ]
};
