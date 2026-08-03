let productsData = null;
let orderGameName = '';
let orderProduct = '';
let orderPrice = 0;
let orderPhone = '';

const DEFAULT_PAYMENTS = {
  vodafone: '01204733638',
  orange: '01204733638',
  instapay: '01204733638',
  note: 'يرجى إرسال إيصال التحويل مع اسم اللعبة والـ ID في الرسالة'
};

async function loadProducts() {
  try {
    let ok = false;
    try {
      const res = await fetch('api/products');
      if (res.ok) {
        productsData = await res.json();
        ok = true;
      }
    } catch (e) {}
    if (!ok) {
      const saved = localStorage.getItem('dark_products');
      productsData = saved ? JSON.parse(saved) : await (await fetch('data/products.json')).json();
    }
    renderGameTabs();
    renderAllSections();
    setupTabs();
    createParticles();
    setupOrderModal();
    loadPaymentNumbers();
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
        <div class="game-icon-big" style="--gc:${item.color}">${item.icon}</div>
        <h2 class="game-title" style="color:${item.color}">${item.name}</h2>
        <p class="game-desc">${item.desc || `أفضل أسعار شحن ${item.name} - ${productsData.storeName}`}</p>
      </div>
      ${item.categories.map(cat => `
        <div class="category">
          <h3 class="category-title">
            <span class="cat-icon">${cat.icon || item.icon}</span>
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
              const btnText = isService ? '💬 اطلب الخدمة' : '🔥 اشتري الآن';
              return `
                <div class="product-card ${popClass}">
                  <div class="card-icon">${p.icon || item.icon}</div>
                  <div class="product-top">
                    <div class="product-name">${p.name}</div>
                    ${discountBadge}
                  </div>
                  <div class="product-amount">${p.amount}</div>
                  <div class="product-price">
                    ${oldPriceText}
                    <span class="final-price">${priceText}</span>
                  </div>
                  <button class="buy-btn ${btnClass}" onclick="buyProduct('${p.name}', ${p.price}, '${phone}', '${item.name}', ${isService})">
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

// ============ نافذة الطلب ============
function buyProduct(name, price, phone, gameName, isService) {
  orderGameName = gameName;
  orderProduct = name;
  orderPrice = price;
  orderPhone = phone;

  document.getElementById('modal-product').textContent = `${gameName} — ${name} | ${price === 0 ? 'حسب الاتفاق' : price + ' ' + (productsData ? productsData.currency : 'ج')}`;
  document.getElementById('order-form').reset();
  document.getElementById('modal-msg').textContent = '';
  document.getElementById('modal-msg').className = 'modal-msg';
  document.getElementById('upload-preview').classList.add('hidden');

  // بديل واتساب
  const wa = document.getElementById('modal-whatsapp');
  const priceText = price === 0 ? 'حسب الاتفاق' : `${price} ج`;
  const msg = `مرحباً، أريد: ${gameName} — ${name} (${priceText})`;
  wa.innerHTML = `<a href="https://wa.me/${phone}?text=${encodeURIComponent(msg)}" target="_blank">أو تواصل مباشرة عبر واتساب 💬</a>`;

  document.getElementById('order-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function setupOrderModal() {
  document.getElementById('modal-close').addEventListener('click', closeOrderModal);
  document.getElementById('order-modal').addEventListener('click', (e) => {
    if (e.target.id === 'order-modal') closeOrderModal();
  });

  // معاينة الإيصال
  document.getElementById('order-receipt').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      document.getElementById('preview-img').src = ev.target.result;
      document.getElementById('upload-preview').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  });

  // إرسال الطلب
  document.getElementById('order-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById('modal-msg');
    msgEl.className = 'modal-msg';
    msgEl.textContent = 'جاري إرسال الطلب...';

    const receiptInput = document.getElementById('order-receipt');
    let receiptImage = '';
    if (receiptInput.files && receiptInput.files[0]) {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        await submitOrder(ev.target.result, msgEl);
      };
      reader.readAsDataURL(receiptInput.files[0]);
    } else {
      await submitOrder('', msgEl);
    }
  });
}

function saveLocalOrder(payload) {
  try {
    const orders = JSON.parse(localStorage.getItem('dark_orders') || '[]');
    orders.unshift({
      id: 'LOCAL-' + Date.now().toString().slice(-6),
      ...payload,
      status: 'pending',
      date: new Date().toLocaleString('ar-EG')
    });
    localStorage.setItem('dark_orders', JSON.stringify(orders));
  } catch (e) {}
}

function submitWhatsAppOrder(payload, msgEl) {
  const lines = [
    'مرحباً، أريد طلب:',
    '🎮 اللعبة: ' + payload.gameName,
    '📦 المنتج: ' + payload.product,
    '💰 المبلغ: ' + (payload.amount === 0 ? 'حسب الاتفاق' : payload.amount + ' ج'),
    '🆔 رقم الحساب: ' + payload.gameId,
    '👤 الاسم: ' + payload.customerName,
    '📱 الهاتف: ' + payload.phone,
    '💳 طريقة الدفع: ' + payload.paymentMethod,
    '🖼️ سأرسل صورة الإيصال في المحادثة'
  ];
  const wa = document.createElement('a');
  wa.href = 'https://wa.me/' + orderPhone.replace(/^0/, '20') + '?text=' + encodeURIComponent(lines.join('\n'));
  wa.target = '_blank';
  wa.rel = 'noopener';
  document.body.appendChild(wa);
  wa.click();
  wa.remove();

  saveLocalOrder(payload);
  msgEl.className = 'modal-msg success';
  msgEl.innerHTML = '✅ تم تجهيز طلبك! تم فتح واتساب لإرساله لنا — أرفق صورة الإيصال في المحادثة.';
  document.getElementById('order-form').querySelector('button[type="submit"]').disabled = true;
}

function compressImage(dataUrl, maxW = 600, quality = 0.7) {
  return new Promise(resolve => {
    if (!dataUrl || !/^data:image/.test(dataUrl)) return resolve(dataUrl || '');
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(cv.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function submitOrder(receiptImage, msgEl) {
  const payload = {
    customerName: document.getElementById('order-name').value.trim(),
    phone: document.getElementById('order-phone').value.trim(),
    gameId: document.getElementById('order-gameid').value.trim(),
    gameName: orderGameName,
    product: orderProduct,
    amount: orderPrice,
    paymentMethod: document.getElementById('order-paymethod').value,
    receiptImage: await compressImage(receiptImage)
  };

  try {
    const res = await fetch('api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.status === 404) {
      submitWhatsAppOrder(payload, msgEl);
      return;
    }
    const data = await res.json();
    if (res.ok) {
      saveLocalOrder(payload);
      msgEl.className = 'modal-msg success';
      msgEl.textContent = '✅ تم استلام طلبك بنجاح! سنقوم بالشحن فوراً. رقم الطلب: ' + data.id;
      document.getElementById('order-form').querySelector('button[type="submit"]').disabled = true;
    } else {
      submitWhatsAppOrder(payload, msgEl);
    }
  } catch (err) {
    submitWhatsAppOrder(payload, msgEl);
  }
}

function closeOrderModal() {
  document.getElementById('order-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

// تحميل أرقام الدفع
async function loadPaymentNumbers() {
  let payments = DEFAULT_PAYMENTS;
  let apiOk = false;
  try {
    const res = await fetch('api/payments');
    if (res.ok) {
      payments = await res.json();
      apiOk = true;
    }
  } catch (e) {}
  if (!apiOk) {
    try {
      const saved = localStorage.getItem('dark_payments');
      if (saved) {
        payments = { ...payments, ...JSON.parse(saved) };
      } else {
        const res = await fetch('data/payments.json');
        if (res.ok) payments = await res.json();
      }
    } catch (e) {}
  }
  document.getElementById('pay-vodafone').textContent = payments.vodafone || '-';
  document.getElementById('pay-orange').textContent = payments.orange || '-';
  document.getElementById('pay-instapay').textContent = payments.instapay || '-';
  document.getElementById('pay-note').textContent = payments.note || '';
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
