const express=require("express");
const crypto=require("crypto");
const catalog=require("./catalog.json");
const app=express();
const {router:film4kRouter}=require("./film4k_adapter");
app.use("/film4k",film4kRouter);
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

const EXTRA_CHANNELS=[
  {key:"bombom",prefix:"bombom_",catalog:"bom-bom-vlog",name:"BomBom Vlog",handle:"@bombomvlog0310",url:"https://www.youtube.com/@bombomvlog0310/videos"},
  {key:"sang",prefix:"sang_",catalog:"sang-vlog",name:"Sang vlog",handle:"@sangvlog9",url:"https://www.youtube.com/@sangvlog9/videos"}
];
const extraState=new Map(EXTRA_CHANNELS.map(c=>[c.key,{metas:[],byId:new Map(),load:null,loadedAt:0,channelId:null}]));
async function loadExtra(c,force=false){
 const st=extraState.get(c.key);if(!force&&st.metas.length&&Date.now()-st.loadedAt<86400000)return st.metas;if(st.load)return st.load;
 st.load=(async()=>{console.log("["+c.key.toUpperCase()+"-SCAN] start",c.url);const info=await ytdlp(c.url,{dumpSingleJson:true,flatPlaylist:true,noWarnings:true,ignoreErrors:true},{timeout:180000});const entries=Array.isArray(info.entries)?info.entries:[];st.channelId=info.channel_id||info.channelId||info.uploader_id||null;const seen=new Set();st.metas=entries.filter(x=>x&&x.id&&!seen.has(x.id)&&seen.add(x.id)).map(x=>({id:c.prefix+x.id,type:"movie",name:x.title||x.id,poster:x.thumbnail||("https://i.ytimg.com/vi/"+x.id+"/hqdefault.jpg"),posterShape:"landscape",background:"https://i.ytimg.com/vi/"+x.id+"/maxresdefault.jpg",description:c.name,runtime:x.duration?Math.round(x.duration/60)+" min":undefined}));st.byId=new Map(st.metas.map(x=>[x.id,x]));st.loadedAt=Date.now();console.log("["+c.key.toUpperCase()+"-SCAN] done videos="+st.metas.length+" channelId="+(st.channelId||"unknown"));return st.metas})().finally(()=>st.load=null);return st.load;
}

const manifest={id:"vn.ivyplay.youtube.khoailangthang",version:"3.14.0",name:"Khoai Lang Thang YouTube",description:"Direct CDN playback: Render resolves then redirects; media does not proxy through Render.",resources:["catalog",{name:"meta",types:["movie"],idPrefixes:["khoai_","hoaban_","bombom_","sang_","film4k_"]},{name:"stream",types:["movie"],idPrefixes:["khoai_","hoaban_","bombom_","sang_","film4k_"]}],types:["movie"],idPrefixes:["khoai_","hoaban_","bombom_","sang_","film4k_"],catalogs:[{type:"movie",id:"khoai-lang-thang",name:"Khoai Lang Thang"},{type:"movie",id:"hoa-ban-food",name:"HOA BAN FOOD"},{type:"movie",id:"bom-bom-vlog",name:"BomBom Vlog"},{type:"movie",id:"sang-vlog",name:"Sang vlog"},{type:"movie",id:"film4k-test",name:"TEST Film4K"}],behaviorHints:{adult:false,p2pNotSupported:true}};
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

