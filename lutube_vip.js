// ==========================================
// Lutube VIP Unlock + Ad Removal for QuanX
// 兼容 Quantumult X / Loon / Surge
// ==========================================

const CRYPTO_JS = `
/*! CryptoJS v3.1.2 - AES/MD5/CBC/Pkcs7 */
var CryptoJS = CryptoJS || (function (h, i) {
  var f = {}, g = f.lib = {}, e = function () {}, m = g.Base = {
    extend: function (a) { e.prototype = this; var c = new e(); a && c.mixIn(a); c.hasOwnProperty("init") || (c.init = function () { c.$super.init.apply(this, arguments) }); c.init.prototype = c; c.$super = this; return c },
    create: function () { var a = this.extend(); a.init.apply(this, arguments); return a },
    init: function () {},
    mixIn: function (a) { for (var c in a) a.hasOwnProperty(c) && (this[c] = a[c]); a.hasOwnProperty("toString") && (this.toString = a.toString) },
    clone: function () { return this.init.prototype.extend(this) }
  }, n = g.WordArray = m.extend({
    init: function (a, c) { a = this.words = a || []; this.sigBytes = c != i ? c : 4 * a.length },
    toString: function (a) { return (a || k).stringify(this) },
    concat: function (a) { var c = this.words, d = a.words, b = this.sigBytes; a = a.sigBytes; this.clamp(); if (b % 4) for (var e = 0; e < a; e++) c[b + e >>> 2] |= (d[e >>> 2] >>> 24 - 8 * (e % 4) & 255) << 24 - 8 * ((b + e) % 4); else if (65535 < d.length) for (e = 0; e < a; e += 4) c[b + e >>> 2] = d[e >>> 2]; else c.push.apply(c, d); this.sigBytes += a; return this },
    clamp: function () { var a = this.words, c = this.sigBytes; a[c >>> 2] &= 4294967295 << 32 - 8 * (c % 4); a.length = h.ceil(c / 4) },
    clone: function () { var a = m.clone.call(this); a.words = this.words.slice(0); return a },
    random: function (a) { for (var c = [], d = 0; d < a; d += 4) c.push(4294967296 * h.random() | 0); return new n.init(c, a) }
  }), o = f.enc = {}, k = o.Hex = {
    stringify: function (a) { var c = a.words; a = a.sigBytes; for (var d = [], b = 0; b < a; b++) { var e = c[b >>> 2] >>> 24 - 8 * (b % 4) & 255; d.push((e >>> 4).toString(16)); d.push((e & 15).toString(16)) } return d.join("") },
    parse: function (a) { for (var c = a.length, d = [], b = 0; b < c; b += 2) d[b >>> 3] |= parseInt(a.substr(b, 2), 16) << 24 - 4 * (b % 8); return new n.init(d, c / 2) }
  }, l = o.Latin1 = {
    stringify: function (a) { var c = a.words; a = a.sigBytes; for (var d = [], b = 0; b < a; b++) d.push(String.fromCharCode(c[b >>> 2] >>> 24 - 8 * (b % 4) & 255)); return d.join("") },
    parse: function (a) { for (var c = a.length, d = [], b = 0; b < c; b++) d[b >>> 2] |= (a.charCodeAt(b) & 255) << 24 - 8 * (b % 4); return new n.init(d, c) }
  }, p = o.Utf8 = {
    stringify: function (a) { try { return decodeURIComponent(escape(l.stringify(a))) } catch (c) { throw Error("Malformed UTF-8 data") } },
    parse: function (a) { return l.parse(unescape(encodeURIComponent(a))) }
  }, q = o.Base64 = {
    stringify: function (a) { var c = a.words; a = a.sigBytes; for (var d = [], b = 0; b < a; b += 3) for (var e = c[b >>> 2] >>> 24 - 8 * (b % 4) & 255, f = b + 1 < a ? c[(b + 1) >>> 2] >>> 24 - 8 * ((b + 1) % 4) & 255 : 0, g = b + 2 < a ? c[(b + 2) >>> 2] >>> 24 - 8 * ((b + 2) % 4) & 255 : 0, h = (e << 16) | (f << 8) | g, k = 0; k < 4 && b + k * 0.75 < a; k++) d.push("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".charAt(h >>> 6 * (3 - k) & 63)); var e = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".charAt(64); while (d.length % 4) d.push(e); return d.join("") },
    parse: function (a) { var c = a.length, d = [], b = 0, e, f, g, h; for (a = a.replace(/[^A-Za-z0-9+/=]/g, ""); b < c; b += 4) { e = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".indexOf(a.charAt(b)); f = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".indexOf(a.charAt(b + 1)); g = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".indexOf(a.charAt(b + 2)); h = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".indexOf(a.charAt(b + 3)); d[b >>> 2] = (e << 18) | (f << 12) | (g << 6) | h } d.length = c * 3 / 4 - (a.indexOf("=") != -1 ? a.indexOf("=") - b : 0); return new n.init(d, d.length) }
  }, r = g.CipherParams = m.extend({
    init: function (a) { this.mixIn(a) },
    toString: function (a) { return (a || this.formatter).stringify(this) }
  }), s = f.format = {}, t = s.OpenSSL = {
    stringify: function (a) { var c = a.ciphertext; a = a.salt; return a ? new n.init([1398893684, 1701076831].concat(a.words).concat(c.words)).toString(k) : c.toString(k) },
    parse: function (a) { a = k.parse(a); var c = a.words; if (c[0] == 1398893684 && c[1] == 1701076831) { var d = new n.init(c.slice(2, 4)); c.splice(0, 4); a.sigBytes -= 16 } return r.create({ ciphertext: a, salt: d }) }
  }, u = f.mode = {}, v = function () { var a = this._cipher, c = a._blockSize * 4, d = this._iv; if (this._buffer.length >= c) { for (var b = 0; b < c; b++) d[b] ^= this._buffer.words[b]; a.encryptBlock(d, 0); this._buffer.clamp(); this._buffer = this._buffer.clone() } }, w = u.CBC = (function () { var a = m.extend(); a.encrypt = function () { v.call(this) }; a.decrypt = function () { var a = this._cipher, c = a._blockSize * 4, d = this._iv, b = this._buffer.words; if (b.length >= c) { for (var e = 0; e < c; e++) b[e] ^= d[e]; a.decryptBlock(b, 0); this._iv = b.slice(0, c / 4); this._buffer.clamp() } }; return a })(), x = f.pad = {}, y = x.Pkcs7 = {
    pad: function (a, c) { for (var d = 4 * c, d = d - a.sigBytes % d, b = d << 24 | d << 16 | d << 8 | d, e = [], f = 0; f < d; f += 4) e.push(b); a = new n.init(e, d); a.concat(a) },
    unpad: function (a) { var c = a.words[a.sigBytes - 1] & 255; a.sigBytes -= c }
  }, z = g.BlockCipher = m.extend({
    cfg: m.extend({ mode: w, padding: y }),
    reset: function () { m.reset.call(this); var a = this.cfg, c = a.iv, a = a.mode; if (this._xformMode == this._ENC_XFORM_MODE) var d = a.createEncryptor; else d = a.createDecryptor, this._mode = d.call(a, this, c && c.words) },
    process: function (a) { this._buffer.concat(a); this._mode.process(this._buffer); return this._buffer },
    finalize: function (a) { a && this._buffer.concat(a); var c = this.cfg.padding; if (this._xformMode == this._ENC_XFORM_MODE) { c.pad(this._buffer, this._blockSize); var d = this._mode.finalize(this._buffer) } else { this._mode.process(this._buffer); c.unpad(this._buffer); d = this._buffer } return d },
    blockSize: 4,
    _ENC_XFORM_MODE: 1,
    _DEC_XFORM_MODE: 2,
    _createHelper: function (a) { return { encrypt: function (c, d) { return a.create(d, { mode: x.cfg.mode, padding: x.cfg.padding, iv: x.cfg.iv }).encrypt(c) }, decrypt: function (c, d) { return a.create(d, { mode: x.cfg.mode, padding: x.cfg.padding, iv: x.cfg.iv }).decrypt(c) } } }
}), A = f.Cipher = z.extend({
  init: function (a, c) { this._key = c; this.reset() }
}), B = f.AES = A.extend({
  _doReset: function () { var a = this._key, c = a.words, d = a.sigBytes / 4; a = this._nRounds = d + 6; for (var b = this._keySchedule = [], e = 0; e < 4 * (a + 1); e++) { if (e < d) b[e] = c[e]; else { var f = b[e - 1]; e % d == 0 ? (f = f << 8 | f >>> 24, f = (f & 16711935) << 8 | (f & 4278255360) >>> 8, f ^= 999999999) : d > 6 && e % d == 4 && (f = (f & 16711935) << 8 | (f & 4278255360) >>> 8); b[e] = b[e - d] ^ f } } },
  encryptBlock: function (a, c) { this._doCryptBlock(a, c, this._keySchedule, !0) },
  decryptBlock: function (a, c) { var d = this._keySchedule, b = d.length - 1, e = []; for (var f = 0; f < b; f++) e[f] = d[b - f]; this._doCryptBlock(a, c, e, !1) },
  keySize: 8,
  blockSize: 4
}), C = f.MD5 = m.extend({
  _doReset: function () { this._hash = new n.init([1732584193, 4023233417, 2562383102, 271733878]) },
  _doProcessBlock: function (a, c) { for (var d = 0; 16 > d; d++) { var b = c + d, e = a[b]; a[b] = (e << 8 | e >>> 24) & 16711935 | (e << 24 | e >>> 8) & 4278255360 } var b = this._hash.words, e = a[c + 0], f = a[c + 1], g = a[c + 2], h = a[c + 3], i = a[c + 4], j = a[c + 5], k = a[c + 6], l = a[c + 7], m = a[c + 8], n = a[c + 9], o = a[c + 10], p = a[c + 11], q = a[c + 12], r = a[c + 13], s = a[c + 14], t = a[c + 15]; var u = b[0], v = b[1], w = b[2], x = b[3]; u = (u + ((v & w) | (~v & x)) + e + 3614090360) << 7 | 0; u = (u + v) | 0; x = (x + ((u & v) | (~u & w)) + f + 3905402710) << 12 | 0; x = (x + u) | 0; w = (w + ((x & u) | (~x & v)) + g + 606105819) << 17 | 0; w = (w + x) | 0; v = (v + ((w & x) | (~w & u)) + h + 3250441966) << 22 | 0; v = (v + w) | 0; u = (u + ((v & w) | (~v & x)) + i + 4118548399) << 7 | 0; u = (u + v) | 0; x = (x + ((u & v) | (~u & w)) + j + 1200080426) << 12 | 0; x = (x + u) | 0; w = (w + ((x & u) | (~x & v)) + k + 2821735955) << 17 | 0; w = (w + x) | 0; v = (v + ((w & x) | (~w & u)) + l + 4249261313) << 22 | 0; v = (v + w) | 0; u = (u + ((v & w) | (~v & x)) + m + 1770035416) << 7 | 0; u = (u + v) | 0; x = (x + ((u & v) | (~u & w)) + n + 2336552879) << 12 | 0; x = (x + u) | 0; w = (w + ((x & u) | (~x & v)) + o + 4294925233) << 17 | 0; w = (w + x) | 0; v = (v + ((w & x) | (~w & u)) + p + 2304563134) << 22 | 0; v = (v + w) | 0; u = (u + ((v & w) | (~v & x)) + q + 1804603682) << 7 | 0; u = (u + v) | 0; x = (x + ((u & v) | (~u & w)) + r + 4254626195) << 12 | 0; x = (x + u) | 0; w = (w + ((x & u) | (~x & v)) + s + 2792965006) << 17 | 0; w = (w + x) | 0; v = (v + ((w & x) | (~w & u)) + t + 1236535329) << 22 | 0; v = (v + w) | 0; b[0] = (b[0] + u) | 0; b[1] = (b[1] + v) | 0; b[2] = (b[2] + w) | 0; b[3] = (b[3] + x) | 0 },
  _doFinalize: function () { var a = this._buffer.words, c = this._buffer.sigBytes * 8; a[c >>> 5] |= 128 << c % 32; a[(c + 64 >>> 9 << 4) + 14] = c; var d = this._hash; return d },
  clone: function () { var a = m.clone.call(this); a._hash = this._hash.clone(); return a }
}), D = f.HmacMD5 = C._createHelper(C);
if (typeof module !== "undefined" && module.exports) module.exports = CryptoJS;
`);
eval(CRYPTO_JS);

