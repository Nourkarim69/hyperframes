"""build.py <dossier-client> <titre> <decalage_musique_s> <plans_flash ex: 2,14>
Écrit _montage/index.html + compositions à partir de _montage/plan.json (style salon-reel-style)."""
import json,sys,os,shutil,subprocess
C,titre,off,flashes=sys.argv[1],sys.argv[2],float(sys.argv[3]),[int(x) for x in sys.argv[4].split(",") if x]
M=f"{C}/_montage"; plan=json.load(open(f"{M}/plan.json")); total=round(sum(o["dur"] for o in plan),3)
os.makedirs(f"{M}/compositions",exist_ok=True)
import glob
# GSAP is copied next to the composition so renders never depend on a CDN.
REPO=os.path.dirname(os.path.abspath(__file__)).split("/.claude/")[0].split("/.agents/")[0]
shutil.copy(sorted(glob.glob(f"{REPO}/node_modules/.bun/gsap@*/node_modules/gsap/dist/gsap.min.js"))[-1],f"{M}/assets/gsap.min.js")
subprocess.run(["ffmpeg","-v","error","-y","-ss",str(off),"-t",str(total),"-i",f"{M}/assets/musique-brute.wav","-af",f"afade=t=out:st={total-1.3}:d=1.3,loudnorm=I=-16:TP=-1.5:LRA=11","-ar","48000",f"{M}/assets/musique.wav"],check=True)
vids="\n".join(f'      <video id="plan{i+1:02d}" class="clip" src="assets/plan{i+1:02d}.mp4" data-start="{o["start"]}" data-duration="{o["dur"]}" data-track-index="0" muted playsinline></video>' for i,o in enumerate(plan))
fl="\n".join(f'      <div id="flash{k}" class="clip host" data-composition-id="flash" data-composition-src="compositions/flash.html" data-start="{plan[n-1]["start"]}" data-duration="0.1" data-track-index="1" data-track-kind="graphics"></div>' for k,n in enumerate(flashes,1))
tdur=round(min(2.7,total),3)
open(f"{M}/index.html","w").write(f'''<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="assets/gsap.min.js"></script>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ width: 1080px; height: 1920px; overflow: hidden; background: #000; }}
      #root {{ position: relative; width: 100%; height: 100%; overflow: hidden; background: #000; }}
      #root video {{ position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }}
      .host {{ position: absolute; inset: 0; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{total}" data-width="1080" data-height="1920">
{vids}
{fl}
      <div id="titre" class="clip host" data-composition-id="titre" data-composition-src="compositions/titre.html" data-start="0" data-duration="{tdur}" data-track-index="2" data-track-kind="graphics" style="z-index: 2"></div>
      <audio id="musique" class="clip" src="assets/musique.wav" data-start="0" data-duration="{total}" data-track-index="3" data-volume="0.7"></audio>
    </div>
    <script>
      const tl = gsap.timeline({{ paused: true }});
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
''')
open(f"{M}/compositions/flash.html","w").write('''<template>
  <div id="root" data-composition-id="flash" data-width="1080" data-height="1920">
    <style>
      #root { position: absolute; inset: 0; background: #000; }
    </style>
    <script>
      window.__timelines["flash"] = gsap.timeline({ paused: true });
    </script>
  </div>
</template>
''')
open(f"{M}/compositions/titre.html","w").write(f'''<template>
  <div id="root" data-composition-id="titre" data-width="1080" data-height="1920">
    <style>
      #root {{ position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }}
      #titre-texte {{
        font-family: "League Gothic", "Oswald", sans-serif; font-size: 46px; letter-spacing: 0.02em;
        color: #fff; text-shadow: 0 2px 8px rgba(0, 0, 0, 0.45); text-transform: uppercase;
      }}
    </style>
    <div id="titre-texte" data-var-text="titre">{titre}</div>
    <script>
      window.__timelines["titre"] = gsap.timeline({{ paused: true }});
    </script>
  </div>
</template>
''')
print("ok",total)
