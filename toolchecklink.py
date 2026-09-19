import argparse,json,re,time
from datetime import datetime,timezone
from pathlib import Path
from urllib.parse import urlparse
import requests
from playwright.sync_api import sync_playwright

MEDIA_RE=re.compile(r"(\.m3u8(?:\?|$)|\.mpd(?:\?|$)|\.(?:mp4|webm|m4v|mov)(?:\?|$))",re.I)
MIMES=("mpegurl","dash+xml","video/","audio/")
SENSITIVE={"cookie","authorization","proxy-authorization"}

def safe_headers(h):
    return {k:("<redacted>" if k.lower() in SENSITIVE else v) for k,v in (h or {}).items()}

def kind(url,ct=""):
    s=(url+" "+ct).lower()
    if ".m3u8" in s or "mpegurl" in s:return "hls"
    if ".mpd" in s or "dash+xml" in s:return "dash"
    if any(x in s for x in (".mp4",".webm",".m4v",".mov","video/")):return "direct"
    return "media"

def verify(c):
    raw=c.get("_raw_headers",{})
    headers={k:v for k,v in raw.items() if k.lower() in ("referer","origin","user-agent")}
    out={"ok":False,"status":None,"content_type":None,"manifest":None,"note":None}
    try:
        r=requests.get(c["url"],headers=headers,timeout=12,stream=True,allow_redirects=True)
        out["status"]=r.status_code;out["content_type"]=r.headers.get("content-type")
        out["ok"]=200<=r.status_code<300
        if c["type"] in ("hls","dash") and out["ok"]:
            sample=r.raw.read(8192).decode("utf-8","ignore")
            out["manifest"]=sample.startswith("#EXTM3U") if c["type"]=="hls" else ("<MPD" in sample or "<mpd" in sample)
            out["ok"]=out["ok"] and out["manifest"]
        r.close()
    except Exception as e:out["note"]=str(e)
    return out

def scan(url,wait=20,headless=False):
    found={};frames=[]
    def add(u,source,ct="",headers=None,status=None):
        if not u or not (MEDIA_RE.search(u) or any(x in (ct or "").lower() for x in MIMES)):return
        if u not in found:
            found[u]={"url":u,"type":kind(u,ct),"source":[source],"content_type":ct or None,"status_seen":status,
                      "headers":safe_headers(headers),"_raw_headers":headers or {}}
        elif source not in found[u]["source"]:found[u]["source"].append(source)
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=headless)
        context=browser.new_context()
        page=context.new_page()
        page.on("request",lambda req:add(req.url,"network-request","",req.headers))
        def response(resp):
            try:add(resp.url,"network-response",resp.headers.get("content-type",""),resp.request.headers,resp.status)
            except Exception:pass
        page.on("response",response)
        page.goto(url,wait_until="domcontentloaded",timeout=60000)
        end=time.time()+wait
        while time.time()<end:
            try:
                for u in page.eval_on_selector_all("video,source","els=>els.map(e=>e.currentSrc||e.src).filter(Boolean)"):add(u,"dom")
                frames=list(dict.fromkeys(f.url for f in page.frames if f.url and f.url!="about:blank"))
                for u in page.evaluate("performance.getEntriesByType('resource').map(e=>e.name)"):add(u,"performance")
                page.evaluate("()=>document.querySelectorAll('video').forEach(v=>{try{v.muted=true;v.play().catch(()=>{})}catch(e){}})")
            except Exception:pass
            page.wait_for_timeout(1000)
        title=page.title();final_url=page.url
        browser.close()
    candidates=[]
    for c in found.values():
        c["verification"]=verify(c);c.pop("_raw_headers",None);candidates.append(c)
    candidates.sort(key=lambda c:(not c["verification"]["ok"],{"hls":0,"dash":1,"direct":2}.get(c["type"],3)))
    return {"schema_version":"1.0","generated_at":datetime.now(timezone.utc).isoformat(),"input_url":url,
            "final_url":final_url,"title":title,"frames":frames,"candidate_count":len(candidates),
            "verified_count":sum(c["verification"]["ok"] for c in candidates),"candidates":candidates}

def main():
    ap=argparse.ArgumentParser();ap.add_argument("url",nargs="?");ap.add_argument("--wait",type=int,default=20);ap.add_argument("--headless",action="store_true")
    a=ap.parse_args();url=a.url or input("URL: ").strip();report=scan(url,a.wait,a.headless)
    host=urlparse(url).netloc.replace(":","_") or "site"
    out=Path(f"toolchecklink_{host}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    out.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(f"JSON: {out.resolve()}");print(f"Candidates: {report['candidate_count']} | Verified: {report['verified_count']}")
if __name__=="__main__":main()
