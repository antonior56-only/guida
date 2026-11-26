# 🧭 GuidaPA

Applicazione web progressiva (PWA) per guida turistica operante tra **Palermo, Monreale e Cefalù**: gestione delle richieste provenienti dalle agenzie (WhatsApp/email), preventivi PDF, agenda, scadenziario incassi e **Modalità Tour sul campo** (anche offline).

📖 **[Scarica il Manuale d'Uso Completo in PDF](Manuale_Uso_GuidaPA.pdf)** *(oppure apri la [versione web stampabile](manuale.html))*

---

## Funzionalità principali
- **📥 Gestione proposte agenzie & Preventivi**: incolla il messaggio WhatsApp/email originale, calcola il compenso dai listini personalizzati per agenzia, verifica conflitti d'orario e chiusure settimanali dei monumenti, genera il preventivo pronto per WhatsApp o in PDF.
- **🚶 Modalità Tour sul campo (offline-ready)**: timeline live con ricalcolo fine prevista e semaforo sul **margine di rientro nave/volo**, conta partecipanti rapida (`−`/`+`) e nominale, messaggi WhatsApp precompilati per l'autista, registro spese anticipate, diario imprevisti, emergenze e **Report finale per l'agenzia**.
- **🔳 Codici QR offline per i turisti**: punto di ritrovo su mappa e contatto WhatsApp diretto della guida inquadrabili dallo schermo dello smartphone senza installare app.
- **🌧️ Pulsante Cattivo Tempo (Piano Pioggia)**: sostituisce in un clic le tappe all'aperto (☀️) con alternative al coperto (🏛️) nella stessa zona (escludendo i musei chiusi in quel giorno), con possibilità di ripristinare il percorso originale se torna il sole.
- **☁️ Sincronizzazione Cloud con [JSONBin.io](https://jsonbin.io/app/app/api-keys)**: mantiene allineati PC e smartphone salvando comunque ogni modifica in locale quando sei senza segnale.
- **✨ Assistente AI con [Google Gemini](https://aistudio.google.com/apikey)**: approfondimenti storici, curiosità, ponti culturali col paese del gruppo, glossari in lingua e risposte rapide alle domande dei turisti, salvabili offline dentro il servizio.

---

## Pubblicazione gratuita su GitHub Pages
1. Crea un nuovo repository pubblico su GitHub (es. `guidapa`).
2. Carica tutti i file di questa cartella (`Add file → Upload files` e trascina i file, incluso `.nojekyll`).
3. Vai in **Settings → Pages**:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` / `/ (root)` → **Save** *(in alternativa è già predisposto anche il workflow automatico `.github/workflows/pages.yml` per `GitHub Actions`)*.
4. Dopo 1–2 minuti l'app sarà raggiungibile su `https://<tuo-utente>.github.io/guidapa/` e installabile sulla schermata Home di Android (Chrome) e iPhone (Safari).

> 🔒 **Sicurezza e Privacy:** le chiavi API personali di JSONBin.io e Google Gemini vengono salvate esclusivamente nel `localStorage` del tuo browser (`guidapa_secrets_v1`). Non sono mai presenti nel codice sorgente né nei file di backup esportati.
