// Login artwork: glossy black ribbons with chrome rims (pure SVG). Motion is CSS only – a slow sway of the ribbons,
// a reflection that travels along each ribbon and drifting light beams – and stops for reduced-motion users.

/** Ribbon centre lines and widths: broad S-curves that sweep across the panel and overlap */
const RIBBONS = [
  { d: 'M 780 20 C 470 40, 90 210, 120 480 C 150 720, 430 760, 580 960', w: 128 },
  { d: 'M -120 250 C 130 220, 330 340, 350 520 C 372 700, 240 820, 90 980', w: 96 },
  { d: 'M 780 360 C 580 350, 470 480, 486 630 C 502 770, 610 830, 720 920', w: 80 },
];

export function RibbonArt() {
  return (
    <svg className="ribbon-art" viewBox="0 0 620 860" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="ra-bg" cx="72%" cy="22%" r="95%">
          <stop offset="0" stopColor="#202328" /><stop offset=".5" stopColor="#0a0b0d" /><stop offset="1" stopColor="#030304" />
        </radialGradient>
        <linearGradient id="ra-beam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".07" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="ra-orb" cx="36%" cy="30%" r="72%">
          <stop offset="0" stopColor="#2a2d33" /><stop offset=".55" stopColor="#0b0c0e" /><stop offset="1" stopColor="#020203" />
        </radialGradient>
        <filter id="ra-shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="14" /></filter>
        <filter id="ra-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6" /></filter>
        <filter id="ra-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2" /></filter>
      </defs>

      <rect width="620" height="860" fill="url(#ra-bg)" />
      {/* diagonal light beams drifting slowly across the panel */}
      <g className="ra-beams">
        <rect x="-300" y="-160" width="260" height="1300" fill="url(#ra-beam)" transform="rotate(-32 310 430)" />
        <rect x="120" y="-160" width="150" height="1300" fill="url(#ra-beam)" opacity=".7" transform="rotate(-32 310 430)" />
      </g>
      {/* the dark sphere the ribbons wrap around, with a faint rim */}
      <circle cx="560" cy="560" r="250" fill="url(#ra-orb)" />
      <circle cx="560" cy="560" r="250" fill="none" stroke="#fff" strokeOpacity=".07" strokeWidth="1.5" />

      <g className="ra-ribbons">
        {RIBBONS.map(({ d, w }, i) => (
          <g key={i} className={`ra-ribbon r${i}`}>
            {/* cast shadow, then the tube: dark edges shading to a lighter core = a rounded, glossy surface */}
            <path d={d} fill="none" stroke="#000" strokeOpacity=".85" strokeWidth={w * 1.15} strokeLinecap="round" filter="url(#ra-shadow)" transform="translate(14 22)" />
            <path d={d} fill="none" stroke="#010102" strokeWidth={w} strokeLinecap="round" />
            <path d={d} fill="none" stroke="#0c0d10" strokeWidth={w * .82} strokeLinecap="round" />
            <path d={d} fill="none" stroke="#17191d" strokeWidth={w * .58} strokeLinecap="round" filter="url(#ra-soft)" />
            <path d={d} fill="none" stroke="#2a2d33" strokeWidth={w * .3} strokeLinecap="round" filter="url(#ra-soft)" transform={`translate(${-w * .14} ${-w * .06})`} />
            {/* chrome: a bright specular line on the lit side, a dim rim on the shadow side */}
            <path d={d} fill="none" stroke="#e9edf3" strokeOpacity=".7" strokeWidth="2.4" filter="url(#ra-glow)" transform={`translate(${-w * .3} ${-w * .1})`} />
            <path d={d} fill="none" stroke="#c4c9d1" strokeOpacity=".28" strokeWidth="1.4" transform={`translate(${w * .4} ${w * .12})`} />
            {/* a reflection that slides along the ribbon */}
            <path className="ra-sheen" d={d} fill="none" stroke="#ffffff" strokeOpacity=".75" strokeWidth={w * .07} strokeLinecap="round"
              pathLength="1000" strokeDasharray="70 930" filter="url(#ra-glow)" transform={`translate(${-w * .22} ${-w * .08})`} />
          </g>
        ))}
      </g>
      {/* soft vignette */}
      <rect width="620" height="860" fill="none" stroke="#000" strokeOpacity=".5" strokeWidth="120" filter="url(#ra-soft)" />
    </svg>
  );
}
