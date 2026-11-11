import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy, updateDoc, arrayUnion, arrayRemove, getDocs, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAlODiPchfhg1tWQXSN9Hs2RyqfHg2hc_4",
  authDomain: "avito-sbor.firebaseapp.com",
  projectId: "avito-sbor",
  storageBucket: "avito-sbor.firebasestorage.app",
  messagingSenderId: "322685862446",
  appId: "1:322685862446:web:be7b0bcdda38ef842615bf",
  measurementId: "G-MLMKYQL07L"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const STATUSES = {
  pending:   { label: 'На согласовании' },
  transit:   { label: 'В пути' },
  warehouse: { label: 'На складе' },
  sale:      { label: 'В продаже' },
  sold:      { label: 'Продано' },
};

const PARTNERS = { p_1: { name: 'Партнер 1' }, p_2: { name: 'Партнер 2' } };
const CATEGORY_KEYWORDS = [
  { keywords: ['материн', 'мать', 'mb', 'motherboard'], cat: 'Материнская плата' },
  { keywords: ['процессор', 'проц', 'cpu', 'ryzen', 'intel core', 'xeon'], cat: 'Процессор' },
  { keywords: ['видеокарт', 'видюха', 'gpu', 'rtx', 'gtx', 'radeon'], cat: 'Видеокарта' },
  { keywords: ['оператив', 'озу', 'ram', 'ddr3', 'ddr4', 'ddr5'], cat: 'Оперативная память' },
  { keywords: ['ssd', 'hdd', 'накопител', 'm.2', 'nvme', 'жесткий диск'], cat: 'Накопитель' },
  { keywords: ['блок питания', 'бп', 'psu'], cat: 'Блок питания' },
  { keywords: ['корпус', 'case'], cat: 'Корпус' },
  { keywords: ['кулер', 'охлажден', 'вентилятор', 'cooler'], cat: 'Охлаждение' },
  { keywords: ['ноутбук', 'laptop', 'ноут'], cat: 'Ноутбук' },
  { keywords: ['телефон', 'iphone', 'samsung', 'смартфон', 'xiaomi', 'pixel'], cat: 'Телефон' },
];

let items = [];
let sets = [];
let transactions = [];
let selectedIds = new Set();
let editingSetId = null;
let unsubItems = null;
let unsubSets = null;
let unsubTrans = null;
let currentGroupId = null;

// Утилиты
function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}
function formatPrice(p) {
  const n = Number(p) || 0;
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n);
}
function detectCategory(title) {
  const t = title.toLowerCase();
  for (const item of CATEGORY_KEYWORDS) {
    if (item.keywords.some(kw => t.includes(kw))) return item.cat;
  }
  return 'Другое';
}
function getItemSet(itemId) {
  return sets.find(s => s.itemIds.includes(itemId));
}

// ====== АВТОРИЗАЦИЯ ======
const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const authForm = document.getElementById('auth-form');
const authError = document.getElementById('auth-error');
const btnRegister = document.getElementById('btn-register');
const btnLogout = document.getElementById('btn-logout');
const groupField = document.getElementById('group-field');
const btnSwitchMode = document.getElementById('btn-switch-mode');
const authTitle = document.getElementById('auth-title');

let isRegisterMode = false;

btnSwitchMode.addEventListener('click', () => {
  isRegisterMode = !isRegisterMode;
  if (isRegisterMode) {
    authTitle.textContent = 'Регистрация';
    groupField.style.display = 'block';
    document.getElementById('btn-login').style.display = 'none';
    btnRegister.style.display = 'block';
    btnSwitchMode.textContent = 'У меня уже есть аккаунт';
  } else {
    authTitle.textContent = 'Вход в Avito Sbor';
    groupField.style.display = 'none';
    document.getElementById('btn-login').style.display = 'block';
    btnRegister.style.display = 'none';
    btnSwitchMode.textContent = 'У меня нет аккаунта';
  }
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  authError.textContent = '';
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    authError.textContent = 'Ошибка: ' + (err.code === 'auth/invalid-credential' ? 'Неверный email или пароль' : err.message);
  }
});

