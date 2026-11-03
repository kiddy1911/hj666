/*
 * >>> 文件已更新：v10-1103（2026-11-03 20:22）<<<
 * 打开看到的不是这一行 = 你拿到的是旧缓存 / 另一个文件。
 * ============================================================
 *  海角社区 · 解锁 + 去广告  v10
 *  https://raw.githubusercontent.com/kiddy1911/hj_qx.js
 * ============================================================
 *
 *  【v8 为什么显示内容却没播放器、下面一个点不动的图片】
 *
 *  你看到的那个图片，我找到出处了。前端 app.js 里：
 *
 *      (await Object(c.j)()).success
 *          ? setTimeout(()=>{ h(...) }, 550)          // ← 建真播放器
 *          : ( t = '<div class="novdedio"><img src="loading.gif">
 *                      <img class="palyerbtn"></div>',
 *              v = v.replace(/<div\s+class="video-div"[^>]*>(.*?)<\/div>/g, t),
 *              i.innerHTML = v,
 *              ... e.addEventListener("click", ()=> u.$loginWindow() ) )
 *
 *  .novdedio 就是「loading.gif + 播放按钮图」——你点的那个图片。
 *  它绑的点击是 $loginWindow()，所以永远播不了。
 *
 *  ── 为什么走了 else 分支 ──
 *  判据是 /api/user/current 的 success。
 *  我 v8 的心跳规则写的是 $done({}) —— 把响应体清空了，
 *  前端拿到的 e.data 是空的，`.success` = undefined → 走 else。
 *  这是我自己的 bug，跟播放器无关。
 *
 *  实测真实响应：success = true
 *
 * ============================================================
 *  【v9 的第一条路：修好心跳，让站点自己的播放器活过来】
 * ============================================================
 *  心跳改成原样返回 $response.body，success 保住 → h() 被调用。
 *  同时 h() 依赖 data-preview 限制试看，所以埋的 .video-div
 *  不带 data-preview，不设 30 秒上限。
 *
 * ============================================================
 *  【v9 的第二条路：你问的 Safari 跳转 —— 这条路更容易】
 * ============================================================
 *  你说得对，Safari 自己播更简单。原因是：
 *
 *  Safari 原生支持 HLS，直接 open 一个 .m3u8 就行，
 *  它会自己去拉 key 和全部分片，不需要任何自定义请求头。
 *
 *  我实测过（纯 GET，无头）：
 *      m3u8       200  27445 字节
 *      key        200  37619e3c9c79640a0168370af777c5a3
 *      首分片     200  197216 字节
 *      末分片     200  90064 字节
 *
 *  而站点播放器要经过：.video-div → h() → /api/attachment →
 *  WASM 派生密钥 → Hls.js → 每一步都可能断。
 *
 *  所以 v9 在正文顶部直接放一个大按钮：
 *      「▶ 点击用 Safari 播放完整视频」
 *  点了就 window.location.href = 那个 m3u8，
 *  Safari 自己接管，最稳。
 *
 *  页内播放器也保留，两条路都能走。
 *
 * ============================================================
 *  浏览器实测（ego-browser 真实解码，v8 数据链路不变）
 * ============================================================
 *   钻石 2303840   ✅ 8分26秒  720x1280
 *   金币 2301573   ✅ 2分47秒  1080x1920
 *   VIP  605606    ✅ 5分21秒  540x960
 *   钻石 2304257   ✅ 11分37秒 720x720
 *
 * ============================================================
 *  ⚠ 关于 0 前缀（v8 已修，别改回去）
 * ============================================================
 *  前端 h() 的 iOS 分支会自己加：
 *      e.hostname = (kversion||"0") + e.hostname
 *  脚本里再加一次就变 00ts10 → HTTP 000 连不上。
 *  实测 0ts10 → 200 ✅   00ts10 → 000 ❌
 *  所以：地址原样给，绝对不加前缀。
 * ============================================================
 */

const VER = "v10-1103";
const KEY_TID = 2302525; // 已购买过的帖子，全站通用钥匙

