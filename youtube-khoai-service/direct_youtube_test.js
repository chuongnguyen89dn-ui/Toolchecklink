// Isolated direct YouTube playback experiment. No SaveTube dependency.
const {spawn}=require("node:child_process");
// Use the pip-installed yt-dlp (with PO-token plugin), not youtube-dl-exec's bundled binary.
function extract(url,client){
 return new Promise((resolve,reject)=>{
  const p=spawn("python3",["-m","yt_dlp","--dump-single-json","--skip-download","--no-warnings","--extractor-args","youtube:player_client="+client,url],{stdio:["ignore","pipe","pipe"]});
  let out="",err="",done=false;
  const timer=setTimeout(()=>{p.kill("SIGKILL");},60000);
  p.stdout.on("data",b=>{out+=b.toString();if(out.length>12000000)p.kill("SIGKILL")});
  p.stderr.on("data",b=>{err=(err+b.toString()).slice(-3000)});
  p.on("error",e=>{if(!done){done=true;clearTimeout(timer);reject(e)}});
  p.on("close",code=>{clearTimeout(timer);if(done)return;done=true;
   if(code!==0)return reject(Error("yt-dlp exit "+code+": "+err));
   try{resolve(JSON.parse(out))}catch(e){reject(Error("yt-dlp invalid JSON: "+err+" "+e.message))}
  });
 });
}
const express=require("express");
const router=express.Router();
const ID=/^[A-Za-z0-9_-]{11}$/;

