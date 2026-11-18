// Warm layered-landscape illustration behind the "Now" card. Pure SVG, scales to any width.
export function HeroArt() {
  return (
    <svg className="hero-art" viewBox="0 0 800 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fde3cf" />
          <stop offset="1" stopColor="#f7b08a" />
        </linearGradient>
        <linearGradient id="lake" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fbcb8" />
          <stop offset="1" stopColor="#5d8f92" />
        </linearGradient>
      </defs>
      <rect width="800" height="360" fill="url(#sky)" />
      <circle cx="560" cy="120" r="46" fill="#fff4e8" opacity=".9" />
      <path d="M0 200 L90 120 L160 170 L250 80 L340 165 L420 110 L520 190 L610 120 L700 175 L800 105 V260 H0z" fill="#f4a07a" />
      <path d="M0 230 L70 180 L150 215 L230 150 L330 220 L430 160 L520 215 L620 165 L720 210 L800 175 V270 H0z" fill="#e9805a" />
      <path d="M0 255 L120 215 L240 245 L360 205 L500 248 L640 212 L800 240 V280 H0z" fill="#d1663f" />
      <rect y="262" width="800" height="98" fill="url(#lake)" />
      <path d="M40 285h120M260 300h90M480 290h150M620 320h110M110 330h80" stroke="#e7f1ef" strokeWidth="3" strokeLinecap="round" opacity=".55" />
      <g fill="#3f3a4d">
        <path d="M640 268 L662 196 L684 268z" /><path d="M672 270 L700 172 L728 270z" /><path d="M716 268 L738 210 L760 268z" />
        <path d="M30 268 L48 214 L66 268z" /><path d="M58 270 L80 190 L102 270z" />
        <rect x="697" y="262" width="6" height="12" />
      </g>
      <g stroke="#3f3a4d" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity=".7">
        <path d="M300 92q8-8 16 0q8-8 16 0" /><path d="M350 70q6-6 12 0q6-6 12 0" />
      </g>
    </svg>
  );
}
