# jrny

Applicazione web per pianificare viaggi in gruppo con itinerario giornaliero, wishlist e gestione budget.

## Setup rapido

### 1. Configura le variabili d'ambiente
```bash
cp .env.example .env
```
Modifica `.env` con i tuoi valori (soprattutto `JWT_SECRET` e `POSTGRES_PASSWORD`).

### 2. Avvia l'applicazione
```bash
docker compose up --build -d
```
Il primo avvio richiede qualche minuto per compilare le immagini.

### 3. Accedi all'app
Apri il browser su: **http://localhost:8090**

---

## Comandi utili

### Visualizza i log in tempo reale
```bash
docker compose logs -f
# oppure solo un servizio:
docker compose logs -f server
docker compose logs -f client
```

### Ferma l'applicazione
```bash
docker compose down
# Per eliminare anche i volumi (ATTENZIONE: cancella i dati):
docker compose down -v
```

### Riavvia dopo modifiche al codice
```bash
docker compose up --build -d
```

### Backup del database
```bash
docker compose exec db pg_dump -U tp_user jrny > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Ripristino da backup
```bash
cat backup.sql | docker compose exec -T db psql -U tp_user jrny
```

### Accedi alla shell del database
```bash
docker compose exec db psql -U tp_user jrny
```

---

## Funzionalità

- **Autenticazione** — Registrazione e login con JWT
- **Gestione viaggi** — Creazione con date, destinazione, copertina e stato (pianificazione/confermato/concluso)
- **Itinerario giornaliero** — Slot Mattina/Pomeriggio/Sera/Notte per ogni giornata
- **Wishlist** — Lista posti da visitare con priorità, filtri e assegnazione agli slot
- **Drag & Drop** — Trascina i posti dalla wishlist agli slot giornalieri
- **Budget** — Tracciamento spese per categoria e partecipante
- **Collaborazione** — Ruoli admin/editor/viewer per ogni viaggio

## Struttura porte

| Servizio | Porta esterna | Porta interna |
|----------|--------------|---------------|
| Frontend (Nginx) | 8090 | 80 |
| Backend (API) | — | 3090 (solo rete interna) |
| Database (PostgreSQL) | — | 5432 (solo rete interna) |
