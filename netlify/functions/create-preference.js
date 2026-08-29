// Esta função roda no SERVIDOR da Netlify, nunca no navegador do cliente.
// O Access Token fica guardado como variável de ambiente (MP_ACCESS_TOKEN),
// configurada no painel da Netlify — nunca aparece no código nem no navegador.
//
// Também consulta o Supabase (com a SERVICE ROLE KEY, só no servidor) para
// garantir que o produto ainda tem estoque antes de gerar o link de pagamento.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

    // Só itens com productId entram na checagem de estoque (ex: "Frete" não tem productId e é ignorado)
    const itensComProduto = items.filter((i) => i.productId !== undefined && i.productId !== null);

    if (itensComProduto.length > 0) {
      const productIds = itensComProduto.map((i) => i.productId);
      const { data: produtos, error: estoqueError } = await supabase
        .from('produtos')
        .select('id, nome, estoque')
        .in('id', productIds);

      if (estoqueError) {
        console.error('Erro ao consultar estoque no Supabase:', estoqueError.message);
        return { statusCode: 500, body: JSON.stringify({ error: 'Não foi possível checar o estoque.' }) };
      }

      const estoquePorId = new Map(produtos.map((p) => [p.id, p]));
      const semEstoque = [];
      for (const item of itensComProduto) {
        const produto = estoquePorId.get(item.productId);
        if (!produto || produto.estoque < Number(item.qty)) {
          semEstoque.push(produto ? produto.nome : `produto #${item.productId}`);
        }
      }
      if (semEstoque.length > 0) {
        return {
          statusCode: 409,
          body: JSON.stringify({ error: 'Sem estoque suficiente para: ' + semEstoque.join(', ') }),
        };
      }
    }

    const siteUrl = process.env.URL || `https://${event.headers.host}`;

    const preferenceBody = {
      items: items.map((i) => ({
        ...(i.productId !== undefined && i.productId !== null ? { id: String(i.productId) } : {}),
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
    // Guarda o e-mail também em "metadata": o Mercado Pago às vezes não devolve
    // o payer.email no pagamento final (ex: pagamentos como visitante), então isso
    // garante que o webhook sempre consiga mandar o e-mail de confirmação certo.
    if (payer && payer.email) {
      preferenceBody.metadata = { comprador_email: payer.email };
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
