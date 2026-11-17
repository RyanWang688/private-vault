'use strict';
/*
 * 私人保险箱 —— 全部加密/解密都在浏览器本地完成。
 * 密钥：PBKDF2-SHA256（600,000 次）从主密码派生；加密：AES-256-GCM。
 * 主密码和明文从不离开本机，也从不写入存储。仓库里只有 vault.json（密文）。
 */
(() => {
  const ITER = 600000;
  const IDLE_MS = 5 * 60 * 1000;
  const MIN_PW = 12;
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const $ = (id) => document.getElementById(id);

  // ---------- 状态（只在内存中） ----------
  let key = null;        // CryptoKey（不可导出）
  let salt = null;       // Uint8Array
  let data = null;       // 解密后的对象
  let envelope = null;   // 当前加密包（用于解锁）
  let idleTimer = null;

  // ---------- 工具 ----------
  function b64(buf) {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(str) {
    const s = atob(str);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  const uid = () => b64(crypto.getRandomValues(new Uint8Array(9))).replace(/[+/=]/g, '');
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2200);
  }
  function show(view) {
    for (const v of ['setup', 'lock', 'main']) $('view-' + v).hidden = v !== view;
  }
  function fmtSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  // ---------- 加密 ----------
  async function deriveKey(password, saltBytes) {
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: ITER },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function seal(obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
    return { v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct), saved: new Date().toISOString() };
  }
  async function open(env, password) {
    const s = unb64(env.salt);
    const k = await deriveKey(password, s);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, k, unb64(env.ct));
    return { k, s, obj: JSON.parse(dec.decode(pt)) };
  }
  function validEnvelope(e) {
    return e && e.v === 1 && typeof e.salt === 'string' && typeof e.iv === 'string' && typeof e.ct === 'string';
  }

  // ---------- 本地存储（IndexedDB，只存密文） ----------
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
      return validEnvelope(j) ? j : null;
    } catch { return null; }
  }

  // ---------- 保存 ----------
  async function save() {
    envelope = await seal(data);
    await setLocal('envelope', envelope);
    await setLocal('dirty', true);
    $('dirty').hidden = false;
  }
  function exportFile() {
    if (!envelope) return;
    const blob = new Blob([JSON.stringify(envelope)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'vault.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setLocal('dirty', false); $('dirty').hidden = true;
    toast('已下载 vault.json，请替换到 GitHub 仓库并提交');
  }
  async function importFile(file) {
    try {
      const j = JSON.parse(await file.text());
      if (!validEnvelope(j)) throw new Error();
      if (envelope && !confirm('导入会覆盖本设备上的保险箱，确定吗？')) return;
      envelope = j;
      await setLocal('envelope', j); await setLocal('dirty', false);
      lock('已导入，请用该文件的主密码解锁');
    } catch { toast('文件无效'); }
  }

  // ---------- 锁定 / 解锁 ----------
  function lock(msg) {
    key = null; data = null;
    for (const id of ['list-accounts', 'list-notes', 'list-files']) $(id).textContent = '';
    for (const d of document.querySelectorAll('dialog')) if (d.open) d.close();
    $('unlock-pw').value = ''; $('unlock-err').textContent = msg || '';
    $('lock-source').textContent = envelope && envelope.saved ? '最后保存：' + new Date(envelope.saved).toLocaleString() : '';
    show('lock');
    $('unlock-pw').focus();
  }
  function bumpIdle() {
    clearTimeout(idleTimer);
    if (key) idleTimer = setTimeout(() => lock('因长时间无操作已自动锁定'), IDLE_MS);
  }
  ['mousemove', 'keydown', 'pointerdown', 'scroll', 'touchstart'].forEach((e) => addEventListener(e, bumpIdle, { passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && key) { clearTimeout(idleTimer); idleTimer = setTimeout(() => lock('因离开页面已自动锁定'), 60000); }
  });

  $('form-unlock').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('unlock-btn'); btn.disabled = true; btn.textContent = '解锁中…';
    try {
      const r = await open(envelope, $('unlock-pw').value);
      key = r.k; salt = r.s; data = normalize(r.obj);
      $('unlock-pw').value = '';
      $('dirty').hidden = !(await getLocal('dirty'));
      show('main'); render(); bumpIdle();
    } catch {
      $('unlock-err').textContent = '主密码错误';
    } finally { btn.disabled = false; btn.textContent = '解锁'; }
  });

  $('form-setup').addEventListener('submit', async (e) => {
    e.preventDefault();
    const p1 = $('setup-pw').value, p2 = $('setup-pw2').value;
    if (p1.length < MIN_PW) return void ($('setup-err').textContent = `主密码至少 ${MIN_PW} 位`);
    if (p1 !== p2) return void ($('setup-err').textContent = '两次输入不一致');
    salt = crypto.getRandomValues(new Uint8Array(16));
    key = await deriveKey(p1, salt);
    $('setup-pw').value = $('setup-pw2').value = '';
    data = normalize({});
    await save();
    show('main'); render(); bumpIdle();
    toast('已创建。记得点“导出加密文件”上传到 GitHub');
  });
  $('setup-import').addEventListener('change', (e) => e.target.files[0] && importFile(e.target.files[0]));

  function normalize(o) {
    return { accounts: o.accounts || [], notes: o.notes || [], files: o.files || [] };
  }

  // ---------- 渲染 ----------
  let currentTab = 'accounts';
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
    currentTab = b.dataset.tab;
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
    for (const t of ['accounts', 'notes', 'files']) $('tab-' + t).hidden = t !== currentTab;
    render();
  }));
  $('search').addEventListener('input', render);

  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (k === 'onclick') n.addEventListener('click', v); else n[k] = v;
    }
    for (const c of kids) if (c != null) n.append(c);
    return n;
  }
  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`已复制${label}，30 秒后清空剪贴板`);
      setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), 30000);
    } catch { toast('复制失败'); }
  }
  const match = (q, ...fields) => !q || fields.some((f) => (f || '').toLowerCase().includes(q));

  function render() {
    if (!data) return;
    const q = $('search').value.trim().toLowerCase();

    const la = $('list-accounts'); la.textContent = '';
    data.accounts.filter((a) => match(q, a.site, a.username, a.url, a.note))
      .sort((a, b) => (a.site || '').localeCompare(b.site || '', 'zh'))
      .forEach((a) => {
        const pwSpan = el('span', { textContent: '••••••••' });
        let shown = false;
        la.append(el('li', { className: 'item' },
          el('div', { className: 'main' },
            el('div', { className: 'title', textContent: a.site || '(未命名)' }),
            el('div', { className: 'sub' }, (a.username || '') + '  ', pwSpan),
            a.url ? el('div', { className: 'sub', textContent: a.url }) : null),
          el('div', { className: 'ops' },
            el('button', { textContent: '复制账号', onclick: () => copy(a.username || '', '账号') }),
            el('button', { textContent: '复制密码', onclick: () => copy(a.password || '', '密码') }),
            el('button', { textContent: '显示', onclick: (ev) => {
              shown = !shown; pwSpan.textContent = shown ? a.password : '••••••••';
              ev.target.textContent = shown ? '隐藏' : '显示';
            } }),
            el('button', { textContent: '编辑', onclick: () => editAccount(a) }))));
      });
    if (!la.children.length) la.append(el('li', { className: 'empty', textContent: q ? '没有匹配项' : '还没有账号' }));

    const ln = $('list-notes'); ln.textContent = '';
    data.notes.filter((n) => match(q, n.title, n.body)).forEach((n) => {
      ln.append(el('li', { className: 'item' },
        el('div', { className: 'main' },
          el('div', { className: 'title', textContent: n.title || '(无标题)' }),
          el('div', { className: 'sub', textContent: (n.body || '').slice(0, 300) })),
        el('div', { className: 'ops' },
          el('button', { textContent: '复制', onclick: () => copy(n.body || '', '内容') }),
          el('button', { textContent: '编辑', onclick: () => editNote(n) }))));
    });
    if (!ln.children.length) ln.append(el('li', { className: 'empty', textContent: q ? '没有匹配项' : '还没有信息' }));

    const lf = $('list-files'); lf.textContent = '';
    data.files.filter((f) => match(q, f.name)).forEach((f) => {
      lf.append(el('li', { className: 'item' },
        el('div', { className: 'main' },
          el('div', { className: 'title', textContent: f.name }),
          el('div', { className: 'sub', textContent: `${fmtSize(f.size)} · ${new Date(f.added).toLocaleDateString()}` })),
        el('div', { className: 'ops' },
          el('button', { textContent: '下载', onclick: () => downloadFile(f) }),
          el('button', { className: 'danger', textContent: '删除', onclick: async () => {
            if (!confirm(`删除文件“${f.name}”？`)) return;
            data.files = data.files.filter((x) => x !== f); await save(); render();
          } }))));
    });
    if (!lf.children.length) lf.append(el('li', { className: 'empty', textContent: q ? '没有匹配项' : '还没有文件' }));
  }

  // ---------- 编辑 ----------
  const dlg = $('dlg-edit');
  let onSave = null, onDelete = null;
  function field(id, label, value, type = 'text') {
    const input = type === 'textarea' ? el('textarea', { id, value: value || '' }) : el('input', { id, type, value: value || '', autocomplete: 'off', spellcheck: false });
    return el('label', null, label, input);
  }
  function openEditor(title, fields, saveFn, delFn) {
    $('edit-title').textContent = title;
    const box = $('edit-fields'); box.textContent = ''; fields.forEach((f) => box.append(f));
    $('edit-delete').hidden = !delFn;
    onSave = saveFn; onDelete = delFn;
    dlg.showModal();
  }
  $('edit-cancel').addEventListener('click', () => dlg.close());
  $('form-edit').addEventListener('submit', async (e) => { e.preventDefault(); await onSave(); dlg.close(); await save(); render(); });
  $('edit-delete').addEventListener('click', async () => {
    if (!confirm('确定删除？')) return;
    onDelete(); dlg.close(); await save(); render();
  });

  function genPassword(len = 20) {
    const cs = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+?';
    const out = []; const buf = new Uint32Array(len * 2); crypto.getRandomValues(buf);
    for (let i = 0; out.length < len && i < buf.length; i++) {
      if (buf[i] < Math.floor(0x100000000 / cs.length) * cs.length) out.push(cs[buf[i] % cs.length]);
    }
    return out.join('');
  }

  function editAccount(a) {
    const isNew = !a;
    a = a || { id: uid() };
    const pwInput = field('f-password', '密码', a.password, 'password');
    const pwRow = el('div', { className: 'pwrow' }, pwInput,
      el('button', { type: 'button', textContent: '显示', onclick: (ev) => {
        const i = $('f-password'); i.type = i.type === 'password' ? 'text' : 'password';
        ev.target.textContent = i.type === 'password' ? '显示' : '隐藏';
      } }),
      el('button', { type: 'button', textContent: '生成', onclick: () => { const i = $('f-password'); i.value = genPassword(); i.type = 'text'; } }));
    openEditor(isNew ? '新增账号' : '编辑账号', [
      field('f-site', '名称 / 网站', a.site),
      field('f-username', '账号 / 邮箱', a.username),
      pwRow,
      field('f-url', '网址', a.url, 'url'),
      field('f-note', '备注', a.note, 'textarea'),
    ], () => {
      Object.assign(a, {
        site: $('f-site').value.trim(), username: $('f-username').value, password: $('f-password').value,
        url: $('f-url').value.trim(), note: $('f-note').value, updated: new Date().toISOString(),
      });
      if (isNew) data.accounts.push(a);
    }, isNew ? null : () => { data.accounts = data.accounts.filter((x) => x !== a); });
  }
  function editNote(n) {
    const isNew = !n;
    n = n || { id: uid() };
    openEditor(isNew ? '新增信息' : '编辑信息', [
      field('f-title', '标题', n.title),
      field('f-body', '内容', n.body, 'textarea'),
    ], () => {
      Object.assign(n, { title: $('f-title').value.trim(), body: $('f-body').value, updated: new Date().toISOString() });
      if (isNew) data.notes.push(n);
    }, isNew ? null : () => { data.notes = data.notes.filter((x) => x !== n); });
  }
  $('add-account').addEventListener('click', () => editAccount(null));
  $('add-note').addEventListener('click', () => editNote(null));

  // ---------- 文件 ----------
  $('add-file').addEventListener('change', async (e) => {
    const files = [...e.target.files]; e.target.value = '';
    for (const f of files) {
      if (f.size > 40 * 1048576) { toast(`“${f.name}”太大（>40MB），已跳过`); continue; }
      data.files.push({ id: uid(), name: f.name, type: f.type || 'application/octet-stream', size: f.size, added: new Date().toISOString(), data: b64(await f.arrayBuffer()) });
    }
    if (files.length) { await save(); render(); toast('已加密保存'); }
  });
  function downloadFile(f) {
    const blob = new Blob([unb64(f.data)], { type: f.type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = f.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // ---------- 顶栏 & 设置 ----------
  $('btn-lock').addEventListener('click', () => lock());
  $('btn-export').addEventListener('click', exportFile);
  const ds = $('dlg-settings');
  $('btn-settings').addEventListener('click', () => { $('set-err').textContent = ''; ds.showModal(); });
  $('set-close').addEventListener('click', () => ds.close());
  $('set-import').addEventListener('change', (e) => { ds.close(); e.target.files[0] && importFile(e.target.files[0]); e.target.value = ''; });
  $('set-reload').addEventListener('click', async () => {
    const r = await fetchRemote();
    if (!r) return void ($('set-err').textContent = 'GitHub 上还没有 vault.json');
    if (!confirm('丢弃本设备上未导出的更改，改用 GitHub 上的版本？')) return;
    envelope = r; await setLocal('envelope', r); await setLocal('dirty', false);
    ds.close(); lock('已加载 GitHub 上的版本，请解锁');
  });
  $('set-change').addEventListener('click', async () => {
    const err = $('set-err'); err.textContent = '';
    const o = $('set-old').value, n1 = $('set-new').value, n2 = $('set-new2').value;
    try { await open(envelope, o); } catch { return void (err.textContent = '当前主密码错误'); }
    if (n1.length < MIN_PW) return void (err.textContent = `新主密码至少 ${MIN_PW} 位`);
    if (n1 !== n2) return void (err.textContent = '两次输入不一致');
    salt = crypto.getRandomValues(new Uint8Array(16));
    key = await deriveKey(n1, salt);
    $('set-old').value = $('set-new').value = $('set-new2').value = '';
    await save(); ds.close();
    toast('主密码已修改，请导出并上传新的 vault.json');
  });

  // ---------- 启动 ----------
  (async () => {
    if (!window.crypto || !crypto.subtle) { document.body.textContent = '需要 HTTPS 和现代浏览器'; return; }
    const local = await getLocal('envelope');
    const remote = await fetchRemote();
    // 本设备有未导出的更改 → 用本地；否则用更新的那份
    const dirty = await getLocal('dirty');
    if (local && (dirty || !remote || (local.saved || '') >= (remote.saved || ''))) envelope = local;
    else if (remote) { envelope = remote; await setLocal('envelope', remote); }
    if (envelope) lock(); else show('setup');
  })();
})();
