/* ==========================================================
   ANIMATIONS.JS — camada de animação da Portofino
   Não mexe em preço, estoque, carrinho, pagamento ou Supabase.
   Só observa o DOM e adiciona/remove classes de animação.
   ========================================================== */
(function () {
  "use strict";

  // 1) Fade de entrada da página
  document.addEventListener("DOMContentLoaded", function () {
    requestAnimationFrame(function () {
      document.body.classList.add("pf-loaded");
    });
  });

  // 2) Reveal ao rolar (para seções marcadas com data-reveal)
  function markStaticReveals() {
    var candidates = [
      { sel: ".cat-hero-panel", type: "zoom" },
      { sel: ".about-art", type: "left" },
      { sel: ".about-text", type: "right" },
      { sel: ".newsletter .wrap", type: "up" },
      { sel: ".section-head", type: "up" },
      { sel: ".foot-grid > div", type: "up" },
    ];
    candidates.forEach(function (c) {
      document.querySelectorAll(c.sel).forEach(function (el, i) {
        if (!el.hasAttribute("data-reveal")) {
          el.setAttribute("data-reveal", c.type === "up" ? "" : c.type);
          if (i > 0 && i < 5) el.setAttribute("data-reveal-delay", String(i));
        }
      });
    });
  }

  var io = ("IntersectionObserver" in window)
    ? new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("pf-in");
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
      )
    : null;

  function observeReveals(root) {
    var scope = root || document;
    scope.querySelectorAll("[data-reveal]:not(.pf-in)").forEach(function (el) {
      if (io) io.observe(el);
      else el.classList.add("pf-in"); // fallback sem suporte a IntersectionObserver
    });
  }

  // 3) Cards do catálogo/produto injetados dinamicamente pela loja.js
  function animateNewCards(container) {
    if (!container) return;
    var seen = new WeakSet();
    var mo = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          var cards = node.classList && node.classList.contains("card")
            ? [node]
            : node.querySelectorAll
            ? Array.prototype.slice.call(node.querySelectorAll(".card"))
            : [];
          cards.forEach(function (card, idx) {
            if (seen.has(card)) return;
            seen.add(card);
            card.style.animationDelay = (idx * 0.06) + "s";
            card.classList.add("pf-card-in");
          });

          // itens do carrinho
          var cartItems = node.classList && node.classList.contains("cart-item")
            ? [node]
            : node.querySelectorAll
            ? Array.prototype.slice.call(node.querySelectorAll(".cart-item"))
            : [];
          cartItems.forEach(function (item, idx) {
            item.style.animationDelay = (idx * 0.05) + "s";
          });
        });
      });
    });
    mo.observe(container, { childList: true, subtree: true });
  }

  // 4) Bump no badge do carrinho quando o número muda
  function watchCartBadge() {
    var badge = document.getElementById("cartCount");
    if (!badge) return;
    var lastVal = badge.textContent;
    var mo = new MutationObserver(function () {
      if (badge.textContent !== lastVal) {
        lastVal = badge.textContent;
        badge.classList.remove("pf-bump");
        void badge.offsetWidth; // reinicia a animação
        badge.classList.add("pf-bump");
      }
    });
    mo.observe(badge, { childList: true, characterData: true, subtree: true });
  }

  document.addEventListener("DOMContentLoaded", function () {
    markStaticReveals();
    observeReveals();
    animateNewCards(document.getElementById("productGrid"));
    animateNewCards(document.getElementById("productPageContent"));
    animateNewCards(document.getElementById("drawerItems"));
    watchCartBadge();

    // Reavalia caso novos elementos com data-reveal apareçam depois (ex.: página de produto)
    var bodyObserver = new MutationObserver(function () {
      observeReveals();
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });
  });
})();