// Diagnose Render's outbound YouTube access independently of yt-dlp and FFmpeg.
router.get("/diagnostics",async(req,res)=>{
 const id="B1qT38bVsXc";
 const targets=[
  ["watch","https://www.youtube.com/watch?v="+id],
  ["embed","https://www.youtube.com/embed/"+id],
  ["oembed","https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D"+id+"&format=json"]
 ];
 const results=[];
 for(const [name,url] of targets){
  try{
   const response=await fetch(url,{redirect:"follow",headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36"},signal:AbortSignal.timeout(8000)});
   const body=(await response.text()).slice(0,100000);
   results.push({name,status:response.status,bytesSample:body.length,hasPlayerResponse:/ytInitialPlayerResponse|playerResponse/.test(body),challenge:/unusual traffic|not a robot|captcha|sign in to confirm|verify you are human/i.test(body)});
  }catch(e){results.push({name,error:String(e.message||e)})}
 }
 console.log("[DIRECT-NET-DIAGNOSTICS]",JSON.stringify(results));
 res.set("Cache-Control","no-store").json({results});
});
// Reachability check for the user-owned Cloudflare Worker (diagnostics only).
setTimeout(async()=>{try{const r=await fetch("https://nuvio-youtube-direct-probe.chuongnguyen89dn-2b3.workers.dev/",{signal:AbortSignal.timeout(35000)});const t=await r.text();console.log("[CF-PLAYER-TEST]",r.status,t.slice(0,3000));}catch(e){console.error("[CF-PLAYER-TEST-ERROR]",String(e.message||e))}},6000).unref();
router.get("/cloudflare-diagnostics",async(req,res)=>{
 const url="https://nuvio-youtube-direct-probe.chuongnguyen89dn-2b3.workers.dev/";
 try{
  const response=await fetch(url,{signal:AbortSignal.timeout(12000)});
  const body=(await response.text()).slice(0,5000);
  console.log("[DIRECT-CLOUDFLARE-PROBE]",response.status,body.slice(0,1400));
  res.set("Cache-Control","no-store").status(response.ok?200:502).json({
   workerHttpStatus:response.status,workerResponse:body.slice(0,3000),mediaVerified:false
  });
 }catch(e){
  console.error("[DIRECT-CLOUDFLARE-PROBE-ERROR]",String(e.message||e));
  res.status(502).json({error:String(e.message||e),mediaVerified:false});
 }
});
// Independent first-party YouTube Innertube probe via the installed youtubei.js library.
// This does not contact SaveTube or any third-party resolver.
router.get("/innertube-diagnostics/:id",async(req,res)=>{
 const id=req.params.id;
 if(!ID.test(id))return res.status(400).json({error:"Invalid YouTube ID"});
 try{
  const {Innertube}=await import("youtubei.js");
  const yt=await Innertube.create({generate_session_locally:true});
  const info=await yt.getInfo(id);
  const data=info.streaming_data||{};
  const formats=[...(data.formats||[]),...(data.adaptive_formats||[])];
  const summary={id,playability:info.playability_status?.status||null,formatCount:formats.length,
   video136:formats.some(f=>String(f.itag)==="136"),audio140:formats.some(f=>String(f.itag)==="140"),
   formats:formats.slice(0,25).map(f=>({itag:f.itag,mime_type:f.mime_type,hasUrl:!!f.url})),
   saveTubeUsed:false};
  console.log("[DIRECT-INNERTUBE]",JSON.stringify(summary));
  res.set("Cache-Control","no-store").json(summary);
 }catch(e){
  const message=String(e.message||e).slice(0,600);
  console.error("[DIRECT-INNERTUBE-FAIL]",id,message);
  res.status(502).json({error:message,saveTubeUsed:false});
 }
});
router.get("/:id",async(req,res)=>{
 const id=req.params.id;
 if(!ID.test(id))return res.status(400).json({error:"Invalid YouTube ID"});
 let proc;
 try{
  // Fast-fail when Render's outbound address is rate-limited by YouTube.
  // Do not spend three 60-second yt-dlp retries on a known blocked network.
  let networkStatus;
  try{
   const probe=await fetch("https://www.youtube.com/watch?v="+id,{
    headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36"},
    signal:AbortSignal.timeout(8000)
   });
   networkStatus=probe.status;
   if(probe.body)await probe.body.cancel();
  }catch(e){console.error("[DIRECT-NET-PROBE-ERROR]",id,String(e.message||e))}
  if(networkStatus===429){
   console.error("[DIRECT-NET-BLOCKED]",id,"YouTube watch HTTP 429; no SaveTube fallback");
   return res.status(503).set("Retry-After","300").json({
    error:"Direct YouTube unavailable from Render: YouTube HTTP 429",
    stage:"youtube_network",youtubeStatus:429,saveTubeUsed:false
   });
  }
  let info, failures=[];
  for(const client of ["android_vr","web_safari","web"]){
   try{info=await extract("https://www.youtube.com/watch?v="+id,client);console.log("[DIRECT-CLIENT-OK]",id,client);break}
   catch(e){const msg=String(e.message||e).slice(0,550);failures.push({client,error:msg});console.error("[DIRECT-CLIENT-FAIL]",id,client,msg)}
  }
  if(!info)return res.status(502).json({error:"YouTube extraction failed on Render",clients:failures.map(x=>x.client)});
  const formats=(info.formats||[]).filter(f=>f.url&&/^https:/.test(f.url));
  const video=formats.filter(f=>f.format_id==="136"&&f.vcodec&&f.vcodec!=="none"&&f.ext==="mp4")
    .sort((a,b)=>(b.height||0)-(a.height||0))[0];
  const audio=formats.filter(f=>f.format_id==="140"&&f.acodec&&f.acodec!=="none"&&f.ext==="m4a")
    .sort((a,b)=>(b.abr||0)-(a.abr||0))[0];
  if(!video||!audio){console.error("[DIRECT-FORMATS-MISSING]",id,"available",(info.formats||[]).map(f=>f.format_id+":"+f.ext+":"+(f.height||0)).join(",").slice(0,1200));return res.status(502).json({error:"Missing separate video/audio formats"});}
  console.log("[DIRECT-YTDLP]",id,"video",video.format_id,video.height,"audio",audio.format_id);
  const args=["-hide_banner","-loglevel","error","-nostdin",
    "-user_agent","Mozilla/5.0","-i",video.url,
    "-user_agent","Mozilla/5.0","-i",audio.url,
    "-map","0:v:0","-map","1:a:0","-c","copy",
    "-movflags","frag_keyframe+empty_moov+default_base_moof","-f","mp4","pipe:1"];
  proc=spawn("ffmpeg",args,{stdio:["ignore","pipe","pipe"]});
  let errors="";
  proc.stderr.on("data",d=>{errors=(errors+d.toString()).slice(-2000)});
  proc.on("error",e=>{console.error("[DIRECT-FFMPEG-ERROR]",id,e.message);if(!res.headersSent)res.status(502).json({error:"FFmpeg unavailable"})});
  proc.on("close",code=>{if(code!==0)console.error("[DIRECT-FFMPEG-EXIT]",id,code,errors);if(!res.writableEnded)res.end()});
  res.set({"Content-Type":"video/mp4","Cache-Control":"no-store","Access-Control-Allow-Origin":"*"});
  proc.stdout.pipe(res);
  res.on("close",()=>{if(proc&&!proc.killed)proc.kill("SIGTERM")});
 }catch(e){console.error("[DIRECT-YTDLP-FAIL]",id,String(e.stderr||e.message||e).slice(0,700));if(!res.headersSent)res.status(502).json({error:"Direct resolver failed"})}
});
// One-shot network matrix on startup: identify which official YouTube origins are
// reachable before considering any player changes. Never log cookies or signed URLs.
setTimeout(async()=>{
 const id="B1qT38bVsXc";
 const targets=[
  ["watch_www","https://www.youtube.com/watch?v="+id],
  ["watch_mobile","https://m.youtube.com/watch?v="+id],
  ["watch_nocookie","https://www.youtube-nocookie.com/embed/"+id],
  ["embed_www","https://www.youtube.com/embed/"+id],
  ["player_api","https://www.youtube.com/youtubei/v1/player?prettyPrint=false"],
  ["player_api_googleapis","https://youtubei.googleapis.com/youtubei/v1/player?prettyPrint=false"]
 ];
 const results=await Promise.all(targets.map(async([name,url])=>{
  try{
   const response=await fetch(url,{method:name.startsWith("player_api")?"POST":"GET",
    headers:{"User-Agent":"Mozilla/5.0","Content-Type":"application/json"},
    body:name.startsWith("player_api")?JSON.stringify({context:{client:{clientName:"WEB",clientVersion:"2.20261001.00.00"}},videoId:id}):undefined,
    signal:AbortSignal.timeout(9000)});
   const sample=(await response.text()).slice(0,1500);
   return {name,status:response.status,contentType:response.headers.get("content-type"),
    challenge:/<title>Sorry|unusual traffic|captcha|not a robot/i.test(sample),
    json:sample.trimStart().startsWith("{")};
  }catch(e){return {name,error:String(e.message||e).slice(0,120)}}
 }));
 console.log("[DIRECT-YOUTUBE-ORIGIN-MATRIX]",JSON.stringify(results));
},5000).unref();
// Run the diagnostic on the server itself; no manual user test required.
setTimeout(async()=>{
 try{
  const {Innertube}=await import("youtubei.js");
  const yt=await Innertube.create({generate_session_locally:true});
  const info=await yt.getInfo("B1qT38bVsXc");
  const data=info.streaming_data||{};
  const formats=[...(data.formats||[]),...(data.adaptive_formats||[])];
  console.log("[DIRECT-INNERTUBE-SELFTEST]",JSON.stringify({status:info.playability_status?.status||null,count:formats.length,has136:formats.some(f=>String(f.itag)==="136"),has140:formats.some(f=>String(f.itag)==="140"),hasPlayableUrl:formats.some(f=>!!f.url)}));
 }catch(e){console.error("[DIRECT-INNERTUBE-SELFTEST-FAIL]",JSON.stringify({message:String(e.message||e).slice(0,400),status:e.status||e.status_code||e.response?.status||null,body:String(e.response?.body||e.response?.data||e.info||"").slice(0,650)}))}
},15000).unref();
module.exports=router;
