const API = '';
let TOKEN = sessionStorage.getItem('dark_admin_token') || '';
let STATIC_MODE = false;

// حساب المسار الأساسي ليعمل سواء على السيرفر أو GitHub Pages (repo/...)
function getBase() {
  let p = location.pathname;
  const idx = p.lastIndexOf('/admin');
  if (idx >= 0) {
    p = p.slice(0, idx);
  } else {
    p = p.slice(0, p.lastIndexOf('/') + 1);
  }
  if (p && !p.endsWith('/')) p += '/';
  return p || '/';
}
const BASE = getBase();

function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (TOKEN) headers['Authorization'] = 'Bearer ' + TOKEN;
  return fetch(BASE + path.replace(/^\//, ''), { ...options, headers });
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function fmt(n) {
  if (n === '' || n == null) return '';
  const v = +n;
  return (v % 1 === 0) ? String(v) : v.toFixed(2);
}

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function fnvHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16);
}

async function verifyPassword(pw) {
  const cfg = window.ADMIN_CONFIG || {};
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    return (await sha256(pw)) === cfg.passwordHash;
  }
  return fnvHash(pw) === (cfg.passwordHashSync || '');
}

function downloadJSON(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

const STATUS_MAP = {
  pending: 'قيد الانتظار',
  shipped: 'تم الشحن',
  cancelled: 'ملغي'
};

/* ==========================================
   تسجيل الدخول
   ========================================== */
const loginForm = document.getElementById('login-form');
const loginView = document.getElementById('login-view');
const panelView = document.getElementById('panel-view');
const loginError = document.getElementById('login-error');

function showPanel() {
  loginView.classList.add('hidden');
  panelView.classList.remove('hidden');
  if (STATIC_MODE) document.getElementById('static-banner').classList.remove('hidden');
}

function showLogin() {
  loginView.classList.remove('hidden');
  panelView.classList.add('hidden');
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;

  if (STATIC_MODE) {
    const cfg = window.ADMIN_CONFIG || {};
    const ok = username === cfg.username && await verifyPassword(password);
    if (ok) {
      sessionStorage.setItem('dark_admin_static', '1');
      showPanel();
      initPanel();
    } else {
      loginError.textContent = 'اسم المستخدم أو كلمة المرور غير صحيحة';
    }
    return;
  }

  try {
    const res = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      TOKEN = data.token;
      sessionStorage.setItem('dark_admin_token', TOKEN);
      showPanel();
      initPanel();
    } else {
      loginError.textContent = data.error || 'فشل تسجيل الدخول';
    }
  } catch (err) {
    loginError.textContent = 'تعذر الاتصال بالخادم. شغّل server.py';
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST' }); } catch (e) {}
  TOKEN = '';
  sessionStorage.removeItem('dark_admin_token');
  sessionStorage.removeItem('dark_admin_static');
  showLogin();
});

/* ==========================================
   التهيئة
   ========================================== */
function initPanel() {
  const link = document.querySelector('.topbar-actions a');
  if (link) link.href = BASE;
  switchView('orders');
  bindSidebar();
  loadOrders();
  loadPayments();
  loadGames();
}

