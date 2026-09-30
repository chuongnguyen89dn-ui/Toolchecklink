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
const manifest={id:"vn.ivyplay.youtube.khoailangthang",version:"3.11.0",name:"Khoai Lang Thang YouTube",description:"Direct CDN playback: Render resolves then redirects; media does not proxy through Render.",resources:["catalog",{name:"meta",types:["movie"],idPrefixes:["khoai_"]},{name:"stream",types:["movie"],idPrefixes:["khoai_"]}],types:["movie"],idPrefixes:["khoai_"],catalogs:[{type:"movie",id:"khoai-lang-thang",name:"Khoai Lang Thang"}],behaviorHints:{adult:false,p2pNotSupported:true}};
function timeout(ms){return AbortSignal.timeout(ms)}
function decrypt(enc){const raw=Buffer.from(String(enc).replace(/\s/g,""),"base64"),iv=raw.subarray(0,16);const d=crypto.createDecipheriv("aes-128-cbc",KEY,iv);return JSON.parse(Buffer.concat([d.update(raw.subarray(16)),d.final()]).toString("utf8"))}
async function cdn(){for(const ep of DISCOVERY){try{const r=await fetch(ep,{headers:{"User-Agent":UA,Accept:"application/json",Origin:"https://yt.savetube.me",Referer:"https://yt.savetube.me/"},signal:timeout(5000)});const j=await r.json();if(r.ok&&j?.cdn)return j.cdn}catch(e){console.log("[CDN-MISS]",ep,String(e))}}throw Error("No SaveTube CDN")}
async function context(id){const c=await cdn(),base="https://"+c,h={"Content-Type":"application/json",Accept:"application/json","User-Agent":UA,Origin:"https://yt.savetube.me",Referer:"https://yt.savetube.me/"};const r=await fetch(base+"/v2/info",{method:"POST",headers:h,body:JSON.stringify({url:"https://www.youtube.com/watch?v="+id}),signal:timeout(12000)});const j=await r.json();if(!r.ok||!j?.data)throw Error("SaveTube info "+r.status);return{base,h,info:decrypt(j.data),cdn:c}}
async function resolveQuality(id,q){const key=id+":"+q,hit=cache.get(key);if(hit&&hit.expires>Date.now())return hit;if(inFlight.has(key))return inFlight.get(key);const p=(async()=>{const c=await context(id);const r=await fetch(c.base+"/download",{method:"POST",headers:c.h,body:JSON.stringify({id,downloadType:"video",quality:q,key:c.info.key}),signal:timeout(12000)});const t=await r.text();let j;try{j=JSON.parse(t)}catch{}const data=j?.data||{};const url=data.downloadUrl||data.url||j?.downloadUrl;if(!r.ok||!url)throw Error("SaveTube download "+r.status);const reported=String(data.quality||data.resolution||data.height||q).replace(/p$/i,"");const v={url,quality:q,reportedQuality:reported,cdn:c.cdn,expires:Date.now()+90*60*1000};cache.set(key,v);console.log("[RESOLVED]",id,"requested="+q+"p","reported="+reported+"p",c.cdn);return v})().finally(()=>inFlight.delete(key));inFlight.set(key,p);return p}

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
const spAdaptiveCache=new Map();
function xml(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;")}
function mp4Sidx(buf){
  let p=0;
  while(p+8<=buf.length){
    let size=buf.readUInt32BE(p),head=8; const type=buf.toString("ascii",p+4,p+8);
    if(size===1&&p+16<=buf.length){size=Number(buf.readBigUInt64BE(p+8));head=16}
    if(size<8)break;
    if(type==="sidx")return {start:p,end:p+size-1,initEnd:p-1};
    p+=size;
  }
  return null;
}
async function spIndex(url){
  const r=await fetch(url,{headers:{"User-Agent":UA,Accept:"*/*",Range:"bytes=0-524287",Referer:"https://socialplug.to/vi/"},signal:timeout(12000)});
  if(!r.ok&&r.status!==206)throw Error("SocialPlug range "+r.status);
  const b=Buffer.from(await r.arrayBuffer()),idx=mp4Sidx(b);
  if(!idx)throw Error("No MP4 sidx in first "+b.length+" bytes");
  return idx;
}
async function socialPlugDash(id){
  const hit=spAdaptiveCache.get(id); if(hit&&hit.expires>Date.now())return hit;
  const x=await socialPlug(id), qs=["360","480","720","1080","1440","2160"];
  const entries=qs.map(q=>({q,streams:x.local[q]?.streams||[]})).filter(v=>v.streams.length>=2);
  if(!entries.length)throw Error("SocialPlug returned no adaptive MP4 pairs");
  const audioPath=entries[0].streams[1],audioUrl="https://socialplug.to"+audioPath;
  const audioIdx=await spIndex(audioUrl);
  const videos=[];
  for(const e of entries){
    try{
      const url="https://socialplug.to"+e.streams[0],idx=await spIndex(url);
      const raw=x.all.find(v=>String(v.quality)===e.q&&!v.audio&&v.ext==="mp4");
      videos.push({q:e.q,url,idx,codec:raw?.videoCodec||(+e.q>1080?"av01":"avc1"),bytes:+raw?.contentLength||0});
    }catch(err){console.log("[SP-DASH-MISS]",id,e.q,err.message)}
  }
  if(!videos.length)throw Error("No indexed SocialPlug video representations");
  const out={videos,audio:{url:audioUrl,idx:audioIdx},expires:Date.now()+20*60*1000}; spAdaptiveCache.set(id,out);
  console.log("[SP-DASH-READY]",id,"qualities="+videos.map(v=>v.q).join(","));
  return out;
}
app.get("/adaptive/:id/manifest.mpd",async(q,r)=>{try{
  const id=q.params.id,x=await socialPlugDash(id),dims={360:[640,360],480:[854,480],720:[1280,720],1080:[1920,1080],1440:[2560,1440],2160:[3840,2160]};
  const reps=x.videos.map(v=>{const [w,h]=dims[v.q],bw=v.bytes?Math.max(300000,Math.round(v.bytes*8/3432)):({360:700000,480:1200000,720:2500000,1080:5000000,1440:9000000,2160:16000000}[v.q]);const codec=v.codec==="av01"?"av01.0.08M.08":"avc1.640028";return '<Representation id="v'+v.q+'" bandwidth="'+bw+'" width="'+w+'" height="'+h+'" codecs="'+codec+'" mimeType="video/mp4"><BaseURL>'+xml(v.url)+'</BaseURL><SegmentBase indexRange="'+v.idx.start+'-'+v.idx.end+'"><Initialization range="0-'+v.idx.initEnd+'"/></SegmentBase></Representation>'}).join("");
  const a=x.audio;
  const mpd='<?xml version="1.0" encoding="UTF-8"?><MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT3432S" minBufferTime="PT2S" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011"><Period><AdaptationSet contentType="video" segmentAlignment="true" startWithSAP="1">'+reps+'</AdaptationSet><AdaptationSet contentType="audio" segmentAlignment="true"><Representation id="a140" bandwidth="134000" audioSamplingRate="44100" codecs="mp4a.40.2" mimeType="audio/mp4"><BaseURL>'+xml(a.url)+'</BaseURL><SegmentBase indexRange="'+a.idx.start+'-'+a.idx.end+'"><Initialization range="0-'+a.idx.initEnd+'"/></SegmentBase></Representation></AdaptationSet></Period></MPD>';
  console.log("[SP-DASH-MPD]",id,"max="+Math.max(...x.videos.map(v=>+v.q))+"p","variants="+x.videos.length);
  r.set({"Content-Type":"application/dash+xml","Cache-Control":"no-store","Access-Control-Allow-Origin":"*"}).send(mpd)
}catch(e){console.error("[SP-DASH-FAIL]",q.params.id,e.message);r.status(502).json({error:e.message})}});

async function resolveAuto(id){
  // Fast-start: give HD a short head start, without sequential 4K timeouts.
  // This endpoint returns one progressive URL; true mid-play ABR requires HLS/DASH/player support.
  const candidates=[["2160",0],["1440",120],["1080",350],["720",800],["480",1400],["360",2000]];
  return new Promise((resolve,reject)=>{let settled=false,failed=0;for(const [quality,delay] of candidates){setTimeout(async()=>{if(settled)return;try{const x=await resolveQuality(id,quality);if(!settled){settled=true;console.log("[AUTO-4K-SELECT]",id,quality+"p");resolve(x)}}catch(e){failed++;console.log("[AUTO-4K-MISS]",id,quality+"p",e.message);if(failed===candidates.length&&!settled)reject(Error("No fast-start playable URL"))}},delay)}});
}
function downgradeAuto(id){const qs=["2160","1440","1080","720","480","360"];const st=autoState.get(id)||{idx:0,last:Date.now()};const next=Math.min(st.idx+1,qs.length-1);autoState.set(id,{idx:next,last:Date.now()});console.log("[AUTO-DOWNGRADE]",id,qs[st.idx]||qs[0],"->",qs[next]);return qs[next]}
app.get("/",(_,r)=>r.json({ok:true,name:manifest.name,version:manifest.version,videos:metas.length,cache:cache.size}));
app.get("/manifest.json",(_,r)=>r.json(manifest));
app.get("/player",(_,r)=>r.sendFile("player.html",{root:__dirname}));
app.get("/play/:id/:quality.mp4",async(q,r)=>{try{const quality=String(q.params.quality);if(quality==="auto"){const x=await resolveAuto(q.params.id);console.log("[DIRECT-PLAY-AUTO]",q.params.id,"requested="+x.quality+"p","reported="+x.reportedQuality+"p",x.cdn);r.set({"Cache-Control":"no-store","Access-Control-Allow-Origin":"*","Location":x.url});return r.status(302).end()}if(!["2160","1440","1080","720","480","360"].includes(quality))return r.status(400).json({error:"Unsupported quality"});const x=await resolveQuality(q.params.id,quality);console.log("[DIRECT-PLAY]",q.params.id,"requested="+x.quality+"p","reported="+x.reportedQuality+"p",x.cdn);r.set({"Cache-Control":"no-store","Access-Control-Allow-Origin":"*","Location":x.url});r.status(302).end()}catch(e){console.error("[DIRECT-PLAY-FAIL]",q.params.id,e.message);r.status(502).json({error:e.message})}});
app.get("/catalog/movie/khoai-lang-thang.json",(_,r)=>r.json({metas}));
app.get("/catalog/movie/khoai-lang-thang/:extra.json",(_,r)=>r.json({metas}));
app.get("/meta/movie/:id.json",(q,r)=>{const m=byId.get(q.params.id);return m?r.json({meta:m}):r.status(404).json({meta:null})});
app.get("/stream/movie/:id.json",(q,r)=>{const id=q.params.id.startsWith("khoai_")?q.params.id.slice(6):"";return id?r.json({streams:[{name:"YouTube • AUTO",title:"AUTO 4K • network fallback",url:`${q.protocol}://${q.get("host")}/adaptive/${id}/manifest.mpd`,behaviorHints:{notWebReady:true}}]}):r.json({streams:[]})});
let ytDirectPromise;
async function ytDirect(){
  if(!ytDirectPromise)ytDirectPromise=import("youtubei.js").then(async m=>m.Innertube.create({retrieve_player:true}));
  return ytDirectPromise;
}
async function resolveYtDirect(id){
  const yt=await ytDirect();
  const info=await yt.getBasicInfo(id);
  const all=[...(info.streaming_data?.formats||[]),...(info.streaming_data?.adaptive_formats||[])];
  const muxed=all.filter(f=>f.has_audio&&f.has_video).sort((a,b)=>(b.height||0)-(a.height||0));
  if(!muxed.length)throw Error("YouTube.js returned no muxed playable formats");
  for(const f of muxed){
    try{
      const url=await f.decipher(yt.session.player);
      if(url){console.log("[YTJS-SELECT]",id,(f.quality_label||f.quality||f.height),"itag="+f.itag);return {url,format:f}}
    }catch(e){console.log("[YTJS-DECIPHER-MISS]",id,"itag="+f.itag,e.message)}
  }
  throw Error("YouTube.js could not decipher a playable URL");
}
app.get("/ytplay/:id",async(q,r)=>{
  try{
    const x=await resolveYtDirect(q.params.id);
    r.set({"Cache-Control":"no-store","Access-Control-Allow-Origin":"*","Location":x.url});
    return r.status(302).end();
  }catch(e){console.error("[YTJS-PLAY-FAIL]",q.params.id,e.message);return r.status(502).json({error:e.message})}
});
app.get("/ytdlp-visionos/:id",async(q,r)=>{
  try{
    const id=q.params.id;
    const info=await ytdlp("https://www.youtube.com/watch?v="+id,{dumpSingleJson:true,noWarnings:true,skipDownload:true,extractorArgs:"youtube:player_client=visionos"},{timeout:60000});
    const formats=(info.formats||[]).filter(f=>f.url).map(f=>({format_id:f.format_id,height:f.height,width:f.width,ext:f.ext,vcodec:f.vcodec,acodec:f.acodec,protocol:f.protocol,filesize:f.filesize||f.filesize_approx||null,url:f.url}));
    const max=Math.max(0,...formats.map(f=>f.height||0));
    const audio=formats.filter(f=>f.acodec&&f.acodec!=="none").length;
    console.log("[YTDLP-VISIONOS]",id,"formats="+formats.length,"max="+max,"audio="+audio);
    r.set("Cache-Control","no-store");r.json({id,title:info.title,client:"visionos",count:formats.length,maxHeight:max,audio,formats});
  }catch(e){console.error("[YTDLP-VISIONOS-FAIL]",q.params.id,String(e.stderr||e.message||e).slice(0,1200));r.status(502).json({error:String(e.stderr||e.message||e).slice(0,1200)})}
});
app.get("/ytdlp/:id",async(q,r)=>{
  try{
    const id=q.params.id;
    const info=await ytdlp("https://www.youtube.com/watch?v="+id,{dumpSingleJson:true,noWarnings:true,skipDownload:true,extractorArgs:'youtube:player_client=mweb;youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416'},{timeout:60000});
    const formats=(info.formats||[]).filter(f=>f.url).map(f=>({format_id:f.format_id,height:f.height,width:f.width,ext:f.ext,vcodec:f.vcodec,acodec:f.acodec,protocol:f.protocol,filesize:f.filesize||f.filesize_approx||null,url:f.url}));
    const max=Math.max(0,...formats.map(f=>f.height||0));
    console.log("[YTDLP]",id,"formats="+formats.length,"max="+max);
    r.set("Cache-Control","no-store");r.json({id,title:info.title,count:formats.length,maxHeight:max,formats});
  }catch(e){console.error("[YTDLP-FAIL]",q.params.id,String(e.stderr||e.message||e).slice(0,1200));r.status(502).json({error:String(e.stderr||e.message||e).slice(0,1200)})}
});
app.get("/ytjs/:id",async(q,r)=>{
  try{
    const yt=await ytDirect();
    const info=await yt.getBasicInfo(q.params.id);
    const all=[...(info.streaming_data?.formats||[]),...(info.streaming_data?.adaptive_formats||[])];
    const formats=await Promise.all(all.map(async f=>({
      itag:f.itag,quality:f.quality_label||f.quality,height:f.height,width:f.width,
      bitrate:f.bitrate,mimeType:f.mime_type||f.mimeType,
      audio:!!f.has_audio,video:!!f.has_video,
      url:await f.decipher(yt.session.player).catch(()=>null)
    })));
    console.log("[YTJS]",q.params.id,"formats="+formats.length,"max="+Math.max(0,...formats.map(x=>x.height||0)));
    r.json({id:q.params.id,count:formats.length,maxHeight:Math.max(0,...formats.map(x=>x.height||0)),formats});
  }catch(e){console.error("[YTJS-FAIL]",q.params.id,e.message);r.status(502).json({error:e.message})}
});
app.get("/inspect/:id",async(q,r)=>{try{const c=await context(q.params.id);const i=c.info||{};const formats=i.video_formats||i.videoFormats||i.formats||[];const safe=formats.map(f=>({height:f.height,quality:f.quality,label:f.label,mimeType:f.mimeType||f.mime_type,type:f.type,ext:f.ext,hasUrl:!!f.url}));const keys=Object.keys(i).filter(k=>/hls|dash|manifest|format|quality/i.test(k));const manifests={};for(const k of keys){if(/hls|dash|manifest/i.test(k))manifests[k]=typeof i[k]==="string"?i[k].slice(0,120):i[k]}console.log("[INSPECT]",q.params.id,"keys="+keys.join(","),"formats="+safe.length,"manifests="+Object.keys(manifests).join(","));r.json({videoId:q.params.id,keys,formats:safe,manifests})}catch(e){console.error("[INSPECT-FAIL]",q.params.id,e.message);r.status(502).json({error:e.message})}});
app.get("/adaptive/:id/master.m3u8",async(q,r)=>{try{const id=q.params.id;const qualities=[["2160",18000000],["1440",10000000],["1080",6000000],["720",3000000],["480",1500000],["360",800000]];const out=["#EXTM3U","#EXT-X-VERSION:3","#EXT-X-INDEPENDENT-SEGMENTS"];for(const [quality,bw] of qualities){try{const x=await resolveQuality(id,quality);out.push("#EXT-X-STREAM-INF:BANDWIDTH="+bw+",AVERAGE-BANDWIDTH="+Math.round(bw*.8)+",RESOLUTION="+({2160:"3840x2160",1440:"2560x1440",1080:"1920x1080",720:"1280x720",480:"854x480",360:"640x360"})[quality]+",NAME=\""+quality+"p\"");out.push(x.url)}catch(e){console.log("[ADAPTIVE-MISS]",id,quality+"p",e.message)}}if(out.length===3)throw Error("No adaptive variants");console.log("[ADAPTIVE-MASTER]",id,"variants="+((out.length-3)/2));r.set({"Content-Type":"application/vnd.apple.mpegurl","Cache-Control":"no-store","Access-Control-Allow-Origin":"*"});r.send(out.join("\n")+"\n")}catch(e){console.error("[ADAPTIVE-FAIL]",q.params.id,e.message);r.status(502).json({error:e.message})}});
app.get("/formats/:id",async(q,r)=>{const qualities=["2160","1440","1080","720","480","360"];const formats=[];for(const quality of qualities){try{const x=await resolveQuality(q.params.id,quality);formats.push({quality:Number(quality),reportedQuality:Number(x.reportedQuality)||x.reportedQuality,url:x.url,cdn:x.cdn})}catch(e){console.log("[FORMAT-MISS]",q.params.id,quality+"p",e.message)}}r.set("Cache-Control","no-store");r.json({videoId:q.params.id,preferred:"highest",formats})});
app.get("/resolve/:id",async(q,r)=>{try{const x=await resolveAuto(q.params.id);r.set("Cache-Control","no-store");r.json({videoId:q.params.id,requestedQuality:x.quality,reportedQuality:x.reportedQuality,url:x.url,cdn:x.cdn})}catch(e){console.error("[RESOLVE-FAIL]",q.params.id,e.message);r.status(502).json({error:e.message})}});
app.get("/play/:id/auto.mp4",async(q,r)=>{try{const id=q.params.id;const x=await resolveAuto(id);console.log("[PLAY-REDIRECT-STABLE]",id,"requested="+x.quality+"p","reported="+x.reportedQuality+"p",x.cdn);r.set({"Cache-Control":"no-store","Access-Control-Allow-Origin":"*","Location":x.url});r.status(302).end()}catch(e){console.error("[PLAY-FAIL]",q.params.id,e.message);r.status(502).json({error:e.message})}});
app.listen(process.env.PORT||3000,"0.0.0.0",()=>{console.log("Khoai addon",manifest.version,"videos",metas.length);setTimeout(async()=>{try{const x=await resolveAuto("B1qT38bVsXc");console.log("[SELFTEST] SaveTube OK","requested="+x.quality+"p","reported="+x.reportedQuality+"p",x.cdn)}catch(e){console.error("[SELFTEST] SaveTube FAILED",e.message)}},1500);setTimeout(async()=>{try{const x=await socialPlug("AjSxpi8E9WE");console.log("[SELFTEST-SOCIALPLUG] OK","ms="+x.ms,"qualities="+x.video_quality.join(","),"muxed="+x.muxed.length)}catch(e){console.error("[SELFTEST-SOCIALPLUG] FAIL",e.message)}},3500);setTimeout(async()=>{try{const x=await resolveAuto("AjSxpi8E9WE");console.log("[SELFTEST-AUTO4K] OK","selected="+x.quality+"p","reported="+x.reportedQuality+"p","cdn="+x.cdn)}catch(e){console.error("[SELFTEST-AUTO4K] FAIL",e.message)}},4500);setTimeout(async()=>{const id="rJiDjip4Hrc";try{const info=await ytdlp("https://www.youtube.com/watch?v="+id,{dumpSingleJson:true,noWarnings:true,skipDownload:true,extractorArgs:"youtube:player_client=visionos"},{timeout:60000});const fs=(info.formats||[]).filter(f=>f.url);console.log("[SELFTEST-VISIONOS] OK",id,"formats="+fs.length,"max="+Math.max(0,...fs.map(f=>f.height||0)),"audio="+fs.filter(f=>f.acodec&&f.acodec!=="none").length)}catch(e){console.error("[SELFTEST-VISIONOS] FAIL",id,String(e.stderr||e.message||e).slice(0,1200))}},5000)});
