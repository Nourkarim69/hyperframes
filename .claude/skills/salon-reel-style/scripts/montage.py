"""montage.py <dossier-client> <spec.json> {plan|picks|extract}
spec: {"bpm_beat":0.627,"grade":"...","shots":[[fichier, t_candidat, nb_temps, recherche, zoom, cx, cy, "desc"],...]}
Fichier .jpg = photo fixe (durée nb_temps)."""
import json,re,subprocess,sys,os
C,spec_path,step=sys.argv[1],sys.argv[2],sys.argv[3]
S=json.load(open(spec_path)); B=S["beat"]; W=f"{C}/_travail"; OUT=f"{C}/_montage"
os.makedirs(f"{OUT}/assets",exist_ok=True); os.makedirs(f"{W}/picks",exist_ok=True)
TM="zscale=t=linear:npl=203,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p"
GRADE=S.get("grade","eq=contrast=1.1:brightness=-0.03:saturation=0.8:gamma=0.92,vignette=angle=PI/5")
def best(f,c,L,r):
    p=f"{W}/motion/{f[:-4]}.txt"; txt=open(p).read()
    ts=[float(x) for x in re.findall(r"pts_time:([\d.]+)",txt)]; v=[float(x) for x in re.findall(r"YAVG=([\d.]+)",txt)]
    b=None
    for i,s in enumerate(ts):
        if s<c-r or s>c+r or s+L>ts[-1]: continue
        e=[v[j] for j in range(i,len(ts)) if ts[j]<s+L]
        sc=sum(e)/len(e)-0.5*max(0,max(e)-8)
        if b is None or sc>b[0]: b=(sc,s)
    return b[1] if b else c
plan=[];t=0
for sh in S["shots"]:
    f,c,n,r,z,cx,cy,d=sh; L=round(n*B,4)
    ss=c if f.endswith(".jpg") or r==0 else best(f,c,L,r)
    plan.append(dict(src=f,ss=round(ss,3),dur=L,start=round(t,4),zoom=z,cx=cx,cy=cy,desc=d)); t+=L
json.dump(plan,open(f"{OUT}/plan.json","w"),indent=1)
print("durée totale",round(t,3))
def crop(z,cx,cy):
    return f"crop=trunc(iw/{z}/2)*2:trunc(ih/{z}/2)*2:'min(max(0,iw*{cx}-ow/2),iw-ow)':'min(max(0,ih*{cy}-oh/2),ih-oh)'"
if step=="picks":
    for i,o in enumerate(plan):
        src=f"{C}/{o['src']}"; mid=str(o["ss"]+o["dur"]/2)
        pre=[] if o["src"].endswith(".jpg") else ["-ss",mid]
        tm="" if o["src"].endswith(".jpg") else TM+","
        subprocess.run(["ffmpeg","-v","error","-y",*pre,"-i",src,"-frames:v","1","-vf",f"{tm}{crop(o['zoom'],o['cx'],o['cy'])},scale=216:384,{GRADE},drawtext=text='{i+1}':x=6:y=6:fontsize=24:fontcolor=red:box=1",f"{W}/picks/{i+1:02d}.png"],check=True)
    subprocess.run(["ffmpeg","-v","error","-y","-pattern_type","glob","-i",f"{W}/picks/*.png","-vf","tile=9x2","-frames:v","1",f"{W}/picks.png"],check=True)
    print(f"{W}/picks.png")
if step=="extract":
    for i,o in enumerate(plan):
        src=f"{C}/{o['src']}"; n=round(o["dur"]*30); out=f"{OUT}/assets/plan{i+1:02d}.mp4"
        if o["src"].endswith(".jpg"):
            # photo : léger zoom avant pour qu'elle vive, comme un plan filmé
            vf=f"{crop(o['zoom'],o['cx'],o['cy'])},scale=2160:3840,zoompan=z='1+0.0015*on':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d={n}:s=1080x1920:fps=30,{GRADE}"
            cmd=["ffmpeg","-v","error","-y","-i",src,"-vf",vf,"-frames:v",str(n)]
        else:
            vf=f"{TM},{crop(o['zoom'],o['cx'],o['cy'])},scale=1080:1920:flags=lanczos,fps=30,{GRADE}"
            cmd=["ffmpeg","-v","error","-y","-ss",str(o["ss"]),"-i",src,"-vf",vf,"-frames:v",str(n)]
        subprocess.run(cmd+["-an","-c:v","libx264","-preset","medium","-crf","16","-pix_fmt","yuv420p",out],check=True)
        print(i+1,n,"images")
