let productsData = null;

async function loadProducts() {
  try {
    const res = await fetch('data/products.json');
    productsData = await res.json();
    renderGameTabs();
    renderAllSections();
    setupTabs();
    createParticles();
  } catch (e) {
    document.getElementById('main-content').innerHTML = `
      <div style="text-align:center;padding:100px 20px;color:#ff4444;">
        <h2>⚠️ فشل تحميل البيانات</h2>
        <p style="color:#b0b0c0;margin-top:10px;">تأكد من وجود ملف data/products.json</p>
      </div>`;
  }
}

function fmt(n) {
  return (+n % 1 === 0) ? String(+n) : (+n).toFixed(2);
}

function getPhone(itemId) {
  return productsData.contact.games;
}

function renderGameTabs() {
  const allItems = [...productsData.games, productsData.services];
  const container = document.getElementById('game-tabs');
  container.innerHTML = allItems.map((item, i) => `
    <button class="game-tab ${i === 0 ? 'active' : ''}" data-game="${item.id}">
      <span class="tab-icon">${item.icon}</span> ${item.name}
    </button>
  `).join('');
}

function renderAllSections() {
  const allItems = [...productsData.games, productsData.services];
  const container = document.getElementById('main-content');
  container.innerHTML = allItems.map((item, i) => {
    const isService = item.id === 'services';
    const phone = isService ? (item.whatsapp || productsData.contact.services) : getPhone(item.id);
    return `
    <section class="game-section ${i === 0 ? 'active' : ''}" data-game="${item.id}">
      <div class="game-header">
        <h2 class="game-title" style="color:${item.color}">${item.icon} ${item.name}</h2>
        <p class="game-desc">${item.desc || `أفضل أسعار شحن ${item.name} - ${productsData.storeName}`}</p>
      </div>
      ${item.categories.map(cat => `
        <div class="category">
          <h3 class="category-title">
            ${cat.name}
            <span class="glow-line"></span>
          </h3>
          <div class="products-grid">
            ${cat.products.map(p => {
              const isPopular = p.popular;
              const btnClass = getBtnClass(item.id, isPopular);
              const popClass = isPopular ? 'popular' : '';
              const hasDiscount = p.originalPrice && p.discount;
              const priceText = p.price === 0 ? 'حسب الاتفاق' : `${fmt(p.price)} <span class="currency">${productsData.currency}</span>`;
              const oldPriceText = hasDiscount ? `<span class="old-price">${fmt(p.originalPrice)} ${productsData.currency}</span>` : '';
              const discountBadge = hasDiscount ? `<span class="discount-badge">خصم ${p.discount}</span>` : '';
              const btnText = isService ? '💬 تواصل للطلب' : '🔥 اشتري الآن';
              return `
                <div class="product-card ${popClass}">
                  <div class="product-top">
                    <div class="product-name">${p.name}</div>
                    ${discountBadge}
                  </div>
                  <div class="product-amount">${p.amount}</div>
                  <div class="product-price">
                    ${oldPriceText}
                    <span class="final-price">${priceText}</span>
                  </div>
                  <button class="buy-btn ${btnClass}" onclick="buyProduct('${p.name}', ${p.price}, '${phone}')">
                    ${btnText}
                  </button>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `).join('')}
    </section>
  `}).join('');
}

function getBtnClass(gameId, isPopular) {
  if (isPopular) return 'glow-pink';
  const map = { pubg: 'glow-orange', freefire: 'glow-red', services: 'glow-purple' };
  return map[gameId] || '';
}

function setupTabs() {
  document.querySelectorAll('.game-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.game-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.game-section').forEach(s => s.classList.remove('active'));
      tab.classList.add('active');
      const section = document.querySelector(`.game-section[data-game="${tab.dataset.game}"]`);
      if (section) section.classList.add('active');
    });
  });
}

function buyProduct(name, price, phone) {
  const priceText = price === 0 ? 'حسب الاتفاق' : `${fmt(price)} ${productsData.currency}`;
  const msg = `مرحباً، أريد شراء: ${name} (${priceText})`;
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

function createParticles() {
  const container = document.getElementById('particles');
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.width = p.style.height = (Math.random() * 3 + 2) + 'px';
    p.style.animationDuration = (Math.random() * 15 + 10) + 's';
    p.style.animationDelay = (Math.random() * 10) + 's';
    const colors = ['#00f0ff', '#8b5cf6', '#ff2d95', '#00ff88'];
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.boxShadow = `0 0 6px ${p.style.background}`;
    container.appendChild(p);
  }
}

// Update contact info in footer
function renderFooter() {
  if (!productsData) return;
  const social = document.getElementById('social-links');
  if (social) {
    social.innerHTML = `
      <a href="https://wa.me/${productsData.contact.games}" target="_blank" class="social-btn" title="واتساب">💬</a>
    `;
  }
  const yearEl = document.getElementById('copyright-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  loadProducts().then(() => renderFooter());
});
