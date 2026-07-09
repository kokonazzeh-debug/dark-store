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

function renderGameTabs() {
  const container = document.getElementById('game-tabs');
  container.innerHTML = productsData.games.map((g, i) => `
    <button class="game-tab ${i === 0 ? 'active' : ''}" data-game="${g.id}">
      <span class="tab-icon">${g.icon}</span> ${g.name}
    </button>
  `).join('');
}

function renderAllSections() {
  const container = document.getElementById('main-content');
  container.innerHTML = productsData.games.map((g, i) => `
    <section class="game-section ${i === 0 ? 'active' : ''}" data-game="${g.id}">
      <div class="game-header">
        <h2 class="game-title" style="color:${g.color}">${g.icon} ${g.name}</h2>
        <p class="game-desc">أفضل أسعار شحن ${g.name} - ${productsData.storeName}</p>
      </div>
      ${g.categories.map(cat => `
        <div class="category">
          <h3 class="category-title">
            ${cat.name}
            <span class="glow-line"></span>
          </h3>
          <div class="products-grid">
            ${cat.products.map(p => {
              const isPopular = p.popular;
              const btnClass = getBtnClass(g.id, isPopular);
              const popClass = isPopular ? 'popular' : '';
              return `
                <div class="product-card ${popClass}">
                  <div class="product-name">${p.name}</div>
                  <div class="product-amount">${p.amount}</div>
                  <div class="product-price">
                    ${p.price} <span class="currency">${productsData.currency}</span>
                  </div>
                  <button class="buy-btn ${btnClass}" onclick="buyProduct('${p.name}', ${p.price})">
                    🔥 اشتري الآن
                  </button>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `).join('')}
    </section>
  `).join('');
}

function getBtnClass(gameId, isPopular) {
  if (isPopular) return 'glow-pink';
  const map = { pubg: 'glow-orange', fifa: 'glow-green', freefire: 'glow-red', codm: 'glow-gold' };
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

function buyProduct(name, price) {
  const msg = `مرحباً، أريد شراء: ${name} بسعر ${price} ${productsData.currency}`;
  const url = `https://wa.me/${productsData.contact.whatsapp}?text=${encodeURIComponent(msg)}`;
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
      <a href="https://wa.me/${productsData.contact.whatsapp}" target="_blank" class="social-btn" title="واتساب">💬</a>
      <a href="${productsData.contact.facebook}" target="_blank" class="social-btn" title="فيسبوك">📘</a>
    `;
  }
  const yearEl = document.getElementById('copyright-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  loadProducts().then(() => renderFooter());
});
