const nodemailer = require('nodemailer')
const { escapeHtml } = require('./security')

let _transporter = null

function getTransporter() {
  if (_transporter) return _transporter
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null
  _transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '587'),
    secure: parseInt(SMTP_PORT || '587') === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    // Verifica il certificato TLS del server SMTP; disattivabile solo esplicitamente via env
    tls: { rejectUnauthorized: process.env.SMTP_TLS_INSECURE !== 'true' },
  })
  return _transporter
}

async function sendInviteEmail({ to, inviterName, tripTitle, appUrl, isNewUser, claimUrl }) {
  const t = getTransporter()
  if (!t) {
    console.warn('[email] SMTP non configurato — invito non inviato a', to)
    return
  }

  const from = `"jrny" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`
  const subject = isNewUser
    ? `${inviterName} ti ha invitato su jrny`
    : `${inviterName} ti ha aggiunto al viaggio "${tripTitle}"`

  // Il link di riscatto contiene il token dell'invito: riceverlo è ciò che
  // prova l'accesso alla casella. Senza, l'invito non è utilizzabile.
  const actionUrl = claimUrl || (isNewUser ? `${appUrl}/register` : appUrl)
  const actionLabel = isNewUser ? 'Accetta l\'invito' : 'Apri il viaggio'
  const bodyLine = isNewUser
    ? `Apri il link qui sotto per accettare l'invito: potrai creare il tuo account e unirti subito al gruppo.`
    : `Accedi a jrny per vedere l'itinerario, la wishlist e il budget del viaggio.`

  // Escape di tutti i valori dinamici interpolati nell'HTML (anti-XSS via nome/titolo)
  const eInviter = escapeHtml(inviterName)
  const eTitle = escapeHtml(tripTitle)
  const eActionUrl = escapeHtml(actionUrl)
  const eTo = escapeHtml(to)
  const eAppUrl = escapeHtml(appUrl)

  const html = `<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fdf6ec;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf6ec;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#fffdf8;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(90,50,20,.10)">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#c26b4a 0%,#a85637 100%);padding:32px 40px;text-align:center">
            <div style="font-size:28px;font-weight:800;color:#fff;letter-spacing:-0.5px">✈️ jrny</div>
            <div style="color:rgba(255,255,255,.8);font-size:13px;margin-top:4px">pianifica il tuo prossimo viaggio</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px">
            <p style="margin:0 0 8px;font-size:15px;color:#8c7255">Hai ricevuto un invito</p>
            <h1 style="margin:0 0 20px;font-size:22px;color:#3d2b1f;font-weight:700;line-height:1.3">
              ${eInviter} ti invita a<br>
              <span style="color:#c26b4a">"${eTitle}"</span>
            </h1>
            <p style="margin:0 0 28px;font-size:15px;color:#5a3d2b;line-height:1.6">
              ${bodyLine}
            </p>

            <!-- CTA -->
            <table cellpadding="0" cellspacing="0" style="margin:0 0 28px">
              <tr>
                <td style="background:#c26b4a;border-radius:10px">
                  <a href="${eActionUrl}"
                     style="display:inline-block;padding:14px 32px;color:#fff;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:.2px">
                    ${actionLabel} →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:13px;color:#b89d82;line-height:1.5">
              Se il pulsante non funziona, copia e incolla questo link nel browser:<br>
              <span style="color:#c26b4a">${eActionUrl}</span>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#fdf6ec;padding:20px 40px;border-top:1px solid #e8d9c5">
            <p style="margin:0;font-size:12px;color:#b89d82;text-align:center;line-height:1.6">
              Hai ricevuto questa email perché <strong>${eTo}</strong> è stato invitato su jrny
              da una persona che conosce il tuo indirizzo.<br>
              Se non ti aspettavi questo invito puoi ignorarlo: senza aprire il link non
              viene creato nulla a tuo nome e l'invito scade da solo in 14 giorni.<br>
              Per non ricevere più inviti da questa istanza, o per chiedere la
              cancellazione del tuo indirizzo, scrivi a
              <a href="${eAppUrl}/privacy" style="color:#c26b4a">chi la gestisce</a>.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  const text = isNewUser
    ? `${inviterName} ti ha invitato al viaggio "${tripTitle}" su jrny.\n\nAccetta l'invito: ${actionUrl}\n\nSe non ti aspettavi questo invito, ignora questa email: senza aprire il link non viene creato nulla a tuo nome.`
    : `${inviterName} ti ha aggiunto al viaggio "${tripTitle}" su jrny.\n\nAccedi: ${appUrl}`

  await t.sendMail({ from, to, subject, html, text })
}

// Layout comune ai messaggi transazionali (recupero password, avvisi).
// Tutti i valori dinamici passano da escapeHtml.
function basicLayout({ title, body, ctaUrl, ctaLabel }) {
  return `<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fdf6ec;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf6ec;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#fffdf8;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(90,50,20,.10)">
        <tr>
          <td style="background:linear-gradient(135deg,#c26b4a 0%,#a85637 100%);padding:28px 40px;text-align:center">
            <div style="font-size:26px;font-weight:800;color:#fff;letter-spacing:-0.5px">✈️ jrny</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px">
            <h1 style="margin:0 0 16px;font-size:20px;color:#3d2b1f;font-weight:700;line-height:1.3">${title}</h1>
            <p style="margin:0 0 24px;font-size:15px;color:#5a3d2b;line-height:1.6">${body}</p>
            ${ctaUrl ? `<table cellpadding="0" cellspacing="0" style="margin:0 0 24px">
              <tr><td style="background:#c26b4a;border-radius:10px">
                <a href="${ctaUrl}" style="display:inline-block;padding:13px 30px;color:#fff;font-size:15px;font-weight:700;text-decoration:none">${ctaLabel} →</a>
              </td></tr>
            </table>
            <p style="margin:0;font-size:13px;color:#b89d82;line-height:1.5">
              Se il pulsante non funziona, copia questo link nel browser:<br>
              <span style="color:#c26b4a">${ctaUrl}</span>
            </p>` : ''}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

async function sendPasswordResetEmail({ to, name, resetUrl, minutes }) {
  const t = getTransporter()
  if (!t) {
    console.warn('[email] SMTP non configurato — recupero password non inviato a', to)
    return
  }
  const url = escapeHtml(resetUrl)
  const html = basicLayout({
    title: `Ciao ${escapeHtml(name || '')}, hai chiesto di reimpostare la password`,
    body: `Apri il link qui sotto per scegliere una nuova password. Vale ${minutes} minuti e una volta sola.<br><br>Se non hai chiesto tu il recupero, puoi ignorare questa email: la password attuale resta valida.`,
    ctaUrl: url,
    ctaLabel: 'Reimposta la password',
  })
  await t.sendMail({
    from: `"jrny" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to,
    subject: 'Reimposta la password del tuo account jrny',
    html,
    text: `Hai chiesto di reimpostare la password del tuo account jrny.\n\nApri questo link (valido ${minutes} minuti, una sola volta): ${resetUrl}\n\nSe non sei stato tu, ignora questa email.`,
  })
}

// Avvisi su eventi che riguardano la sicurezza dell'account (cambio password,
// cambio email): servono a far accorgere l'utente di un accesso non suo.
async function sendSecurityNotice({ to, subject, message }) {
  const t = getTransporter()
  if (!t) return
  await t.sendMail({
    from: `"jrny" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to,
    subject,
    html: basicLayout({ title: escapeHtml(subject), body: escapeHtml(message) }),
    text: `${subject}\n\n${message}`,
  })
}

module.exports = { sendInviteEmail, sendPasswordResetEmail, sendSecurityNotice }
