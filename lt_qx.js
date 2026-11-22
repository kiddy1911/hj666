/**
 * Lutube 在线版 —— 解锁 VIP + 全站去广告 + 完整片源
 * 目标：web-aws.*（HTML 外壳 + l2media） + pwc-aws.*（long/info 只读缓存）
 * 版本：v6-2310
 *
 * ══ v3 为什么在真机上完全没效果 ════════════════════════════════
 *   v3 把「拦 /l2media/*.m3u8 换完整片」写在页面内的 XHR/fetch 钩子里。
 *   QX 只跑在 iOS 上，iPhone Safari 的 videojs 走 supportsNativeHls
 *   （对 application/vnd.apple.mpegurl 做 canPlayType，命中即用原生播放）。
 *   原生 HLS 下 <video> 由系统直接发请求，不经过 XHR —— 钩子一次都不触发。
 *   所以通知条显示 v3、视频却还是 1 分钟。
 *
 * ══ v5 的架构 ═════════════════════════════════════════════════
 *
 *   ① 页面钩子（只改 JSON）
 *      VIP 字段、广告、弹窗，以及把 apen 类片源的 urls 指向
 *      /__lt/<avkey>.m3u8?dm=<分钟>。改 JSON 在 iOS 上一定生效。
 *
 *   ② QX 发流
 *      /__lt/<avkey>.m3u8?dm=N → 拼装完整片列表
 *      /l2media/*.m3u8          → 拦截站点自己的列表，就地换成完整片
 *
 *   ③ QX 只读缓存（不解密回写，响应原样放行）
 *      MITM pwc-aws 的 long-info 接口，用纯 JS 解出 avkey + duration
 *      存进 $prefs。original_videos 类片源的片长只能从这里拿。
 *
 * ══ IV 规则（踩过的坑） ════════════════════════════════════════
 *   apen 类（avkey 形如 WAAA-705 / KIN8-3717）：
 *     IV = md5(avkey) 的 32 位 hex，可直接算。
 *   original_videos 类（avkey 形如 TX6ad816d9a8c83 / TX6ac384d67d504）：
 *     IV ≠ md5(avkey)，无法从 avkey 推出。由页面钩子现场算：
 *     IV = AES-128-ECB-Dec(key, C0) XOR P0，算好后拼进 /__lt/ 的 iv= 参数。
 *     唯一可靠来源是站点下发的明文列表里的 EXT-X-KEY 行。
 *     实测 TX6ad816d9a8c83 的 IV 是 0f17351643fb47db1b8d7361699da97a，
 *     而 md5(avkey) 是 d2464153c242cdd03c6dc89ed21c68dc，完全不同。
 *   通用式（对两类都成立，供参考）：
 *     IV = AES-128-ECB-Dec(key, C0) XOR P0，P0 = 474000100000b00d0001c100000001e1
 *     但 QX 的 $task.fetch 拿不到二进制（body 被 UTF-8 解码破坏），
 *     所以要靠 /l2media/ 的明文列表，而不是自己推。
 *
 * ══ 片源路径 ═══════════════════════════════════════════════════
 *   VIP 片的 long/info 只给 urls.intro（62 秒试看）。
 *   完整片与试看并排放在同一 CDN：
 *     <cdn>/<dir>/<avkey>/ts/<avkey>-<n>.ts        完整
 *     <cdn>/<dir>/<avkey>/intro/ts/<avkey>-<n>.ts  试看
 *   CDN 四台（firmrn / ppgomi / ntjrj / mihmfg）里只有
 *   tez.mihmfg.com 不校验 CloudFront 签名，其余三台 403。固定用它。
 *
 * ══ 段数怎么定（决定成败） ════════════════════════════════════
 *   duration 单位是「分钟」，不是秒（WAAA-705 = 142）。
 *   实测段数 = round(分钟×10) - k，k∈[2,8]。
 *   只探 g-2..g-12 共 11 点，并行一轮，取最大存在段号 +1。
 *   实测 7/7 命中，2.9~4.9 秒：
 *     WAAA-705 1418 / WAAA-355 1485 / YMDD-512 1443 / MARA-069 1222
 *     DSOD-142 1727 / MAAN-1013 885 / TX6ad8… 303
 *   （二分需 5~6 次串行 HEAD、9~11 秒，QX 会超时，已弃用）
 *
 * ══ 实测（独立 hls.js 1.5.17 播本脚本生成的列表） ═════════════
 *   apen/WAAA-705：        8508s（141.8 分）1280×720 err 0，从头播到 6.16s
 *   original_videos/TX6：  1818s（30.3 分）1280×720 err 0，播到 3.96s
 *   两者抓帧均非黑屏（有效像素 12% / 23%）。
 *   逐包校验：WAAA-705 第 709 段 6561/6561，TX6 第 151 段 6889/6889，全同步。
 */

