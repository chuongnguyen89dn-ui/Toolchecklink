import json,shutil,subprocess

def run_json(cmd,timeout=45):
    try:
        p=subprocess.run(cmd,capture_output=True,text=True,timeout=timeout)
        return {"available":True,"ok":p.returncode==0,"stdout":p.stdout[-12000:],"stderr":p.stderr[-4000:]}
    except Exception as e:return {"available":True,"ok":False,"error":str(e)}

def yt_dlp_probe(url):
    exe=shutil.which("yt-dlp")
    if not exe:return {"available":False}
    return run_json([exe,"--dump-single-json","--skip-download","--no-warnings",url])

def streamlink_probe(url):
    exe=shutil.which("streamlink")
    if not exe:return {"available":False}
    return run_json([exe,"--json",url])
