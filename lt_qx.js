/**
 * Lutube 在线版 —— 解锁 VIP + 全站去广告 + 完整片源
 * 目标：web-aws.*（HTML 外壳 + l2media） + pwc-aws.*（long/info 只读缓存）
 * 版本：v16-2330
 *
 * ══ v16：快进「画面冻住几秒」到底冻在哪 ═══════════════════════
 *   缩略图已正常，剩下的是快进后画面停很久才动。用 Chromium + video.js 8.11.1
 *   + VHS 接真实 CDN（CHN-181-CN，1387 段 × 6.006s，每段 1.0~1.4MB）逐项量：
 *     快进 3000s：seeking 2ms → seeked 4720ms；期间只有两条请求
 *                 key.php 13ms(ETag 直接命中) + seg#499 下载 4092ms
 *     快进 7000s：seeked 3841ms，seg#1165 下载 3213ms
 *     目标段先预取再快进：seeked 617ms，播放器那次 XHR 只花 8ms（缓存命中）
 *     段已在途时立刻快进：seeked 3561ms（浏览器合并成一条请求，不亏不赚）
 *   结论：冻结时间 ≈ 一整段 ts 的下载时间，跟 key、列表体积、时间戳漂移都无关
 *   （1387 段 × 6.006 与实测 PTS 步长一致，段首 PTS 0.111/3003.119 线性）。
 *   HLS 必须先拿完整段才能解出第一帧，所以唯一能改的是「什么时候开始下」：
 *     · 按下进度条立刻下当前位置（不再等 150ms 防抖）
 *     · 拖动中 80ms 去抖换目标，换目标就 abort 掉旧请求，不排队
 *     · 松手点再补一次；鼠标悬停也算一次（260ms 去抖）
 *     · 一次手势最多 4 段，段号命中过就跳过
 *   实测这条路径把 4720ms 压到 617ms（同机同片同位置）。
 *
 * ══ v8：拖动卡顿 ═══════════════════════════════════════════
 *   现象：长片拖动进度条特别卡，短片不明显。
 *   实测 CDN（tez.mihmfg.com，新加坡直连）：
 *     握手 0.42~0.53s · 首字节 0.60~0.65s · 1.1~1.3 MB/s
 *     一个中段 6 秒段  1.48~1.65 MB → 单段 1.26~1.39s
 *     段大小区间 41KB(首尾) ~ 1.65MB，段首均为 SPS/PPS/IDR，可任意定位
 *   两个放大器，都在我们这侧：
 *     1) urls 三个字段全填 → videoSrcCount=3 → 播放器改用整组雪碧图
 *        （previewList 全数组，86 张×100 格）。片越长图越多，拖一次拉一张，
 *        每张都是 0.6s 首字节。v8 只留 low，count 回到 1，单张图。
 *     2) Cache-Control:no-store → 每次重新解析列表都得再跑一遍脚本、
 *        再拉一次 key.php。v8 改成 max-age=3600。
 *   单段 1.3s 是 CDN 自身的首字节决定的，脚本这一层去不掉。
 *
 * ══ v8-2320：起播黑屏 ═══════════════════════════════════════
 *   现象：通知已弹「完整片源」，画面却长时间黑屏，长片更明显。
 *   播放器 videoPlayerInit() 里有个起播闸门（play-d49f9b12.js）：
 *     const s = this.$store.state.ui.ad.video;
 *     if (s && s.length > 0) { firstAd 倒计时，等 player_ctime 递减到 0 才起播 }
 *     else { this.playSrc(); }        ← 只有广告数组为空才立刻取源
 *   旧版只清了 ad 的封面字段和 player_ctime。ctime 被清零后倒计时不再递减，
 *   广告分支永远不结束 → playSrc() 一次都不调用 → 黑屏。
 *   现在 app() 里直接 ad.video=[]，scrub() 里对任意层级的 ad.video 兜底清空。
 *
 * ══ v9-2350：预取，把 CDN 首字节藏起来 ════════════════════
 *   在真浏览器（Chromium + video.js 8 / VHS）跑真实分段 tez.mihmfg.com 量的：
 *     段数无关：11 段与 1418 段起播、拖动几乎一样 → 列表不是瓶颈
 *     冷缓存 不预取：起播首帧 2362ms，拖动到 50% 出帧 1196ms
 *     预取 key+首段：起播首帧 870~1069ms
 *     拖动过程预取目标段：出帧 474~490ms（中位 ~490ms）
 *   所以 v9 做两件事：
 *     1) long/info 一返回就预取 key.php + 首段（250KB，挡住首帧的就这两样）
 *     2) 按在进度条上拖动时，按 x→时间换算目标段号，松手前把它拉进缓存
 *        拖动场景 150ms 防抖 + 并发闸门 + 每次按下最多 3 张，防止跑流量
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
 *      /l2media/*.m3u8          → 兜底（站点列表有效期短，常 404）
 *      /api/v3/long/info/:id    → 主力：直接把 urls.intro 改成 /__lt/
 *                                 响应是 AES-256-CBC 密文，改完重新加密
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

const VER = "v16-2330";

/* ============================================================
 *  MD5（QX 无 crypto）
 * ============================================================ *
 * ══ v10-0800：快进缩略图 ══════════════════════════
 *   站点 setupSpriteThumbnails() 按源数量分支：
 *     videoSrcCount===1 → spriteThumbnails({url: previewList[6]})   ← 解锁后走这条
 *     否则             → spriteThumbnails({urlArray: previewList})
 *   插件 videojs-sprite-thumbnails 2.2.4 取图是
 *     k(p) = urlArray.length ? urlArray[p] : url.replace("{index}", p)
 *   每张图覆盖 interval*columns*rows 秒（默认 100s），只喂第 7 张时任何时刻都画那一张，
 *   所以缩略图整条时间轴都错。
 *   修法：把 previewList[6] 换成带 {index} 的模板，插件按张号取值。
 *   只有「张数 ≈ 时长/100」时才改（张数偏少说明服务端用了更大 interval）。
 *   顺手带一条 spr= 请求回来，让 QX 层弹一行诊断。
 */
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
/* AES 加密方向：long/info 响应是 AES-256-CBC 密文，
   要在 QX 里改 urls 就必须能重新加密回去。 */
