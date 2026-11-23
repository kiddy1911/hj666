
/*
 * Google One AI - Quantumult X
 * Debug version
 */

(function () {
    "use strict";

    try {
        var url = typeof $request !== "undefined"
            ? $request.url.split("?")[0]
            : "unknown";

        var body = $response.body;

        if (typeof body !== "string" || !body) {
            console.log("[G1] 响应正文为空");
            $done({});
            return;
        }

        var count30 = (
            body.match(/30tb\.ai\.pro\.m/g) || []
        ).length;

        var count20 = (
            body.match(/20tb\.m\.v2/g) || []
        ).length;

        if (count30 + count20 > 0) {
            var modified = body
                .replace(/30tb\.ai\.pro\.m/g, "30tb.m")
                .replace(/20tb\.m\.v2/g, "20tb.m");

            console.log("[G1] 替换成功");
            console.log("[G1] URL: " + url);
            console.log("[G1] 30TB: " + count30);
            console.log("[G1] 20TB: " + count20);

            $done({ body: modified });
        } else {
            $done({});
        }

    } catch (e) {
        console.log("[G1] Error: " + e);
        $done({});
    }
})();