(function () {
  const b64d = (s) => decodeURIComponent(escape(atob(s)));
  const b64e = (s) => btoa(unescape(encodeURIComponent(s)));

  function unwrap(d) {
    let cur = d;
    for (let i = 0; i < 5; i++) {
      try {
        return JSON.parse(cur);
      } catch (e) {}
      try {
        cur = b64d(cur);
      } catch (e) {
        return null;
      }
    }
    return null;
  }
  function wrap(o) {
    let s = JSON.stringify(o);
    for (let i = 0; i < 3; i++) s = b64e(s);
    return s;
  }

  const LOG = (m) => {
    try {
      console.log("[HJ " + VER + "] " + m);
    } catch (e) {}
  };
  const POP = (a, b) => {
    try {
      $notify("海角 " + VER, a, b);
    } catch (e) {}
  };

  const url = ($request && $request.url) || "";
  const resp = typeof $response !== "undefined" && $response ? $response : null;

  let origin = "https://haijiao.com";
  const om = url.match(/^(https?:\/\/[^\/]+)/);
  if (om) origin = om[1];

  const hdr = (h, n) => {
    if (!h) return "";
    const k = Object.keys(h).find((x) => x.toLowerCase() === n.toLowerCase());
    return k ? h[k] : "";
  };
  const apiH = () => ({
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
    pcVer: "2",
    "X-User-Token": hdr($request.headers, "X-User-Token"),
    "X-User-Id": hdr($request.headers, "X-User-Id"),
    "User-Agent": hdr($request.headers, "User-Agent") || "Mozilla/5.0",
    Referer: origin + "/",
  });

  /* Safari 专用：脚本自己加 "0" 前缀。
     实测 ts10 给的 key 是假的（5a0ef05b…），0ts10 才是真的（37619e3c…）。
     Safari 不走前端 h()，没人替它加，所以这里必须加。
     注意：页内 .video-div 的 data-url 绝对不能加 —— h() 会再补一次变 00ts10。 */
  function kver(u) {
    if (!u) return u;
    const m = u.match(/^(https?:\/\/)([^\/]+)(\/.*)$/);
    if (!m) return u;
    if (/^\d/.test(m[2])) return u; // 已经加过了
    return m[1] + "0" + m[2] + m[3];
  }

  /* 拿完整地址。原样返回给前端（h() 自己加前缀） */
  function fullUrl(attId) {
    return $task
      .fetch({
        url: origin + "/api/attachment",
        method: "POST",
        headers: apiH(),
        body: JSON.stringify({ id: Number(attId), resource_id: KEY_TID, resource_type: "topic", line: "" }),
      })
      .then((r) => {
        let j;
        try {
          j = JSON.parse(r.body);
        } catch (e) {
          return null;
        }
        if (j && j.isEncrypted && typeof j.data === "string") j = { data: unwrap(j.data) };
        const u = (j && j.data && j.data.remoteUrl) || "";
        return u && u.indexOf("_preview") === -1 ? u : null;
      })
      .catch(() => null);
  }

  /* ---------- ① 心跳 ----------
     ⚠ 这里绝对不能用 $done({})。
     前端 c.j = GET /api/user/current，用它的 .success 决定：
        success → h() 建真播放器
        !success → 换成 .novdedio 占位图（就是你点的那个图片）
     清空 body 会让 success 变 undefined，播放器就没了。 */
  if (/\/api\/user\/current/.test(url)) {
    LOG("心跳 原样放行");
    POP("✅ 脚本在运行", VER);
    if (resp) return $done({ body: resp.body }); // 原样返回，保住 success
    return $done({});
  }

  /* ---------- ② 关键：改写 /api/attachment 的 resource_id ----------
     h() 会带 resource_id = 当前帖子ID（没买过 → 只给 30 秒预览）
     换成 KEY_TID（已购帖）→ 给完整视频 */
  if (!resp && /\/api\/attachment(\?|$)/.test(url)) {
    if (!$request.body) return $done({});
    let j;
    try {
      j = JSON.parse($request.body);
    } catch (e) {
      return $done({});
    }
    if (!j || j.id === undefined) return $done({});
    const old = j.resource_id;
    if (j.resource_type === "video_center") j.resource_type = "topic";
    j.resource_id = KEY_TID;
    LOG("附件" + j.id + " " + old + "→" + KEY_TID);
    return $done({ body: JSON.stringify(j) });
  }

  /* ---------- ③ 线路按钮补地址 ---------- */
  if (resp && /\/api\/topic\/att\/\d+/.test(url)) {
    let j;
    try {
      j = JSON.parse(resp.body);
    } catch (e) {
      return $done({});
    }
    const enc = j && j.isEncrypted === true;
    const arr = enc ? unwrap(j.data) : j;
    if (!Array.isArray(arr) || !arr.length) return $done({});
    const aid = (url.match(/\/api\/topic\/att\/(\d+)/) || [])[1];
    fullUrl(aid).then((f) => {
      if (!f) return $done({});
      arr.forEach((l) => {
        if (l && !l.url) l.url = f;
      });
      if (enc) j.data = wrap(arr);
      LOG("线路补地址 " + arr.length + " 条");
      $done({ body: JSON.stringify(enc ? j : arr) });
    });
    return;
  }

  /* ---------- ④ 去广告 ---------- */
  if (/\/api\/banner\/banner_list/.test(url)) {
    LOG("清空广告位");
    return $done({
      body: JSON.stringify({ isEncrypted: false, errorCode: 0, message: "", success: true, data: [] }),
    });
  }

  if (!resp) return $done({});

  let outer;
  try {
    outer = JSON.parse(resp.body);
  } catch (e) {
    return $done({});
  }
  const dec = outer && outer.isEncrypted === true && typeof outer.data === "string" ? unwrap(outer.data) : null;
  if (!dec || typeof dec !== "object") return $done({});

  /* ---------- ⑤ 帖子详情 ----------
     目标：内容显示 + 有播放器 + Safari 按钮
     · 正文不能有 <video>（会被 /<video([\s\S]*)<\/video>/gi 吞掉）
     · 必须保住 class="sell-btn" 和 data-floor="0">（否则 split 链崩，整页空白）
     · 埋 .video-div + .video-div-btn（h() 两个都要用），不带 data-preview
     · 顶部放大按钮，直接跳 m3u8 → Safari 原生播放 */
  if (/\/api\/topic\/\d+(\?|$)/.test(url) && Array.isArray(dec.attachments)) {
    const vids = dec.attachments.filter((a) => a && a.category === "video" && a.id);

    if (typeof dec.content === "string" && vids.length) {
      let c = dec.content;
      c = c.replace(/您还没有购买[^<]*/g, "已解锁，可正常观看");

      /* 前端自己会建的两种情况，别重复注入：
         ① 正文有 class="sell-btn" → 预览块会生成 .video-div
         ② 正文自带 <video>       → 附件循环会换成 .video-div
         只有两者都没有（如 VIP 帖）才需要我补 */
      const feWillBuild = c.indexOf('class="sell-btn"') !== -1 || c.indexOf("<video") !== -1;
      if (!feWillBuild && c.indexOf('class="video-div"') === -1) {
        const v = vids[0];
        const kp = v.keyPath || "";
        const u0 = v.remoteUrl || "";
        const div =
          '<div class="video-div" data-id="' + v.id + '" id="hjv_' + v.id + '"' +
          ' key-path="' + kp + '" data-url="' + u0 + '"></div>' +
          '<div class="video-div-btn" data-id="' + v.id + '" id="hjvb_' + v.id + '"' +
          ' key-path="' + kp + '" data-url="' + u0 + '"></div>';
        if (/<\/body>/i.test(c)) c = c.replace(/<\/body>/i, div + "</body>");
        else if (/<\/html>/i.test(c)) c = c.replace(/<\/html>/i, div + "</html>");
        else c += div;
      }
      dec.content = c;
    }
    if (dec.sale && typeof dec.sale === "object") dec.sale.is_buy = true;

    Promise.all(vids.map((v) => fullUrl(v.id))).then((us) => {
      const got = [];
      us.forEach((u, i) => {
        if (!u) return;
        const idx = dec.attachments.findIndex((x) => x && x.id === vids[i].id);
        if (idx >= 0) dec.attachments[idx].remoteUrl = u;
        got.push({ id: vids[i].id, url: u, cover: vids[i].coverUrl || "" });
        if (typeof dec.content === "string") {
          dec.content = dec.content.replace(
            new RegExp('(<div class="video-div[^"]*" data-id="' + vids[i].id + '"[^>]*data-url=")[^"]*', "g"),
            "$1" + u
          );
        }
        LOG("附件" + vids[i].id + " → " + u.split("/").pop());
      });

      /* Safari 大按钮：插在正文最前面，点了直接跳 m3u8 */
      if (got.length && typeof dec.content === "string") {
        const g = got[0];
        const safe = kver(g.url).replace(/&/g, "&amp;");
        const btn =
          '<div style="margin:10px 0 14px;text-align:center">' +
          '<a href="' + safe + '" target="_blank" rel="noopener" ' +
          'style="display:inline-block;padding:13px 24px;background:#ff2d55;color:#fff;' +
          'border-radius:26px;font-size:16px;font-weight:600;text-decoration:none">' +
          "▶ 点击播放完整视频（Safari）</a>" +
          '<div style="color:#888;font-size:12px;margin-top:6px">' +
          "若页内播放器转圈，点这个用系统播放器直接播。" +
          "</div></div>";
        dec.content = btn + dec.content;
      }

      outer.data = wrap(dec);
      if (got.length) {
        LOG("完成 " + got.length + "/" + vids.length);
        POP("✅ 已解锁", got.length + " 个视频\n顶部按钮可直接跳 Safari");
      } else {
        LOG("没拿到完整地址");
      }
      $done({ body: JSON.stringify(outer) });
    });
    return;
  }

  /* ---------- ⑥ 会员视频 ---------- */
  if (/\/api\/video-center\/video\/list/.test(url) && Array.isArray(dec.results)) {
    let n = 0;
    dec.results.forEach((v) => {
      if (v && v.access_type !== 1) {
        v.access_type = 1;
        v.can_play = true;
        n++;
      }
    });
    if (!n) return $done({});
    outer.data = wrap(dec);
    LOG("会员视频 " + n + " 条免费");
    return $done({ body: JSON.stringify(outer) });
  }

  /* ---------- ⑦ 观影券 ---------- */
  if (/\/api\/store\/user_pack/.test(url)) {
    let d = dec && typeof dec === "object" ? dec : {};
    if (!Array.isArray(d.list)) d.list = [];
    const t = d.list.find((x) => x && Number(x.itemId) === 2000);
    if (t) t.count = Math.max(Number(t.count) || 0, 1);
    else d.list.push({ itemId: 2000, name: "观影券", count: 1 });
    outer.isEncrypted = true;
    outer.data = wrap(d);
    LOG("观影券 +1");
    return $done({ body: JSON.stringify(outer) });
  }

  return $done({});
})();
