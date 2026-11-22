/**
 * Lutube 在线版 —— 解锁 VIP + 全站去广告 + 完整片源（去 1 分钟试看）
 * 目标：web-aws.*  （Lutube 在线版 / 轻量版 H5）
 * 版本：v3-1122
 *
 * ── 一、接口层 ────────────────────────────────────────────────
 *   站点是 Vite + Vue3 的 SPA，所有接口返回体都是
 *   AES-256-CBC(key=UTF8 "322b63a3be0567ae7cae7a2f368ee38a",
 *               iv=UTF8(md5(x-vtag).slice(8,24))) 加密的。
 *   与其在 QX 里内嵌 AES 解密再加密，不如在 HTML 外壳里塞一个
 *   JSON.parse 钩子 —— axios 解密后必定走 JSON.parse，
 *   在这里改对象等价于改服务端返回，且不碰任何密文。
 *
 *   VIP 判定只有一处：userInfo.is_vip（store getter user/isVip）
 *     · is_vip      → 画质可选 HD、倍速、线路切换、跳过时间轴广告
 *     · email/phone → 非空即绕过 isNotLinked，去掉"请注册账号"拦截
 *     · expiry      → 拉满，避免"VIP 即将到期"弹窗
 *
 * ── 二、完整片源（v3 核心：这就是 1 分钟限制的解法）────────────
 *   VIP 片的 /api/v3/long/info/:id 只下发
 *     urls:{low:"",high:"",intro:"/l2media/<h>.m3u8"}
 *   intro 是 62 秒试看片段。实测同一 CDN 上并排放着完整版：
 *     <stream>/<dir>/<avkey>/ts/<avkey>-<n>.ts         完整
 *     <stream>/<dir>/<avkey>/intro/ts/<avkey>-<n>.ts   试看
 *   dir：avkey 形如 WAAA-705 → apen；形如 TX6ad8… → original_videos
 *   avkey 直接来自 long/info 的 data.avkey 字段，实测可用。
 *
 *   加解密： AES-128-CBC
 *     key = md5(avkey) 的 16 字节原始值
 *     iv  = key（实测 6 个 FANZA 片源全部成立）
 *   实测单一 IV 可解整片，0 损坏：
 *     WAAA-705 29101 包 / YMDD-512 40057 包 / MARA-069 41620 包
 *     DSOD-142 41620 包 / MAAN-1013 / TX6ad816d9a8c83 20403 包
 *
 *   所以钩子做三件事：
 *     ① 捕获 long/info 里的 avkey + duration
 *     ② 拦截 /l2media/*.m3u8，换成现场拼装的完整片播放列表
 *     ③ 列表里每段带 EXT-X-KEY(METHOD=AES-128)，URI 指向同源
 *        /__ltk/<avkey>.bin（由钩子直接吐出 md5 字节），
 *        IV=md5(avkey)，让播放器用自己的解密器解 —— 零改动
 *
 *   实测（hls.js 1.5.17 直接播该列表，WAAA-705）：
 *     duration 8520.00s = 142 分钟；rdy=4；errors 0
 *     seek 5000s → cur 5008.95；seek 8400s → cur 8408.94
 *     buffered 8438s。试看只有 62s。
 *
 * ── 三、广告面 ────────────────────────────────────────────────
 *   ① 开屏广告   appinfo2.response.ad.cover_display
 *   ② 浮层/插屏/信息流   /api/v1/ad 全部广告位 → {}
 *   ③ 播放器贴片/时间轴   h5/ios/light player_*
 *   ④ 播放器压字   player_top_free_text / player_mid_free_text
 *   ⑤ 永久地址二维码弹窗   share.play_popup_interval
 *   ⑥ GTM / GA4  GTM-T3S4P9J + G-50EZPWKYX0 → 整段移除
 */

const VER = "v3-1122";

/* ============================================================
 *  纯 JS MD5（QX 无 crypto）—— 已对 9 组向量验证，含全部真实 avkey
 * ============================================================ */
