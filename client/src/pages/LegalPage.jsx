import { Link, useLocation } from 'react-router-dom'
import Icon from '../components/Icon'

// Informativa privacy e condizioni d'uso. Una sola pagina con due sezioni,
// raggiungibile senza login: chi deve decidere se registrarsi deve poterle
// leggere prima.
//
// ATTENZIONE: i campi fra parentesi quadre vanno compilati con i dati reali
// del titolare del trattamento. Finché restano così, l'informativa è
// incompleta: il titolare deve essere identificabile (art. 13 GDPR).
const TITOLARE = '[NOME E COGNOME DEL TITOLARE]'
const CONTATTO = '[INDIRIZZO EMAIL DI CONTATTO]'

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text)', marginBottom: '.6rem' }}>{title}</h2>
      <div style={{ fontSize: '.9rem', lineHeight: 1.7, color: 'var(--text-muted)' }}>{children}</div>
    </div>
  )
}

export default function LegalPage() {
  const isTerms = useLocation().pathname.startsWith('/termini')

  return (
    <div style={{ minHeight: '100vh', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', marginBottom: '1.5rem', fontSize: '.85rem' }}>
          <Icon name="back" size={15} /> Torna a jrny
        </Link>

        <h1 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '.4rem', color: 'var(--text)' }}>
          {isTerms ? 'Condizioni d\'uso' : 'Informativa privacy'}
        </h1>
        <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: '2rem' }}>
          Ultimo aggiornamento: agosto 2026
        </p>

        {isTerms ? (
          <>
            <Section title="Cos'è jrny">
              jrny è uno strumento personale per organizzare viaggi di gruppo:
              itinerari, luoghi, budget, bagaglio, note e documenti. È offerto
              così com'è, senza garanzie di disponibilità o di conservazione dei
              dati, a chi riceve un invito o crea un account.
            </Section>
            <Section title="Il tuo account">
              Sei responsabile della password e di quello che viene fatto dal tuo
              account. Serve avere almeno 14 anni per registrarsi. Puoi eliminare
              l'account in qualsiasi momento da Impostazioni → I tuoi dati.
            </Section>
            <Section title="Cosa carichi">
              Resti titolare di quello che carichi. Caricando contenuti dichiari
              di averne il diritto: non caricare materiale coperto da copyright
              altrui, né dati personali di persone che non sanno di essere in un
              viaggio condiviso. Chi partecipa a un viaggio vede tutto ciò che
              quel viaggio contiene, allegati e biglietti compresi.
            </Section>
            <Section title="Link pubblici">
              Un viaggio può essere condiviso con un link pubblico in sola
              lettura, che mostra anche i nomi dei partecipanti. Attivalo solo
              se gli altri partecipanti sono d'accordo. Il link scade dopo 90
              giorni e può essere revocato quando vuoi.
            </Section>
            <Section title="Limiti">
              Ogni viaggio ha uno spazio massimo per i file. L'accesso può essere
              sospeso in caso di uso che comprometta il servizio per gli altri.
            </Section>
            <Section title="Contatti">
              Titolare: {TITOLARE} — {CONTATTO}
            </Section>
          </>
        ) : (
          <>
            <Section title="Chi tratta i tuoi dati">
              Il titolare del trattamento è {TITOLARE}, contattabile
              all'indirizzo {CONTATTO}. jrny è un'istanza privata, ospitata su un
              server gestito direttamente dal titolare.
            </Section>

            <Section title="Quali dati raccogliamo">
              <ul style={{ paddingLeft: '1.2rem', margin: 0 }}>
                <li><b>Account:</b> nome, email, password (salvata solo come hash bcrypt), e se li compili nome, cognome, telefono, età, immagine del profilo.</li>
                <li><b>Contenuti dei viaggi:</b> itinerari, luoghi, date, città, budget e spese, bagaglio, checklist, note, trasporti.</li>
                <li><b>File:</b> foto, immagini delle note, allegati e biglietti. I biglietti spesso contengono dati di viaggio e a volte numeri di documento: caricali solo se ti serve davvero.</li>
                <li><b>Dati tecnici:</b> indirizzo IP e log del server, generati a ogni richiesta.</li>
              </ul>
            </Section>

            <Section title="Perché li trattiamo">
              Per far funzionare l'applicazione e permettere la pianificazione
              condivisa fra i partecipanti (esecuzione del servizio che ti viene
              fornito), e per la sicurezza dell'istanza: limiti di frequenza,
              log, protezione degli accessi (legittimo interesse a mantenere il
              servizio sicuro).
            </Section>

            <Section title="Chi altro li vede">
              <ul style={{ paddingLeft: '1.2rem', margin: 0 }}>
                <li><b>Gli altri partecipanti</b> ai viaggi in cui sei coinvolto, con nome ed email.</li>
                <li><b>Chiunque abbia un link pubblico</b>, se attivato: vede itinerario, luoghi e i nomi dei partecipanti — non email, costi, prenotazioni o allegati.</li>
                <li><b>Servizi esterni</b>, che ricevono il tuo indirizzo IP quando l'app li contatta: CARTO (mappa), Nominatim/OpenStreetMap (ricerca città), Open-Meteo (meteo). Durante l'import di un luogo da Google Maps è il nostro server, non il tuo browser, a contattare Google. Le email (inviti, recupero password) passano dal provider SMTP configurato.</li>
              </ul>
              I font sono serviti dal nostro server: nessuna chiamata a Google Fonts.
            </Section>

            <Section title="Cookie e memoria del browser">
              Nessun cookie di profilazione, nessuna analytics, nessun tracciamento
              pubblicitario. Usiamo solo: un cookie tecnico che permette al
              browser di caricare foto e immagini protette, e la memoria locale
              del browser per tenerti connesso e ricordare il tema scelto.
              Essendo strettamente necessari al servizio che hai richiesto, non
              richiedono banner di consenso.
            </Section>

            <Section title="Per quanto tempo">
              I dati dell'account e dei viaggi restano finché non li cancelli tu.
              Gli inviti non accettati scadono dopo 14 giorni, i link di
              condivisione dopo 90, quelli di invito dopo 7. I token di recupero
              password valgono un'ora. Eliminando l'account, i viaggi in cui eri
              l'unico partecipante vengono cancellati con i loro file.
            </Section>

            <Section title="I tuoi diritti">
              Puoi accedere ai tuoi dati, correggerli, esportarli e cancellarli.
              Due li eserciti da solo, subito, in Impostazioni → I tuoi dati:
              <b> scarica i miei dati</b> (copia completa in JSON) ed
              <b> elimina l'account</b>. Per tutto il resto — rettifica,
              limitazione, opposizione — scrivi a {CONTATTO}. Puoi anche
              proporre reclamo al Garante per la protezione dei dati personali.
            </Section>

            <Section title="Minori">
              Serve avere almeno 14 anni per registrarsi, come previsto dalla
              normativa italiana. Se ti accorgi che un minore di 14 anni ha un
              account, scrivi a {CONTATTO} e verrà eliminato.
            </Section>

            <Section title="Sicurezza">
              Le password sono salvate come hash bcrypt, il traffico viaggia su
              HTTPS, foto e allegati sono accessibili solo ai partecipanti del
              viaggio. Nessun sistema è però inviolabile: non caricare documenti
              che non potresti permetterti di veder trapelare.
            </Section>
          </>
        )}

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', fontSize: '.82rem' }}>
          <Link to={isTerms ? '/privacy' : '/termini'}>
            {isTerms ? 'Leggi l\'informativa privacy' : 'Leggi le condizioni d\'uso'}
          </Link>
        </div>
      </div>
    </div>
  )
}
