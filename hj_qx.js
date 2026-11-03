/*
 * >>> 文件已更新：v8-1103（2026-11-03 19:26）<<<
 * 打开看不到这一行 = 你看到的是旧缓存或另一个文件。
 * ============================================================
 *  海角社区 · 解锁 + 去广告  v8
 *  https://raw.githubusercontent.com/kiddy1911/hj666/main/hj_qx.js
 * ============================================================
 *
 *  【v7 为什么 VIP/金币/钻石帖播不了，普通帖能播】
 *
 *  我拿站点的真前端代码跑了全链路，问题就一个：
 *
 *  前端 h() 里有这段（iOS 分支）：
 *
 *      c = JSON.parse(sessionStorage.config||"{}").kversion || ""
 *      d = ((e,t)=>{ e=new URL(e); e.hostname=(t||"0")+e.hostname; return e.href })(y, c)
 *      A.src = d
 *
 *  它自己会给域名加 "0" 前缀。
 *
 *  我 v7 在脚本里也加了一次 —— 结果变成：
 *      0ts10...  →  00ts10...   ❌ 域名不存在，直接失败
 *
 *  实测：
 *      00ts10.hj260302818.top  →  HTTP 000（连不上）
 *      0ts10.hj260302818.top   →  HTTP 200 ✅
 *
 *  ── 普通帖为什么能播 ──
 *  普通帖正文自带 <video> 标签，前端直接用它，没走我插的那条路。
 *  VIP/金币/钻石帖走的是 .video-div + h()，被我多加了前缀就废了。
 *
 *  ── v8 的做法 ──
 *  1. 地址原样返回，绝对不加 0 前缀，交给前端自己加
 *  2. 正文里不插 <video>（会被前端 /<video([\s\S]*)<\/video>/gi 吞掉）
 *  3. 保住 .video-div 让 h() 正常跑
 *  4. 只改文字 + is_buy，结构一律不动
 *
 * ============================================================
 *  链路验证（真实前端逻辑 + 真实接口）
 * ============================================================
 *    .video-div 存在      → h() 被调用
 *    h() 请求 /api/attachment → resource_id 被改成 KEY_TID
 *    返回完整 m3u8（非 _preview）
 *    前端加 "0" → 0ts10... → 200 ✅
 *    key = 37619e3c... → 首尾分片解密 ✅
 *    实测时长 505.58 秒 = 8分25秒
 * ============================================================
 */

const VER = "v8-1103";
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

  /* 问服务端要整片地址。注意：返回原样，不加 0 前缀，
     前端 h() 的 iOS 分支会自己加。加了就变成 00ts10 → 连不上 */
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

  /* ---------- ① 心跳 ---------- */
  if (/\/api\/user\/current/.test(url)) {
    LOG("心跳");
    POP("✅ 脚本在运行", VER);
    return $done({});
  }

  /* ---------- ② 关键：改写 /api/attachment 的 resource_id ----------
     h() 会带 resource_id = 当前帖子ID（没买过 → 返回 30 秒预览）
     改成 KEY_TID（买过的帖）→ 返回完整视频 */
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

  /* ---------- ⑤ 帖子详情 ----------
     目标：让前端自己建播放器。
     · 正文绝对不能有 <video>（会被 /<video([\s\S]*)<\/video>/gi 换成 .video-div）
     · 必须保住 class="sell-btn" 和 data-floor="0">，否则那条 split 链崩掉，整页内容消失
     · 必须保住 .video-div 存在，h() 才会被调用
     · 只换文字，结构一个字不动 */
  if (/\/api\/topic\/\d+(\?|$)/.test(url) && Array.isArray(dec.attachments)) {
    const vids = dec.attachments.filter((a) => a && a.category === "video" && a.id);

    if (typeof dec.content === "string") {
      let c = dec.content;
      // 只换红字，不碰标签
      c = c.replace(/您还没有购买[^<]*/g, "已解锁，可正常观看");
      // 埋 .video-div + .video-div-btn，h() 两个都要用（b[w].innerHTML 那行）
      if (vids.length && c.indexOf('class="video-div"') === -1) {
        const v = vids[0];
        const kp = v.keyPath || "";
        const u0 = v.remoteUrl || "";
        const div =
          '<div class="video-div" data-id="' + v.id + '" id="video_' + v.id + '"' +
          ' key-path="' + kp + '" data-url="' + u0 + '"></div>' +
          '<div class="video-div-btn" data-id="' + v.id + '" id="video_' + v.id + '"' +
          ' key-path="' + kp + '" data-url="' + u0 + '"></div>';
        if (/<\/body>/i.test(c)) c = c.replace(/<\/body>/i, div + "</body>");
        else if (/<\/html>/i.test(c)) c = c.replace(/<\/html>/i, div + "</html>");
        else c += div;
      }
      dec.content = c;
    }
    if (dec.sale && typeof dec.sale === "object") dec.sale.is_buy = true;

    Promise.all(vids.map((v) => fullUrl(v.id))).then((us) => {
      let hit = 0;
      us.forEach((u, i) => {
        if (!u) return;
        const idx = dec.attachments.findIndex((x) => x && x.id === vids[i].id);
        if (idx >= 0) dec.attachments[idx].remoteUrl = u;
        // 同步更新刚埋的 .video-div 的 data-url
        if (typeof dec.content === "string" && dec.content.indexOf('data-id="' + vids[i].id + '"') !== -1) {
          dec.content = dec.content.replace(
            new RegExp('(<div class="video-div" data-id="' + vids[i].id + '"[^>]*data-url=")[^"]*', "g"),
            "$1" + u
          );
        }
        hit++;
        LOG("附件" + vids[i].id + " → " + u.split("/").pop());
      });

      outer.data = wrap(dec);
      if (hit) {
        LOG("完成 " + hit + "/" + vids.length);
        POP("✅ 已解锁", hit + " 个视频\n原地址交给前端加 0 前缀");
      } else {
        LOG("没拿到完整地址，仅改文字");
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