btnRegister.addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const groupCodeInput = document.getElementById('auth-group-code').value.trim().toUpperCase();

  authError.textContent = '';
  if (!email || !password) return authError.textContent = 'Введите email и пароль';

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    let groupId = groupCodeInput;

    if (!groupId) {
      groupId = Math.random().toString(36).substring(2, 8).toUpperCase();
      alert(`Вы создали новую группу! Ваш код для напарника: ${groupId}\n\nПередайте его партнеру, чтобы он мог присоединиться.`);
    }

    // Сохраняем пользователя с жесткой привязкой к группе
    await setDoc(doc(db, 'users', user.uid), {
      email: user.email,
      groupId: groupId
    });

  } catch (err) {
    authError.textContent = 'Ошибка: ' + err.message;
  }
});

btnLogout.addEventListener('click', () => {
  signOut(auth);
});

// ====== ИНИЦИАЛИЗАЦИЯ ДАННЫХ ПОСЛЕ ВХОДА ======
onAuthStateChanged(auth, async (user) => {
  if (user) {
    authScreen.style.display = 'none';
    appScreen.style.display = 'block';

    try {
      // Ждем, пока загрузится документ пользователя, чтобы узнать его группу
      const userDoc = await getDocs(query(collection(db, 'users'), where('email', '==', user.email)));

      if (!userDoc.empty) {
        const userData = userDoc.docs[0].data();
        currentGroupId = userData.groupId;
        document.getElementById('group-info').textContent = `Группа: ${currentGroupId}`;

        // Только теперь запускаем синхронизацию
        initRealtime(currentGroupId);
      } else {
        // Если документа нет (старый аккаунт), пробуем найти группу в localStorage или создаем новую
        let savedGroup = localStorage.getItem('avito_groupId');
        if (!savedGroup) {
          savedGroup = Math.random().toString(36).substring(2, 8).toUpperCase();
          await setDoc(doc(db, 'users', user.uid), { email: user.email, groupId: savedGroup });
        }
        currentGroupId = savedGroup;
        localStorage.setItem('avito_groupId', currentGroupId);
        document.getElementById('group-info').textContent = `Группа: ${currentGroupId}`;
        initRealtime(currentGroupId);
      }
    } catch (err) {
      console.error("Ошибка при загрузке пользователя:", err);
      alert("Ошибка синхронизации. Обновите страницу.");
    }
  } else {
    authScreen.style.display = 'block';
    appScreen.style.display = 'none';
    if (unsubItems) unsubItems();
    if (unsubSets) unsubSets();
    if (unsubTrans) unsubTrans();
    currentGroupId = null;
  }
});

// ====== СЛУШАТЕЛИ БАЗЫ ДАННЫХ ======
function initRealtime(groupId) {
  if (unsubItems) unsubItems();
  if (unsubSets) unsubSets();
  if (unsubTrans) unsubTrans();

  unsubItems = onSnapshot(query(collection(db, 'items'), where('groupId', '==', groupId)), (snapshot) => {
    items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    renderItems();
    renderSets();
    renderAccounting();
  });

  unsubSets = onSnapshot(query(collection(db, 'sets'), where('groupId', '==', groupId)), (snapshot) => {
    sets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    sets.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    renderSets();
    renderAccounting();
  });

  unsubTrans = onSnapshot(query(collection(db, 'transactions'), where('groupId', '==', groupId)), (snapshot) => {
    transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    transactions.sort((a, b) => (b.date || 0) - (a.date || 0));
    renderAccounting();
  });
}

// DOM (все элементы остаются как были)
const listEl    = document.getElementById('items-list');
const emptyMsg  = document.getElementById('empty-msg');
const countEl   = document.getElementById('count');
const searchEl  = document.getElementById('search');
const filterCat = document.getElementById('filter-category');
const filterEl  = document.getElementById('filter-status');
const hideInSets = document.getElementById('hide-in-sets');
const clearSold = document.getElementById('clear-sold');

const setsListEl = document.getElementById('sets-list');
const setsEmptyMsg = document.getElementById('sets-empty-msg');
const setsCountEl = document.getElementById('sets-count');
const buildPanel = document.getElementById('build-panel');
const buildInfo = document.getElementById('build-info');
const buildName = document.getElementById('build-name');
const btnCreateBuild = document.getElementById('btn-create-build');
const btnCancelBuild = document.getElementById('btn-cancel-build');

const themeToggle = document.getElementById('theme-toggle');
const addForm = document.getElementById('add-form');

