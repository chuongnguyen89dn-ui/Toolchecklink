from urllib.parse import urljoin
import requests

def first_uri(text, base):
    for line in text.splitlines():
        s=line.strip()
        if s and not s.startswith("#"):
            return urljoin(base,s)
    return None

def inspect_hls(url, headers=None, timeout=12):
    """Validate an accessible HLS chain without bypassing access controls."""
    h=headers or {}
    result={"manifest_status":None,"variant_status":None,"segment_status":None,
            "master":False,"variant_url":None,"segment_url":None,"playable":False,"error":None}
    try:
        r=requests.get(url,headers=h,timeout=timeout,allow_redirects=True)
        result["manifest_status"]=r.status_code
        if not r.ok or not r.text.lstrip().startswith("#EXTM3U"):
            return result
        result["master"]="#EXT-X-STREAM-INF" in r.text
        child=first_uri(r.text,r.url)
        if not child:
            result["playable"]=True
            return result
        if result["master"]:
            result["variant_url"]=child
            v=requests.get(child,headers=h,timeout=timeout,allow_redirects=True)
            result["variant_status"]=v.status_code
            if not v.ok:return result
            child=first_uri(v.text,v.url)
        if child:
            result["segment_url"]=child
            s=requests.get(child,headers=h,timeout=timeout,stream=True,allow_redirects=True)
            result["segment_status"]=s.status_code
            if s.ok:
                next(s.iter_content(1024),b"")
                result["playable"]=True
            s.close()
        return result
    except Exception as e:
        result["error"]=str(e);return result