const VER = "v6-2310";

/* ============================================================
 *  MD5（QX 无 crypto）
 * ============================================================ */
function md5bytes(s) {
  function add(a, b) { return (a + b) >>> 0; }
  function rol(n, c) { return ((n << c) | (n >>> (32 - c))) >>> 0; }
  const K = [], S = [], H = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
  const BASE = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  for (let i = 0; i < 64; i++) S[i] = BASE[(i >> 4) * 4 + (i & 3)];
  const b = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 128) b.push(c);
    else if (c < 2048) { b.push(0xc0 | (c >> 6), 0x80 | (c & 63)); }
    else { b.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
  }
  const bitLen = b.length * 8;
  b.push(0x80);
  while (b.length % 64 !== 56) b.push(0);
  for (let i = 0; i < 4; i++) b.push((bitLen >>> (8 * i)) & 0xff);
  b.push(0, 0, 0, 0);
  for (let off = 0; off < b.length; off += 64) {
    const M = [];
    for (let i = 0; i < 16; i++) {
      M[i] = (b[off + i * 4] | (b[off + i * 4 + 1] << 8) | (b[off + i * 4 + 2] << 16) | (b[off + i * 4 + 3] << 24)) >>> 0;
    }
    let A = H[0], B = H[1], C = H[2], D = H[3];
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | ((~B) & D); g = i; }
      else if (i < 32) { F = (D & B) | ((~D) & C); g = (5 * i + 1) & 15; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) & 15; }
      else { F = C ^ (B | (~D)); g = (7 * i) & 15; }
      const t = D; D = C; C = B;
      B = add(B, rol(add(add(A, F >>> 0), add(K[i], M[g])), S[i]));
      A = t;
    }
    H[0] = add(H[0], A); H[1] = add(H[1], B); H[2] = add(H[2], C); H[3] = add(H[3], D);
  }
  const o = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) o.push((H[i] >>> (8 * j)) & 0xff);
  return o;
}
const md5hex = (s) => md5bytes(s).map((x) => (x < 16 ? "0" : "") + x.toString(16)).join("");

/* ============================================================
 *  AES-256-CBC 解密 —— 只用于读 long/info 的 avkey 与 duration
 *  key = UTF8 "322b63a3be0567ae7cae7a2f368ee38a"
 *  iv  = UTF8( md5(x-vtag).hex.slice(8,24) )
 * ============================================================ */
const SBOX = [0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16];
const INV_S = (() => { const a = new Array(256); for (let i = 0; i < 256; i++) a[SBOX[i]] = i; return a; })();
const xtime = (a) => ((a << 1) ^ ((a & 0x80) ? 0x1b : 0)) & 0xff;
function gmul(a, b) { let r = 0; while (b) { if (b & 1) r ^= a; a = xtime(a); b >>= 1; } return r & 0xff; }