const MD5_SRC = [
  "function _md5(s){",
  "function add(a,b){return (a+b)>>>0;}",
  "function rol(n,c){return ((n<<c)|(n>>>(32-c)))>>>0;}",
  "var K=[],S=[],H=[0x67452301,0xefcdab89,0x98badcfe,0x10325476];",
  "for(var i=0;i<64;i++)K[i]=Math.floor(Math.abs(Math.sin(i+1))*4294967296)>>>0;",
  "var BASE=[7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21];",
  "for(i=0;i<64;i++)S[i]=BASE[(i>>4)*4+(i&3)];",
  "var b=[];",
  "for(i=0;i<s.length;i++){var c=s.charCodeAt(i);",
  "if(c<128)b.push(c);else if(c<2048){b.push(0xc0|(c>>6),0x80|(c&63));}",
  "else{b.push(0xe0|(c>>12),0x80|((c>>6)&63),0x80|(c&63));}}",
  "var bitLen=b.length*8;b.push(0x80);",
  "while(b.length%64!==56)b.push(0);",
  "for(i=0;i<4;i++)b.push((bitLen>>>(8*i))&0xff);",
  "b.push(0,0,0,0);",
  "for(var off=0;off<b.length;off+=64){",
  "var M=[];",
  "for(i=0;i<16;i++)M[i]=(b[off+i*4]|(b[off+i*4+1]<<8)|(b[off+i*4+2]<<16)|(b[off+i*4+3]<<24))>>>0;",
  "var A=H[0],B=H[1],C=H[2],D=H[3];",
  "for(i=0;i<64;i++){",
  "var F,g;",
  "if(i<16){F=(B&C)|((~B)&D);g=i;}",
  "else if(i<32){F=(D&B)|((~D)&C);g=(5*i+1)&15;}",
  "else if(i<48){F=B^C^D;g=(3*i+5)&15;}",
  "else{F=C^(B|(~D));g=(7*i)&15;}",
  "var t=D;D=C;C=B;",
  "B=add(B,rol(add(add(A,F>>>0),add(K[i],M[g])),S[i]));",
  "A=t;}",
  "H[0]=add(H[0],A);H[1]=add(H[1],B);H[2]=add(H[2],C);H[3]=add(H[3],D);}",
  "var o=[];",
  "for(i=0;i<4;i++)for(var j=0;j<4;j++)o.push((H[i]>>>(8*j))&0xff);",
  "return o;}",
].join("");

/* ============================================================
 *  注入到 HTML 的钩子
 * ============================================================ */