const YT_CHANNELS={
  "UCZE88kYvCKUKjM-G0uc8Duw":{key:"khoai",url:"https://www.youtube.com/@khoailangthang/videos"},
  "UCBhgBmuPFbLLxnejr09lnAQ":{key:"hoaban",url:HOA_URL}
};
const YT_HUB="https://pubsubhubbub.appspot.com/subscribe";
async function refreshChannel(channelId){
  const ch=YT_CHANNELS[channelId];if(!ch)return;
  console.log("[YT-PUSH-REFRESH]",channelId,ch.key);
  if(ch.key==="hoaban"){await loadHoa(true);return}
  const info=await ytdlp(ch.url,{dumpSingleJson:true,flatPlaylist:true,noWarnings:true,ignoreErrors:true},{timeout:180000});
  const entries=Array.isArray(info.entries)?info.entries:[];
  let added=0;
  for(const x of entries){
    if(!x?.id)continue;
    const id="khoai_"+x.id;if(byId.has(id))continue;
    const m={id,type:"movie",name:x.title||x.id,poster:x.thumbnail||("https://i.ytimg.com/vi/"+x.id+"/hqdefault.jpg"),posterShape:"landscape",background:"https://i.ytimg.com/vi/"+x.id+"/maxresdefault.jpg",description:"Khoai Lang Thang / Food & Travel",runtime:x.duration?Math.round(x.duration/60)+" min":undefined};
    metas.unshift(m);byId.set(id,m);added++;
  }
  console.log("[YT-PUSH-UPDATED]",ch.key,"added="+added,"videos="+metas.length);
}
async function subscribeYouTubePush(){
  const base=process.env.RENDER_EXTERNAL_URL||"https://khoai-nuvio-addon.onrender.com";
  for(const channelId of Object.keys(YT_CHANNELS)){
    try{
      const body=new URLSearchParams({"hub.callback":base+"/youtube/websub","hub.mode":"subscribe","hub.topic":"https://www.youtube.com/feeds/videos.xml?channel_id="+channelId,"hub.verify":"async"});
      const x=await fetch(YT_HUB,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body,signal:timeout(10000)});
      console.log("[YT-PUSH-SUBSCRIBE]",channelId,x.status);
    }catch(e){console.error("[YT-PUSH-SUBSCRIBE-FAIL]",channelId,e.message)}
  }
}
app.get("/youtube/websub",(q,r)=>{
  const challenge=q.query["hub.challenge"];
  console.log("[YT-PUSH-VERIFY]",q.query["hub.mode"]||"",q.query["hub.topic"]||"");
  if(challenge!==undefined)return r.status(200).type("text/plain").send(String(challenge));
  r.status(400).send("missing challenge");
});
app.post("/youtube/websub",express.text({type:["application/atom+xml","application/xml","text/xml","*/*"],limit:"256kb"}),(q,r)=>{
  const body=String(q.body||"");
  const videoId=(body.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)||[])[1];
  const channelId=(body.match(/<yt:channelId>([^<]+)<\/yt:channelId>/)||[])[1];
  console.log("[YT-PUSH]",channelId||"unknown",videoId||"unknown");
  r.status(204).end();
  if(channelId&&YT_CHANNELS[channelId])refreshChannel(channelId).catch(e=>console.error("[YT-PUSH-REFRESH-FAIL]",channelId,e.message));
});

