/*
 * ============================================================
 *  海角社区 · 解锁 + 去广告  v3（诊断增强版）
 * ============================================================
 *
 *  v3 改动：
 *    1. 每个分支都会 console.log
 *    2. 关键动作额外用 $notify 弹系统通知（不依赖日志面板）
 *    3. 顶部有 VER 版本号，能确认 QX 下到的是新版
 *
 *  托管：https://cdn.jsdelivr.net/gh/kiddy1911/hj666@main/hj_qx.js
 * ============================================================
 */

const VER = "v3-1103";
const KEY_TID = 2302525; // 你买过的 2 金币帖

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
      $notify("海角解锁 " + VER, sub, msg);
    } catch (e) {}
  };

  const url = ($request && $request.url) || "";
  const resp = typeof $response !== "undefined" && $response ? $response : null;
  const path = url.replace(/^https?:\/\/[^\/]+/, "").split("?")[0];

  LOG("命中 " + path + " | " + (resp ? "响应阶段" : "请求阶段"));

  /* ============================================================
   * 0. 心跳：页面一打开就会调 /api/user/current
   *    只要这条弹了通知，就能百分百确认脚本在跑
   * ============================================================ */
  if (/\/api\/user\/current/.test(url)) {
    LOG("心跳接口命中，脚本正常工作");
    POP("✅ 脚本已生效", "版本 " + VER + "\n准备解锁视频");
    return $done({});
  }

  /* ============================================================
   * 1. 解锁：改写 /api/attachment 请求体（唯一真正需要的）
   * ============================================================ */
  if (!resp && /\/api\/attachment/.test(url)) {
    if (!$request.body) {
      LOG("attachment 请求体为空，跳过");
      return $done({});
    }
    let j;
    try {
      j = JSON.parse($request.body);
    } catch (e) {
      LOG("attachment 请求体不是 JSON：" + $request.body.slice(0, 80));
      return $done({});
    }
    if (!j || j.id === undefined) {
      LOG("attachment 没有 id 字段");
      return $done({});
    }

    const oldRid = j.resource_id;
    const oldType = j.resource_type;
    if (j.resource_type === "video_center") j.resource_type = "topic";
    j.resource_id = KEY_TID;

    LOG("解密播放 附件" + j.id + " | " + oldRid + "→" + KEY_TID + " | " + oldType + "→" + j.resource_type);
    POP("🔓 已替换资源ID", "附件 " + j.id + "\n" + oldRid + " → " + KEY_TID);

    return $done({ body: JSON.stringify(j) });
  }

  /* ============================================================
   * 2. 去广告
   * ============================================================ */
  if (/\/api\/banner\/banner_list/.test(url)) {
    LOG("清空广告位");
    return $done({
      body: JSON.stringify({ isEncrypted: false, errorCode: 0, message: "", success: true, data: [] }),
    });
  }

  /* 以下都是响应阶段 */
  if (!resp) return $done({});

  let outer;
  try {
    outer = JSON.parse(resp.body);
  } catch (e) {
    return $done({});
  }
  const decoded = outer && outer.isEncrypted === true && typeof outer.data === "string" ? unwrap(outer.data) : null;

  /* ============================================================
   * 3. 帖子详情：翻掉「未购买」标记
   * ============================================================ */
  if (/\/api\/topic\/\d+(\?|$)/.test(url) && decoded && Array.isArray(decoded.attachments)) {
    const vids = decoded.attachments.filter((a) => a && a.category === "video");
    LOG("帖子 " + (decoded.topicId || "?") + " 有 " + vids.length + " 个视频附件 | is_buy=" + (decoded.sale && decoded.sale.is_buy));
    if (vids.length === 0) return $done({});
    if (decoded.sale && decoded.sale.is_buy === false) {
      decoded.sale.is_buy = true;
      outer.data = wrap(decoded);
      LOG("已把 is_buy 翻成 true");
      return $done({ body: JSON.stringify(outer) });
    }
    return $done({});
  }

  /* ============================================================
   * 4. 会员视频列表
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
    if (n === 0) return $done({});
    outer.data = wrap(decoded);
    LOG("会员视频 " + n + " 条改为免费");
    return $done({ body: JSON.stringify(outer) });
  }

  /* ============================================================
   * 5. 观影券兜底
   * ============================================================ */
  if (/\/api\/store\/user_pack/.test(url)) {
    let d = decoded && typeof decoded === "object" ? decoded : {};
    if (!Array.isArray(d.list)) d.list = [];
    const t = d.list.find((x) => x && Number(x.itemId) === 2000);
    if (t) t.count = Math.max(Number(t.count) || 0, 1);
    else d.list.push({ itemId: 2000, name: "观影券", count: 1 });
    outer.isEncrypted = true;
    outer.data = wrap(d);
    LOG("观影券伪装 +1");
    return $done({ body: JSON.stringify(outer) });
  }

  return $done({});
})();
