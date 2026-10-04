const express=require("express");
const crypto=require("crypto");
const catalog=require("./catalog.json");
const app=express();
const ytdlp=require("youtube-dl-exec");
const UA="Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1";
const KEY=Buffer.from("C5D58EF67A7584E4A29F6C35BBC4EB12","hex");
const DISCOVERY=["https://media.savetube.vip/api/random-cdn","https://media.savetube.me/api/random-cdn"];
const cache=new Map(), inFlight=new Map(), autoState=new Map();
app.use((req,res,next)=>{res.set("Access-Control-Allow-Origin","*");console.log("[REQ]",req.method,req.originalUrl);next()});
const metas=catalog.map(x=>({id:"khoai_"+x.videoId,type:"movie",name:x.title,poster:"https://i.ytimg.com/vi/"+x.videoId+"/hqdefault.jpg",posterShape:"landscape",background:"https://i.ytimg.com/vi/"+x.videoId+"/maxresdefault.jpg",description:"Khoai Lang Thang / Food & Travel",runtime:x.duration?Math.round(x.duration/60)+" min":undefined}));
const byId=new Map(metas.map(x=>[x.id,x]));
const HOA_URL="https://www.youtube.com/@HOABANFOOD/videos";
let hoaMetas=[],hoaById=new Map(),hoaLoad=null,hoaLoadedAt=0;
async function loadHoa(force=false){
  if(!force&&hoaMetas.length&&Date.now()-hoaLoadedAt<24*60*60*1000)return hoaMetas;
  if(hoaLoad)return hoaLoad;
  hoaLoad=(async()=>{
    console.log("[HOABAN-SCAN] start",HOA_URL);
    const info=await ytdlp(HOA_URL,{dumpSingleJson:true,flatPlaylist:true,noWarnings:true,ignoreErrors:true},{timeout:180000});
    const entries=Array.isArray(info.entries)?info.entries:[];
    const seen=new Set();
    hoaMetas=entries.filter(x=>x&&x.id&&!seen.has(x.id)&&seen.add(x.id)).map(x=>({id:"hoaban_"+x.id,type:"movie",name:x.title||x.id,poster:(x.thumbnail||("https://i.ytimg.com/vi/"+x.id+"/hqdefault.jpg")),posterShape:"landscape",background:"https://i.ytimg.com/vi/"+x.id+"/maxresdefault.jpg",description:"HOA BAN FOOD",runtime:x.duration?Math.round(x.duration/60)+" min":undefined}));
    hoaById=new Map(hoaMetas.map(x=>[x.id,x]));hoaLoadedAt=Date.now();
    console.log("[HOABAN-SCAN] done videos="+hoaMetas.length);
    return hoaMetas;
  })().finally(()=>{hoaLoad=null});return hoaLoad;
}
const manifest={id:"vn.ivyplay.youtube.khoailangthang",version:"3.13.0",name:"Khoai Lang Thang YouTube",description:"Direct CDN playback: Render resolves then redirects; media does not proxy through Render.",resources:["catalog",{name:"meta",types:["movie"],idPrefixes:["khoai_","hoaban_"]},{name:"stream",types:["movie"],idPrefixes:["khoai_","hoaban_"]}],types:["movie"],idPrefixes:["khoai_","hoaban_"],catalogs:[{type:"movie",id:"khoai-lang-thang",name:"Khoai Lang Thang"},{type:"movie",id:"hoa-ban-food",name:"HOA BAN FOOD"}],behaviorHints:{adult:false,p2pNotSupported:true}};
function timeout(ms){return AbortSignal.timeout(ms)}
function decrypt(enc){const raw=Buffer.from(String(enc).replace(/\s/g,""),"base64"),iv=raw.subarray(0,16);const d=crypto.createDecipheriv("aes-128-cbc",KEY,iv);return JSON.parse(Buffer.concat([d.update(raw.subarray(16)),d.final()]).toString("utf8"))}
async function cdn(){for(const ep of DISCOVERY){try{const r=await fetch(ep,{headers:{"User-Agent":UA,Accept:"application/json",Origin:"https://yt.savetube.me",Referer:"https://yt.savetube.me/"},signal:timeout(5000)});const j=await r.json();if(r.ok&&j?.cdn)return j.cdn}catch(e){console.log("[CDN-MISS]",ep,String(e))}}throw Error("No SaveTube CDN")}
async function context(id){const c=await cdn(),base="https://"+c,h={"Content-Type":"application/json",Accept:"application/json","User-Agent":UA,Origin:"https://yt.savetube.me",Referer:"https://yt.savetube.me/"};const r=await fetch(base+"/v2/info",{method:"POST",headers:h,body:JSON.stringify({url:"https://www.youtube.com/watch?v="+id}),signal:timeout(12000)});const j=await r.json();if(!r.ok||!j?.data)throw Error("SaveTube info "+r.status);return{base,h,info:decrypt(j.data),cdn:c}}
async function resolveQuality(id,q){const key=id+":"+q,hit=cache.get(key);if(hit&&hit.expires>Date.now())return hit;if(inFlight.has(key))return inFlight.get(key);const p=(async()=>{const c=await context(id);const r=await fetch(c.base+"/download",{method:"POST",headers:c.h,body:JSON.stringify({id,downloadType:"video",quality:q,key:c.info.key}),signal:timeout(12000)});const t=await r.text();let j;try{j=JSON.parse(t)}catch{}const data=j?.data||{};const url=data.downloadUrl||data.url||j?.downloadUrl;if(!r.ok||!url)throw Error("SaveTube download "+r.status);const reported=String(data.quality||data.resolution||data.height||q).replace(/p$/i,"");const v={url,quality:q,reportedQuality:reported,cdn:c.cdn,expires:Date.now()+90*60*1000};cache.set(key,v);console.log("[RESOLVED]",id,"requested="+q+"p","reported="+reported+"p",c.cdn);return v})().finally(()=>inFlight.delete(key));inFlight.set(key,p);return p}

