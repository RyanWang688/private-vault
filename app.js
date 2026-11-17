'use strict';
/*
 * 私人保险箱 —— 所有加密/解密都在浏览器本地完成（见 crypto.js）。
 * 主密码、秘密钥匙与明文从不离开本机；GitHub 仓库里只有 vault.json（密文）。
 */
(() => {
  if (window.top !== window.self) { document.documentElement.textContent = ''; return; } // 防点击劫持
  const C = window.VCrypto;
  const $ = (s, r = document) => r.querySelector(s);
  const motion = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const now = () => new Date().toISOString();
  const MAX_FILE = 25 * 1048576;
  const SYNC_LIMIT = 70 * 1048576;

  // ---------------- 图标 ----------------
  const ICONS = {
    login: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8.5-8.5M16 7l3 3M14 9l2 2"/>',
    identity: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16.2c.7-1.6 1.9-2.2 3.2-2.2s2.5.6 3.2 2.2M14.5 10h4M14.5 13.5h3"/>',
    bank: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6 15h4"/>',
    note: '<path d="M6 3h9l4 4v14H6z"/><path d="M14.5 3v4.5H19M9 12h7M9 16h5"/>',
    file: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/>',
    all: '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>',
    star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    eye: '<path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M3 3l18 18M10.6 5.1A9.6 9.6 0 0 1 12 5c6 0 9.5 7 9.5 7a16 16 0 0 1-3 3.9M6.6 6.6C3.9 8.4 2.5 12 2.5 12s3.5 7 9.5 7c1.7 0 3.2-.5 4.5-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    download: '<path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M4.5 19.5h15"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
    open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V7.5A1.5 1.5 0 0 1 5.5 6H10"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="15" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="9" cy="15" r="1"/>',
    upload: '<path d="M12 16V5m-4.5 4.5L12 5l4.5 4.5M4.5 19.5h15"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-9 8.5"/>',
  };
  function icon(name) {
    const s = document.createElement('span');
    s.className = 'ic';
    s.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[name] || ''}</svg>`; // 仅使用上面的常量
    return s;
  }

  // ---------------- 类型定义 ----------------
  const TYPE_ORDER = ['login', 'identity', 'bank', 'note', 'file'];
  const TYPES = {
    login: { label: '账号密码', short: '账号', fields: [
      { k: 'username', l: '账号 / 邮箱', copy: true },
      { k: 'password', l: '密码', secret: true, copy: true, gen: true },
      { k: 'url', l: '网址', url: true, copy: true, ph: 'https://' }] },
    identity: { label: '证件信息', short: '证件', fields: [
      { k: 'name', l: '姓名', copy: true },
      { k: 'kind', l: '证件类型', ph: '身份证 / 护照 / 驾照 / 学生证…' },
      { k: 'number', l: '证件号码', secret: true, copy: true },
      { k: 'expiry', l: '有效期' }] },
    bank: { label: '银行卡', short: '银行卡', fields: [
      { k: 'bank', l: '银行' },
      { k: 'holder', l: '持卡人', copy: true },
      { k: 'number', l: '卡号', secret: true, copy: true, card: true },
      { k: 'expiry', l: '有效期', ph: 'MM/YY' },
      { k: 'cvv', l: 'CVV', secret: true, copy: true },
      { k: 'pin', l: 'PIN', secret: true }] },
    note: { label: '笔记', short: '笔记', fields: [] },
    file: { label: '文件', short: '文件', fields: [] },
  };
  const TYPE_DESC = { login: '网站、App 的登录信息', identity: '身份证、护照等证件', bank: '银行卡与支付信息', note: '任意文字，支持 [[双链]]', file: '图片、PDF、文档' };

  // ---------------- DOM 工具 ----------------
  function h(tag, props, ...kids) {
    const n = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'list' || k === 'role' || k.startsWith('aria-') || !(k in n)) n.setAttribute(k, v);
      else n[k] = v;
    }
    for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : String(c));
    return n;
  }
  const iconBtn = (name, title, fn, cls = '') => h('button', { type: 'button', class: 'icon-btn ' + cls, title, 'aria-label': title,
    onclick: (e) => { e.stopPropagation(); fn(e); } }, icon(name));
  const fmtSize = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  const fmtDate = (s) => { try { return new Date(s).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return s; } };
  const uid = () => C.b64(C.rand(9)).replace(/[+/=]/g, '');
  const extOf = (name) => { const m = /\.([a-z0-9]{1,5})$/i.exec(name || ''); return m ? m[1].toUpperCase() : 'FILE'; };

  function toast(msg, ok = true) {
    const box = $('#toasts');
    const t = h('div', { class: 'toast' });
    if (ok) t.innerHTML = `<svg viewBox="0 0 24 24">${ICONS.check}</svg>`;
    t.append(msg);
    box.append(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 2600);
  }
  function ask(title, text, yes = '删除') {
    const d = $('#dlg-confirm');
    $('#confirm-title').textContent = title; $('#confirm-text').textContent = text; $('#confirm-yes').textContent = yes;
    d.returnValue = '';
    d.showModal();
    return new Promise((res) => d.addEventListener('close', () => res(d.returnValue === 'yes'), { once: true }));
  }

  // ---------------- 本地存储（只存密文） ----------------
  function db() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('private-vault', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function idb(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction('kv', mode);
      const req = fn(tx.objectStore('kv'));
      tx.oncomplete = () => res(req && req.result);
      tx.onerror = () => rej(tx.error);
    });
  }
  const getLocal = (k) => idb('readonly', (s) => s.get(k)).catch(() => undefined);
  const setLocal = (k, v) => idb('readwrite', (s) => s.put(v, k));
  const delLocal = (k) => idb('readwrite', (s) => s.delete(k));
  async function fetchRemote() {
    try {
      const r = await fetch('vault.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return null;
      const j = await r.json();
      return C.valid(j) ? j : null;
    } catch { return null; }
  }

  // ---------------- 状态 ----------------
  const S = {
    env: null, key: null, hdr: null, secret: null, data: null, dirty: false,
    filter: { kind: 'all' }, query: '', view: 'cards', sort: 'updated', drawer: null,
    urls: new Map(), graph: null, graphTags: true, graphSig: null, fresh: null, dragOut: false, idle: 0,
  };
  const byId = (id) => S.data && S.data.items.find((i) => i.id === id);
  const findByTitle = (t) => { const k = t.trim().toLowerCase(); return S.data.items.find((i) => (i.title || '').trim().toLowerCase() === k); };

  function newItem(type) {
    return { id: uid(), type, title: '', fields: {}, tags: [], links: [], note: '', fav: false, created: now(), updated: now() };
  }
  function fixItem(it) { return Object.assign({ title: '', fields: {}, tags: [], links: [], note: '', fav: false, created: now(), updated: now() }, it); }
  function normalizeData(o) {
    if (o && o.version === 2) {
      o.items = (o.items || []).map(fixItem);
      o.settings = Object.assign({ autolock: 5 }, o.settings);
      return o;
    }
    const items = [];
    (o.accounts || []).forEach((a) => items.push(fixItem({ id: a.id || uid(), type: 'login', title: a.site || '', fields: { username: a.username || '', password: a.password || '', url: a.url || '' }, note: a.note || '' })));
    (o.notes || []).forEach((n) => items.push(fixItem({ id: n.id || uid(), type: 'note', title: n.title || '', note: n.body || '' })));
    (o.files || []).forEach((f) => items.push(fixItem({ id: f.id || uid(), type: 'file', title: f.name, file: { name: f.name, mime: f.type, size: f.size, data: f.data } })));
    return { version: 2, items, settings: { autolock: 5 } };
  }

  async function save() {
    S.env = await C.seal(S.data, S.key, S.hdr);
    await setLocal('envelope', S.env);
    await setLocal('dirty', true);
    S.dirty = true;
    updateSync();
  }
  async function rekey(pw, rotate) {
    if (rotate || !S.secret) {
      S.secret = C.newSecret();
      await setLocal('secret', { kid: S.secret.kid, key: C.b64(S.secret.bytes) });
    }
    const salt = C.rand(16);
    S.key = await C.deriveKey(pw, salt, S.secret.bytes, C.ITER);
    S.hdr = { v: 2, iter: C.ITER, salt: C.b64(salt), kid: S.secret.kid };
    await save();
  }
  async function verifyPw(pw) {
    try {
      const k = await C.deriveKey(pw, C.unb64(S.hdr.salt), S.secret.bytes, S.hdr.iter);
      await C.open(S.env, k);
      return true;
    } catch { return false; }
  }

  // ---------------- 主题 ----------------
  function getTheme() { try { return localStorage.getItem('pv-theme'); } catch { return null; } }
  function effectiveTheme() { return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); }
  function applyTheme(t) {
    if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    const b = $('#btn-theme');
    b.innerHTML = `<svg viewBox="0 0 24 24">${effectiveTheme() === 'dark' ? ICONS.sun : ICONS.moon}</svg>`;
    if (S.graph) S.graph.refreshColors();
  }
  $('#btn-theme').addEventListener('click', () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('pv-theme', next); } catch { /* 无痕模式 */ }
    applyTheme(next);
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(getTheme()));

  // ================= 解锁 / 创建 =================
  const art = $('#vault-art');
  function shake() { art.classList.remove('shake'); void art.offsetWidth; art.classList.add('shake'); }
  function showAuth(mode, msg) {
    $('#screen-app').hidden = true;
    $('#screen-auth').hidden = false;
    art.classList.remove('open', 'deriving');
    $('#form-setup').hidden = mode !== 'setup';
    $('#form-unlock').hidden = mode !== 'unlock';
    if (mode === 'unlock') {
      const needSecret = S.env.v === 2 && !(S.secret && S.secret.kid === S.env.kid);
      $('#secret-wrap').hidden = !needSecret;
      $('#unlock-lead').textContent = needSecret ? '这台设备第一次打开，需要主密码和秘密钥匙' : '输入主密码打开保险箱';
      $('#unlock-err').textContent = msg || '';
      $('#unlock-meta').textContent = S.env.saved ? '最后保存于 ' + fmtDate(S.env.saved) : '';
      $('#unlock-pw').value = '';
      setTimeout(() => $('#unlock-pw').focus(), 60);
    } else setTimeout(() => $('#setup-pw').focus(), 60);
  }

  function bindMeter(input, meter, textEl) {
    input.addEventListener('input', () => {
      const s = C.strength(input.value);
      const i = meter.querySelector('i');
      i.style.width = Math.min(100, s.bits / 90 * 100) + '%';
      i.className = 'l' + s.level;
      if (textEl) textEl.textContent = input.value ? `${['', '太弱', '一般', '良好', '很强'][s.level]} · 约 ${s.bits} 位` : '建议用一句只有你知道的话，16 位以上';
    });
  }
  bindMeter($('#setup-pw'), $('#setup-meter'), $('#setup-meter-text'));
  bindMeter($('#set-new'), $('#set-meter'));

  function checkNewPw(p1, p2) {
    if (p1.length < 12) return '主密码至少 12 位';
    if (C.strength(p1).level < 3) return '主密码太容易被猜到，换一句更长、更独特的话';
    if (p1 !== p2) return '两次输入不一致';
    return '';
  }

  $('#form-setup').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#setup-btn');
    const p1 = $('#setup-pw').value, p2 = $('#setup-pw2').value;
    const msg = checkNewPw(p1, p2);
    $('#setup-err').textContent = msg;
    if (msg) { shake(); return; }
    btn.disabled = true; btn.textContent = '正在生成密钥…'; art.classList.add('deriving');
    try {
      S.data = normalizeData({ version: 2, items: [] });
      await rekey(p1, true);
      $('#setup-pw').value = $('#setup-pw2').value = '';
      await enterApp();
      showKit(true);
    } finally { btn.disabled = false; btn.textContent = '创建保险箱'; art.classList.remove('deriving'); }
  });
  $('#setup-import').addEventListener('change', (e) => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; });

  $('#form-unlock').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#unlock-btn'), err = $('#unlock-err');
    if (btn.disabled) return;
    btn.disabled = true;
    err.textContent = '';
    const f = (await getLocal('fails')) || { n: 0, until: 0 };
    btn.disabled = false;
    if (Date.now() < f.until) { err.textContent = `尝试次数过多，请 ${Math.ceil((f.until - Date.now()) / 1000)} 秒后再试`; shake(); return; }
    const env = S.env, pw = $('#unlock-pw').value;
    let secret = null;
    const known = S.secret && S.secret.kid === env.kid;
    if (env.v === 2) {
      if (known) secret = S.secret.bytes;
      else { try { secret = C.parseSecret($('#unlock-secret').value); } catch (x) { err.textContent = x.message; shake(); return; } }
    }
    btn.disabled = true; btn.textContent = '正在解密…'; art.classList.add('deriving');
    let key, obj;
    const iter = env.iter || 600000;
    try {
      key = await C.deriveKey(pw, C.unb64(env.salt), secret, iter);
      obj = await C.open(env, key);
    } catch {
      f.n++;
      f.until = f.n >= 3 ? Date.now() + Math.min(2 ** (f.n - 3), 300) * 1000 : 0;
      await setLocal('fails', f);
      err.textContent = (env.v === 2 && !known ? '主密码或秘密钥匙不正确' : '主密码不正确') + (f.until ? `，请 ${Math.round((f.until - Date.now()) / 1000)} 秒后再试` : '');
      btn.disabled = false; btn.textContent = '解锁'; art.classList.remove('deriving');
      shake();
      return;
    }
    await setLocal('fails', { n: 0, until: 0 });
    $('#unlock-pw').value = '';
    S.data = normalizeData(obj);
    if (env.v === 2) {
      S.key = key; S.hdr = { v: 2, iter, salt: env.salt, kid: env.kid };
      if (!known) {
        S.secret = { kid: env.kid, bytes: secret };
        if ($('#unlock-remember').checked) await setLocal('secret', { kid: env.kid, key: C.b64(secret) });
        $('#unlock-secret').value = '';
      }
      if (iter < C.ITER) await rekey(pw, false); // 自动升级迭代次数
    } else {
      await rekey(pw, true); // 旧版保险箱升级：加入秘密钥匙
    }
    btn.disabled = false; btn.textContent = '解锁'; art.classList.remove('deriving');
    await enterApp();
    if (env.v !== 2) { showKit(true); toast('保险箱已升级为“主密码 + 秘密钥匙”双重加密'); }
  });

  async function enterApp() {
    art.classList.remove('deriving');
    art.classList.add('open');
    if (motion()) await sleep(720);
    $('#screen-auth').hidden = true;
    $('#screen-app').hidden = false;
    S.dirty = !!(await getLocal('dirty'));
    S.filter = { kind: 'all' }; S.query = ''; $('#search').value = '';
    buildAddMenu();
    setView(S.view, true);
    bumpIdle();
  }

  function lock(msg) {
    S.key = null; S.data = null; S.hdr = null;
    for (const u of S.urls.values()) URL.revokeObjectURL(u.url);
    S.urls.clear();
    S.drawer = null;
    $('#drawer').classList.remove('open'); $('#drawer').replaceChildren(); $('#scrim').classList.remove('show');
    $('#add-menu').hidden = true;
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    $('#grid').replaceChildren();
    $('#search').value = ''; S.query = '';
    if (S.graph) S.graph.setData([], []);
    clearTimeout(S.idle);
    if (S.env) showAuth('unlock', msg); else showAuth('setup');
  }

  function bumpIdle() {
    clearTimeout(S.idle);
    if (S.key) S.idle = setTimeout(() => lock('因长时间无操作已自动锁定'), (S.data.settings.autolock || 5) * 60000);
  }
  ['pointermove', 'keydown', 'pointerdown', 'wheel', 'touchstart'].forEach((ev) => addEventListener(ev, bumpIdle, { passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && S.key) { clearTimeout(S.idle); S.idle = setTimeout(() => lock('因离开页面已自动锁定'), 60000); }
    else bumpIdle();
  });

  // ---------------- 应急包 ----------------
  function showKit(required) {
    const d = $('#dlg-kit');
    $('#kit-secret').textContent = C.formatSecret(S.secret.bytes);
    $('#kit-ack').checked = false;
    $('#kit-ack-wrap').hidden = !required;
    $('#kit-done').disabled = required;
    d.dataset.required = required ? '1' : '';
    d.showModal();
  }
  $('#kit-ack').addEventListener('change', () => { $('#kit-done').disabled = !$('#kit-ack').checked; });
  $('#dlg-kit').addEventListener('cancel', (e) => { if ($('#dlg-kit').dataset.required && !$('#kit-ack').checked) e.preventDefault(); });
  $('#kit-copy').addEventListener('click', () => copyText(C.formatSecret(S.secret.bytes), '秘密钥匙'));
  $('#kit-download').addEventListener('click', () => {
    const txt = [
      '私人保险箱 · 应急包',
      '========================',
      '',
      '网址：' + location.origin + location.pathname,
      '秘密钥匙：' + C.formatSecret(S.secret.bytes),
      '主密码：（请手写在这里，不要用电子方式保存）________________',
      '',
      '生成时间：' + fmtDate(now()),
      '',
      '说明：',
      '- 换设备、换浏览器或清除浏览器数据后，需要“主密码 + 秘密钥匙”才能打开保险箱。',
      '- 不要把这份文件上传到 GitHub，也不要和主密码放在同一个地方。',
      '- 建议打印出来或保存在密码管理器中，然后删除这个文件。',
    ].join('\r\n');
    const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + txt], { type: 'text/plain;charset=utf-8' })), download: '私人保险箱-应急包.txt' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  // ================= 渲染 =================
  function haystack(it) {
    const t = TYPES[it.type];
    const parts = [it.title, t.label, it.note, ...it.tags, it.file && it.file.name];
    for (const f of t.fields) if (!f.secret) parts.push(it.fields[f.k]);
    if (it.type === 'bank' && it.fields.number) parts.push(it.fields.number.replace(/\D/g, '').slice(-4));
    return parts.filter(Boolean).join('\n').toLowerCase();
  }
  function visibleItems() {
    let list = S.data.items;
    const f = S.filter;
    if (f.kind === 'type') list = list.filter((i) => i.type === f.value);
    else if (f.kind === 'fav') list = list.filter((i) => i.fav);
    else if (f.kind === 'tag') list = list.filter((i) => i.tags.includes(f.value));
    const toks = S.query.toLowerCase().split(/\s+/).filter(Boolean);
    if (toks.length) list = list.filter((it) => {
      const hay = haystack(it);
      return toks.every((t) => (t[0] === '#' && t.length > 1) ? it.tags.some((g) => g.toLowerCase().includes(t.slice(1))) : hay.includes(t));
    });
    return list;
  }
  function sortItems(list) {
    const cmp = {
      updated: (a, b) => (b.updated || '').localeCompare(a.updated || ''),
      title: (a, b) => (a.title || '').localeCompare(b.title || '', 'zh'),
      type: (a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || (a.title || '').localeCompare(b.title || '', 'zh'),
    }[S.sort];
    return list.slice().sort((a, b) => (b.fav - a.fav) || cmp(a, b));
  }
  function filterLabel() {
    const f = S.filter;
    if (f.kind === 'type') return TYPES[f.value].label;
    if (f.kind === 'fav') return '收藏';
    if (f.kind === 'tag') return '#' + f.value;
    return '全部';
  }
  function setFilter(kind, value) {
    if (kind === 'tag' && S.filter.kind === 'tag' && S.filter.value === value) kind = 'all';
    S.filter = (kind === 'type' || kind === 'tag') ? { kind, value } : { kind };
    render();
    $('#view-cards').scrollTo({ top: 0, behavior: motion() ? 'smooth' : 'auto' });
  }

  function render() {
    if (!S.data) return;
    renderNav();
    $('#view-title').textContent = filterLabel();
    if (S.view === 'cards') renderCards(); else updateGraph();
    updateSync();
  }

  function renderNav() {
    const items = S.data.items;
    const nav = $('#nav-types');
    const entries = [
      ['all', null, '全部', items.length, 'all', 'all'],
      ['fav', null, '收藏', items.filter((i) => i.fav).length, 'star', 'fav'],
      ...TYPE_ORDER.map((t) => ['type', t, TYPES[t].label, items.filter((i) => i.type === t).length, t, t]),
    ];
    nav.replaceChildren(...entries.map(([kind, value, label, n, ic, tc]) => {
      const on = S.filter.kind === kind && (S.filter.value || null) === value;
      return h('button', { type: 'button', class: `t-${tc}${on ? ' on' : ''}`, onclick: () => setFilter(kind, value) },
        h('span', { class: 'dot' }, icon(ic)), label, h('span', { class: 'n', textContent: n }));
    }));
    const counts = new Map();
    for (const it of items) for (const g of it.tags) counts.set(g, (counts.get(g) || 0) + 1);
    const tags = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'));
    $('#tags-section').hidden = !tags.length;
    $('#nav-tags').replaceChildren(...tags.map(([g, n]) => h('button', { type: 'button', class: S.filter.kind === 'tag' && S.filter.value === g ? 'on' : '', onclick: () => setFilter('tag', g) },
      h('span', { class: 'hash', textContent: '#' }), g, h('span', { class: 'n', textContent: n }))));
    $('#dl-tags').replaceChildren(...tags.map(([g]) => h('option', { value: g })));
    $('#dl-items').replaceChildren(...items.map((i) => h('option', { value: i.title || '' })));
    const used = S.env ? S.env.ct.length : 0;
    $('#storage-text').textContent = `${fmtSize(used)} / 70 MB`;
    const bar = $('#storage-bar');
    bar.style.width = Math.min(100, used / SYNC_LIMIT * 100) + '%';
    bar.className = used > SYNC_LIMIT * 0.9 ? '' : used > SYNC_LIMIT * 0.6 ? 'l2' : 'l4';
  }

  function renderCards() {
    const grid = $('#grid');
    const list = sortItems(visibleItems());
    $('#view-count').textContent = `${list.length} 项`;
    const first = new Map();
    if (motion()) for (const el of grid.children) first.set(el.dataset.id, el.getBoundingClientRect());
    const els = list.map(cardEl);
    grid.replaceChildren(...els);
    const empty = $('#empty');
    if (!list.length) {
      empty.hidden = false;
      emptyState(empty, S.query.trim() ? 'search' : S.filter.kind === 'type' ? S.filter.value : S.filter.kind);
    } else empty.hidden = true;
    if (motion()) {
      let n = 0;
      for (const el of els) {
        const r0 = first.get(el.dataset.id);
        if (r0) {
          const r1 = el.getBoundingClientRect();
          const dx = r0.left - r1.left, dy = r0.top - r1.top;
          if (dx || dy) el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 450, easing: 'cubic-bezier(.2,.8,.2,1)' });
        } else {
          el.animate([{ opacity: 0, transform: 'translateY(14px) scale(.96)' }, { opacity: 1, transform: 'none' }],
            { duration: 420, delay: Math.min(n++, 14) * 30, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
        }
      }
    }
    S.fresh = null;
  }

  function copyBtn(text, label, secret) {
    const b = h('button', { type: 'button', class: 'icon-btn sm', title: '复制' + label, 'aria-label': '复制' + label }, icon('copy'));
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      copyText(text, label, secret);
      b.classList.add('done'); b.replaceChildren(icon('check'));
      setTimeout(() => { b.classList.remove('done'); b.replaceChildren(icon('copy')); }, 1300);
    });
    return b;
  }
  async function copyText(text, label, secret = true) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`已复制${label}` + (secret ? '，30 秒后自动清除' : ''));
      if (secret) setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), 30000);
    } catch { toast('复制失败', false); }
  }
  const last4 = (n) => (n || '').replace(/\D/g, '').slice(-4);
  const fmtCard = (n) => (n || '').replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();

  function cardEl(it) {
    const t = TYPES[it.type], F = it.fields;
    const el = h('article', { class: `card t-${it.type}${S.fresh && S.fresh.has(it.id) ? ' fresh' : ''}`, tabIndex: 0, dataset: { id: it.id },
      onclick: () => openDrawer(it.id), onkeydown: (e) => { if (e.key === 'Enter') openDrawer(it.id); } });
    el.append(h('div', { class: 'card-head' },
      h('span', { class: 'badge-ic' }, icon(it.type)),
      h('div', { class: 'card-titles' }, h('div', { class: 'card-title', textContent: it.title || '未命名' }), h('div', { class: 'card-type', textContent: t.label })),
      it.fav ? h('span', { class: 'star' }, icon('star')) : null));
    const qa = h('div', { class: 'qa' });
    if (it.type === 'login') {
      const host = (() => { try { return new URL(F.url).host; } catch { return F.url; } })();
      if (F.username || host) el.append(h('div', { class: 'card-sub', textContent: F.username || host }));
      if (F.username) qa.append(copyBtn(F.username, '账号', false));
      if (F.password) qa.append(copyBtn(F.password, '密码', true));
    } else if (it.type === 'identity') {
      const sub = [F.kind, F.name].filter(Boolean).join(' · ');
      if (sub) el.append(h('div', { class: 'card-sub', textContent: sub }));
      if (F.number) { el.append(h('div', { class: 'card-sub mono', textContent: '•••• ' + F.number.slice(-4) })); qa.append(copyBtn(F.number, '证件号码', true)); }
    } else if (it.type === 'bank') {
      el.append(h('div', { class: 'mini-bank' }, h('div', { class: 'chipset' }), h('div', { class: 'bank', textContent: F.bank || '' }),
        h('div', { class: 'num', textContent: '•••• •••• •••• ' + (last4(F.number) || '••••') })));
      if (F.number) qa.append(copyBtn(F.number.replace(/\s+/g, ''), '卡号', true));
    } else if (it.type === 'note') {
      if (it.note) el.append(h('div', { class: 'card-note', textContent: it.note.replace(/\[\[([^\]]+)\]\]/g, '$1') }));
      if (it.note) qa.append(copyBtn(it.note, '内容', false));
    } else if (it.type === 'file' && it.file) {
      if ((it.file.mime || '').startsWith('image/')) {
        el.append(h('div', { class: 'thumb' }, h('img', { src: fileURL(it), alt: '', loading: 'lazy', draggable: false })));
      } else {
        el.append(h('div', { class: 'file-row' }, h('div', { class: 'file-ext', textContent: extOf(it.file.name) }),
          h('div', { class: 'card-sub', textContent: it.file.name })));
      }
      el.append(h('div', { class: 'card-sub', textContent: `${fmtSize(it.file.size)} · 可拖出` }));
      qa.append(iconBtn('download', '下载', () => downloadItem(it), 'sm'));
      makeDraggable(el, it);
    }
    if (it.type !== 'note' && it.note) el.append(h('div', { class: 'card-note one', textContent: it.note.replace(/\[\[([^\]]+)\]\]/g, '$1') }));
    if (it.tags.length) {
      const shown = it.tags.slice(0, 3);
      el.append(h('div', { class: 'chips' }, ...shown.map((g) => h('span', { class: 'chip', textContent: '#' + g, onclick: (e) => { e.stopPropagation(); setFilter('tag', g); } })),
        it.tags.length > 3 ? h('span', { class: 'chip', textContent: '+' + (it.tags.length - 3) }) : null));
    }
    if (qa.children.length) el.append(qa);
    return el;
  }

  // ---------------- 空状态 ----------------
  const EMPTY = {
    all: ['il-all', '保险箱还是空的', '新建一张卡片，或者直接把文件拖进窗口'],
    fav: ['il-all', '还没有收藏', '在卡片详情里点星标即可收藏'],
    login: ['il-login', '还没有账号密码', '把常用网站和 App 的登录信息存进来'],
    identity: ['il-identity', '还没有证件信息', '身份证、护照、驾照号码都可以放在这里'],
    bank: ['il-bank', '还没有银行卡', '卡号、CVV 都会加密保存，卡片上只显示后四位'],
    note: ['il-note', '还没有笔记', '用 [[卡片名称]] 把笔记和其他卡片连起来'],
    file: ['il-file', '还没有文件', '把文件拖进窗口，或者点“新建 → 上传文件”'],
    tag: ['il-search', '这个标签下没有卡片', ''],
    search: ['il-search', '没有找到匹配的内容', '换个关键词试试，也可以用 #标签 搜索'],
    graph: ['il-graph', '图谱还是空的', '添加卡片后，标签和 [[双链]] 会自动连成一张网'],
  };
  function emptyState(box, kind) {
    const [tpl, title, text] = EMPTY[kind] || EMPTY.all;
    box.className = 'empty t-' + (TYPES[kind] ? kind : 'all') + (box.id === 'graph-empty' ? ' floating' : '');
    const actions = h('div', { class: 'row' });
    if (TYPES[kind] && kind !== 'file') actions.append(h('button', { type: 'button', class: 'btn primary', onclick: () => openDrawer(null, true, newItem(kind)) }, icon('edit'), '新建' + TYPES[kind].short));
    if (kind === 'file') actions.append(h('button', { type: 'button', class: 'btn primary', onclick: () => $('#file-input').click() }, icon('upload'), '上传文件'));
    if ((kind === 'all' || kind === 'graph') && !S.data.items.length) {
      actions.append(h('button', { type: 'button', class: 'btn primary', onclick: () => openDrawer(null, true, newItem('login')) }, icon('edit'), '新建卡片'));
      actions.append(h('button', { type: 'button', class: 'btn', onclick: loadSamples }, '载入示例卡片'));
    }
    if (kind === 'search') actions.append(h('button', { type: 'button', class: 'btn', onclick: () => { $('#search').value = ''; S.query = ''; render(); } }, '清除搜索'));
    box.replaceChildren(...[document.getElementById(tpl).content.firstElementChild.cloneNode(true),
      h('h3', { textContent: title }), text ? h('p', { textContent: text }) : null, actions.children.length ? actions : null].filter(Boolean));
  }

  async function loadSamples() {
    const mk = (type, title, fields, tags, note = '') => Object.assign(newItem(type), { title, fields, tags, note });
    const items = [
      mk('login', '示例 · 邮箱', { username: 'demo@example.com', password: C.genPassword(18), url: 'https://mail.example.com' }, ['示例', '工作']),
      mk('login', '示例 · 网盘', { username: 'demo', password: C.genPassword(18), url: 'https://drive.example.com' }, ['示例', '文件']),
      mk('identity', '示例 · 护照', { name: '张三', kind: '护照', number: 'E00000000', expiry: '2030-01' }, ['示例', '证件', '旅行']),
      mk('bank', '示例 · 储蓄卡', { bank: '示例银行', holder: 'ZHANG SAN', number: '6222000000001234', expiry: '01/30', cvv: '000' }, ['示例', '财务']),
      mk('note', '示例 · 出行清单', {}, ['示例', '旅行'], '出发前检查：\n- [[示例 · 护照]] 是否在有效期内\n- [[示例 · 储蓄卡]] 开通境外支付'),
      mk('note', '示例 · 工作资料索引', {}, ['示例', '工作'], '账号见 [[示例 · 邮箱]]，资料都在 [[示例 · 网盘]]。'),
    ];
    S.data.items.push(...items);
    S.fresh = new Set(items.map((i) => i.id));
    await save();
    render();
    toast('已载入 6 张示例卡片（标签 #示例，可随时删除）');
  }

  // ---------------- 文件 ----------------
  function fileEntry(it) {
    const key = it.id + ':' + it.updated;
    let c = S.urls.get(it.id);
    if (c && c.key === key) return c;
    if (c) URL.revokeObjectURL(c.url);
    const blob = new Blob([C.unb64(it.file.data)], { type: it.file.mime || 'application/octet-stream' });
    c = { key, blob, url: URL.createObjectURL(blob) };
    S.urls.set(it.id, c);
    return c;
  }
  const fileURL = (it) => fileEntry(it).url;
  function downloadItem(it) {
    const a = h('a', { href: fileURL(it), download: it.file.name });
    document.body.append(a); a.click(); a.remove();
  }
  function makeDraggable(el, it) {
    el.draggable = true;
    el.addEventListener('dragstart', (e) => {
      S.dragOut = true;
      const c = fileEntry(it);
      const name = it.file.name.replace(/[:\r\n]/g, '_');
      const mime = it.file.mime || 'application/octet-stream';
      const dt = e.dataTransfer;
      dt.effectAllowed = 'copy';
      dt.setData('DownloadURL', `${mime}:${name}:${c.url}`); // Chrome / Edge：拖到桌面或文件夹
      dt.setData('text/plain', it.file.name);
      try { dt.items.add(new File([c.blob], it.file.name, { type: mime })); } catch { /* 部分浏览器不支持 */ }
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => { S.dragOut = false; el.classList.remove('dragging'); });
  }
  async function copyImage(it) {
    try {
      let blob = fileEntry(it).blob;
      if (it.file.mime !== 'image/png') {
        const bmp = await createImageBitmap(blob);
        const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
        cv.getContext('2d').drawImage(bmp, 0, 0);
        blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('图片已复制，可以直接粘贴到其他网站');
    } catch { toast('复制失败，请改用拖拽或下载', false); }
  }
  async function readFile(f) {
    return { name: f.name, mime: f.type || 'application/octet-stream', size: f.size, data: C.b64(await f.arrayBuffer()) };
  }
  async function addFiles(files) {
    if (!S.key || !files.length) return;
    const added = [];
    for (const f of files) {
      if (f.size > MAX_FILE) { toast(`“${f.name}”超过 25MB，已跳过`, false); continue; }
      const it = newItem('file');
      it.title = f.name;
      it.file = await readFile(f);
      if (S.filter.kind === 'tag') it.tags = [S.filter.value];
      S.data.items.push(it);
      added.push(it.id);
    }
    if (!added.length) return;
    await save();
    S.fresh = new Set(added);
    if (S.filter.kind === 'fav' || (S.filter.kind === 'type' && S.filter.value !== 'file')) S.filter = { kind: 'all' };
    render();
    toast(`已加密保存 ${added.length} 个文件`);
    if (S.env.ct.length > SYNC_LIMIT) toast('总容量已超过可同步上限（70MB），导出的文件可能无法上传到 GitHub', false);
  }
  $('#file-input').addEventListener('change', (e) => { addFiles([...e.target.files]); e.target.value = ''; });

  // 拖入
  let dragDepth = 0;
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  const canDrop = () => S.key && !S.dragOut && !(S.drawer && S.drawer.edit);
  addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (!canDrop()) return;
    dragDepth++;
    $('#dropzone').classList.add('show');
  });
  addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = canDrop() ? 'copy' : 'none'; } });
  addEventListener('dragleave', () => { if (dragDepth && --dragDepth <= 0) { dragDepth = 0; $('#dropzone').classList.remove('show'); } });
  addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    const ok = canDrop();
    dragDepth = 0; $('#dropzone').classList.remove('show');
    if (ok) addFiles([...e.dataTransfer.files]);
  });

  // ================= 详情抽屉 =================
  function openDrawer(id, edit = false, draft = null) {
    S.drawer = { id: draft ? draft.id : id, edit, draft };
    renderDrawer();
    const dr = $('#drawer');
    dr.classList.add('open'); dr.setAttribute('aria-hidden', 'false');
    $('#scrim').classList.add('show');
  }
  function closeDrawer() {
    S.drawer = null;
    const dr = $('#drawer');
    dr.classList.remove('open'); dr.setAttribute('aria-hidden', 'true');
    $('#scrim').classList.remove('show');
  }
  $('#scrim').addEventListener('click', () => { if (S.drawer && S.drawer.edit) cancelEdit(); else closeDrawer(); });

  const sec = (title, ...kids) => h('div', { class: 'sec' }, title ? h('div', { class: 'sec-title', textContent: title }) : null, ...kids);

  function fieldRow(f, val) {
    if (!val) return null;
    let shown = !f.secret;
    const valEl = h('div', { class: 'f-val' + (f.secret ? ' secret' : '') });
    const paint = () => {
      const v = f.card ? fmtCard(val) : val;
      if (!shown) { valEl.textContent = '•'.repeat(Math.min(14, Math.max(8, val.length))); return; }
      if (f.url && /^https?:\/\//i.test(val)) valEl.replaceChildren(h('a', { href: val, target: '_blank', rel: 'noopener noreferrer', textContent: val, onclick: (e) => e.stopPropagation() }));
      else valEl.textContent = v;
    };
    paint();
    const ops = h('div', { class: 'f-ops' });
    if (f.secret) {
      const eye = iconBtn('eye', '显示', () => { shown = !shown; paint(); eye.replaceChildren(icon(shown ? 'eyeoff' : 'eye')); eye.title = shown ? '隐藏' : '显示'; }, 'sm');
      ops.append(eye);
    }
    if (f.copy) ops.append(copyBtn(f.card ? val.replace(/\s+/g, '') : val, f.l, !!f.secret));
    return h('div', { class: 'f-row' }, h('div', { class: 'f-main' }, h('div', { class: 'f-label', textContent: f.l }), valEl), ops);
  }
  function noteView(text) {
    const box = h('div', { class: 'note-view' });
    const re = /\[\[([^\]]+)\]\]/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      box.append(text.slice(last, m.index));
      const target = findByTitle(m[1]);
      box.append(target
        ? h('button', { type: 'button', class: 'wikilink', textContent: m[1], onclick: () => openDrawer(target.id) })
        : h('span', { class: 'wikilink missing', textContent: m[1], title: '没有找到同名卡片' }));
      last = re.lastIndex;
    }
    box.append(text.slice(last));
    return box;
  }
  function mentions(it) {
    const ids = [];
    const re = /\[\[([^\]]+)\]\]/g;
    let m;
    while ((m = re.exec(it.note || ''))) { const t = findByTitle(m[1]); if (t && t.id !== it.id) ids.push(t.id); }
    return ids;
  }
  function relations(it) {
    const out = new Set([...it.links, ...mentions(it)].filter((id) => id !== it.id && byId(id)));
    const back = S.data.items.filter((o) => o.id !== it.id && !out.has(o.id) && (o.links.includes(it.id) || mentions(o).includes(it.id)));
    return { out: [...out].map(byId), back };
  }
  const relEl = (o, note) => h('button', { type: 'button', class: `rel t-${o.type}`, onclick: () => openDrawer(o.id) },
    h('span', { class: 'badge-ic' }, icon(o.type)), o.title || '未命名', h('small', { textContent: note }));

  function fileSection(it) {
    const box = sec(null);
    const mime = it.file.mime || '';
    if (mime.startsWith('image/')) box.append(h('div', { class: 'preview' }, h('img', { src: fileURL(it), alt: it.file.name, draggable: false })));
    else if ((mime.startsWith('text/') || /\.(txt|md|csv|json|log)$/i.test(it.file.name)) && it.file.size < 200000) {
      box.append(h('div', { class: 'preview' }, h('pre', { textContent: new TextDecoder().decode(C.unb64(it.file.data)) })));
    }
    const drag = h('div', { class: 'drag-out', title: '按住拖到桌面、文件夹或其他网站的上传区' },
      h('span', { class: 'grip' }, icon('grip')),
      h('div', { class: 'file-ext', textContent: extOf(it.file.name) }),
      h('div', { class: 'f-main' }, h('div', { class: 'card-title', textContent: it.file.name }), h('small', { textContent: `${fmtSize(it.file.size)} · 按住拖出去` })),
      iconBtn('download', '下载', () => downloadItem(it)));
    makeDraggable(drag, it);
    box.append(drag);
    if (mime.startsWith('image/') && navigator.clipboard && window.ClipboardItem) {
      box.append(h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: () => copyImage(it) }, icon('image'), '复制图片（可直接粘贴到其他网站）')));
    }
    return box;
  }

  function renderDrawer() {
    const d = S.drawer, dr = $('#drawer');
    if (!d) return;
    if (d.edit) { renderEditor(); return; }
    const it = byId(d.id);
    if (!it) { closeDrawer(); return; }
    const t = TYPES[it.type];
    dr.className = `drawer open t-${it.type}`;
    const fav = iconBtn('star', it.fav ? '取消收藏' : '收藏', async () => { it.fav = !it.fav; await save(); render(); renderDrawer(); }, it.fav ? 'on' : '');
    const head = h('div', { class: 'drawer-head' },
      h('span', { class: 'badge-ic' }, icon(it.type)),
      h('div', { class: 'card-titles' }, h('h2', { textContent: it.title || '未命名' }), h('div', { class: 'card-type', textContent: t.label })),
      h('div', { class: 'tools' }, fav,
        iconBtn('edit', '编辑', () => openDrawer(it.id, true, structuredClone(it))),
        iconBtn('trash', '删除', () => removeItem(it)),
        iconBtn('x', '关闭', closeDrawer)));
    const body = h('div', { class: 'drawer-body' });
    if (it.type === 'file' && it.file) body.append(fileSection(it));
    if (it.type === 'bank') {
      const F = it.fields;
      body.append(h('div', { class: 'mini-bank big' }, h('div', { class: 'chipset' }), h('div', { class: 'bank', textContent: F.bank || '' }),
        h('div', { class: 'num', textContent: '•••• •••• •••• ' + (last4(F.number) || '••••') }),
        h('div', { class: 'holder' }, h('span', { textContent: F.holder || '' }), h('span', { textContent: F.expiry || '' }))));
    }
    const rows = t.fields.map((f) => fieldRow(f, it.fields[f.k])).filter(Boolean);
    if (rows.length) body.append(sec(null, h('div', { class: 'fields' }, ...rows)));
    if (it.note) body.append(sec(it.type === 'note' ? '内容' : '备注', noteView(it.note)));
    if (!rows.length && !it.note && it.type !== 'file') body.append(h('p', { class: 'hint', textContent: '这张卡片还没有内容，点右上角的编辑按钮补充。' }));
    if (it.tags.length) body.append(sec('标签', h('div', { class: 'chips' }, ...it.tags.map((g) => h('span', { class: 'chip', textContent: '#' + g, onclick: () => { closeDrawer(); setFilter('tag', g); } })))));
    const rel = relations(it);
    if (rel.out.length || rel.back.length) {
      body.append(sec('关联', h('div', { class: 'rel-list' }, ...rel.out.map((o) => relEl(o, '链接到')), ...rel.back.map((o) => relEl(o, '被引用')))));
    }
    body.append(h('p', { class: 'meta', textContent: `创建于 ${fmtDate(it.created)} · 更新于 ${fmtDate(it.updated)}` }));
    dr.replaceChildren(head, body);
  }

  // ---------------- 编辑 ----------------
  function inputField(label, value, set, o = {}) {
    const inp = o.textarea ? h('textarea', { value: value || '', placeholder: o.ph || '' })
      : h('input', { type: 'text', value: value || '', placeholder: o.ph || '', autocomplete: 'off', spellcheck: false });
    inp.addEventListener('input', () => set(inp.value));
    return h('label', { class: 'field' }, h('span', { textContent: label }), inp);
  }
  function secretField(it, f) {
    const inp = h('input', { type: 'password', value: it.fields[f.k] || '', placeholder: f.ph || '', autocomplete: 'new-password', spellcheck: false });
    const wrap = h('div', { class: 'pw-wrap' }, inp);
    let meter = null;
    const paintMeter = () => {
      if (!meter) return;
      const s = C.strength(inp.value), i = meter.firstChild;
      i.style.width = Math.min(100, s.bits / 90 * 100) + '%'; i.className = 'l' + s.level;
    };
    inp.addEventListener('input', () => { it.fields[f.k] = inp.value; paintMeter(); });
    const eye = iconBtn('eye', '显示', () => { inp.type = inp.type === 'password' ? 'text' : 'password'; eye.replaceChildren(icon(inp.type === 'password' ? 'eye' : 'eyeoff')); });
    wrap.append(eye);
    if (f.gen) {
      wrap.append(iconBtn('dice', '生成强密码', () => { inp.value = C.genPassword(20); inp.type = 'text'; it.fields[f.k] = inp.value; paintMeter(); }));
      meter = h('div', { class: 'meter' }, h('i'));
    }
    const lab = h('label', { class: 'field' }, h('span', { textContent: f.l }), wrap);
    if (meter) { lab.append(h('div', { class: 'gap' }), meter); paintMeter(); }
    return lab;
  }
  function chipEditor(getList, setList, toLabel, resolve, placeholder, listId) {
    const wrap = h('div', { class: 'tag-editor' });
    const input = h('input', { type: 'text', placeholder, list: listId, autocomplete: 'off' });
    const paint = () => wrap.replaceChildren(...getList().map((v) => h('span', { class: 'chip' }, toLabel(v),
      h('button', { type: 'button', textContent: '×', title: '移除', onclick: () => { setList(getList().filter((x) => x !== v)); paint(); input.focus(); } }))), input);
    const add = () => {
      const v = resolve(input.value);
      if (v && !getList().includes(v)) setList([...getList(), v]);
      input.value = '';
      paint(); input.focus();
    };
    input.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (e.key === 'Enter' || e.key === ',' || e.key === '，') { e.preventDefault(); add(); }
      else if (e.key === 'Backspace' && !input.value && getList().length) { setList(getList().slice(0, -1)); paint(); input.focus(); }
    });
    input.addEventListener('input', (e) => { if (!e.inputType || e.inputType === 'insertReplacementText') add(); });
    input.addEventListener('blur', () => { if (input.value.trim()) add(); });
    paint();
    return wrap;
  }
  function filePicker(it) {
    const input = h('input', { type: 'file' });
    const box = h('label', { class: 'file-pick' }, h('span', { class: 'grip' }, icon('upload')),
      h('div', { class: 'f-main' }, h('div', { class: 'card-title', textContent: it.file ? it.file.name : '点击选择，或把文件拖到这里' }),
        h('small', { class: 'meta', textContent: it.file ? fmtSize(it.file.size) + ' · 点击可替换' : '单个文件最大 25MB' })), input);
    const take = async (f) => {
      if (!f) return;
      if (f.size > MAX_FILE) { toast(`“${f.name}”超过 25MB`, false); return; }
      it.file = await readFile(f);
      if (!it.title) it.title = f.name;
      renderEditor();
    };
    input.addEventListener('change', () => take(input.files[0]));
    box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('over'); });
    box.addEventListener('dragleave', () => box.classList.remove('over'));
    box.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); box.classList.remove('over'); take(e.dataTransfer.files[0]); });
    return h('div', { class: 'field' }, h('span', { textContent: '文件' }), box);
  }

  function renderEditor() {
    const dr = $('#drawer'), it = S.drawer.draft;
    const isNew = !byId(it.id);
    dr.className = `drawer open t-${it.type}`;
    const head = h('div', { class: 'drawer-head' },
      h('span', { class: 'badge-ic' }, icon(it.type)),
      h('div', { class: 'card-titles' }, h('h2', { textContent: isNew ? '新建' + TYPES[it.type].short : '编辑' }), h('div', { class: 'card-type', textContent: TYPES[it.type].label })),
      h('div', { class: 'tools' }, iconBtn('x', '关闭', cancelEdit)));
    const body = h('div', { class: 'drawer-body' });
    if (isNew) {
      body.append(h('div', { class: 'type-pick' }, ...TYPE_ORDER.map((tp) => h('button', { type: 'button', class: `t-${tp}${tp === it.type ? ' on' : ''}`,
        onclick: () => { it.type = tp; renderEditor(); } }, h('span', { class: 'dot' }, icon(tp)), TYPES[tp].short))));
    }
    const titleField = inputField('名称', it.title, (v) => { it.title = v; }, { ph: { login: '例如：学校邮箱', identity: '例如：我的护照', bank: '例如：工资卡', note: '例如：租房信息', file: '默认使用文件名' }[it.type] });
    body.append(titleField);
    if (it.type === 'file') body.append(filePicker(it));
    for (const f of TYPES[it.type].fields) body.append(f.secret ? secretField(it, f) : inputField(f.l, it.fields[f.k], (v) => { it.fields[f.k] = v; }, { ph: f.ph }));
    body.append(h('div', { class: 'field' }, h('span', { textContent: '标签' }),
      chipEditor(() => it.tags, (l) => { it.tags = l; }, (g) => '#' + g, (v) => v.replace(/^[#\s]+/, '').trim(), '输入后按回车', 'dl-tags')));
    body.append(h('div', { class: 'field' }, h('span', { textContent: '关联卡片' }),
      chipEditor(() => it.links, (l) => { it.links = l; }, (id) => (byId(id) || {}).title || '未命名',
        (v) => { const t = findByTitle(v); return t && t.id !== it.id ? t.id : null; }, '输入卡片名称选择', 'dl-items')));
    body.append(inputField(it.type === 'note' ? '内容' : '备注', it.note, (v) => { it.note = v; }, { textarea: true, ph: '支持 [[卡片名称]] 链接到其他卡片' }));
    const foot = h('div', { class: 'drawer-foot' }, h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn', textContent: '取消', onclick: cancelEdit }),
      h('button', { type: 'button', class: 'btn primary', textContent: '保存', onclick: commitEdit }));
    dr.replaceChildren(head, body, foot);
    if (isNew) setTimeout(() => titleField.querySelector('input').focus(), 80);
  }
  function cancelEdit() {
    const d = S.drawer;
    if (d && byId(d.draft.id)) { S.drawer = { id: d.draft.id, edit: false }; renderDrawer(); } else closeDrawer();
  }
  async function commitEdit() {
    const it = S.drawer.draft;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); // 提交未完成的标签输入
    if (it.type === 'file' && !it.file) { toast('请先选择文件', false); return; }
    if (it.type !== 'file') delete it.file;
    it.title = (it.title || '').trim() || (it.file && it.file.name) || '未命名';
    const keep = {};
    for (const f of TYPES[it.type].fields) if (it.fields[f.k]) keep[f.k] = it.fields[f.k];
    it.fields = keep;
    it.updated = now();
    const i = S.data.items.findIndex((x) => x.id === it.id);
    if (i >= 0) S.data.items[i] = it; else { S.data.items.push(it); S.fresh = new Set([it.id]); }
    await save();
    S.drawer = { id: it.id, edit: false };
    render();
    renderDrawer();
    toast('已加密保存');
  }
  async function removeItem(it) {
    if (!(await ask('删除这张卡片？', `“${it.title || '未命名'}”会从保险箱中删除，此操作不能撤销。`))) return;
    S.data.items = S.data.items.filter((x) => x !== it);
    for (const o of S.data.items) o.links = o.links.filter((id) => id !== it.id);
    await save();
    closeDrawer();
    render();
    toast('已删除');
  }

  // ---------------- 新建菜单 ----------------
  function buildAddMenu() {
    const m = $('#add-menu');
    m.replaceChildren(
      ...TYPE_ORDER.filter((t) => t !== 'file').map((tp) => h('button', { type: 'button', class: `t-${tp}`, onclick: () => { m.hidden = true; openDrawer(null, true, newItem(tp)); } },
        h('span', { class: 'dot' }, icon(tp)), h('span', null, TYPES[tp].label, h('small', { textContent: TYPE_DESC[tp] })))),
      h('hr'),
      h('button', { type: 'button', class: 't-file', onclick: () => { m.hidden = true; $('#file-input').click(); } },
        h('span', { class: 'dot' }, icon('upload')), h('span', null, '上传文件', h('small', { textContent: '也可以直接把文件拖进窗口' }))));
  }
  $('#btn-add').addEventListener('click', (e) => { e.stopPropagation(); $('#add-menu').hidden = !$('#add-menu').hidden; });
  document.addEventListener('click', (e) => { if (!e.target.closest('.add-wrap')) $('#add-menu').hidden = true; });

  // ================= 图谱 =================
  function ensureGraph() {
    if (S.graph) return;
    S.graph = window.VGraph.create($('#graph'), {
      onClick: (n) => { if (n.kind === 'tag') setFilter('tag', n.id.slice(1)); else openDrawer(n.id); },
    });
  }
  function updateGraph(refit) {
    ensureGraph();
    const items = S.data.items, nodes = [], edges = [], seen = new Set();
    const link = (a, b) => { const k = a < b ? a + '|' + b : b + '|' + a; if (a !== b && !seen.has(k)) { seen.add(k); edges.push([a, b]); } };
    for (const it of items) {
      nodes.push({ id: it.id, label: it.title || '未命名', type: it.type, kind: 'item' });
      it.links.forEach((l) => link(it.id, l));
      mentions(it).forEach((l) => link(it.id, l));
    }
    if (S.graphTags) {
      const tags = new Set();
      for (const it of items) for (const g of it.tags) { tags.add(g); link(it.id, '#' + g); }
      tags.forEach((g) => nodes.push({ id: '#' + g, label: '#' + g, type: 'tag', kind: 'tag' }));
    }
    S.graph.setData(nodes, edges);
    let set = null;
    if (S.filter.kind !== 'all' || S.query.trim()) {
      set = new Set(visibleItems().map((i) => i.id));
      if (S.filter.kind === 'tag') set.add('#' + S.filter.value);
    }
    const sig = set ? [...set].sort().join(',') : '';
    S.graph.setHighlight(set, refit || sig !== S.graphSig);
    S.graphSig = sig;
    $('#view-count').textContent = '';
    const ge = $('#graph-empty');
    ge.hidden = items.length > 0;
    if (!items.length) emptyState(ge, 'graph');
    $('#graph-legend').replaceChildren(...[
      ...TYPE_ORDER.map((tp) => h('span', { class: `t-${tp}` }, h('i'), TYPES[tp].short)),
      S.graphTags ? h('span', null, h('i', { class: 'hollow' }), '标签') : null,
      set ? h('span', { class: 't-all' }, h('i'), `匹配 ${[...set].filter((id) => id[0] !== '#').length} 项`) : null].filter(Boolean));
  }
  $('#g-zoom-in').addEventListener('click', () => S.graph && S.graph.zoom(1.3));
  $('#g-zoom-out').addEventListener('click', () => S.graph && S.graph.zoom(1 / 1.3));
  $('#g-fit').addEventListener('click', () => S.graph && S.graph.fit());
  $('#g-tags').addEventListener('change', (e) => { S.graphTags = e.target.checked; updateGraph(true); S.graph.reheat(); });

  function setView(v, force) {
    if (S.view === v && !force) return;
    S.view = v;
    document.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    $('#view-cards').hidden = v !== 'cards';
    $('#view-graph').hidden = v !== 'graph';
    renderNav();
    $('#view-title').textContent = filterLabel();
    if (v === 'graph') { ensureGraph(); S.graph.resize(); S.graphSig = null; updateGraph(true); }
    else renderCards();
    updateSync();
  }
  document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  // ---------------- 搜索 / 排序 ----------------
  let searchT = 0;
  $('#search').addEventListener('input', (e) => {
    S.query = e.target.value;
    clearTimeout(searchT);
    searchT = setTimeout(render, S.view === 'graph' ? 160 : 60);
  });
  $('#sort').addEventListener('change', (e) => { S.sort = e.target.value; renderCards(); });
  document.addEventListener('keydown', (e) => {
    if (!S.key) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) {
      e.preventDefault(); $('#search').focus(); $('#search').select();
    } else if (e.key === 'Escape') {
      if (document.querySelector('dialog[open]')) return;
      if (!$('#add-menu').hidden) $('#add-menu').hidden = true;
      else if (S.drawer) { if (S.drawer.edit) cancelEdit(); else closeDrawer(); }
      else if (S.query) { $('#search').value = ''; S.query = ''; render(); }
    }
  });

  // ================= 同步 / 设置 =================
  function updateSync() { $('#sync-pill').hidden = !S.dirty; }
  function exportFile() {
    if (!S.env) return;
    const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(S.env)], { type: 'application/json' })), download: 'vault.json' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    setLocal('dirty', false); S.dirty = false; updateSync();
    toast('已下载 vault.json，替换到 GitHub 仓库后提交即可同步');
  }
  async function importFile(file) {
    let j;
    try { j = JSON.parse(await file.text()); } catch { j = null; }
    if (!C.valid(j)) { toast('这不是有效的 vault.json', false); return; }
    if (S.env && !(await ask('导入加密文件？', '会覆盖这台设备上的保险箱（未导出的更改会丢失）。', '导入'))) return;
    S.env = j;
    await setLocal('envelope', j); await setLocal('dirty', false);
    lock('已导入，请解锁');
  }
  $('#sync-pill').addEventListener('click', exportFile);
  $('#btn-lock').addEventListener('click', () => lock());

  const dset = $('#dlg-settings');
  $('#btn-settings').addEventListener('click', () => {
    $('#set-autolock').value = String(S.data.settings.autolock || 5);
    ['#set-old', '#set-new', '#set-new2'].forEach((s) => { $(s).value = ''; });
    $('#set-rotate').checked = false; $('#set-err').textContent = '';
    dset.showModal();
  });
  dset.addEventListener('close', () => ['#set-old', '#set-new', '#set-new2'].forEach((s) => { $(s).value = ''; }));
  $('#set-autolock').addEventListener('change', async (e) => { S.data.settings.autolock = +e.target.value; await save(); bumpIdle(); toast('已更新自动锁定时间'); });
  async function needOld() {
    const err = $('#set-err'); err.textContent = '';
    const pw = $('#set-old').value;
    if (!pw) { err.textContent = '请先输入当前主密码'; $('#set-old').focus(); return null; }
    if (!(await verifyPw(pw))) { err.textContent = '当前主密码不正确'; return null; }
    return pw;
  }
  $('#set-showkit').addEventListener('click', async () => { if (await needOld()) { dset.close(); showKit(false); } });
  $('#set-forget').addEventListener('click', async () => {
    if (!(await ask('在本设备忘记秘密钥匙？', '下次在这台设备解锁时，需要重新输入应急包里的秘密钥匙。请确认你已保存好应急包。', '忘记'))) return;
    await delLocal('secret'); S.secret = null;
    lock('已在本设备忘记秘密钥匙');
  });
  $('#set-change').addEventListener('click', async () => {
    const btn = $('#set-change');
    const old = await needOld(); if (!old) return;
    const p1 = $('#set-new').value, p2 = $('#set-new2').value;
    const msg = checkNewPw(p1, p2);
    if (msg) { $('#set-err').textContent = msg; return; }
    btn.disabled = true; btn.textContent = '正在重新加密…';
    try {
      const rotate = $('#set-rotate').checked;
      await rekey(p1, rotate);
      dset.close();
      toast('主密码已修改，记得导出新的 vault.json');
      if (rotate) showKit(true);
    } finally { btn.disabled = false; btn.textContent = '修改'; }
  });
  $('#set-export').addEventListener('click', exportFile);
  $('#set-import').addEventListener('change', (e) => { dset.close(); if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; });
  $('#set-reload').addEventListener('click', async () => {
    const r = await fetchRemote();
    if (!r) { $('#set-err').textContent = 'GitHub 上还没有 vault.json'; return; }
    if (!(await ask('改用 GitHub 上的版本？', '这台设备上未导出的更改会被丢弃。', '确定'))) return;
    S.env = r; await setLocal('envelope', r); await setLocal('dirty', false);
    dset.close();
    lock('已加载 GitHub 上的版本，请解锁');
  });

  // ================= 启动 =================
  (async () => {
    applyTheme(getTheme());
    if (!window.crypto || !crypto.subtle) { document.body.textContent = '请通过 HTTPS 打开，并使用新版浏览器'; return; }
    const local = await getLocal('envelope');
    const rec = await getLocal('secret');
    if (rec) S.secret = { kid: rec.kid, bytes: C.unb64(rec.key) };
    const remote = await fetchRemote();
    const dirty = await getLocal('dirty');
    if (C.valid(local) && (dirty || !remote || (local.saved || '') >= (remote.saved || ''))) S.env = local;
    else if (remote) { S.env = remote; await setLocal('envelope', remote); }
    if (S.env) showAuth('unlock'); else showAuth('setup');
  })();
})();
