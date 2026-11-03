/*
 * ============================================================
 *  海角社区 · 单文件 QX 脚本（解锁 + 去广告）
 *  Quantumult X · 一个文件，七条规则
 * ============================================================
 *
 *  解锁：金币帖 / 钻石帖 / VIP门槛帖 / 会员视频(观影券)
 *  去广告：全站广告位 + 注入的第三方统计脚本
 *
 *  域名无关：站点主域名会变（haijiao.com / efa9a34fcba81.xyz /
 *  f3f3ee7342759.xyz ...），脚本一律用 $request.url 里的真实
 *  origin 拼接口地址，不写死域名。
 *
 *  唯一配置项：KEY_TID
 *  ============================================================
 */

const KEY_TID = 2302525; // ← 你买过的帖子 id（2 金币帖）。不用改。

(function () {
  /* ---------------- 编解码：站点响应是 3 层 base64 ---------------- */
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

  const reply = (obj) => $done({ body: JSON.stringify(obj) });
  const passthrough = () => $done({});
  const ok = (data) => ({ isEncrypted: false, errorCode: 0, message: "", success: true, data: data });

  function hdr(h, name) {
    if (!h) return "";
    const k = Object.keys(h).find((x) => x.toLowerCase() === name.toLowerCase());
    return k ? h[k] : "";
  }

  const url = ($request && $request.url) || "";

  /* 从真实请求 URL 里取出 origin —— 站点换域名也不用改脚本 */
  let origin = "https://haijiao.com";
  try {
    const m = url.match(/^(https?:\/\/[^\/]+)/);
    if (m) origin = m[1];
  } catch (e) {}

  const resp = typeof $response !== "undefined" && $response ? $response : null;

  /* ============================================================
   * ① 广告位：全部清空
   *    POST /api/banner/banner_list → 全站十几个位置的广告都出自这里
   * ============================================================ */
  if (/\/api\/banner\/banner_list/.test(url)) {
    console.log("[HJ] 广告位已清空 @ " + origin);
    return reply(ok([]));
  }

  /* ============================================================
   * ② 会员视频解锁：直接回成功
   * ============================================================ */
  if (/\/api\/video-center\/video\/unlock/.test(url)) {
    console.log("[HJ] 会员视频 unlock 放行");
    return reply(ok({ unlocked: true }));
  }

  /* ============================================================
   * ③ 播放线路接口：/api/topic/att/<附件id>
   *    这是播放器真正取线路的地方，返回
   *    [{name:"普通1",url:""},{name:"普通2",url:""},{name:"VIP线路",url:"",VipLimit:1}]
   *    未购买时 url 全是空串 → 播放器无片可播。
   *    这里替它把每条线路都填上整片地址。
   * ============================================================ */
  if (/\/api\/topic\/att\/\d+/.test(url) && resp) {
    const attId = (url.match(/\/api\/topic\/att\/(\d+)/) || [])[1];
    if (!attId) return passthrough();

    let outer;
    try {
      outer = JSON.parse(resp.body);
    } catch (e) {
      return passthrough();
    }
    const lines = outer && outer.isEncrypted === true ? unwrap(outer.data) : outer && outer.data;
    if (!Array.isArray(lines) || lines.length === 0) return passthrough();

    // 已经是可播的就不用管
    if (lines.some((l) => l && l.url)) return passthrough();

    $task
      .fetch({
        url: origin + "/api/attachment",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/plain, */*",
          pcVer: "2",
          "X-User-Token": hdr($request.headers, "X-User-Token"),
          "X-User-Id": hdr($request.headers, "X-User-Id"),
          "User-Agent": hdr($request.headers, "User-Agent") || "Mozilla/5.0",
          Referer: origin + "/",
        },
        body: JSON.stringify({ id: Number(attId), resource_id: KEY_TID, resource_type: "topic", line: "normal1" }),
      })
      .then((r) => {
        let j;
        try {
          j = JSON.parse(r.body);
        } catch (e) {
          return passthrough();
        }
        if (j && j.isEncrypted && typeof j.data === "string") j = { data: unwrap(j.data) };
        const u = (j && j.data && j.data.remoteUrl) || "";
        if (!u || u.indexOf("_preview") !== -1) {
          console.log("[HJ] 线路接口: 没拿到整片地址");
          return passthrough();
        }
        lines.forEach((l) => {
          if (l && typeof l === "object") {
            l.url = u;
            l.VipLimit = 0;
          }
        });
        outer.isEncrypted = true;
        outer.data = wrap(lines);
        console.log("[HJ] 播放线路已填整片 " + u.split("/").pop());
        reply(outer);
      })
      .catch(() => passthrough());
    return;
  }

  /* ============================================================
   * ④ 请求阶段：/api/attachment 把 resource_id 换成钥匙帖
   * ============================================================ */
  if (!resp) {
    if (/\/api\/attachment/.test(url) && $request.body) {
      let j;
      try {
        j = JSON.parse($request.body);
      } catch (e) {
        return passthrough();
      }
      if (!j || j.id === undefined) return passthrough();
      const from = j.resource_id;
      if (j.resource_type === "video_center") j.resource_type = "topic";
      j.resource_id = KEY_TID;
      console.log("[HJ] attachment: id=" + j.id + "  resource " + from + " -> " + j.resource_id);
      return $done({ body: JSON.stringify(j) });
    }
    return passthrough();
  }

  /* 以下都是响应阶段 */
  let outerR;
  try {
    outerR = JSON.parse(resp.body);
  } catch (e) {
    return passthrough();
  }

  const decoded = outerR && outerR.isEncrypted === true && typeof outerR.data === "string" ? unwrap(outerR.data) : null;

  /* ============================================================
   * ⑤ 帖子详情：视频附件地址 → 整片，并把 is_buy 翻成 true
   *    详情页是 /post/details?pid=<id>，内部调用 /api/topic/<id>
   * ============================================================ */
  if (/\/api\/topic\/\d+(\?|$)/.test(url) && decoded && Array.isArray(decoded.attachments)) {
    const vids = decoded.attachments.filter((a) => a && a.category === "video" && a.id);
    if (vids.length === 0) return passthrough();

    Promise.all(
      vids.map((a) =>
        $task
          .fetch({
            url: origin + "/api/attachment",
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json, text/plain, */*",
              pcVer: "2",
              "X-User-Token": hdr($request.headers, "X-User-Token"),
              "X-User-Id": hdr($request.headers, "X-User-Id"),
              "User-Agent": hdr($request.headers, "User-Agent") || "Mozilla/5.0",
              Referer: origin + "/",
            },
            body: JSON.stringify({ id: a.id, resource_id: KEY_TID, resource_type: "topic", line: "normal1" }),
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
          .catch(() => null)
      )
    ).then((urls) => {
      let hit = 0;
      urls.forEach((u, i) => {
        if (u) {
          vids[i].remoteUrl = u;
          vids[i].isPreview = false;
          hit++;
        }
      });
      if (hit > 0 && decoded.sale && typeof decoded.sale === "object") decoded.sale.is_buy = true;
      outerR.data = wrap(decoded);
      console.log("[HJ] 详情页解锁 " + hit + "/" + vids.length + " 个视频");
      reply(outerR);
    });
    return;
  }

  /* ============================================================
   * ⑥ V视频列表：access_type 2 → 1
   * ============================================================ */
  if (/\/api\/video-center\/video\/list/.test(url) && decoded && Array.isArray(decoded.results)) {
    let n = 0;
    decoded.results.forEach((v) => {
      if (v && v.access_type !== 1) {
        v.access_type = 1;
        v.can_play = true;
        n++;
      }
    });
    if (n === 0) return passthrough();
    outerR.data = wrap(decoded);
    console.log("[HJ] V视频 " + n + " 条改为免费");
    return reply(outerR);
  }

  /* ============================================================
   * ⑦ 背包：兜底补 1 张观影券
   * ============================================================ */
  if (/\/api\/store\/user_pack/.test(url)) {
    let d = decoded && typeof decoded === "object" ? decoded : {};
    if (!Array.isArray(d.list)) d.list = [];
    const t = d.list.find((x) => x && Number(x.itemId) === 2000);
    if (t) t.count = Math.max(Number(t.count) || 0, 1);
    else d.list.push({ itemId: 2000, name: "观影券", count: 1 });
    outerR.isEncrypted = true;
    outerR.data = wrap(d);
    console.log("[HJ] 观影券 +1（伪装）");
    return reply(outerR);
  }

  return passthrough();
})();