function expandKey(k) {
  const Nk = k.length >> 2, Nr = Nk + 6, tot = 16 * (Nr + 1);
  const w = new Array(tot);
  for (let i = 0; i < k.length; i++) w[i] = k[i];
  let rc = 1;
  for (let i = k.length; i < tot; i += 4) {
    const a = w[i - 4], b = w[i - 3], c = w[i - 2], d = w[i - 1];
    let t;
    if (i % k.length === 0) { t = [SBOX[b] ^ rc, SBOX[c], SBOX[d], SBOX[a]]; rc = xtime(rc); }
    else if (Nk > 6 && i % k.length === 16) t = [SBOX[a], SBOX[b], SBOX[c], SBOX[d]];
    else t = [a, b, c, d];
    w[i] = w[i - k.length] ^ t[0]; w[i + 1] = w[i - k.length + 1] ^ t[1];
    w[i + 2] = w[i - k.length + 2] ^ t[2]; w[i + 3] = w[i - k.length + 3] ^ t[3];
  }
  return { w, Nr };
}
function decBlock(K, inp) {
  const { w, Nr } = K, s = inp.slice(0, 16);
  for (let i = 0; i < 16; i++) s[i] ^= w[Nr * 16 + i];
  for (let r = Nr - 1; r >= 0; r--) {
    const t = s.slice();
    s[0] = t[0]; s[1] = t[13]; s[2] = t[10]; s[3] = t[7];
    s[4] = t[4]; s[5] = t[1];  s[6] = t[14]; s[7] = t[11];
    s[8] = t[8]; s[9] = t[5];  s[10] = t[2]; s[11] = t[15];
    s[12] = t[12]; s[13] = t[9]; s[14] = t[6]; s[15] = t[3];
    for (let i = 0; i < 16; i++) s[i] = INV_S[s[i]];
    for (let i = 0; i < 16; i++) s[i] ^= w[r * 16 + i];
    if (r > 0) {
      for (let i = 0; i < 16; i += 4) {
        const a = [s[i], s[i + 1], s[i + 2], s[i + 3]];
        s[i]     = gmul(a[0], 14) ^ gmul(a[1], 11) ^ gmul(a[2], 13) ^ gmul(a[3], 9);
        s[i + 1] = gmul(a[0], 9)  ^ gmul(a[1], 14) ^ gmul(a[2], 11) ^ gmul(a[3], 13);
        s[i + 2] = gmul(a[0], 13) ^ gmul(a[1], 9)  ^ gmul(a[2], 14) ^ gmul(a[3], 11);
        s[i + 3] = gmul(a[0], 11) ^ gmul(a[1], 13) ^ gmul(a[2], 9)  ^ gmul(a[3], 14);
      }
    }
  }
  return s;
}
function cbcDecBytes(key, iv, ct) {
  const K = expandKey(key), out = [];
  let prev = iv.slice(0, 16);
  for (let off = 0; off + 15 < ct.length; off += 16) {
    const blk = decBlock(K, ct.slice(off, off + 16));
    for (let j = 0; j < 16; j++) out.push(blk[j] ^ prev[j]);
    prev = ct.slice(off, off + 16);
  }
  if (out.length) {
    const n = out[out.length - 1];
    if (n > 0 && n <= 16) out.length -= n;
  }
  return out;
}
const utf8bytes = (s) => {
  const b = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 128) b.push(c);
    else if (c < 2048) b.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else b.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return b;
};
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function b64decode(str) {
  const s = String(str || "").replace(/[^A-Za-z0-9+/]/g, "");
  const out = [];
  for (let i = 0; i < s.length; i += 4) {
    const n = (B64.indexOf(s[i]) << 18) | (B64.indexOf(s[i + 1]) << 12) |
              ((s[i + 2] ? B64.indexOf(s[i + 2]) : 0) << 6) |
              (s[i + 3] ? B64.indexOf(s[i + 3]) : 0);
    out.push((n >> 16) & 0xff);
    if (s[i + 2]) out.push((n >> 8) & 0xff);
    if (s[i + 3]) out.push(n & 0xff);
  }
  return out;
}
const API_KEY = utf8bytes("322b63a3be0567ae7cae7a2f368ee38a");
const apiIv = (vtag) => utf8bytes(md5hex(String(vtag)).slice(8, 24));

/* 解出 long/info 明文；失败返回 null */
function apiDecode(b64, vtag) {
  try {
    if (!b64 || !vtag) return null;
    const pt = cbcDecBytes(API_KEY, apiIv(vtag), b64decode(b64));
    let s = "";
    for (let i = 0; i < pt.length; i++) s += String.fromCharCode(pt[i]);
    return s;
  } catch (e) { return null; }
}

/* ============================================================
 *  注入到 HTML 的钩子（只改 JSON）
 * ============================================================ */
