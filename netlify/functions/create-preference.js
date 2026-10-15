// Esta função roda no SERVIDOR da Netlify, nunca no navegador do cliente.
// O Access Token fica guardado como variável de ambiente (MP_ACCESS_TOKEN).
//
// SEGURANÇA: o valor cobrado é calculado AQUI, nunca com números vindos do navegador.
//  - Preço de cada boné: tabela "produtos" do Supabase (coluna "preco").
//  - Frete: recalculado aqui (Melhor Envio / frete fixo; cupom de frete zera).
//  - Cupom: validado aqui (lista CUPONS + checagem de uso por e-mail).
// O navegador só informa QUAIS produtos e QUANTOS, o CEP e o código do cupom.

const { createClient } = require('@supabase/supabase-js');
const { freteParaCobrar } = require('../lib/frete');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Cupons válidos (mesma lista do site). Pra criar um novo, adicione aqui E no loja.js.
// tipo 'percentual' = desconto nos produtos; tipo 'frete' = frete grátis.
const CUPONS = {
  RIVIERA10: { tipo: 'percentual', valor: 0.10 },
  FRETEAMIGO: { tipo: 'frete' },
};

const round2 = (v) => Math.round(v * 100) / 100;
const resposta = (statusCode, obj) => ({ statusCode, body: JSON.stringify(obj) });

// Lê o preço da linha do produto, aceitando os nomes de coluna mais comuns
function precoDoProduto(row) {
  const v = Number(row.preco ?? row.price ?? row.valor);
  return Number.isFinite(v) && v > 0 ? v : null;
}

// Descobre qual cliente está logado a partir do token enviado pelo site (se houver)
async function usuarioLogado(event) {
  const auth = event.headers.authorization || event.headers.Authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  return error ? null : data.user;
}