const finTotal = document.getElementById('fin-total');
const finInvested = document.getElementById('fin-invested');
const finWithdrawn = document.getElementById('fin-withdrawn');
const anFree = document.getElementById('an-free');
const anFrozen = document.getElementById('an-frozen');
const anProfit = document.getElementById('an-profit');
const partnersList = document.getElementById('partners-list');
const historyList = document.getElementById('history-list');
const historyEmpty = document.getElementById('history-empty');
const accPartner = document.getElementById('acc-partner');
const accAmount = document.getElementById('acc-amount');
const accComment = document.getElementById('acc-comment');

const searchModal = document.getElementById('search-modal');
const globalSearchInput = document.getElementById('global-search-input');
const globalSearchResults = document.getElementById('global-search-results');
const btnGlobalSearch = document.getElementById('btn-global-search');

// ====== ТЕМА ======
function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
    themeToggle.textContent = '☀️ Светлая';
  } else {
    document.body.classList.remove('dark-theme');
    themeToggle.textContent = '🌙 Тёмная';
  }
}
themeToggle.addEventListener('click', () => {
  const isDark = document.body.classList.toggle('dark-theme');
  localStorage.setItem('avito_theme', isDark ? 'dark' : 'light');
  themeToggle.textContent = isDark ? '☀️ Светлая' : '🌙 Тёмная';
});

// ====== ВКЛАДКИ ======
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'accounting') renderAccounting();
  });
});

// ====== ПОИСК ======
btnGlobalSearch.addEventListener('click', () => {
  searchModal.classList.remove('hidden');
  globalSearchInput.focus();
  globalSearchInput.value = '';
  renderGlobalSearch('');
});

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') {
    e.preventDefault();
    btnGlobalSearch.click();
  }
  if (e.key === 'Escape' && !searchModal.classList.contains('hidden')) {
    searchModal.classList.add('hidden');
  }
});

searchModal.addEventListener('click', (e) => {
  if (e.target === searchModal) searchModal.classList.add('hidden');
});

globalSearchInput.addEventListener('input', (e) => {
  renderGlobalSearch(e.target.value.trim().toLowerCase());
});

function renderGlobalSearch(q) {
  if (!q) {
    globalSearchResults.innerHTML = '<div style="padding:10px; color:var(--text-muted); font-size:14px;">Начните вводить название...</div>';
    return;
  }
  const results = items.filter(it => it.title.toLowerCase().includes(q));
  if (results.length === 0) {
    globalSearchResults.innerHTML = '<div style="padding:10px; color:var(--text-muted); font-size:14px;">Ничего не найдено</div>';
    return;
  }
  globalSearchResults.innerHTML = '';
  results.forEach(it => {
    const pSet = getItemSet(it.id);
    const div = document.createElement('div');
    div.className = 'search-result-item';
    div.innerHTML = `
      <img src="${it.image || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="%23eee"/></svg>'}" class="search-result-img" alt="">
      <div class="search-result-info">
        <div class="search-result-title">${it.title} — ${formatPrice(it.price)}</div>
        <div class="search-result-meta">${STATUSES[it.status].label} ${pSet ? ` • 📦 В сборке: ${pSet.name}` : ' • Вне сборки'}</div>
      </div>
    `;
    div.onclick = () => {
      searchModal.classList.add('hidden');
      document.querySelector('[data-tab="inventory"]').click();
      searchEl.value = it.title;
      renderItems();
    };
    globalSearchResults.appendChild(div);
  });
}

