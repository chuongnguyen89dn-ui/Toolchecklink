from datetime import datetime,timezone
def level(candidate):
 v=candidate.get("verification") or {}
 if v.get("playable"):return 5
 if v.get("segment_status")==200:return 4
 if v.get("variant_status")==200:return 3
 if v.get("manifest_status")==200:return 2
 return 1 if candidate.get("url") else 0
def normalize(candidate):
 c=dict(candidate);c["level"]=level(c);labels={0:"NONE",1:"DETECTED",2:"RESOLVED",3:"CONTEXT_READY",4:"VERIFIED",5:"PLAYABLE"};c["level_label"]=labels[c["level"]];return c
def envelope(input_url,candidates,engines=None):
 items=[normalize(x) for x in candidates]
 return {"schemaVersion":"1.2","generatedAt":datetime.now(timezone.utc).isoformat(),"input":{"type":"url","source":input_url},"summary":{"candidates":len(items),"playable":sum(x["level"]==5 for x in items),"verified":sum(x["level"]>=4 for x in items)},"engines":engines or {},"candidates":items}
