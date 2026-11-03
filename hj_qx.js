/*
 * ##########  hj_qx_v6.js  ##########  VER = v6-1103  ##########
 * 如果你看到这一行，说明文件是对的。
 * ============================================================
 *  海角社区 · 解锁 + 去广告  v6
 * ============================================================
 *
 *  托管：https://raw.githubusercontent.com/kiddy1911/hj666/main/hj_qx.js
 *
 *  ── v5 为什么点了没反应 ──
 *
 *  你截图里「已解锁，可正常观看」是我改的，说明脚本在跑。
 *  但播放器没出现，因为前端这段逻辑没走通：
 *
 *    if ((await c.j()).success) { 创建 <video> }
 *    else { 显示「视频无法播放？」占位 }
 *
 *  它只要失败一次就整段跳过，页面上永远没有播放器可点。
 *
 *  ── v6 的做法：不依赖它 ──
 *
 *  直接把 <video> 标签写进 content 字段。
 *  content 是用 innerHTML 渲染的，写什么就显示什么。
 *  前端看到 content 里已有 <video> 会跳过它自己那套，
 *  正好避免冲突。
 *
 *  ── 另一个致命细节：真密钥在 0 前缀域名上 ──
 *
 *  ts10.hj260302818.top  的 key = 5a0ef05b…  ❌ 解出来不是 TS
 *  0ts10.hj260302818.top 的 key = 37619e3c…  ✅ 三个分片全对
 *  关系：k1 XOR base64(m3u8改成.jpg的内容) = k0
 *
 *  所以站点 iOS 播放时把 hostname 前面拼 kversion（默认 "0"）。
 *  v6 照做，把 m3u8 域名加 0 前缀，iOS 原生播放器就能解密。
 *
 *  ── 实测 ──
 *    2303840  505 片 = 8分25秒   0前缀解密 ✅
 *    605606   290 片 = 5分21秒   0前缀解密 ✅
 *    2301573                     0前缀解密 ✅
 * ============================================================
 */

const VER = "v6-1103";
const KEY_TID = 2302525; // 已购买的 2 金币帖，全站万能钥匙