const HOOK = [
  "<script>(function(){",
  "if(window.__ltPatched)return;window.__ltPatched=1;",
  "var _p=JSON.parse;",
  "function has(o,k){return o&&typeof o==='object'&&Object.prototype.hasOwnProperty.call(o,k);}",
  "var AK=['player_fullad','menu_long','menu_short','float_long_0','float_short_0','payment_float','game_ad','game_banner','long_recommend','short_recommend','ai_video_player'];",
  "function isAd(d){if(!d||typeof d!=='object'||Array.isArray(d))return false;for(var i=0;i<AK.length;i++){if(has(d,AK[i]))return true;}return false;}",
  "function adish(v){",
  "if(!v||typeof v!=='object'||Array.isArray(v))return false;",
  "if(v.content_type==='ad')return true;",
  "if(typeof v.ad_link_url==='string'&&v.ad_link_url)return true;",
  "if(v.content&&typeof v.content==='object'&&v.content.content_type==='ad')return true;",
  "return false;}",
  "function scrub(o,d){",
  "if(!o||typeof o!=='object'||d>10)return o;",
  "if(Array.isArray(o)){for(var i=o.length-1;i>=0;i--){if(adish(o[i]))o.splice(i,1);else scrub(o[i],d+1);}return o;}",
  "if(o.content_type==='ad'){o.data=[];o.content_type='long_video';return o;}",
  "for(var k in o){if(Object.prototype.hasOwnProperty.call(o,k))scrub(o[k],d+1);}",
  "return o;}",
  "function vip(d){",
  "if(!has(d,'is_vip'))return false;",
  "d.is_vip=true;d.expiry=4102415999;",
  "d.email=d.email||'vip@local';d.phone=d.phone||'13800000000';",
  "if(!d.points||d.points<1)d.points=99999;",
  "d.ad={};",
  "if(!d.custom||typeof d.custom!=='object')d.custom={};",
  "d.custom.level=1;d.custom.expiry=4102415999;",
  "return true;}",
  "function app(r){",
  "if(!r||typeof r!=='object')return false;",
  "if(!(r.pwa||r.h5||r.ios||r.light||r.ad))return false;",
  "if(r.ad&&typeof r.ad==='object'){r.ad.cover_display=false;r.ad.cover_image='';r.ad.cover_link='';}",
  "r.player_top_free_text={cn:'',tw:''};",
  "r.player_mid_free_text={cn:'',tw:''};",
  "var ks=['h5','ios','light','android'];",
  "for(var i=0;i<ks.length;i++){var b=r[ks[i]];if(b&&typeof b==='object'){",
  "b.player_timeline=0;b.player_all_ad_ctime=0;b.player_ctime=0;b.live_url='';b.live_title='';}}",
  "if(r.pwa&&typeof r.pwa==='object'){",
  "if(r.pwa.game_button)r.pwa.game_button.status=false;",
  "if(r.pwa.float_button)r.pwa.float_button.status=false;}",
  "if(r.share&&typeof r.share==='object'){r.share.play_popup_interval=0;r.share.days=0;}",
  "if(r.statsig&&typeof r.statsig==='object')r.statsig.track=false;",
  "return true;}",
  // IV 推导：original_videos 类的 IV 不等于 md5(avkey)，必须现场算
  // IV = AES-128-ECB-Dec(key, C0) XOR P0，key=C0 都从 CDN 取
  // 算出后把 iv 拼进 /__lt/ 的 query，QX 只读文本不碰二进制
  "var P0=[0x47,0x40,0x00,0x10,0x00,0x00,0xb0,0x0d,0x00,0x01,0xc1,0x00,0x00,0x00,0x01,0xe1];",
  "var SB=[0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16];",
  "var IV=[],i0;for(i0=0;i0<256;i0++)IV[SB[i0]]=i0;",
  "var XT=function(a){return ((a<<1)^((a&0x80)?0x1b:0))&255;};",
  "var GM=function(a,b){var r=0;while(b){if(b&1)r^=a;a=XT(a);b>>=1;}return r&255;};",
  "function d1(k,inp){",
  "var w=[],i,r,t,a;for(i=0;i<16;i++)w[i]=k[i];var rc=1;",
  "for(i=16;i<176;i+=4){a=w[i-4];var b=w[i-3],c=w[i-2],d=w[i-1];",
  "if(i%16===0){t=[SB[b]^rc,SB[c],SB[d],SB[a]];rc=XT(rc);}else t=[a,b,c,d];",
  "w[i]=w[i-16]^t[0];w[i+1]=w[i-15]^t[1];w[i+2]=w[i-14]^t[2];w[i+3]=w[i-13]^t[3];}",
  "var s=inp.slice(0,16);for(i=0;i<16;i++)s[i]^=w[160+i];",
  "for(r=9;r>=0;r--){t=s.slice();",
  "s[0]=t[0];s[1]=t[13];s[2]=t[10];s[3]=t[7];s[4]=t[4];s[5]=t[1];s[6]=t[14];s[7]=t[11];",
  "s[8]=t[8];s[9]=t[5];s[10]=t[2];s[11]=t[15];s[12]=t[12];s[13]=t[9];s[14]=t[6];s[15]=t[3];",
  "for(i=0;i<16;i++)s[i]=IV[s[i]];for(i=0;i<16;i++)s[i]^=w[r*16+i];",
  "if(r>0)for(i=0;i<16;i+=4){a=[s[i],s[i+1],s[i+2],s[i+3]];",
  "s[i]=GM(a[0],14)^GM(a[1],11)^GM(a[2],13)^GM(a[3],9);",
  "s[i+1]=GM(a[0],9)^GM(a[1],14)^GM(a[2],11)^GM(a[3],13);",
  "s[i+2]=GM(a[0],13)^GM(a[1],9)^GM(a[2],14)^GM(a[3],11);",
  "s[i+3]=GM(a[0],11)^GM(a[1],13)^GM(a[2],9)^GM(a[3],14);}}",
  "return s;}",
  "var CDN='https://tez.mihmfg.com';",
  "var API={};",
  "function hex(a){var o='',i;for(i=0;i<a.length;i++){var v=a[i].toString(16);o+=(v.length<2?'0':'')+v;}return o;}",
  // 拉 key + C0，推 IV，回调
  "function deriveIV(av,dir,cb){",
  "var base=CDN+'/'+dir+'/'+av;",
  "var f1=fetch(base+'/key.php').then(function(r){return r.arrayBuffer();}).then(function(b){return new Uint8Array(b);});",
  "var f2=fetch(base+'/ts/'+av+'-0.ts',{headers:{Range:'bytes=0-15'}}).then(function(r){return r.arrayBuffer();}).then(function(b){return new Uint8Array(b).slice(0,16);});",
  "Promise.all([f1,f2]).then(function(v){",
  "try{var k=v[0],c0=v[1];if(k.length<16||c0.length<16){cb('');return;}",
  "var dec=d1(k,c0),iv=new Uint8Array(16),i;",
  "for(i=0;i<16;i++)iv[i]=dec[i]^P0[i];",
  "cb(hex(iv));}catch(e){cb('');}",
  "}).catch(function(){cb('');});}",
  "function patch(d){",
  "if(!d||typeof d!=='object'||!d.avkey||!d.urls)return false;",
  "var a=String(d.avkey);",
  "if(!/^[A-Za-z0-9_.-]+$/.test(a))return false;",
  "var dm=Number(d.duration)||0;",
  "var apen=/^[A-Za-z]+[0-9]*-[0-9]+-?$/.test(a);",
  "var u0='/__lt/'+a+'.m3u8?dm='+dm;",
  "if(apen){d.urls.low=u0;d.urls.high=u0;d.__lt=1;window.__ltAV=a;return true;}",
  // original_videos：先指向占位，异步推 IV 后替换
  "if(API[a]){d.urls.low=API[a];d.urls.high=API[a];d.__lt=1;window.__ltAV=a;return true;}",
  "deriveIV(a,'original_videos',function(ivh){",
  "if(!ivh)return;",
  "var u=u0+'&iv='+ivh;API[a]=u;",
  "if(d.urls){d.urls.low=u;d.urls.high=u;d.__lt=1;}",
  // 播放器可能已经拿着 no-iv 的地址起播了。
  // iOS 原生 HLS 下 video.src 就是 m3u8 地址，直接换成带 iv 的即可。
  "var tries=0;",
  "var fix=setInterval(function(){",
  "tries++;",
  "var vs=document.querySelectorAll('video');",
  "for(var i=0;i<vs.length;i++){var v=vs[i];var cur=v.currentSrc||v.src||'';",
  "if(cur.indexOf('/__lt/'+a+'.m3u8')>=0&&cur.indexOf('iv=')<0){v.src=u;try{v.load();v.play();}catch(e){}}}",
  "if(tries>20)clearInterval(fix);",
  "},500);",
  "});",
  "d.urls.low=u0;d.urls.high=u0;d.__lt=1;window.__ltAV=a;",
  "return true;}",
  "JSON.parse=function(s,rev){",
  "var o=_p(s,rev);",
  "try{",
  "if(o&&typeof o==='object'){",
  "if(has(o,'response')){app(o.response);}",
  "else if(has(o,'data')){",
  "if(!vip(o.data)){if(!patch(o.data)){if(isAd(o.data))o.data={};}}",
  "}",
  "scrub(o,0);",
  "}",
  "}catch(e){}",
  "return o;};",
  "})();</script>",
].join("");

