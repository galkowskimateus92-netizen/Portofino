// Esta função roda no SERVIDOR da Netlify, nunca no navegador do cliente.
// O token da Melhor Envio fica guardado como variável de ambiente (MELHOR_ENVIO_TOKEN).
// A lógica de cálculo fica em netlify/lib/frete.js (compartilhada com o checkout).

const { cotarFrete } = require('../lib/frete');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { cepDestino, subtotal } = JSON.parse(event.body || '{}');
    const resultado = await cotarFrete(cepDestino, subtotal);
    return { statusCode: 200, body: JSON.stringify(resultado) };
  } catch (err) {
    if (err.codigo === 'CEP_INVALIDO') {
      return { statusCode: 400, body: JSON.stringify({ error: 'CEP inválido.' }) };
    }
    console.error('Erro ao calcular frete:', err.message);
    return { statusCode: 502, body: JSON.stringify({ error: 'Não foi possível calcular o frete agora.' }) };
  }
};
