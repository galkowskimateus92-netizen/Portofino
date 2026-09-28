// Esta função é chamada AUTOMATICAMENTE pelo Mercado Pago sempre que o status
// de um pagamento muda (aprovado, rejeitado, pendente, etc). Configure a URL dela
// no painel de Webhooks do Mercado Pago: SEU_SITE/.netlify/functions/mp-webhook
//
// O que ela faz:
//  - Pagamento APROVADO: dá baixa no estoque, marca o pedido como pago e manda o
//    e-mail de confirmação completo (itens, valores, endereço, prazo).
//  - Pagamento PENDENTE (Pix/boleto): manda um e-mail "aguardando pagamento" com o
//    link do Pix/boleto.
//  - Pagamento CANCELADO/EXPIRADO: marca o pedido pendente como cancelado.
//
// O Mercado Pago costuma mandar a MESMA notificação várias vezes. Pra não dar baixa
// dupla no estoque nem mandar e-mail repetido, cada evento (pagamento + status) é
// registrado na tabela "notificacoes_processadas" e só é tratado uma vez.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const LOJA_EMAIL = 'companyportofino@gmail.com';
const LOJA_INSTAGRAM = 'https://instagram.com/portofino.company';

// Retorna true se esse evento JÁ foi processado antes (e aí a gente ignora).
// Se a tabela não existir ou o Supabase falhar, segue processando (comportamento antigo).
async function jaProcessado(chave) {
  const { error } = await supabase.from('notificacoes_processadas').insert({ chave });
  if (!error) return false;
  if (error.code === '23505') return true; // chave duplicada = já processado
  console.error('Idempotência: não foi possível registrar a notificação —', error.message);
  return false;
}

// Libera a chave se o processamento falhar no meio, pra próxima notificação tentar de novo.
async function liberarChave(chave) {
  await supabase.from('notificacoes_processadas').delete().eq('chave', chave);
}

// Desconta a quantidade vendida do estoque de cada produto (nunca deixa ficar negativo).
async function darBaixaEstoque(items) {
  for (const item of items) {
    const productId = item.id;
    const quantidade = Number(item.quantity || 0);
    if (!productId || !quantidade) continue;

    const { data: produto, error: buscaError } = await supabase
      .from('produtos')
      .select('estoque, nome')
      .eq('id', productId)
      .single();

    if (buscaError || !produto) {
      console.error(`Estoque: produto ${productId} não encontrado no Supabase.`);
      continue;
    }

    const novoEstoque = Math.max(0, produto.estoque - quantidade);
    const { error: updateError } = await supabase
      .from('produtos')
      .update({ estoque: novoEstoque })
      .eq('id', productId);

    if (updateError) {
      console.error(`Estoque: erro ao atualizar produto ${productId}:`, updateError.message);
    } else {
      console.log(`Estoque: ${produto.nome} — baixa de ${quantidade}, novo estoque: ${novoEstoque}`);
    }
  }
}