// ====== ОТРИСОВКА ТОВАРОВ (Исправлена смена статуса) ======
function renderItems() {
  const q = searchEl.value.trim().toLowerCase();
  const fCat = filterCat.value;
  const fStat = filterEl.value;
  const hide = hideInSets.checked;

  const filtered = items.filter(it => {
    const matchQ = !q || it.title.toLowerCase().includes(q);
    const matchCat = !fCat || it.category === fCat;
    const matchStat = !fStat || it.status === fStat;
    const inSet = !!getItemSet(it.id);

    if (hide && inSet) return false;

    return matchQ && matchCat && matchStat;
  });

  listEl.innerHTML = '';
  countEl.textContent = items.length;
  emptyMsg.style.display = filtered.length ? 'none' : 'block';

  for (const item of filtered) {
    const el = document.createElement('div');
    const isSelected = selectedIds.has(item.id);
    const parentSet = getItemSet(item.id);

    el.className = 'item' + (item.status === 'sold' ? ' status-sold' : '') + (isSelected ? ' selected' : '');

    const mainDiv = document.createElement('div');
    mainDiv.className = 'item-main';

    const img = document.createElement('img');
    img.className = 'item-img';
    img.src = item.image || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="%23eee"/><text x="50%" y="55%" font-size="10" text-anchor="middle" fill="%23999">Нет фото</text></svg>';
    img.alt = '';

    const content = document.createElement('div');
    content.className = 'item-content';

    const top = document.createElement('div');
    top.className = 'item-top';

    const left = document.createElement('div');
    left.className = 'item-left';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = isSelected;
    cb.disabled = !!parentSet;
    cb.onchange = () => {
      if (cb.checked) selectedIds.add(item.id);
      else selectedIds.delete(item.id);
      updateBuildPanel();
      renderItems();
    };

    const a = document.createElement('a');
    a.className = 'item-title';
    a.href = item.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = item.title || '(без названия)';

    const catBadge = document.createElement('span');
    catBadge.className = 'category-badge';
    catBadge.textContent = item.category || 'Другое';

    left.append(cb, a, catBadge);

    if (parentSet) {
      const setBadge = document.createElement('span');
      setBadge.className = 'in-set-badge';
      setBadge.textContent = `📦 В сборке: ${parentSet.name}`;
      left.append(setBadge);
    }

    const price = document.createElement('span');
    price.className = 'item-price';
    price.textContent = formatPrice(item.price);

    top.append(left, price);
    content.append(top);

    if (item.note) {
      const noteDiv = document.createElement('div');
      noteDiv.className = 'item-note';
      noteDiv.textContent = `📝 ${item.note}`;
      noteDiv.title = 'Нажмите, чтобы изменить заметку';
      noteDiv.onclick = async () => {
        const newNote = prompt('Изменить заметку к товару:', item.note);
        if (newNote !== null) {
          await updateDoc(doc(db, 'items', item.id), { note: newNote.trim() });
        }
      };
      content.append(noteDiv);
    }

    const actions = document.createElement('div');
    actions.className = 'item-actions';

    const select = document.createElement('select');
    for (const [key, s] of Object.entries(STATUSES)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = s.label;
      if (key === item.status) opt.selected = true;
      select.appendChild(opt);
    }

    // ИСПРАВЛЕНИЕ: Логика смены статуса с записью в базу
    select.onchange = async () => {
      const oldStatus = item.status;
      const newStatus = select.value;

      let updates = { status: newStatus };

      // Если меняем с "На согласовании" на что-то другое — это покупка
      if (oldStatus === 'pending' && newStatus !== 'pending') {
        updates.isPurchased = true;
        await setDoc(doc(collection(db, 'transactions')), {
          groupId: currentGroupId,
          date: Date.now(), type: 'purchase', partnerId: null, amount: item.price, comment: `Покупка товара "${item.title}"`
        });
      }
      // Если возвращаем обратно в "На согласовании" — возврат
      else if (oldStatus !== 'pending' && newStatus === 'pending' && item.isPurchased) {
        updates.isPurchased = false;
        await setDoc(doc(collection(db, 'transactions')), {
          groupId: currentGroupId,
          date: Date.now(), type: 'refund', partnerId: null, amount: item.price, comment: `Возврат за товар "${item.title}"`
        });
      }

      // Если товар продается вне сборки
      if (newStatus === 'sold' && oldStatus !== 'sold' && !parentSet) {
        const amountStr = prompt(`За сколько продан товар "${item.title}"?\n(Цена закупки: ${formatPrice(item.price)})`, item.price);
        if (amountStr) {
          const amount = Number(amountStr);
          if (!isNaN(amount) && amount > 0) {
            updates.soldPrice = amount;
            await setDoc(doc(collection(db, 'transactions')), {
              groupId: currentGroupId,
              date: Date.now(), type: 'sale', partnerId: null, amount: amount, comment: `Продажа товара "${item.title}"`
            });
          }
        } else {
          select.value = oldStatus; // Откат, если нажали Отмена
          return;
        }
      }

      await updateDoc(doc(db, 'items', item.id), updates);
    };

    const del = document.createElement('button');
    del.className = 'btn small danger';
    del.textContent = 'Удалить';
    del.onclick = async () => {
      if (confirm(`Удалить «${item.title}»?`)) {
        await deleteDoc(doc(db, 'items', item.id));
        selectedIds.delete(item.id);
        updateBuildPanel();
      }
    };

    actions.append(select, del);
    content.append(actions);
    mainDiv.append(img, content);
    el.append(mainDiv);
    listEl.appendChild(el);
  }
}