const HOOK = [
  "<script>(function(){",
  "if(window.__ltPatched)return;window.__ltPatched=1;",
  "var _p=JSON.parse,_f=window.fetch.bind(window);",
  "var OO=XMLHttpRequest.prototype.open,OS=XMLHttpRequest.prototype.send;",
  MD5_SRC,
  "function hex(a){var s='';for(var i=0;i<a.length;i++)s+=(a[i]<16?'0':'')+a[i].toString(16);return s;}",
  "function has(o,k){return o&&typeof o==='object'&&Object.prototype.hasOwnProperty.call(o,k);}",

  /* ---------- 广告清洗 ---------- */
  "var AK=['player_fullad','menu_long','menu_short','float_long_0','float_short_0','payment_float','game_ad','game_banner','long_recommend','short_recommend','ai_video_player'];",
  "function isAd(d){if(!d||typeof d!=='object'||Array.isArray(d))return false;for(var i=0;i<AK.length;i++){if(has(d,AK[i]))return true;}return false;}",
  "function adish(v){",
  "if(!v||typeof v!=='object'||Array.isArray(v))return false;",
  "if(v.content_type==='ad')return true;",
  "if(typeof v.ad_link_url==='string'&&v.ad_link_url)return true;",
  "if(v.content&&typeof v.content==='object'&&v.content.content_type==='ad')return true;",
  "return false;}",
  "function scrub(o,d){",
  "if(!o||typeof o!=='object'||d>10)return o;",
  "if(Array.isArray(o)){",
  "for(var i=o.length-1;i>=0;i--){if(adish(o[i]))o.splice(i,1);else scrub(o[i],d+1);}",
  "return o;}",
  "if(o.content_type==='ad'){o.data=[];o.content_type='long_video';return o;}",
  "for(var k in o){if(Object.prototype.hasOwnProperty.call(o,k))scrub(o[k],d+1);}",
  "return o;}",

  /* ---------- VIP ---------- */
  "function vip(d){",
  "if(!has(d,'is_vip'))return false;",
  "d.is_vip=true;d.expiry=4102415999;",
  "d.email=d.email||'vip@local';d.phone=d.phone||'13800000000';",
  "if(!d.points||d.points<1)d.points=99999;",
  "d.ad={};",
  "if(!d.custom||typeof d.custom!=='object')d.custom={};",
  "d.custom.level=1;d.custom.expiry=4102415999;",
  "return true;}",

  /* ---------- appinfo2 ---------- */
  "function app(r){",
  "if(!r||typeof r!=='object')return false;",
  "if(!(r.pwa||r.h5||r.ios||r.light||r.ad))return false;",
  "if(r.ad&&typeof r.ad==='object'){r.ad.cover_display=false;r.ad.cover_image='';r.ad.cover_link='';}",
  "r.player_top_free_text={cn:'',tw:''};",
  "r.player_mid_free_text={cn:'',tw:''};",
  "var ks=['h5','ios','light','android'];",
  "for(var i=0;i<ks.length;i++){var b=r[ks[i]];if(b&&typeof b==='object'){",
  "b.player_timeline=0;b.player_all_ad_ctime=0;b.player_ctime=0;b.live_url='';b.live_title='';}}",
  "if(r.pwa&&typeof r.pwa==='object'){",
  "if(r.pwa.game_button)r.pwa.game_button.status=false;",
  "if(r.pwa.float_button)r.pwa.float_button.status=false;}",
  "if(r.share&&typeof r.share==='object'){r.share.play_popup_interval=0;r.share.days=0;}",
  "if(r.statsig&&typeof r.statsig==='object')r.statsig.track=false;",
  "return true;}",

  /* ---------- 完整片源 ---------- */
  "function dirOf(a){return /^[A-Za-z0-9]+-[0-9]+$/.test(a)?'apen':'original_videos';}",
  "var CDN='https://tez.mihmfg.com';",
  "var CUR=null,PLC={};",
  "window.__ltCUR=function(){return CUR;};",
  "function head(u){return _f(u,{method:'HEAD'}).then(function(r){return r.status===200;}).catch(function(){return false;});}",
  "function cnt(base,av,lo,hi){",
  "if(hi<=lo)return Promise.resolve(lo);",
  "var m=Math.ceil((lo+hi)/2);",
  "return head(base+'/ts/'+av+'-'+m+'.ts').then(function(ok){return ok?cnt(base,av,m,hi):cnt(base,av,lo,m-1);});}",
  "function build(av,dur){",
  "var k=av+'|'+dur;",
  "if(PLC[k])return PLC[k];",
  "var dir=dirOf(av),base=CDN+'/'+dir+'/'+av;",
  "PLC[k]=head(base+'/ts/'+av+'-0.ts').then(function(ok){",
  "if(!ok)return null;",
  "var g=Math.round((dur||0)/6),lo=g>50?g-50:0,hi=g>0?g+50:9000;",
  "return cnt(base,av,lo,hi).then(function(n){",
  "var N=n+1,D=dur||N*6,inf=(D/N).toFixed(6);",
  "var L=['#EXTM3U','#EXT-X-VERSION:4','#EXT-X-PLAYLIST-TYPE:VOD','#EXT-X-INDEPENDENT-SEGMENTS',",
  "'#EXT-X-TARGETDURATION:'+Math.max(1,Math.ceil(D/N)),'#EXT-X-MEDIA-SEQUENCE:0',",
  "'#EXT-X-KEY:METHOD=AES-128,URI=\"/__ltk/'+av+'.bin\",IV=0x'+hex(_md5(av))];",
  "for(var i=0;i<N;i++){L.push('#EXTINF:'+inf+',');L.push(base+'/ts/'+av+'-'+i+'.ts');}",
  "L.push('#EXT-X-ENDLIST');",
  "window.__ltPLinfo={av:av,dir:dir,n:N,dur:D};",
  "return L.join('\\n');});});",
  "return PLC[k];}",

  /* ---------- XHR 假响应 ---------- */
  "function fake(x,body,st,ct){",
  "try{",
  "Object.defineProperty(x,'readyState',{value:4,configurable:true});",
  "Object.defineProperty(x,'status',{value:st,configurable:true});",
  "Object.defineProperty(x,'statusText',{value:'OK',configurable:true});",
  "var rt=x.responseType,resp;",
  "if(rt==='arraybuffer')resp=new Uint8Array(body).buffer;",
  "else if(rt==='blob')resp=new Blob([body]);",
  "else resp=body;",
  "Object.defineProperty(x,'response',{value:resp,configurable:true});",
  "Object.defineProperty(x,'responseText',{value:(typeof body==='string'?body:''),configurable:true});",
  "Object.defineProperty(x,'responseURL',{value:x.__u||'',configurable:true});",
  "Object.defineProperty(x,'getResponseHeader',{value:function(n){return /content-type/i.test(n)?ct:null;},configurable:true});",
  "Object.defineProperty(x,'getAllResponseHeaders',{value:function(){return 'content-type: '+ct+'\\r\\n';},configurable:true});",
  "var e;",
  "try{e=new Event('readystatechange');}catch(_){e=document.createEvent('Event');e.initEvent('readystatechange',false,false);}",
  "x.dispatchEvent(e);",
  "try{e=new Event('load');}catch(_){e=document.createEvent('Event');e.initEvent('load',false,false);}",
  "x.dispatchEvent(e);",
  "try{e=new Event('loadend');}catch(_){e=document.createEvent('Event');e.initEvent('loadend',false,false);}",
  "x.dispatchEvent(e);",
  "}catch(e){window.__ltErr='fake:'+e;}}",

  "XMLHttpRequest.prototype.open=function(m,u){this.__u=u;this.__m=m;return OO.apply(this,arguments);};",
  "XMLHttpRequest.prototype.send=function(body){",
  "var self=this,u=String(this.__u||'');",
  // key 请求：直接吐 md5 字节
  "var mk=u.match(/\\/__ltk\\/([^\\/]+?)(\\.bin)?(\\?|$)/);",
  "if(mk){window.__ltKeyHit=(window.__ltKeyHit||0)+1;fake(self,_md5(decodeURIComponent(mk[1])),200,'application/octet-stream');return;}",
  // 拦截 l2media 播放列表 → 换成完整片
  "if(/\\/l2media\\/[^\\/]+\\.m3u8/.test(u)&&CUR){",
  "var cv=CUR;",
  "build(cv.av,cv.dur).then(function(t){",
  "if(!t){window.__ltNoSeg=1;return OS.apply(self,[body]);}",
  "window.__ltPlHit=(window.__ltPlHit||0)+1;",
  "fake(self,t,200,'application/vnd.apple.mpegurl');",
  "}).catch(function(e){window.__ltErr='pl:'+e;return OS.apply(self,[body]);});",
  "return;}",
  "return OS.apply(this,arguments);};",

  // fetch 侧同样处理
  "var OF=window.fetch;",
  "window.fetch=function(a,b){",
  "var u=(typeof a==='string')?a:((a&&a.url)||'');",
  "var mk=u.match(/\\/__ltk\\/([^\\/]+?)(\\.bin)?(\\?|$)/);",
  "if(mk)return Promise.resolve(new Response(new Uint8Array(_md5(decodeURIComponent(mk[1]))),{status:200,headers:{'Content-Type':'application/octet-stream'}}));",
  "if(/\\/l2media\\/[^\\/]+\\.m3u8/.test(u)&&CUR){",
  "var cv=CUR;",
  "return build(cv.av,cv.dur).then(function(t){",
  "if(!t)return OF.apply(this,arguments);",
  "window.__ltPlHit=(window.__ltPlHit||0)+1;",
  "return new Response(t,{status:200,headers:{'Content-Type':'application/vnd.apple.mpegurl'}});",
  "});}",
  "return OF.apply(this,arguments);};",

  /* ---------- JSON.parse 总入口 ---------- */
  "JSON.parse=function(s,rev){",
  "var o=_p(s,rev);",
  "try{",
  "if(o&&typeof o==='object'){",
  "if(has(o,'response')){app(o.response);}",
  "else if(has(o,'data')){",
  "var d=o.data;",
  "if(d&&d.avkey&&d.urls){",
  "CUR={av:String(d.avkey),dur:Number(d.duration)||0,id:d.id};",
  "window.__ltCURv=CUR;window.__ltRewrote=(window.__ltRewrote||0)+1;",
  "}",
  "if(!vip(d)&&isAd(d))o.data={};",
  "}",
  "scrub(o,0);",
  "}",
  "}catch(e){}",
  "return o;};",
  "})();</script>",
].join("");