// ---------- E-mails ----------

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function brl(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function blocoItens(payment) {
  const itens = payment.additional_info?.items || [];
  if (itens.length === 0) return '';
  const linhas = itens.map((i) => {
    const nome = String(i.title || '').replace(/^Portofino — /, '');
    const total = Number(i.unit_price || 0) * Number(i.quantity || 0);
    return `<tr>
      <td style="padding:8px 0; border-bottom:1px solid #E6E1D6;">${esc(i.quantity)}x ${esc(nome)}</td>
      <td style="padding:8px 0; border-bottom:1px solid #E6E1D6; text-align:right;">${brl(total)}</td>
    </tr>`;
  }).join('');
  return `<table style="width:100%; border-collapse:collapse; font-size:14px; margin:18px 0 6px;">
    ${linhas}
    <tr>
      <td style="padding:10px 0; font-weight:bold;">Total</td>
      <td style="padding:10px 0; font-weight:bold; text-align:right;">${brl(payment.transaction_amount)}</td>
    </tr>
  </table>`;
}

function blocoEntrega(meta) {
  if (!meta.entrega_endereco) return '';
  const cidade = [meta.entrega_cidade, meta.entrega_uf].filter(Boolean).join('/');
  return `<div style="background:#F6F4EE; padding:14px 16px; font-size:13px; line-height:1.6; margin:16px 0;">
    <strong style="letter-spacing:1px;">ENTREGA</strong><br>
    ${esc(meta.entrega_endereco)}${meta.entrega_bairro ? ' — ' + esc(meta.entrega_bairro) : ''}<br>
    ${esc(cidade)}${meta.entrega_cep ? ' · CEP ' + esc(meta.entrega_cep) : ''}
    ${meta.entrega_prazo ? `<br>Prazo estimado: ${esc(meta.entrega_prazo)}` : ''}
  </div>`;
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

function emailAprovado(payment, pedido, siteUrl) {
  const meta = payment.metadata || {};
  const nome = String(meta.comprador_nome || '').split(' ')[0];
  const conteudo = `
    <p>Olá${nome ? ', ' + esc(nome) : ''}!</p>
    <p>Recebemos o pagamento do seu pedido <strong>${esc(pedido)}</strong> e já estamos preparando tudo com carinho. 🧢</p>
    ${blocoItens(payment)}
    ${blocoEntrega(meta)}
    <p><strong>Próximos passos:</strong> despachamos em até 5 dias úteis. Assim que o boné sair daqui, você recebe o <strong>código de rastreio</strong> pra acompanhar a entrega.</p>
    <p style="font-size:13px; opacity:.8;">Se você comprou com login no site, também pode acompanhar em <a href="${siteUrl}/?conta=pedidos" style="color:#0D1B2A;">Minha conta → Meus pedidos</a>.</p>`;
  return moldura(conteudo, siteUrl);
}

function emailPendente(payment, pedido, siteUrl) {
  const meta = payment.metadata || {};
  const nome = String(meta.comprador_nome || '').split(' ')[0];
  const ehBoleto = payment.payment_type_id === 'ticket';
  const ehPix = payment.payment_method_id === 'pix';
  const link =
    payment.point_of_interaction?.transaction_data?.ticket_url ||
    payment.transaction_details?.external_resource_url ||
    '';
  const instrucao = ehPix
    ? 'Assim que o Pix for pago, a confirmação chega em poucos minutos.'
    : ehBoleto
      ? 'O boleto pode levar até 3 dias úteis pra compensar depois de pago.'
      : 'Assim que o pagamento for confirmado, você recebe outro e-mail.';
  const botao = link
    ? `<p style="text-align:center; margin:22px 0;"><a href="${esc(link)}" style="background:#0D1B2A; color:#F6F4EE; padding:13px 26px; text-decoration:none; letter-spacing:2px; font-size:12px;">${ehPix ? 'VER QR CODE DO PIX' : ehBoleto ? 'VER BOLETO' : 'VER PAGAMENTO'}</a></p>`
    : '';
  const conteudo = `
    <p>Olá${nome ? ', ' + esc(nome) : ''}!</p>
    <p>Recebemos seu pedido <strong>${esc(pedido)}</strong> e estamos aguardando a confirmação do pagamento.</p>
    ${botao}
    <p>${instrucao} Se ainda não pagou, é só usar o link acima.</p>
    ${blocoItens(payment)}`;
  return moldura(conteudo, siteUrl);
}

// ---------- Handler ----------

exports.handler = async (event) => {
  // O Mercado Pago pode "testar" a URL com GET — sempre respondemos 200 pra não falhar a validação.
  if (event.httpMethod !== 'POST') {
    return { statusCode: 200, body: 'ok' };
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;

  try {
    let body = {};
    try { body = event.body ? JSON.parse(event.body) : {}; } catch (e) { body = {}; }
    const params = event.queryStringParameters || {};

    // O ID do pagamento pode vir no corpo (formato novo) ou na query string (formato antigo/IPN)
    const paymentId = body?.data?.id || params['data.id'] || params.id;
    const topic = body.type || params.type || params.topic;

    if (!paymentId || (topic && topic !== 'payment')) {
      return { statusCode: 200, body: 'ignorado (não é notificação de pagamento)' };
    }

    if (!accessToken) {
      console.error('MP_ACCESS_TOKEN não configurado — não foi possível verificar o pagamento.');
      return { statusCode: 200, body: 'token ausente' };
    }

    // Busca os detalhes reais do pagamento na API do Mercado Pago (nunca confiamos só no webhook)
    const paymentResp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payment = await paymentResp.json();

    if (!paymentResp.ok) {
      console.error('Erro ao buscar pagamento no Mercado Pago:', JSON.stringify(payment));
      return { statusCode: 200, body: 'erro ao buscar pagamento' };
    }

    const siteUrl = process.env.URL || `https://${event.headers.host}`;
    const numeroPedido = payment.external_reference || `#${payment.id}`;
    // Preferimos o e-mail salvo em "metadata" na hora da compra (mais confiável)
    const emailComprador = payment.metadata?.comprador_email || payment.payer?.email;

    // ===== APROVADO =====
    if (payment.status === 'approved') {
      const chave = `${payment.id}:approved`;
      if (await jaProcessado(chave)) {
        return { statusCode: 200, body: 'já processado' };
      }

      try {
        const itensPagos = payment.additional_info?.items || [];
        if (itensPagos.length > 0) {
          await darBaixaEstoque(itensPagos);
        } else {
          console.error('Estoque: pagamento aprovado sem additional_info.items — baixa não realizada para o payment_id', payment.id);
        }
      } catch (err) {
        // Se a baixa falhar, libera a chave pra próxima notificação tentar de novo
        await liberarChave(chave);
        throw err;
      }

      await enviarEmail(
        emailComprador,
        `Pedido ${numeroPedido} confirmado — Portofino`,
        emailAprovado(payment, numeroPedido, siteUrl)
      );

      // Marca o pedido como pago no histórico do cliente (só existe se ele comprou logado)
      if (payment.external_reference) {
        const { error: pedidoError } = await supabase
          .from('pedidos')
          .update({ status: 'aprovado' })
          .eq('numero_pedido', payment.external_reference)
          .in('status', ['pendente', 'cancelado']);
        if (pedidoError) console.error('Pedidos: erro ao atualizar status:', pedidoError.message);
      }

      const formBody = new URLSearchParams({
        'form-name': 'pagamentos-confirmados',
        pedido: payment.external_reference || '(sem número de pedido)',
        status: payment.status,
        valor: `R$ ${Number(payment.transaction_amount || 0).toFixed(2)}`,
        pagador_email: emailComprador || '',
        payment_id: String(payment.id),
      });
      await fetch(siteUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody.toString(),
      });
    }

    // ===== PENDENTE (Pix gerado / boleto emitido) =====
    else if (payment.status === 'pending' || payment.status === 'in_process') {
      // Uma chave por PEDIDO: se o cliente gerar vários Pix pro mesmo pedido, só recebe 1 e-mail
      if (!(await jaProcessado(`${numeroPedido}:pending`))) {
        await enviarEmail(
          emailComprador,
          `Aguardando pagamento do pedido ${numeroPedido} — Portofino`,
          emailPendente(payment, numeroPedido, siteUrl)
        );
      }
    }

    // ===== CANCELADO / EXPIRADO (ex: Pix ou boleto não pago no prazo) =====
    else if (payment.status === 'cancelled' && payment.external_reference) {
      // Só cancela se ainda estiver pendente — nunca desfaz um pedido já pago
      const { error } = await supabase
        .from('pedidos')
        .update({ status: 'cancelado' })
        .eq('numero_pedido', payment.external_reference)
        .eq('status', 'pendente');
      if (error) console.error('Pedidos: erro ao cancelar pedido:', error.message);
    }

    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    // Responde 200 mesmo em erro pra evitar reenvios em loop do Mercado Pago.
    console.error('Erro no webhook do Mercado Pago:', err.message);
    return { statusCode: 200, body: 'erro tratado' };
  }
};