// ====== ОТРИСОВКА СБОРОК (без изменений) ======
function renderSets() {
  setsListEl.innerHTML = '';
  setsCountEl.textContent = sets.length;
  setsEmptyMsg.style.display = sets.length ? 'none' : 'block';

  for (const set of sets) {
    const card = document.createElement('div');
    card.className = 'set-card';

    let totalSum = 0;
    const rows = (set.itemIds || []).map(id => {
      const it = items.find(x => x.id === id);
      if (!it) return '';

      totalSum += Number(it.price) || 0;

      const statusOptions = Object.entries(STATUSES).map(([key, s]) =>
        `<option value="${key}" ${key === it.status ? 'selected' : ''}>${s.label}</option>`
      ).join('');

      const imgSrc = it.image || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="%23eee"/></svg>';

      return `
        <li>
          <div class="set-item-info">
            <img src="${imgSrc}" class="set-item-img" alt="">
            <a href="${it.url}" target="_blank" rel="noopener" class="item-title">${it.title}</a>
            <span class="item-price">${formatPrice(it.price)}</span>
          </div>
          <div class="set-item-controls">
            <select data-item-id="${it.id}" class="set-status-select">
              ${statusOptions}
            </select>
          </div>
        </li>
      `;
    }).filter(Boolean).join('');

    const header = document.createElement('div');
    header.className = 'set-header';
    header.innerHTML = `
      <h3 class="set-title">📦 ${set.name} ${set.soldPrice ? '<span class="badge" style="background:var(--success)">ПРОДАНО</span>' : ''}</h3>
      <span class="set-total">Себестоимость: ${formatPrice(totalSum)}</span>
    `;

    let profitHTML = '';
    if (set.soldPrice) {
      const profit = set.soldPrice - totalSum;
      const color = profit >= 0 ? 'var(--success)' : 'var(--danger)';
      const icon = profit >= 0 ? '📈' : '📉';
      profitHTML = `
        <div class="profit-box" style="background: ${profit >= 0 ? 'rgba(26,127,55,0.1)' : 'rgba(209,36,47,0.1)'}">
          <span>Продано за: <strong>${formatPrice(set.soldPrice)}</strong></span>
          <span>${icon} Чистая прибыль: <span class="profit-value" style="color:${color}">${profit >= 0 ? '+' : ''}${formatPrice(profit)}</span></span>
        </div>
      `;
    }

    let editPanelHTML = '';
    if (editingSetId === set.id) {
      const availableItems = items.filter(it => {
        const pSet = getItemSet(it.id);
        return !pSet || pSet.id === set.id;
      });

      const addOptions = availableItems.map(it =>
        `<option value="${it.id}">${it.title} — ${formatPrice(it.price)}</option>`
      ).join('');

      const editRows = (set.itemIds || []).map(id => {
        const it = items.find(x => x.id === id);
        if (!it) return '';
        return `
          <div class="set-edit-row">
            <span>${it.title}</span>
            <button class="btn-icon btn-remove-item" data-item-id="${it.id}" title="Убрать из сборки">✖</button>
          </div>
        `;
      }).filter(Boolean).join('');

      editPanelHTML = `
        <div class="set-edit-panel">
          <label style="flex-direction:row; align-items:center; gap:8px; color:var(--text);">
            Название: 
            <input type="text" id="edit-name-${set.id}" value="${set.name}">
          </label>
          <div class="set-edit-list" id="edit-list-${set.id}">
            ${editRows || '<div style="color:var(--text-muted); font-size:13px;">Сборка пуста</div>'}
          </div>
          <div class="set-edit-add">
            <select id="edit-add-select-${set.id}">
              <option value="">-- Добавить товар --</option>
              ${addOptions}
            </select>
            <button class="btn small ghost btn-add-item" data-set-id="${set.id}">Добавить</button>
          </div>
          <div style="display:flex; gap:8px; margin-top:8px;">
            <button class="btn small primary btn-save-set" data-set-id="${set.id}">Сохранить</button>
            <button class="btn small ghost btn-cancel-edit" data-set-id="${set.id}">Отмена</button>
          </div>
        </div>
      `;
    }

    const ul = document.createElement('ul');
    ul.className = 'set-items';
    ul.innerHTML = rows || '<li style="color:var(--text-muted);">Товары были удалены</li>';

    ul.querySelectorAll('.set-status-select').forEach(select => {
      select.addEventListener('change', async (e) => {
        const itemId = e.target.dataset.itemId;
        const newStatus = e.target.value;
        const item = items.find(x => x.id === itemId);
        if (item) {
          await updateDoc(doc(db, 'items', itemId), { status: newStatus });
        }
      });
    });

    const actionsDiv = document.createElement('div');
    actionsDiv.style.display = 'flex';
    actionsDiv.style.gap = '8px';

    if (!set.soldPrice) {
      const sellBtn = document.createElement('button');
      sellBtn.className = 'btn small primary';
      sellBtn.textContent = '💸 Продать сборку';
      sellBtn.onclick = async () => {
        const amountStr = prompt(`За сколько продана сборка "${set.name}"?\n(Себестоимость: ${formatPrice(totalSum)})`, totalSum);
        if (amountStr) {
          const amount = Number(amountStr);
          if (isNaN(amount) || amount <= 0) return alert('Введите корректную сумму');

          await updateDoc(doc(db, 'sets', set.id), {
            soldPrice: amount,
            soldAt: Date.now()
          });

          for (const id of (set.itemIds || [])) {
            await updateDoc(doc(db, 'items', id), { status: 'sold', isPurchased: true });
          }

          await setDoc(doc(collection(db, 'transactions')), {
            groupId: currentGroupId,
            date: Date.now(), type: 'sale', partnerId: null, amount: amount, comment: `Продажа сборки "${set.name}"`
          });

          alert('Сборка продана! Все комплектующие отмечены как "Продано".');
        }
      };
      actionsDiv.append(sellBtn);
    }

    const editBtn = document.createElement('button');
    editBtn.className = 'btn small ghost';
    editBtn.textContent = editingSetId === set.id ? 'Отмена' : '✏️ Редактировать';
    editBtn.onclick = () => {
      editingSetId = editingSetId === set.id ? null : set.id;
      renderSets();
    };

    const delBtn = document.createElement('button');
    delBtn.className = 'btn small danger';
    delBtn.textContent = 'Удалить сборку';
    delBtn.onclick = async () => {
      if (confirm(`Удалить сборку «${set.name}»?`)) {
        await deleteDoc(doc(db, 'sets', set.id));
      }
    };

    actionsDiv.append(editBtn, delBtn);

    card.innerHTML = '';
    card.append(header);
    if (profitHTML) card.innerHTML += profitHTML;

    if (editPanelHTML) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = editPanelHTML;
      const panel = tempDiv.firstElementChild;
      card.append(panel);

      panel.querySelectorAll('.btn-remove-item').forEach(btn => {
        btn.onclick = async (e) => {
          const itemId = e.target.dataset.itemId;
          await updateDoc(doc(db, 'sets', set.id), { itemIds: arrayRemove(itemId) });
        };
      });

      panel.querySelector('.btn-add-item').onclick = async (e) => {
        const selectEl = panel.querySelector(`#edit-add-select-${set.id}`);
        const itemId = selectEl.value;
        if (!itemId) return;
        await updateDoc(doc(db, 'sets', set.id), { itemIds: arrayUnion(itemId) });
      };

      panel.querySelector('.btn-save-set').onclick = async (e) => {
        const nameInput = panel.querySelector(`#edit-name-${set.id}`);
        const newName = nameInput.value.trim();
        if (!newName) return alert('Название не может быть пустым');
        await updateDoc(doc(db, 'sets', set.id), { name: newName });
        editingSetId = null;
      };

      panel.querySelector('.btn-cancel-edit').onclick = (e) => {
        editingSetId = null;
        renderSets();
      };
    }

    card.append(ul, actionsDiv);
    setsListEl.appendChild(card);
  }
}

