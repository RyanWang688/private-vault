'use strict';
/*
 * 加密层
 *  - 主密码 → PBKDF2-SHA256（1,000,000 次）→ 256 位
 *  - 再与 160 位随机「秘密钥匙」一起经 HKDF-SHA256 → AES-256-GCM 密钥
 *  - 头部（版本/迭代次数/盐/钥匙编号）作为 AAD 绑定到密文，防篡改
 * 没有秘密钥匙时，vault.json 的搜索空间至少 2^160，离线暴力破解不可行。
 */
window.VCrypto = (() => {
  const ITER = 1000000;
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford Base32

  function b64(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
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
  const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

  function toB32(bytes) {
    let out = '', bits = 0, val = 0;
    for (const b of bytes) {
      val = ((val << 8) | b) & 0xffff; bits += 8;
      while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
    }
    if (bits > 0) out += B32[(val << (5 - bits)) & 31];
    return out;
  }
  function fromB32(str) {
    let bits = 0, val = 0;
    const out = [];
    for (const c of str) {
      const i = B32.indexOf(c);
      if (i < 0) throw new Error('bad char');
      val = ((val << 5) | i) & 0xffff; bits += 5;
      if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
    }
    return new Uint8Array(out);
  }
  function formatSecret(bytes) { return 'PV1-' + toB32(bytes).match(/.{1,4}/g).join('-'); }
  function parseSecret(str) {
    const s = String(str || '').trim().toUpperCase().replace(/^PV1[\s-]*/, '')
      .replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
    if (s.length !== 32) throw new Error('秘密钥匙格式不对');
    return fromB32(s);
  }
  function newSecret() {
    return { kid: b64(rand(6)).replace(/[+/=]/g, ''), bytes: rand(20) };
  }

  async function deriveKey(password, salt, secretBytes, iter) {
    const base = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
    const pw = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, 256));
    try {
      if (!secretBytes) {
        return await crypto.subtle.importKey('raw', pw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
      }
      const ikm = new Uint8Array(pw.length + secretBytes.length);
      ikm.set(pw); ikm.set(secretBytes, pw.length);
      const hk = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveKey']);
      ikm.fill(0);
      return await crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('private-vault/v2') },
        hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    } finally { pw.fill(0); }
  }

  const aad = (h) => enc.encode(JSON.stringify([h.v, h.iter, h.salt, h.kid]));

  async function seal(obj, key, hdr) {
    const iv = rand(12);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(hdr) }, key, enc.encode(JSON.stringify(obj)));
    return { v: 2, kdf: 'PBKDF2-SHA256+HKDF-SHA256', iter: hdr.iter, salt: hdr.salt, kid: hdr.kid, iv: b64(iv), ct: b64(ct), saved: new Date().toISOString() };
  }
  async function open(env, key) {
    const params = { name: 'AES-GCM', iv: unb64(env.iv) };
    if (env.v === 2) params.additionalData = aad(env);
    const pt = await crypto.subtle.decrypt(params, key, unb64(env.ct));
    return JSON.parse(dec.decode(pt));
  }
  function valid(e) {
    return !!e && (e.v === 1 || e.v === 2) && typeof e.salt === 'string' && typeof e.iv === 'string' && typeof e.ct === 'string';
  }

  // 主密码强度（估算位数，偏保守）
  const COMMON = ['password', 'passw0rd', '123456', 'qwerty', 'admin', 'welcome', 'iloveyou', 'abc123', 'letmein', '111111', '000000', 'asdf', 'zxcv', 'woaini', '5201314'];
  function strength(pw) {
    if (!pw) return { bits: 0, level: 0 };
    let pool = 0;
    if (/[a-z]/.test(pw)) pool += 26;
    if (/[A-Z]/.test(pw)) pool += 26;
    if (/[0-9]/.test(pw)) pool += 10;
    if (/[^\w\s\u0080-￿]/.test(pw)) pool += 33;
    if (/\s/.test(pw)) pool += 1;
    if (/[\u0080-￿]/.test(pw)) pool += 300;
    const chars = Array.from(pw);
    let bits = chars.length * Math.log2(Math.max(pool, 2));
    const lower = pw.toLowerCase();
    if (COMMON.some((w) => lower.includes(w))) bits *= 0.45;
    if (/(.)\1{2,}/.test(pw)) bits *= 0.75;
    if (/(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|qwer|wert|asdf)/i.test(pw)) bits *= 0.8;
    if (new Set(chars).size / chars.length < 0.5) bits *= 0.7;
    bits = Math.round(bits);
    const level = bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
    return { bits, level };
  }

  function genPassword(len = 20) {
    const cs = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+?';
    const lim = Math.floor(0x100000000 / cs.length) * cs.length;
    const out = [];
    while (out.length < len) {
      const buf = new Uint32Array(len * 2); crypto.getRandomValues(buf);
      for (const x of buf) if (x < lim && out.length < len) out.push(cs[x % cs.length]);
    }
    return out.join('');
  }

  return { ITER, b64, unb64, rand, formatSecret, parseSecret, newSecret, deriveKey, seal, open, valid, strength, genPassword };
})();