async function registrarPedido({ event, external_reference, itens, total, payer, entrega, cupom }) {
  const user = await usuarioLogado(event);
  const e = entrega && typeof entrega === 'object' ? entrega : {};
  const campo = (v) => String(v || '').slice(0, 200);

  const { error } = await supabase.from('pedidos').insert({
    user_id: user ? user.id : null,
    numero_pedido: String(external_reference),
    itens,
    total,
    status: 'pendente',
    email: payer?.email ? String(payer.email).trim().toLowerCase() : null,
    nome: payer?.name ? campo(payer.name) : null,
    telefone: e.telefone ? campo(e.telefone) : null,
    cupom: cupom || null,
    entrega: {
      nome: campo(e.nome), cpf: campo(e.cpf), endereco: campo(e.endereco), bairro: campo(e.bairro),
      cidade: campo(e.cidade), uf: campo(e.uf), cep: campo(e.cep), prazo: campo(e.prazo),
    },
  });
  if (error) throw error;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return resposta(500, { error: 'MP_ACCESS_TOKEN não configurado no servidor.' });

  try {
    const { items, external_reference, payer, entrega, cupom } = JSON.parse(event.body || '{}');

    // 1) Junta o carrinho: só productId + quantidade (o preço enviado pelo navegador é ignorado)
    const qtdPorProduto = new Map();
    for (const i of Array.isArray(items) ? items : []) {
      if (i.productId === undefined || i.productId === null) continue; // ex: linha "Frete"
      const qty = Math.floor(Number(i.qty));
      if (!Number.isFinite(qty) || qty < 1 || qty > 20) return resposta(400, { error: 'Quantidade inválida.' });
      const id = Number(i.productId);
      qtdPorProduto.set(id, (qtdPorProduto.get(id) || 0) + qty);
    }
    if (qtdPorProduto.size === 0) return resposta(400, { error: 'Carrinho vazio.' });

    // 2) Busca preço, nome e estoque reais no Supabase
    const { data: produtos, error: prodErr } = await supabase
      .from('produtos')
      .select('*')
      .in('id', [...qtdPorProduto.keys()]);
    if (prodErr) {
      console.error('Erro ao consultar produtos no Supabase:', prodErr.message);
      return resposta(500, { error: 'Não foi possível conferir os produtos agora. Tente de novo.' });
    }
    const produtoPorId = new Map(produtos.map((p) => [Number(p.id), p]));

    const linhas = [];
    const semEstoque = [];
    for (const [id, qty] of qtdPorProduto) {
      const p = produtoPorId.get(id);
      const preco = p ? precoDoProduto(p) : null;
      if (!p || preco === null) {
        console.error(`Preço: produto ${id} sem preço válido no Supabase (coluna "preco").`);
        return resposta(500, { error: 'Produto indisponível no momento. Fale com a loja.' });
      }
      if (Number(p.estoque) < qty) semEstoque.push(p.nome || `produto #${id}`);
      linhas.push({ id, nome: p.nome || `Produto ${id}`, qty, preco });
    }
    if (semEstoque.length > 0) {
      return resposta(409, { error: 'Sem estoque suficiente para: ' + semEstoque.join(', ') });
    }

    // 3) Cupom: precisa existir e não pode ter sido usado antes por esse e-mail
    const email = payer?.email ? String(payer.email).trim().toLowerCase() : '';
    const codigoCupom = cupom ? String(cupom).trim().toUpperCase() : '';
    let pctDesconto = 0;
    let cupomFrete = false;
    if (codigoCupom) {
      if (!CUPONS[codigoCupom]) return resposta(409, { error: `O cupom ${codigoCupom} não é válido. Remova o cupom e tente de novo.` });
      if (!email) return resposta(400, { error: 'Informe seu e-mail pra usar o cupom.' });
      const { data: usos, error: cupomErr } = await supabase
        .from('cupons_usados')
        .select('pedido_numero')
        .eq('email', email)
        .eq('codigo', codigoCupom);
      if (cupomErr) {
        console.error('Cupom: erro ao checar uso:', cupomErr.message);
        return resposta(500, { error: 'Não foi possível validar o cupom agora. Tente de novo.' });
      }
      // O próprio site registra o uso deste pedido um pouco antes — esse não conta
      const usadoAntes = (usos || []).some((u) => String(u.pedido_numero) !== String(external_reference));
      if (usadoAntes) return resposta(409, { error: `O cupom ${codigoCupom} já foi usado com esse e-mail.` });
      const def = CUPONS[codigoCupom];
      if (def.tipo === 'percentual') pctDesconto = def.valor;
      if (def.tipo === 'frete') cupomFrete = true;
    }

    // 4) Frete recalculado aqui (sobre o subtotal sem desconto, igual ao site).
    //    Cupom de frete grátis zera o frete, mas o CEP continua sendo validado.
    const subtotal = round2(linhas.reduce((a, l) => a + l.preco * l.qty, 0));
    let frete;
    try {
      frete = (await freteParaCobrar(entrega?.cep, subtotal)).preco;
    } catch (err) {
      return resposta(400, { error: 'CEP inválido. Confira o endereço de entrega.' });
    }
    if (cupomFrete) frete = 0;
    frete = round2(frete);

    // 5) Monta os itens do Mercado Pago com os valores do servidor
    const mpItems = linhas.map((l) => ({
      id: String(l.id),
      title: `Portofino — ${l.nome}`,
      quantity: l.qty,
      unit_price: round2(l.preco * (1 - pctDesconto)),
      currency_id: 'BRL',
    }));
    if (frete > 0) {
      mpItems.push({ title: 'Portofino — Frete', quantity: 1, unit_price: frete, currency_id: 'BRL' });
    }
    const total = round2(mpItems.reduce((a, i) => a + i.unit_price * i.quantity, 0));

    const siteUrl = process.env.URL || `https://${event.headers.host}`;
    const preferenceBody = {
      items: mpItems,
      back_urls: {
        success: `${siteUrl}/success.html`,
        failure: `${siteUrl}/failure.html`,
        pending: `${siteUrl}/pending.html`,
      },
      auto_return: 'approved',
    };
    if (external_reference) preferenceBody.external_reference = String(external_reference);
    if (payer && (payer.name || payer.email)) {
      preferenceBody.payer = { name: payer.name || undefined, email: payer.email || undefined };
    }

    // "metadata" volta no webhook: e-mail do comprador (o MP às vezes não devolve
    // o payer.email) e endereço/prazo pro e-mail de confirmação completo.
    const metadata = {};
    if (email) metadata.comprador_email = email;
    if (payer && payer.name) metadata.comprador_nome = String(payer.name).slice(0, 120);
    if (entrega && typeof entrega === 'object') {
      const campo = (v) => String(v || '').slice(0, 200);
      metadata.entrega_endereco = campo(entrega.endereco);
      metadata.entrega_bairro = campo(entrega.bairro);
      metadata.entrega_cidade = campo(entrega.cidade);
      metadata.entrega_uf = campo(entrega.uf);
      metadata.entrega_cep = campo(entrega.cep);
      metadata.entrega_prazo = campo(entrega.prazo);
    }
    if (Object.keys(metadata).length > 0) preferenceBody.metadata = metadata;

    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(preferenceBody),
    });
    const data = await mpResponse.json();
    if (!mpResponse.ok) {
      console.error('Mercado Pago recusou a preferência:', JSON.stringify(data));
      return resposta(mpResponse.status, { error: 'Não foi possível iniciar o pagamento.' });
    }

    // Registra o pedido no Supabase (aparece no admin e no "Meus pedidos"). Se falhar, não trava a venda.
    if (external_reference) {
      try {
        await registrarPedido({
          event, external_reference, payer, entrega,
          cupom: (pctDesconto > 0 || cupomFrete) ? codigoCupom : null,
          itens: linhas.map((l) => ({ name: l.nome, qty: l.qty, price: l.preco })),
          total,
        });
      } catch (err) {
        console.error('Pedidos: erro ao registrar pedido:', err.message);
      }
    }

    // Devolve o total real pro site conferir com o que mostrou ao cliente
    return resposta(200, { init_point: data.init_point, total, frete });
  } catch (err) {
    console.error('create-preference:', err.message);
    return resposta(500, { error: 'Erro ao iniciar o pagamento. Tente de novo.' });
  }
};
