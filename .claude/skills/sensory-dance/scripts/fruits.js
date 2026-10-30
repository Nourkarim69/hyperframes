/* FruitDance — glossy "toy 3D" fruit characters dancing on the beat, for baby
 * sensory videos. Everything drawn is a pure function of time t (seconds).
 *
 *   const show = FruitDance.mount(stageEl, DATA);
 *   show.render(t);
 *
 * DATA = { W, H, bpm, dur, fruits: { id: {kind} }, segments: [...], labels: [...], bursts: [...] }
 *   segment: { start, end, mode: "solo"|"group", fruit?: id, move: name }
 */
window.FruitDance =
  window.FruitDance ||
  (function () {
    const NS = "http://www.w3.org/2000/svg";
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, u) => a + (b - a) * u;
    const f = (n) => Math.round(n * 100) / 100;
    const backOut = (u) => {
      const c = 1.9;
      return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2);
    };
    function mulberry32(a) {
      return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    // ---------- fruit art (local coords: body centred on 0,0, ~300 px tall) ----------
    // Each kind: body svg, body colours for the glossy gradient, limb colour, face anchor.
    const KINDS = {
      strawberry: {
        c: ["#FF5A6E", "#E0203C", "#9E0F25"],
        limb: "#FF8FA0",
        glow: "#FF3355",
        body: (g) => {
          let seeds = "";
          const pts = [
            [-60, -40],
            [0, -60],
            [60, -40],
            [-80, 20],
            [-25, 0],
            [30, 5],
            [85, 15],
            [-50, 70],
            [10, 80],
            [60, 70],
            [-15, 125],
            [25, 120],
          ];
          for (const [x, y] of pts)
            seeds += `<ellipse cx="${x}" cy="${y}" rx="6" ry="9" fill="#FFE27A" opacity=".9"/>`;
          return (
            `<path d="M 0 165 C -90 140 -150 40 -140 -40 C -132 -110 -70 -130 0 -112 C 70 -130 132 -110 140 -40 C 150 40 90 140 0 165 Z" fill="url(#${g})"/>${seeds}` +
            `<path d="M -80 -112 L -40 -130 L -50 -165 L -5 -138 L 0 -180 L 15 -138 L 55 -165 L 42 -128 L 85 -112 L 30 -108 L 0 -95 L -30 -108 Z" fill="#3FBF5A" stroke="#1F8A36" stroke-width="5" stroke-linejoin="round"/>`
          );
        },
        face: { y: 10, s: 1 },
      },
      banana: {
        c: ["#FFF27A", "#FFD22E", "#D49A00"],
        limb: "#FFE680",
        glow: "#FFD400",
        body: (g) =>
          `<path d="M -30 -165 C 35 -160 108 -85 110 10 C 112 100 70 165 0 168 C -70 165 -110 100 -105 10 C -100 -70 -75 -140 -30 -165 Z" fill="url(#${g})"/>` +
          `<path d="M 40 -120 C 85 -60 92 40 60 120" stroke="#E0AE10" stroke-width="6" fill="none" stroke-linecap="round" opacity=".7"/>` +
          `<path d="M -48 -160 L -30 -198 L -12 -192 L -22 -160 Z" fill="#7A5A1A" stroke="#4A3410" stroke-width="4" stroke-linejoin="round"/>` +
          `<ellipse cx="0" cy="166" rx="12" ry="7" fill="#6B4A1A"/>`,
        face: { y: 10, s: 1 },
        limbX: 104,
      },
      orange: {
        c: ["#FFB347", "#FF8A00", "#C45E00"],
        limb: "#FFC070",
        glow: "#FF8A00",
        body: (g) => {
          let dots = "";
          const r = mulberry32(7);
          for (let i = 0; i < 26; i++) {
            const a = r() * 6.28,
              d = 30 + r() * 110;
            dots += `<circle cx="${f(Math.cos(a) * d)}" cy="${f(Math.sin(a) * d)}" r="3" fill="#D96E00" opacity=".45"/>`;
          }
          return (
            `<circle cx="0" cy="0" r="150" fill="url(#${g})"/>${dots}` +
            `<path d="M 0 -148 C 10 -175 40 -190 75 -180 C 60 -150 30 -140 0 -148 Z" fill="#3FBF5A" stroke="#1F8A36" stroke-width="4"/><rect x="-5" y="-165" width="10" height="22" rx="4" fill="#6B4A1A"/>`
          );
        },
        face: { y: 5, s: 1 },
      },
      watermelon: {
        c: ["#FF7B8A", "#FF3D5A", "#C71E3B"],
        limb: "#7EE07E",
        glow: "#FF4D6A",
        body: (g) => {
          let seeds = "";
          for (const [x, y] of [
            [-90, 20],
            [-45, 60],
            [0, 75],
            [45, 60],
            [90, 20],
            [-60, -10],
            [60, -10],
          ])
            seeds += `<ellipse cx="${x}" cy="${y}" rx="7" ry="12" fill="#2A1A1A" transform="rotate(${x / 4},${x},${y})"/>`;
          return (
            `<path d="M -175 -60 L 175 -60 C 175 60 95 140 0 140 C -95 140 -175 60 -175 -60 Z" fill="#2E9E3E"/>` +
            `<path d="M -160 -60 L 160 -60 C 160 50 85 122 0 122 C -85 122 -160 50 -160 -60 Z" fill="#E9FFD9"/>` +
            `<path d="M -148 -60 L 148 -60 C 148 42 80 108 0 108 C -80 108 -148 42 -148 -60 Z" fill="url(#${g})"/>${seeds}`
          );
        },
        face: { y: -15, s: 0.95 },
        limbY: -40,
        limbX: 168,
        noShine: true,
      },
      pineapple: {
        c: ["#FFE066", "#F5B800", "#B57F00"],
        limb: "#FFD24D",
        glow: "#F5B800",
        body: (g) => {
          let hatch = "";
          for (let i = -4; i <= 4; i++)
            hatch += `<path d="M ${i * 40 - 120} -120 L ${i * 40 + 120} 150" stroke="#C98A00" stroke-width="4" opacity=".55"/><path d="M ${i * 40 + 120} -120 L ${i * 40 - 120} 150" stroke="#C98A00" stroke-width="4" opacity=".55"/>`;
          return (
            `<g><clipPath id="${g}-clip"><ellipse cx="0" cy="20" rx="120" ry="150"/></clipPath>` +
            `<ellipse cx="0" cy="20" rx="120" ry="150" fill="url(#${g})"/><g clip-path="url(#${g}-clip)">${hatch}</g></g>` +
            `<path d="M -70 -115 L -95 -200 L -35 -140 L -30 -240 L 5 -140 L 40 -235 L 40 -140 L 95 -200 L 70 -115 Z" fill="#3FBF5A" stroke="#1F8A36" stroke-width="5" stroke-linejoin="round"/>`
          );
        },
        face: { y: 25, s: 0.95 },
      },
      apple: {
        c: ["#B6F06A", "#6CC72E", "#3C8A12"],
        limb: "#A6E36A",
        glow: "#7CD63A",
        body: (g) =>
          `<path d="M 0 -110 C 40 -150 140 -140 150 -30 C 160 70 90 160 30 150 C 15 147 -15 147 -30 150 C -90 160 -160 70 -150 -30 C -140 -140 -40 -150 0 -110 Z" fill="url(#${g})"/>` +
          `<path d="M -4 -112 C -8 -140 0 -160 12 -175" stroke="#6B4A1A" stroke-width="10" fill="none" stroke-linecap="round"/>` +
          `<path d="M 12 -150 C 40 -185 85 -175 95 -160 C 70 -135 35 -135 12 -150 Z" fill="#3FBF5A" stroke="#1F8A36" stroke-width="4"/>`,
        face: { y: 10, s: 1 },
      },
      blueberry: {
        c: ["#8FA8FF", "#4A63E0", "#2A3A9E"],
        limb: "#9DB0FF",
        glow: "#4A63E0",
        body: (g) =>
          `<circle cx="0" cy="0" r="145" fill="url(#${g})"/>` +
          `<path d="M -28 -140 L -10 -122 L 0 -150 L 12 -122 L 32 -140 L 24 -115 L -22 -115 Z" fill="#2A3A9E" stroke="#1A2570" stroke-width="5" stroke-linejoin="round"/>`,
        face: { y: 10, s: 1 },
      },
      grape: {
        c: ["#D49BFF", "#9B4DE0", "#5E2299"],
        limb: "#C58CFF",
        glow: "#A855F7",
        body: (g) =>
          `<ellipse cx="0" cy="10" rx="125" ry="155" fill="url(#${g})"/>` +
          `<path d="M 0 -142 C -5 -165 5 -180 20 -190" stroke="#6B4A1A" stroke-width="10" fill="none" stroke-linecap="round"/>` +
          `<path d="M 15 -175 C 45 -205 95 -195 105 -178 C 80 -155 40 -155 15 -175 Z" fill="#3FBF5A" stroke="#1F8A36" stroke-width="4"/>`,
        face: { y: 15, s: 1 },
      },
    };

    function gradDefs(id, c) {
      return `<radialGradient id="${id}" cx="35%" cy="28%" r="80%"><stop offset="0" stop-color="${c[0]}"/><stop offset=".55" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></radialGradient>`;
    }

    function buildFruit(id, kind) {
      const K = KINDS[kind];
      const gid = `fd-g-${id}`;
      const g = document.createElementNS(NS, "g");
      const ly = K.limbY || 40;
      const lx = K.limbX || 128;
      const limb = (cls, x, y, len) =>
        `<g class="${cls}" data-px="${x}" data-py="${y}"><path d="M ${x} ${y} L ${x} ${y + len}" stroke="${K.limb}" stroke-width="16" stroke-linecap="round"/>` +
        `<circle cx="${x}" cy="${y + len + 6}" r="20" fill="#FFFFFF"/></g>`;
      const leg = (cls, x, y) =>
        `<g class="${cls}" data-px="${x}" data-py="${y}"><path d="M ${x} ${y} L ${x} ${y + 70}" stroke="${K.limb}" stroke-width="16" stroke-linecap="round"/>` +
        `<ellipse cx="${x + (x < 0 ? -10 : 10)}" cy="${y + 80}" rx="30" ry="16" fill="#FFFFFF"/></g>`;
      const F = K.face;
      g.innerHTML =
        `<defs>${gradDefs(gid, K.c)}<radialGradient id="${gid}-sh"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>` +
        `<ellipse class="shadow" cx="0" cy="250" rx="120" ry="18" fill="#fff" opacity=".08"/>` +
        `<g class="rig">` +
        leg("legL", -50, 140) +
        leg("legR", 50, 140) +
        limb("armL", -lx, ly, 85) +
        limb("armR", lx, ly, 85) +
        `<g class="body">${K.body(gid)}` +
        (K.noShine
          ? ""
          : `<ellipse cx="-55" cy="-75" rx="42" ry="26" fill="url(#${gid}-sh)" transform="rotate(-30,-55,-75)"/>` +
            `<circle cx="-92" cy="-30" r="9" fill="#fff" opacity=".7"/>`) +
        `</g>` +
        `<g class="face" transform="translate(${F.x || 0},${F.y}) scale(${F.s})">` +
        `<g class="eyeL" transform="translate(-42,-18)"><g class="eyeS"><ellipse rx="27" ry="33" fill="#fff"/><ellipse class="pupil" cx="3" cy="4" rx="16" ry="20" fill="#1A1020"/><circle cx="9" cy="-5" r="7" fill="#fff"/></g></g>` +
        `<g class="eyeR" transform="translate(42,-18)"><g class="eyeS"><ellipse rx="27" ry="33" fill="#fff"/><ellipse class="pupil" cx="3" cy="4" rx="16" ry="20" fill="#1A1020"/><circle cx="9" cy="-5" r="7" fill="#fff"/></g></g>` +
        `<ellipse cx="-70" cy="28" rx="18" ry="10" fill="#FF7FA0" opacity=".6"/><ellipse cx="70" cy="28" rx="18" ry="10" fill="#FF7FA0" opacity=".6"/>` +
        `<path class="mouth" fill="#5A0F1E" stroke="#3A0A12" stroke-width="5" stroke-linejoin="round"/>` +
        `<ellipse class="tongue" cx="0" cy="0" rx="13" ry="8" fill="#FF6F86"/>` +
        `</g></g>`;
      const q = (s) => g.querySelector(s);
      const piv = (el) => [Number(el.dataset.px), Number(el.dataset.py)];
      const P = {
        root: g,
        rig: q(".rig"),
        armL: q(".armL"),
        armR: q(".armR"),
        legL: q(".legL"),
        legR: q(".legR"),
        eyes: g.querySelectorAll(".eyeS"),
        pupils: g.querySelectorAll(".pupil"),
        mouth: q(".mouth"),
        tongue: q(".tongue"),
        shadow: q(".shadow"),
      };
      P.pv = { armL: piv(P.armL), armR: piv(P.armR), legL: piv(P.legL), legR: piv(P.legR) };
      return { id, kind, K, P, seed: id.length * 97 + kind.length * 13 };
    }

    // ---------- dance moves: pose from beat position b ----------
    // Returns {x, y, rot, sx, sy, aL, aR, lL, lR, open, squint}; arm angle 0 = hanging, -150 = up (right arm).
    function pose(move, b) {
      const p = b - Math.floor(b);
      const k = Math.floor(b);
      const hop = Math.sin(Math.PI * p);
      const land = Math.pow(1 - p, 6);
      const o = {
        x: 0,
        y: -hop * 26,
        rot: 0,
        sx: 1 + land * 0.1,
        sy: 1 - land * 0.12,
        aL: 25,
        aR: -25,
        lL: 0,
        lR: 0,
        open: 0.25 + hop * 0.5,
        squint: 0,
      };
      if (move === "bounce") {
        o.y = -hop * 70;
        o.aL = 150 - hop * 40;
        o.aR = -150 + hop * 40;
        o.squint = 0.4;
      } else if (move === "sway") {
        const s = Math.sin(Math.PI * b);
        o.x = s * 60;
        o.rot = s * 16;
        o.aL = 60 + s * 50;
        o.aR = -60 + s * 50;
        o.lL = s * 12;
        o.lR = s * 12;
      } else if (move === "jacks") {
        const up = k % 2 ? 1 - p : p;
        o.y = -hop * 45;
        o.aL = lerp(30, 165, up);
        o.aR = -lerp(30, 165, up);
        o.lL = lerp(0, 22, up);
        o.lR = -lerp(0, 22, up);
        o.open = 0.6;
      } else if (move === "spin") {
        const cyc = (b % 4) / 4;
        o.sx *= Math.cos(cyc * Math.PI * 2);
        o.y = -hop * 35;
        o.aL = 110;
        o.aR = -110;
        o.open = 0.7;
      } else if (move === "wiggle") {
        const s = Math.sin(Math.PI * 4 * b);
        o.rot = s * 9;
        o.x = s * 14;
        o.aL = 90 + s * 40;
        o.aR = -90 + s * 40;
        o.y = -hop * 18;
        o.squint = 0.55;
        o.open = 0.45;
      } else if (move === "twist") {
        const s = Math.sin(Math.PI * b);
        o.rot = s * 10;
        o.sx *= 1 - Math.abs(s) * 0.08;
        o.lL = -s * 25;
        o.lR = -s * 25;
        o.aL = 70 - s * 40;
        o.aR = -70 - s * 40;
        o.y = -Math.abs(s) * 20;
      } else if (move === "clap") {
        const c = Math.abs(Math.sin(Math.PI * 2 * b));
        o.aL = 95 + c * 35;
        o.aR = -95 - c * 35;
        o.y = -hop * 30;
        o.open = 0.7;
      } else if (move === "wave") {
        o.aL = 25;
        o.aR = -150 + Math.sin(Math.PI * 4 * b) * 25;
        o.rot = Math.sin(Math.PI * b) * 6;
        o.y = -hop * 15;
        o.squint = 0.35;
      }
      return o;
    }

    function mount(stage, D) {
      stage.style.cssText = "position:absolute;inset:0;overflow:hidden;background:#000";
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("width", D.W);
      svg.setAttribute("height", D.H);
      svg.setAttribute("viewBox", `0 0 ${D.W} ${D.H}`);
      svg.style.cssText = "position:absolute;inset:0";
      stage.appendChild(svg);
      const rnd = mulberry32(42);
      // background: glow + pulsing rings + twinkles
      let bg = `<defs><radialGradient id="fd-glow"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".45" stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>`;
      bg += `<circle class="glow" r="${Math.max(D.W, D.H) * 0.42}" fill="url(#fd-glow)"/>`;
      for (let i = 0; i < 3; i++) bg += `<circle class="ring" fill="none" stroke-width="10"/>`;
      for (let i = 0; i < 70; i++) {
        const x = rnd() * D.W,
          y = rnd() * D.H,
          r = 2 + rnd() * 5;
        bg += `<path class="tw" d="M 0 ${-r * 2} L ${r * 0.5} ${-r * 0.5} L ${r * 2} 0 L ${r * 0.5} ${r * 0.5} L 0 ${r * 2} L ${-r * 0.5} ${r * 0.5} L ${-r * 2} 0 L ${-r * 0.5} ${-r * 0.5} Z" transform="translate(${f(x)},${f(y)})" fill="${["#FFF6A0", "#9FE7FF", "#FFB3E6", "#B8FFB0"][i % 4]}" data-ph="${f(rnd() * 6.28)}"/>`;
      }
      const bgG = document.createElementNS(NS, "g");
      bgG.innerHTML = bg;
      svg.appendChild(bgG);
      const glow = bgG.querySelector(".glow");
      const glowStops = bgG.querySelectorAll("#fd-glow stop");
      const rings = bgG.querySelectorAll(".ring");
      const tws = bgG.querySelectorAll(".tw");
      // fruits
      const fruitsG = document.createElementNS(NS, "g");
      svg.appendChild(fruitsG);
      const fruits = {};
      for (const id in D.fruits) {
        const fr = buildFruit(id, D.fruits[id].kind);
        fruitsG.appendChild(fr.P.root);
        fruits[id] = fr;
      }
      // confetti
      const confG = document.createElementNS(NS, "g");
      svg.appendChild(confG);
      const conf = [];
      for (const bt of D.bursts || []) {
        const r = mulberry32(Math.floor(bt * 1000));
        for (let i = 0; i < 46; i++) {
          const e = document.createElementNS(NS, "rect");
          e.setAttribute("width", "18");
          e.setAttribute("height", "10");
          e.setAttribute("rx", "3");
          e.setAttribute(
            "fill",
            ["#FF4D6A", "#FFD400", "#4ADE80", "#38BDF8", "#A855F7", "#FF8A00"][i % 6],
          );
          confG.appendChild(e);
          conf.push({
            e,
            t0: bt,
            x: D.W * (0.1 + r() * 0.8),
            vx: (r() - 0.5) * 300,
            vy: -400 - r() * 700,
            sp: (r() - 0.5) * 900,
          });
        }
      }
      const beat = 60 / D.bpm;

      function place(fr, cx, cy, scale, o, appear) {
        const P = fr.P;
        const s = scale * appear;
        P.root.setAttribute(
          "transform",
          `translate(${f(cx + o.x * scale)},${f(cy + o.y * scale)}) scale(${f(Math.max(0.001, s))})`,
        );
        P.root.setAttribute("opacity", appear > 0.001 ? "1" : "0");
        P.rig.setAttribute(
          "transform",
          `rotate(${f(o.rot)}) scale(${f(o.sx)},${f(o.sy)}) translate(0,${f((1 - o.sy) * 160)})`,
        );
        const r = (el, a, pv) => el.setAttribute("transform", `rotate(${f(a)},${pv[0]},${pv[1]})`);
        r(P.armL, o.aL, P.pv.armL);
        r(P.armR, o.aR, P.pv.armR);
        r(P.legL, o.lL, P.pv.legL);
        r(P.legR, o.lR, P.pv.legR);
        P.shadow.setAttribute("transform", `translate(0,${f(-o.y)}) scale(${f(1 + o.y / 300)},1)`);
      }

      function face(fr, t, o) {
        const P = fr.P;
        const per = 2.8 + (fr.seed % 10) / 10;
        const ph = (t + fr.seed / 50) % per;
        const blink = ph < 0.14 ? 1 - Math.sin((ph / 0.14) * Math.PI) * 0.9 : 1;
        const lid = Math.min(blink, 1 - o.squint * 0.55);
        P.eyes.forEach((e) => e.setAttribute("transform", `scale(1,${f(lid)})`));
        const open = clamp(o.open, 0, 1);
        const w = 34,
          top = 30,
          bot = 30 + 18 + open * 42;
        P.mouth.setAttribute(
          "d",
          `M ${-w} ${top} Q 0 ${top + 8} ${w} ${top} Q ${w * 0.9} ${f(bot)} 0 ${f(bot)} Q ${-w * 0.9} ${f(bot)} ${-w} ${top} Z`,
        );
        P.tongue.setAttribute(
          "transform",
          `translate(0,${f(bot - 9)}) scale(1,${f(0.5 + open * 0.6)})`,
        );
      }

      function render(t) {
        const b = t / beat;
        const pulse = Math.pow(1 - (b % 1), 3);
        // active segment
        let si = 0;
        D.segments.forEach((s, i) => {
          if (t >= s.start) si = i;
        });
        const seg = D.segments[si];
        // the band only pops in when it arrives after a solo; the opening frame is already full
        const popIn = si > 0 && D.segments[si - 1].mode === "solo";
        const cx = D.W / 2,
          cy = D.H * (D.H > D.W ? 0.5 : 0.46);
        const col =
          seg.mode === "solo"
            ? fruits[seg.fruit].K.glow
            : ["#FF3355", "#FFD400", "#4A63E0", "#7CD63A"][Math.floor(b / 4) % 4];
        glow.setAttribute("cx", cx);
        glow.setAttribute("cy", cy);
        glowStops.forEach((st) => st.setAttribute("stop-color", col));
        glow.setAttribute("opacity", String(f(0.28 + pulse * 0.22)));
        rings.forEach((rg, i) => {
          const u = ((b + i * 1.33) % 4) / 4;
          rg.setAttribute("cx", cx);
          rg.setAttribute("cy", cy);
          rg.setAttribute("r", String(f(120 + u * Math.max(D.W, D.H) * 0.6)));
          rg.setAttribute("stroke", col);
          rg.setAttribute("opacity", String(f((1 - u) * 0.35)));
        });
        tws.forEach((s) =>
          s.setAttribute(
            "opacity",
            String(f(0.3 + 0.7 * Math.abs(Math.sin(t * 1.7 + Number(s.dataset.ph))))),
          ),
        );
        // fruits
        const ids = Object.keys(fruits);
        for (const id of ids) {
          const fr = fruits[id];
          if (seg.mode === "solo" && seg.fruit !== id) {
            fr.P.root.setAttribute("opacity", "0");
            continue;
          }
          let appear = 1,
            cxx = cx,
            cyy = cy,
            sc;
          if (seg.mode === "solo") {
            sc = D.H > D.W ? 1.9 : 1.25;
            const ui = clamp((t - seg.start + 0.1) / 0.45, 0, 1);
            const uo = clamp((seg.end - t) / 0.3, 0, 1);
            appear = backOut(ui) * (uo < 1 ? uo : 1);
          } else {
            const i = ids.indexOf(id);
            const portrait = D.H > D.W;
            const cols = portrait ? 2 : 4;
            const rows = Math.ceil(ids.length / cols);
            const gx = i % cols,
              gy = Math.floor(i / cols);
            const cellW = D.W / cols,
              cellH = (portrait ? D.H * 0.78 : D.H * 0.9) / rows;
            cxx = cellW * (gx + 0.5);
            cyy = (portrait ? D.H * 0.12 : D.H * 0.06) + cellH * (gy + 0.5);
            sc = Math.min(cellW, cellH) / (portrait ? 470 : 560);
            const ui = popIn ? clamp((t - seg.start - i * beat * 0.25) / 0.4, 0, 1) : 1;
            appear = backOut(ui);
          }
          const mv =
            seg.mode === "group" && seg.alt ? seg.alt[ids.indexOf(id) % seg.alt.length] : seg.move;
          const o = pose(
            mv,
            b + (seg.mode === "group" ? (ids.indexOf(id) % 2) * 0.5 * (seg.offbeat ? 1 : 0) : 0),
          );
          place(fr, cxx, cyy, sc, o, appear);
          face(fr, t, o);
        }
        // confetti
        for (const c of conf) {
          const dt = t - c.t0;
          if (dt < 0 || dt > 3) {
            c.e.setAttribute("opacity", "0");
            continue;
          }
          const x = c.x + c.vx * dt,
            y = D.H * 0.55 + c.vy * dt + 900 * dt * dt;
          c.e.setAttribute("opacity", String(f(1 - dt / 3)));
          c.e.setAttribute("transform", `translate(${f(x)},${f(y)}) rotate(${f(c.sp * dt)})`);
        }
        // fade in/out
        let v = 0;
        if (t > D.dur - 0.6) v = (t - (D.dur - 0.6)) / 0.6;
        stage.style.setProperty("--veil", String(f(clamp(v, 0, 1))));
        veil.style.opacity = String(f(clamp(v, 0, 1)));
      }
      const veil = document.createElement("div");
      veil.style.cssText = "position:absolute;inset:0;background:#000;pointer-events:none";
      stage.appendChild(veil);
      return { render };
    }

    return { mount, KINDS: Object.keys(KINDS) };
  })();
