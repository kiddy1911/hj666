/**
 * 爱威奶（avnight）—— 解锁 VIP 播放 + 全站去广告
 * 入口：https://a5esf.xfqatj.com/    （PWA av9，Vue + video.js/VHS 3.17.2）
 * 静态资源：g.uymbc.com/pwa_av9     接口前缀：vw3
 * 版本：v1-0001
 *
 * ══ 门槛在哪 ══════════════════════════════════════════════
 * 非 VIP 访客请求 video/{code}/info?cdn=c 时服务端返回：
 *   sources["240"] = ""        全长流被服务端置空
 *   sources["480"] = ""        VIP 专有，换 cdn 线路也不给
 *   sources.intro  = <62 秒试看 m3u8>
 *   privileged     = false
 * 前端 resolveVideoAccessState 里 isIntro 的判据是 n = !!sources.intro，
 * 于是 isIntro = isAuth（只要有 token 就走试看）。把 intro 置空、240 填上，
 * isIntro 变 false，setSrcLine 直接播全长。
 *
 * ══ 全长从哪来（两条互补，实测）══════════════════════════
 * ① sources.deepMosaics：AI 去码版，HEVC 约 1.5 Mbps，免费下发且是全长。
 *    SNOS-334 958 段、DLDSS-560 784 段、ATID-705 823 段，
 *    首末段 AES 解密后 TS 同步率均为 100%。
 * ② 同一个 info 请求追加 &free=T，sources["240"] 会变成全长 m3u8。
 *    SNOS-334 1595 段（432×234）。但只有部分片有这个权益。
 * 两者按片互补：有 deep 的往往没有 free 240，反之亦然。两条都试。
 *
 * 片段本身带 k/t 签名（cel.hscammq.com 无签名返回 403），不能像 Lutube
 * 那样自己拼段落，所以走服务端给的列表。key = md5(code) = 列表里的 IV。
 *
 * ══ 广告 ═════════════════════════════════════════════════
 * #fullscreenAD 是路由门禁：它不走完，SPA 一个子节点都不渲染。
 * 直接删 DOM 会让应用永久白屏，必须点它的关闭按钮；注入脚本要用完整
 * 指针事件序列（pointerdown/mousedown/pointerup/mouseup/click）才触发。
 * 营运公告 / VIP 弹窗 / 浮层属于纯遮挡，CSS 隐藏即可。
 */

const VER = "v1-0001";
const TAG = "爱威奶";

/* ---------------- 广告下发的图片域名（清配置后基本不会请求到） ------------- */
const AD_HOSTS = [
  "hlaops5.dgtsxx.com", "qlaops2.humenhd.com", "9qcl.sqhhu.com", "9hcl.sqhhu.com",
  "tlcl1.yjior.com", "stlcl-1.yjior.com", "hlcl1.bcwni.com", "shlcl-1.bcwni.com",
];

/* ---------------- 注进 HTML 的清理脚本 ---------------- */
const HOOK = `<style id="nq-css">#announce,#announce__bg,#pop__bg,.popFile.pop_container,#pop_user,.invite-pop{display:none!important}</style><script>(function(){if(window.__nqPatched)return;window.__nqPatched=1;var CSS="#announce,#announce__bg,#pop__bg,.popFile.pop_container,#pop_user,.invite-pop{display:none!important}";function tap(el){try{var r=el.getBoundingClientRect();var o={bubbles:true,cancelable:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2,pointerId:1,isPrimary:true,button:0};["pointerdown","mousedown","pointerup","mouseup","click"].forEach(function(t){var E=t.indexOf("pointer")===0?PointerEvent:MouseEvent;el.dispatchEvent(new E(t,o));});return true;}catch(e){return false;}}function root(){var a=document.getElementById("app");return a&&a.__vue__||null;}function auth(){try{var r=root();var s=r&&r.$store;if(s&&s.state&&s.state.auth&&!s.state.auth.isAuth)s.state.auth.isAuth=true;}catch(e){}}function adFull(){var ad=document.getElementById("fullscreenAD");if(!ad)return;var b=ad.querySelector(".icon-close-button")||document.getElementById("fullscreenAD__close");if(!b)return;ad.__nqT=(ad.__nqT||0)+1;if(ad.__nqT<=80)tap(b);}function adCover(){if(!document.getElementById("video_cover_ad__close"))return;var R=root();if(!R)return;(function walk(vm,d){if(!vm||d>14)return;if(vm.isShowVideoCoverAD===true&&typeof vm.closeVideoCoverAD==="function"){vm.__nqCv=(vm.__nqCv||0)+1;if(vm.__nqCv>60)return;try{vm.closeVideoCoverAD();}catch(e){}return;}(vm.$children||[]).forEach(function(c){walk(c,d+1);});})(R,0);}function css(){var h=document.head||document.documentElement;if(h&&!document.getElementById("nq-css")){var s=document.createElement("style");s.id="nq-css";s.textContent=CSS;h.appendChild(s);}}function tick(){auth();adFull();adCover();}var n=0;var iv=setInterval(function(){tick();if(++n>240)clearInterval(iv);},250);function boot(){css();tick();}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();try{new MutationObserver(function(){tick();}).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}})();</script>`;

