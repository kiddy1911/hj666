/*
 * ============================================================
 *  海角社区 · 单文件 QX 脚本（解锁 + 去广告）
 *  Quantumult X · 一个文件，六条规则，全部改动都在这里
 * ============================================================
 *
 *  解锁：金币帖 / 钻石帖 / VIP门槛帖 / 会员视频(观影券)
 *  去广告：全站 16 个广告位 + 注入的第三方统计脚本
 *
 *  唯一的配置项：KEY_TID
 *  ============================================================
 */

const KEY_TID = 2302525; // ← 改成你自己买过的一张帖子 id（2 金币帖即可）

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
  const resp = typeof $response !== "undefined" && $response ? $response : null;

  /* ============================================================
   * ① 广告位：全部清空（16 个位置的广告都走这个接口）
   * ============================================================ */
  if (/\/api\/banner\/banner_list/.test(url)) {
    console.log("[HJ] 广告位已清空");
    return reply(ok([]));
  }

  /* ============================================================
   * ② 会员视频解锁：直接回成功（备用路线，不走真接口）
   * ============================================================ */
  if (/\/api\/video-center\/video\/unlock/.test(url)) {
    console.log("[HJ] 会员视频 unlock 放行");
    return reply(ok({ unlocked: true }));
  }

  /* ============================================================
   * ③ 请求阶段：/api/attachment 把 resource_id 换成钥匙帖
   *    服务端只校验 resource_id，不校验附件归属 —— 于是任意付费视频给整片
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
      console.log(`[HJ] attachment: id=${j.id}  resource ${from} -> ${j.resource_id}`);
      return $done({ body: JSON.stringify(j) });
    }
    return passthrough();
  }

  /* 以下都是响应阶段 */
  let outer;
  try {
    outer = JSON.parse(resp.body);
  } catch (e) {
    return passthrough();
  }

  const decoded = outer && outer.isEncrypted === true && typeof outer.data === "string" ? unwrap(outer.data) : null;

  /* ============================================================
   * ④ 帖子详情：视频附件的「试看地址」→「整片地址」
   *    覆盖 金币帖 / 钻石帖 / VIP 门槛帖
   * ============================================================ */
  if (/\/api\/topic\/\d+(\?|$)/.test(url) && decoded && Array.isArray(decoded.attachments)) {
    const vids = decoded.attachments.filter((a) => a && a.category === "video" && a.id);
    if (vids.length === 0) return passthrough();

    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      pcVer: "2",
      "X-User-Token": hdr($request.headers, "X-User-Token"),
      "X-User-Id": hdr($request.headers, "X-User-Id"),
      "User-Agent": hdr($request.headers, "User-Agent") || "Mozilla/5.0",
      Referer: "https://haijiao.com/",
    };

    Promise.all(
      vids.map((a) =>
        $task
          .fetch({
            url: "https://haijiao.com/api/attachment",
            method: "POST",
            headers: headers,
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
      outer.data = wrap(decoded);
      console.log(`[HJ] 解锁 ${hit}/${vids.length} 个视频附件`);
      reply(outer);
    });
    return;
  }

  /* ============================================================
   * ⑤ V视频列表：access_type 2（需要观影券）→ 1（免费）
   *    前端 openVideo 里 1===access_type 直接进播放页，连券都不用
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
    outer.data = wrap(decoded);
    console.log(`[HJ] V视频 ${n} 条改为免费`);
    return reply(outer);
  }

  /* ============================================================
   * ⑥ 背包：兜底补 1 张观影券（个别页面还会读这个）
   * ============================================================ */
  if (/\/api\/store\/user_pack/.test(url)) {
    let d = decoded && typeof decoded === "object" ? decoded : {};
    if (!Array.isArray(d.list)) d.list = [];
    const t = d.list.find((x) => x && Number(x.itemId) === 2000);
    if (t) t.count = Math.max(Number(t.count) || 0, 1);
    else d.list.push({ itemId: 2000, name: "观影券", count: 1 });
    outer.isEncrypted = true;
    outer.data = wrap(d);
    console.log("[HJ] 观影券 +1（伪装）");
    return reply(outer);
  }

  return passthrough();
})();
