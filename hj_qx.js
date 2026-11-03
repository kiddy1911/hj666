/*
 * ============================================================
 *  海角社区 · 解锁 + 去广告
 *  Quantumult X 单文件脚本
 *  托管：https://raw.githubusercontent.com/kiddy1911/hj666/refs/heads/main/hj_qx.js
 * ============================================================
 *
 *  【浏览器实测结论】
 *  1. 帖子金币/钻石/VIP视频：只改 /api/attachment 的请求体就够
 *     —— 服务端只校验 resource_id，不校验附件归属。
 *     实测 2303840（8 钻石）整片自动播放，duration 505.58s。
 *  2. 会员视频（V视频观影券）：同样只改这个接口，
 *     但 resource_type 必须从 video_center 改成 topic。
 *     实测 videoid=2981 整片播放，duration 1984.08s。
 *  3. 广告：/api/banner/banner_list 返回空数组，容器就不渲染。
 *
 *  日志前缀统一 [HJ]，每条都带可读中文。
 * ============================================================
 */

const KEY_TID = 2302525; // 你买过的 2 金币帖，全站万能钥匙

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

  const url = ($request && $request.url) || "";
  const resp = typeof $response !== "undefined" && $response ? $response : null;

  let host = "";
  try {
    host = (url.match(/^(https?:\/\/[^\/]+)/) || [])[1] || "";
  } catch (e) {}

  const shortHost = host.replace(/^https?:\/\//, "");

  /* ============================================================
   * 一、解锁：改写 /api/attachment 请求体
   *     这是唯一真正需要的接口，实测一条就够
   * ============================================================ */
  if (!resp && /\/api\/attachment(\?|$)/.test(url) && $request.body) {
    let j;
    try {
      j = JSON.parse($request.body);
    } catch (e) {
      console.log("[HJ] attachment 请求体解析失败，跳过");
      return $done({});
    }
    if (!j || typeof j !== "object" || j.id === undefined) return $done({});

    const oldRid = j.resource_id;
    const oldType = j.resource_type;

    if (j.resource_type === "video_center") j.resource_type = "topic";
    j.resource_id = KEY_TID;

    console.log(
      "[HJ] 解锁播放 | 附件id=" + j.id + " | 资源 " + oldRid + " → " + KEY_TID + " | 类型 " + oldType + " → " + j.resource_type
    );

    return $done({ body: JSON.stringify(j) });
  }

  /* ============================================================
   * 二、广告：清空全站广告位
   * ============================================================ */
  if (/\/api\/banner\/banner_list(\?|$)/.test(url)) {
    console.log("[HJ] 去广告 | 已清空广告位 @ " + shortHost);
    return $done({
      body: JSON.stringify({ isEncrypted: false, errorCode: 0, message: "", success: true, data: [] }),
    });
  }

  /* 以下为响应阶段 */
  if (!resp) return $done({});

  let outer;
  try {
    outer = JSON.parse(resp.body);
  } catch (e) {
    return $done({});
  }

  const decoded = outer && outer.isEncrypted === true && typeof outer.data === "string" ? unwrap(outer.data) : null;

  /* ============================================================
   * 三、帖子详情加日志：能确认脚本活着，也顺手把「未购买」
   *    字样翻掉（实测不影响播放，但看着舒服）
   * ============================================================ */
  if (/\/api\/topic\/\d+(\?|$)/.test(url) && decoded && Array.isArray(decoded.attachments)) {
    const vids = decoded.attachments.filter((a) => a && a.category === "video");
    if (vids.length === 0) return $done({});

    console.log("[HJ] 帖子 " + (decoded.topicId || "?") + " | 检测到 " + vids.length + " 个视频附件");

    if (decoded.sale && decoded.sale.is_buy === false) {
      decoded.sale.is_buy = true;
      outer.data = wrap(decoded);
      console.log("[HJ] 帖子 " + (decoded.topicId || "?") + " | 已标记为已购买");
      return $done({ body: JSON.stringify(outer) });
    }
    return $done({});
  }

  /* ============================================================
   * 四、会员视频：把 access_type 改免费（前端据此决定是否要券）
   * ============================================================ */
  if (/\/api\/video-center\/video\/list(\?|$)/.test(url) && decoded && Array.isArray(decoded.results)) {
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
    console.log("[HJ] 会员视频 | " + n + " 条已改为免费");
    return $done({ body: JSON.stringify(outer) });
  }

  /* ============================================================
   * 五、观影券兜底
   * ============================================================ */
  if (/\/api\/store\/user_pack(\?|$)/.test(url)) {
    let d = decoded && typeof decoded === "object" ? decoded : {};
    if (!Array.isArray(d.list)) d.list = [];
    const t = d.list.find((x) => x && Number(x.itemId) === 2000);
    if (t) t.count = Math.max(Number(t.count) || 0, 1);
    else d.list.push({ itemId: 2000, name: "观影券", count: 1 });
    outer.isEncrypted = true;
    outer.data = wrap(d);
    console.log("[HJ] 观影券 | 已伪装 +1 张");
    return $done({ body: JSON.stringify(outer) });
  }

  return $done({});
})();