async function resolveAuto(id){
  const hit=autoState.get(id);if(hit&&hit.expires>Date.now())return hit;
  const candidates=[["2160",0],["1440",120],["1080",350],["720",800],["480",1400],["360",2000]];
  return new Promise((resolve,reject)=>{
    let settled=false,left=candidates.length,last;
    for(const [quality,delay] of candidates)setTimeout(async()=>{
      try{
        const x=await resolveQuality(id,quality);
        if(!settled){settled=true;autoState.set(id,x);console.log("[AUTO-FALLBACK-SELECT]",id,quality+"p");resolve(x)}
      }catch(e){last=e;console.log("[AUTO-FALLBACK-MISS]",id,quality+"p",e.message)}
      finally{left--;if(!left&&!settled)reject(last||Error("No SaveTube quality"))}
    },delay);
  });
}

const SP_SECRET="487587d398cc3673d2cb6efbc78b77e761b6e637a192001d9f5766b61a7a1f5d";
const SP_TS="1788367131556";
function spCookies(headers){
  const a=typeof headers.getSetCookie==="function"?headers.getSetCookie():[headers.get("set-cookie")||""];
  return a.map(x=>x.split(";")[0]).filter(Boolean).join("; ");
}
async function socialPlug(id){
  const started=Date.now(),sf_url="https://www.youtube.com/watch?v="+id;
  const home=await fetch("https://socialplug.to/vi/",{headers:{"User-Agent":UA,Accept:"text/html"},signal:timeout(10000)});
  const cookie=spCookies(home.headers); if(!home.ok)throw Error("SocialPlug home "+home.status);
  const xs=decodeURIComponent((cookie.match(/(?:^|; )XSRF-TOKEN=([^;]+)/)||[])[1]||"");
  const common={"User-Agent":UA,Accept:"application/json, text/plain, */*","X-Requested-With":"XMLHttpRequest",Referer:"https://socialplug.to/vi/",Origin:"https://socialplug.to",Cookie:cookie};
  if(xs)common["X-XSRF-TOKEN"]=xs;
  const mr=await fetch("https://socialplug.to/msec",{headers:common,signal:timeout(8000)});
  if(!mr.ok)throw Error("SocialPlug msec "+mr.status);
  const ts=Date.now(),sig=crypto.createHash("sha256").update(sf_url+ts+SP_SECRET).digest("hex");
  const body=new URLSearchParams({sf_url,ts:String(ts),_ts:SP_TS,_tsc:"0",_s:sig});
  const cr=await fetch("https://socialplug.to/api/convert",{method:"POST",headers:{...common,"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8"},body,signal:timeout(15000)});
  const text=await cr.text(); let j;try{j=JSON.parse(text)}catch{}
  if(!cr.ok||!j?.id)throw Error("SocialPlug convert "+cr.status+" "+text.slice(0,120));
  const urls=Array.isArray(j.url)?j.url:[];
  const muxed=urls.filter(x=>x.url&&x.audio!==false&&x.no_audio!==true).sort((a,b)=>(b.qualityNumber||0)-(a.qualityNumber||0));
  const mp4=j?.stream?.mp4||{};
  console.log("[SOCIALPLUG-OK]",id,"ms="+(Date.now()-started),"qualities="+(j.video_quality||[]).join(","),"muxed="+muxed.length);
  return {provider:"socialplug",ms:Date.now()-started,id:j.id,title:j.meta?.title,video_quality:j.video_quality||[],all:urls.filter(x=>x.url).map(x=>({quality:x.qualityNumber||x.quality,itag:x.itag,url:x.url,type:x.type||null,ext:x.ext||null,contentLength:x.contentLength||x.filesize||null,videoCodec:x.videoCodec||null,audioCodec:x.audioCodec||null,audio:x.audio,no_audio:x.no_audio})),muxed:muxed.map(x=>({quality:x.qualityNumber||x.quality,itag:x.itag,url:x.url})),local:Object.fromEntries(Object.entries(mp4).map(([q,v])=>[q,{quality:v.quality,streams:v.streams||[]}]))};
}
app.get("/socialplug/:id",async(q,r)=>{try{const x=await socialPlug(q.params.id);r.set("Cache-Control","no-store");r.json(x)}catch(e){console.error("[SOCIALPLUG-FAIL]",q.params.id,e.message);r.status(502).json({error:e.message})}});
const spPlayCache=new Map(),spPlayFlight=new Map();
async function resolveSocialPlay(id){
  const hit=spPlayCache.get(id);if(hit&&hit.expires>Date.now())return hit;
  if(spPlayFlight.has(id))return spPlayFlight.get(id);
  const p=(async()=>{
    const x=await socialPlug(id);
    const candidates=x.muxed.filter(v=>v.url).sort((a,b)=>(+b.quality||0)-(+a.quality||0));
    if(!candidates.length)throw Error("SocialPlug returned no muxed playable URL");
    const best=candidates[0],out={url:best.url,quality:+best.quality||best.quality,itag:best.itag,provider:"socialplug",expires:Date.now()+10*60*1000};
    spPlayCache.set(id,out);
    console.log("[SOCIALPLUG-PLAY-SELECT]",id,"quality="+out.quality+"p","itag="+out.itag);
    return out;
  })().finally(()=>spPlayFlight.delete(id));
  spPlayFlight.set(id,p);return p;
}
const spAdaptiveCache=new Map();
function xml(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;")}
function rangeFromUrl(u,key){
  try{const x=new URL(u),v=x.searchParams.get(key);if(!v)return null;const m=v.match(/^(\d+)-(\d+)$/);return m?{start:+m[1],end:+m[2]}:null}catch{return null}
}
function durationFromUrl(u){
  try{return +(new URL(u).searchParams.get("dur")||0)}catch{return 0}
}
function pickSpFormats(x){
  const mp4=x.all.filter(v=>v.url&&v.ext==="mp4"&&!v.audio&&v.no_audio===true&&+v.quality<=1080)
    .sort((a,b)=>+a.quality-+b.quality);
  const av1=x.all.filter(v=>v.url&&v.ext==="mp4"&&!v.audio&&v.no_audio===true&&v.videoCodec==="av01"&&+v.quality>1080)
    .sort((a,b)=>+a.quality-+b.quality);
  const audio=x.all.filter(v=>v.url&&v.audio===true&&v.ext==="m4a").sort((a,b)=>+b.quality-+a.quality)[0];
  return {videos:[...mp4,...av1],audio};
}
async function socialPlugDash(id){
  const hit=spAdaptiveCache.get(id);if(hit&&hit.expires>Date.now())return hit;
  const x=await socialPlug(id),f=pickSpFormats(x);
  if(!f.videos.length||!f.audio)throw Error("SocialPlug adaptive formats missing");
  const dur=durationFromUrl(f.videos[0].url)||durationFromUrl(f.audio.url)||0;
  const out={...f,dur,expires:Date.now()+15*60*1000};spAdaptiveCache.set(id,out);
  console.log("[ABR-SOCIALPLUG]",id,"formats="+f.videos.map(v=>v.quality+"p/i"+v.itag).join(","),"audio=i"+f.audio.itag,"max="+Math.max(...f.videos.map(v=>+v.quality))+"p");
  return out;
}
app.get("/adaptive/:id/manifest.mpd",async(q,r)=>{try{
  const id=q.params.id,x=await socialPlugDash(id),dims={144:[256,144],240:[426,240],360:[640,360],480:[854,480],720:[1280,720],1080:[1920,1080],1440:[2560,1440],2160:[3840,2160]};
  const reps=x.videos.map(v=>{const [w,h]=dims[v.quality]||[0,+v.quality],bw=Math.max(100000,Math.round((+v.contentLength||1)*8/Math.max(1,x.dur)));const codec=v.videoCodec==="av01"?"av01.0.08M.08":"avc1.640028";return '<Representation id="v'+v.itag+'" bandwidth="'+bw+'" width="'+w+'" height="'+h+'" codecs="'+codec+'" mimeType="video/mp4"><BaseURL>'+xml(v.url)+'</BaseURL><SegmentBase indexRangeExact="true"/></Representation>'}).join("");
  const a=x.audio,abw=Math.max(64000,Math.round((+a.contentLength||1)*8/Math.max(1,x.dur)));
  const mpd='<?xml version="1.0" encoding="UTF-8"?><MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT'+x.dur+'S" minBufferTime="PT2S" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011"><Period><AdaptationSet contentType="video" segmentAlignment="true" startWithSAP="1">'+reps+'</AdaptationSet><AdaptationSet contentType="audio" segmentAlignment="true"><Representation id="a'+a.itag+'" bandwidth="'+abw+'" codecs="mp4a.40.2" mimeType="audio/mp4"><BaseURL>'+xml(a.url)+'</BaseURL><SegmentBase indexRangeExact="true"/></Representation></AdaptationSet></Period></MPD>';
  console.log("[ABR-MANIFEST]",id,"variants="+x.videos.length,"max="+Math.max(...x.videos.map(v=>+v.quality))+"p");
  r.set({"Content-Type":"application/dash+xml","Cache-Control":"no-store","Access-Control-Allow-Origin":"*"}).send(mpd)
}catch(e){console.error("[ABR-MANIFEST-FAIL]",q.params.id,e.message);r.status(502).json({error:e.message})}});
app.get("/",(_,r)=>r.json({ok:true,name:manifest.name,version:manifest.version,videos:metas.length,cache:cache.size}));
app.get("/manifest.json",(_,r)=>r.json(manifest));
app.get("/player",(_,r)=>r.sendFile("player.html",{root:__dirname}));
app.get("/play/:id/:quality.mp4",async(q,r)=>{try{const quality=String(q.params.quality);if(quality!=="auto")return r.status(400).json({error:"Production playback is SocialPlug AUTO only"});const x=await resolveSocialPlay(q.params.id);console.log("[SOCIALPLUG-PLAY-REDIRECT]",q.params.id,"quality="+x.quality+"p","itag="+x.itag);r.set({"Cache-Control":"no-store","Access-Control-Allow-Origin":"*","Location":x.url});return r.status(302).end()}catch(e){console.error("[SOCIALPLUG-PLAY-FAIL]",q.params.id,e.message);r.status(502).json({error:e.message})}});
app.get("/catalog/movie/khoai-lang-thang.json",(_,r)=>r.json({metas}));
app.get("/catalog/movie/khoai-lang-thang/:extra.json",(_,r)=>r.json({metas}));
app.get("/catalog/movie/hoa-ban-food.json",async(_,r)=>{try{r.json({metas:await loadHoa()})}catch(e){console.error("[HOABAN-CATALOG-FAIL]",e.message);r.status(502).json({metas:[],error:e.message})}});
app.get("/catalog/movie/hoa-ban-food/:extra.json",async(_,r)=>{try{r.json({metas:await loadHoa()})}catch(e){console.error("[HOABAN-CATALOG-FAIL]",e.message);r.status(502).json({metas:[],error:e.message})}});
app.get("/hoaban/refresh",async(_,r)=>{try{const x=await loadHoa(true);r.json({ok:true,videos:x.length})}catch(e){r.status(502).json({ok:false,error:e.message})}});
app.get("/meta/movie/:id.json",async(q,r)=>{let m=byId.get(q.params.id);if(!m&&q.params.id.startsWith("hoaban_")){try{await loadHoa();m=hoaById.get(q.params.id)}catch(e){console.error("[HOABAN-META-FAIL]",e.message)}}return m?r.json({meta:m}):r.status(404).json({meta:null})});
app.get("/stream/movie/:id.json",(q,r)=>{const p=q.params.id;const id=p.startsWith("khoai_")?p.slice(6):p.startsWith("hoaban_")?p.slice(7):"";return id?r.json({streams:[{name:"YouTube • AUTO",title:"SocialPlug • AUTO",url:`${q.protocol}://${q.get("host")}/play/${id}/auto.mp4`,behaviorHints:{notWebReady:true}}]}):r.json({streams:[]})});
app.get("/adaptive/:id/master.m3u8",async(q,r)=>{try{const id=q.params.id;const qualities=[["2160",18000000],["1440",10000000],["1080",6000000],["720",3000000],["480",1500000],["360",800000]];const out=["#EXTM3U","#EXT-X-VERSION:3","#EXT-X-INDEPENDENT-SEGMENTS"];for(const [quality,bw] of qualities){try{const x=await resolveQuality(id,quality);out.push("#EXT-X-STREAM-INF:BANDWIDTH="+bw+",AVERAGE-BANDWIDTH="+Math.round(bw*.8)+",RESOLUTION="+({2160:"3840x2160",1440:"2560x1440",1080:"1920x1080",720:"1280x720",480:"854x480",360:"640x360"})[quality]+",NAME=\""+quality+"p\"");out.push(x.url)}catch(e){console.log("[ADAPTIVE-MISS]",id,quality+"p",e.message)}}if(out.length===3)throw Error("No adaptive variants");console.log("[ADAPTIVE-MASTER]",id,"variants="+((out.length-3)/2));r.set({"Content-Type":"application/vnd.apple.mpegurl","Cache-Control":"no-store","Access-Control-Allow-Origin":"*"});r.send(out.join("\n")+"\n")}catch(e){console.error("[ADAPTIVE-FAIL]",q.params.id,e.message);r.status(502).json({error:e.message})}});
app.get("/formats/:id",async(q,r)=>{const qualities=["2160","1440","1080","720","480","360"];const formats=[];for(const quality of qualities){try{const x=await resolveQuality(q.params.id,quality);formats.push({quality:Number(quality),reportedQuality:Number(x.reportedQuality)||x.reportedQuality,url:x.url,cdn:x.cdn})}catch(e){console.log("[FORMAT-MISS]",q.params.id,quality+"p",e.message)}}r.set("Cache-Control","no-store");r.json({videoId:q.params.id,preferred:"highest",formats})});
app.get("/resolve/:id",async(q,r)=>{try{const x=await resolveSocialPlay(q.params.id);r.set("Cache-Control","no-store");r.json({videoId:q.params.id,provider:x.provider,quality:x.quality,itag:x.itag,url:x.url})}catch(e){console.error("[SOCIALPLUG-RESOLVE-FAIL]",q.params.id,e.message);r.status(502).json({error:e.message})}});
app.get("/play/:id/auto.mp4",async(q,r)=>{try{const x=await resolveSocialPlay(q.params.id);console.log("[SOCIALPLUG-PLAY-REDIRECT]",q.params.id,"quality="+x.quality+"p","itag="+x.itag);r.set({"Cache-Control":"no-store","Access-Control-Allow-Origin":"*","Location":x.url});r.status(302).end()}catch(e){console.error("[SOCIALPLUG-PLAY-FAIL]",q.params.id,e.message);r.status(502).json({error:e.message})}});
app.listen(process.env.PORT||3000,"0.0.0.0",()=>{console.log("Khoai addon",manifest.version,"videos",metas.length);loadHoa().catch(e=>console.error("[HOABAN-SCAN-FAIL]",e.message));setTimeout(async()=>{try{const x=await socialPlug("AjSxpi8E9WE");console.log("[SELFTEST-SOCIALPLUG] OK","ms="+x.ms,"qualities="+x.video_quality.join(","),"muxed="+x.muxed.length)}catch(e){console.error("[SELFTEST-SOCIALPLUG] FAIL",e.message)}},3500);setTimeout(async()=>{const id="rJiDjip4Hrc";try{const info=await ytdlp("https://www.youtube.com/watch?v="+id,{dumpSingleJson:true,noWarnings:true,skipDownload:true,extractorArgs:"youtube:player_client=visionos"},{timeout:60000});const fs=(info.formats||[]).filter(f=>f.url);console.log("[SELFTEST-VISIONOS] OK",id,"formats="+fs.length,"max="+Math.max(0,...fs.map(f=>f.height||0)),"audio="+fs.filter(f=>f.acodec&&f.acodec!=="none").length)}catch(e){console.error("[SELFTEST-VISIONOS] FAIL",id,String(e.stderr||e.message||e).slice(0,1200))}},5000)});
