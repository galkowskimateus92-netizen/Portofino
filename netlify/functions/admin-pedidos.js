// Função do painel de admin (admin.html). Só funciona com a senha certa,
// que fica na variável de ambiente ADMIN_SENHA da Netlify.
//
//  GET  -> lista os pedidos dos últimos 90 dias
//  POST { acao:'enviar',   numero, codigo } -> marca como enviado + manda e-mail com rastreio
//  POST { acao:'entregue', numero }         -> marca como entregue

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { esc, moldura, enviarEmail } = require('../lib/email');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function senhaOk(event) {
  const esperada = process.env.ADMIN_SENHA || '';
  const recebida = event.headers['x-admin-senha'] || '';
  if (esperada.length < 8 || !recebida) return false;
  const a = crypto.createHash('sha256').update(esperada).digest();
  const b = crypto.createHash('sha256').update(recebida).digest();
  return crypto.timingSafeEqual(a, b);
}

const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(obj),
});

function emailRastreio(pedido, codigo, siteUrl) {
  const nome = String(pedido.nome || '').split(' ')[0];
  const link = `https://www.melhorrastreio.com.br/rastreio/${encodeURIComponent(codigo)}`;
  const conteudo = `
    <p>Olá${nome ? ', ' + esc(nome) : ''}!</p>
    <p>Boa notícia: seu pedido <strong>${esc(pedido.numero_pedido)}</strong> saiu daqui e já está a caminho. 🧢⚓</p>
    <div style="background:#F6F4EE; padding:16px; text-align:center; margin:18px 0;">
      <div style="font-size:11px; letter-spacing:2px; opacity:.7;">CÓDIGO DE RASTREIO</div>
      <div style="font-size:20px; letter-spacing:2px; font-weight:bold; margin-top:4px;">${esc(codigo)}</div>
    </div>
    <p style="text-align:center; margin:22px 0;">
      <a href="${link}" style="background:#0D1B2A; color:#F6F4EE; padding:13px 26px; text-decoration:none; letter-spacing:2px; font-size:12px;">ACOMPANHAR ENTREGA</a>
    </p>
    <p style="font-size:13px; opacity:.8;">O rastreio pode levar até 24h pra começar a mostrar movimentação.</p>`;
  return moldura(conteudo, siteUrl);
}

exports.handler = async (event) => {
  if (!senhaOk(event)) {
    // Pequena espera pra dificultar quem tentar adivinhar a senha
    await new Promise((r) => setTimeout(r, 800));
    return json(401, { error: 'Senha incorreta.' });
  }

  try {
    if (event.httpMethod === 'GET') {
      const desde = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('pedidos')
        .select('*')
        .gte('criado_em', desde)
        .order('criado_em', { ascending: false });
      if (error) throw error;
      return json(200, { pedidos: data || [] });
    }

    if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' });

    const { acao, numero, codigo } = JSON.parse(event.body || '{}');
    if (!numero) return json(400, { error: 'Número do pedido faltando.' });

    const { data: pedido, error: buscaErr } = await supabase
      .from('pedidos').select('*').eq('numero_pedido', numero).maybeSingle();
    if (buscaErr) throw buscaErr;
    if (!pedido) return json(404, { error: 'Pedido não encontrado.' });

    if (acao === 'enviar') {
      const cod = String(codigo || '').trim().toUpperCase().replace(/\s+/g, '');
      if (cod.length < 8) return json(400, { error: 'Código de rastreio inválido.' });
      const { error } = await supabase
        .from('pedidos')
        .update({ status: 'enviado', codigo_rastreio: cod, enviado_em: new Date().toISOString() })
        .eq('id', pedido.id);
      if (error) throw error;

      const siteUrl = process.env.URL || `https://${event.headers.host}`;
      const emailOk = pedido.email
        ? await enviarEmail(pedido.email, `Seu pedido ${pedido.numero_pedido} foi enviado — Portofino`, emailRastreio(pedido, cod, siteUrl))
        : false;
      return json(200, { ok: true, emailEnviado: emailOk });
    }

    if (acao === 'entregue') {
      const { error } = await supabase.from('pedidos').update({ status: 'entregue' }).eq('id', pedido.id);
      if (error) throw error;
      return json(200, { ok: true });
    }

    return json(400, { error: 'Ação desconhecida.' });
  } catch (err) {
    console.error('Admin:', err.message);
    return json(500, { error: err.message });
  }
};
