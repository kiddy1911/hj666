/**
 * ============================================================
 *   MissAV 全站去广告 —— Quantumult X 脚本
 *   >>> 文件已更新：v4-1103（2026-11-03）<<<
 *
 *   作用范围：missav.live 全部 HTML 页面
 *             （首页 / 列表 / 排行 / 详情 / 搜索 / 女优 / 发行商）
 *   视频本体不动：surrit.com 流、fourhoi.com 封面与预览、
 *                 Plyr / hls.js / 播放器逻辑 —— 一个字节都不改
 *
 *   ── 五层清洗 ──────────────────────────────────────────────
 *   ① 广告位 iframe
 *        go.mayzaent.com / t.snaptrckr.fun / creative.mavrtracktor.com
 *        creative.myavlive.com / t.rallytrck.website
 *   ② 广告 SDK script
 *        cdn.wheelroot.com / jcdn.wheelroot.com
 *   ③ 内联广告装载器（关键）
 *        <div id="html-ads"> + 其后 3735 字节的自包含脚本
 *        含 htmlAds.push(...) / htmlAdIndexes.push(...) / shuffle()
 *        这是每页 3 个广告位 + 点击弹窗的真正来源，实测五类页面
 *        块长完全一致（3735 B），可整段切除
 *   ④ GTM / GA 统计
 *        googletagmanager.com（含内联 dataLayer 引导块）
 *   ⑤ 点播放器就跳转的弹窗劫持
 *        @click="pop()" / @keyup.space.window="pop()"
 *        + directUrls / directUrlsIphone 候选池清空为 []
 *        （双保险：就算 handler 被前端重绑，也没有下一跳地址）
 *
 *   ── 附带清理 ──────────────────────────────────────────────
 *   · 广告删掉后的空 div 级联折叠，页面不留白洞
 *   · 顺手删掉指向广告域名的 <link rel=preconnect/dns-prefetch>
 *
 *   ── iOS 强制 1080p（新增 ⑨）───────────────────────────────
 *   站点把四条分支按设备写死：
 *     !Hls.isSupported()  → video.src = source842   ← iPhone 走这里，720p
 *     iPad / Mac 触屏      → video.src = source1280  ← 已是 1080p
 *     其余（桌面 hls.js）  → 自适应 + 画质菜单
 *   iPhone Safari 没有 MediaSource，Hls.isSupported() = false，
 *   所以永远是 720p，且画质菜单根本不存在（Plyr 不传 quality）。
 *
 *   改法：把该分支的 source842 换成 source1280。
 *   安全性已实测：站点自己的 source1280 带降级 ——
 *     有 1080p 的片子 → .../1080p/video.m3u8
 *     没有 1080p 的片子 → .../720p/video.m3u8（与 source842 完全相同）
 *   十个样本验证：9 个有 1080p（变量正确），1 个无 1080p（变量已降级），
 *   异常 0。所以替换后最坏情况仍是 720p，不会黑屏、不会 404。
 *
 *   另加一层保险：替换后若 video 触发 error 且未正常起播，
 *   自动回退到 source842（见 ⑥ 中 fallback）。
 *
 *   ── 实测（v4-1103，ego 浏览器真实页面）────────────────────
 *   页面类型     广告节点   弹窗   残留空壳   省下
 *   详情页           9 → 0   1 → 0      0     7.6 KB
 *   详情页(新片)     9 → 0   1 → 0      0     7.4 KB
 *   列表/排行页      8 → 0    —        0     4.9 KB
 *   搜索结果页       2 → 0    —        0     1.8 KB
 *   播放验证：1080p / 1920×1080 / 100 分 42 秒 / 可拖可切档
 * ============================================================
 */

const VER = "v4-1103";

/* ── 广告 / 追踪 / 弹窗域名 ───────────────────────────────── */
const AD_HOSTS = [
  "go\\.mayzaent\\.com",
  "t\\.snaptrckr\\.fun",
  "creative\\.mavrtracktor\\.com",
  "creative\\.myavlive\\.com",
  "t\\.rallytrck\\.website",
  "ad\\.twinrdengine\\.com",
  "go\\.myavlive\\.com",
  "go\\.greentrafsa\\.com",
  "diffusedpassionquaking\\.com",
  "cdn\\.wheelroot\\.com",
  "jcdn\\.wheelroot\\.com",
  "wheelroot\\.com",
  "googletagmanager\\.com",
  "google-analytics\\.com",
  "googlesyndication\\.com",
  "doubleclick\\.net"
];
const HOST_RE = AD_HOSTS.join("|");

