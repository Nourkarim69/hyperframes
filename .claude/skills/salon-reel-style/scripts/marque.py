"""Identité MH Coiffure partagée par tous les reels : filigrane (logo blanc) et carte de fin (logo officiel carré).

Les logos viennent des fichiers fournis par le salon (scratchpad/marque) et sont copiés dans assets/.
"""
import os
import shutil

MARQUE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "marque")  # .claude/skills/salon-reel-style/marque

CSS = """
      #filigrane {{ position: absolute; top: 205px; left: 0; right: 0; margin: 0 auto; width: 250px; z-index: 7; opacity: 0.85;
        filter: drop-shadow(0 2px 6px rgba(0,0,0,0.45)); }}
      #fin {{ position: absolute; inset: 0; z-index: 8; }}
      #fin-bg {{ position: absolute; inset: 0; width: 1080px; height: 1920px; object-fit: cover; }}
      #fin-shade {{ position: absolute; inset: 0; background: rgba(8, 8, 10, 0.74); }}
      #fin-box {{ position: absolute; left: 0; right: 0; top: 520px; display: flex; flex-direction: column; align-items: center; }}
      #logo-carre {{ width: 560px; height: 560px; border-radius: 28px; box-shadow: 0 24px 60px rgba(0,0,0,0.55); }}
      #handle {{ margin-top: 56px; font-family: "Montserrat", sans-serif; font-weight: 800; font-size: 52px; letter-spacing: 0.03em; color: #fff; }}
      #adresse {{ margin-top: 18px; font-family: "Montserrat", sans-serif; font-weight: 600; font-size: 30px; letter-spacing: 0.12em; color: #dcccb4; }}
"""


def copier_logos(assets_dir):
    for f in ("logo-carre.jpg", "logo-blanc.png"):
        shutil.copy(os.path.join(MARQUE, f), os.path.join(assets_dir, f))


def filigrane(end):  # non utilisé : le salon veut le logo uniquement sur la carte de fin
    """Petit logo blanc en haut, de 0 à `end` (le début de la carte de fin)."""
    return f'      <img id="filigrane" class="clip" src="assets/logo-blanc.png" alt="MH Coiffure" data-start="0" data-duration="{end}" data-track-index="9" />'


def carte(start, total, bg, handle="@mhcoiffurelyon1"):
    """Élément HTML et tweens de la carte de fin, de `start` à `total` secondes, sur l'image `bg`."""
    el = (f'      <div id="fin" class="clip" data-start="{start}" data-duration="{round(total - start, 3)}" data-track-index="2">'
          f'<img id="fin-bg" src="{bg}" alt="" /><div id="fin-shade"></div>'
          f'<div id="fin-box"><img id="logo-carre" src="assets/logo-carre.jpg" alt="MH Coiffure" />'
          f'<div id="handle" data-var-text="handle">{handle}</div><div id="adresse">50 QUAI SAINT-VINCENT · LYON 1ER</div></div></div>')
    js = [f'tl.fromTo("#fin-shade",{{opacity:0}},{{opacity:1,duration:0.4,ease:"power2.out"}},{start});',
          f'tl.fromTo("#fin-box",{{opacity:0,y:30,scale:0.96}},{{opacity:1,y:0,scale:1,duration:0.5,ease:"power3.out"}},{round(start + 0.15, 3)});']
    return el, js