/* ============================================================
 *  完整片源
 * ============================================================ */
const CDN = "https://tez.mihmfg.com";
// avkey 形态：字母+数字-数字，可能带尾部连字符（真实存在的 SNOS-335-）
// 实测 23/23 apen 命中，3/3 original_videos 不误判
const APEN_RE = /^[A-Za-z]+[0-9]*-[0-9]+-?$/;
const dirOf = (a) => (APEN_RE.test(a) ? "apen" : "original_videos");
const isApen = (a) => APEN_RE.test(a);
// 兜底：目录判错时换另一个再试（seg0 HEAD 一次，代价很小）
function probeDir(av) {
  const d = dirOf(av), other = d === "apen" ? "original_videos" : "apen";
  const base = (x) => CDN + "/" + x + "/" + av + "/ts/" + av + "-0.ts";
  return qxFetch(base(d), "HEAD").then((r) => {
    if (r.ok || r.status === 206) return d;
    return qxFetch(base(other), "HEAD").then((r2) => (r2.ok || r2.status === 206 ? other : d));
  });
}

/* 片长缓存：avkey → 分钟 */
function dmGet(av) {
  try {
    if (typeof $prefs !== "undefined" && $prefs.valueForKey) {
      const n = parseFloat($prefs.valueForKey("lt_dm_" + av));
      return isNaN(n) ? 0 : n;
    }
  } catch (e) {}
  return 0;
}
function dmSet(av, dm) {
  if (!av || !dm || dm <= 0) return;
  try {
    if (typeof $prefs !== "undefined" && $prefs.setValueForKey) {
      $prefs.setValueForKey(String(dm), "lt_dm_" + av);
    }
  } catch (e) {}
}