function bindSidebar() {
  document.querySelectorAll('.side-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
}

function switchView(name) {
  document.querySelectorAll('.side-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + name);
  if (target) target.classList.add('active');
}

/* ==========================================
   الطلبات
   ========================================== */
let allOrders = [];
let ordersFilter = 'all';

function getStoredOrders() {
  try { return JSON.parse(localStorage.getItem('dark_orders') || '[]'); } catch (e) { return []; }
}

function setStoredOrders(orders) {
  try { localStorage.setItem('dark_orders', JSON.stringify(orders)); } catch (e) {}
}

async function loadOrders() {
  const list = document.getElementById('orders-list');
  if (STATIC_MODE) {
    allOrders = getStoredOrders();
    renderOrders();
    return;
  }
  try {
    const res = await api('/api/orders');
    const data = await res.json();
    allOrders = data.orders || [];
    renderOrders();
  } catch (err) {
    list.innerHTML = '<div class="empty">تعذر تحميل الطلبات. شغّل server.py</div>';
  }
}

function renderOrders() {
  const list = document.getElementById('orders-list');
  const filtered = ordersFilter === 'all'
    ? allOrders
    : allOrders.filter(o => o.status === ordersFilter);

  if (!filtered.length) {
    list.innerHTML = '<div class="empty">لا توجد طلبات هنا 🗂️</div>';
    return;
  }

  list.innerHTML = filtered.map(o => {
    const isDataUrl = /^data:/.test(o.receiptImage || '');
    const receipt = o.receiptImage
      ? `<img src="${esc(isDataUrl ? o.receiptImage : '/' + o.receiptImage)}" alt="إيصال" onclick="showLightbox('${esc(isDataUrl ? o.receiptImage : '/' + o.receiptImage)}')">`
      : '<span class="no-img">📷</span>';

    return `
      <div class="order-card" data-id="${esc(o.id)}">
        <div class="order-receipt">${receipt}</div>
        <div class="order-info">
          <div class="o-top">
            <span class="order-id">${esc(o.id)}</span>
            <span class="order-status-tag ${esc(o.status)}">${STATUS_MAP[o.status] || o.status}</span>
            <span class="order-date">🗓️ ${esc(o.date)}</span>
          </div>
          <div class="order-name">👤 ${esc(o.customerName)}</div>
          <div class="order-details">
            <span>📱 <b>${esc(o.phone)}</b></span>
            <span>🆔 <b>${esc(o.gameId)}</b></span>
            <span>🎮 <b>${esc(o.gameName)}</b></span>
            <span>📦 <b>${esc(o.product)}</b></span>
            <span>💳 <b>${esc(o.paymentMethod)}</b></span>
          </div>
        </div>
        <div class="order-amount">${fmt(o.amount)} ج</div>
        <div class="order-actions">
          <button class="status-btn pending" onclick="changeStatus('${esc(o.id)}','pending')" ${o.status === 'pending' ? 'disabled' : ''}>⏳ قيد الانتظار</button>
          <button class="status-btn shipped" onclick="changeStatus('${esc(o.id)}','shipped')" ${o.status === 'shipped' ? 'disabled' : ''}>✅ تم الشحن</button>
          <button class="status-btn cancelled" onclick="changeStatus('${esc(o.id)}','cancelled')" ${o.status === 'cancelled' ? 'disabled' : ''}>❌ ملغي</button>
          <button class="del-btn" title="حذف الطلب" onclick="deleteOrder('${esc(o.id)}')">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

document.querySelectorAll('.filters .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filters .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    ordersFilter = chip.dataset.filter;
    renderOrders();
  });
});

async function changeStatus(id, status) {
  if (STATIC_MODE) {
    const orders = getStoredOrders();
    const o = orders.find(x => x.id === id);
    if (o) { o.status = status; setStoredOrders(orders); loadOrders(); }
    return;
  }
  try {
    const res = await api('/api/orders/' + id, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    if (res.ok) {
      loadOrders();
    } else {
      const data = await res.json();
      alert(data.error || 'حدث خطأ');
    }
  } catch (err) {
    alert('تعذر الاتصال بالخادم');
  }
}

async function deleteOrder(id) {
  if (!confirm('هل أنت متأكد من حذف هذا الطلب؟')) return;
  if (STATIC_MODE) {
    setStoredOrders(getStoredOrders().filter(x => x.id !== id));
    loadOrders();
    return;
  }
  try {
    await api('/api/orders/' + id, { method: 'DELETE' });
    loadOrders();
  } catch (err) {
    alert('تعذر الاتصال بالخادم');
  }
}

function showLightbox(src) {
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox').classList.remove('hidden');
}

/* ==========================================
   أرقام الدفع
   ========================================== */
async function loadPayments() {
  try {
    let p = {};
    if (STATIC_MODE) {
      try { p = await (await fetch(BASE + 'data/payments.json')).json(); } catch (e) {}
      try {
        const saved = localStorage.getItem('dark_payments');
        if (saved) p = { ...p, ...JSON.parse(saved) };
      } catch (e) {}
    } else {
      const res = await api('/api/payments');
      p = await res.json();
    }
    document.getElementById('pay-vodafone').value = p.vodafone || '';
    document.getElementById('pay-orange').value = p.orange || '';
    document.getElementById('pay-instapay').value = p.instapay || '';
    document.getElementById('pay-note').value = p.note || '';
  } catch (err) {}
}

document.getElementById('payments-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('payments-msg');
  msg.className = 'save-msg';
  msg.textContent = 'جاري الحفظ...';

  const payData = {
    vodafone: document.getElementById('pay-vodafone').value.trim(),
    orange: document.getElementById('pay-orange').value.trim(),
    instapay: document.getElementById('pay-instapay').value.trim(),
    note: document.getElementById('pay-note').value.trim()
  };

  if (STATIC_MODE) {
    try { localStorage.setItem('dark_payments', JSON.stringify(payData)); } catch (err) {}
    msg.textContent = '✅ تم الحفظ في متصفحك (سيظهر لزوار متصفحك فقط). للنشر للجميع: اضغط زر التنزيل وارفع الملف إلى data/payments.json';
    msg.style.whiteSpace = 'pre-line';
    const dl = document.getElementById('download-payments-btn');
    dl.classList.remove('hidden');
    dl.onclick = () => downloadJSON('payments.json', payData);
    return;
  }

  try {
    const res = await api('/api/payments', {
      method: 'POST',
      body: JSON.stringify(payData)
    });
    if (res.ok) {
      msg.textContent = '✅ تم حفظ أرقام الدفع بنجاح';
    } else {
      const data = await res.json();
      msg.className = 'save-msg error';
      msg.textContent = data.error || 'حدث خطأ';
    }
  } catch (err) {
    msg.className = 'save-msg error';
    msg.textContent = 'تعذر الاتصال بالخادم';
  }
});

/* ==========================================
   الألعاب والأسعار
   ========================================== */
let currentGames = null;
let currentServices = null;
let storeMeta = {};

async function loadGames() {
  try {
    let data = { games: [], services: null };
    if (STATIC_MODE) {
      try { data = await (await fetch(BASE + 'data/products.json')).json(); } catch (e) {}
      try {
        const saved = localStorage.getItem('dark_products');
        if (saved) { const s = JSON.parse(saved); if (s && s.games) data = s; }
      } catch (e) {}
    } else {
      data = await (await fetch(BASE + 'api/products')).json();
    }
    storeMeta = {
      storeName: data.storeName,
      currency: data.currency,
      contact: data.contact
    };
    currentGames = data.games || [];
    currentServices = data.services || null;
    renderGamesEditor();
  } catch (err) {
    document.getElementById('games-editor').innerHTML = '<div class="empty">تعذر تحميل بيانات الألعاب</div>';
  }
}

function renderGamesEditor() {
  const editor = document.getElementById('games-editor');
  editor.innerHTML = currentGames.map((g, gi) => `
    <div class="game-box" data-gi="${gi}">
      <div class="game-box-head">
        <input type="text" value="${esc(g.name)}" class="g-name" placeholder="اسم اللعبة" data-gi="${gi}">
        <input type="text" value="${esc(g.icon)}" class="g-icon" placeholder="أيقونة" style="max-width:80px" data-gi="${gi}">
        <input type="color" value="${esc(g.color)}" class="g-color" data-gi="${gi}">
        <button class="mini-btn" onclick="addCategory(${gi})">➕ تصنيف</button>
        <button class="mini-btn danger" onclick="removeGame(${gi})">🗑️ حذف اللعبة</button>
      </div>
      ${g.categories.map((c, ci) => `
        <div class="category-box" data-gi="${gi}" data-ci="${ci}">
          <div class="category-head">
            <input type="text" value="${esc(c.name)}" class="c-name" placeholder="اسم التصنيف" data-gi="${gi}" data-ci="${ci}">
            <input type="text" value="${esc(c.icon || g.icon)}" class="c-icon" placeholder="أيقونة" style="max-width:70px" data-gi="${gi}" data-ci="${ci}">
            <button class="mini-btn success" onclick="addProduct(${gi},${ci})">➕ منتج</button>
            <button class="mini-btn danger" onclick="removeCategory(${gi},${ci})">🗑️</button>
          </div>
          <div class="product-head">
            <span class="lbl">الاسم</span><span class="lbl">الكمية</span><span class="lbl">السعر</span><span class="lbl">قبل الخصم</span><span class="lbl">الخصم</span><span class="lbl">أيقونة</span><span class="lbl">مميز</span><span></span>
          </div>
          ${c.products.map((p, pi) => `
            <div class="product-row" data-gi="${gi}" data-ci="${ci}" data-pi="${pi}">
              <input type="text" value="${esc(p.name)}" class="p-name">
              <input type="text" value="${esc(p.amount)}" class="p-amount">
              <input type="number" value="${p.price}" class="p-price">
              <input type="number" step="0.01" value="${p.originalPrice != null ? p.originalPrice : ''}" class="p-original">
              <input type="text" value="${esc(p.discount || '')}" class="p-discount">
              <input type="text" value="${esc(p.icon || '')}" class="p-icon">
              <div class="check-wrap"><input type="checkbox" class="p-popular" ${p.popular ? 'checked' : ''}></div>
              <button class="mini-btn danger" onclick="removeProduct(${gi},${ci},${pi})">🗑️</button>
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>
  `).join('');

  // قسم الخدمات البرمجية
  if (currentServices) {
    const s = currentServices;
    editor.insertAdjacentHTML('beforeend', `
        <div class="game-box" data-services="1">
        <div class="game-box-head">
          <input type="text" value="${esc(s.name)}" class="s-name" placeholder="اسم القسم" style="max-width:160px">
          <input type="text" value="${esc(s.icon)}" class="s-icon" placeholder="أيقونة" style="max-width:80px">
          <input type="color" value="${esc(s.color)}" class="s-color">
        </div>
        <div class="s-cats">
          <div style="color:var(--muted);font-size:.85rem;margin-bottom:10px">هذا هو قسم الخدمات البرمجية (أرقام تواصل منفصلة). يمكنك تعديل اسمه وأيقونته فقط من هنا، وتعديل المنتجات بالطريقة نفسها بالأسفل.</div>
          ${s.categories.map((c, ci) => `
            <div class="category-box">
              <div class="category-head">
                <input type="text" value="${esc(c.name)}" class="s-cat-name" placeholder="اسم التصنيف">
              </div>
              ${c.products.map((p, pi) => `
                <div class="product-row">
                  <input type="text" value="${esc(p.name)}" class="s-p-name">
                  <input type="text" value="${esc(p.amount)}" class="s-p-amount">
                  <input type="number" value="${p.price}" class="s-p-price">
                  <input type="number" step="0.01" value="${p.originalPrice != null ? p.originalPrice : ''}" class="s-p-original">
                  <input type="text" value="${esc(p.discount || '')}" class="s-p-discount">
                  <input type="text" value="${esc(p.icon || '')}" class="s-p-icon">
                  <div class="check-wrap"><input type="checkbox" class="s-p-popular" ${p.popular ? 'checked' : ''}></div>
                  <span></span>
                </div>
              `).join('')}
            </div>
          `).join('')}
        </div>
      </div>
    `);
  }
}

function addCategory(gi) {
  currentGames[gi].categories.push({ name: 'تصنيف جديد', icon: currentGames[gi].icon, products: [] });
  renderGamesEditor();
}

function removeCategory(gi, ci) {
  if (!confirm('حذف هذا التصنيف؟')) return;
  currentGames[gi].categories.splice(ci, 1);
  renderGamesEditor();
}

function addProduct(gi, ci) {
  currentGames[gi].categories[ci].products.push({ name: 'منتج جديد', amount: '', price: 0, icon: currentGames[gi].icon, popular: false });
  renderGamesEditor();
}

function removeProduct(gi, ci, pi) {
  currentGames[gi].categories[ci].products.splice(pi, 1);
  renderGamesEditor();
}

function removeGame(gi) {
  if (!confirm('حذف هذه اللعبة نهائياً؟')) return;
  currentGames.splice(gi, 1);
  renderGamesEditor();
}

document.getElementById('add-game-btn').addEventListener('click', () => {
  currentGames.push({
    id: 'game' + Date.now(),
    name: 'لعبة جديدة',
    icon: '🎮',
    color: '#00f0ff',
    categories: [{ name: 'تصنيف جديد', icon: '🎮', products: [] }]
  });
  renderGamesEditor();
});

document.getElementById('save-games-btn').addEventListener('click', async () => {
  const msg = document.getElementById('games-msg');
  msg.className = 'save-msg';
  msg.textContent = 'جاري الحفظ...';

  // قراءة كل القيم من DOM
  const games = [];

  document.querySelectorAll('#games-editor > .game-box:not([data-services])').forEach(box => {
    const gi = +box.dataset.gi;
    const game = {
      id: currentGames[gi].id,
      name: box.querySelector('.g-name').value.trim() || 'لعبة',
      icon: box.querySelector('.g-icon').value.trim() || '🎮',
      color: box.querySelector('.g-color').value || '#00f0ff',
      categories: []
    };
    box.querySelectorAll(':scope > .category-box').forEach(cb => {
      const cat = {
        name: cb.querySelector('.c-name').value.trim() || 'تصنيف',
        icon: cb.querySelector('.c-icon').value.trim() || game.icon,
        products: []
      };
      cb.querySelectorAll('.product-row').forEach(pr => {
        cat.products.push({
          name: pr.querySelector('.p-name').value.trim() || 'منتج',
          amount: pr.querySelector('.p-amount').value.trim(),
          price: +pr.querySelector('.p-price').value || 0,
          originalPrice: pr.querySelector('.p-original').value === '' ? undefined : +pr.querySelector('.p-original').value,
          discount: pr.querySelector('.p-discount').value.trim() || undefined,
          icon: pr.querySelector('.p-icon').value.trim() || undefined,
          popular: pr.querySelector('.p-popular').checked
        });
      });
      game.categories.push(cat);
    });
    games.push(game);
  });

  // قراءة قسم الخدمات
  let services = null;
  const sBox = document.querySelector('#games-editor > .game-box[data-services]');
  if (sBox && currentServices) {
    services = { ...currentServices };
    services.name = sBox.querySelector('.s-name').value.trim() || currentServices.name;
    services.icon = sBox.querySelector('.s-icon').value.trim() || currentServices.icon;
    services.color = sBox.querySelector('.s-color').value || currentServices.color;
    services.categories = services.categories.map((c, ci) => {
      const cb = sBox.querySelectorAll('.s-cats > .category-box')[ci];
      return {
        ...c,
        name: cb.querySelector('.s-cat-name').value.trim() || c.name,
        products: c.products.map((p, pi) => {
          const pr = cb.querySelectorAll('.product-row')[pi];
          return {
            name: pr.querySelector('.s-p-name').value.trim() || p.name,
            amount: pr.querySelector('.s-p-amount').value.trim(),
            price: +pr.querySelector('.s-p-price').value || 0,
            originalPrice: pr.querySelector('.s-p-original').value === '' ? undefined : +pr.querySelector('.s-p-original').value,
            discount: pr.querySelector('.s-p-discount').value.trim() || undefined,
            icon: pr.querySelector('.s-p-icon').value.trim() || undefined,
            popular: pr.querySelector('.s-p-popular').checked
          };
        })
      };
    });
  }

  const fullData = { ...storeMeta, games, services };

  if (STATIC_MODE) {
    try { localStorage.setItem('dark_products', JSON.stringify(fullData)); } catch (err) {}
    msg.textContent = '✅ تم الحفظ في متصفحك (سيظهر لزوار متصفحك فقط). للنشر للجميع: اضغط زر التنزيل وارفع الملف إلى data/products.json';
    const dl = document.getElementById('download-games-btn');
    dl.classList.remove('hidden');
    dl.onclick = () => downloadJSON('products.json', fullData);
    return;
  }

  try {
    const res = await api('/api/games', {
      method: 'POST',
      body: JSON.stringify({ games, services })
    });
    if (res.ok) {
      msg.textContent = '✅ تم حفظ كل التعديلات بنجاح';
      setTimeout(() => { msg.textContent = ''; }, 3000);
    } else {
      const data = await res.json();
      msg.className = 'save-msg error';
      msg.textContent = data.error || 'حدث خطأ';
    }
  } catch (err) {
    msg.className = 'save-msg error';
    msg.textContent = 'تعذر الاتصال بالخادم';
  }
});

/* ==========================================
   البدء
   ========================================== */
(async function boot() {
  // تحديد الوضع: سيرفر (server.py) أو ثابت (GitHub Pages)
  try {
    const res = await fetch(BASE + 'api/orders');
    if (res.status === 404) throw new Error('static');
  } catch (e) {
    STATIC_MODE = true;
  }

  if (STATIC_MODE) {
    showLogin();
    if (sessionStorage.getItem('dark_admin_static') === '1') {
      showPanel();
      initPanel();
    }
    return;
  }

  if (TOKEN) {
    try {
      const res = await api('/api/orders');
      if (res.ok) {
        showPanel();
        initPanel();
        return;
      }
    } catch (e) {}
    TOKEN = '';
    sessionStorage.removeItem('dark_admin_token');
  }
  showLogin();
})();