// ====== ПАНЕЛЬ СБОРКИ (без изменений) ======
function updateBuildPanel() {
  const count = selectedIds.size;
  buildInfo.textContent = `Выбрано: ${count}`;
  if (count > 0) buildPanel.classList.remove('hidden');
  else { buildPanel.classList.add('hidden'); buildName.value = ''; }
}

btnCancelBuild.onclick = () => {
  selectedIds.clear();
  updateBuildPanel();
  renderItems();
};

btnCreateBuild.onclick = async () => {
  const name = buildName.value.trim();
  if (!name) { alert('Введите название сборки'); buildName.focus(); return; }

  await setDoc(doc(collection(db, 'sets')), {
    groupId: currentGroupId,
    name,
    itemIds: Array.from(selectedIds),
    createdAt: Date.now()
  });

  selectedIds.clear();
  updateBuildPanel();
  renderItems();
};

// ====== ДОБАВЛЕНИЕ ТОВАРА (без изменений) ======
addForm.addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const url    = document.getElementById('url').value.trim();
    const title  = document.getElementById('title').value.trim();
    const price  = Number(document.getElementById('price').value);
    const status = document.getElementById('status').value;
    const image  = document.getElementById('image').value.trim();
    const note   = document.getElementById('note').value.trim();

    if (!url || !title) return alert('Заполните ссылку и название');

    const isDuplicate = items.some(item => item.url === url);
    if (isDuplicate) return alert('Этот товар (по ссылке) уже есть в базе!');

    const category = detectCategory(title);
    const isPurchased = status !== 'pending';

    await setDoc(doc(collection(db, 'items')), {
      groupId: currentGroupId,
      url, title, price, status, image, note, category, isPurchased,
      createdAt: Date.now()
    });

    if (isPurchased) {
      await setDoc(doc(collection(db, 'transactions')), {
        groupId: currentGroupId,
        date: Date.now(), type: 'purchase', partnerId: null, amount: price, comment: `Покупка товара "${title}"`
      });
    }

    addForm.reset();
  } catch (err) {
    console.error(err);
    alert('Ошибка: ' + err.message);
  }
});