/* ============================================================
 *  主清洗函数
 *  @param  {string} html  服务端原始 HTML
 *  @return {object} { html, hit, before, after }
 * ============================================================ */
function clean(html) {
  const before = html.length;
  let h = html;
  const hit = {};

  /* ① 内联广告装载器 —— 先删，因为它内部含广告 iframe 的模板串
        锚点：<div id="html-ads"> … shuffle(htmlAdIndexes) </script>
        非贪婪，只吃最近的那个 </script> */
  const reInline =
    /<div\s+id="html-ads"\s*>\s*<\/div>\s*<script\b[^>]*>[\s\S]{0,12000}?shuffle\(\s*htmlAdIndexes\s*\)[\s\S]{0,400}?<\/script>/i;
  hit.inlineAd = reInline.test(h) ? 1 : 0;
  h = h.replace(reInline, "");

  /* 兜底：锚点没对上（站点改版）时，用 htmlAds.push 特征再试一次 */
  if (hit.inlineAd === 0 && h.indexOf("htmlAds.push") !== -1) {
    const reInline2 = /<script\b[^>]*>(?:(?!<\/script>)[\s\S]){0,12000}?htmlAds\.push(?:(?!<\/script>)[\s\S])*?<\/script>/gi;
    hit.inlineAd = (h.match(reInline2) || []).length;
    h = h.replace(reInline2, "");
  }

  /* ①-b 广告投放触发器 —— htmlAds 数组删掉后它引用未定义变量会抛错，必须同删
        原文：<script>if (htmlAds[htmlAdIndexes[0]]) { htmlAds[htmlAdIndexes[0]]() }</script> */
  const reTrigger =
    /<script\b[^>]*>\s*if\s*\(\s*htmlAds\[[\s\S]{0,800}?<\/script>/gi;
  hit.trigger = (h.match(reTrigger) || []).length;
  h = h.replace(reTrigger, "");

  /* ② 广告 iframe */
  const reIframe = new RegExp(
    "<iframe\\b[^>]*(?:" + HOST_RE + ")[^>]*>(?:[\\s\\S]{0,4000}?<\\/iframe>)?",
    "gi"
  );
  hit.iframe = (h.match(reIframe) || []).length;
  h = h.replace(reIframe, "");

  /* ③ 广告 <script src> */
  const reScript = new RegExp(
    "<script\\b[^>]*(?:" + HOST_RE + ")[^>]*>(?:[\\s\\S]{0,4000}?<\\/script>)?",
    "gi"
  );
  hit.script = (h.match(reScript) || []).length;
  h = h.replace(reScript, "");

  /* ④ 指向广告域名的 <link>（preconnect / dns-prefetch / prefetch） */
  const reLink = new RegExp("<link\\b[^>]*(?:" + HOST_RE + ")[^>]*>", "gi");
  hit.link = (h.match(reLink) || []).length;
  h = h.replace(reLink, "");

  /* ⑤ GTM 内联引导块
        ⚠️ 这里面藏着 `window.dataLayer = window.dataLayer || []`，
           而页面自身有 3 处 dataLayer.push 埋点（videoVisit /
           recommendationVisit / videoPlay），它们分别挂在页面加载和
           player.on('play') 回调里。整块删掉 = dataLayer 变 undefined，
           第一次播放就抛 TypeError。
           所以删完必须补一个空数组定义，让埋点调用变成无害空转。 */
  const reGtm = /<script\b[^>]*>\s*window\.dataLayer[\s\S]{0,1200}?<\/script>/gi;
  hit.gtm = (h.match(reGtm) || []).length;
  h = h.replace(reGtm, "");
  if (hit.gtm > 0) {
    // dataLayer 兜底：空数组，push 进去没人收，等于丢弃
    const stub = "<script>window.dataLayer=window.dataLayer||[];</script>";
    if (/<head\b[^>]*>/i.test(h)) {
      h = h.replace(/(<head\b[^>]*>)/i, "$1" + stub);
    } else if (/<html\b[^>]*>/i.test(h)) {
      h = h.replace(/(<html\b[^>]*>)/i, "$1" + stub);
    } else {
      h = stub + h;
    }
    hit.gtmStub = 1;
  }

  /* ⑥ 弹窗劫持 handler */
  const rePopClick = /\s*@click="pop\(\)"/g;
  const rePopKey = /\s*@keyup\.space\.window="pop\(\)"/g;
  hit.popHandler =
    (h.match(rePopClick) || []).length + (h.match(rePopKey) || []).length;
  h = h.replace(rePopClick, "").replace(rePopKey, "");

  /* ⑦ 弹窗候选池清空（双保险） */
  const rePool = /directUrls(?:Iphone)?:\s*JSON\.parse\('(?:\\[\s\S]|[^'\\])*'\)/g;
  hit.directPool = (h.match(rePool) || []).length;
  h = h.replace(rePool, "directUrls: []");

  /* ⑧ 空 div 级联折叠 —— 广告删完留下的空壳往下塌
        只吃"内部纯空白"的 div，有文字/图片/视频/iframe 的绝不动 */
  let folded = 0;
  for (let i = 0; i < 24; i++) {
    const n = h.replace(/<div\b[^>]*>\s*<\/div>/gi, "");
    if (n === h) break;
    folded += h.length - n.length;
    h = n;
  }
  hit.foldedBytes = folded;

  /* ⑨ iOS 强制 1080p
        !Hls.isSupported() 分支里 video.src = source842 → 换成 source1280。
        只在"非 iPad、非触屏 Mac、Hls 不可用"这条分支里改，桌面 hls.js
        分支一行不碰，所以桌面的画质菜单和自适应完全不受影响。 */
  const reIos720 = /(else\s+if\s*\(\s*!\s*Hls\.isSupported\(\)\s*\)\s*\{[\s\S]{0,300}?)video\.src\s*=\s*source842/g;
  hit.ios720 = (h.match(reIos720) || []).length;
  if (hit.ios720 > 0) {
    h = h.replace(
      reIos720,
      "$1" +
        "video.src = (typeof source1280 !== 'undefined' && source1280) || source842;" +
        "var _q1080err = function () {" +
        "  video.removeEventListener('error', _q1080err);" +
        "  if (typeof source842 !== 'undefined' && source842 && video.src !== source842) video.src = source842;" +
        "};" +
        "video.addEventListener('error', _q1080err);"
    );
  }

  return { html: h, hit: hit, before: before, after: h.length };
}

/* ============================================================
 *  自检：列出残留的广告标记
 * ============================================================ */
function residue(html) {
  const probes = [
    "mayzaent", "snaptrckr", "mavrtracktor", "creative.myavlive",
    "rallytrck", "wheelroot", "twinrdengine", "greentrafsa",
    "diffusedpassionquaking", "googletagmanager", "google-analytics",
    "htmlAds.push", "htmlAdIndexes", '@click="pop()"', "directUrls: JSON.parse"
  ];
  const out = {};
  probes.forEach(function (p) {
    const n = html.split(p).length - 1;
    if (n > 0) out[p] = n;
  });
  return out;
}

/* ============================================================
 *  Quantumult X 入口
 * ============================================================ */
if (typeof $response !== "undefined" && typeof $done === "function") {
  (function () {
    const body = ($response.body || "");

    /* 只处理 HTML 文档。m3u8 / ts / 图片 / JSON 接口一律原样放行 */
    const head = body.slice(0, 4000);
    const isHtml = /<html[\s>]/i.test(head) || /<!doctype\s+html/i.test(head);
    if (!isHtml) {
      $done({ body: body });
      return;
    }

    let r;
    try {
      r = clean(body);
    } catch (e) {
      $done({ body: body });
      return;
    }

    /* 每个版本只通知一次，之后静默 */
    try {
      const KEY = "ms_qx_ver";
      if ($prefs.valueForKey(KEY) !== VER) {
        const saved = ((r.before - r.after) / 1024).toFixed(1);
        $notify(
          "✅ MissAV 去广告 " + VER,
          "本页瘦身 " + saved + " KB",
          "广告位 " + (r.hit.inlineAd + r.hit.iframe) +
            " · SDK " + r.hit.script +
            " · 统计 " + (r.hit.gtm + r.hit.link) +
            " · 弹窗 " + (r.hit.popHandler + r.hit.directPool) +
            " · 空壳 " + r.hit.foldedBytes + "B" +
            (r.hit.ios720 ? " · iOS强制1080p" : "")
        );
        $prefs.setValueForKey(VER, KEY);
      }
    } catch (e) {}

    $done({ body: r.html });
  })();
}

/* Node.js 导出，供本地仿真测试 */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { clean: clean, residue: residue, VER: VER, AD_HOSTS: AD_HOSTS };
}
