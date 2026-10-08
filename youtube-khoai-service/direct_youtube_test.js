// Isolated direct YouTube playback experiment. No SaveTube dependency.
const {spawn}=require("node:child_process");
const ytdlp=require("youtube-dl-exec");
const express=require("express");
const router=express.Router();
const ID=/^[A-Za-z0-9_-]{11}$/;
router.get("/:id",async(req,res)=>{
 const id=req.params.id;
 if(!ID.test(id))return res.status(400).json({error:"Invalid YouTube ID"});
 let proc;
 try{
  const info=await ytdlp("https://www.youtube.com/watch?v="+id,{
   dumpSingleJson:true,skipDownload:true,noWarnings:true
  },{timeout:60000});
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
module.exports=router;
