// Script compartilhado das páginas pós-compra (success, pending, failure).
// Lê o resumo do pedido que o loja.js salvou antes de ir pro Mercado Pago.
(function(){
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('external_reference');
  const modo = document.body.dataset.modo; // 'aprovado' | 'pendente' | 'falha'

  let pedido = null;
  try{ pedido = JSON.parse(localStorage.getItem('portofino_ultimo_pedido') || 'null'); }catch(e){}
  // Só usa o resumo se for do mesmo pedido (ou, sem número na URL, se for recente: até 24h)
  if(pedido && ref && pedido.numero !== ref) pedido = null;
  if(pedido && !ref && Date.now() - (pedido.criadoEm || 0) > 24*60*60*1000) pedido = null;

  // Pedido feito (pago ou aguardando Pix/boleto): esvazia o carrinho.
  // Na falha o carrinho fica, pro cliente tentar de novo.
  if(modo === 'aprovado' || modo === 'pendente'){
    try{ localStorage.removeItem('portofino_cart'); }catch(e){}
  }

  const brl = v => Number(v || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const $ = id => document.getElementById(id);

  const numero = ref || (pedido && pedido.numero);
  if(numero && $('numPedido')){
    $('numPedido').innerHTML = `PEDIDO <strong>${esc(numero)}</strong>`;
    $('numPedido').hidden = false;
  }

  if(pedido && $('resumo')){
    const itens = (pedido.itens || []).map(i =>
      `<div class="row item"><span>${esc(i.qty)}x ${esc(i.name)}</span><span>${brl(i.price * i.qty)}</span></div>`
    ).join('');
    $('resumo').innerHTML = `
      <h2>RESUMO</h2>
      ${itens}
      <div class="row muted"><span>Subtotal</span><span>${brl(pedido.subtotal)}</span></div>
      ${pedido.desconto > 0 ? `<div class="row muted"><span>Desconto${pedido.cupom ? ' (' + esc(pedido.cupom) + ')' : ''}</span><span>− ${brl(pedido.desconto)}</span></div>` : ''}
      <div class="row muted"><span>Frete</span><span>${pedido.frete > 0 ? brl(pedido.frete) : 'Grátis'}</span></div>
      <div class="row total"><span>Total</span><span>${brl(pedido.total)}</span></div>`;
    $('resumo').hidden = false;

    const e = pedido.entrega;
    if(e && e.endereco && $('entrega')){
      $('entrega').innerHTML = `
        <h2>ENTREGA</h2>
        <p>${esc(e.nome)}<br>${esc(e.endereco)}${e.bairro ? ' — ' + esc(e.bairro) : ''}<br>
        ${esc(e.cidade)}/${esc(e.uf)} · CEP ${esc(e.cep)}</p>
        ${e.prazo ? `<p class="muted" style="margin-top:8px;">Prazo estimado: ${esc(e.prazo)}</p>` : ''}`;
      $('entrega').hidden = false;
    }
  }

  // Botão "Meus pedidos" só aparece pra quem comprou logado
  if(pedido && pedido.logado && $('btnPedidos')) $('btnPedidos').hidden = false;

  // Link de dúvida já com o número do pedido no assunto
  const mail = $('mailDuvida');
  if(mail && numero) mail.href = `mailto:companyportofino@gmail.com?subject=${encodeURIComponent('Pedido ' + numero)}`;
})();