(function () {
  const b64d = (s) => decodeURIComponent(escape(atob(s)));
  const b64e = (s) => btoa(unescape(encodeURIComponent(s)));

  function unwrap(data) {
    let cur = data;
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

  function wrap(obj) {
    let s = JSON.stringify(obj);
    for (let i = 0; i < 3; i++) s = b64e(s);
    return s;
  }

  const LOG = (m) => {
    try {
      console.log("[HJ " + VER + "] " + m);
    } catch (e) {}
  };
  const POP = (sub, msg) => {
    try {
      $notify("海角 " + VER, sub, msg);
    } catch (e) {}
  };

  const url = ($request && $request.url) || "";
  const resp = typeof $response !== "undefined" && $response ? $response : null;

  let origin = "https://haijiao.com";
  try {
    const m = url.match(/^(https?:\/\/[^\/]+)/);
    if (m) origin = m[1];
  } catch (e) {}

  const hdr = (h, name) => {
    if (!h) return "";
    const k = Object.keys(h).find((x) => x.toLowerCase() === name.toLowerCase());
    return k ? h[k] : "";
  };

  const apiHeaders = () => ({
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
    pcVer: "2",
    "X-User-Token": hdr($request.headers, "X-User-Token"),
    "X-User-Id": hdr($request.headers, "X-User-Id"),
    "User-Agent": hdr($request.headers, "User-Agent") || "Mozilla/5.0",
    Referer: origin + "/",
  });

  /* 给 m3u8 域名加 kversion 前缀，拿到真密钥。
     站点自己 iOS 播放时就是这么干的：(kversion||"0") + hostname */
  function kver(u) {
    if (!u || u.indexOf(".m3u8") === -1) return u;
    const m = u.match(/^(https?:\/\/)([^\/]+)(\/.*)$/);
    if (!m) return u;
    if (/^\d/.test(m[2].split(".")[0])) return u; // 已经有前缀
    return m[1] + "0" + m[2] + m[3];
  }

  /* 问服务端要整片地址 */
  function fetchFullUrl(attId) {
    return $task
      .fetch({
        url: origin + "/api/attachment",
        method: "POST",
        headers: apiHeaders(),
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

  /* 生成播放器 HTML —— 直接写进页面 */
  function playerHtml(u, cover) {
    const src = kver(u);
    const poster = cover ? ` poster="${cover}"` : "";
    return (
      '<video controls playsinline webkit-playsinline x5-playsinline preload="metadata"' +
      poster +
      ' style="width:100%;display:block;background:#000;border-radius:6px;margin:10px 0"' +
      ' src="' + src + '"></video>'
    );
  }

  /* 洗掉「未购买」提示 */
  function cleanContent(c) {
    if (typeof c !== "string" || !c) return c;
    return c
      .replace(/您还没有购买[^<]*/g, "已解锁，可正常观看")
      .replace(/data-sell="0"/g, 'data-sell="1"');
  }

  /* ============================================================
   * ① 心跳
   * ============================================================ */
  if (/\/api\/user\/current/.test(url)) {
    LOG("心跳正常");
    POP("✅ 脚本在运行", VER);
    return $done({});
  }

  /* ============================================================
   * ② 请求阶段：改写 /api/attachment 的 resource_id
   * ============================================================ */
  if (!resp && /\/api\/attachment/.test(url)) {
    if (!$request.body) return $done({});
    let j;
    try {
      j = JSON.parse($request.body);
    } catch (e) {
      return $done({});
    }
    if (!j || j.id === undefined) return $done({});

    const oldRid = j.resource_id;
    if (j.resource_type === "video_center") j.resource_type = "topic";
    j.resource_id = KEY_TID;

    LOG("改写播放请求 附件" + j.id + " " + oldRid + "→" + KEY_TID);
    POP("🔓 替换资源ID", "附件 " + j.id + "\n" + oldRid + " → " + KEY_TID);

    return $done({ body: JSON.stringify(j) });
  }

  /* ============================================================
   * ③ 线路按钮补地址
   * ============================================================ */
  if (resp && /\/api\/topic\/att\/\d+/.test(url)) {
    let j;
    try {
      j = JSON.parse(resp.body);
    } catch (e) {
      return $done({});
    }
    const isEnc = j && j.isEncrypted === true;
    const arr = isEnc ? unwrap(j.data) : j;
    if (!Array.isArray(arr) || arr.length === 0) return $done({});

    const attId = (url.match(/\/api\/topic\/att\/(\d+)/) || [])[1];
    fetchFullUrl(attId).then((full) => {
      if (!full) return $done({});
      arr.forEach((l) => {
        if (l && !l.url) l.url = full;
      });
      if (isEnc) j.data = wrap(arr);
      LOG("线路按钮补地址 " + arr.length + " 条");
      $done({ body: JSON.stringify(isEnc ? j : arr) });
    });
    return;
  }

  /* ============================================================
   * ④ 去广告
   * ============================================================ */
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
  const decoded = outer && outer.isEncrypted === true && typeof outer.data === "string" ? unwrap(outer.data) : null;
  if (!decoded || typeof decoded !== "object") return $done({});

  /* ============================================================
   * ⑤ 帖子详情：把 <video> 直接写进 content
   * ============================================================ */
  if (/\/api\/topic\/\d+(\?|$)/.test(url) && Array.isArray(decoded.attachments)) {
    const vids = decoded.attachments.filter((a) => a && a.category === "video" && a.id);

    if (typeof decoded.content === "string") decoded.content = cleanContent(decoded.content);
    if (decoded.sale && typeof decoded.sale === "object") decoded.sale.is_buy = true;

    if (vids.length === 0) {
      outer.data = wrap(decoded);
      LOG("帖子无视频，只处理文字");
      return $done({ body: JSON.stringify(outer) });
    }

    LOG("帖子 " + (decoded.topicId || "?") + " 有 " + vids.length + " 个视频");

    Promise.all(vids.map((v) => fetchFullUrl(v.id))).then((urls) => {
      const players = [];
      let hit = 0;

      urls.forEach((u, i) => {
        if (!u) return;
        const oldName = (vids[i].remoteUrl || "").split("/").pop();
        vids[i].remoteUrl = u;
        players.push(playerHtml(u, vids[i].coverUrl));
        hit++;
        LOG("附件" + vids[i].id + " " + oldName + " → 0前缀 " + kver(u).split("/").pop());
      });

      if (hit === 0) {
        outer.data = wrap(decoded);
        LOG("整片地址没拿到，保持原样");
        return $done({ body: JSON.stringify(outer) });
      }

      const html = players.join("<br/>");

      if (typeof decoded.content === "string") {
        let c = decoded.content;
        // 用播放器替掉整个售卖块
        const before = c;
        c = c.replace(/<span class="sell-btn"[\s\S]*?<\/span><\/span>/, html);
        if (c === before) {
          // 没有售卖块，直接插到正文末尾
          c = c.replace(/<\/body>/i, html + "</body>");
          if (c === before) c = c + html;
        }
        decoded.content = c.replace(/_preview\.m3u8/g, "_i.m3u8");
      }

      outer.data = wrap(decoded);
      LOG("完成 " + hit + "/" + vids.length + "，已写入播放器");
      POP("✅ 已解锁并放入播放器", hit + " 个视频\n" + kver(urls.find(Boolean)).split("/").pop());
      $done({ body: JSON.stringify(outer) });
    });
    return;
  }

  /* ============================================================
   * ⑥ 会员视频列表
   * ============================================================ */
  if (/\/api\/video-center\/video\/list/.test(url) && Array.isArray(decoded.results)) {
    let n = 0;
    decoded.results.forEach((v) => {
      if (v && v.access_type !== 1) {
        v.access_type = 1;
        v.can_play = true;
        n++;
      }
    });
    if (n === 0) return $done({});
    outer.data = wrap(decoded);
    LOG("会员视频 " + n + " 条改为免费");
    return $done({ body: JSON.stringify(outer) });
  }

  /* ============================================================
   * ⑦ 观影券兜底
   * ============================================================ */
  if (/\/api\/store\/user_pack/.test(url)) {
    let d = decoded && typeof decoded === "object" ? decoded : {};
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
