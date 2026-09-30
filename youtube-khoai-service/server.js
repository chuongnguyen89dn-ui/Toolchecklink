const express=require("express");
const {execFile}=require("child_process");
const {promisify}=require("util");
const execFileAsync=promisify(execFile);
const catalog=require("./catalog.json");
const app=express();
app.use((req,res,next)=>{res.set("Access-Control-Allow-Origin","*");console.log("[REQ]",req.method,req.originalUrl);next()});
const metas=catalog.map(x=>({id:"khoai_"+x.videoId,type:"movie",name:x.title,poster:"https://i.ytimg.com/vi/"+x.videoId+"/hqdefault.jpg",posterShape:"landscape",background:"https://i.ytimg.com/vi/"+x.videoId+"/maxresdefault.jpg",description:"Khoai Lang Thang / Food & Travel",runtime:x.duration?Math.round(x.duration/60)+" min":undefined}));
const byId=new Map(metas.map(x=>[x.id,x]));
const manifest={"id":"vn.ivyplay.youtube.khoailangthang","version":"2.2.0","name":"Khoai Lang Thang YouTube","description":"Khoai Lang Thang YouTube for Nuvio/IvyPlay","resources":["catalog",{"name":"meta","types":["movie"],"idPrefixes":["khoai_"]},{"name":"stream","types":["movie"],"idPrefixes":["khoai_"]}],"types":["movie"],"idPrefixes":["khoai_"],"catalogs":[{"type":"movie","id":"khoai-lang-thang","name":"Khoai Lang Thang"}],"behaviorHints":{"adult":false,"p2pNotSupported":true}};
app.get("/",(_,r)=>r.json({ok:true,name:manifest.name,version:manifest.version,videos:metas.length}));
app.get("/manifest.json",(_,r)=>r.json(manifest));
app.get("/catalog/movie/khoai-lang-thang.json",(_,r)=>r.json({metas}));
app.get("/catalog/movie/khoai-lang-thang/:extra.json",(_,r)=>r.json({metas}));
app.get("/meta/movie/:id.json",(q,r)=>{const m=byId.get(q.params.id);return m?r.json({meta:m}):r.status(404).json({meta:null})});
app.get("/stream/movie/:id.json",(q,r)=>{const id=q.params.id.startsWith("khoai_")?q.params.id.slice(6):"";return id?r.json({streams:[{name:"YouTube",title:"Khoai Lang Thang • YouTube",ytId:id}] }):r.json({streams:[]})});

async function resolveYouTube(id){
  if(!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error("invalid video id");
  const url="https://www.youtube.com/watch?v="+id;
  const args=["--no-playlist","--skip-download","--no-warnings","--extractor-args","youtube:player_client=web_safari","-f","best[protocol*=m3u8]/best","-g",url];
  const {stdout}=await execFileAsync("yt-dlp",args,{timeout:30000,maxBuffer:1024*1024});
  const media=stdout.trim().split(/\r?\n/).filter(Boolean)[0];
  if(!media) throw new Error("no media url");
  return media;
}
app.get("/resolve/:id",async(q,r)=>{try{const url=await resolveYouTube(q.params.id);r.set("Cache-Control","no-store");r.json({videoId:q.params.id,url,vlc:"vlc-x-callback://x-callback-url/stream?url="+encodeURIComponent(url)});}catch(e){console.error("[RESOLVE]",q.params.id,e.message);r.status(502).json({error:e.message});}});
app.get("/play/:id",async(q,r)=>{try{const url=await resolveYouTube(q.params.id);const esc=url.replace(/&/g,"&amp;").replace(/"/g,"&quot;");r.set("Cache-Control","no-store");r.type("html").send('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Khoai Player</title><body style="font-family:-apple-system;padding:24px"><h2>Khoai Lang Thang</h2><p><a href="'+esc+'">Phát bằng Safari</a></p><p><a href="vlc-x-callback://x-callback-url/stream?url='+encodeURIComponent(url)+'">Mở bằng VLC</a></p><video controls playsinline style="width:100%;max-width:900px" src="'+esc+'"></video></body>');}catch(e){console.error("[PLAY]",q.params.id,e.message);r.status(502).send("Resolve failed: "+e.message);}});
app.listen(process.env.PORT||3000,"0.0.0.0",()=>console.log("Khoai addon",manifest.version,"videos",metas.length));
