import os,sys,threading,tkinter as tk
from tkinter import ttk,messagebox
from pathlib import Path
from toolchecklink import scan,save_report

class App(tk.Tk):
 def __init__(self):
  super().__init__();self.title("Toolchecklink");self.geometry("820x500");self.minsize(700,430)
  self.url=tk.StringVar();self.status=tk.StringVar(value="Ready")
  pad={"padx":14,"pady":8}
  ttk.Label(self,text="Toolchecklink",font=("Segoe UI",20,"bold")).pack(anchor="w",padx=18,pady=(18,4))
  ttk.Label(self,text="Paste a page URL. The browser will open automatically and scan media requests.").pack(anchor="w",padx=18)
  row=ttk.Frame(self);row.pack(fill="x",**pad)
  self.entry=ttk.Entry(row,textvariable=self.url,font=("Segoe UI",11));self.entry.pack(side="left",fill="x",expand=True,padx=(0,8));self.entry.focus()
  self.btn=ttk.Button(row,text="SCAN",command=self.start);self.btn.pack(side="left")
  self.bar=ttk.Progressbar(self,mode="indeterminate");self.bar.pack(fill="x",padx=14,pady=(0,8))
  ttk.Label(self,textvariable=self.status).pack(anchor="w",padx=14)
  self.log=tk.Text(self,height=15,wrap="word",font=("Consolas",10));self.log.pack(fill="both",expand=True,padx=14,pady=8);self.log.configure(state="disabled")
  foot=ttk.Frame(self);foot.pack(fill="x",padx=14,pady=(0,14))
  ttk.Button(foot,text="Open reports folder",command=self.open_reports).pack(side="left")
  ttk.Button(foot,text="Open latest.json",command=self.open_latest).pack(side="left",padx=8)
 def write(self,s):
  self.after(0,lambda:self._write(s))
 def _write(self,s):
  self.log.configure(state="normal");self.log.insert("end",s+"\n");self.log.see("end");self.log.configure(state="disabled")
 def start(self):
  u=self.url.get().strip()
  if not (u.startswith("http://") or u.startswith("https://")):messagebox.showwarning("Toolchecklink","Paste a valid http/https URL.");return
  self.btn.configure(state="disabled");self.bar.start(12);self.status.set("Scanning... browser may open.");self.write("SCAN: "+u)
  threading.Thread(target=self.worker,args=(u,),daemon=True).start()
 def worker(self,u):
  try:
   r=scan(u,25,False);p=save_report(r,u,"reports");s=r["summary"]
   self.write(f"DONE | Candidates: {s['candidates']} | Verified: {s['verified']} | Playable: {s['playable']}")
   self.write("JSON: "+str(p.resolve()));self.after(0,lambda:self.status.set("Completed - latest.json is ready"))
  except Exception as e:
   self.write("ERROR: "+repr(e));self.after(0,lambda:self.status.set("Failed - see log"))
  finally:self.after(0,self.finish)
 def finish(self):self.bar.stop();self.btn.configure(state="normal")
 def open_reports(self):
  p=Path("reports").resolve();p.mkdir(exist_ok=True);os.startfile(p)
 def open_latest(self):
  p=Path("reports/latest.json").resolve()
  if p.exists():os.startfile(p)
  else:messagebox.showinfo("Toolchecklink","No latest.json yet. Run a scan first.")

if __name__=="__main__":App().mainloop()
