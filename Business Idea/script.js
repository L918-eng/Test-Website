/* Shop functionality: product modals, cart drawer, persistence and checkout helpers. */
(function () {
  'use strict';

  const STORAGE_KEY = 'business-idea-cart';
  const FAVORITES_KEY = 'business-idea-favorites';
  const RECENT_KEY = 'business-idea-recent';
  const CART_EVENT = 'cart:updated';
  const state = { items: loadCart(), discount: 0.15 };
  const favorites = new Set(loadStoredArray(FAVORITES_KEY));
  const checkoutState = { shipping: 0, coupon: 0 };

  const money = value => new Intl.NumberFormat('de-DE', {
    style: 'currency', currency: 'EUR'
  }).format(Number(value) || 0);

  function loadCart() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(saved) ? saved.filter(item => item && item.id && item.quantity > 0) : [];
    } catch (_) {
      return [];
    }
  }

  function loadStoredArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function saveCart() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
    document.dispatchEvent(new CustomEvent(CART_EVENT, { detail: getCart() }));
    render();
  }

  function addToCart(product, quantity = 1) {
    if (!product || !product.id || !Number.isFinite(Number(product.price))) return;
    const amount = Math.max(1, parseInt(quantity, 10) || 1);
    const existing = state.items.find(item => item.id === String(product.id));

    if (existing) {
      existing.quantity += amount;
    } else {
      state.items.push({
        id: String(product.id),
        name: product.name || 'Produkt',
        price: Number(product.price),
        image: product.image || '',
        quantity: amount,
        contents: Array.isArray(product.contents) ? product.contents : [],
        savings: Number(product.savings) || 0
      });
    }

    saveCart();
    closeProductModal();
    showCartConfirmation(product, amount);
  }

  function showCartConfirmation(product, quantity) {
    const cartButton = document.querySelector('[data-open-cart]');
    const cartCount = document.querySelector('[data-cart-count]');
    let toast = document.querySelector('[data-cart-toast]');

    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'cart-toast';
      toast.dataset.cartToast = 'true';
      document.body.appendChild(toast);
    }

    toast.innerHTML = `<button type="button" class="toast-close" aria-label="Benachrichtigung schließen" data-close-cart-toast>×</button><strong>Zum Warenkorb hinzugefügt</strong><span>${escapeHtml(product.name || 'Produkt')} · ${quantity} Stück</span>`;
    toast.classList.remove('is-visible');
    window.requestAnimationFrame(() => toast.classList.add('is-visible'));

    if (cartButton) {
      cartButton.classList.remove('cart-button-pulse');
      window.requestAnimationFrame(() => cartButton.classList.add('cart-button-pulse'));
    }

    if (cartCount) {
      cartCount.classList.remove('cart-count-pop');
      window.requestAnimationFrame(() => cartCount.classList.add('cart-count-pop'));
    }

    window.clearTimeout(showCartConfirmation.timeout);
    showCartConfirmation.timeout = window.setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 3200);
  }

  function updateQuantity(id, quantity) {
    const item = state.items.find(entry => entry.id === String(id));
    if (!item) return;

    item.quantity = Math.max(0, parseInt(quantity, 10) || 0);
    state.items = state.items.filter(entry => entry.quantity > 0);
    saveCart();
  }

  function removeFromCart(id) {
    state.items = state.items.filter(item => item.id !== String(id));
    saveCart();
  }

  function getCart() {
    const subtotal = state.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const shipping = subtotal === 0 || subtotal >= 50 ? 0 : 4.9;
    const discount = subtotal > 0 ? Math.min(subtotal, subtotal * state.discount) : 0;
    return {
      items: state.items.map(item => ({ ...item })),
      count: state.items.reduce((n, item) => n + item.quantity, 0),
      subtotal,
      shipping,
      discount,
      total: subtotal + shipping - discount
    };
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function render() {
    const cart = getCart();
    const bundleSavings = cart.items.reduce((sum, item) => sum + (Number(item.savings) || 0) * item.quantity, 0);
    const checkoutShipping = document.querySelector('[data-payment-form]') ? checkoutState.shipping : cart.shipping;
    const checkoutTotal = cart.subtotal + checkoutShipping - cart.discount - checkoutState.coupon;

    document.querySelectorAll('[data-cart-count]').forEach(el => {
      el.textContent = cart.count;
      el.hidden = cart.count === 0;
    });

    document.querySelectorAll('[data-cart-subtotal]').forEach(el => {
      el.textContent = money(cart.subtotal);
    });

    document.querySelectorAll('[data-cart-shipping]').forEach(el => {
      el.textContent = cart.shipping ? money(cart.shipping) : 'Kostenlos';
    });

    document.querySelectorAll('[data-cart-discount]').forEach(el => {
      el.textContent = `−${money(cart.discount)}`;
    });

    document.querySelectorAll('[data-cart-total]').forEach(el => {
      el.textContent = money(document.querySelector('[data-payment-form]') ? checkoutTotal : cart.total);
    });

    document.querySelectorAll('[data-checkout-bundle-savings]').forEach(el => {
      el.textContent = `−${money(bundleSavings)}`;
    });

    document.querySelectorAll('[data-coupon-discount]').forEach(el => {
      el.textContent = `−${money(checkoutState.coupon)}`;
    });

    if (document.querySelector('[data-payment-form]')) {
      document.querySelectorAll('[data-cart-shipping]').forEach(el => {
        el.textContent = checkoutShipping ? money(checkoutShipping) : 'Kostenlos';
      });
    }

    document.querySelectorAll('[data-shipping-progress]').forEach(progress => {
      const goal = 50;
      const remaining = Math.max(0, goal - cart.subtotal);
      const percentage = Math.min(100, (cart.subtotal / goal) * 100);
      progress.hidden = cart.subtotal === 0;
      const message = progress.querySelector('[data-shipping-message]');
      const amount = progress.querySelector('[data-shipping-remaining]');
      const bar = progress.querySelector('[data-shipping-bar]');
      if (message) message.textContent = remaining ? 'Noch bis zum Gratisversand' : 'Gratisversand erreicht';
      if (amount) amount.textContent = remaining ? money(remaining) : '✓';
      if (bar) bar.style.width = `${percentage}%`;
    });

    document.querySelectorAll('[data-favorite]').forEach(button => {
      const isFavorite = favorites.has(button.dataset.favorite);
      button.classList.toggle('is-favorite', isFavorite);
      button.textContent = isFavorite ? '♥' : '♡';
    });

    document.querySelectorAll('[data-cart-items]').forEach(container => {
      if (!cart.items.length) {
        container.innerHTML = '<p class="cart-empty">Dein Warenkorb ist leer.</p>';
        return;
      }

      container.innerHTML = cart.items.map(item => `
        <article class="cart-item" data-cart-item="${item.id}">
          ${item.image ? `<img src="${item.image}" alt="${escapeHtml(item.name)}" loading="lazy">` : ''}
          <div class="cart-item-details">
            <strong>${escapeHtml(item.name)}</strong>
            <div>${money(item.price)}</div>
            ${item.contents && item.contents.length ? `<ul class="cart-item-contents">${item.contents.map(content => `<li>${escapeHtml(content.name)}${content.free ? ' <em>gratis</em>' : ''}</li>`).join('')}</ul>` : ''}
          </div>
          <input type="number" min="0" value="${item.quantity}" data-cart-quantity="${item.id}" aria-label="Menge">
          <button type="button" data-cart-remove="${item.id}" aria-label="${escapeHtml(item.name)} entfernen">×</button>
        </article>
      `).join('');
    });
  }

  function setScrollLock(isLocked) {
    document.body.classList.toggle('scroll-locked', isLocked);
  }

  function openCartDrawer() {
    const overlay = document.getElementById('cart-overlay');
    if (!overlay) return;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    setScrollLock(true);
  }

  function closeCartDrawer() {
    const overlay = document.getElementById('cart-overlay');
    if (!overlay) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.shop-overlay.is-open')) {
      setScrollLock(false);
    }
  }

  function openCheckoutModal() {
    const overlay = document.getElementById('checkout-overlay');
    if (!overlay) return;
    const cart = getCart();
    const itemCount = document.querySelector('[data-checkout-items]');
    const shipping = document.querySelector('[data-checkout-shipping]');
    const total = document.querySelector('[data-checkout-total]');

    if (itemCount) itemCount.textContent = String(cart.count);
    if (shipping) shipping.textContent = cart.shipping ? money(cart.shipping) : 'Kostenlos';
    if (total) total.textContent = money(cart.total);

    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    setScrollLock(true);
  }

  function closeCheckoutModal() {
    const overlay = document.getElementById('checkout-overlay');
    if (!overlay) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.shop-overlay.is-open')) {
      setScrollLock(false);
    }
  }

  function openProductModal(product) {
    const overlay = document.getElementById('product-overlay');
    if (!overlay) return;

    const modalImage = document.getElementById('product-modal-image');
    const modalCategory = document.getElementById('product-modal-category');
    const modalTitle = document.getElementById('product-modal-title');
    const modalOldPrice = document.getElementById('modal-old-price');
    const modalCurrentPrice = document.getElementById('modal-current-price');
    const modalDescription = document.getElementById('product-modal-description');
    const modalFeatures = document.getElementById('product-modal-features');
    const addButton = document.querySelector('[data-add-to-cart]');

    const safeProduct = product || {};
    const image = safeProduct.image || '[PRODUCT IMAGE]';
    const name = safeProduct.name || '[PRODUCT NAME]';
    const category = safeProduct.category || '[PRODUCT CATEGORY]';
    const description = safeProduct.description || '[PRODUKTBESCHREIBUNG]';
    const features = Array.isArray(safeProduct.features) && safeProduct.features.length ? safeProduct.features : ['[VORTEIL 1]', '[VORTEIL 2]', '[VORTEIL 3]'];
    const price = Number(safeProduct.price || 149);
    const oldPrice = Number(safeProduct.oldPrice || 199);

    recordRecentlyViewed(safeProduct);

    modalImage.src = image;
    modalImage.alt = name;
    modalCategory.textContent = category;
    modalTitle.textContent = name;
    modalOldPrice.textContent = money(oldPrice);
    modalCurrentPrice.textContent = money(price);
    modalDescription.textContent = description;
    modalFeatures.innerHTML = features.map(item => `<li>${escapeHtml(item)}</li>`).join('');

    if (addButton) {
      addButton.dataset.productId = safeProduct.id || 'luma-essentials';
      addButton.dataset.productName = name;
      addButton.dataset.productPrice = String(price);
      addButton.dataset.productImage = image;
      addButton.dataset.productCategory = category;
      addButton.dataset.productDescription = description;
    }

    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    setScrollLock(true);
  }

  function closeProductModal() {
    const overlay = document.getElementById('product-overlay');
    if (!overlay) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.shop-overlay.is-open')) {
      setScrollLock(false);
    }
  }

  function setupProductTrigger() {
    const trigger = document.querySelector('[data-product-trigger]');
    if (!trigger) return;

    trigger.addEventListener('click', () => {
      openProductModal({
        id: trigger.dataset.productId || 'luma-essentials',
        name: trigger.dataset.productName || '[PRODUCT NAME]',
        category: trigger.dataset.productCategory || '[PRODUCT CATEGORY]',
        price: Number(trigger.dataset.productPrice || 149),
        oldPrice: Number(trigger.dataset.productOldPrice || 199),
        image: trigger.dataset.productImage || '[PRODUCT IMAGE]',
        description: trigger.dataset.productDescription || '[PRODUKTBESCHREIBUNG]',
        features: (trigger.dataset.productFeatures || '[VORTEIL 1]|[VORTEIL 2]|[VORTEIL 3]').split('|')
      });
    });
  }

  function productFromElement(element) {
    return {
      id: element.dataset.productId || 'luma-essentials',
      name: element.dataset.productName || '[PRODUCT NAME]',
      category: element.dataset.productCategory || '[PRODUCT CATEGORY]',
      price: Number(element.dataset.productPrice || 149),
      oldPrice: Number(element.dataset.productOldPrice || 199),
      image: element.dataset.productImage || '[PRODUCT IMAGE]',
      description: element.dataset.productDescription || '[PRODUKTBESCHREIBUNG]',
      features: (element.dataset.productFeatures || '[VORTEIL 1]|[VORTEIL 2]|[VORTEIL 3]').split('|')
    };
  }

  function setupShopProductDetails() {
    return;
  }

  function recordRecentlyViewed(product) {
    const recent = loadStoredArray(RECENT_KEY).filter(item => item.id !== product.id);
    recent.unshift({
      id: product.id,
      name: product.name,
      category: product.category,
      price: product.price,
      oldPrice: product.oldPrice,
      image: product.image,
      description: product.description,
      features: product.features
    });
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 3)));
    renderRecentlyViewed();
  }

  function renderRecentlyViewed() {
    const section = document.querySelector('[data-recent-section]');
    const grid = document.querySelector('[data-recent-grid]');
    if (!section || !grid) return;
    const recent = loadStoredArray(RECENT_KEY);
    section.hidden = recent.length === 0;
    grid.innerHTML = recent.map(product => `<article class="recent-card"><div class="recent-card-visual"></div><div><span>${escapeHtml(product.category || 'Essential')}</span><h3>${escapeHtml(product.name)}</h3><strong>${money(product.price)}</strong><button type="button" class="secondary-button small-button" data-shop-product data-product-id="${escapeHtml(product.id)}" data-product-name="${escapeHtml(product.name)}" data-product-category="${escapeHtml(product.category || 'Essential')}" data-product-price="${product.price}" data-product-old-price="${product.oldPrice || product.price}" data-product-image="${escapeHtml(product.image || '')}" data-product-description="${escapeHtml(product.description || '')}" data-product-features="${escapeHtml((product.features || []).join('|'))}">Details ansehen</button></div></article>`).join('');
  }

  function setupShopSorting() {
    const sortSelect = document.querySelector('[data-shop-sort]');
    const grid = document.querySelector('[data-product-grid]');
    if (!sortSelect || !grid) return;

    sortSelect.addEventListener('change', () => {
      const cards = [...grid.querySelectorAll('[data-product-card]')];
      const sorters = {
        popular: card => Number(card.dataset.rating || 0),
        priceAsc: card => Number(card.dataset.price || 0),
        priceDesc: card => Number(card.dataset.price || 0),
        newest: card => Number(card.dataset.year || 0)
      };
      const sorter = sorters[sortSelect.value] || sorters.popular;

      cards.sort((a, b) => {
        const difference = sorter(b) - sorter(a);
        return sortSelect.value === 'priceAsc' ? -difference : difference;
      });

      cards.forEach(card => grid.appendChild(card));
    });
  }

  function setupShopSearch() {
    const input = document.querySelector('[data-shop-search]');
    const cards = [...document.querySelectorAll('[data-product-card]')];
    if (!input || !cards.length) return;
    input.addEventListener('input', () => {
      const query = input.value.trim().toLowerCase();
      cards.forEach(card => {
        const text = `${card.dataset.productName || ''} ${card.textContent}`.toLowerCase();
        card.classList.toggle('is-search-hidden', query.length > 0 && !text.includes(query));
      });
    });
  }

  function setupFavorites() {
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-favorite]');
      if (!button) return;
      const id = button.dataset.favorite;
      if (favorites.has(id)) favorites.delete(id);
      else favorites.add(id);
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
      render();
    });
  }

  function setupCountdown() {
    const countdown = document.querySelector('[data-countdown-value]');
    if (!countdown) return;
    let seconds = Number(localStorage.getItem('business-idea-countdown')) || 18 * 60 * 60;
    const update = () => {
      const hours = String(Math.floor(seconds / 3600)).padStart(2, '0');
      const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
      const remainder = String(seconds % 60).padStart(2, '0');
      countdown.textContent = `${hours}:${minutes}:${remainder}`;
      localStorage.setItem('business-idea-countdown', String(seconds));
      seconds = seconds > 0 ? seconds - 1 : 18 * 60 * 60;
    };
    update();
    window.setInterval(update, 1000);
  }

  function setupNewsletter() {
    const form = document.querySelector('[data-newsletter-form]');
    const status = document.querySelector('[data-newsletter-status]');
    if (!form || !status) return;
    form.addEventListener('submit', event => {
      event.preventDefault();
      const input = form.querySelector('input[type="email"]');
      status.textContent = `Geschafft. Dein Code wird an ${input.value} gesendet.`;
      form.reset();
    });
  }

  function setupCheckoutPage() {
    const form = document.querySelector('[data-payment-form]');
    const status = document.querySelector('[data-payment-status]');
    if (!form || !status) return;

    const fields = form.querySelector('[data-payment-fields]');
    const action = form.querySelector('[data-payment-action]');
    const actionText = form.querySelector('[data-payment-action-text]');
    const continueButton = form.querySelector('[data-payment-continue]');
    const submitButton = form.querySelector('[data-payment-submit]');
    const methodDetails = {
      paypal: ['Du wirst sicher zu PayPal weitergeleitet, um die Zahlung dort abzuschließen.', 'Zu PayPal weiter'],
      applepay: ['Bestätige die Zahlung direkt mit Apple Pay auf deinem Gerät.', 'Apple Pay öffnen'],
      klarna: ['Du wirst zu Klarna weitergeleitet und kannst dort deine gewünschte Zahlungsart wählen.', 'Zu Klarna weiter']
    };

    const couponInput = document.querySelector('[data-coupon-input]');
    const couponApply = document.querySelector('[data-coupon-apply]');
    const couponStatus = document.querySelector('[data-coupon-status]');
    const shippingOptions = form.querySelectorAll('input[name="shipping"]');
    const cardNumber = form.querySelector('input[placeholder="1234 5678 9012 3456"]');

    const updateShipping = () => {
      const selected = form.querySelector('input[name="shipping"]:checked')?.value;
      checkoutState.shipping = selected === 'express' ? 9.9 : 0;
      render();
    };

    shippingOptions.forEach(option => option.addEventListener('change', updateShipping));
    couponApply?.addEventListener('click', () => {
      const code = couponInput?.value.trim().toUpperCase();
      if (code === 'WELCOME10') {
        checkoutState.coupon = Math.min(10, getCart().subtotal);
        if (couponStatus) couponStatus.textContent = 'Code aktiviert: 10,00 € gespart.';
      } else {
        checkoutState.coupon = 0;
        if (couponStatus) couponStatus.textContent = 'Code nicht gefunden. Probiere WELCOME10.';
      }
      render();
    });

    cardNumber?.addEventListener('input', event => {
      const digits = event.target.value.replace(/\D/g, '').slice(0, 16);
      event.target.value = digits.replace(/(.{4})/g, '$1 ').trim();
    });

    const updatePaymentMethod = () => {
      const selected = form.querySelector('input[name="payment"]:checked')?.value || 'card';
      const isCard = selected === 'card';
      if (fields) fields.hidden = !isCard;
      if (action) action.hidden = isCard;
      if (submitButton) submitButton.hidden = !isCard;
      if (!isCard && methodDetails[selected]) {
        if (actionText) actionText.textContent = methodDetails[selected][0];
        if (continueButton) continueButton.textContent = methodDetails[selected][1];
      }
    };

    form.addEventListener('change', event => {
      if (event.target.matches('input[name="payment"]')) updatePaymentMethod();
    });
    form.querySelectorAll('.payment-option').forEach(option => {
      option.addEventListener('click', () => window.setTimeout(updatePaymentMethod, 0));
    });
    continueButton?.addEventListener('click', () => {
      status.textContent = 'Weiterleitung vorbereitet. In einer echten Version würde nun der Zahlungsanbieter geöffnet.';
      status.classList.add('is-success');
    });
    updatePaymentMethod();

    form.addEventListener('submit', event => {
      event.preventDefault();
      const cart = getCart();
      localStorage.setItem('business-idea-last-order', JSON.stringify({ total: cart.subtotal + checkoutState.shipping - cart.discount - checkoutState.coupon, createdAt: new Date().toISOString() }));
      window.location.href = 'confirmation.html';
    });
    updateShipping();
  }

  function setupBundleBuilder() {
    const selects = [...document.querySelectorAll('[data-bundle-select]')];
    const addButton = document.querySelector('[data-bundle-add]');
    const addonSelect = document.querySelector('[data-addon-select]');
    const addonButton = document.querySelector('[data-addon-bundle-add]');
    const savings = document.querySelector('[data-bundle-savings]');
    const total = document.querySelector('[data-bundle-total]');
    if (!selects.length || !addButton || !savings || !total) return;

    const products = {
      'luma-essentials': { name: 'Luma Essentials', price: 149 },
      'morning-ritual': { name: 'Morning Ritual', price: 149 },
      'focus-edition': { name: 'Focus Edition', price: 149 },
      'weekend-kit': { name: 'Weekend Kit', price: 149 },
      'evening-reset': { name: 'Evening Reset', price: 149 },
      'daily-addon': { name: 'Daily Add-on', price: 24.9 }
    };

    const update = () => {
      const selected = selects.map(select => products[select.value]).filter(Boolean);
      if (selected.length !== selects.length) {
        savings.textContent = 'Gratisvorteil: 0,00 €';
        total.textContent = 'Bundlepreis: Bitte alle Produkte wählen';
        return;
      }
      const prices = selected.map(product => product.price).sort((a, b) => a - b);
      const free = prices[0] || 0;
      const bundleTotal = prices.reduce((sum, price) => sum + price, 0) - free;
      savings.textContent = `Dein Vorteil: ${money(free)}`;
      total.textContent = `Bundlepreis: ${money(bundleTotal)}`;
    };

    selects.forEach(select => select.addEventListener('change', update));
    addButton.addEventListener('click', () => {
      const selectedIds = selects.map(select => select.value);
      if (selectedIds.some(id => !id)) {
        showCartConfirmation({ name: 'Bitte wähle drei Produkte für dein Bundle.' }, 0);
        return;
      }
      if (new Set(selectedIds).size !== selectedIds.length) {
        showCartConfirmation({ name: 'Bitte wähle drei unterschiedliche Produkte.' }, 0);
        return;
      }
      const selected = selects.map(select => products[select.value]);
      const prices = selected.map(product => product.price).sort((a, b) => a - b);
      const free = prices[0] || 0;
      const bundleTotal = prices.reduce((sum, price) => sum + price, 0) - free;
      addToCart({ id: `custom-bundle-${Date.now()}`, name: 'Dein 2+1 Bundle · 1 Produkt gratis', price: bundleTotal, image: '', savings: free, contents: selected.map((product, index) => ({ name: product.name, free: index === 2 })) });
    });

    if (addonSelect && addonButton) {
      addonButton.addEventListener('click', () => {
        if (!addonSelect.value) {
          showCartConfirmation({ name: 'Bitte wähle zuerst ein Produkt.' }, 0);
          return;
        }
        const product = products[addonSelect.value];
        addToCart({ id: `addon-bundle-${Date.now()}`, name: `${product.name} + Daily Add-on gratis`, price: product.price, image: '', savings: 24.9, contents: [{ name: product.name }, { name: 'Daily Add-on', free: true }] });
      });
    }
    update();
  }

  function setupFooterPopups() {
    const footerLinks = document.querySelectorAll('.site-footer a');
    if (!footerLinks.length) return;

    const content = {
      'contact.html': ['Kontakt', 'Wir helfen dir gerne weiter.', 'Schreib uns an hello@[shopname].de. Wir antworten in der Regel innerhalb von 24–48 Stunden.'],
      'impressum.html': ['Impressum', 'Angaben gemäß § 5 TMG', '[SHOP NAME] · [Adresse] · [PLZ Ort] · hello@[shopname].de'],
      'datenschutz.html': ['Datenschutz', 'Deine Daten bleiben geschützt.', 'Wir verarbeiten Daten nur, soweit sie für Shop, Bestellung und Support erforderlich sind.'],
      'agb.html': ['AGB', 'Allgemeine Geschäftsbedingungen', 'Bestellungen, Preise und Lieferungen erfolgen nach den jeweils geltenden Bedingungen.'],
      'widerrufsbelehrung.html': ['Widerrufsbelehrung', 'Widerrufsrecht', 'Du kannst innerhalb von 14 Tagen ohne Angabe von Gründen vom Vertrag zurücktreten.']
    };

    footerLinks.forEach(link => {
      link.addEventListener('click', event => {
        const page = link.getAttribute('href');
        if (!content[page]) return;
        event.preventDefault();
        openInfoPopup(content[page]);
      });
    });
  }

  function openInfoPopup([eyebrow, title, description]) {
    let overlay = document.querySelector('[data-info-popup]');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'shop-overlay info-popup-overlay';
      overlay.dataset.infoPopup = 'true';
      overlay.innerHTML = '<div class="info-popup" role="dialog" aria-modal="true" aria-labelledby="info-popup-title"><button type="button" class="icon-button modal-close" aria-label="Fenster schließen" data-close-info>×</button><p class="section-eyebrow cart-eyebrow" data-info-eyebrow></p><h3 id="info-popup-title" data-info-title></h3><p class="info-popup-description" data-info-description></p><a class="secondary-button info-popup-home" href="index.html#footer" data-info-home>Zurück zum Start</a></div>';
      document.body.appendChild(overlay);
    }

    overlay.querySelector('[data-info-eyebrow]').textContent = eyebrow;
    overlay.querySelector('[data-info-title]').textContent = title;
    overlay.querySelector('[data-info-description]').textContent = description;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    setScrollLock(true);
  }

  function closeInfoPopup() {
    const overlay = document.querySelector('[data-info-popup]');
    if (!overlay) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    setScrollLock(false);
  }

  document.addEventListener('click', event => {
    const cartButton = event.target.closest('[data-open-cart]');
    const closeCart = event.target.closest('[data-close-cart]');
    const closeProduct = event.target.closest('[data-close-product]');
    const closeCheckout = event.target.closest('[data-close-checkout]');
    const checkoutOpen = event.target.closest('[data-checkout-open]');
    const add = event.target.closest('[data-add-to-cart]');
    const remove = event.target.closest('[data-cart-remove]');
    const closeInfo = event.target.closest('[data-close-info]');
    const infoHome = event.target.closest('[data-info-home]');
    const closeToast = event.target.closest('[data-close-cart-toast]');
    const shopProduct = event.target.closest('[data-shop-product]');

    if (closeToast) {
      const toast = document.querySelector('[data-cart-toast]');
      if (toast) toast.classList.remove('is-visible');
      return;
    }

    if (shopProduct) {
      openProductModal(productFromElement(shopProduct));
      return;
    }

    if (cartButton) {
      openCartDrawer();
      return;
    }

    if (checkoutOpen) {
      closeCartDrawer();
      window.location.href = 'checkout.html';
      return;
    }

    if (closeCart) {
      closeCartDrawer();
      return;
    }

    if (closeProduct) {
      closeProductModal();
      return;
    }

    if (closeCheckout) {
      closeCheckoutModal();
      return;
    }

    if (closeInfo) {
      closeInfoPopup();
      window.location.href = 'index.html#footer';
      return;
    }

    if (infoHome) {
      closeInfoPopup();
      return;
    }

    if (add) {
      const product = {
        id: add.dataset.productId || 'luma-essentials',
        name: add.dataset.productName || '[PRODUCT NAME]',
        price: Number(add.dataset.productPrice || 149),
        image: add.dataset.productImage || '[PRODUCT IMAGE]'
      };
      addToCart(product, 1);
      return;
    }

    if (remove) {
      removeFromCart(remove.dataset.cartRemove);
      return;
    }

    if (event.target.classList.contains('shop-overlay')) {
      closeCartDrawer();
      closeProductModal();
      closeCheckoutModal();
      closeInfoPopup();
    }
  });

  document.addEventListener('change', event => {
    if (event.target.matches('[data-cart-quantity]')) {
      updateQuantity(event.target.dataset.cartQuantity, event.target.value);
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeCartDrawer();
      closeProductModal();
      closeCheckoutModal();
      closeInfoPopup();
    }
  });

  window.ShopCart = {
    addToCart,
    updateQuantity,
    removeFromCart,
    getCart,
    clear: () => {
      state.items = [];
      saveCart();
    }
  };

  function setupShopFilters() {
    const filterButtons = document.querySelectorAll('[data-filter]');
    const cards = document.querySelectorAll('[data-product-card]');
    const selected = new Set();

    if (!filterButtons.length || !cards.length) return;

    const getMatch = card => {
      const categories = (card.dataset.categories || '').split('|').map(item => item.trim().toLowerCase()).filter(Boolean);
      if (selected.size === 0) return true;
      return [...selected].some(tag => categories.includes(tag));
    };

    filterButtons.forEach(button => {
      button.addEventListener('click', () => {
        const value = button.dataset.filter;
        if (!value) return;

        if (value === 'all') {
          selected.clear();
          filterButtons.forEach(item => item.classList.toggle('is-active', item === button));
          cards.forEach(card => {
            card.classList.remove('is-featured');
          });
          return;
        }

        if (selected.has(value)) {
          selected.delete(value);
          button.classList.remove('is-active');
        } else {
          selected.add(value);
          button.classList.add('is-active');
        }

        const allButton = document.querySelector('[data-filter="all"]');
        if (allButton) {
          allButton.classList.toggle('is-active', selected.size === 0);
        }

        const visibleCards = [...cards].sort((a, b) => {
          const aMatch = getMatch(a);
          const bMatch = getMatch(b);
          if (aMatch !== bMatch) return Number(bMatch) - Number(aMatch);
          return 0;
        });

        visibleCards.forEach(card => {
          card.classList.toggle('is-featured', selected.size > 0 && getMatch(card));
          card.parentElement.appendChild(card);
        });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    render();
    setupProductTrigger();
    setupShopProductDetails();
    setupShopSorting();
    setupBundleBuilder();
    setupShopSearch();
    setupFavorites();
    setupCountdown();
    setupNewsletter();
    setupCheckoutPage();
    renderRecentlyViewed();
    setupFooterPopups();
    setupShopFilters();
  });

})();