/* ---------------- 工具 ---------------- */
const has = (o, k) => o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);

function qxFetch(url, method, headers) {
  const opt = { url, method: method || "GET", headers: headers || {} };
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

/* ---------------- 广告配置清理 ----------------
   配置项类型不一致（有的对象、有的数组），按原类型清空，避免前端报错。 */
const AD_FIELDS = [
  "BannerAD", "Banners", "IdentityADs", "JiugonggePopup", "JiugonggePopupCond",
  "LandingCarouselImage", "GlobalEntryAdvertisement", "VipGatePop",
  "ADHome", "Announce", "OpeningAnnouncement", "OperationAnnouncement",
  "BreastCoinProjectDiscountBanners", "TextAd", "ComicFullPageAd",
];

function cleanConfig(body) {
  let o;
  try { o = JSON.parse(body); } catch (e) { return null; }
  const d = o && o.data;
  if (!d || typeof d !== "object") return null;
  let hit = 0;
  for (const k of AD_FIELDS) {
    if (!has(d, k)) continue;
    const v = d[k];
    if (Array.isArray(v)) { if (v.length) hit++; d[k] = []; }
    else if (v && typeof v === "object") { if (Object.keys(v).length) hit++; d[k] = {}; }
    else { d[k] = Array.isArray(v) ? [] : {}; }
  }
  if (has(d, "EntryCPISwitch") && d.EntryCPISwitch !== false) { d.EntryCPISwitch = false; hit++; }
  if (has(d, "EntryCPIAllowSkip")) d.EntryCPIAllowSkip = true;
  if (has(d, "EntryCPIShowDelayTime")) d.EntryCPIShowDelayTime = 0;
  if (has(d, "AdShowTimes")) { d.AdShowTimes = 0; hit++; }
  return hit > 0 ? JSON.stringify(o) : null;
}

/* ---------------- 视频源解锁 ----------------
   优先级：deepMosaics（全高清去码）> 240（free=T 全长）> 原样。
   intro 一律置空，否则前端 isIntro=true 只播试看。 */
function applyUnlock(o, src240) {
  const v = o && o.video;
  if (!v) return false;
  if (!v.sources || typeof v.sources !== "object") v.sources = {};
  const s = v.sources;
  const deep = typeof s.deepMosaics === "string" ? s.deepMosaics : "";
  if (deep) s["240"] = deep;
  else if (src240) s["240"] = src240;
  if (!s["240"]) return false;
  // intro 必须清空：前端 isIntro 的判据就是 !!sources.intro
  s.intro = "";
  o.privileged = true;
  // resolveBlockRule 里 exclusive 会命中 vipExclusiveBlock（非 VIP 必拦）
  if (has(v, "exclusive")) v.exclusive = false;
  if (has(v, "restricted")) v.restricted = 0;
  // intro 清空后，奶币视频会命中 milkVideoBlock（该规则也看 sources.intro）
  const bc = v.breast_coin_video_info;
  if (bc && typeof bc === "object" && has(bc, "is_breast_coin_video")) bc.is_breast_coin_video = false;
  return true;
}

function unlockVideo(body, url, token) {
  let o;
  try { o = JSON.parse(body); } catch (e) { return null; }
  if (!o || !o.video) return null;
  // ① deepMosaics 直接可用，不需要额外请求
  if (applyUnlock(o, "")) return JSON.stringify(o);
  // ② 退回 free=T 拿全长 240
  if (!token) return null;
  const u = url + (url.indexOf("?") >= 0 ? "&" : "?") + "free=T";
  return qxFetch(u, "GET", { "Access-Token": "Bearer " + token }).then((r) => {
    if (!r.ok || !r.text) return null;
    let o2;
    try { o2 = JSON.parse(r.text); } catch (e) { return null; }
    const s2 = o2 && o2.video && o2.video.sources;
    if (!s2 || !s2["240"]) return null;
    if (!applyUnlock(o, s2["240"])) return null;
    // 保留服务端新签的其它源
    if (s2.deepMosaics) o.video.sources.deepMosaics = s2.deepMosaics;
    if (s2["480"]) o.video.sources["480"] = s2["480"];
    return JSON.stringify(o);
  }).catch(() => null);
}

/* ---------------- HTML 外壳 ---------------- */
function clean(html) {
  const hit = { inject: 0, isOurs: 0 };
  if (typeof html !== "string" || !html) return { html, hit };
  // 只处理本站，避免误伤别的页面
  if (html.indexOf("pwa_av9/js/app.") < 0) return { html, hit };
  hit.isOurs = 1;
  if (html.indexOf("__nqPatched") >= 0) return { html, hit };
  // 插在 <head> 开头：钩子要在 app bundle 之前把 isAuth 撑起来
  let out = html;
  const m = out.match(/<head[^>]*>/i);
  if (m) out = out.replace(m[0], m[0] + HOOK);
  else out = out.replace(/<\/head>/i, HOOK + "</head>");
  hit.inject = out !== html ? 1 : 0;
  return { html: out, hit };
}

/* ---------------- 入口 ---------------- */
function main() {
  const url = (typeof $request !== "undefined" && $request && $request.url) || "";
  const body = (typeof $response !== "undefined" && $response && $response.body) || "";
  if (!body) return $done({});

  // ① 视频源解锁
  if (/\/vw3\/video\/[^\/]+(\?|\/info)/.test(url)) {
    const hdr = ($request && $request.headers) || {};
    const rawTok = hdr["Access-Token"] || hdr["access-token"] || hdr["Access-token"] ||
      hdr["Authorization"] || hdr["authorization"] || "";
    const tok = String(rawTok).replace(/^Bearer\s+/i, "");
    const r = unlockVideo(body, url, tok);
    if (!r) return $done({});
    if (typeof r === "string") {
      if (typeof $notify === "function") $notify(TAG + " " + VER, "已解锁播放", "全长片源");
      return $done({ body: r });
    }
    return r.then((out) => {
      if (!out) return $done({});
      if (typeof $notify === "function") $notify(TAG + " " + VER, "已解锁播放", "全长片源");
      return $done({ body: out });
    });
  }

  // ② 广告配置清理
  if (/\/vw3\/(swift1|api_config)/.test(url)) {
    const out = cleanConfig(body);
    if (!out) return $done({});
    if (typeof $notify === "function") $notify(TAG + " " + VER, "已清广告配置", "Banner/弹窗/公告");
    return $done({ body: out });
  }

  // ③ HTML 外壳
  const head = body.slice(0, 1024).toLowerCase();
  if (!(head.indexOf("<!doctype html") >= 0 || head.indexOf("<html") >= 0)) return $done({});
  const r = clean(body);
  if (!r.hit.inject) return $done({});
  if (typeof $notify === "function") $notify(TAG + " " + VER, "已注入去广告", "全屏广告 + 公告 + 弹窗");
  return $done({ body: r.html });
}

if (typeof $done === "function") main();

/* Node 调试 */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { clean, cleanConfig, unlockVideo, applyUnlock, VER, HOOK, AD_FIELDS, AD_HOSTS };
}
