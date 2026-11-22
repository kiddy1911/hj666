/**
 * Lutube 在线版 —— 解锁 VIP + 全站去广告
 * 目标：web-aws.*  （Lutube 在线版 / 轻量版 H5）
 * 版本：v1-1122
 */

const VER = "v1-1122";

/* ============================================================
 *  注入到 HTML 的钩子
 * ============================================================ */
const HOOK = [
  '<script>(function(){',
  'if(window.__ltPatched)return;window.__ltPatched=1;',
  'var _p=JSON.parse;',
  'function has(o,k){return o&&typeof o==="object"&&Object.prototype.hasOwnProperty.call(o,k);}',
  'var AK=["player_fullad","menu_long","menu_short","float_long_0","float_short_0","payment_float","game_ad","game_banner","long_recommend","short_recommend","ai_video_player"];',
  'function isAd(d){if(!d||typeof d!=="object"||Array.isArray(d))return false;for(var i=0;i<AK.length;i++){if(has(d,AK[i]))return true;}return false;}',
  'function adish(v){',
  'if(!v||typeof v!=="object"||Array.isArray(v))return false;',
  'if(v.content_type==="ad")return true;',
  'if(typeof v.ad_link_url==="string"&&v.ad_link_url)return true;',
  'if(v.content&&typeof v.content==="object"&&v.content.content_type==="ad")return true;',
  'return false;}',
  'function scrub(o,d){',
  'if(!o||typeof o!=="object"||d>10)return o;',
  'if(Array.isArray(o)){',
  'for(var i=o.length-1;i>=0;i--){if(adish(o[i]))o.splice(i,1);else scrub(o[i],d+1);}',
  'return o;}',
  'if(o.content_type==="ad"){o.data=[];o.content_type="long_video";return o;}',
  'for(var k in o){if(Object.prototype.hasOwnProperty.call(o,k))scrub(o[k],d+1);}',
  'return o;}',
  'function vip(d){',
  'if(!has(d,"is_vip"))return false;',
  'd.is_vip=true;d.expiry=4102415999;',
  'd.email=d.email||"vip@local";d.phone=d.phone||"13800000000";',
  'if(!d.points||d.points<1)d.points=99999;',
  'd.ad={};',
  'if(!d.custom||typeof d.custom!=="object")d.custom={};',
  'd.custom.level=1;d.custom.expiry=4102415999;',
  'return true;}',
  'function app(r){',
  'if(!r||typeof r!=="object")return false;',
  'if(!(r.pwa||r.h5||r.ios||r.light||r.ad))return false;',
  'if(r.ad&&typeof r.ad==="object"){r.ad.cover_display=false;r.ad.cover_image="";r.ad.cover_link="";}',
  'r.player_top_free_text={cn:"",tw:""};',
  'r.player_mid_free_text={cn:"",tw:""};',
  'var ks=["h5","ios","light","android"];',
  'for(var i=0;i<ks.length;i++){var b=r[ks[i]];if(b&&typeof b==="object"){',
  'b.player_timeline=0;b.player_all_ad_ctime=0;b.player_ctime=0;b.live_url="";b.live_title="";}}',
  'if(r.pwa&&typeof r.pwa==="object"){',
  'if(r.pwa.game_button)r.pwa.game_button.status=false;',
  'if(r.pwa.float_button)r.pwa.float_button.status=false;}',
  'if(r.statsig&&typeof r.statsig==="object")r.statsig.track=false;',
  'return true;}',
  'JSON.parse=function(s,rev){',
  'var o=_p(s,rev);',
  'try{',
  'if(o&&typeof o==="object"){',
  'if(has(o,"response")){app(o.response);}',
  'else if(has(o,"data")){if(!vip(o.data)&&isAd(o.data))o.data={};}',
  'scrub(o,0);',
  '}',
  '}catch(e){}',
  'return o;};',
  '})();</script>',
].join("");

/* ============================================================
 *  HTML 清洗
 * ============================================================ */
function clean(html) {
  const hit = { gtm: 0, ns: 0, dl: 0, inject: 0 };
  let h = String(html || "");

  // ① GTM 加载器（整段 IIFE）
  const reGtm = /<script>\(function\s*\(w,\s*d,\s*s,\s*l,\s*i\)[\s\S]*?\}\)\(window,\s*document,\s*"script",\s*"dataLayer",\s*"GTM-[A-Z0-9]+"\);\s*<\/script>/;
  if (reGtm.test(h)) { hit.gtm = 1; h = h.replace(reGtm, ""); }

  // ② <noscript> 里的 GTM iframe
  const reNs = /<noscript><iframe\s+src="https:\/\/www\.googletagmanager\.com\/ns\.html[^"]*"[\s\S]*?<\/iframe><\/noscript>/;
  if (reNs.test(h)) { hit.ns = 1; h = h.replace(reNs, ""); }

  // ③ dataLayer 保留数组形态但吞掉 push（GTM 已删，这层是兜底）
  const reDl = /const\s+dataLayer\s*=\s*window\.dataLayer\s*\|\|\s*\[\s*\]\s*;/;
  if (reDl.test(h)) {
    hit.dl = 1;
    h = h.replace(reDl, 'const dataLayer = window.dataLayer = []; dataLayer.push = function () {};');
  }

  // ④ 兜底：开屏广告容器直接隐藏
  h = h.replace("</head>", '<style>.ga-splash-ad{display:none!important}</style></head>');

  // ⑤ 注入 JSON.parse 钩子 —— 必须在 module 主包之前
  const anchor = /<script\s+type="module"/;
  if (anchor.test(h)) {
    hit.inject = 1;
    h = h.replace(anchor, HOOK + '<script type="module"');
  }

  return { html: h, hit };
}

/* ============================================================
 *  QX 入口 —— 只在 QX 环境（存在 $done）里执行
 * ============================================================ */
function main() {
  try {
    const body = ($response && $response.body) || "";
    if (!body) return $done({});

    const head = body.slice(0, 512).toLowerCase();
    if (!(head.indexOf("<!doctype html") >= 0 || head.indexOf("<html") >= 0)) {
      return $done({}); // 非文档，原样放行
    }

    const r = clean(body);
    const out = { body: r.html };

    if (typeof $notify === "function" && r.hit.inject === 1) {
      $notify(
        "Lutube " + VER,
        "VIP 已解锁 · 广告已清",
        "GTM:" + r.hit.gtm + " · dataLayer:" + r.hit.dl + " · 注入:" + r.hit.inject
      );
    }
    return $done(out);
  } catch (e) {
    try { $done({}); } catch (_) {}
  }
}

if (typeof $done === "function") main();

/* Node 调试用 */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { clean, VER, HOOK };
}
