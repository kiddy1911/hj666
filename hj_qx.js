/*
 * ============================================================
 *  海角社区 · 解锁 + 去广告  v5
 * ============================================================
 *
 *  托管地址（无 CDN 缓存）：
 *    https://raw.githubusercontent.com/kiddy1911/hj666/main/hj_qx.js
 *
 *  ── 为什么之前一直不成功，三个原因都修了 ──
 *
 *  ① jsdelivr 把旧版缓存了 7 天（max-age=604800），
 *     你手机上跑的一直是很早的版本，改动到不了设备。
 *     → 换 raw.githubusercontent.com，不走 CDN。
 *
 *  ② 「您还没有购买，请购买后查看！」这句红字来自服务端
 *     content 字段里的静态 HTML：
 *       <span data-sell="0" class="sell_line2">您还没有购买…</span>
 *     改视频地址不会让它消失，必须改 content 字符串本身。
 *     → v5 直接把 data-sell 改成 1、把红字换成「已解锁」。
 *
 *  ③ 播放器读的是 /api/attachment 返回的 remoteUrl，
 *     未购买时那个地址是 _preview 试看版，且无法从地址推导。
 *     → v5 在请求阶段改写 resource_id 拿整片，
 *       同时在帖子响应里兜底替换 remoteUrl。
 *
 *  ── 实测数据（真实接口） ──
 *    2303840（8 钻石）  505 片 = 8分25秒
 *    605606 （VIP3）    290 片 = 5分21秒
 * ============================================================
 */

const VER = "v5-1103";
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

  /* 问服务端要某个附件的整片地址 */
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

  /* 洗掉服务端 content 里的「未购买」提示，换成已解锁 */
  function cleanContent(c) {
    if (typeof c !== "string" || !c) return c;
    let s = c;
    // 「您还没有购买，请购买后查看！」
    s = s.replace(/您还没有购买[^<]*/g, "已解锁，可正常观看");
    // 「此处内容售价X钻石，已有N人购买」→ 保留价格信息但说明已解锁
    s = s.replace(/data-sell="0"/g, 'data-sell="1"');
    // 去掉「点击预览30秒」这类字样
    s = s.replace(/以下是预览30秒视频[^<]*/g, "");
    s = s.replace(/请点击购买出售内容[^<]*/g, "");
    s = s.replace(/视频，点击预览30秒/g, "视频");
    return s;
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
   * ③ 线路按钮：/api/topic/att/{id} 返回空地址，补上整片
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
   * ⑤ 帖子详情：换 remoteUrl + 洗红字 + 翻 is_buy
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
      let hit = 0;
      urls.forEach((u, i) => {
        if (u) {
          const oldName = (vids[i].remoteUrl || "").split("/").pop();
          vids[i].remoteUrl = u;
          hit++;
          LOG("附件" + vids[i].id + " " + oldName + " → " + u.split("/").pop());
        }
      });

      if (hit === 0) {
        LOG("整片地址没拿到，用原始 content 兜底");
        outer.data = wrap(decoded);
        return $done({ body: JSON.stringify(outer) });
      }

      if (typeof decoded.content === "string" && urls[0]) {
        decoded.content = decoded.content.replace(/_preview\.m3u8/g, "_i.m3u8");
      }

      outer.data = wrap(decoded);
      LOG("完成 " + hit + "/" + vids.length);
      POP("✅ 已解锁整片", hit + " 个视频\n" + (urls.find(Boolean) || "").split("/").pop());
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