/* $task.fetch 薄包装 */
function qxFetch(url, method) {
  const opt = { url, method: method || "GET", headers: { "User-Agent": "Mozilla/5.0" } };
  if (typeof $task !== "undefined" && $task && $task.fetch) {
    return $task.fetch(opt).then(
      (r) => ({ ok: r.statusCode >= 200 && r.statusCode < 300, status: r.statusCode, text: r.body || "" }),
      () => ({ ok: false, status: 0, text: "" })
    );
  }
  if (typeof fetch === "function") {
    return fetch(url, opt).then(
      (r) => r.text().then((t) => ({ ok: r.ok, status: r.status, text: t })),
      () => ({ ok: false, status: 0, text: "" })
    );
  }
  return Promise.resolve({ ok: false, status: 0, text: "" });
}

/* 段数：g-2..g-12 并行探 11 点，取最大存在段号 +1 */
function segCount(av, dm, dir) {
  const base = CDN + "/" + (dir || dirOf(av)) + "/" + av + "/ts/" + av + "-";
  const g = Math.round(dm * 10);
  if (!g || g < 10) {
    // 无片长：0..3000 二分（慢，仅兜底）
    const probe = (n) => qxFetch(base + n + ".ts", "HEAD").then((r) => r.ok || r.status === 206);
    const bs = (lo, hi) => {
      if (hi <= lo) return Promise.resolve(lo);
      const m = Math.ceil((lo + hi) / 2);
      return probe(m).then((ok) => (ok ? bs(m, hi) : bs(lo, m - 1)));
    };
    return probe(0).then((h0) => (h0 ? bs(0, 3000) : Promise.resolve(-1)));
  }
  const cand = [];
  for (let k = 2; k <= 12; k++) if (g - k > 0) cand.push(g - k);
  return Promise.all(cand.map((n) => qxFetch(base + n + ".ts", "HEAD"))).then((rs) => {
    let best = -1;
    for (let i = 0; i < cand.length; i++) {
      const ok = rs[i].ok || rs[i].status === 206;
      if (ok && cand[i] > best) best = cand[i];
    }
    return best < 0 ? -1 : best + 1;
  });
}

