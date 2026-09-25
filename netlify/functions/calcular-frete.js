// Esta função roda no SERVIDOR da Netlify, nunca no navegador do cliente.
// O token da Melhor Envio fica guardado como variável de ambiente (MELHOR_ENVIO_TOKEN),
// configurada no painel da Netlify — nunca aparece no código nem no navegador.

const MELHOR_ENVIO_URL = 'https://www.melhorenvio.com.br/api/v2/me/shipment/calculate';

// CEP de origem (São Bento do Sul/SC) e embalagem padrão de 1 boné.
const ORIGEM_CEP = '89280529';
const PACOTE = { height: 7, width: 15, length: 23, weight: 0.3 };

// A partir desse valor de subtotal, o frete calculado é zerado (a loja absorve o custo).
const FRETE_GRATIS_ACIMA_DE = 250;

// Entrega grátis para a cidade da loja (qualquer valor de compra).
const CIDADE_FRETE_GRATIS = { cidade: 'sao bento do sul', uf: 'SC' };

function normalizar(txt) {
  return String(txt || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

// Consulta o ViaCEP pra saber se o CEP é da cidade com frete grátis.
async function ehEntregaLocal(cep) {
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!r.ok) return false;
    const d = await r.json();
    return !d.erro && normalizar(d.localidade) === CIDADE_FRETE_GRATIS.cidade && d.uf === CIDADE_FRETE_GRATIS.uf;
  } catch (e) {
    return false;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const token = process.env.MELHOR_ENVIO_TOKEN;
  if (!token) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'MELHOR_ENVIO_TOKEN não configurado no servidor.' }),
    };
  }

  try {
    const { cepDestino, subtotal } = JSON.parse(event.body || '{}');
    const cep = String(cepDestino || '').replace(/\D/g, '');
    if (cep.length !== 8) {
      return { statusCode: 400, body: JSON.stringify({ error: 'CEP inválido.' }) };
    }

    // São Bento do Sul/SC: frete grátis, sem consultar a Melhor Envio.
    if (await ehEntregaLocal(cep)) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          opcoes: [{ servico: 'Entrega local', transportadora: 'Portofino', preco: 0, prazoDias: null }],
          gratisAplicado: true,
          entregaLocal: true,
        }),
      };
    }

    const resp = await fetch(MELHOR_ENVIO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
        // A Melhor Envio exige um User-Agent identificando a aplicação.
        'User-Agent': 'Portofino (companyportofino@gmail.com)',
      },
      body: JSON.stringify({
        from: { postal_code: ORIGEM_CEP },
        to: { postal_code: cep },
        package: PACOTE,
      }),
    });

    if (!resp.ok) {
      const texto = await resp.text();
      console.error('Erro Melhor Envio:', resp.status, texto);
      return { statusCode: 502, body: JSON.stringify({ error: 'Não foi possível calcular o frete agora.' }) };
    }

    const opcoes = await resp.json();

    const validas = (Array.isArray(opcoes) ? opcoes : [])
      .filter((o) => !o.error && o.price)
      .map((o) => ({
        servico: o.name,
        transportadora: o.company?.name || '',
        preco: Number(o.price),
        prazoDias: o.delivery_time,
      }))
      .sort((a, b) => a.preco - b.preco);

    const gratisAplicado = Number(subtotal) >= FRETE_GRATIS_ACIMA_DE;
    const opcoesFinal = validas.map((o) => ({ ...o, preco: gratisAplicado ? 0 : o.preco }));

    return {
      statusCode: 200,
      body: JSON.stringify({ opcoes: opcoesFinal, gratisAplicado }),
    };
  } catch (err) {
    console.error('Erro ao calcular frete:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'Erro interno ao calcular frete.' }) };
  }
};