// ==========================================
// 解密/加密工具函数（完全复刻原站 ra 函数）
// ==========================================
const FIXED_IV = "322b63a3be0567ae7cae7a2f368ee38a";

function deriveKey(vtag) {
  return CryptoJS.MD5(vtag).toString().slice(8, 24);
}

function decryptResponse(encryptedB64, vtag) {
  try {
    const key = CryptoJS.enc.Utf8.parse(deriveKey(vtag));
    const iv = CryptoJS.enc.Utf8.parse(FIXED_IV);
    const cipherParams = CryptoJS.enc.Base64.parse(encryptedB64);
    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: cipherParams },
      key,
      { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
    );
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (e) {
    console.log("[Lutube] Decrypt failed:", e.message);
    return null;
  }
}

function encryptResponse(plainJson, vtag) {
  try {
    const key = CryptoJS.enc.Utf8.parse(deriveKey(vtag));
    const iv = CryptoJS.enc.Utf8.parse(FIXED_IV);
    const encrypted = CryptoJS.AES.encrypt(
      plainJson,
      key,
      { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
    );
    return encrypted.toString();
  } catch (e) {
    console.log("[Lutube] Encrypt failed:", e.message);
    return null;
  }
}

// ==========================================
// 响应处理主逻辑
// ==========================================
let body = $response.body;
const url = $request.url;
const vtag = $response.headers["x-vtag"] || $response.headers["X-Vtag"] || "";
const isEncrypted = vtag && body && body.length < 5000 && /^[A-Za-z0-9+/=]+$/.test(body.trim());

console.log(`[Lutube] Processing: ${url} | Encrypted: ${isEncrypted} | Vtag: ${vtag}`);

if (isEncrypted) {
  const decrypted = decryptResponse(body, vtag);
  if (!decrypted) { $done({ body }); }
  let data = JSON.parse(decrypted);

  // ---------- 1. 用户信息接口：强制 VIP ----------
  if (url.includes("/api/v1/user/info")) {
    if (data.response && data.response.userInfo) {
      data.response.userInfo.is_vip = true;
      data.response.userInfo.expiry = Math.floor(Date.now()/1000) + 315360000; // 10年
      data.response.userInfo.points = 999999;
      data.response.userInfo.promote = true;
      data.response.userInfo.custom = { level: 99, expiry: Math.floor(Date.now()/1000) + 315360000 };
      data.response.userInfo.shop_icon = "vip";
      data.response.userInfo.invite_count = 999;
      console.log("[Lutube] ✅ VIP unlocked on user/info");
    }
  }

  // ---------- 2. VIP 方案列表：全部标记已拥有/免费 ----------
  if (url.includes("/api/v1/vip/plans") || url.includes("/api/v2/plan")) {
    if (data.response && data.response.list) {
      data.response.list.forEach(plan => {
        plan.is_purchased = true;
        plan.price = 0;
        plan.original_price = 0;
        plan.discount = 100;
        plan.tag = "已拥有";
      });
    }
    if (data.response && data.response.plans) {
      data.response.plans.forEach(p => { p.is_purchased = true; p.price = 0; });
    }
    console.log("[Lutube] ✅ All VIP plans free");
  }

  // ---------- 3. 广告配置：清空所有广告 ----------
  if (url.includes("/api/v1/ad/config") || url.includes("/api/v1/ad")) {
    data.response = { data: {} };
    // 保留结构但所有广告位清空
    const emptyAdTypes = [
      "float_long_0","float_long_1","float_long_2","float_long_3","float_long_4","float_long_5",
      "float_short_0","float_short_1","float_short_2","float_short_3","float_short_4","float_short_5",
      "float_category_actor","float_category_brand","float_category_long","float_category_short",
      "float_search_bar","float_search_layout","float_search_page",
      "player_fullad","play","video","short_recommend","long_recommend",
      "short_tag","long_tag","banner_long","banner_short",
      "game_ad","game_banner","menu_long","menu_short",
      "payment_float","ai_video_player","member"
    ];
    emptyAdTypes.forEach(type => { data.response.data[type] = []; });
    console.log("[Lutube] ✅ All ads removed");
  }

  // ---------- 4. 视频列表/详情：确保 VIP 内容可访问 ----------
  if (url.includes("/api/v1/video/list") || url.includes("/api/v3/long/info") || url.includes("/api/v2/long/info")) {
    if (data.response && data.response.list) {
      data.response.list.forEach(v => {
        v.is_vip = false;  // 标记为非 VIP 独占
        v.vip_only = false;
        v.quality = "high";
      });
    }
    if (data.response && data.response.videoInfo) {
      data.response.videoInfo.is_vip = false;
      data.response.videoInfo.vip_only = false;
      data.response.videoInfo.quality = "high";
    }
    console.log("[Lutube] ✅ Video content unlocked");
  }

  // ---------- 5. App 基础配置：移除启动页广告、启用 VIP 专线 ----------
  if (url.includes("/api/v1/appinfo2")) {
    if (data.response) {
      // 启动页广告
      if (data.response.launch) {
        data.response.launch.image = "";
        data.response.launch.ipad_image = "";
      }
      // 广告配置
      if (data.response.ad) {
        data.response.ad.cover_display = false;
        data.response.ad.cover_image = "";
        data.response.ad.cover_link = "";
      }
      // 分享配置
      if (data.response.share) {
        data.response.share.days = 999;
      }
      // 播放器广告时间归零
      if (data.response.android) {
        data.response.android.player_all_ad_ctime = 0;
        data.response.android.player_ctime = 0;
        data.response.android.player_timeline = 0;
      }
      if (data.response.ios) {
        data.response.ios.player_all_ad_ctime = 0;
        data.response.ios.player_ctime = 0;
        data.response.ios.player_timeline = 0;
      }
      if (data.response.h5) {
        data.response.h5.player_all_ad_ctime = 0;
        data.response.h5.player_ctime = 0;
        data.response.h5.player_timeline = 0;
      }
      if (data.response.light) {
        data.response.light.player_all_ad_ctime = 0;
        data.response.light.player_ctime = 0;
        data.response.light.player_timeline = 0;
      }
      // VIP 专线（如果有）
      if (data.response.stream_list) {
        data.response.vipStreamList = data.response.stream_list;
      }
      console.log("[Lutube] ✅ App config patched (ads removed, VIP lines enabled)");
    }
  }

  // ---------- 6. 菜单/公告：屏蔽公告弹窗 ----------
  if (url.includes("/api/v2/menu") || url.includes("/v1/bulletin")) {
    if (data.response) {
      data.response.bulletin = null;
      data.response.announcement = null;
    }
    console.log("[Lutube] ✅ Bulletin/Announcement blocked");
  }

  // ---------- 7. JS 文件注入：直接在前端强制 VIP 状态 ----------
  if (url.includes("/assets/js/index-") && url.endsWith(".js")) {
    const vipPatch = `
;(function(){
  try{
    const origFetch = window.fetch;
    window.fetch = async function(u,o){
      const r = await origFetch(u,o);
      if(u.includes('/api/v1/user/info')){
        const c = r.clone();
        const t = await c.text();
        const v = r.headers.get('x-vtag');
        if(v){
          const key = CryptoJS.MD5(v).toString().slice(8,24);
          const iv = CryptoJS.enc.Utf8.parse('322b63a3be0567ae7cae7a2f368ee38a');
          const dec = CryptoJS.AES.decrypt(t,CryptoJS.enc.Utf8.parse(key),{iv,mode:CryptoJS.mode.CBC,padding:CryptoJS.pad.Pkcs7}).toString(CryptoJS.enc.Utf8);
          const d = JSON.parse(dec);
          d.response.userInfo.is_vip=true;
          d.response.userInfo.expiry=Math.floor(Date.now()/1000)+315360000;
          d.response.userInfo.points=999999;
          const enc = CryptoJS.AES.encrypt(JSON.stringify(d),CryptoJS.enc.Utf8.parse(key),{iv,mode:CryptoJS.mode.CBC,padding:CryptoJS.pad.Pkcs7}).toString();
          return new Response(enc,{status:200,headers:{'content-type':'text/plain','x-vtag':v}});
        }
      }
      return r;
    };
  }catch(e){console.log('[Lutube] fetch patch failed',e);}
  // Vuex 状态劫持
  setTimeout(()=>{
    const app = document.querySelector('#app')?.__vue__;
    if(app && app.\$store){
      const s = app.\$store;
      const patch = ()=>{
        s.state.user.userInfo.is_vip=true;
        s.state.user.userInfo.expiry=Math.floor(Date.now()/1000)+315360000;
        s.state.user.userInfo.points=999999;
        s.state.app.videoQuality='high';
        if(s.state.app.vipStreamList?.length) s.commit('app/SET_STREAM_INDEX',0);
        s.state.ui.ad = {}; Object.keys(s.state.ui.floatAd).forEach(k=>s.state.ui.floatAd[k]=false);
        s.state.ui.playAdPop=false; s.state.ui.searchAdPop=false;
      };
      patch();
      app.\$router.afterEach(patch);
      console.log('[Lutube] 🔓 Frontend VIP hook installed');
    }
  },1000);
})();
`;
    body = body.replace(/\(function\(\)\{/, vipPatch + "\n(function(){");
    console.log("[Lutube] ✅ Frontend JS patched");
    $done({ body });
    return;
  }

  // 重新加密返回
  const encrypted = encryptResponse(JSON.stringify(data), vtag);
  if (encrypted) {
    $done({ body: encrypted });
  } else {
    $done({ body: JSON.stringify(data) }); // 兜底明文
  }
} else {
  // 非加密接口直接透传
  $done({ body });
}