// ====== ФИЛЬТРЫ (без изменений) ======
searchEl.addEventListener('input', renderItems);
filterCat.addEventListener('change', renderItems);
filterEl.addEventListener('change', renderItems);
hideInSets.addEventListener('change', renderItems);

clearSold.addEventListener('click', async () => {
  const soldItems = items.filter(i => i.status === 'sold');
  if (!soldItems.length) return alert('Нет товаров со статусом «Продано».');
  if (confirm(`Удалить ${soldItems.length} товаров со статусом «Продано»?`)) {
    for (const it of soldItems) {
      await deleteDoc(doc(db, 'items', it.id));
    }
  }
});

// ====== БУХГАЛТЕРИЯ (без изменений) ======
function renderAccounting() {
  const balances = { p_1: 0, p_2: 0 };
  let totalDeposited = 0;
  let totalWithdrawn = 0;
  let totalPurchases = 0;
  let totalSales = 0;

  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  let profitLast30 = 0;

  transactions.forEach(tx => {
    if (tx.type === 'deposit') {
      if (tx.partnerId && balances[tx.partnerId] !== undefined) balances[tx.partnerId] += tx.amount;
      totalDeposited += tx.amount;
    }
    else if (tx.type === 'withdraw') {
      if (tx.partnerId && balances[tx.partnerId] !== undefined) balances[tx.partnerId] -= tx.amount;
      totalWithdrawn += tx.amount;
    }
    else if (tx.type === 'purchase') totalPurchases += tx.amount;
    else if (tx.type === 'refund') totalPurchases -= tx.amount;
    else if (tx.type === 'sale') totalSales += tx.amount;
    else if (tx.type === 'adjustment') {
      if (tx.partnerId && balances[tx.partnerId] !== undefined) balances[tx.partnerId] += tx.amount;
    }

    if (tx.date >= thirtyDaysAgo) {
      if (tx.type === 'sale') profitLast30 += tx.amount;
      if (tx.type === 'purchase') profitLast30 -= tx.amount;
    }
  });

  let totalBalance = totalDeposited - totalWithdrawn - totalPurchases + totalSales;

  let frozenSum = 0;
  items.forEach(it => {
    if (it.status === 'transit' || it.status === 'warehouse' || it.status === 'sale') {
      frozenSum += Number(it.price) || 0;
    }
  });

  anFree.textContent = formatPrice(totalBalance);
  anFrozen.textContent = formatPrice(frozenSum);
  anProfit.textContent = (profitLast30 >= 0 ? '+' : '') + formatPrice(profitLast30);
  anProfit.style.color = profitLast30 >= 0 ? 'var(--success)' : 'var(--danger)';

  finTotal.textContent = formatPrice(totalBalance);
  finInvested.textContent = formatPrice(totalDeposited);
  finWithdrawn.textContent = formatPrice(totalWithdrawn);

  partnersList.innerHTML = '';
  const totalInvestedByPartners = balances.p_1 + balances.p_2;

  Object.keys(PARTNERS).forEach(pId => {
    const partner = PARTNERS[pId];
    const totalInvested = balances[pId] || 0;
    const sharePercent = totalInvestedByPartners > 0 ? (totalInvested / totalInvestedByPartners) : 0;
    const currentAvailable = totalBalance * sharePercent;

    const card = document.createElement('div');
    card.className = 'partner-card';
    card.innerHTML = `
      <div class="partner-name">${partner.name}</div>
      <div class="partner-stats">
        <span>Всего вложено: <strong>${formatPrice(totalInvested)}</strong></span>
        <span>Доля: <strong>${(sharePercent * 100).toFixed(1)}%</strong></span>
        <span style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border); color: var(--text);">
          Доступно сейчас: <strong style="color: var(--accent); font-size: 16px;">${formatPrice(currentAvailable)}</strong>
        </span>
      </div>
    `;
    partnersList.appendChild(card);
  });

  historyList.innerHTML = '';
  historyEmpty.style.display = transactions.length ? 'none' : 'block';

  transactions.forEach(tx => {
    const tr = document.createElement('tr');
    const date = new Date(tx.date).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

    let typeLabel = '';
    let typeClass = '';
    if (tx.type === 'deposit') { typeLabel = 'Внесение'; typeClass = 'type-deposit'; }
    if (tx.type === 'withdraw') { typeLabel = 'Вывод'; typeClass = 'type-withdraw'; }
    if (tx.type === 'adjustment') { typeLabel = 'Правка'; typeClass = 'type-adjustment'; }
    if (tx.type === 'sale') { typeLabel = 'Продажа'; typeClass = 'type-sale'; }
    if (tx.type === 'purchase') { typeLabel = 'Покупка'; typeClass = 'type-withdraw'; }
    if (tx.type === 'refund') { typeLabel = 'Возврат'; typeClass = 'type-deposit'; }

    const partnerName = tx.partnerId ? PARTNERS[tx.partnerId].name : 'Общее';
    const amountSign = (tx.type === 'withdraw' || tx.type === 'purchase') ? '-' : '+';
    const amountColor = (tx.type === 'withdraw' || tx.type === 'purchase') ? 'var(--danger)' : 'var(--success)';

    tr.innerHTML = `
      <td>${date}</td>
      <td><span class="type-badge ${typeClass}">${typeLabel}</span></td>
      <td>${partnerName}</td>
      <td style="font-weight:600; color:${amountColor}">${amountSign}${formatPrice(tx.amount)}</td>
      <td style="color:var(--text-muted); font-size:13px;">${tx.comment || ''}</td>
    `;
    historyList.appendChild(tr);
  });
}

async function addTransaction(type) {
  const partnerId = accPartner.value;
  const amount = Number(accAmount.value);
  const comment = accComment.value.trim();

  if (!amount || amount <= 0) return alert('Введите сумму больше нуля');

  let defaultComment = 'Пополнение';
  if (type === 'withdraw') defaultComment = 'Вывод';
  if (type === 'adjustment') defaultComment = 'Корректировка';

  await setDoc(doc(collection(db, 'transactions')), {
    groupId: currentGroupId,
    date: Date.now(), type, partnerId, amount, comment: comment || defaultComment
  });

  accAmount.value = '';
  accComment.value = '';
}

document.getElementById('btn-deposit').onclick = () => addTransaction('deposit');
document.getElementById('btn-withdraw').onclick = () => addTransaction('withdraw');
document.getElementById('btn-adjust').onclick = () => {
  if (!accComment.value.trim()) return alert('Для ручной правки обязателен комментарий (причина)');
  addTransaction('adjustment');
};

// ====== ИНИЦИАЛИЗАЦИЯ ======
applyTheme(localStorage.getItem('avito_theme') || 'light');