# Note sulle licenze di terze parti

jrny include o distribuisce software di terzi. Di seguito le licenze che
richiedono attribuzione, e i servizi esterni contattati a runtime.

## Componenti con obbligo di riproduzione della nota di copyright

### Leaflet — BSD 2-Clause

```
Copyright (c) 2010-2023, Volodymyr Agafonkin
Copyright (c) 2010-2011, CloudMade
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

I file dei marker (`marker-icon.png`, `marker-icon-2x.png`, `marker-shadow.png`)
sono inclusi nel bundle e ricadono sotto questa licenza.

### react-leaflet — Hippocratic License 2.1

```
react-leaflet Copyright 2020 Paul Le Cam and contributors
```

**Da sapere:** non è una licenza open source approvata OSI. Concede l'uso a
condizione che sia coerente con le normative e i principi sui diritti umani
richiamati nel testo, e può essere revocata in caso di violazione. Per un uso
personale non cambia nulla; se il progetto dovesse diventare commerciale, o
finire dentro un'organizzazione con policy sulle licenze, va valutata.
Testo completo: `client/node_modules/react-leaflet/LICENSE.md`.

### dotenv — BSD 2-Clause

Copyright (c) 2015, Scott Motte. Tutti i diritti riservati.

### Altri componenti

Il resto delle dipendenze è distribuito con licenze permissive che non
richiedono nulla oltre alla conservazione della nota di copyright nei
rispettivi pacchetti: MIT (la grande maggioranza, fra cui React, React Router,
TipTap, dnd-kit, axios, date-fns, Express, pg, bcryptjs, jsonwebtoken, multer,
cors, Vite), MIT-0 (nodemailer), ISC, Apache-2.0, BSD-3-Clause, 0BSD.

L'elenco completo e sempre aggiornato si ottiene con:

```bash
npm ls --all --omit=dev          # albero delle dipendenze
npx license-checker --summary    # riepilogo per licenza
```

## Servizi esterni contattati a runtime

Nessuno di questi riceve i contenuti dei viaggi; ricevono però l'indirizzo IP
di chi usa l'app, e vanno quindi dichiarati nell'informativa privacy.

| Servizio | Quando | Cosa riceve | Note |
|---|---|---|---|
| CARTO (basemaps) | apertura della mappa | IP, coordinate visualizzate | Attribuzione OpenStreetMap + CARTO già presente in mappa. Il piano gratuito è per uso non commerciale. |
| Nominatim (OSMF) | ricerca delle coordinate di una città | IP, nome della città cercata | Uso soggetto alla Nominatim Usage Policy: volumi bassi, nessun geocoding massivo. |
| Open-Meteo | scheda meteo | IP, coordinate della destinazione | Gratuito per uso non commerciale, attribuzione presente. |
| Google Places API | solo durante l'import di un luogo da Maps | il testo di ricerca del luogo | Chiamata dal server, non dal browser dell'utente. Attribuzione "© Google Maps" mostrata sui luoghi importati. |
| Provider SMTP configurato | invio di inviti e recupero password | indirizzo email del destinatario | Dipende dal provider scelto in `SMTP_HOST`. |

I font (Nunito, Playfair Display) sono serviti dalla nostra origine: **non**
c'è alcuna chiamata a Google Fonts.
