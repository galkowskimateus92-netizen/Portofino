// Esta função roda no SERVIDOR da Netlify, nunca no navegador do cliente.
// O Access Token fica guardado como variável de ambiente (MP_ACCESS_TOKEN),
// configurada no painel da Netlify — nunca aparece no código nem no navegador.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'MP_ACCESS_TOKEN não configurado no servidor.' }),
    };
  }

  try {
    const { items, external_reference, payer } = JSON.parse(event.body || '{}');
    if (!Array.isArray(items) || items.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Carrinho vazio.' }) };
    }

    const siteUrl = process.env.URL || `https://${event.headers.host}`;

    const preferenceBody = {
      items: items.map((i) => ({
        title: `Portofino — ${i.name}`,
        quantity: Number(i.qty),
        unit_price: Number(i.price),
        currency_id: 'BRL',
      })),
      back_urls: {
        success: `${siteUrl}/success.html`,
        failure: `${siteUrl}/failure.html`,
        pending: `${siteUrl}/pending.html`,
      },
      auto_return: 'approved',
    };

    // Número do pedido (pra bater com o registro do formulário de entrega)
    if (external_reference) {
      preferenceBody.external_reference = external_reference;
    }
    // Nome/e-mail do comprador, se enviados
    if (payer && (payer.name || payer.email)) {
      preferenceBody.payer = {
        name: payer.name || undefined,
        email: payer.email || undefined,
      };
    }

    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(preferenceBody),
    });

    const data = await mpResponse.json();

    if (!mpResponse.ok) {
      return {
        statusCode: mpResponse.status,
        body: JSON.stringify({ error: data }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ init_point: data.init_point }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
