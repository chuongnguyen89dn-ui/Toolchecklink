import argparse,json,re,time,shutil,subprocess
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
from engines.external_resolvers import yt_dlp_probe,streamlink_probe
from engines.report_contract import envelope

MEDIA_RE=re.compile(r"(\.m3u8(?:\?|$)|\.mpd(?:\?|$)|\.(?:mp4|webm|m4v|mov)(?:\?|$))",re.I)
SEG_RE=re.compile(r"(\.(?:ts|m4s|aac)(?:\?|$)|/segment|/chunk)",re.I)
MIMES=("mpegurl","dash+xml","video/","audio/")
SAFE=("referer","origin","user-agent")

def kind(url,ct=""):
 s=(url+" "+ct).lower()
 if ".m3u8" in s or "mpegurl" in s:return "hls"
 if ".mpd" in s or "dash+xml" in s:return "dash"
 if any(x in s for x in (".mp4",".webm",".m4v",".mov","video/")):return "direct"
 return "media"

def launch_browser(p,headless):
 try:return p.chromium.launch(channel="msedge",headless=headless)
 except Exception:return p.chromium.launch(headless=headless)

def ffprobe_probe(url,headers=None):
 exe=shutil.which("ffprobe")
 if not exe:return {"available":False}
 cmd=[exe,"-v","error","-show_entries","stream=codec_type,codec_name","-of","json"]
 h=headers or {}
 header_lines="".join(f"{k}: {v}\r\n" for k,v in h.items() if k.lower() in SAFE)
 if header_lines:cmd+=["-headers",header_lines]
 cmd+=[url]
 try:
  p=subprocess.run(cmd,capture_output=True,text=True,timeout=25)
  data=json.loads(p.stdout or "{}") if p.returncode==0 else {}
  types=[x.get("codec_type") for x in data.get("streams",[])]
  return {"available":True,"ok":p.returncode==0 and bool(types),"hasVideo":"video" in types,"hasAudio":"audio" in types,"streams":data.get("streams",[]),"error":p.stderr[-1500:] or None}
 except Exception as e:return {"available":True,"ok":False,"error":str(e)}

def scan(url,wait=25,headless=False):
 found={};frames=[];errors=[];browser_segments=[]
 def add(u,source,ct="",headers=None,status=None):
  if not u:return
  if SEG_RE.search(u) and status and 200<=status<300:browser_segments.append({"url":u,"status":status})
  if not (MEDIA_RE.search(u) or any(x in (ct or "").lower() for x in MIMES)):return
  safe={k:v for k,v in (headers or {}).items() if k.lower() in SAFE}
  c=found.setdefault(u,{"url":u,"type":kind(u,ct),"detectedBy":[],"contentType":ct or None,"statusSeen":status,"requestContext":safe,"browserEvidence":{"manifestSeen":False,"segmentSeen":False}})
  if source not in c["detectedBy"]:c["detectedBy"].append(source)
  if status is not None:c["statusSeen"]=status
  if c["type"] in ("hls","dash") and status and 200<=status<300:c["browserEvidence"]["manifestSeen"]=True
 with sync_playwright() as p:
  browser=launch_browser(p,headless);context=browser.new_context();page=context.new_page()
  page.on("request",lambda req:add(req.url,"network-request","",req.headers))
  def on_response(resp):
   try:add(resp.url,"network-response",resp.headers.get("content-type",""),resp.request.headers,resp.status)
   except Exception as e:errors.append("response: "+str(e))
  page.on("response",on_response)
  try:page.goto(url,wait_until="domcontentloaded",timeout=60000)
  except Exception as e:errors.append("navigation: "+str(e))
  end=time.time()+wait
  while time.time()<end:
   try:
    for f in page.frames:
     if f.url and f.url!="about:blank" and f.url not in frames:frames.append(f.url)
     try:
      for u in f.eval_on_selector_all("video,source","els=>els.map(e=>e.currentSrc||e.src).filter(Boolean)"):add(u,"dom")
      for u in f.evaluate("performance.getEntriesByType('resource').map(e=>e.name)"):add(u,"performance")
      f.evaluate("()=>document.querySelectorAll('video').forEach(v=>{try{v.muted=true;v.play().catch(()=>{})}catch(e){}})")
     except Exception:pass
   except Exception as e:errors.append("scan: "+str(e))
   page.wait_for_timeout(1000)
  try:title=page.title();final_url=page.url
  except Exception:title="";final_url=url
  browser.close()
 items=[]
 seg_ok=bool(browser_segments)
 for c in found.values():
  if c["type"] in ("hls","dash") and seg_ok:c["browserEvidence"]["segmentSeen"]=True
  manifest_ok=c["browserEvidence"]["manifestSeen"]
  c["verification"]={"manifest_status":200 if manifest_ok else c.get("statusSeen"),"variant_status":200 if manifest_ok else None,"segment_status":200 if c["browserEvidence"]["segmentSeen"] else None,"playable":False,"method":"browser-network"}
  if c["type"] in ("hls","dash","direct"):
   probe=ffprobe_probe(c["url"],c.get("requestContext"))
   c["ffprobe"]=probe
   if probe.get("ok") and probe.get("hasVideo"):c["verification"]["playable"]=True
   elif manifest_ok and c["browserEvidence"]["segmentSeen"]:c["verification"]["playable"]=True
  items.append(c)
 items.sort(key=lambda x:(not x["verification"]["playable"],{"hls":0,"dash":1,"direct":2}.get(x["type"],3)))
 engines={"yt-dlp":yt_dlp_probe(url),"streamlink":streamlink_probe(url),"ffprobe":{"available":bool(shutil.which("ffprobe"))}}
 report=envelope(url,items,engines)
 report["page"]={"finalUrl":final_url,"title":title,"frames":frames,"errors":errors}
 report["browserSession"]={"successfulMediaSegments":len(browser_segments),"sampleSegments":browser_segments[:10],"note":"Verification uses media requests observed during the authorized browser playback session; no token generation or DRM bypass."}
 return report

def save_report(report,url,outdir="reports"):
 root=Path(outdir);root.mkdir(parents=True,exist_ok=True);stamp=datetime.now().strftime("%Y%m%d_%H%M%S");host=urlparse(url).netloc.replace(":","_") or "site"
 path=root/f"toolchecklink_{host}_{stamp}.json";payload=json.dumps(report,ensure_ascii=False,indent=2);path.write_text(payload,encoding="utf-8");(root/"latest.json").write_text(payload,encoding="utf-8");return path

def main():
 ap=argparse.ArgumentParser(description="Toolchecklink one-pass browser media discovery and playback verification");ap.add_argument("url",nargs="?");ap.add_argument("--wait",type=int,default=25);ap.add_argument("--headless",action="store_true");ap.add_argument("--outdir",default="reports")
 a=ap.parse_args()
 if not a.url:ap.print_help();return
 report=scan(a.url,a.wait,a.headless);out=save_report(report,a.url,a.outdir);s=report["summary"];print(f"JSON: {out.resolve()}");print(f"Candidates: {s['candidates']} | Verified: {s['verified']} | Playable: {s['playable']}")
if __name__=="__main__":main()
