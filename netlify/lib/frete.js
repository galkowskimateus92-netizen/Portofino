// Cálculo de frete compartilhado: usado pela função calcular-frete (o site mostra
// as opções pro cliente) e pela create-preference (o servidor confere o valor
// cobrado, sem confiar no número que vem do navegador).

const MELHOR_ENVIO_URL = 'https://www.melhorenvio.com.br/api/v2/me/shipment/calculate';

// CEP de origem (São Bento do Sul/SC) e embalagem padrão de 1 boné.
const ORIGEM_CEP = '89280529';
const PACOTE = { height: 7, width: 15, length: 23, weight: 0.3 };

// A partir desse valor de subtotal, o frete é zerado (a loja absorve o custo).
const FRETE_GRATIS_ACIMA_DE = 250;
// Valor usado quando a Melhor Envio está fora do ar (igual ao do site).
const FRETE_FIXO = 19.9;

// Retorna { opcoes:[{servico, transportadora, preco, prazoDias}], gratisAplicado }
// com as opções da mais barata pra mais cara. Lança erro se a Melhor Envio falhar.
async function cotarFrete(cepDestino, subtotal) {
  const cep = String(cepDestino || '').replace(/\D/g, '');
  if (cep.length !== 8) {
    const err = new Error('CEP inválido.');
    err.codigo = 'CEP_INVALIDO';
    throw err;
  }

  const token = process.env.MELHOR_ENVIO_TOKEN;
  if (!token) throw new Error('MELHOR_ENVIO_TOKEN não configurado no servidor.');

  const resp = await fetch(MELHOR_ENVIO_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
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
    throw new Error(`Melhor Envio respondeu ${resp.status}: ${await resp.text()}`);
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
  return {
    opcoes: validas.map((o) => ({ ...o, preco: gratisAplicado ? 0 : o.preco })),
    gratisAplicado,
  };
}

// Valor do frete que o servidor cobra: a opção mais barata (a mesma que o site escolhe).
// Se a Melhor Envio falhar, usa o frete fixo — igual ao que o site faz nesse caso.
async function freteParaCobrar(cepDestino, subtotal) {
  if (Number(subtotal) <= 0) return { preco: 0, fonte: 'vazio' };
  try {
    const r = await cotarFrete(cepDestino, subtotal);
    if (r.opcoes.length > 0) return { preco: r.opcoes[0].preco, fonte: 'melhor-envio' };
  } catch (err) {
    if (err.codigo === 'CEP_INVALIDO') throw err;
    console.error('Frete: falha na cotação, usando frete fixo —', err.message);
  }
  return { preco: Number(subtotal) >= FRETE_GRATIS_ACIMA_DE ? 0 : FRETE_FIXO, fonte: 'fixo' };
}

module.exports = { cotarFrete, freteParaCobrar, FRETE_GRATIS_ACIMA_DE, FRETE_FIXO };