/* 从明文列表取 EXT-X-KEY 整行 */
function keyLineOf(pl) {
  const m = String(pl || "").match(/#EXT-X-KEY:[^\r\n]*/);
  return m ? m[0] : "";
}
function ivOfKeyLine(line) {
  const m = String(line || "").match(/IV=0x([0-9a-fA-F]{32})/);
  return m ? m[1].toLowerCase() : "";
}
function uriOfKeyLine(line) {
  const m = String(line || "").match(/URI="([^"]+)"/);
  return m ? m[1] : "";
}

/* 生成完整片播放列表
   ivHint：站点明文列表里的 IV（original_videos 必需） */
function buildList(av, dm, ivHint, uriHint) {
  return probeDir(av).then((dir) => {
  const base = CDN + "/" + dir + "/" + av;
  return segCount(av, dm, dir).then((N) => {
    if (N <= 0) return null;
    let ivHex = ivHint || "";
    if (!ivHex) {
      if (dir === "apen") ivHex = md5hex(av);
      else return null;           // original_videos 无 IV 无法构造
    }
    const keyUri = uriHint || (base + "/key.php");
    const total = N * 6;
    const L = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-PLAYLIST-TYPE:VOD",
      "#EXT-X-INDEPENDENT-SEGMENTS",
      "#EXT-X-TARGETDURATION:7",
      "#EXT-X-MEDIA-SEQUENCE:0",
      '#EXT-X-KEY:METHOD=AES-128,URI="' + keyUri + '",IV=0x' + ivHex,
    ];
    for (let i = 0; i < N; i++) {
      L.push("#EXTINF:6.000000,");
      L.push(base + "/ts/" + av + "-" + i + ".ts");
    }
    L.push("#EXT-X-ENDLIST");
    return { text: L.join("\n"), n: N, total, iv: ivHex, dir };
  });
  });
}

const M3U8_HEADERS = {
  "Content-Type": "application/vnd.apple.mpegurl",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
};

/* ============================================================
 *  HTML 清洗
 * ============================================================ */
function clean(html) {
  const hit = { gtm: 0, ns: 0, dl: 0, inject: 0 };
  let h = String(html || "");

  const reGtm = /<script>\(function\s*\(w,\s*d,\s*s,\s*l,\s*i\)[\s\S]*?\}\)\(window,\s*document,\s*"script",\s*"dataLayer",\s*"GTM-[A-Z0-9]+"\);\s*<\/script>/;
  if (reGtm.test(h)) { hit.gtm = 1; h = h.replace(reGtm, ""); }

  const reNs = /<noscript><iframe\s+src="https:\/\/www\.googletagmanager\.com\/ns\.html[^"]*"[\s\S]*?<\/iframe><\/noscript>/;
  if (reNs.test(h)) { hit.ns = 1; h = h.replace(reNs, ""); }

  const reDl = /const\s+dataLayer\s*=\s*window\.dataLayer\s*\|\|\s*\[\s*\]\s*;/;
  if (reDl.test(h)) {
    hit.dl = 1;
    h = h.replace(reDl, "const dataLayer = window.dataLayer = []; dataLayer.push = function () {};");
  }

  h = h.replace("</head>", "<style>.ga-splash-ad{display:none!important}</style></head>");

  const anchor = /<script\s+type="module"/;
  if (anchor.test(h)) {
    hit.inject = 1;
    h = h.replace(anchor, HOOK + '<script type="module"');
  }
  return { html: h, hit };
}

/* ============================================================
 *  QX 入口
 * ============================================================ */