function encBlock(K, blk) {
  // K 是 expandKey 返回的 {w, Nr}，不是数组
  const w = K.w, Nr = K.Nr;
  const s = blk.slice(0, 16);
  for (let i = 0; i < 16; i++) s[i] ^= w[i];
  for (let r = 1; r <= Nr; r++) {
    for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]];
    // ShiftRows
    const t = s.slice();
    s[0] = t[0]; s[1] = t[5]; s[2] = t[10]; s[3] = t[15];
    s[4] = t[4]; s[5] = t[9]; s[6] = t[14]; s[7] = t[3];
    s[8] = t[8]; s[9] = t[13]; s[10] = t[2]; s[11] = t[7];
    s[12] = t[12]; s[13] = t[1]; s[14] = t[6]; s[15] = t[11];
    if (r !== Nr) {
      for (let i = 0; i < 16; i += 4) {
        const a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3];
        s[i]     = xtime(a0) ^ (xtime(a1) ^ a1) ^ a2 ^ a3;
        s[i + 1] = a0 ^ xtime(a1) ^ (xtime(a2) ^ a2) ^ a3;
        s[i + 2] = a0 ^ a1 ^ xtime(a2) ^ (xtime(a3) ^ a3);
        s[i + 3] = (xtime(a0) ^ a0) ^ a1 ^ a2 ^ xtime(a3);
      }
    }
    for (let i = 0; i < 16; i++) s[i] ^= w[r * 16 + i];
  }
  return s;
}
function cbcEncBytes(key, iv, pt) {
  const K = expandKey(key), out = [];
  let prev = iv.slice(0, 16);
  const n = 16 - (pt.length % 16);
  const buf = pt.concat(new Array(n).fill(n));   // PKCS#7
  for (let off = 0; off < buf.length; off += 16) {
    const blk = buf.slice(off, off + 16);
    for (let j = 0; j < 16; j++) blk[j] ^= prev[j];
    const enc = encBlock(K, blk);
    for (let j = 0; j < 16; j++) out.push(enc[j]);
    prev = enc;
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
const B64C = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function b64encode(bin) {
  let out = "";
  for (let i = 0; i < bin.length; i += 3) {
    const a = bin.charCodeAt(i) & 255;
    const b = i + 1 < bin.length ? bin.charCodeAt(i + 1) & 255 : 0;
    const c = i + 2 < bin.length ? bin.charCodeAt(i + 2) & 255 : 0;
    out += B64C.charAt(a >> 2);
    out += B64C.charAt(((a & 3) << 4) | (b >> 4));
    out += i + 1 < bin.length ? B64C.charAt(((b & 15) << 2) | (c >> 6)) : "=";
    out += i + 2 < bin.length ? B64C.charAt(c & 63) : "=";
  }
  return out;
}
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
  // 播放器起播开关：非 VIP 时只要 ui.ad.video 非空就不调用 playSrc()，
  // 它等 player_ctime 倒计时；我们把 ctime 清零后倒计时不递减，就永远黑屏。
  // 这里把 ad.video 数组直接清空，让它走 playSrc() 那条路。
  "if(o.ad&&typeof o.ad==='object'&&Array.isArray(o.ad.video)){o.ad.video.length=0;}",
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
  "if(r.ad&&typeof r.ad==='object'){r.ad.cover_display=false;r.ad.cover_image='';r.ad.cover_link='';r.ad.video=[];if(Array.isArray(r.ad.list))r.ad.list=[];}",
  "r.player_top_free_text={cn:'',tw:''};",
  "r.player_mid_free_text={cn:'',tw:''};",
  "var ks=['pwa','h5','ios','light','android'];",
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
  // ---- 预取：快进卡顿的唯一来源就是「目标段整段下载」 ----
  // 实测（Chromium + video.js 8.11.1 + VHS，真实 CDN，CHN-181-CN，1.2MB/段）：
  //   起播：key.php 1297ms + seg0 2452ms
  //   快进 3000s 冷缓存：seeked 4720ms，其中 seg 下载 4092ms，key 只花 13ms(ETag 命中)
  //   快进 7000s 冷缓存：seeked 3841ms，其中 seg 下载 3213ms
  //   目标段已预取：     seeked  617ms（播放器那次 XHR 只用 8ms，直接命中缓存）
  //   预取在途时立刻快进：seeked 3561ms（浏览器把两个请求合并成一条，不亏也不赚）
  // 所以 key/列表/时间戳都不是瓶颈，别再往那上面改。
  // 能动的只有一件事：把 1.2MB 的下载从「松手之后」挪到「手指还在进度条上」。
  // 做法：按下立刻下当前位置，拖动时 80ms 去抖改目标并 abort 掉旧的，
  // 松手点再补一次（播放器随即发出的请求会和它合并）。一次手势最多 4 段，防跑流量。
  "var SD=6.006;",
  "var PREF={av:null,dir:'apen',bar:null,drag:false,timer:0,pend:-1,cur:-1,ctl:null,seq:0,n:0,max:4,seen:{},pl:0};",
  "function pfAbort(){try{if(PREF.ctl)PREF.ctl.abort();}catch(e){}PREF.ctl=null;PREF.cur=-1;}",
  "function isVhs(){try{var p=window.__ltPlayer;return !!(p&&p.tech_&&p.tech_.vhs);}catch(e){}return false;}",
  "function prefetchIdx(i){",
  "if(!isVhs()||PREF.pl)return;",                    // 原生 HLS 预取无效；播放器自己在拖动中就 seek 的也不预取（会下两遍）
  "var av=PREF.av;if(!av||i<0||i>200000)return;",
  "var s=PREF.seen[av];if(s&&s[i])return;",         // 这段已经下过了
  "if(PREF.cur===i)return;",                        // 正在下的就是它
  "if(PREF.n>=PREF.max)return;",                    // 一次手势最多 4 段
  "pfAbort();PREF.cur=i;PREF.n++;var my=++PREF.seq;",
  "var u=CDN+'/'+PREF.dir+'/'+av+'/ts/'+av+'-'+i+'.ts';",
  "var c=null;try{c=new AbortController();PREF.ctl=c;}catch(e){}",
  "var fin=function(good){",
  "if(good){var t=PREF.seen[PREF.av]||(PREF.seen[PREF.av]={});t[i]=1;}",
  "if(my===PREF.seq){PREF.cur=-1;PREF.ctl=null;}",
  "};",
  "try{fetch(u,c?{cache:'default',signal:c.signal}:{cache:'default'})",
  ".then(function(r){return r.arrayBuffer();}).then(function(){fin(1);},function(){fin(0);});}",
  "catch(e){fin(0);}",
  "}",
  "function prefetchSoon(i,d){",
  "if(i<0||PREF.pl)return;PREF.pend=i;if(PREF.timer)return;",
  "PREF.timer=setTimeout(function(){PREF.timer=0;var n=PREF.pend;PREF.pend=-1;if(n>=0)prefetchIdx(n);},d||80);",
  "}",
  "function videoEl(){return document.querySelector('video');}",
  "function idxAt(clientX){",
  "var b=PREF.bar;if(!b)return -1;var r=b.getBoundingClientRect();if(!r.width)return -1;",
  "var f=(clientX-r.left)/r.width;f=f<0?0:(f>1?1:f);",
  "var v=videoEl();var dur=v&&isFinite(v.duration)?v.duration:0;if(!dur)return -1;",
  "return Math.floor(f*dur/SD);",
  "}",
  "function barOf(t){try{return t&&t.closest?t.closest('.vjs-progress-holder,.vjs-progress-control'):null;}catch(e){return null;}}",
  "function grab(e){",
  "var el=barOf(e.target);if(!el)return false;",
  "PREF.bar=el.querySelector('.vjs-progress-holder')||el;PREF.drag=true;PREF.n=0;LSK.n=0;PREF.pl=0;",
  "return true;",
  "}",
  "document.addEventListener('pointerdown',function(e){",
  "if(!grab(e))return;var i=idxAt(e.clientX);if(i>=0)prefetchSoon(i,120);",  // 按下就排上；播放器若自己 seek 了会取消
  "liveSoon(e.clientX);",
  "},true);",
  "document.addEventListener('pointermove',function(e){",
  "if(PREF.drag){prefetchSoon(idxAt(e.clientX),80);liveSoon(e.clientX);return;}",
  "if(barOf(e.target))prefetchSoon(idxAt(e.clientX),260);",             // 鼠标悬停也提前下
  "},true);",
  "document.addEventListener('pointerup',function(e){",
  "if(!PREF.drag)return;PREF.drag=false;",
  "liveStop();",
  "pfAbort();",                                                        // 在途预取让给播放器，避免同一段下两遍
  "},true);",
  "document.addEventListener('pointercancel',function(){PREF.drag=false;liveStop();},true);",
  // iOS 原生 HLS 下页面 fetch 进不了 AVFoundation 的缓存，预取对它没用。
  // 所以再补一条：停手 450ms 没动就直接把 currentTime 设到该位置，
  // 让播放器自己去拉那一段。松手时它多半已经拉完 → 松手即出画。
  // 站点 playOptions 里 disableSeekWhileScrubbingOnMobile:true 关掉了拖动中 seek，
  // 这里绕过它，但只在「手指停住」时做一次，不连续 seek。
  "var LSK={timer:0,cx:0,n:0,max:2};",
  "function liveStop(){if(LSK.timer){clearTimeout(LSK.timer);LSK.timer=0;}}",
  "function liveSeek(){",
  "if(window.__ltLS===0)return;",
  "if(isVhs())return;",                             // VHS 走预取那条路，别两边同时下
  "if(LSK.n>=LSK.max)return;",                       // 一次手势最多先 seek 两次，别把流量造光
  "var p=window.__ltPlayer;if(!p)return;var v=videoEl();if(!v)return;",
  "var i=idxAt(LSK.cx);if(i<0)return;var t=i*SD;",
  "var d=v.duration;if(d&&isFinite(d)&&t>d-2)t=Math.max(0,d-2);",
  "if(Math.abs(t-v.currentTime)<1.5)return;",                           // 已在附近，别折腾
  "LSK.n++;try{p.currentTime(t);}catch(e){}",
  "}",
  "function liveSoon(cx){",
  "LSK.cx=cx;if(LSK.timer)return;",
  "LSK.timer=setTimeout(function(){LSK.timer=0;liveSeek();},450);",
  "}",
  // 快进耗时徽标：把真机上「松手→出画」的真实秒数显示出来，
  // 顺便标出播放器用的是 VHS 还是系统原生 HLS。只看 >=300ms 的那种。
  "var SKT={t0:0};",
  "function ltTech(){try{var p=window.__ltPlayer;if(p&&p.tech_&&p.tech_.vhs)return 'VHS';}catch(e){}return '原生HLS';}",
  "function skArm(){",
  "var v=videoEl();if(!v||v.__ltSk)return;v.__ltSk=1;",
  "v.addEventListener('seeking',function(){if(!SKT.t0)SKT.t0=performance.now();if(PREF.drag){PREF.pl=1;pfAbort();}});",
  "v.addEventListener('seeked',function(){",
  "if(!SKT.t0)return;var ms=performance.now()-SKT.t0;SKT.t0=0;",
  "if(ms<300)return;",
  "try{sprBadge('快进耗时 '+(ms/1000).toFixed(1)+' 秒 · '+ltTech()+' · 落点 '+(v.currentTime/60).toFixed(1)+' 分');}catch(e){}",
  "});",
  "}",
  "setInterval(skArm,500);",
  "if(!window.PointerEvent){",
  "document.addEventListener('touchstart',function(e){",
  "if(!grab(e))return;var t=e.touches[0];if(!t)return;var i=idxAt(t.clientX);if(i>=0)prefetchIdx(i);",
  "},true);",
  "document.addEventListener('touchmove',function(e){",
  "if(!PREF.drag)return;var t=e.touches[0];if(t)prefetchSoon(idxAt(t.clientX),80);",
  "},true);",
  "document.addEventListener('touchend',function(){PREF.drag=false;},true);",
  "}",
  // ---- 缩略图 ----
  // 站点 setupSpriteThumbnails()：源只有一路时走 {url: previewList[6]}，否则走 {urlArray}。
  // 插件 videojs-sprite-thumbnails 2.2.4 的关键是每张图覆盖 interval*columns*rows 秒，
  // 默认 interval=1 → 100 秒/张。而服务端是把全部张数平摊到整片时长：
  // 142 分钟 / 86 张 ≈ 99.07 秒/张，插件按 100 秒算，越往后偏得越多（尾段约 1 分钟）。
  // 所以两个都要改：张号（url→urlArray）和每张覆盖秒数（interval）。
  // 实例路径：站点是 Vue2，#app.__vue__ 能拿到根组件，顺着 $children 找到带 luPlayer 的组件。
  // 插件方法第一次调用后会被替换成 ()=>实例、传参失效，所以分「提前包住」和「事后改实例」两条路。
  // 兜底自绘：有些情况下插件内部的 ready 永远不置位（实测：tooltip 与片源都在，
  // loadedmetadata 也不抛错，但 ready 一直 false），此时缩略图一张都不会显示。
  // 这里按同样的几何（每张覆盖 interval*columns*rows 秒，跪内 列主序）自己写 tooltip，
  // 插件自己好了就完全不插手。
  "function sprSelf(inst){",
  "try{",
  "if(!inst||!inst.options)return;",
  "var L=SPR.list||[];if(!L.length)return;",
  "var W=inst.options.width||160,H=inst.options.height||90,C=inst.options.columns||10,R=inst.options.rows||10;",
  "var per=(inst.options.interval||1)*C*R;if(!(per>0))per=100;",
  "var picks=function(){",
  "var tip=document.querySelector('.vjs-mouse-display .vjs-time-tooltip')||document.querySelector('.vjs-time-tooltip');",
  "var bar=document.querySelector('.vjs-progress-holder');",
  "return [bar,tip];};",
  "var onMove=function(e,snap){",
  "try{",
  "if(inst.state&&inst.state.ready)return;",
  "var a=picks(),bar=a[0],tip=a[1];if(!bar||!tip)return;",
  // 用事件发生瞬间的快照：延后写入时 tooltip 已展开，布局会挪几像素
  "var r=snap||bar.getBoundingClientRect();if(!r.width)return;",
  "var dur=0;try{dur=(SPR.pl&&SPR.pl.duration&&SPR.pl.duration())||0;}catch(x){}",
  "if(!(dur>0))dur=SPR.dur||0;",
  "if(!(dur>0))return;",
  "var f=(e.clientX-r.left)/r.width;f=f<0?0:(f>1?1:f);",
  "var S=f*dur,i=Math.floor(S/per);if(i<0)i=0;if(i>L.length-1)i=L.length-1;",
  "var t=Math.floor((S-per*i)/(inst.options.interval||1));if(t<0)t=0;if(t>C*R-1)t=C*R-1;",
  "var col=t%C,row=Math.floor(t/C);",
  "tip.style.backgroundImage='url(\"'+L[i]+'\")';",
  "tip.style.backgroundSize=(C*W)+'px '+(R*H)+'px';",
  "tip.style.backgroundPosition=(-col*W)+'px '+(-row*H)+'px';",
  "tip.style.width=W+'px';tip.style.height=H+'px';",
  "SPR.self=1;",
  "}catch(x){}};",
  // 冒泡阶段注册（插件挂在进度条元素上，document 冒泡在它之后），
  // 再放到 setTimeout(0) 里写，确保最终生效的是我们的值。
  "var later=function(e){",
  "var bar0=document.querySelector('.vjs-progress-holder');",
  "var snap=bar0?bar0.getBoundingClientRect():null;",
  "var cx=e.clientX;",
  "setTimeout(function(){onMove({clientX:cx},snap);},0);};",
  "document.addEventListener('mousemove',later,false);",
  "document.addEventListener('touchmove',later,false);",
  "}catch(e){}}",
  "var SPR={list:null,orig6:null,dur:0,iv:0,applied:0,wrapped:0,sheets:0,reportedOk:0,reportedFail:0,tries:0,root:null,parses:0,maxArr:0,maxStr:0};",
  "function sprTemplate(L){",
  "var n=L.length,i,k,j,m,re,t,tests;if(n<4)return '';",
  "for(i=0;i<n;i++){",
  "if(typeof L[i]!=='string')continue;",
  "re=/\\d+/g;",
  "while((m=re.exec(L[i]))){",
  "if(m[0]!==String(i))continue;",
  "t=L[i].slice(0,m.index)+'{index}'+L[i].slice(m.index+m[0].length);",
  "tests=[0,n-1,Math.floor(n/2)];var ok=1;",
  "for(k=0;k<tests.length;k++){j=tests[k];if(t.replace('{index}',String(j))!==L[j]){ok=0;break;}}",
  "if(ok)return t;",
  "}}",
  "return '';}",
  // 抓 previewList：同时记 parse 次数和见过的最大数组，抓不到时也能说明卡在哪
  // 站点 preview 接口返回 {"status","message","data":[url...]}，数组在 data 上；
  // 另一些接口是 {"data":{"data":[...]}}。两种都要认，否则一次都抓不到。
  "function sprArrOf(o){",
  "if(!o||typeof o!=='object')return null;",
  "var d=o.data;",
  "if(Array.isArray(d))return d;",
  "if(d&&typeof d==='object'&&Array.isArray(d.data))return d.data;",
  "return null;}",
  "function sprCapture(o){",
  "SPR.parses++;",
  "if(SPR.list)return;",
  "var d=sprArrOf(o);",
  "if(!d)return;",
  "if(d.length>SPR.maxArr)SPR.maxArr=d.length;",
  "if(d.length&&typeof d[0]==='string'&&d[0].length>SPR.maxStr)SPR.maxStr=d[0].length;",
  "if(d.length<2)return;",
  "var i;for(i=0;i<d.length;i++){if(typeof d[i]!=='string')return;}",
  "SPR.list=d;SPR.sheets=d.length;SPR.orig6=d[6];",
  "var dd=SPR.dur||0;",
  "if(dd>0){var iv=dd/(d.length*100);if(iv>0&&isFinite(iv))SPR.iv=iv;}",
  "if(typeof sprTick==='function')try{sprTick();}catch(e){}",
  "try{sprBadge('Lutube '+(window.__ltVER||'')+' 抓到缩略图 '+SPR.list.length+' 张');}catch(e){}",
  "}",
  "function sprFindVm(vm,depth){",
  "if(!vm||depth>14)return null;",
  "if(vm.luPlayer&&typeof vm.luPlayer.spriteThumbnails==='function')return vm;",
  "var ch=vm.$children||[];",
  "for(var i=0;i<ch.length;i++){var r=sprFindVm(ch[i],depth+1);if(r)return r;}",
  "return null;}",
  // Vue2 根实例不一定挂在 #app 上，退化到「全文档找带 __vue__ 的节点」，再往上爬到根
  "function sprRoot(){",
  "if(SPR.root)return SPR.root;",
  "var el=document.getElementById('app'),vm=el&&el.__vue__,i,all;",
  "if(!vm){all=document.querySelectorAll('*');",
  "for(i=0;i<all.length&&i<6000;i++){if(all[i].__vue__){vm=all[i].__vue__;break;}}}",
  "if(!vm)return null;",
  "var g=0;while(vm.$parent&&g++<25)vm=vm.$parent;",
  "SPR.root=vm;return vm;}",
  // 每张覆盖秒数：优先用播放器真实时长，比接口里的分钟数准
  "function sprIv(p){",
  "var n=(SPR.list&&SPR.list.length)||0;if(!n)return 1;",
  "var d=0;try{d=(p&&p.duration&&p.duration())||0;}catch(e){}",
  "if(!(d>0))d=SPR.dur||0;",
  "if(!(d>0))return 1;",
  // 实测服务端就是 100 秒一张（1 秒一格、10x10），张数 ≈ ceil(时长/100)。
  "var need=Math.ceil(d/100);",
  "if(n>=need*0.8)return 1;",
  // 张数明显更粗才按实际张数平摊，其余保持默认
  "var iv=d/(n*100);",
  "return (iv>0.02&&iv<5)?iv:1;}",
  "function sprOpts(opts,iv){",
  "var o={urlArray:SPR.list.slice(),width:(opts&&opts.width)||160,height:(opts&&opts.height)||90,columns:(opts&&opts.columns)||10,rows:(opts&&opts.rows)||10,interval:iv||1};",
  "if(SPR.orig6!==null)o.urlArray[6]=SPR.orig6;",
  "return o;}",
  "function sprReport(){",
  "var n=(SPR.list&&SPR.list.length)||0;",
  "var q='/__lt/'+window.__ltAV+'.m3u8?dm='+Math.round((SPR.dur||0)/60)+'&spr='+n+'&tmpl='+SPR.applied",
  "+'&iv='+Math.round((SPR.iv||1)*100)+'&p='+SPR.parses+'&m='+SPR.maxArr",
  "+'&vm='+(SPR.vmOk||0)+'&pl='+(SPR.pOk||0)+'&e='+encodeURIComponent(SPR.err||'');",
  "try{fetch(q).catch(function(){});}catch(e){}",
  "}",
  "function sprBadge(txt){",
  "try{",
  "var d=document.getElementById('lt-spr-badge');",
  "if(!d){d=document.createElement('div');d.id='lt-spr-badge';",
  "d.style.cssText='position:fixed;right:8px;bottom:72px;z-index:2147483647;background:rgba(0,0,0,.8);color:#fff;font:12px/1.6 -apple-system,sans-serif;padding:6px 10px;border-radius:8px;max-width:72vw;pointer-events:none;white-space:pre-line';",
  "document.body.appendChild(d);}",
  "d.textContent=txt;",
  "clearTimeout(d.__t);",
  "d.__t=setTimeout(function(){d.style.transition='opacity .5s';d.style.opacity='0';setTimeout(function(){if(d.parentNode)d.parentNode.removeChild(d);},600);},12000);",
  "}catch(e){}}",
  "function sprTick(){",
  "try{",
  "SPR.tries++;",
  "var root=sprRoot(),vm=root?sprFindVm(root,0):null,p=vm&&vm.luPlayer;",
  "if(p)window.__ltPlayer=p;",   // 预取/先 seek 都要用播放器实例
  // 只走「提前包住」这一条：站点 setupSpriteThumbnails 调用时把参数换掉。
  // 插件方法第一次调用后会被替换成 ()=>实例、之后传参失效，所以包必须发生在站点调用之前——
  // sprCapture 抓到 previewList 时会同步调用一次 sprTick，正好赶在 Vue 的 watcher 之前。
  "if(p&&SPR.list&&SPR.list.length>1&&!p.__ltSpr&&typeof p.spriteThumbnails==='function'){",
  "var iv=sprIv(p);",
  "var orig=p.spriteThumbnails;",
  "p.__ltSpr=1;",
  "p.spriteThumbnails=function(opts){",
  "var inst;",
  "try{inst=orig.call(p,sprOpts(opts,iv));}catch(e){}",
  "if(!inst)return orig.call(p,opts);",
  // 插件的 x/$（tooltip 引用）和 ready 只在 loadedmetadata 里赋值；站点调用时该事件可能已经过了，
  // 先重放一次事件，不行就直接补引用置位。
  // 插件的 E 处理器挂在 player.ready 回调里才绑定，实例刚建时可能还没绑上，
  // 所以分几个时间点重放，直到 ready 置位为止。
  "var rt=function(){try{if(!(inst.state&&inst.state.ready))p.trigger('loadedmetadata');}catch(e){}};",
  "rt();setTimeout(rt,200);setTimeout(rt,800);setTimeout(rt,2000);",
  "SPR.applied=1;SPR.iv=iv;SPR.inst=inst;SPR.pl=p;",
  "try{sprSelf(inst);}catch(e){}",
  "sprBadge('缩略图 '+SPR.list.length+' 张 · 每张 '+(iv*100).toFixed(1)+' 秒 · 全长 '+Math.round(iv*SPR.list.length*100)+' 秒');",
  "return inst;};",
  "SPR.wrapped=1;SPR.iv=iv;",
  "}",
  // 播放器拿到真实时长后重算一次：抓数组时若还没 loadedmetadata，iv 只能是估算
  "if(SPR.inst&&SPR.pl){",
  "var iv2=sprIv(SPR.pl);",
  "if(iv2>0&&Math.abs(iv2-(SPR.inst.options.interval||1))>0.001){",
  "SPR.inst.options.interval=iv2;SPR.iv=iv2;",
  "sprBadge('缩略图 '+SPR.list.length+' 张 · 每张 '+(iv2*100).toFixed(1)+' 秒 · 全长 '+Math.round(iv2*SPR.list.length*100)+' 秒');",
  "}}",
  "}catch(e){SPR.err=String((e&&e.message)||e).slice(0,60);}",
  // 上报单独一个 try：上面任何一步抛错都不能连上报一起吞掉，
  // 否则表现就是「页面没任何提示」，根本无从判断卡在哪一步。
  "try{",
  "SPR.pOk=p?1:0;SPR.vmOk=vm?1:0;",
  "if(window.__ltAV){",
  "if((SPR.applied||SPR.wrapped)&&!SPR.reportedOk){SPR.reportedOk=1;sprReport();}",
  "else if(!SPR.applied&&!SPR.wrapped&&SPR.tries>=20&&!SPR.reportedFail){SPR.reportedFail=1;sprReport();}",
  "}",
  "}catch(e){}",
  "}",
  // 播放器节点插入 DOM 的时刻早于 ready 回调，用它兜住「列表先到、播放器后建」的顺序，
  // 否则站点在 ready 里直接调 setupSpriteThumbnails，我们的包装就晚了一步。
  "try{if(window.MutationObserver){var _mo=new MutationObserver(function(){if(SPR.list)try{sprTick();}catch(e){}});",
  "_mo.observe(document.documentElement,{childList:true,subtree:true});}}catch(e){}",
  "setInterval(sprTick,120);",
  "setTimeout(function(){try{if(!SPR.applied)sprBadge('Lutube '+(window.__ltVER||'?')+' 钩子已生效 · 打开视频拖进度条看此处');}catch(e){}},2500);",
  "function patch(d){",
  "if(!d||typeof d!=='object'||!d.avkey||!d.urls)return false;",
  "var a=String(d.avkey);",
  "if(!/^[A-Za-z0-9_.-]+$/.test(a))return false;",
  "var dm=Number(d.duration)||0;",
  "SPR.dm=dm;",
  "SPR.dur=dm>0?(dm<1000?dm*60:dm):0;",
  // 判目录不能看 avkey 形态：FJIN-159-CN 形似 apen，实际也在 apen；
  // 形似 original_videos 的也可能在 apen。唯一可靠判据是 CDN 上哪个目录存在。
  "var u0='/__lt/'+a+'.m3u8?dm='+dm;",
  "function head(u){return fetch(u,{method:'HEAD'}).then(function(r){return r.status;}).catch(function(){return 0;});}",
  "function dirOf(av,cb){",
  "var b=CDN+'/apen/'+av+'/ts/'+av+'-0.ts';",
  "head(b).then(function(st){",
  "if(st===200||st===206)return cb('apen');",
  "head(CDN+'/original_videos/'+av+'/ts/'+av+'-0.ts').then(function(st2){",
  "cb((st2===200||st2===206)?'original_videos':'apen');",
  "});});}",
  "if(API[a]){d.urls.low=API[a];d.urls.high=API[a];d.urls.intro='';d.__lt=1;window.__ltAV=a;return true;}",
  "dirOf(a,function(dir){",
  "if(dir==='apen'){d.urls.low=u0;d.urls.high=u0;d.urls.intro='';d.__lt=1;window.__ltAV=a;PREF.av=a;PREF.dir=dir;PREF.cur=-1;PREF.pend=-1;PREF.n=0;PREF.seen={};",
  // 只预取 key + 首段（250KB，挡住首帧的就是这两样）。段 1 留给正常流式，
  // 否则 1.75MB 的预取还没下完播放器就来要，反而更慢。
  "try{fetch(CDN+'/apen/'+a+'/key.php').then(function(r){return r.arrayBuffer();}).catch(function(){});",
  "fetch(CDN+'/apen/'+a+'/ts/'+a+'-0.ts').then(function(r){return r.arrayBuffer();}).catch(function(){});}catch(e){}",
  "return;}",
  // original_videos：先指向占位，异步推 IV 后替换
  "deriveIV(a,'original_videos',function(ivh){",
  "if(!ivh)return;",
  "var u=u0+'&iv='+ivh;API[a]=u;",
  "if(d.urls){d.urls.low=u;d.urls.high=u;d.urls.intro='';d.__lt=1;}",
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
  "d.urls.low=u0;d.urls.high=u0;d.urls.intro='';d.__lt=1;window.__ltAV=a;",
  "});",
  "return true;}",
  "JSON.parse=function(s,rev){",
  "var o=_p(s,rev);",
  "try{",
  "if(o&&typeof o==='object'){",
  "if(has(o,'response')){app(o.response);}",
  "else if(has(o,'data')){",
  "if(!vip(o.data)){if(!patch(o.data)){if(isAd(o.data))o.data={};}}",
  "}",
  "sprCapture(o);",
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
/* 目录形态判断。
   original_videos 的样本全是 TX/JL 前缀 + 长哈希（TX6ac384d67d504、
   TX6ad816d9a8c83、JL63fea1d03fbc8），其余一律在 apen——
   包括 FJIN-159-CN 这种带国别后缀、SNOS-335- 这种尾部连字符的。
   判错只是首次播放多一轮 HEAD，结果会缓存纠正，不会一直错。 */
const ORIG_RE = /^(?:TX|JL)[0-9a-f]{8,}$/i;
const dirOf = (a) => (ORIG_RE.test(a) ? "original_videos" : "apen");
const isApen = (a) => !ORIG_RE.test(a);
// 兜底：目录判错时换另一个再试（seg0 HEAD 一次，代价很小）
/* 目录探测：两个目录并行 HEAD，apen 优先。
   串行要两轮（各约 1 秒），并行只花一轮。结果缓存，之后不再探测。 */
function pdGet(av) {
  try {
    if (typeof $prefs !== "undefined" && $prefs.valueForKey) {
      const v = $prefs.valueForKey("lt_pd_" + av);
      return v === "apen" || v === "original_videos" ? v : "";
    }
  } catch (e) {}
  return "";
}
function pdSet(av, d) {
  try {
    if (typeof $prefs !== "undefined" && $prefs.setValueForKey) {
      $prefs.setValueForKey(d, "lt_pd_" + av);
    }
  } catch (e) {}
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

/* 分段时长：站点各片不一样（6.000000 或 6.006000），
   写死会让长片累计偏差（1246 段差 7 秒，拖动对时偏）。
   从站点自己的试看列表 EXTINF 读出真实值缓存起来。 */
function sdGet(av) {
  try {
    if (typeof $prefs !== "undefined" && $prefs.valueForKey) {
      const n = parseFloat($prefs.valueForKey("lt_sd_" + av));
      return isNaN(n) || n <= 0 ? 0 : n;
    }
  } catch (e) {}
  return 0;
}
function sdSet(av, sd) {
  if (!av || !sd || sd <= 0) return;
  try {
    if (typeof $prefs !== "undefined" && $prefs.setValueForKey) {
      $prefs.setValueForKey(String(sd), "lt_sd_" + av);
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
function scGet(av) {
  try {
    if (typeof $prefs !== "undefined" && $prefs.valueForKey) {
      const n = parseInt($prefs.valueForKey("lt_sc_" + av), 10);
      return isNaN(n) || n <= 0 ? 0 : n;
    }
  } catch (e) {}
  return 0;
}
function scSet(av, n) {
  if (!av || !n || n <= 0) return;
  try {
    if (typeof $prefs !== "undefined" && $prefs.setValueForKey) {
      $prefs.setValueForKey(String(n), "lt_sc_" + av);
    }
  } catch (e) {}
}
function segCount(av, dm, dir) {
  const cached = scGet(av);
  if (cached) return Promise.resolve(cached);
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
    return probe(0).then((h0) => (h0 ? bs(0, 3000) : Promise.resolve(-1))).then((n) => {
      if (n > 0) scSet(av, n);
      return n;
    });
  }
  const cand = [];
  for (let k = 2; k <= 12; k++) if (g - k > 0) cand.push(g - k);
  return Promise.all(cand.map((n) => qxFetch(base + n + ".ts", "HEAD"))).then((rs) => {
    let best = -1;
    for (let i = 0; i < cand.length; i++) {
      const ok = rs[i].ok || rs[i].status === 206;
      if (ok && cand[i] > best) best = cand[i];
    }
    const n = best < 0 ? -1 : best + 1;
    if (n > 0) scSet(av, n);
    return n;
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
  // 目录不单独探测，直接用形态猜一个跑段数探测；失败再换另一个。
  // 这样冷启动只花一轮 HEAD（11 个并行），而不是探测目录 + 段数两轮。
  const guess = pdGet(av) || dirOf(av);
  const other = guess === "apen" ? "original_videos" : "apen";
  const attempt = (dir) => segCount(av, dm, dir).then((N) => {
    if (N > 0) { pdSet(av, dir); return { dir, N }; }
    return null;
  });
  return attempt(guess).then((r) => (r ? r : attempt(other))).then((hit) => {
    if (!hit) return null;
    const dir = hit.dir, N = hit.N;
  const base = CDN + "/" + dir + "/" + av;
  return Promise.resolve().then(() => {
    if (N <= 0) return null;
    let ivHex = ivHint || "";
    if (!ivHex) {
      if (dir === "apen") ivHex = md5hex(av);
      else return null;           // original_videos 无 IV 无法构造
    }
    const keyUri = uriHint || (base + "/key.php");
    // 每段时长取缓存到的真实值。实测平均每段 6.0062 秒（解 PTS 量 50 段得出），
    // 用 6.000 会让 1418 段累计偏 8.8 秒，拖动时预览帧对不齐。
    const sd = sdGet(av) || 6.006;
    const sdtxt = sd.toFixed(6);
    const total = Math.round(N * sd);
    const L = [
      "#EXTM3U",
      // 与站点原生列表对齐：VERSION:4 + PLAYLIST-TYPE:VOD
      // + INDEPENDENT-SEGMENTS + TARGETDURATION。
      // 站点原生列表确实带 INDEPENDENT-SEGMENTS，删掉反而偏离基线。
      "#EXT-X-VERSION:4",
      "#EXT-X-PLAYLIST-TYPE:VOD",
      "#EXT-X-INDEPENDENT-SEGMENTS",
      // TARGETDURATION 必须 >= 最大 EXTINF 四舍五入，6.006 时取 7 才合规
      "#EXT-X-TARGETDURATION:" + Math.max(1, Math.ceil(sd)),
      "#EXT-X-MEDIA-SEQUENCE:0",
      '#EXT-X-KEY:METHOD=AES-128,URI="' + keyUri + '",IV=0x' + ivHex,
    ];
    for (let i = 0; i < N; i++) {
      L.push("#EXTINF:" + sdtxt + ",");
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
  // 不能 no-store：播放器每拖动一次都可能重新解析列表，
  // 一重新解析就再跑一次脚本、再拉一次 key.php（CDN 首字节 0.6 秒）。
  // 允许缓存后，一次播放只解析一次列表。
  "Cache-Control": "public, max-age=3600",
};

/* 同一部片只弹一次通知。
   列表被反复请求时，$notify 会连发，既吵又拖慢响应。 */
function notifyOnce(k, a, b, c, win) {
  // QX 每次请求都是全新的脚本实例，内存变量不跨请求，只能用 $prefs。
  // win 传 0 表示不去重：诊断类通知必须每次都出现，否则同一个片子看第二遍就静音，
  // 会被误判成「脚本没生效」。
  const w = typeof win === "number" ? win : 600000;
  try {
    if (w > 0 && typeof $prefs !== "undefined" && $prefs.valueForKey) {
      const last = parseInt($prefs.valueForKey("lt_nf_" + k), 10) || 0;
      const now = Date.now();
      if (now - last < w) return;
      $prefs.setValueForKey(String(now), "lt_nf_" + k);
    }
  } catch (e) {}
  if (typeof $notify === "function") $notify(a, b, c);
}

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
    h = h.replace(anchor, '<script>window.__ltVER="' + VER + '";</script>' + HOOK + '<script type="module"');
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
    // 缩略图诊断：页面钩子抓到 previewList 后会带 spr/tmpl 来敲一下，
    // 这里只回一条通知，顺手给个空列表（播放器不会用这个响应）。
    const sq = url.match(/[?&]spr=(\d+)/);
    if (sq) {
      const n = parseInt(sq[1], 10) || 0;
      const ok = /[?&]tmpl=1/.test(url);
      const ivm = url.match(/[?&]iv=(\d+)/);
      const sec = ivm ? (parseInt(ivm[1], 10) || 100) : 100;
      const pm = url.match(/[?&]p=(\d+)/);
      const mm = url.match(/[?&]m=(\d+)/);
      const parses = pm ? parseInt(pm[1], 10) : 0;
      const maxArr = mm ? parseInt(mm[1], 10) : 0;
      let detail;
      if (n > 0 && ok) detail = "已接管播放器 · 每张 " + sec + " 秒";
      else if (n > 0) detail = "抓到 " + n + " 张，但没找到播放器";
      else detail = "没抓到缩略图数组 · parse " + parses + " 次，最长数组 " + maxArr;
      notifyOnce("spr:" + av, "Lutube " + VER, n > 0 ? "缩略图 " + n + " 张" : "缩略图未取到", detail, 0);
      return $done({ status: 200, headers: M3U8_HEADERS, body: "#EXTM3U\n#EXT-X-ENDLIST" });
    }
    const q = url.match(/[?&]dm=([\d.]+)/);
    const dm = (q ? parseFloat(q[1]) : 0) || dmGet(av);
    dmSet(av, dm);
    // iv 由页面钩子推好带过来（original_videos 类必需）
    const ivq = url.match(/[?&]iv=([0-9a-fA-F]{32})/);
    const ivHint = ivq ? ivq[1].toLowerCase() : "";
    return buildList(av, dm, ivHint || undefined).then((r) => {
      if (!r) return $done({});
      notifyOnce("pl:" + av, "Lutube " + VER, "完整片源 " + av,
        "段数 " + r.n + " · 约 " + Math.round(r.total / 60) + " 分钟");
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
      notifyOnce("pl:" + av, "Lutube " + VER, "完整片源 " + av,
        "段数 " + r.n + " · 约 " + Math.round(r.total / 60) + " 分钟");
      return $done({ status: 200, headers: M3U8_HEADERS, body: r.text });
    });
  }

  /* ---- ③ long/info 改写 urls（主力路径，不依赖页面 hook） ----
     真机走原生 HLS，页面 hook 拦不到 m3u8 请求。
     所以在这里把 urls 直接改成 /__lt/，播放器读到的就是完整片源。
     响应是 AES-256-CBC 密文，改完必须原样加密回去。 */
  if (/\/api\/v3\/long\/info\//.test(url) && body) {
    const vtag = ($response.headers && ($response.headers["x-vtag"] || $response.headers["X-Vtag"])) || "";
    const plain = apiDecode(body, vtag);
    if (!plain) return $done({});
    const ma = plain.match(/"avkey"\s*:\s*"([^"]+)"/);
    const md = plain.match(/"duration"\s*:\s*(\d+)/);
    const av = ma ? ma[1] : "";
    const dm = md ? Number(md[1]) : 0;
    if (av) dmSet(av, dm);
    // 已经是完整片源（low/high 有值）就别动，站点给的就是全长
    const hasFull = /"low"\s*:\s*"[^"]+"|"high"\s*:\s*"[^"]+"/.test(plain);
    const hasIntro = /"intro"\s*:\s*"[^"]+"/.test(plain);
    if (!av || !hasIntro || hasFull) return $done({});
    // VIP 片：只有 intro（11 段试看）→ 换成完整片源。
    // 只填 low，high/intro 置空，让 videoSrcCount 停在 1：
    //   播放器 setupSpriteThumbnails():
    //     count===1 → spriteThumbnails({url: previewList[6]})   单张图，一次请求
    //     count>1   → spriteThumbnails({urlArray: previewList}) 整组几十张图
    //   片越长图越多。CDN 每张首字节 0.6 秒、TARGETDURATION 6 秒一段，
    //   拖动时一张张拉图就是「长片快进特别卡」的来源。
    //   三个字段本来就指向同一个地址，playSrc 走
    //   urls[videoQuality] || low || high || intro，留 low 一样能播。
    //   代价：拖动预览帧退回单张图，时间点不再精确（播放在意度更低）。
    const u = "/__lt/" + av + ".m3u8?dm=" + dm;
    // 只在 urls 对象内部替换，避免误伤标题里出现的同名字段
    const ui = plain.indexOf('"urls"');
    if (ui < 0) return $done({});
    const lb = plain.indexOf("{", ui);
    if (lb < 0) return $done({});
    let depth = 0, rb = -1;
    for (let i = lb; i < plain.length; i++) {
      const c = plain.charAt(i);
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) { rb = i; break; } }
    }
    if (rb < 0) return $done({});
    const head = plain.slice(0, lb + 1);
    const mid = plain.slice(lb + 1, rb);
    const tail = plain.slice(rb);
    const newMid = mid
      .replace(/("low"\s*:\s*)"[^"]*"/, '$1"' + u + '"')
      .replace(/("high"\s*:\s*)"[^"]*"/, '$1""')
      .replace(/("intro"\s*:\s*)"[^"]*"/, '$1""');
    const np = head + newMid + tail;
    if (np === plain) return $done({});
    // 响应体长度变了，content-length 必须重算，否则会被截断
    const finish = () => {
      const key = API_KEY;
      const iv = utf8bytes(md5hex(vtag).slice(8, 24));
      // 注意：apiDecode 返回的是 byte string（每个 char 就是一个原始字节，
      // 0-255）。这里绝不能再用 utf8bytes——那会把所有高位字节二次编码，
      // 日文/中文标题直接变乱码。逐字节取 charCode 才是无损的。
      const bytesOf = (str) => {
        const b = [];
        for (let i = 0; i < str.length; i++) b.push(str.charCodeAt(i) & 255);
        return b;
      };
      const enc = cbcEncBytes(key, iv, bytesOf(np));
      let bin = "";
      for (let i = 0; i < enc.length; i++) bin += String.fromCharCode(enc[i]);
      const out = b64encode(bin);
      notifyOnce("info:" + av, "Lutube " + VER, "已接管 " + av, "试看 → 完整片源");
      const hdr = {};
      const src = $response.headers || {};
      for (const k in src) {
        const lk = String(k).toLowerCase();
        if (lk === "content-length" || lk === "content-encoding") continue;
        hdr[k] = src[k];
      }
      return $done({ status: 200, headers: hdr, body: out });
    };

    // 顺手抓站点试看列表的真实 EXTINF 缓存起来。
    // 各片分段时长不一样（6.000000 / 6.006000），写死会让长片累计偏几秒，
    // 拖动时预览帧就对不齐。首播多花一次小请求（约 8KB），之后走缓存。
    if (!sdGet(av)) {
      try {
        const tk = (($request.headers && ($request.headers["Authorization"] ||
          $request.headers["authorization"])) || "").replace(/^Bearer\s+/i, "");
        const oi = (plain.match(/"intro"\s*:\s*"([^"]+)"/) || [])[1];
        const origin = String(url).replace(/^([a-z]+:\/\/[^\/]+).*$/i, "$1").replace(/\/\/pwc-aws\./, "//web-aws.");
        if (oi && tk) {
          const pu = origin + oi + (oi.indexOf("?") >= 0 ? "&" : "?") + "token=" + tk;
          return qxFetch(pu).then((rr) => {
            const m2 = String(rr.text || "").match(/#EXTINF:([\d.]+)/);
            if (m2) sdSet(av, parseFloat(m2[1]));
            return finish();
          }).catch(() => finish());
        }
      } catch (e) {}
    }
    return finish();
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
    keyLineOf, ivOfKeyLine, uriOfKeyLine, apiDecode, cbcDecBytes, cbcEncBytes,
    utf8bytes, b64decode, b64encode, API_KEY };
}