/* ============================================================
 *  HTML 清洗
 * ============================================================ */
function clean(html) {
  const hit = { gtm: 0, ns: 0, dl: 0, inject: 0 };
  let h = String(html || "");

  // ① GTM 加载器（整段 IIFE）
  const reGtm = /<script>\(function\s*\(w,\s*d,\s*s,\s*l,\s*i\)[\s\S]*?\}\)\(window,\s*document,\s*"script",\s*"dataLayer",\s*"GTM-[A-Z0-9]+"\);\s*<\/script>/;
  if (reGtm.test(h)) { hit.gtm = 1; h = h.replace(reGtm, ""); }

  // ② <noscript> 里的 GTM iframe
  const reNs = /<noscript><iframe\s+src="https:\/\/www\.googletagmanager\.com\/ns\.html[^"]*"[\s\S]*?<\/iframe><\/noscript>/;
  if (reNs.test(h)) { hit.ns = 1; h = h.replace(reNs, ""); }

  // ③ dataLayer 保留数组形态但吞掉 push
  const reDl = /const\s+dataLayer\s*=\s*window\.dataLayer\s*\|\|\s*\[\s*\]\s*;/;
  if (reDl.test(h)) {
    hit.dl = 1;
    h = h.replace(reDl, 'const dataLayer = window.dataLayer = []; dataLayer.push = function () {};');
  }

  // ④ 兜底：开屏广告容器直接隐藏
  h = h.replace("</head>", '<style>.ga-splash-ad{display:none!important}</style></head>');

  // ⑤ 注入钩子 —— 必须在 module 主包之前
  const anchor = /<script\s+type="module"/;
  if (anchor.test(h)) {
    hit.inject = 1;
    h = h.replace(anchor, HOOK + '<script type="module"');
  }

  return { html: h, hit };
}

/* ============================================================
 *  QX 入口
 * ============================================================ */
function main() {
  try {
    const body = ($response && $response.body) || "";
    if (!body) return $done({});

    const head = body.slice(0, 512).toLowerCase();
    if (!(head.indexOf("<!doctype html") >= 0 || head.indexOf("<html") >= 0)) {
      return $done({}); // 非文档，原样放行
    }

    const r = clean(body);
    if (typeof $notify === "function" && r.hit.inject === 1) {
      $notify(
        "Lutube " + VER,
        "VIP 已解锁 · 广告已清 · 完整片源",
        "GTM:" + r.hit.gtm + " · 注入:" + r.hit.inject
      );
    }
    return $done({ body: r.html });
  } catch (e) {
    try { $done({}); } catch (_) {}
  }
}

if (typeof $done === "function") main();

/* Node 调试用 */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { clean, VER, HOOK };
}