app.get("/",(_,r)=>r.json({ok:true,name:manifest.name,version:manifest.version,videos:metas.length,cache:cache.size}));
app.get("/manifest.json",(_,r)=>r.json(manifest));
app.get("/player",(_,r)=>r.sendFile("player.html",{root:__dirname}));
app.get("/play/:id/:quality.mp4",async(q,r)=>{try{const quality=String(q.params.quality);if(quality==="auto"){const x=await resolveAuto(q.params.id);r.set({"Cache-Control":"no-store","Access-Control-Allow-Origin":"*","Location":x.url});return r.status(302).end()}if(!["2160","1440","1080","720","480","360"].includes(quality))return r.status(400).json({error:"Unsupported quality"});const x=await resolveQuality(q.params.id,quality);r.set({"Cache-Control":"no-store","Access-Control-Allow-Origin":"*","Location":x.url});r.status(302).end()}catch(e){console.error("[DIRECT-PLAY-FAIL]",q.params.id,e.message);r.status(502).json({error:e.message})}});
const FILM4K_MEDIA={
 v:[
  "https://film4knet.ngaodacopho.workers.dev/tt/xpa55O9M3q8wNzOmzQdg5ts9eX7lCDKWQCDaVFKnEByNh7K4L55FFtRUs52z1icIyjIijBa4NmV0pA4wRQ6cv9T-61NPGW0LSfTr75W4IzitkLnZd-ZBIYKmqIBIgR8LBrN0U-E3cPC5kECmTO46TQmwHhqpPEq6YvBAjIR9Cr8HkYLcMXddXp-P7HpNfLpqjZlqRXMHdQ6cqT4R_KJ-nd8e25a-N-yIcyOzGasY0i4YEHXIi4WZ1uianneRROpW7WvGZhRglZLPoBepN9-sF3eHoL_laC5p3i275Vn6gGSqvo_0z-smw3OABGgSaOH0tCVvA-tJOEV0eJ5LC0oYOxm9bbQDVA",
  "https://film4knet.ngaodacopho.workers.dev/tt/NCEf4bVlY_P8L_vTSefqDApZR506QOegSFHdI52CxqyT6OdiC4mgq5gU4-H1l_yyPDohDSMK72MtBchnjCAniRbr3VeYBoPamfmvoGbx8t6ofUtq---_ZaoZviGzResx-_T0YinXR-uQWbq1ow38tUiP9VyPBkShDz1rxLVagdomnIZAH1VXadW2_aZl16b-cGQXQngj6x8qq41JHwStMaW727L7Xxlwk2w0Wb6oFZ6VgWweIIYPSZo7Did5V00Ea_bYqa8mlZhmb9hn9AgvGg3k6Gqp6R36AkG8zmwK_cqpsdoCmI20vZecU-XKC55I45PV4yawHSgiLSO1AII_CH54",
  "https://film4knet.ngaodacopho.workers.dev/tt/mTOrhOGjST3wWV2zIihsiLrtM89f0zNyxhsHLtvpNcPaYDlE-GVum-p9OcydJzlktlrF548cEw88okAJ2Kk115mtN_Jk9uYokEH-52yGltfD50XEm36ibu0PBx9OHOE1dXrMR3Xwca-8YOaGoAurJWuVdYyXUAWbpdfvT3oDmteNBTUbcg857m0mqofo-joJHsFdKivQVItWrn9tAdR7HwRhCZ0mNEyVy0BmyCF0-kszmds2pCwYWFXSKwlSQ4KPwMBpr2JmAKrqoN97wt55QrJBIyTfzMccsawU0SonuWBGQZS_EnvwpLFyLLryPR6Bq3_L-CuR5exHIkQQ7MelZNn2"
 ],
 a:[
  "https://film4knet.ngaodacopho.workers.dev/tt/Un7TMhb94v3RurrVHLVzAmxdZNlBzeb6ILalMqslpJ1_hcweaBTaeeO5nEwTSFD7IwwxiNA9EeB7WxWFXSf5SZ7SPTwDK9pqfKSFxdyEmBrlfuY_i1AklfYJVcmLwCjrmS17tlQT8MuEliGU8qk3TGseSUndE3CUUA2olhXg_an-jVX9tHo2Uhctficv_CkiClKeqhJ3b_c_C68EJTvkdym9mZ6iR7HGK2jLG5ENrix8oiBorCdD5up97s1uWgcNCM7DPS5_wJDn6RQ8YwWlquA5RBS7U9oz5JFGg6EtB5aqgM9h9mT58Sypm_xSm9BGr2-mm5G2W_xDY9JT4f9PkA",
  "https://film4knet.ngaodacopho.workers.dev/tt/9J-lTkfWxxQmPFhGZ_WeqKBDoGEu1GYMftfAD-ElSKGH1AijFYByyNmDfOVx0Qk0NYeclqmWynF0ybvMOdA3SXQQouQyo2xosB2hrUUcOwylGPWfIpzhcNDUwBRBJ97mawWWG-8JHuzTVb3ku4J_WwBhzZvalqooTG2aS9tQ43fijFPNYBsw8HTUJl_ouCCIZ4KEZ8RhxPWvcGDI7IQX-SLHwcuUOCezB5tOAawIUYqJ1_CKs1n5EVvP-DFWAGVKRbpyAZVJHi7JFmDFeUEMxr7v91KUmOxlr8PSRXWYaPFrmTOVUPsT2M2eIeSa3uCg8PJtH3G2-7CEvfToxwSXtG6i",
  "https://film4knet.ngaodacopho.workers.dev/tt/kTPu4lBiCWBYRhrsKCTzOhi4coKNDD9q6WAguVxLgn3vfwZ02rw4h9_vC7LU6x3gRCWexXZjsAZjtVXXtczlBQoT7UVVNKVJ6BrjOZCSY24KMbQr5JbnRqFmHDbsts4HQZ1ZyBFafrjCHRE-xsmPBCZa7fjJSpk4ZW4fv8T1dUWefWJz62g-hx2mB52fLJsrEns5Zdvr7XcwsnhPtbAdkZN8PPJI2JPJYUdZZKqjvs_NJxu65CZGntgxViFoU94J7um3wuIbiejUhedXOqu5ku3mcLJYg1E-8z54y1sVwsnguPAfCfHt4eT0Mbx_7mtW7rQW1J9XmCInBkGahTLHuw"
 ]
};
function stripFilm4kPng(b){if(b.length<8||b[0]!==0x89||b[1]!==0x50||b[2]!==0x4e||b[3]!==0x47)return b;let p=8;while(p+12<=b.length){const n=b.readUInt32BE(p),typ=b.toString("ascii",p+4,p+8),end=p+12+n;if(end>b.length)break;if(typ==="IEND")return b.subarray(end);p=end}return b}
app.get("/film4k-test/media/:kind/:n",async(q,r)=>{try{const arr=FILM4K_MEDIA[q.params.kind],n=+q.params.n;if(!arr||!arr[n])return r.sendStatus(404);const x=await fetch(arr[n],{headers:{"User-Agent":UA,Accept:"*/*"},signal:timeout(30000)});if(!x.ok)throw Error("worker "+x.status);const clean=stripFilm4kPng(Buffer.from(await x.arrayBuffer()));console.log("[FILM4K-CLEAN]",q.params.kind,n,"bytes="+clean.length);r.set({"Content-Type":"video/mp4","Cache-Control":"public,max-age=3600","Access-Control-Allow-Origin":"*"}).send(clean)}catch(e){console.error("[FILM4K-CLEAN-FAIL]",e.message);r.status(502).json({error:e.message})}});
app.get("/film4k-test/video.m3u8",(q,r)=>{const base=q.protocol+"://"+q.get("host");r.type("application/vnd.apple.mpegurl").send('#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:24\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-MAP:URI="'+base+'/film4k-test/media/v/0"\n#EXTINF:23.440,\n'+base+'/film4k-test/media/v/1\n#EXTINF:18.185,\n'+base+'/film4k-test/media/v/2\n#EXT-X-ENDLIST\n')});
app.get("/film4k-test/audio.m3u8",(q,r)=>{const base=q.protocol+"://"+q.get("host");r.type("application/vnd.apple.mpegurl").send('#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:21\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-MAP:URI="'+base+'/film4k-test/media/a/0"\n#EXTINF:20.011,\n'+base+'/film4k-test/media/a/1\n#EXTINF:19.989,\n'+base+'/film4k-test/media/a/2\n#EXT-X-ENDLIST\n')});
app.get("/film4k-test/master.m3u8",(q,r)=>{const base=q.protocol+"://"+q.get("host");r.type("application/vnd.apple.mpegurl").send('#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Audio",DEFAULT=YES,AUTOSELECT=YES,URI="'+base+'/film4k-test/audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=30000000,CODECS="hev1.2.4.L150.B0,ec-3",AUDIO="aud"\n'+base+'/film4k-test/video.m3u8\n')});
const FILM4K_TEST={id:"film4k_spiderman_brand_new_day",type:"movie",name:"Spider-Man: Brand New Day • Film4K TEST",posterShape:"poster",description:"Film4K iOS/Nuvio playback compatibility test",background:"https://film4k.net/",website:"https://film4k.net/movie/spider-man-brand-new-day"};
app.get("/catalog/movie/film4k-test.json",(_,r)=>r.json({metas:[FILM4K_TEST]}));
app.get("/catalog/movie/film4k-test/:extra.json",(_,r)=>r.json({metas:[FILM4K_TEST]}));
app.get("/catalog/movie/khoai-lang-thang.json",(_,r)=>r.json({metas}));
app.get("/catalog/movie/khoai-lang-thang/:extra.json",(_,r)=>r.json({metas}));
app.get("/catalog/movie/hoa-ban-food.json",async(_,r)=>{try{r.json({metas:await loadHoa()})}catch(e){console.error("[HOABAN-CATALOG-FAIL]",e.message);r.status(502).json({metas:[],error:e.message})}});
app.get("/catalog/movie/hoa-ban-food/:extra.json",async(_,r)=>{try{r.json({metas:await loadHoa()})}catch(e){console.error("[HOABAN-CATALOG-FAIL]",e.message);r.status(502).json({metas:[],error:e.message})}});
app.get("/hoaban/refresh",async(_,r)=>{try{const x=await loadHoa(true);r.json({ok:true,videos:x.length})}catch(e){r.status(502).json({ok:false,error:e.message})}});
for(const c of EXTRA_CHANNELS){
 app.get("/catalog/movie/"+c.catalog+".json",async(_,r)=>{try{r.json({metas:await loadExtra(c)})}catch(e){r.status(502).json({metas:[],error:e.message})}});
 app.get("/catalog/movie/"+c.catalog+"/:extra.json",async(_,r)=>{try{r.json({metas:await loadExtra(c)})}catch(e){r.status(502).json({metas:[],error:e.message})}});
 app.get("/"+c.key+"/refresh",async(_,r)=>{try{const x=await loadExtra(c,true);r.json({ok:true,videos:x.length,channelId:extraState.get(c.key).channelId})}catch(e){r.status(502).json({ok:false,error:e.message})}});
}
app.get("/meta/movie/:id.json",async(q,r)=>{if(q.params.id===FILM4K_TEST.id)return r.json({meta:FILM4K_TEST});let m=byId.get(q.params.id);if(!m&&q.params.id.startsWith("hoaban_")){try{await loadHoa();m=hoaById.get(q.params.id)}catch(e){console.error("[HOABAN-META-FAIL]",e.message)}}if(!m){for(const c of EXTRA_CHANNELS){if(q.params.id.startsWith(c.prefix)){try{await loadExtra(c);m=extraState.get(c.key).byId.get(q.params.id)}catch(e){}break}}}return m?r.json({meta:m}):r.status(404).json({meta:null})});
async function directYouTubeFormats(id){
  const info=await ytdlp("https://www.youtube.com/watch?v="+id,{
    dumpSingleJson:true,noWarnings:true,skipDownload:true,
    extractorArgs:"youtube:player_client=visionos"
  },{timeout:60000});
  const fs=(info.formats||[]).filter(f=>f&&f.url);
  const video=fs.filter(f=>f.vcodec&&f.vcodec!=="none"&&(!f.acodec||f.acodec==="none"))
    .sort((a,b)=>(b.height||0)-(a.height||0)||(b.tbr||0)-(a.tbr||0));
  const audio=fs.filter(f=>f.acodec&&f.acodec!=="none"&&(!f.vcodec||f.vcodec==="none"))
    .sort((a,b)=>(b.abr||b.tbr||0)-(a.abr||a.tbr||0));
  const muxed=fs.filter(f=>f.vcodec&&f.vcodec!=="none"&&f.acodec&&f.acodec!=="none")
    .sort((a,b)=>(b.height||0)-(a.height||0)||(b.tbr||0)-(a.tbr||0));
  return {
    id,title:info.title||id,
    muxed:muxed.slice(0,8).map(f=>({formatId:f.format_id,height:f.height,ext:f.ext,vcodec:f.vcodec,acodec:f.acodec,url:f.url})),
    video:video.slice(0,12).map(f=>({formatId:f.format_id,height:f.height,ext:f.ext,vcodec:f.vcodec,url:f.url})),
    audio:audio.slice(0,8).map(f=>({formatId:f.format_id,ext:f.ext,abr:f.abr,acodec:f.acodec,url:f.url}))
  };
}
app.get("/direct-test/:id",async(q,r)=>{try{
  const x=await directYouTubeFormats(q.params.id);
  console.log("[DIRECT-YT-TEST]",q.params.id,"muxed="+x.muxed.length,"video="+x.video.length,"audio="+x.audio.length,"max="+Math.max(0,...x.video.map(v=>v.height||0),...x.muxed.map(v=>v.height||0)));
  r.set("Cache-Control","no-store");r.json(x);
}catch(e){console.error("[DIRECT-YT-TEST-FAIL]",q.params.id,String(e.stderr||e.message||e).slice(0,1200));r.status(502).json({error:String(e.stderr||e.message||e).slice(0,2000)})}});
app.get("/stream/movie/:id.json",(q,r)=>{const p=q.params.id;if(p===FILM4K_TEST.id){const url=process.env.FILM4K_STREAM_URL;if(url){const h={};if(process.env.FILM4K_USER_AGENT)h["User-Agent"]=process.env.FILM4K_USER_AGENT;if(process.env.FILM4K_REFERER)h["Referer"]=process.env.FILM4K_REFERER;if(process.env.FILM4K_COOKIE)h["Cookie"]=process.env.FILM4K_COOKIE;if(process.env.FILM4K_PT)h["x-f4k-pt"]=process.env.FILM4K_PT;return r.json({streams:[{name:"Film4K • 1080p",title:"Film4K • Environment source",url,behaviorHints:{notWebReady:true,proxyHeaders:{request:h}}}]})}return r.json({streams:[{name:"Film4K • TEST",title:"Raw source compatibility test",url:`${q.protocol}://${q.get("host")}/film4k-test/master.m3u8`,behaviorHints:{notWebReady:true}}]})}const id=p.startsWith("khoai_")?p.slice(6):p.startsWith("hoaban_")?p.slice(7):p.startsWith("bombom_")?p.slice(7):p.startsWith("sang_")?p.slice(5):"";return id?r.json({streams:[{name:"YouTube • AUTO",title:"AUTO stable • adaptive repair pending",url:`${q.protocol}://${q.get("host")}/play/${id}/auto.mp4`,behaviorHints:{notWebReady:true}}]}):r.json({streams:[]})});
app.get("/adaptive/:id/master.m3u8",async(q,r)=>{try{const id=q.params.id;const qualities=[["2160",18000000],["1440",10000000],["1080",6000000],["720",3000000],["480",1500000],["360",800000]];const out=["#EXTM3U","#EXT-X-VERSION:3","#EXT-X-INDEPENDENT-SEGMENTS"];for(const [quality,bw] of qualities){try{const x=await resolveQuality(id,quality);out.push("#EXT-X-STREAM-INF:BANDWIDTH="+bw+",AVERAGE-BANDWIDTH="+Math.round(bw*.8)+",RESOLUTION="+({2160:"3840x2160",1440:"2560x1440",1080:"1920x1080",720:"1280x720",480:"854x480",360:"640x360"})[quality]+",NAME=\""+quality+"p\"");out.push(x.url)}catch(e){console.log("[ADAPTIVE-MISS]",id,quality+"p",e.message)}}if(out.length===3)throw Error("No adaptive variants");console.log("[ADAPTIVE-MASTER]",id,"variants="+((out.length-3)/2));r.set({"Content-Type":"application/vnd.apple.mpegurl","Cache-Control":"no-store","Access-Control-Allow-Origin":"*"});r.send(out.join("\n")+"\n")}catch(e){console.error("[ADAPTIVE-FAIL]",q.params.id,e.message);r.status(502).json({error:e.message})}});
app.get("/formats/:id",async(q,r)=>{const qualities=["2160","1440","1080","720","480","360"];const formats=[];for(const quality of qualities){try{const x=await resolveQuality(q.params.id,quality);formats.push({quality:Number(quality),reportedQuality:Number(x.reportedQuality)||x.reportedQuality,url:x.url,cdn:x.cdn})}catch(e){console.log("[FORMAT-MISS]",q.params.id,quality+"p",e.message)}}r.set("Cache-Control","no-store");r.json({videoId:q.params.id,preferred:"highest",formats})});
app.get("/resolve/:id",async(q,r)=>{try{const x=await resolveAuto(q.params.id);r.set("Cache-Control","no-store");r.json({videoId:q.params.id,requestedQuality:x.quality,reportedQuality:x.reportedQuality,url:x.url,cdn:x.cdn})}catch(e){console.error("[RESOLVE-FAIL]",q.params.id,e.message);r.status(502).json({error:e.message})}});
app.get("/play/:id/auto.mp4",async(q,r)=>{try{const id=q.params.id;const x=await resolveAuto(id);console.log("[PLAY-REDIRECT-STABLE]",id,"requested="+x.quality+"p","reported="+x.reportedQuality+"p",x.cdn);r.set({"Cache-Control":"no-store","Access-Control-Allow-Origin":"*","Location":x.url});r.status(302).end()}catch(e){console.error("[PLAY-FAIL]",q.params.id,e.message);r.status(502).json({error:e.message})}});
app.listen(process.env.PORT||3000,"0.0.0.0",()=>{console.log("Khoai addon",manifest.version,"videos",metas.length);(async()=>{try{await loadHoa()}catch(e){console.error("[HOABAN-SCAN-FAIL]",e.message)}for(const c of EXTRA_CHANNELS){try{await loadExtra(c)}catch(e){console.error("["+c.key.toUpperCase()+"-SCAN-FAIL]",e.message)}}})();setTimeout(()=>subscribeYouTubePush().catch(e=>console.error("[YT-PUSH-INIT-FAIL]",e.message)),8000);setInterval(()=>subscribeYouTubePush().catch(e=>console.error("[YT-PUSH-RENEW-FAIL]",e.message)),24*60*60*1000);setTimeout(async()=>{try{const x=await resolveAuto("B1qT38bVsXc");console.log("[SELFTEST] SaveTube OK","requested="+x.quality+"p","reported="+x.reportedQuality+"p",x.cdn)}catch(e){console.error("[SELFTEST] SaveTube FAILED",e.message)}},1500);setTimeout(async()=>{try{const x=await socialPlug("AjSxpi8E9WE");console.log("[SELFTEST-SOCIALPLUG] OK","ms="+x.ms,"qualities="+x.video_quality.join(","),"muxed="+x.muxed.length)}catch(e){console.error("[SELFTEST-SOCIALPLUG] FAIL",e.message)}},3500);setTimeout(async()=>{try{const x=await resolveAuto("AjSxpi8E9WE");console.log("[SELFTEST-AUTO4K] OK","selected="+x.quality+"p","reported="+x.reportedQuality+"p","cdn="+x.cdn)}catch(e){console.error("[SELFTEST-AUTO4K] FAIL",e.message)}},4500);setTimeout(async()=>{const id="rJiDjip4Hrc";try{const info=await ytdlp("https://www.youtube.com/watch?v="+id,{dumpSingleJson:true,noWarnings:true,skipDownload:true,extractorArgs:"youtube:player_client=visionos"},{timeout:60000});const fs=(info.formats||[]).filter(f=>f.url);console.log("[SELFTEST-VISIONOS] OK",id,"formats="+fs.length,"max="+Math.max(0,...fs.map(f=>f.height||0)),"audio="+fs.filter(f=>f.acodec&&f.acodec!=="none").length)}catch(e){console.error("[SELFTEST-VISIONOS] FAIL",id,String(e.stderr||e.message||e).slice(0,1200))}},5000)});
