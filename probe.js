/*
 * 探针脚本 v1 —— 用来判断 QX 到底有没有在工作
 *
 * 它不修改任何东西，只在 QX 日志里打一行字。
 * 如果这条日志都看不到，问题在 QX 配置/证书，跟解锁脚本无关。
 *
 * 用法：临时加一条规则（见 quantumultx.conf 里的「探针」部分）
 */

const url = ($request && $request.url) || "";
const hasResp = typeof $response !== "undefined" && $response;

console.log("[HJ探针] ✅ 脚本被执行了！URL=" + url + " | 阶段=" + (hasResp ? "响应" : "请求"));

// 原样放回，不修改任何内容
$done({});
