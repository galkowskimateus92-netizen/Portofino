// Funções de e-mail compartilhadas entre as funções da Netlify (webhook e admin).
// Esta pasta fica FORA de netlify/functions, então não vira uma URL pública.

const LOJA_EMAIL = 'companyportofino@gmail.com';
const LOJA_INSTAGRAM = 'https://instagram.com/portofino.company';

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function brl(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function moldura(conteudo, siteUrl) {
  return `
  <div style="font-family:Arial,sans-serif; max-width:520px; margin:0 auto; color:#0D1B2A; background:#fff;">
    <div style="text-align:center; padding:22px 0 10px;">
      <div style="font-size:26px; color:#B08A4E;">⚓</div>
      <h2 style="letter-spacing:4px; margin:6px 0 0;">PORTOFINO</h2>
      <div style="font-size:11px; letter-spacing:2px; opacity:.6;">ITALIAN RIVIERA</div>
    </div>
    <div style="padding:10px 22px 22px; font-size:14px; line-height:1.6;">
      ${conteudo}
      <p style="margin-top:22px;">Qualquer dúvida, é só responder este e-mail.</p>
      <p>Obrigado por comprar com a gente!<br>Equipe Portofino</p>
    </div>
    <div style="border-top:1px solid #E6E1D6; padding:14px 22px; font-size:12px; text-align:center; opacity:.75;">
      <a href="${siteUrl}" style="color:#0D1B2A;">portofinoco.com.br</a> ·
      <a href="${LOJA_INSTAGRAM}" style="color:#0D1B2A;">@portofino.company</a>
    </div>
  </div>`;
}

async function enviarEmail(destinatario, assunto, html) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey || !destinatario) {
    console.error('Email: BREVO_API_KEY ou e-mail do comprador ausente — e-mail não enviado.');
    return false;
  }
  try {
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        sender: { name: 'Portofino', email: LOJA_EMAIL },
        replyTo: { email: LOJA_EMAIL },
        to: [{ email: destinatario }],
        subject: assunto,
        htmlContent: html,
      }),
    });
    if (!resp.ok) {
      console.error('Email: falha ao enviar via Brevo:', await resp.text());
      return false;
    }
    console.log(`Email: "${assunto}" enviado para ${destinatario}`);
    return true;
  } catch (err) {
    console.error('Email: erro ao chamar a API do Brevo:', err.message);
    return false;
  }
}

module.exports = { LOJA_EMAIL, LOJA_INSTAGRAM, esc, brl, moldura, enviarEmail };
