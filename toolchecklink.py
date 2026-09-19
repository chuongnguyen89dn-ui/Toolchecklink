import argparse,json,re,time
from datetime import datetime,timezone
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
from engines.hls_inspector import inspect_hls
from engines.external_resolvers import yt_dlp_probe,streamlink_probe
from engines.report_contract import envelope

MEDIA_RE=re.compile(r"(\.m3u8(?:\?|$)|\.mpd(?:\?|$)|\.(?:mp4|webm|m4v|mov)(?:\?|$))",re.I)
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

def scan(url,wait=20,headless=False):
    found={};frames=[];errors=[]
    def add(u,source,ct="",headers=None,status=None):
        if not u or not (MEDIA_RE.search(u) or any(x in (ct or "").lower() for x in MIMES)):return
        safe={k:v for k,v in (headers or {}).items() if k.lower() in SAFE}
        c=found.setdefault(u,{"url":u,"type":kind(u,ct),"detectedBy":[],"contentType":ct or None,"statusSeen":status,"requestContext":safe})
        if source not in c["detectedBy"]:c["detectedBy"].append(source)
        if status is not None:c["statusSeen"]=status
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
                    if f.url and f.url!="about:blank":
                        if f.url not in frames:frames.append(f.url)
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
    for c in found.values():
        if c["type"]=="hls":
            c["verification"]=inspect_hls(c["url"],c.get("requestContext") or {})
        else:
            c["verification"]={"manifest_status":c.get("statusSeen"),"variant_status":None,"segment_status":None,"playable":False}
        items.append(c)
    items.sort(key=lambda x:({"hls":0,"dash":1,"direct":2}.get(x["type"],3),x["url"]))
    engines={"yt-dlp":yt_dlp_probe(url),"streamlink":streamlink_probe(url)}
    report=envelope(url,items,engines)
    report["page"]={"finalUrl":final_url,"title":title,"frames":frames,"errors":errors}
    return report

def save_report(report,url,outdir="reports"):
    root=Path(outdir);root.mkdir(parents=True,exist_ok=True)
    stamp=datetime.now().strftime("%Y%m%d_%H%M%S")
    host=urlparse(url).netloc.replace(":","_") or "site"
    path=root/f"toolchecklink_{host}_{stamp}.json"
    payload=json.dumps(report,ensure_ascii=False,indent=2)
    path.write_text(payload,encoding="utf-8")
    (root/"latest.json").write_text(payload,encoding="utf-8")
    return path

def main():
    ap=argparse.ArgumentParser(description="Toolchecklink media discovery and verification")
    ap.add_argument("url",nargs="?");ap.add_argument("--wait",type=int,default=20);ap.add_argument("--headless",action="store_true");ap.add_argument("--outdir",default="reports")
    a=ap.parse_args()
    if not a.url:
        ap.print_help();return
    report=scan(a.url,a.wait,a.headless);out=save_report(report,a.url,a.outdir)
    s=report["summary"];print(f"JSON: {out.resolve()}");print(f"Candidates: {s['candidates']} | Verified: {s['verified']} | Playable: {s['playable']}")
if __name__=="__main__":main()
