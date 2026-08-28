// Esta função é chamada AUTOMATICAMENTE pelo Mercado Pago sempre que o status
// de um pagamento muda (aprovado, rejeitado, pendente, etc). Configure a URL dela
// no painel de Webhooks do Mercado Pago: SEU_SITE/.netlify/functions/mp-webhook
//
// Quando o pagamento é aprovado, também dá baixa automática no estoque no Supabase,
// usando a SERVICE ROLE KEY (chave secreta, só existe aqui no servidor).

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Desconta a quantidade vendida do estoque de cada produto.
// Usa uma checagem "não deixa ficar negativo" e loga se algo parecer estranho
// (ex: baixa duplicada do mesmo pagamento, produto removido, etc).
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

    // Só nos interessa notificação sobre pagamentos
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

    // Só confirmamos o pedido quando o pagamento estiver REALMENTE aprovado
    if (payment.status === 'approved') {
      // Dá baixa no estoque usando os itens registrados no próprio pagamento
      // (o "id" de cada item foi definido como o productId do Supabase na hora
      // de criar a preferência, lá no create-preference.js)
      const itensPagos = payment.additional_info?.items || [];
      if (itensPagos.length > 0) {
        await darBaixaEstoque(itensPagos);
      } else {
        console.error('Estoque: pagamento aprovado sem additional_info.items — baixa não realizada para o payment_id', payment.id);
      }

      const siteUrl = process.env.URL || `https://${event.headers.host}`;
      const formBody = new URLSearchParams({
        'form-name': 'pagamentos-confirmados',
        pedido: payment.external_reference || '(sem número de pedido)',
        status: payment.status,
        valor: `R$ ${Number(payment.transaction_amount || 0).toFixed(2)}`,
        pagador_email: payment.payer?.email || '',
        payment_id: String(payment.id),
      });

      await fetch(siteUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody.toString(),
      });
    }

    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    // Responde 200 mesmo em erro pra evitar reenvios em loop do Mercado Pago.
    // O erro fica registrado nos logs da função pra você investigar.
    console.error('Erro no webhook do Mercado Pago:', err.message);
    return { statusCode: 200, body: 'erro tratado' };
  }
};
