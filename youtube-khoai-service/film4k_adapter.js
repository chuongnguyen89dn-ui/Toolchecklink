// Generic HLS VOD adapter for an authorized upstream resolver.
// Expected resolver contract: GET RESOLVER_BASE/resolve/:slug ->
// { master:{body,url}, video:{body,url}, audio:{body,url}, media:{video:{init,segments:[]},audio:{init,segments:[]}}, headers?:{} }
const express = require('express');
const app = express();
const PORT = process.env.PORT || 8787;
const RESOLVER_BASE = process.env.RESOLVER_BASE;
if (!RESOLVER_BASE) throw new Error('RESOLVER_BASE is required');
const PNG_SIG = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
const cache = new Map();
function unwrapPng(b){
  if (b.length < 8 || !b.subarray(0,8).equals(PNG_SIG)) return b;
  let p=8;
  while(p+12<=b.length){
    const n=b.readUInt32BE(p), type=b.toString('ascii',p+4,p+8), end=p+12+n;
    if(end>b.length) break;
    if(type==='IEND') return b.subarray(end);
    p=end;
  }
  return b;
}
async function session(slug){
  const hit=cache.get(slug); if(hit && hit.expires>Date.now()) return hit.data;
  const r=await fetch(`${RESOLVER_BASE.replace(/\/$/,'')}/resolve/${encodeURIComponent(slug)}`, {signal:AbortSignal.timeout(45000)});
  if(!r.ok) throw new Error(`resolver ${r.status}`);
  const data=await r.json();
  if(!data?.video?.body || !data?.audio?.body || !data?.media?.video?.segments || !data?.media?.audio?.segments) throw new Error('resolver output incomplete');
  cache.set(slug,{data,expires:Date.now()+10*60*1000}); return data;
}
function rewriteMedia(body, slug, kind, base){
  let i=0;
  return body.split(/\r?\n/).map(line=>{
    if(line.startsWith('#EXT-X-MAP:')) return `#EXT-X-MAP:URI="${base}/film4k/${encodeURIComponent(slug)}/media/${kind}/init"`;
    if(line && !line.startsWith('#')) return `${base}/film4k/${encodeURIComponent(slug)}/media/${kind}/${i++}`;
    return line;
  }).join('\n');
}
app.get('/film4k/:slug/master.m3u8', async(req,res)=>{
  try{ await session(req.params.slug); const b=`${req.protocol}://${req.get('host')}`;
    res.type('application/vnd.apple.mpegurl').set('Cache-Control','no-store').send(`#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Audio",DEFAULT=YES,AUTOSELECT=YES,URI="${b}/film4k/${encodeURIComponent(req.params.slug)}/audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=12000000,AUDIO="aud"\n${b}/film4k/${encodeURIComponent(req.params.slug)}/video.m3u8\n`);
  }catch(e){res.status(502).json({error:e.message})}
});
app.get('/film4k/:slug/:kind(video|audio).m3u8', async(req,res)=>{
  try{ const s=await session(req.params.slug), b=`${req.protocol}://${req.get('host')}`;
    res.type('application/vnd.apple.mpegurl').set('Cache-Control','no-store').send(rewriteMedia(s[req.params.kind].body,req.params.slug,req.params.kind,b));
  }catch(e){res.status(502).json({error:e.message})}
});
app.get('/film4k/:slug/media/:kind(video|audio)/:n', async(req,res)=>{
  try{ const s=await session(req.params.slug), m=s.media[req.params.kind];
    const url=req.params.n==='init'?m.init:m.segments[Number(req.params.n)]; if(!url) return res.sendStatus(404);
    const headers={...(s.headers||{})}; if(req.headers.range) headers.Range=req.headers.range;
    const up=await fetch(url,{headers,signal:AbortSignal.timeout(30000)}); if(!up.ok) throw new Error(`upstream ${up.status}`);
    const raw=Buffer.from(await up.arrayBuffer()), clean=unwrapPng(raw);
    res.set({'Content-Type':req.params.kind==='video'?'video/mp4':'audio/mp4','Access-Control-Allow-Origin':'*','Cache-Control':'public,max-age=300'}).send(clean);
  }catch(e){res.status(502).json({error:e.message})}
});
app.get('/health',(_,res)=>res.json({ok:true}));
app.listen(PORT,'0.0.0.0',()=>console.log('Film4K HLS adapter',PORT));
