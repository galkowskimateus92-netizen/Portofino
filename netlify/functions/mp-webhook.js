// Esta função é chamada AUTOMATICAMENTE pelo Mercado Pago sempre que o status
// de um pagamento muda (aprovado, rejeitado, pendente, etc). Configure a URL dela
// no painel de Webhooks do Mercado Pago: SEU_SITE/.netlify/functions/mp-webhook

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
