
/*
 * Google One AI - Quantumult X
 * Description: Google One 套餐标识响应改写
 * Platform: Quantumult X
 * Type: script-response-body
 */

(function () {
    "use strict";

    try {
        if (
            typeof $response === "undefined" ||
            typeof $response.body !== "string"
        ) {
            console.log("[Google One] 响应正文为空");
            $done({});
            return;
        }

        var body = $response.body;
        var modified = body;

        // 30TB 套餐标识替换
        modified = modified.replace(
            /30tb\.ai\.pro\.m/g,
            "30tb.m"
        );

        // 20TB 套餐标识替换
        modified = modified.replace(
            /20tb\.m\.v2/g,
            "20tb.m"
        );

        if (modified !== body) {
            console.log("[Google One] 套餐标识替换成功");
            $done({ body: modified });
        } else {
            console.log("[Google One] 未匹配到目标套餐标识");
            $done({});
        }

    } catch (error) {
        console.log("[Google One] 错误: " + error);
        $done({});
    }
})();
