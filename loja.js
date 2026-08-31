  // Conexão com o Supabase (banco onde fica o estoque)
  const SUPABASE_URL = 'https://mfopdrdmthrztygsimex.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_SwOUdKjJtuNWmsZMZLgQag_EbxZr9xf';
  const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const products = [
    { id:1, name:"Boné Portofino Azul Marinho", desc:"Algodão premium · âncora bordada", price:109.90, color:"#0D1B2A", brim:"#081420", patch:"#CDBA9A" },
    { id:2, name:"Boné Portofino Verde", desc:"Algodão premium · âncora bordada", price:109.90, color:"#1B3D2D", brim:"#132a20", patch:"#CDBA9A" },
    { id:6, name:"Boné Portofino Branco", desc:"Algodão leve · verão", price:109.90, color:"#F2EFE6", brim:"#ddd6c4", patch:"#0D1B2A" },
  ];

  // Estoque de cada produto, carregado do Supabase. Enquanto não carrega,
  // assume-se disponível (null = "ainda não sei"), pra não travar a loja
  // se o Supabase estiver fora do ar.
  const estoquePorId = {};

  async function carregarEstoque(){
    try{
      const { data, error } = await supabaseClient.from('produtos').select('id, estoque');
      if(error) throw error;
      data.forEach(row => { estoquePorId[row.id] = row.estoque; });
    }catch(err){
      console.error('Não foi possível carregar o estoque do Supabase:', err);
    }
    if(document.getElementById('productGrid')) renderProducts();
    if(document.getElementById('productPage')) checkHashProduct();
  }

  function estoqueDe(id){
    return estoquePorId.hasOwnProperty(id) ? estoquePorId[id] : null; // null = desconhecido, trata como disponível
  }

  // Carrinho: guardado no localStorage pra "viajar" entre a Home e a página de Coleção
  const CART_STORAGE_KEY = 'portofino_cart';
  function loadCart(){
    try{
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    }catch(err){ return []; }
  }
  function saveCart(){
    try{ localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)); }catch(err){ /* segue sem salvar */ }
  }
  let cart = loadCart();

  function formatPrice(v){
    return v.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
  }

  function formatInstallment(price){
    const parcela = price / 3;
    return `3x de ${formatPrice(parcela)} sem juros`;
  }

  function capSVG(p, size){
    return `<div class="cap" style="width:${size}px; height:${size*0.8}px;">
      <div class="cap-top" style="background:${p.color}; height:${size*0.55}px; left:${size*0.1}px; right:${size*0.1}px; border-radius:${size*0.5}px ${size*0.5}px 6px 6px;"></div>
      <div class="cap-button" style="background:#B08A4E;"></div>
      ${p.rope ? `<div class="cap-rope" style="left:${size*0.1}px; right:${size*0.1}px;"></div>` : ''}
      <div class="cap-patch" style="color:${p.patch}; top:${size*0.24}px; font-size:${size*0.06}px;">PORTOFINO</div>
      <div class="cap-brim" style="background:${p.brim};"></div>
    </div>`;
  }

  let searchTerm = '';

  function renderProducts(){
    const grid = document.getElementById('productGrid');
    const termo = searchTerm.trim().toLowerCase();
    const filtrados = termo
      ? products.filter(p => p.name.toLowerCase().includes(termo) || p.desc.toLowerCase().includes(termo))
      : products;

    if(filtrados.length === 0){
      grid.innerHTML = `<p class="small" style="grid-column:1/-1; text-align:center; padding:40px 0;">Nenhum boné encontrado pra "${escapeHTML(searchTerm)}".</p>`;
      return;
    }

    grid.innerHTML = filtrados.map(p => {
      const estoque = estoqueDe(p.id);
      const esgotado = estoque !== null && estoque <= 0;
      const estoqueBaixo = estoque !== null && estoque > 0 && estoque <= 3;
      return `
      <div class="card ${esgotado ? 'esgotado-card' : ''}" onclick="openProduct(${p.id})" style="cursor:pointer;">
        ${capSVG(p, 150)}
        <h3>${p.name.toUpperCase()}</h3>
        <div class="desc">${p.desc}</div>
        <div class="price">${formatPrice(p.price)}</div>
        <div class="installment">${formatInstallment(p.price)}</div>
        ${estoqueBaixo ? `<div class="stock-warn">Últimas ${estoque} unidades</div>` : ''}
        <button class="add-btn ${esgotado ? 'esgotado' : ''}" ${esgotado ? 'disabled' : ''} onclick="event.stopPropagation(); addToCart(${p.id}, this)">${esgotado ? 'ESGOTADO' : 'ADICIONAR AO CARRINHO'}</button>
      </div>
    `;
    }).join('');
  }

  // Abre a página cheia do produto (estilo "página de produto" de e-commerce)
  function openProduct(id){
    const p = products.find(x => x.id === id);
    if(!p) return;
    if(!document.getElementById('colecao') || !document.getElementById('productPage')) return;
    const estoque = estoqueDe(id);
    const esgotado = estoque !== null && estoque <= 0;
    const estoqueBaixo = estoque !== null && estoque > 0 && estoque <= 3;

    const outros = products.filter(x => x.id !== id).slice(0, 3);
    ppQty = 1;

    document.getElementById('productPageContent').innerHTML = `
      <div class="pp-gallery">${capSVG(p, 340)}</div>
      <div class="pp-info">
        <h1>${p.name.toUpperCase()}</h1>
        <div class="stars-summary" id="starsSummary-${p.id}">Carregando avaliações…</div>
        <div class="pp-price">${formatPrice(p.price)}</div>
        <div class="installment" style="margin-bottom:14px;">${formatInstallment(p.price)}</div>
        ${esgotado
          ? `<div class="stock-warn" style="margin-bottom:14px;">Produto esgotado no momento</div>`
          : estoqueBaixo
            ? `<div class="stock-warn" style="margin-bottom:14px;">Últimas ${estoque} unidades</div>`
            : ''
        }
        ${!esgotado ? `
        <div class="pp-qty-row">
          <span>QUANTIDADE</span>
          <div class="qty-row">
            <button onclick="changeProductQty(-1)">−</button>
            <span id="ppQty">1</span>
            <button onclick="changeProductQty(1)">+</button>
          </div>
        </div>` : ''}
        <button class="add-btn ${esgotado ? 'esgotado' : ''}" ${esgotado ? 'disabled' : ''} onclick="addProductToCart(${p.id}, this)" style="width:100%;">
          ${esgotado ? 'ESGOTADO' : 'ADICIONAR AO CARRINHO'}
        </button>
        <div class="pp-details">
          <div class="pp-accordion">
            <button class="pp-accordion-head" onclick="toggleAccordion(this)">
              <span>DESCRIÇÃO</span><span class="pp-accordion-icon">+</span>
            </button>
            <div class="pp-accordion-body"><p>${p.desc}</p></div>
          </div>
          <div class="pp-accordion">
            <button class="pp-accordion-head" onclick="toggleAccordion(this)">
              <span>TAMANHO</span><span class="pp-accordion-icon">+</span>
            </button>
            <div class="pp-accordion-body"><p>Ajuste traseiro (strapback) — serve confortavelmente na maioria das cabeças adultas, perímetro aproximado de 55 a 60 cm.</p></div>
          </div>
          <div class="pp-accordion">
            <button class="pp-accordion-head" onclick="toggleAccordion(this)">
              <span>ENTREGA</span><span class="pp-accordion-icon">+</span>
            </button>
            <div class="pp-accordion-body"><p>Frete grátis em compras acima de R$250. Trocas em até 7 dias após o recebimento.</p></div>
          </div>
          <div class="pp-accordion">
            <button class="pp-accordion-head" onclick="toggleAccordion(this)">
              <span>AVALIAÇÕES</span><span class="pp-accordion-icon">+</span>
            </button>
            <div class="pp-accordion-body" id="reviewsBody-${p.id}"><p>Carregando avaliações…</p></div>
          </div>
        </div>
        ${outros.length ? `
        <div class="pp-tambem">
          <span>LEVE TAMBÉM</span>
          <div class="pp-tambem-grid">
            ${outros.map(o => `
              <div class="pp-tambem-item" onclick="openProduct(${o.id})">
                ${capSVG(o, 70)}
                <div class="pp-tambem-name">${o.name.toUpperCase()}</div>
                <div class="pp-tambem-price">${formatPrice(o.price)}</div>
              </div>
            `).join('')}
          </div>
        </div>` : ''}
      </div>
    `;

    document.getElementById('colecao').style.display = 'none';
    document.getElementById('productPage').style.display = 'block';
    window.scrollTo(0, 0);
    history.pushState({produto:id}, '', `#produto-${id}`);
    loadAndRenderReviews(p.id);
  }

  function closeProductPage(scrollTargetId){
    const colecaoEl = document.getElementById('colecao');
    const productPageEl = document.getElementById('productPage');
    if(colecaoEl) colecaoEl.style.display = '';
    if(productPageEl) productPageEl.style.display = 'none';
    const target = scrollTargetId ? document.getElementById(scrollTargetId) : null;
    if(target){ target.scrollIntoView({ behavior:'smooth' }); }
    else { window.scrollTo(0, 0); }
  }

  // Permite abrir um produto direto por link (ex: seusite.com/#produto-3) e usar o botão "voltar" do navegador
  function checkHashProduct(){
    const hash = window.location.hash.replace('#', '');
    const m = hash.match(/^produto-(\d+)$/);
    if(m){ openProduct(Number(m[1])); }
    else { closeProductPage(hash || null); }
  }
  window.addEventListener('popstate', checkHashProduct);
  window.addEventListener('hashchange', checkHashProduct);

  // Quantidade escolhida na página de produto (reinicia em 1 sempre que abre um produto)
  let ppQty = 1;
  function toggleAccordion(headEl){
    const accordion = headEl.closest('.pp-accordion');
    accordion.classList.toggle('open');
  }

  function changeProductQty(delta){
    const novo = ppQty + delta;
    if(novo < 1) return;
    ppQty = novo;
    const el = document.getElementById('ppQty');
    if(el) el.textContent = ppQty;
  }

  function addProductToCart(id, btn){
    for(let i=0; i<ppQty; i++){ addToCart(id, i === ppQty-1 ? btn : null); }
    ppQty = 1;
    const el = document.getElementById('ppQty');
    if(el) el.textContent = ppQty;
  }

  function addToCart(id, btn){
    const estoque = estoqueDe(id);
    const existing = cart.find(i => i.id === id);
    const qtyNoCarrinho = existing ? existing.qty : 0;
    if(estoque !== null && qtyNoCarrinho + 1 > estoque){
      if(btn){
        btn.textContent = "SEM ESTOQUE SUFICIENTE";
        setTimeout(()=>{ btn.textContent = "ADICIONAR AO CARRINHO"; }, 1500);
      }
      return;
    }
    if(existing){ existing.qty++; } else {
      const p = products.find(p => p.id === id);
      cart.push({ ...p, qty:1 });
    }
    saveCart();
    renderCart();
    if(btn){
      btn.textContent = "ADICIONADO ✓";
      btn.classList.add('added');
      setTimeout(()=>{ btn.textContent = "ADICIONAR AO CARRINHO"; btn.classList.remove('added'); }, 1200);
    }
    openDrawer();
  }

  function changeQty(id, delta){
    const item = cart.find(i => i.id === id);
    if(!item) return;
    item.qty += delta;
    if(item.qty <= 0){ cart = cart.filter(i => i.id !== id); }
    saveCart();
    renderCart();
  }

  function removeItem(id){
    cart = cart.filter(i => i.id !== id);
    saveCart();
    renderCart();
  }

  // Regras de frete: fixo abaixo do valor mínimo, grátis a partir dele
  const FRETE_GRATIS_ACIMA_DE = 250;
  const FRETE_FIXO = 19.90;

  function calcularFrete(subtotal){
    if(subtotal === 0) return 0;
    return subtotal >= FRETE_GRATIS_ACIMA_DE ? 0 : FRETE_FIXO;
  }

  function renderCart(){
    const itemsEl = document.getElementById('drawerItems');
    const countEl = document.getElementById('cartCount');
    const subtotalEl = document.getElementById('subtotalVal');
    const freteEl = document.getElementById('freteVal');
    const totalEl = document.getElementById('totalVal');
    const totalCount = cart.reduce((a,i)=>a+i.qty,0);
    countEl.textContent = totalCount;
    const subtotal = cart.reduce((a,i)=>a+i.qty*i.price,0);
    const frete = calcularFrete(subtotal);
    subtotalEl.textContent = formatPrice(subtotal);
    freteEl.textContent = frete === 0 ? 'Grátis' : formatPrice(frete);
    totalEl.textContent = formatPrice(subtotal + frete);

    if(cart.length === 0){
      itemsEl.innerHTML = `<div class="cart-empty">Seu carrinho está vazio.<br>Explore a coleção Portofino.</div>`;
      return;
    }
    itemsEl.innerHTML = cart.map(i => `
      <div class="cart-item">
        <div class="cart-cap-mini">
          <div class="m-top" style="background:${i.color};"></div>
          <div class="m-brim" style="background:${i.brim};"></div>
        </div>
        <div class="cart-item-info">
          <h4>PORTOFINO ${i.name.toUpperCase()}</h4>
          <div class="p">${formatPrice(i.price)}</div>
          <div class="qty-row">
            <button onclick="changeQty(${i.id}, -1)">−</button>
            <span>${i.qty}</span>
            <button onclick="changeQty(${i.id}, 1)">+</button>
            <span class="remove-link" onclick="removeItem(${i.id})">remover</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  // Drawer controls
  const drawer = document.getElementById('drawer');
  const overlay = document.getElementById('overlay');
  function openDrawer(){ drawer.classList.add('show'); overlay.classList.add('show'); }
  function closeDrawer(){ drawer.classList.remove('show'); overlay.classList.remove('show'); }
  document.getElementById('cartOpenBtn').onclick = openDrawer;
  document.getElementById('drawerClose').onclick = closeDrawer;
  overlay.onclick = () => { closeDrawer(); closeModal(); };

  // Checkout: primeiro coleta o endereço de entrega, depois manda pro pagamento
  const modalOverlay = document.getElementById('modalOverlay');
  const modalContent = document.getElementById('modalContent');
  const checkoutBtn = document.getElementById('checkoutBtn');

  function showModalMessage(html){
    modalContent.innerHTML = html;
    modalOverlay.classList.add('show');
  }
  function toggleMobileMenu(){
    document.getElementById('mobileMenu').classList.toggle('open');
  }
  function closeMobileMenu(){
    document.getElementById('mobileMenu').classList.remove('open');
  }

  // ===== BUSCA =====
  function toggleSearchBar(){
    const bar = document.getElementById('searchBar');
    if(!bar) return;
    bar.classList.toggle('open');
    if(bar.classList.contains('open')) document.getElementById('searchInput').focus();
  }
  function closeSearchBar(){
    document.getElementById('searchBar')?.classList.remove('open');
  }
  function handleSearchInput(e){
    searchTerm = e.target.value;
    if(document.getElementById('productGrid')) renderProducts();
  }
  function handleSearchKeydown(e){
    if(e.key !== 'Enter') return;
    // Na home (sem grid de produtos), a busca leva pra Coleção já filtrada
    if(!document.getElementById('productGrid')){
      window.location.href = `colecao.html?q=${encodeURIComponent(e.target.value)}`;
    }
  }
  (function initSearchUI(){
    const input = document.getElementById('searchInput');
    const toggleBtn = document.getElementById('searchToggleBtn');
    const closeBtn = document.getElementById('searchCloseBtn');
    if(toggleBtn) toggleBtn.addEventListener('click', toggleSearchBar);
    if(closeBtn) closeBtn.addEventListener('click', closeSearchBar);
    if(input){
      input.addEventListener('input', handleSearchInput);
      input.addEventListener('keydown', handleSearchKeydown);
      // Se veio de uma busca da home (?q=...), já abre com o termo preenchido
      const params = new URLSearchParams(window.location.search);
      const termoInicial = params.get('q');
      if(termoInicial){
        input.value = termoInicial;
        searchTerm = termoInicial;
        document.getElementById('searchBar')?.classList.add('open');
      }
    }
  })();

  function closeModal(){
    modalOverlay.classList.remove('show');
    document.getElementById('modalBox').classList.remove('modal-wide');
  }

  const infoContent = {
    trocas: {
      title: 'TROCAS E DEVOLUÇÕES',
      body: `Você tem até 7 dias corridos após o recebimento para solicitar troca ou devolução, conforme o Código de Defesa do Consumidor.
      <br><br>Entre em contato pelo e-mail <a href="mailto:companyportofino@gmail.com">companyportofino@gmail.com</a> informando o número do pedido — respondemos com o passo a passo.`
    },
    frete: {
      title: 'FRETE E ENTREGA',
      body: `Enviamos para todo o Brasil pelos Correios. Frete grátis em compras acima de R$250.
      <br><br>Prazo médio de envio: 2 a 5 dias úteis após a confirmação do pagamento, mais o prazo de transporte dos Correios até seu endereço.`
    },
    tamanhos: {
      title: 'GUIA DE TAMANHOS',
      body: `Nossos bonés têm ajuste traseiro (strapback), servindo confortavelmente na maioria das cabeças adultas — perímetro aproximado de 55 a 60 cm.
      <br><br>Dúvidas sobre um modelo específico? Manda um e-mail pra <a href="mailto:companyportofino@gmail.com">companyportofino@gmail.com</a>.`
    }
  };

  function openInfoModal(key){
    const info = infoContent[key];
    if(!info) return;
    modalContent.innerHTML = `<h3>${info.title}</h3><p class="small" style="text-align:left; line-height:1.7;">${info.body}</p>`;
    modalOverlay.classList.add('show');
  }

  // ===== CONTA DO CLIENTE (login/cadastro) =====
  let currentUser = null;
  let currentProfile = null;

  async function initAuth(){
    const { data: { session } } = await supabaseClient.auth.getSession();
    currentUser = session?.user || null;
    if(currentUser) await loadProfile();
    updateAuthUI();
    supabaseClient.auth.onAuthStateChange(async (_event, session) => {
      currentUser = session?.user || null;
      if(currentUser) await loadProfile(); else currentProfile = null;
      updateAuthUI();
    });
  }

  async function loadProfile(){
    if(!currentUser) return;
    try{
      const { data, error } = await supabaseClient.from('perfis').select('*').eq('user_id', currentUser.id).maybeSingle();
      if(error) throw error;
      currentProfile = data || null;
    }catch(err){
      console.error('Conta: erro ao carregar perfil', err);
    }
  }

  function updateAuthUI(){
    const btn = document.getElementById('accountBtn');
    if(!btn) return;
    btn.title = currentUser ? 'Minha conta' : 'Entrar';
    btn.classList.toggle('logged-in', !!currentUser);
  }

  function openAccountModal(){
    document.getElementById('modalBox').classList.remove('modal-wide');
    if(currentUser){ renderAccountLogged(); }
    else { renderAuthForm('login'); }
    modalOverlay.classList.add('show');
  }

  function renderAuthForm(mode){
    const isLogin = mode === 'login';
    modalContent.innerHTML = `
      <h3>${isLogin ? 'ENTRAR' : 'CRIAR CONTA'}</h3>
      <form id="authForm">
        ${!isLogin ? `<div class="field"><label>NOME</label><input type="text" name="nome" required></div>` : ''}
        <div class="field"><label>E-MAIL</label><input type="email" name="email" required></div>
        <div class="field"><label>SENHA</label><input type="password" name="senha" minlength="6" required></div>
        <p class="review-msg" id="authMsg"></p>
        <button type="submit" class="btn" style="width:100%;">${isLogin ? 'ENTRAR' : 'CRIAR CONTA'}</button>
      </form>
      <p class="small" style="text-align:center; margin-top:16px;">
        ${isLogin ? 'Não tem conta?' : 'Já tem conta?'}
        <a href="#" onclick="renderAuthForm('${isLogin ? 'signup' : 'login'}'); return false;" style="text-decoration:underline;">${isLogin ? 'Criar conta' : 'Entrar'}</a>
      </p>
    `;
    document.getElementById('authForm').onsubmit = isLogin ? handleLogin : handleSignup;
  }

  async function handleLogin(e){
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector('button[type=submit]');
    const msg = document.getElementById('authMsg');
    btn.disabled = true; btn.textContent = 'ENTRANDO...';
    msg.textContent = ''; msg.className = 'review-msg';
    try{
      const { error } = await supabaseClient.auth.signInWithPassword({
        email: fd.get('email'), password: fd.get('senha')
      });
      if(error) throw error;
      closeModal();
    }catch(err){
      msg.textContent = 'E-mail ou senha incorretos.';
      msg.className = 'review-msg error';
      btn.disabled = false; btn.textContent = 'ENTRAR';
    }
  }

  async function handleSignup(e){
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector('button[type=submit]');
    const msg = document.getElementById('authMsg');
    btn.disabled = true; btn.textContent = 'CRIANDO...';
    msg.textContent = ''; msg.className = 'review-msg';
    try{
      const { data, error } = await supabaseClient.auth.signUp({
        email: fd.get('email'), password: fd.get('senha'),
        options: { data: { nome: fd.get('nome') } }
      });
      if(error) throw error;
      if(data.session){
        closeModal();
      } else {
        msg.textContent = 'Conta criada! Verifique seu e-mail pra confirmar antes de entrar.';
        msg.className = 'review-msg success';
        btn.disabled = false; btn.textContent = 'CRIAR CONTA';
      }
    }catch(err){
      msg.textContent = err.message.includes('already registered') ? 'Esse e-mail já tem uma conta.' : 'Não foi possível criar a conta agora.';
      msg.className = 'review-msg error';
      btn.disabled = false; btn.textContent = 'CRIAR CONTA';
    }
  }

  async function handleLogout(){
    await supabaseClient.auth.signOut();
    closeModal();
  }

  function renderAccountLogged(){
    modalContent.innerHTML = `
      <h3>MINHA CONTA</h3>
      <div class="account-tabs">
        <button class="account-tab active" id="tabPedidos" onclick="switchAccountTab('pedidos')">MEUS PEDIDOS</button>
        <button class="account-tab" id="tabDados" onclick="switchAccountTab('dados')">MEUS DADOS</button>
      </div>
      <div id="accountTabContent"></div>
      <button class="btn outline" style="width:100%; margin-top:18px;" onclick="handleLogout()">SAIR DA CONTA</button>
    `;
    switchAccountTab('pedidos');
  }

  function switchAccountTab(tab){
    document.getElementById('tabPedidos').classList.toggle('active', tab === 'pedidos');
    document.getElementById('tabDados').classList.toggle('active', tab === 'dados');
    if(tab === 'pedidos') renderPedidosTab(); else renderDadosTab();
  }

  async function renderPedidosTab(){
    const el = document.getElementById('accountTabContent');
    el.innerHTML = '<p class="small">Carregando pedidos…</p>';
    try{
      const { data, error } = await supabaseClient
        .from('pedidos').select('*').eq('user_id', currentUser.id).order('criado_em', { ascending:false });
      if(error) throw error;
      if(!data || data.length === 0){
        el.innerHTML = '<p class="small">Você ainda não fez nenhum pedido.</p>';
        return;
      }
      const statusLabel = { pendente:'Aguardando pagamento', aprovado:'Pago' };
      el.innerHTML = data.map(p => `
        <div class="review-item">
          <div class="review-name">Pedido ${p.numero_pedido} — ${statusLabel[p.status] || p.status}</div>
          <p class="review-comment">${(p.itens || []).map(i => `${i.qty}x ${i.name}`).join(', ')}</p>
          <p class="review-comment"><strong>${formatPrice(Number(p.total))}</strong> — ${new Date(p.criado_em).toLocaleDateString('pt-BR')}</p>
        </div>
      `).join('');
    }catch(err){
      el.innerHTML = '<p class="small">Não foi possível carregar seus pedidos agora.</p>';
    }
  }

  function renderDadosTab(){
    const el = document.getElementById('accountTabContent');
    const p = currentProfile || {};
    el.innerHTML = `
      <form id="perfilForm">
        <div class="field"><label>NOME COMPLETO</label><input type="text" name="nome" value="${p.nome || ''}" required></div>
        <div class="field"><label>CPF</label><input type="text" name="cpf" value="${p.cpf || ''}"></div>
        <div class="field"><label>TELEFONE</label><input type="tel" name="telefone" value="${p.telefone || ''}"></div>
        <div class="field"><label>CEP</label><input type="text" name="cep" id="cepInputPerfil" value="${p.cep || ''}"></div>
        <div class="field"><label>ENDEREÇO</label><input type="text" name="endereco" id="enderecoInputPerfil" value="${p.endereco || ''}"></div>
        <div style="display:flex; gap:10px;">
          <div class="field" style="flex:1;"><label>NÚMERO</label><input type="text" name="numero" value="${p.numero || ''}"></div>
          <div class="field" style="flex:2;"><label>COMPLEMENTO</label><input type="text" name="complemento" value="${p.complemento || ''}"></div>
        </div>
        <div class="field"><label>BAIRRO</label><input type="text" name="bairro" id="bairroInputPerfil" value="${p.bairro || ''}"></div>
        <div style="display:flex; gap:10px;">
          <div class="field" style="flex:2;"><label>CIDADE</label><input type="text" name="cidade" id="cidadeInputPerfil" value="${p.cidade || ''}"></div>
          <div class="field" style="flex:1;"><label>UF</label><input type="text" name="estado" id="estadoInputPerfil" maxlength="2" value="${p.estado || ''}"></div>
        </div>
        <p class="review-msg" id="perfilMsg"></p>
        <button type="submit" class="btn" style="width:100%;">SALVAR DADOS</button>
      </form>
    `;
    document.getElementById('cepInputPerfil').addEventListener('blur', (e) => lookupCep(e, 'Perfil'));
    document.getElementById('perfilForm').onsubmit = handleSalvarPerfil;
  }

  async function handleSalvarPerfil(e){
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector('button[type=submit]');
    const msg = document.getElementById('perfilMsg');
    btn.disabled = true; btn.textContent = 'SALVANDO...';
    const dados = {
      user_id: currentUser.id,
      nome: fd.get('nome'), cpf: fd.get('cpf'), telefone: fd.get('telefone'),
      cep: fd.get('cep'), endereco: fd.get('endereco'), numero: fd.get('numero'),
      complemento: fd.get('complemento'), bairro: fd.get('bairro'),
      cidade: fd.get('cidade'), estado: fd.get('estado'),
    };
    try{
      const { error } = await supabaseClient.from('perfis').upsert(dados);
      if(error) throw error;
      currentProfile = dados;
      msg.textContent = 'Dados salvos!';
      msg.className = 'review-msg success';
    }catch(err){
      msg.textContent = 'Não foi possível salvar agora.';
      msg.className = 'review-msg error';
    }finally{
      btn.disabled = false; btn.textContent = 'SALVAR DADOS';
    }
  }

  document.getElementById('accountBtn')?.addEventListener('click', openAccountModal);
  initAuth();

  function openShippingModal(){
    if(cart.length === 0) return;
    document.getElementById('modalBox').classList.remove('modal-wide');
    const subtotal = cart.reduce((a,i)=>a+i.qty*i.price,0);
    const frete = calcularFrete(subtotal);
    const p = currentProfile || {};
    modalContent.innerHTML = `
      <h3>DADOS PARA ENTREGA</h3>
      <p class="small">Subtotal: ${formatPrice(subtotal)} + Frete: ${frete === 0 ? 'Grátis' : formatPrice(frete)} = <strong>${formatPrice(subtotal + frete)}</strong></p>
      <form id="shippingForm">
        <div class="field"><label>NOME COMPLETO</label><input type="text" name="nome" value="${p.nome || ''}" required></div>
        <div class="field"><label>CPF</label><input type="text" name="cpf" value="${p.cpf || ''}" required></div>
        <div class="field"><label>E-MAIL</label><input type="email" name="email" value="${currentUser?.email || ''}" required></div>
        <div class="field"><label>TELEFONE</label><input type="tel" name="telefone" value="${p.telefone || ''}" required></div>
        <div class="field"><label>CEP</label><input type="text" name="cep" id="cepInput" value="${p.cep || ''}" placeholder="00000-000" required></div>
        <div class="field"><label>ENDEREÇO</label><input type="text" name="endereco" id="enderecoInput" value="${p.endereco || ''}" required></div>
        <div style="display:flex; gap:10px;">
          <div class="field" style="flex:1;"><label>NÚMERO</label><input type="text" name="numero" value="${p.numero || ''}" required></div>
          <div class="field" style="flex:2;"><label>COMPLEMENTO</label><input type="text" name="complemento" value="${p.complemento || ''}"></div>
        </div>
        <div class="field"><label>BAIRRO</label><input type="text" name="bairro" id="bairroInput" value="${p.bairro || ''}" required></div>
        <div style="display:flex; gap:10px;">
          <div class="field" style="flex:2;"><label>CIDADE</label><input type="text" name="cidade" id="cidadeInput" value="${p.cidade || ''}" required></div>
          <div class="field" style="flex:1;"><label>UF</label><input type="text" name="estado" id="estadoInput" maxlength="2" value="${p.estado || ''}" required></div>
        </div>
        <button type="submit" class="btn" style="width:100%; margin-top:8px;">IR PARA O PAGAMENTO</button>
      </form>
    `;
    modalOverlay.classList.add('show');
    document.getElementById('cepInput').addEventListener('blur', lookupCep);
    document.getElementById('shippingForm').onsubmit = handleShippingSubmit;
  }

  // Busca o endereço automaticamente a partir do CEP (API pública ViaCEP)
  async function lookupCep(e, suffix){
    suffix = suffix || '';
    const cep = e.target.value.replace(/\D/g,'');
    if(cep.length !== 8) return;
    try{
      const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await resp.json();
      if(!data.erro){
        document.getElementById(`endereco${suffix ? 'Input'+suffix : 'Input'}`).value = data.logradouro || '';
        document.getElementById(`bairro${suffix ? 'Input'+suffix : 'Input'}`).value = data.bairro || '';
        document.getElementById(`cidade${suffix ? 'Input'+suffix : 'Input'}`).value = data.localidade || '';
        document.getElementById(`estado${suffix ? 'Input'+suffix : 'Input'}`).value = data.uf || '';
      }
    }catch(err){ /* se a busca falhar, o cliente preenche na mão mesmo */ }
  }

  async function handleShippingSubmit(e){
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('button[type=submit]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'ENVIANDO...';

    const orderNumber = 'PTF-' + Math.floor(10000 + Math.random()*89999);
    const fd = new FormData(form);
    const payer = { name: fd.get('nome'), email: fd.get('email') };
    const itemsDesc = cart.map(i => `${i.qty}x ${i.name}`).join(', ');
    const subtotal = cart.reduce((a,i)=>a+i.qty*i.price,0);
    const frete = calcularFrete(subtotal);

    // Salva o pedido + endereço no Netlify Forms (você recebe por e-mail / vê no painel)
    const body = new URLSearchParams({
      'form-name':'pedidos',
      pedido: orderNumber,
      nome: fd.get('nome'),
      cpf: fd.get('cpf'),
      email: fd.get('email'),
      telefone: fd.get('telefone'),
      cep: fd.get('cep'),
      endereco: fd.get('endereco'),
      numero: fd.get('numero'),
      complemento: fd.get('complemento') || '',
      bairro: fd.get('bairro'),
      cidade: fd.get('cidade'),
      estado: fd.get('estado'),
      itens: itemsDesc,
      total: formatPrice(subtotal + frete)
    });

    try{
      await fetch('/', {
        method:'POST',
        headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
        body: body.toString()
      });
    }catch(err){
      // mesmo que o registro falhe, seguimos pro pagamento — não trava a venda
    }

    // Se o cliente estiver logado: salva o endereço pra próxima compra e registra no histórico de pedidos
    if(currentUser){
      const dadosPerfil = {
        user_id: currentUser.id,
        nome: fd.get('nome'), cpf: fd.get('cpf'), telefone: fd.get('telefone'),
        cep: fd.get('cep'), endereco: fd.get('endereco'), numero: fd.get('numero'),
        complemento: fd.get('complemento') || '', bairro: fd.get('bairro'),
        cidade: fd.get('cidade'), estado: fd.get('estado'),
      };
      try{
        await supabaseClient.from('perfis').upsert(dadosPerfil);
        currentProfile = dadosPerfil;
      }catch(err){ /* não trava a compra se isso falhar */ }

      try{
        await supabaseClient.from('pedidos').insert({
          user_id: currentUser.id,
          numero_pedido: orderNumber,
          itens: cart.map(i => ({ name:i.name, qty:i.qty, price:i.price })),
          total: subtotal + frete,
          status: 'pendente',
        });
      }catch(err){ /* não trava a compra se isso falhar */ }
    }

    startCheckout(orderNumber, payer, frete);
  }

  async function startCheckout(orderNumber, payer, frete){
    checkoutBtn.disabled = true;
    checkoutBtn.textContent = 'PROCESSANDO...';
    try{
      const items = cart.map(i => ({ productId:i.id, name:i.name, qty:i.qty, price:i.price }));
      if(frete > 0){
        items.push({ name:'Frete', qty:1, price:frete });
      }
      const resp = await fetch('/.netlify/functions/create-preference', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({
          items: items,
          external_reference: orderNumber,
          payer: payer
        })
      });
      const data = await resp.json();
      if(resp.ok && data.init_point){
        window.location.href = data.init_point; // leva o cliente pro checkout do Mercado Pago
      } else {
        showModalMessage(`
          <h3>NÃO FOI POSSÍVEL INICIAR O PAGAMENTO</h3>
          <p class="small">Tente novamente em instantes. Se o problema continuar, entre em contato com a loja.</p>
        `);
        checkoutBtn.disabled = false;
        checkoutBtn.textContent = 'FINALIZAR COMPRA';
      }
    } catch(err){
      showModalMessage(`
        <h3>ERRO DE CONEXÃO</h3>
        <p class="small">Não conseguimos falar com o servidor de pagamento agora. Tente novamente.</p>
      `);
      checkoutBtn.disabled = false;
      checkoutBtn.textContent = 'FINALIZAR COMPRA';
    }
  }

  checkoutBtn.onclick = openShippingModal;
  document.getElementById('modalClose').onclick = closeModal;

  // ===== AVALIAÇÕES =====
  function renderStarsHTML(nota){
    const cheias = Math.round(nota);
    let out = '';
    for(let i=1; i<=5; i++){ out += i <= cheias ? '★' : '☆'; }
    return out;
  }

  async function loadAndRenderReviews(productId){
    const summaryEl = document.getElementById(`starsSummary-${productId}`);
    const bodyEl = document.getElementById(`reviewsBody-${productId}`);
    try{
      const { data, error } = await supabaseClient
        .from('avaliacoes')
        .select('nome, nota, comentario, criado_em')
        .eq('produto_id', productId)
        .order('criado_em', { ascending: false });
      if(error) throw error;

      const total = data.length;
      const media = total > 0 ? data.reduce((a,r) => a + r.nota, 0) / total : 0;

      if(summaryEl){
        summaryEl.innerHTML = total > 0
          ? `<span class="stars">${renderStarsHTML(media)}</span> <span class="stars-count">${media.toFixed(1)} · ${total} avaliaç${total===1?'ão':'ões'}</span>`
          : `<span class="stars-count">Seja o primeiro a avaliar</span>`;
      }

      if(bodyEl){
        bodyEl.innerHTML = `
          ${total === 0 ? `<p class="small" style="margin-bottom:14px;">Ainda não há avaliações desse produto.</p>` : data.map(r => `
            <div class="review-item">
              <div class="review-stars">${renderStarsHTML(r.nota)}</div>
              <div class="review-name">${escapeHTML(r.nome)}</div>
              ${r.comentario ? `<p class="review-comment">${escapeHTML(r.comentario)}</p>` : ''}
            </div>
          `).join('')}
          <div class="review-form">
            <span class="review-form-title">DEIXE SUA AVALIAÇÃO</span>
            <select id="reviewStars-${productId}">
              <option value="5">★★★★★ — Ótimo</option>
              <option value="4">★★★★☆ — Bom</option>
              <option value="3">★★★☆☆ — Ok</option>
              <option value="2">★★☆☆☆ — Ruim</option>
              <option value="1">★☆☆☆☆ — Péssimo</option>
            </select>
            <input type="text" id="reviewName-${productId}" placeholder="Seu nome" maxlength="60">
            <textarea id="reviewComment-${productId}" placeholder="Conte como foi sua experiência (opcional)" maxlength="400" rows="3"></textarea>
            <button class="add-btn" style="width:100%;" onclick="submitReview(${productId})">ENVIAR AVALIAÇÃO</button>
            <div id="reviewMsg-${productId}" class="review-msg"></div>
          </div>
        `;
      }
    }catch(err){
      console.error('Avaliações: erro ao carregar:', err.message);
      if(bodyEl) bodyEl.innerHTML = `<p class="small">Não foi possível carregar as avaliações agora.</p>`;
      if(summaryEl) summaryEl.innerHTML = '';
    }
  }

  function escapeHTML(str){
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  async function submitReview(productId){
    const nomeEl = document.getElementById(`reviewName-${productId}`);
    const notaEl = document.getElementById(`reviewStars-${productId}`);
    const comentarioEl = document.getElementById(`reviewComment-${productId}`);
    const msgEl = document.getElementById(`reviewMsg-${productId}`);

    const nome = nomeEl.value.trim();
    if(!nome){
      msgEl.textContent = 'Digite seu nome antes de enviar.';
      msgEl.className = 'review-msg error';
      return;
    }

    msgEl.textContent = 'Enviando...';
    msgEl.className = 'review-msg';

    try{
      const { error } = await supabaseClient.from('avaliacoes').insert({
        produto_id: productId,
        nome: nome,
        nota: Number(notaEl.value),
        comentario: comentarioEl.value.trim(),
      });
      if(error) throw error;
      await loadAndRenderReviews(productId);
      const novoMsg = document.getElementById(`reviewMsg-${productId}`);
      if(novoMsg){
        novoMsg.textContent = 'Obrigado pela sua avaliação!';
        novoMsg.className = 'review-msg success';
      }
    }catch(err){
      console.error('Avaliações: erro ao enviar:', err.message);
      msgEl.textContent = 'Não foi possível enviar agora. Tente novamente.';
      msgEl.className = 'review-msg error';
    }
  }

  carregarEstoque();
  renderCart();
