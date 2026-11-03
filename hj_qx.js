/*
 * >>> 文件已更新：v7-1103（2026-11-03 18:58）<<<
 * 打开文件看不到这一行 = 你看到的是旧缓存或另一个文件。
 * ============================================================
 *  海角社区 · 解锁 + 去广告  v7
 *  托管：https://raw.githubusercontent.com/kiddy1911/hj666/main/hj_qx.js
 * ============================================================
 *
 *  v6 为什么「内容全没」—— 我查到底了
 *
 *  前端 content 指令里有这么一段：
 *
 *    // ① 解锁校验
 *    (await Object(c.j)()).success
 *      ? 创建播放器
 *      : 把页面所有 .video-div 换成「视频无法播放」占位图
 *
 *    // ② c.j 就是 GET /api/user/current
 *    //    但它的返回里根本没有 success 字段！
 *
 *  我实测 /api/user/current 返回：{id, nickname, avatar, vip, ...}
 *  没有 success → undefined → 永远走 else 分支。
 *
 *  也就是说：正常播放器由前端走 else 分支处理，
 *  而我 v6 硬塞了 <video> 标签，被前端当成脏数据，
 *  连带 .video-div 一起被替换掉，结构就崩了。
 *
 *  ── v7 的做法 ──
 *
 *  一个字都不动 content 的结构。
 *  只做两件事：
 *    1. 把「您还没有购买，请购买后查看！」这几个字换掉（纯文字）
 *    2. 在 content 最末尾追加一个独立的播放器，不去碰 sell-btn
 *
 *  这样前端的 sell-btn 链、data-floor 链、.video-div 链
 *  全部保持原样，照常执行；播放器是额外挂上去的。
 *
 * ============================================================
 *  另一个关键点：真密钥在 0 前缀域名上
 * ============================================================
 *
 *  ts10.hj260302818.top   key = 5a0ef05b…  ❌ 解出来不是 TS
 *  0ts10.hj260302818.top  key = 37619e3c…  ✅ 首尾分片全对
 *  关系：k1 XOR base64(那个 .jpg) = k0
 *
 *  站点 iOS 播放时就是这样干的：
 *    e.hostname = (kversion || "0") + e.hostname
 *
 *  v7 照做。实测：
 *    2303840  505片 8分25秒  首尾解密 ✅✅
 *    605606   290片 5分21秒  首尾解密 ✅✅
 * ============================================================
 */

const VER = "v7-1103";
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

  /* 真密钥在 0 前缀域名上，照抄站点 iOS 逻辑 */
  function kver(u) {
    if (!u || u.indexOf(".m3u8") === -1) return u;
    const m = u.match(/^(https?:\/\/)([^\/]+)(\/.*)$/);
    if (!m) return u;
    if (/^\d/.test(m[2].split(".")[0])) return u;
    return m[1] + "0" + m[2] + m[3];
  }

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

  /* 独立播放器：不占 .video-div/.video-div-btn 任何类名，
     避免被前端那段 else 分支当成自己的元素替换掉 */
  function player(u, poster) {
    const src = kver(u);
    const p = poster ? ' poster="' + poster + '"' : "";
    return (
      '<div style="margin:14px 0;padding:10px;background:#111;border-radius:8px">' +
      '<div style="color:#0f0;font-size:13px;margin-bottom:8px">▶ 完整视频（已解锁）</div>' +
      '<video controls playsinline webkit-playsinline x5-playsinline preload="metadata"' +
      p +
      ' style="width:100%;display:block;background:#000;border-radius:4px"' +
      ' src="' +
      src +
      '"></video></div>'
    );
  }

  /* ---------- ① 心跳 ---------- */
  if (/\/api\/user\/current/.test(url)) {
    LOG("心跳");
    POP("✅ 脚本在运行", VER);
    return $done({});
  }

  /* ---------- ② 改写 /api/attachment 的资源ID ---------- */
  if (!resp && /\/api\/attachment/.test(url)) {
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
    POP("🔓 替换资源ID", "附件 " + j.id + "\n" + old + " → " + KEY_TID);
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

  /* ---------- ⑤ 帖子详情 ---------- */
  if (/\/api\/topic\/\d+(\?|$)/.test(url) && Array.isArray(dec.attachments)) {
    const vids = dec.attachments.filter((a) => a && a.category === "video" && a.id);

    /* 关键：只换文字。sell-btn / data-floor / data-sell 的结构全部保留，
       否则前端那条 split 链会崩，整页内容就没了 */
    if (typeof dec.content === "string") {
      dec.content = dec.content.replace(/您还没有购买[^<]*/g, "已解锁，可正常观看");
    }
    if (dec.sale && typeof dec.sale === "object") dec.sale.is_buy = true;

    if (!vids.length) {
      outer.data = wrap(dec);
      LOG("无视频，仅换文字");
      return $done({ body: JSON.stringify(outer) });
    }

    LOG("帖子 " + (dec.topicId || "?") + " 视频 " + vids.length + " 个");

    Promise.all(vids.map((v) => fullUrl(v.id))).then((us) => {
      const ps = [];
      let hit = 0;
      us.forEach((u, i) => {
        if (!u) return;
        const oldName = (vids[i].remoteUrl || "").split("/").pop();
        vids[i].remoteUrl = u; // 顺带换掉，线路按钮也能用
        ps.push(player(u, vids[i].coverUrl));
        hit++;
        LOG("附件" + vids[i].id + " " + oldName + " → " + kver(u).split("/").pop());
      });

      if (!hit) {
        outer.data = wrap(dec);
        LOG("整片地址没拿到");
        return $done({ body: JSON.stringify(outer) });
      }

      /* 追加到正文末尾，不碰任何已有标签 */
      if (typeof dec.content === "string") {
        let c = dec.content;
        c = c.replace(/_preview\.m3u8/g, "_i.m3u8");
        const html = ps.join("");
        if (/<\/body>/i.test(c)) c = c.replace(/<\/body>/i, html + "</body>");
        else if (/<\/html>/i.test(c)) c = c.replace(/<\/html>/i, html + "</html>");
        else c = c + html;
        dec.content = c;
      }

      outer.data = wrap(dec);
      LOG("完成 " + hit + "/" + vids.length + "，播放器已追加到末尾");
      POP("✅ 已解锁并加上播放器", hit + " 个视频\n" + kver(us.find(Boolean)).split("/").pop());
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
