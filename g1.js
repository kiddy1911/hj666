
/*
 * Google One 优惠套餐 SKU 改写
 * Quantumult X - g1.js
 */

(function () {
    "use strict";

    var SKU_MAP = {
        "g1.ios.30tb.ai.pro.m":
            "g1.ai.ultra.3months_ip_90p.acq",

        "g1.ios.20tb.m.v2":
            "g1.20tb.3months_ip_90p.acq"
    };

    try {
        var body = $response.body;

        if (typeof body !== "string" || !body) {
            console.log("[G1-SKU] 响应正文为空");
            $done({});
            return;
        }

        var modified = body;
        var total = 0;

        Object.keys(SKU_MAP).forEach(function (from) {
            var to = SKU_MAP[from];
            var parts = modified.split(from);
            var count = parts.length - 1;

            if (count > 0) {
                modified = parts.join(to);
                total += count;

                console.log(
                    "[G1-SKU] 替换成功: " +
                    from + " -> " + to +
                    " (" + count + "处)"
                );
            }
        });

        if (total > 0) {
            console.log(
                "[G1-SKU] 总计替换 " + total + " 处"
            );
            $done({ body: modified });
        } else {
            console.log("[G1-SKU] 未匹配到套餐 SKU");
            $done({});
        }

    } catch (e) {
        console.log("[G1-SKU] 错误: " + e);
        $done({});
    }
})();