function main() {
  const url = ($request && $request.url) || "";
  const body = ($response && $response.body) || "";

  /* ---- ① 虚拟完整片列表 /__lt/<av>.m3u8?dm=N[&iv=hex] ---- */
  const mp = url.match(/\/__lt\/([A-Za-z0-9_.-]+)\.m3u8/);
  if (mp) {
    const av = decodeURIComponent(mp[1]);
    const q = url.match(/[?&]dm=([\d.]+)/);
    const dm = (q ? parseFloat(q[1]) : 0) || dmGet(av);
    dmSet(av, dm);
    // iv 由页面钩子推好带过来（original_videos 类必需）
    const ivq = url.match(/[?&]iv=([0-9a-fA-F]{32})/);
    const ivHint = ivq ? ivq[1].toLowerCase() : "";
    return buildList(av, dm, ivHint || undefined).then((r) => {
      if (!r) return $done({});
      if (typeof $notify === "function") {
        $notify("Lutube " + VER, "完整片源 " + av,
          "段数 " + r.n + " · 约 " + Math.round(r.total / 60) + " 分钟");
      }
      return $done({ status: 200, headers: M3U8_HEADERS, body: r.text });
    });
  }

  /* ---- ② /l2media/*.m3u8：站点自己的列表，就地换成完整片 ----
     这里能读到 EXT-X-KEY 的权威 IV（original_videos 唯一来源）。 */
  if (/\/l2media\/[^\/]+\.m3u8/.test(url)) {
    const txt = String(body || "");
    if (txt.indexOf("#EXTM3U") < 0) return $done({});   // 非明文，原样放行
    const first = (txt.split("\n").find((l) => l && l.charAt(0) !== "#") || "").trim();
    const mm = first.match(/(apen|original_videos)\/([A-Za-z0-9_.-]+)\/ts\//);
    if (!mm) return $done({});
    const av = mm[2];
    const iv = ivOfKeyLine(keyLineOf(txt));
    const dm = dmGet(av);
    // 已是完整片（段数远超试看 11 段）就不再加工
    const segs = txt.split("\n").filter((l) => l && l.charAt(0) !== "#").length;
    if (segs > 60) return $done({});
    return buildList(av, dm, iv || undefined, uriOfKeyLine(keyLineOf(txt)) || undefined).then((r) => {
      if (!r) return $done({});
      if (typeof $notify === "function") {
        $notify("Lutube " + VER, "完整片源 " + av,
          "段数 " + r.n + " · 约 " + Math.round(r.total / 60) + " 分钟");
      }
      return $done({ status: 200, headers: M3U8_HEADERS, body: r.text });
    });
  }

  /* ---- ③ long/info 只读缓存（响应原样放行） ----
     只解 avkey + duration 存起来，供 original_videos 定段数。 */
  if (/\/api\/v3\/long\/info\//.test(url) && body) {
    const vtag = ($response.headers && ($response.headers["x-vtag"] || $response.headers["X-Vtag"])) || "";
    const plain = apiDecode(body, vtag);
    if (plain) {
      // avkey 与 duration 各自独立取，不依赖字段顺序与距离
      const ma = plain.match(/"avkey"\s*:\s*"([^"]+)"/);
      const md = plain.match(/"duration"\s*:\s*(\d+)/);
      if (ma && md) dmSet(ma[1], Number(md[1]));
      else if (ma) dmSet(ma[1], 0);
    }
    return $done({});
  }

  /* ---- ④ HTML 外壳 ---- */
  if (!body) return $done({});
  const head = body.slice(0, 512).toLowerCase();
  if (!(head.indexOf("<!doctype html") >= 0 || head.indexOf("<html") >= 0)) return $done({});

  const r = clean(body);
  if (typeof $notify === "function" && r.hit.inject === 1) {
    $notify("Lutube " + VER, "VIP 已解锁 · 广告已清 · 完整片源",
      "注入:" + r.hit.inject + " · GTM:" + r.hit.gtm);
  }
  return $done({ body: r.html });
}

if (typeof $done === "function") main();

/* Node 调试 */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { clean, VER, HOOK, buildList, segCount, md5hex, md5bytes, dirOf,
    keyLineOf, ivOfKeyLine, uriOfKeyLine, apiDecode, cbcDecBytes, utf8bytes, b64decode };
}
