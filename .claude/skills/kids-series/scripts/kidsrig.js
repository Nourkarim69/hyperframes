/* KidsRig — vector puppet + storybook world renderer for HyperFrames scenes.
 * Everything drawn is a pure function of the scene's local time t (seconds),
 * so any frame can be seeked in any order and every render is identical.
 *
 * Usage inside a scene composition (build_episode.py writes this for you):
 *   const rig = KidsRig.mount(stageEl, DATA);
 *   const clock = { t: 0 };
 *   tl.to(clock, { t: D, duration: D, ease: "none", onUpdate: () => rig.render(clock.t) }, 0);
 *   rig.render(0);
 */
window.KidsRig =
  window.KidsRig ||
  (function () {
    const NS = "http://www.w3.org/2000/svg";
    const GROUND = 860;

    // ---------- helpers ----------
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, u) => a + (b - a) * u;
    const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
    const easeOut = (u) => 1 - Math.pow(1 - u, 3);
    function mulberry32(a) {
      return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    function hash(str) {
      let h = 2166136261;
      for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
      return h >>> 0;
    }
    const f = (n) => Math.round(n * 100) / 100;

    // ---------- emotions ----------
    // smile -1..1, browY px (neg = up), browIn (pos = inner end raised = worried),
    // eye scale, squint 0..1, ear droop 0..1, blush 0..1, round (O mouth) 0..1, open (base mouth open)
    const EMO = {
      neutral: {
        smile: 0.35,
        browY: 0,
        browIn: 0,
        eye: 1,
        squint: 0,
        ear: 0,
        blush: 0.35,
        round: 0,
        open: 0,
      },
      happy: {
        smile: 1,
        browY: -5,
        browIn: 0,
        eye: 1,
        squint: 0.4,
        ear: 0,
        blush: 0.7,
        round: 0,
        open: 0.15,
      },
      excited: {
        smile: 1,
        browY: -10,
        browIn: -2,
        eye: 1.12,
        squint: 0,
        ear: -0.2,
        blush: 0.9,
        round: 0,
        open: 0.35,
      },
      sad: {
        smile: -0.85,
        browY: 3,
        browIn: 11,
        eye: 0.95,
        squint: 0.15,
        ear: 1,
        blush: 0.15,
        round: 0,
        open: 0,
      },
      scared: {
        smile: -0.5,
        browY: -9,
        browIn: 9,
        eye: 1.22,
        squint: 0,
        ear: 0.75,
        blush: 0.1,
        round: 0.7,
        open: 0.25,
      },
      surprised: {
        smile: 0,
        browY: -14,
        browIn: 0,
        eye: 1.28,
        squint: 0,
        ear: -0.3,
        blush: 0.4,
        round: 1,
        open: 0.45,
      },
      thinking: {
        smile: 0.1,
        browY: -4,
        browIn: -5,
        eye: 1,
        squint: 0.1,
        ear: 0.1,
        blush: 0.3,
        round: 0.3,
        open: 0,
      },
      sleepy: {
        smile: 0.25,
        browY: 4,
        browIn: 2,
        eye: 0.95,
        squint: 0.7,
        ear: 0.4,
        blush: 0.4,
        round: 0,
        open: 0,
      },
      determined: {
        smile: 0.55,
        browY: 3,
        browIn: -9,
        eye: 1.05,
        squint: 0.15,
        ear: -0.2,
        blush: 0.4,
        round: 0,
        open: 0,
      },
      proud: {
        smile: 1,
        browY: -4,
        browIn: -2,
        eye: 1,
        squint: 0.55,
        ear: -0.1,
        blush: 0.8,
        round: 0,
        open: 0.05,
      },
      worried: {
        smile: -0.35,
        browY: -2,
        browIn: 9,
        eye: 1.05,
        squint: 0,
        ear: 0.5,
        blush: 0.2,
        round: 0.2,
        open: 0,
      },
    };
    const EMO_KEYS = Object.keys(EMO.neutral);

    // ---------- character art (local coords: feet at 0,0, up is negative y) ----------
    // Each species returns layered SVG strings; the rig only touches the named groups.
    const P = {
      fox: {
        fur: "#F28A2E",
        furDark: "#D9661A",
        cream: "#FFF3E0",
        dark: "#3B2416",
        inner: "#F7B6A0",
        accent: "#4FB3BF",
      },
      hedgehog: {
        fur: "#8A5A3C",
        furDark: "#6B4128",
        cream: "#F6DDBF",
        dark: "#3A2418",
        inner: "#F2A9A0",
        accent: "#E85D8C",
      },
      owl: {
        fur: "#8C6A4F",
        furDark: "#6E5038",
        cream: "#EAD8BC",
        dark: "#2E2118",
        inner: "#F0C27B",
        accent: "#7FA7D9",
      },
      rabbit: {
        fur: "#E9E4F2",
        furDark: "#C9C0DA",
        cream: "#FFFFFF",
        dark: "#3B3346",
        inner: "#F6B8C8",
        accent: "#9B7FD4",
      },
      bear: {
        fur: "#A0703F",
        furDark: "#7E5530",
        cream: "#E8C9A0",
        dark: "#33220F",
        inner: "#E8A390",
        accent: "#5BAA6A",
      },
      star: {
        fur: "#FFD84A",
        furDark: "#F4B400",
        cream: "#FFF6C2",
        dark: "#5A3B00",
        inner: "#FF9EB0",
        accent: "#FFFFFF",
      },
    };

    function eyesSVG(c, ey, gap) {
      const eye = (x, cls) =>
        `<g class="${cls}" transform="translate(${x},${ey})"><g class="eyeS">` +
        `<ellipse class="eyeBall" cx="0" cy="0" rx="17" ry="22" fill="${c.dark}"/>` +
        `<g class="glint"><circle cx="5" cy="-8" r="7" fill="#fff"/><circle cx="-6" cy="7" r="3.2" fill="#fff" opacity=".85"/></g>` +
        `</g></g>`;
      return eye(-gap, "eyeL") + eye(gap, "eyeR");
    }
    function browsSVG(c) {
      return (
        `<path class="browL" fill="none" stroke="${c.dark}" stroke-width="6" stroke-linecap="round"/>` +
        `<path class="browR" fill="none" stroke="${c.dark}" stroke-width="6" stroke-linecap="round"/>`
      );
    }
    function mouthSVG(c) {
      return (
        `<path class="mouth" fill="#5B1E1E" stroke="${c.dark}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>` +
        `<ellipse class="tongue" cx="0" cy="0" rx="10" ry="6" fill="#F47C8A"/>`
      );
    }
    function cheeksSVG(gap, y) {
      return (
        `<g class="blush"><ellipse cx="${-gap}" cy="${y}" rx="17" ry="10" fill="#FF8FA3"/>` +
        `<ellipse cx="${gap}" cy="${y}" rx="17" ry="10" fill="#FF8FA3"/></g>`
      );
    }
    const arm = (cls, x, y, len, w, fill, stroke, paw) =>
      `<g class="${cls}" data-px="${x}" data-py="${y}"><path d="M ${x - w / 2} ${y} L ${x - w / 2 + 2} ${y + len} Q ${x} ${y + len + w * 0.8} ${x + w / 2 - 2} ${y + len} L ${x + w / 2} ${y} Z" fill="${fill}" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/>` +
      (paw
        ? `<ellipse cx="${x}" cy="${y + len + 2}" rx="${w / 2 + 1}" ry="${w / 2 - 2}" fill="${paw}"/>`
        : "") +
      `</g>`;
    const leg = (cls, x, fill, stroke) =>
      `<g class="${cls}"><ellipse cx="${x}" cy="-12" rx="24" ry="15" fill="${fill}" stroke="${stroke}" stroke-width="4"/></g>`;

    // Faces share one layout: eyes at (±gap, ey), mouth at (0, my); head pivot at neck.
    const SPECIES = {
      fox(c) {
        return {
          neck: -150,
          face: { ey: -258, gap: 40, my: -205, mw: 20, browY: -292, cheekY: -222 },
          back:
            `<g class="tail" data-px="-50" data-py="-70"><path d="M -40 -60 C -150 -40 -200 -150 -150 -230 C -130 -180 -90 -150 -45 -120 Z" fill="${c.fur}" stroke="${c.dark}" stroke-width="5" stroke-linejoin="round"/>` +
            `<path d="M -150 -230 C -175 -190 -168 -160 -140 -150 C -150 -175 -152 -205 -150 -230 Z" fill="${c.cream}" stroke="${c.dark}" stroke-width="4" stroke-linejoin="round"/></g>`,
          legs: leg("legL", -32, c.furDark, c.dark) + leg("legR", 32, c.furDark, c.dark),
          armBack: arm("armB", -52, -125, 62, 30, c.fur, c.dark, c.furDark),
          body:
            `<ellipse cx="0" cy="-90" rx="72" ry="78" fill="${c.fur}" stroke="${c.dark}" stroke-width="5"/>` +
            `<ellipse cx="0" cy="-78" rx="44" ry="55" fill="${c.cream}"/>` +
            `<path d="M -30 -150 Q 0 -128 30 -150 L 18 -132 Q 0 -122 -18 -132 Z" fill="${c.accent}" stroke="${c.dark}" stroke-width="4" stroke-linejoin="round"/>`,
          armFront: arm("armF", 52, -125, 62, 30, c.fur, c.dark, c.furDark),
          ears:
            `<g class="earL" data-px="-70" data-py="-318"><path d="M -100 -300 L -98 -400 L -30 -335 Z" fill="${c.fur}" stroke="${c.dark}" stroke-width="5" stroke-linejoin="round"/><path d="M -88 -318 L -90 -380 L -50 -338 Z" fill="${c.inner}"/><path d="M -98 -400 L -99 -372 L -84 -385 Z" fill="${c.dark}"/></g>` +
            `<g class="earR" data-px="70" data-py="-318"><path d="M 100 -300 L 98 -400 L 30 -335 Z" fill="${c.fur}" stroke="${c.dark}" stroke-width="5" stroke-linejoin="round"/><path d="M 88 -318 L 90 -380 L 50 -338 Z" fill="${c.inner}"/><path d="M 98 -400 L 99 -372 L 84 -385 Z" fill="${c.dark}"/></g>`,
          head:
            `<path d="M -120 -250 C -125 -320 -60 -345 0 -345 C 60 -345 125 -320 120 -250 C 116 -200 70 -168 0 -168 C -70 -168 -116 -200 -120 -250 Z" fill="${c.fur}" stroke="${c.dark}" stroke-width="5"/>` +
            `<path d="M -118 -240 C -100 -195 -55 -175 0 -178 C 55 -175 100 -195 118 -240 C 90 -215 50 -228 0 -226 C -50 -228 -90 -215 -118 -240 Z" fill="${c.cream}"/>` +
            `<ellipse class="nose" cx="0" cy="-228" rx="13" ry="9" fill="${c.dark}"/>`,
          extra: "",
        };
      },
      hedgehog(c) {
        let spikes = "";
        for (let i = 0; i < 13; i++) {
          const a = (-200 + i * 18) * (Math.PI / 180);
          const r1 = 118,
            r2 = 168;
          const cx = 0,
            cy = -210;
          const x1 = cx + Math.cos(a - 0.12) * r1,
            y1 = cy + Math.sin(a - 0.12) * r1;
          const x2 = cx + Math.cos(a) * r2,
            y2 = cy + Math.sin(a) * r2;
          const x3 = cx + Math.cos(a + 0.12) * r1,
            y3 = cy + Math.sin(a + 0.12) * r1;
          spikes += `<path d="M ${f(x1)} ${f(y1)} L ${f(x2)} ${f(y2)} L ${f(x3)} ${f(y3)} Z" fill="${c.furDark}" stroke="${c.dark}" stroke-width="4" stroke-linejoin="round"/>`;
        }
        return {
          neck: -140,
          face: { ey: -232, gap: 38, my: -185, mw: 18, browY: -266, cheekY: -200 },
          back: `<g class="tail" data-px="0" data-py="-100"><path d="M -60 -40 L -110 -70 L -70 -90 L -120 -120 L -72 -130 Z" fill="${c.furDark}" stroke="${c.dark}" stroke-width="4" stroke-linejoin="round"/></g>`,
          legs: leg("legL", -30, c.dark, c.dark) + leg("legR", 30, c.dark, c.dark),
          armBack: arm("armB", -50, -115, 55, 26, c.fur, c.dark, c.cream),
          body:
            `<ellipse cx="0" cy="-85" rx="70" ry="72" fill="${c.fur}" stroke="${c.dark}" stroke-width="5"/>` +
            `<ellipse cx="0" cy="-75" rx="46" ry="52" fill="${c.cream}"/>`,
          armFront: arm("armF", 50, -115, 55, 26, c.fur, c.dark, c.cream),
          ears:
            `<g class="earL" data-px="-75" data-py="-290"><circle cx="-80" cy="-292" r="22" fill="${c.cream}" stroke="${c.dark}" stroke-width="4"/><circle cx="-80" cy="-292" r="11" fill="${c.inner}"/></g>` +
            `<g class="earR" data-px="75" data-py="-290"><circle cx="80" cy="-292" r="22" fill="${c.cream}" stroke="${c.dark}" stroke-width="4"/><circle cx="80" cy="-292" r="11" fill="${c.inner}"/></g>`,
          head:
            spikes +
            `<ellipse cx="0" cy="-222" rx="106" ry="92" fill="${c.cream}" stroke="${c.dark}" stroke-width="5"/>` +
            `<path d="M -100 -250 C -80 -330 80 -330 100 -250 C 70 -285 30 -262 0 -292 C -30 -262 -70 -285 -100 -250 Z" fill="${c.fur}" stroke="${c.dark}" stroke-width="4" stroke-linejoin="round"/>` +
            `<ellipse class="nose" cx="0" cy="-205" rx="12" ry="9" fill="${c.dark}"/>` +
            `<g transform="translate(62,-300) rotate(20)"><path d="M 0 0 L -26 -16 L -26 16 Z M 0 0 L 26 -16 L 26 16 Z" fill="${c.accent}" stroke="${c.dark}" stroke-width="3" stroke-linejoin="round"/><circle r="7" fill="${c.accent}" stroke="${c.dark}" stroke-width="3"/></g>`,
          extra: "",
        };
      },
      owl(c) {
        return {
          neck: -170,
          face: { ey: -262, gap: 46, my: -212, mw: 16, browY: -305, cheekY: -228, beak: true },
          back: `<g class="tail" data-px="0" data-py="-30"><path d="M -30 -30 L 0 10 L 30 -30 Z" fill="${c.furDark}" stroke="${c.dark}" stroke-width="4" stroke-linejoin="round"/></g>`,
          legs: `<g class="legL"><path d="M -40 -8 l -14 8 m 14 -8 l 0 10 m 0 -10 l 14 8" stroke="#E0A040" stroke-width="7" stroke-linecap="round"/></g><g class="legR"><path d="M 40 -8 l -14 8 m 14 -8 l 0 10 m 0 -10 l 14 8" stroke="#E0A040" stroke-width="7" stroke-linecap="round"/></g>`,
          armBack: `<g class="armB" data-px="-78" data-py="-150"><path d="M -78 -150 C -118 -120 -120 -60 -88 -30 C -82 -70 -72 -110 -70 -150 Z" fill="${c.furDark}" stroke="${c.dark}" stroke-width="5" stroke-linejoin="round"/></g>`,
          body:
            `<ellipse cx="0" cy="-105" rx="88" ry="100" fill="${c.fur}" stroke="${c.dark}" stroke-width="5"/>` +
            `<ellipse cx="0" cy="-88" rx="58" ry="70" fill="${c.cream}"/>` +
            `<path d="M -30 -110 q 10 10 20 0 q 10 10 20 0 q 10 10 20 0 M -30 -80 q 10 10 20 0 q 10 10 20 0 q 10 10 20 0 M -20 -50 q 10 10 20 0 q 10 10 20 0" fill="none" stroke="${c.furDark}" stroke-width="4" stroke-linecap="round"/>`,
          armFront: `<g class="armF" data-px="78" data-py="-150"><path d="M 78 -150 C 118 -120 120 -60 88 -30 C 82 -70 72 -110 70 -150 Z" fill="${c.furDark}" stroke="${c.dark}" stroke-width="5" stroke-linejoin="round"/></g>`,
          ears:
            `<g class="earL" data-px="-80" data-py="-320"><path d="M -105 -305 L -112 -375 L -55 -330 Z" fill="${c.furDark}" stroke="${c.dark}" stroke-width="5" stroke-linejoin="round"/></g>` +
            `<g class="earR" data-px="80" data-py="-320"><path d="M 105 -305 L 112 -375 L 55 -330 Z" fill="${c.furDark}" stroke="${c.dark}" stroke-width="5" stroke-linejoin="round"/></g>`,
          head:
            `<ellipse cx="0" cy="-255" rx="118" ry="95" fill="${c.fur}" stroke="${c.dark}" stroke-width="5"/>` +
            `<circle cx="-46" cy="-262" r="40" fill="${c.cream}"/><circle cx="46" cy="-262" r="40" fill="${c.cream}"/>`,
          extra: `<g class="specs"><circle cx="-46" cy="-262" r="38" fill="none" stroke="#B88A2E" stroke-width="5"/><circle cx="46" cy="-262" r="38" fill="none" stroke="#B88A2E" stroke-width="5"/><path d="M -8 -265 Q 0 -272 8 -265" fill="none" stroke="#B88A2E" stroke-width="5"/></g>`,
        };
      },
      rabbit(c) {
        const base = SPECIES.fox(c);
        base.back = `<g class="tail" data-px="-60" data-py="-60"><circle cx="-70" cy="-60" r="26" fill="${c.cream}" stroke="${c.dark}" stroke-width="4"/></g>`;
        base.ears =
          `<g class="earL" data-px="-45" data-py="-330"><path d="M -60 -330 C -95 -420 -80 -500 -50 -500 C -20 -500 -15 -420 -30 -330 Z" fill="${c.fur}" stroke="${c.dark}" stroke-width="5"/><path d="M -52 -345 C -72 -420 -62 -480 -48 -480 C -34 -480 -32 -420 -38 -345 Z" fill="${c.inner}"/></g>` +
          `<g class="earR" data-px="45" data-py="-330"><path d="M 60 -330 C 95 -420 80 -500 50 -500 C 20 -500 15 -420 30 -330 Z" fill="${c.fur}" stroke="${c.dark}" stroke-width="5"/><path d="M 52 -345 C 72 -420 62 -480 48 -480 C 34 -480 32 -420 38 -345 Z" fill="${c.inner}"/></g>`;
        base.body = base.body.replace(c.accent, c.accent);
        return base;
      },
      bear(c) {
        const base = SPECIES.fox(c);
        base.back = `<g class="tail" data-px="-60" data-py="-60"><circle cx="-66" cy="-55" r="18" fill="${c.furDark}" stroke="${c.dark}" stroke-width="4"/></g>`;
        base.ears =
          `<g class="earL" data-px="-85" data-py="-320"><circle cx="-88" cy="-322" r="34" fill="${c.fur}" stroke="${c.dark}" stroke-width="5"/><circle cx="-88" cy="-322" r="18" fill="${c.inner}"/></g>` +
          `<g class="earR" data-px="85" data-py="-320"><circle cx="88" cy="-322" r="34" fill="${c.fur}" stroke="${c.dark}" stroke-width="5"/><circle cx="88" cy="-322" r="18" fill="${c.inner}"/></g>`;
        return base;
      },
      star(c) {
        const pts = [];
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const r = i % 2 ? 62 : 128;
          pts.push(`${f(Math.cos(a) * r)},${f(-150 + Math.sin(a) * r)}`);
        }
        return {
          neck: -150,
          face: { ey: -160, gap: 30, my: -120, mw: 14, browY: -192, cheekY: -132, small: true },
          back:
            `<g class="glow"><circle cx="0" cy="-150" r="230" fill="url(#kr-glow)"/></g>` +
            `<g class="tail" data-px="0" data-py="-150"></g>`,
          legs: `<g class="legL"></g><g class="legR"></g>`,
          armBack: `<g class="armB" data-px="0" data-py="-150"></g>`,
          body: "",
          armFront: `<g class="armF" data-px="0" data-py="-150"></g>`,
          ears: `<g class="earL" data-px="0" data-py="0"></g><g class="earR" data-px="0" data-py="0"></g>`,
          head:
            `<polygon points="${pts.join(" ")}" fill="${c.fur}" stroke="${c.furDark}" stroke-width="16" stroke-linejoin="round"/>` +
            `<polygon points="${pts.join(" ")}" fill="none" stroke="#FFF6C2" stroke-width="5" stroke-linejoin="round" opacity=".7" transform="translate(0,-150) scale(.82) translate(0,150)"/>`,
          extra: "",
        };
      },
    };

    function buildCharacter(id, spec) {
      const c = Object.assign({}, P[spec.species] || P.fox, spec.palette || {});
      const s = SPECIES[spec.species](c);
      const F = s.face;
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", "kr-char");
      g.innerHTML =
        `<ellipse class="shadow" cx="0" cy="4" rx="95" ry="16" fill="#000" opacity=".22"/>` +
        `<g class="rig">` +
        s.back +
        s.legs +
        s.armBack +
        `<g class="body">${s.body}</g>` +
        `<g class="head" data-px="0" data-py="${s.neck}">` +
        s.ears +
        s.head +
        cheeksSVG(F.gap + 28, F.cheekY) +
        eyesSVG(c, F.ey, F.gap) +
        browsSVG(c) +
        (F.beak
          ? `<g class="beak"><path d="M -18 -230 L 18 -230 L 0 -200 Z" fill="#E8A33D" stroke="${c.dark}" stroke-width="4" stroke-linejoin="round"/>` +
            `<path class="beakLow" d="M -13 -218 L 13 -218 L 0 -198 Z" fill="#C9822A" stroke="${c.dark}" stroke-width="4" stroke-linejoin="round"/></g>`
          : mouthSVG(c)) +
        s.extra +
        `</g>` +
        s.armFront +
        `</g>`;
      const q = (sel) => g.querySelector(sel);
      const piv = (el) => (el ? [Number(el.dataset.px || 0), Number(el.dataset.py || 0)] : [0, 0]);
      const parts = {
        root: g,
        rig: q(".rig"),
        head: q(".head"),
        earL: q(".earL"),
        earR: q(".earR"),
        armF: q(".armF"),
        armB: q(".armB"),
        tail: q(".tail"),
        legL: q(".legL"),
        legR: q(".legR"),
        eyeL: q(".eyeL .eyeS"),
        eyeR: q(".eyeR .eyeS"),
        browL: q(".browL"),
        browR: q(".browR"),
        mouth: q(".mouth"),
        tongue: q(".tongue"),
        beakLow: q(".beakLow"),
        blush: q(".blush"),
        glow: q(".glow"),
        shadow: q(".shadow"),
      };
      parts.piv = {
        head: piv(parts.head),
        earL: piv(parts.earL),
        earR: piv(parts.earR),
        armF: piv(parts.armF),
        armB: piv(parts.armB),
        tail: piv(parts.tail),
      };
      return { id, spec, F, parts, seed: hash(id) };
    }

    // ---------- keyed tracks ----------
    function posAt(track, t) {
      // track: { x, y, moves: [[t0, x, y, dur, kind]] } -> {x, y, walk, moving}
      // Each move starts from wherever the previous one had got to at its start time.
      let x = track.x,
        y = track.y,
        walk = 0,
        moving = false;
      const ms = track.moves || [];
      for (let i = 0; i < ms.length; i++) {
        const [t0, tx, ty, dur] = ms[i];
        if (t < t0) break;
        const tEnd = i + 1 < ms.length && ms[i + 1][0] <= t ? ms[i + 1][0] : t;
        const u = dur > 0 ? clamp((tEnd - t0) / dur, 0, 1) : 1;
        const e = ease(u);
        const nx = lerp(x, tx, e),
          ny = lerp(y, ty, e);
        walk += Math.abs(nx - x) + Math.abs(ny - y);
        if (tEnd === t && u > 0 && u < 1 && ms[i][4] !== "float") moving = true;
        x = nx;
        y = ny;
      }
      return { x, y, walk, moving };
    }
    function stepAt(keys, t, def) {
      let v = def;
      for (const k of keys || []) {
        if (k[0] <= t) v = k[1];
        else break;
      }
      return v;
    }
    function faceAt(keys, t, def) {
      let prev = def,
        cur = def,
        tk = -99;
      for (const k of keys || []) {
        if (k[0] <= t) {
          prev = cur;
          cur = k[1];
          tk = k[0];
        } else break;
      }
      const u = clamp((t - tk) / 0.18, 0, 1);
      return lerp(prev, cur, ease(u));
    }
    function emoAt(keys, t) {
      let prev = EMO.neutral,
        cur = EMO.neutral,
        tk = -99;
      for (const k of keys || []) {
        if (k[0] <= t) {
          prev = cur;
          cur = EMO[k[1]] || EMO.neutral;
          tk = k[0];
        } else break;
      }
      const u = ease(clamp((t - tk) / 0.3, 0, 1));
      const out = {};
      for (const key of EMO_KEYS) out[key] = lerp(prev[key], cur[key], u);
      out.name = stepAt(keys, t, "neutral");
      return out;
    }
    function mouthAt(segs, t) {
      for (const s of segs || []) {
        const [t0, fps, digits] = s;
        const i = Math.floor((t - t0) * fps);
        if (i >= 0 && i < digits.length) {
          // smooth between frames for a softer flap
          const a = Number(digits[i]) / 9;
          const b = Number(digits[Math.min(digits.length - 1, i + 1)]) / 9;
          return lerp(a, b, (t - t0) * fps - i);
        }
      }
      return 0;
    }

    // ---------- world ----------
    const SKY = {
      day: ["#7CC7F2", "#C8ECFF", "#BFE6A0"],
      sunset: ["#5B4B9A", "#F7A072", "#F9D29D"],
      night: ["#0E1A3F", "#2B3A78", "#3F4F8F"],
      dawn: ["#6E8BD6", "#F6C6D8", "#FFE3B3"],
    };
    const LAND = {
      day: {
        far: "#8FD3A8",
        mid: "#5DB37E",
        near: "#4A9E5F",
        ground: "#7CC36A",
        trunk: "#8A5A3C",
        leaf: ["#3E9A5A", "#56B36B", "#6CC47A"],
      },
      sunset: {
        far: "#9D7DB5",
        mid: "#7D6AA8",
        near: "#5E5A92",
        ground: "#6E9A5E",
        trunk: "#6B4630",
        leaf: ["#4E7D5A", "#5F8F62", "#7A9E64"],
      },
      night: {
        far: "#2C3D78",
        mid: "#24366A",
        near: "#1C2C58",
        ground: "#2E5A4A",
        trunk: "#3A2A3A",
        leaf: ["#1F4A4A", "#265656", "#2D6260"],
      },
      dawn: {
        far: "#B9A7D9",
        mid: "#8FB59E",
        near: "#6FA383",
        ground: "#86C27A",
        trunk: "#7A5038",
        leaf: ["#4F9A6A", "#62AE73", "#7BC383"],
      },
    };

    function tree(x, base, h, L, rnd) {
      const r = h * 0.32;
      const c1 = L.leaf[Math.floor(rnd() * 3)],
        c2 = L.leaf[Math.floor(rnd() * 3)];
      return (
        `<g><path d="M ${x - 16} ${base} L ${x - 10} ${base - h * 0.55} L ${x + 10} ${base - h * 0.55} L ${x + 16} ${base} Z" fill="${L.trunk}"/>` +
        `<circle cx="${x}" cy="${base - h * 0.7}" r="${r}" fill="${c1}"/>` +
        `<circle cx="${x - r * 0.7}" cy="${base - h * 0.55}" r="${r * 0.75}" fill="${c2}"/>` +
        `<circle cx="${x + r * 0.7}" cy="${base - h * 0.58}" r="${r * 0.72}" fill="${c1}"/>` +
        `<circle cx="${x + r * 0.2}" cy="${base - h * 0.88}" r="${r * 0.6}" fill="${c2}"/></g>`
      );
    }
    function hills(y, amp, color, rnd, n) {
      let d = `M -1400 2400 L -1400 ${y}`;
      const step = 5600 / n;
      for (let i = 0; i <= n; i++) {
        const x = -1400 + i * step;
        const yy = y - amp * (0.5 + rnd() * 0.5);
        d += ` Q ${f(x + step / 2)} ${f(yy - amp * 0.4)} ${f(x + step)} ${f(y - rnd() * amp * 0.3)}`;
      }
      return `<path d="${d} L 4200 2400 Z" fill="${color}"/>`;
    }

    function buildWorld(setting) {
      const time = setting.time || "day";
      const place = setting.place || "forest";
      const sky = SKY[time],
        L = LAND[time];
      const rnd = mulberry32(hash(place + time + (setting.seed || "")));
      const layers = [];
      const mk = (depth, inner) => {
        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("class", "kr-layer");
        svg.setAttribute("viewBox", "-1400 -1400 5600 3800");
        svg.setAttribute("width", "5600");
        svg.setAttribute("height", "3800");
        svg.style.cssText = "position:absolute;left:-1400px;top:-1400px;overflow:visible";
        svg.innerHTML = inner;
        layers.push({ el: svg, depth });
        return svg;
      };
      // sky
      let skyInner =
        `<defs><linearGradient id="kr-sky-${place}${time}" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="${sky[0]}"/><stop offset=".55" stop-color="${sky[1]}"/><stop offset="1" stop-color="${sky[2]}"/></linearGradient></defs>` +
        `<rect x="-1400" y="-1400" width="5600" height="3800" fill="url(#kr-sky-${place}${time})"/>`;
      const twinkles = [];
      if (time === "night") {
        for (let i = 0; i < 140; i++) {
          const x = -1300 + rnd() * 5400,
            y = -1300 + rnd() * 1900,
            r = 1.5 + rnd() * 3.2;
          skyInner += `<circle class="tw" cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="#FFF8D6"/>`;
          twinkles.push(rnd() * 6.28);
        }
        skyInner += `<g><circle cx="1540" cy="170" r="120" fill="#FFF4C4" opacity=".12"/><circle cx="1540" cy="170" r="92" fill="#FFF4C4" opacity=".2"/><circle cx="1540" cy="170" r="70" fill="#FFF4C4"/><circle cx="1518" cy="152" r="14" fill="#EFE0A8"/><circle cx="1560" cy="190" r="10" fill="#EFE0A8"/><circle cx="1565" cy="145" r="6" fill="#EFE0A8"/></g>`;
      } else if (time === "day" || time === "dawn") {
        skyInner += `<circle cx="${time === "dawn" ? 400 : 1600}" cy="${time === "dawn" ? 520 : 150}" r="80" fill="#FFF2A8"/>`;
      } else {
        skyInner += `<circle cx="420" cy="560" r="110" fill="#FFD27A" opacity=".9"/>`;
      }
      const sk = mk(0.08, skyInner);
      const clouds = document.createElementNS(NS, "g");
      if (time !== "night") {
        let ci = "";
        for (let i = 0; i < 9; i++) {
          const x = -1200 + rnd() * 5000,
            y = -200 + rnd() * 420,
            s = 0.6 + rnd() * 0.8;
          ci += `<g transform="translate(${f(x)},${f(y)}) scale(${f(s)})" opacity=".92"><ellipse cx="0" cy="0" rx="120" ry="44" fill="#fff"/><ellipse cx="-60" cy="-20" rx="70" ry="50" fill="#fff"/><ellipse cx="50" cy="-30" rx="80" ry="60" fill="#fff"/></g>`;
        }
        clouds.innerHTML = ci;
        sk.appendChild(clouds);
      }
      // far + mid hills
      mk(0.3, hills(640, 160, L.far, rnd, 14));
      let mid = hills(740, 120, L.mid, rnd, 18);
      for (let i = 0; i < 26; i++)
        mid += tree(
          -1300 + i * 210 + rnd() * 80,
          760,
          200 + rnd() * 90,
          { ...L, leaf: L.leaf.map(() => L.mid), trunk: L.near },
          rnd,
        );
      mk(0.55, mid);
      // near ground with place props
      let near = hills(GROUND - 20, 40, L.near, rnd, 22);
      if (place !== "hilltop") {
        for (let i = 0; i < 16; i++) {
          const x = -1300 + i * 360 + rnd() * 120;
          if (x > 300 && x < 1650) continue; // keep the acting area open
          near += tree(x, GROUND, 360 + rnd() * 160, L, rnd);
        }
      }
      near += `<rect x="-1400" y="${GROUND}" width="5600" height="1600" fill="${L.ground}"/>`;
      near += `<path d="M -1400 ${GROUND} Q 960 ${GROUND - 30} 4200 ${GROUND}" fill="${L.ground}"/>`;
      if (place === "burrow") {
        near +=
          `<g transform="translate(1660,${GROUND})"><path d="M -260 0 Q -250 -330 0 -340 Q 250 -330 260 0 Z" fill="${L.near}"/>` +
          `<path d="M -95 0 L -95 -120 Q 0 -215 95 -120 L 95 0 Z" fill="#8A5A3C" stroke="#4A2E1E" stroke-width="8"/>` +
          `<circle cx="60" cy="-70" r="9" fill="#F2C14E"/><circle cx="-150" cy="-200" r="38" fill="${time === "night" ? "#FFD27A" : "#BFE6FF"}" stroke="#4A2E1E" stroke-width="7"/>` +
          `<path d="M -150 -238 L -150 -162 M -188 -200 L -112 -200" stroke="#4A2E1E" stroke-width="5"/></g>`;
      }
      if (place === "owltree") {
        near +=
          `<g transform="translate(1640,${GROUND})"><path d="M -110 0 C -80 -200 -90 -500 -60 -760 L 60 -760 C 90 -500 80 -200 110 0 Z" fill="${L.trunk}" stroke="#2A1B14" stroke-width="6"/>` +
          `<ellipse cx="0" cy="-470" rx="50" ry="64" fill="#1E120C"/>` +
          `<circle cx="0" cy="-900" r="260" fill="${L.leaf[0]}"/><circle cx="-200" cy="-800" r="180" fill="${L.leaf[1]}"/><circle cx="210" cy="-790" r="190" fill="${L.leaf[2]}"/></g>`;
      }
      if (place === "hilltop") {
        // a big round hill: its crest passes through the ground line around the acting area
        near =
          `<path d="M -1400 ${GROUND + 490} Q 760 ${GROUND - 500} 2920 ${GROUND + 490} L 4200 ${GROUND + 900} L 4200 2400 L -1400 2400 Z" fill="${L.ground}"/>` +
          `<path d="M -1400 ${GROUND + 530} Q 760 ${GROUND - 450} 2920 ${GROUND + 530}" fill="none" stroke="${L.near}" stroke-width="18" opacity=".35"/>`;
        near += tree(-300, GROUND + 330, 380, L, rnd) + tree(2350, GROUND + 330, 420, L, rnd);
      }
      if (place === "pond") {
        near += `<ellipse cx="1500" cy="${GROUND + 120}" rx="420" ry="70" fill="${time === "night" ? "#2C4C8C" : "#6EC6E8"}"/><ellipse cx="1480" cy="${GROUND + 110}" rx="300" ry="30" fill="#fff" opacity=".2"/>`;
      }
      // flowers / mushrooms across the ground
      for (let i = 0; i < 40; i++) {
        const x = -1300 + rnd() * 5400,
          y = GROUND + 30 + rnd() * 500;
        if (rnd() < 0.5)
          near += `<g transform="translate(${f(x)},${f(y)})"><rect x="-4" y="-26" width="8" height="26" fill="#F3E3C8"/><path d="M -24 -24 Q 0 -60 24 -24 Z" fill="#E4573D"/><circle cx="-8" cy="-36" r="4" fill="#fff"/><circle cx="8" cy="-32" r="3" fill="#fff"/></g>`;
        else
          near += `<g transform="translate(${f(x)},${f(y)})"><circle r="8" cx="0" cy="-12" fill="${["#FFD84A", "#FF8FA3", "#B9A7FF", "#FFFFFF"][i % 4]}"/><circle r="4" cx="0" cy="-12" fill="#F4B400"/><rect x="-2" y="-6" width="4" height="10" fill="#3E7A3E"/></g>`;
      }
      mk(1, near);
      // fireflies (night) live on the near layer
      const flies = [];
      if (time === "night" || time === "sunset") {
        const fl = layers[layers.length - 1].el;
        for (let i = 0; i < 26; i++) {
          const c = document.createElementNS(NS, "circle");
          c.setAttribute("r", "6");
          c.setAttribute("fill", "#FFF59A");
          fl.appendChild(c);
          flies.push({
            el: c,
            x: -600 + rnd() * 3200,
            y: 300 + rnd() * 500,
            p: rnd() * 6.28,
            s: 0.3 + rnd() * 0.5,
          });
        }
      }
      return { layers, twinkles, clouds, flies, sky: sk };
    }

    // ---------- mount + render ----------
    function mount(stage, D) {
      stage.style.cssText = `position:absolute;inset:0;overflow:hidden;background:${(SKY[D.setting.time] || SKY.day)[0]}`;
      const cam = document.createElement("div");
      cam.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;transform-origin:0 0";
      stage.appendChild(cam);
      const world = buildWorld(D.setting);
      const layerHosts = world.layers.map((L) => {
        const h = document.createElement("div");
        h.style.cssText = "position:absolute;left:0;top:0;transform-origin:0 0";
        h.appendChild(L.el);
        stage.insertBefore(h, cam);
        return { host: h, depth: L.depth, el: L.el };
      });
      const tw = world.sky.querySelectorAll(".tw");

      // character layer
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("width", "1920");
      svg.setAttribute("height", "1080");
      svg.style.cssText = "position:absolute;left:0;top:0;overflow:visible";
      svg.innerHTML = `<defs><radialGradient id="kr-glow"><stop offset="0" stop-color="#FFF6B0" stop-opacity=".95"/><stop offset=".35" stop-color="#FFE066" stop-opacity=".45"/><stop offset="1" stop-color="#FFE066" stop-opacity="0"/></radialGradient></defs>`;
      cam.appendChild(svg);
      const chars = {};
      const order = Object.keys(D.chars).sort((a, b) => (D.chars[a].z || 0) - (D.chars[b].z || 0));
      for (const id of order) {
        const ch = buildCharacter(id, D.chars[id]);
        svg.appendChild(ch.parts.root);
        chars[id] = ch;
      }
      // particles
      const fxG = document.createElementNS(NS, "g");
      svg.appendChild(fxG);
      const sparkles = [];
      for (const fx of D.fx || []) {
        if (fx[1] !== "sparkles" && fx[1] !== "trail") continue;
        const rnd = mulberry32(hash(String(fx[0]) + fx[1]));
        const n = fx[1] === "trail" ? 40 : 22;
        for (let i = 0; i < n; i++) {
          const p = document.createElementNS(NS, "path");
          p.setAttribute("d", "M 0 -12 L 3 -3 L 12 0 L 3 3 L 0 12 L -3 3 L -12 0 L -3 -3 Z");
          p.setAttribute("fill", ["#FFF6B0", "#FFD84A", "#FFFFFF", "#FFB3C7"][i % 4]);
          fxG.appendChild(p);
          sparkles.push({
            el: p,
            fx,
            a: rnd() * 6.28,
            v: 120 + rnd() * 260,
            d: rnd() * 0.5,
            s: 0.6 + rnd() * 1.1,
            k: i / n,
          });
        }
      }
      // fade veil
      const veil = document.createElement("div");
      veil.style.cssText = "position:absolute;inset:0;background:#0A0F24;pointer-events:none";
      stage.appendChild(veil);
      const flash = document.createElement("div");
      flash.style.cssText =
        "position:absolute;inset:0;background:#FFF8D6;pointer-events:none;opacity:0";
      stage.appendChild(flash);

      const W = D.W,
        H = D.H;

      function camAt(t) {
        let v = D.cam[0].slice(1, 4);
        for (let i = 1; i < D.cam.length; i++) {
          const k = D.cam[i];
          if (k[0] > t) break;
          const tEnd = i + 1 < D.cam.length && D.cam[i + 1][0] <= t ? D.cam[i + 1][0] : t;
          const u = k[4] > 0 ? ease(clamp((tEnd - k[0]) / k[4], 0, 1)) : 1;
          v = [lerp(v[0], k[1], u), lerp(v[1], k[2], u), lerp(v[2], k[3], u)];
        }
        return v;
      }

      function renderChar(ch, t, positions) {
        const d = D.chars[ch.id];
        const P_ = ch.parts;
        const pos = positions[ch.id];
        const emo = emoAt(d.emo, t);
        const face = faceAt(d.face, t, d.face && d.face.length ? d.face[0][1] : 1);
        const talk = mouthAt(d.mouth, t);
        const sc = d.scale || 1;
        let bob = 0,
          sx = 1,
          sy = 1,
          lean = 0,
          shakeX = 0;
        let armF = 8,
          armB = -8,
          headTilt = 0,
          extraY = 0;
        const seed = ch.seed % 1000;
        // breathing / idle
        sy += Math.sin(t * 2.4 + seed) * 0.012;
        headTilt += Math.sin(t * 1.3 + seed) * 2;
        if (pos.moving) {
          const ph = pos.walk / 26;
          bob = -Math.abs(Math.sin(ph)) * 14;
          lean = 5;
          armF = 8 + Math.sin(ph) * 30;
          armB = -8 - Math.sin(ph) * 30;
          if (P_.legL)
            P_.legL.setAttribute("transform", `translate(0,${f(-Math.max(0, Math.sin(ph)) * 14)})`);
          if (P_.legR)
            P_.legR.setAttribute(
              "transform",
              `translate(0,${f(-Math.max(0, -Math.sin(ph)) * 14)})`,
            );
        } else {
          if (P_.legL) P_.legL.setAttribute("transform", "");
          if (P_.legR) P_.legR.setAttribute("transform", "");
        }
        if (emo.name === "excited") bob += -Math.abs(Math.sin(t * 9)) * 10;
        if (emo.name === "sad") {
          headTilt += 6;
          extraY += 4;
        }
        if (emo.name === "scared") shakeX += Math.sin(t * 55) * 2.5;
        if (talk > 0.05) headTilt += Math.sin(t * 7) * 2.5;
        // gestures
        for (const gk of d.gest || []) {
          const [t0, name, dur] = gk;
          if (t < t0 || t > t0 + dur) continue;
          const u = (t - t0) / dur;
          const env = Math.sin(Math.PI * clamp(u, 0, 1));
          if (name === "wave") {
            armF = lerp(armF, -150 + Math.sin(u * 30) * 22, Math.min(1, env * 3));
          } else if (name === "cheer") {
            armF = lerp(armF, -160, Math.min(1, env * 3));
            armB = lerp(armB, 160, Math.min(1, env * 3));
            bob += -Math.abs(Math.sin(u * Math.PI * 2)) * 40;
          } else if (name === "point") {
            armF = lerp(armF, -95, Math.min(1, env * 4));
          } else if (name === "think") {
            armF = lerp(armF, -140, Math.min(1, env * 4));
            headTilt += env * 8;
          } else if (name === "shrug") {
            armF = lerp(armF, -60, env);
            armB = lerp(armB, 60, env);
            headTilt += env * 6;
          } else if (name === "hug") {
            armF = lerp(armF, -80, Math.min(1, env * 3));
            armB = lerp(armB, 80, Math.min(1, env * 3));
          } else if (name === "hop" || name === "jump") {
            const h = name === "hop" ? 60 : 150;
            if (u < 0.18) {
              const k = Math.sin((u / 0.18) * Math.PI);
              sy -= 0.14 * k;
              sx += 0.1 * k;
            } else if (u < 0.85) {
              const v = (u - 0.18) / 0.67;
              bob += -h * 4 * v * (1 - v);
              sy += 0.08 * Math.sin(v * Math.PI);
              sx -= 0.05 * Math.sin(v * Math.PI);
              armF = -60;
              armB = 60;
            } else {
              const k = Math.sin(((u - 0.85) / 0.15) * Math.PI);
              sy -= 0.12 * k;
              sx += 0.08 * k;
            }
          } else if (name === "shake") {
            shakeX += Math.sin(t * 60) * 5 * env;
          } else if (name === "nod") {
            headTilt += Math.sin(u * Math.PI * 4) * 9;
          } else if (name === "headshake") {
            shakeX += Math.sin(u * Math.PI * 6) * 6 * env;
            headTilt += Math.sin(u * Math.PI * 6) * 5;
          } else if (name === "spin") {
            sx *= Math.cos(u * Math.PI * 4);
          } else if (name === "bounce") {
            bob += -Math.abs(Math.sin(u * Math.PI * 4)) * 30;
          }
        }
        if (d.species === "star") {
          bob += Math.sin(t * 2.2 + seed) * 12;
          headTilt = Math.sin(t * 1.6 + seed) * 8;
        }
        // apply root transform
        const fx = Math.abs(face) < 0.05 ? 0.05 * Math.sign(face || 1) : face;
        P_.root.setAttribute(
          "transform",
          `translate(${f(pos.x + shakeX)},${f(pos.y)}) scale(${f(sc)})`,
        );
        P_.shadow.setAttribute("transform", `scale(${f(1 + bob / 400)},1)`);
        P_.shadow.setAttribute("opacity", d.species === "star" ? "0" : String(f(0.22 + bob / 900)));
        P_.rig.setAttribute(
          "transform",
          `translate(0,${f(bob + extraY)}) scale(${f(fx * sx)},${f(sy)}) rotate(${f(lean)})`,
        );
        const [hx, hy] = P_.piv.head;
        P_.head.setAttribute("transform", `rotate(${f(headTilt)},${hx},${hy})`);
        const ear = emo.ear;
        if (P_.earL)
          P_.earL.setAttribute(
            "transform",
            `rotate(${f(-ear * 38 + Math.sin(t * 1.7 + seed) * 2)},${P_.piv.earL[0]},${P_.piv.earL[1]})`,
          );
        if (P_.earR)
          P_.earR.setAttribute(
            "transform",
            `rotate(${f(ear * 38 - Math.sin(t * 1.9 + seed) * 2)},${P_.piv.earR[0]},${P_.piv.earR[1]})`,
          );
        if (P_.armF)
          P_.armF.setAttribute(
            "transform",
            `rotate(${f(armF)},${P_.piv.armF[0]},${P_.piv.armF[1]})`,
          );
        if (P_.armB)
          P_.armB.setAttribute(
            "transform",
            `rotate(${f(armB)},${P_.piv.armB[0]},${P_.piv.armB[1]})`,
          );
        if (P_.tail)
          P_.tail.setAttribute(
            "transform",
            `rotate(${f(Math.sin(t * 2.6 + seed) * 7 + (emo.name === "excited" ? Math.sin(t * 14) * 10 : 0))},${P_.piv.tail[0]},${P_.piv.tail[1]})`,
          );
        // eyes: blink + look + squint
        const period = 3.1 + (seed % 17) / 10;
        const ph = (t + seed / 97) % period;
        let blink = ph < 0.16 ? 1 - Math.sin((ph / 0.16) * Math.PI) * 0.92 : 1;
        const lid = Math.min(blink, 1 - emo.squint * 0.62);
        let lx = 0,
          ly = 0;
        const look = stepAt(d.look, t, null);
        if (look === "up") ly = -6;
        else if (look === "down") ly = 6;
        else if (look === "left" || look === "right")
          lx = (look === "right" ? 6 : -6) * Math.sign(fx);
        else if (look && positions[look])
          lx = Math.sign(positions[look].x - pos.x) * 6 * Math.sign(fx);
        else lx = 2.5;
        const es = emo.eye;
        const eyeT = `translate(${f(lx)},${f(ly)}) scale(${f(es)},${f(es * lid)})`;
        P_.eyeL.setAttribute("transform", eyeT);
        P_.eyeR.setAttribute("transform", eyeT);
        // brows
        const F = ch.F;
        const by = F.browY + emo.browY + (emo.name === "surprised" ? -2 : 0);
        const g = F.gap;
        P_.browL.setAttribute(
          "d",
          `M ${-g - 20} ${f(by + 3)} Q ${-g} ${f(by - 6)} ${-g + 18} ${f(by - emo.browIn)}`,
        );
        P_.browR.setAttribute(
          "d",
          `M ${g + 20} ${f(by + 3)} Q ${g} ${f(by - 6)} ${g - 18} ${f(by - emo.browIn)}`,
        );
        if (P_.blush) P_.blush.setAttribute("opacity", String(f(emo.blush * 0.75)));
        // mouth
        const open = clamp(Math.max(emo.open, talk * 1.05), 0, 1);
        if (P_.mouth) {
          const w = F.mw * (1 - 0.5 * emo.round) * (1 + open * 0.15);
          const sm = emo.smile;
          const my = F.my;
          let dPath;
          if (open < 0.08) {
            dPath = `M ${f(-w)} ${f(my)} Q 0 ${f(my + sm * 14)} ${f(w)} ${f(my)}`;
            P_.mouth.setAttribute("fill", "none");
            P_.tongue.setAttribute("opacity", "0");
          } else {
            const top = my - emo.round * 8 * open + Math.max(0, -sm) * 4;
            const bot = my + 8 + open * 30 + Math.max(0, sm) * 8;
            dPath = `M ${f(-w)} ${f(my)} Q 0 ${f(top + sm * 5)} ${f(w)} ${f(my)} Q ${f(w * 0.9)} ${f(bot)} 0 ${f(bot)} Q ${f(-w * 0.9)} ${f(bot)} ${f(-w)} ${f(my)} Z`;
            P_.mouth.setAttribute("fill", "#5B1E1E");
            P_.tongue.setAttribute("opacity", open > 0.3 ? "1" : "0");
            P_.tongue.setAttribute(
              "transform",
              `translate(0,${f(bot - 7)}) scale(${f(w / 22)},${f(open)})`,
            );
          }
          P_.mouth.setAttribute("d", dPath);
        }
        if (P_.beakLow) P_.beakLow.setAttribute("transform", `translate(0,${f(open * 12)})`);
        if (P_.glow) {
          const gl = d.glow ? faceAt(d.glow, t, d.glow[0] ? d.glow[0][1] : 1) : 1;
          P_.glow.setAttribute(
            "opacity",
            String(f(clamp(gl * (0.85 + Math.sin(t * 3) * 0.15), 0, 1.4))),
          );
          P_.glow.setAttribute(
            "transform",
            `translate(0,-150) scale(${f(0.7 + gl * 0.5)}) translate(0,150)`,
          );
        }
      }

      function render(t) {
        const [cx, cy, z] = camAt(t);
        // layers with parallax around the world centre
        for (const L of layerHosts) {
          const dz = 1 + (z - 1) * L.depth;
          const ox = W / 2 - (960 + (cx - 960) * L.depth) * dz;
          const oy = H / 2 - (540 + (cy - 540) * L.depth) * dz;
          L.host.style.transform = `translate(${f(ox)}px,${f(oy)}px) scale(${f(dz)})`;
        }
        cam.style.transform = `translate(${f(W / 2 - cx * z)}px,${f(H / 2 - cy * z)}px) scale(${f(z)})`;
        tw.forEach((s, i) =>
          s.setAttribute("opacity", String(f(0.55 + 0.45 * Math.sin(t * 2.2 + world.twinkles[i])))),
        );
        if (world.clouds) world.clouds.setAttribute("transform", `translate(${f(t * 9)},0)`);
        for (const fl of world.flies) {
          fl.el.setAttribute("cx", String(f(fl.x + Math.sin(t * fl.s + fl.p) * 70)));
          fl.el.setAttribute("cy", String(f(fl.y + Math.cos(t * fl.s * 1.3 + fl.p) * 40)));
          fl.el.setAttribute(
            "opacity",
            String(f(0.35 + 0.65 * Math.abs(Math.sin(t * 1.4 + fl.p)))),
          );
        }
        const positions = {};
        for (const id in chars) positions[id] = posAt(D.chars[id], t);
        for (const id in chars) renderChar(chars[id], t, positions);
        // particles
        for (const s of sparkles) {
          const [t0, kind, a, b, dur] = s.fx;
          let x, y, op, sc;
          if (kind === "trail") {
            // a, b = character id to trail, unused
            const p = positions[a];
            const tt = t - t0 - s.k * dur;
            const life = 1.1;
            const u = tt / life;
            if (!p || tt < 0 || u > 1) {
              s.el.setAttribute("opacity", "0");
              continue;
            }
            const born = posAt(D.chars[a], t0 + s.k * dur);
            x = born.x + Math.cos(s.a) * 40 * u;
            y = born.y - 150 + u * 60;
            op = 1 - u;
            sc = s.s * (1 - u * 0.5);
          } else {
            const u = (t - t0 - s.d * 0.3) / dur;
            if (u < 0 || u > 1) {
              s.el.setAttribute("opacity", "0");
              continue;
            }
            const e = easeOut(u);
            x = a + Math.cos(s.a) * s.v * e;
            y = b + Math.sin(s.a) * s.v * e + u * u * 60;
            op = u < 0.2 ? u / 0.2 : 1 - (u - 0.2) / 0.8;
            sc = s.s * (1 - u * 0.4);
          }
          s.el.setAttribute("opacity", String(f(op)));
          s.el.setAttribute(
            "transform",
            `translate(${f(x)},${f(y)}) rotate(${f(t * 180 + s.a * 50)}) scale(${f(sc)})`,
          );
        }
        let fl = 0;
        for (const fx of D.fx || [])
          if (fx[1] === "flash" && t >= fx[0] && t < fx[0] + 0.6)
            fl = Math.max(fl, 1 - (t - fx[0]) / 0.6);
        flash.style.opacity = String(f(fl * 0.8));
        // fades
        let v = 0;
        if (D.fadeIn) v = Math.max(v, 1 - clamp(t / D.fadeIn, 0, 1));
        if (D.fadeOut) v = Math.max(v, clamp((t - (D.dur - D.fadeOut)) / D.fadeOut, 0, 1));
        veil.style.opacity = String(f(v));
      }
      return { render };
    }

    return { mount, EMO, GROUND };
  })();
