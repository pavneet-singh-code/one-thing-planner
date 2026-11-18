// Original illustrations (pure SVG, no image files): an autumn lake scene for the "Now" card
// and a leafy sprig for the greeting card.

export function HeroArt() {
  return (
    <svg className="hero-art" viewBox="0 0 800 380" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="h-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe9d6" />
          <stop offset=".6" stopColor="#ffc9a6" />
          <stop offset="1" stopColor="#ffb48a" />
        </linearGradient>
        <linearGradient id="h-lake" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7cc4c0" />
          <stop offset="1" stopColor="#3f8f96" />
        </linearGradient>
        <radialGradient id="h-sun" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fffaf0" />
          <stop offset=".7" stopColor="#fff1dc" />
          <stop offset="1" stopColor="#fff1dc" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="800" height="380" fill="url(#h-sky)" />
      <circle cx="430" cy="110" r="90" fill="url(#h-sun)" />
      <circle cx="430" cy="110" r="44" fill="#fff6e6" />

      {/* clouds */}
      <g fill="#fff" opacity=".7">
        <ellipse cx="140" cy="70" rx="46" ry="12" /><ellipse cx="170" cy="62" rx="28" ry="12" />
        <ellipse cx="640" cy="52" rx="40" ry="10" /><ellipse cx="664" cy="45" rx="22" ry="10" />
      </g>

      {/* mountains, back to front */}
      <path d="M0 210 L70 150 L120 175 L200 95 L270 160 L330 130 L400 185 L470 120 L560 175 L640 110 L720 160 L800 120 V280 H0z" fill="#f7b394" />
      <path d="M0 235 L90 185 L160 215 L250 160 L330 220 L420 175 L500 220 L590 170 L690 215 L800 180 V290 H0z" fill="#f08e66" />
      <path d="M0 262 L110 228 L220 252 L330 220 L450 255 L560 228 L680 250 L800 232 V300 H0z" fill="#d9684a" />

      {/* lake */}
      <rect y="272" width="800" height="108" fill="url(#h-lake)" />
      <g stroke="#e6f6f3" strokeWidth="3" strokeLinecap="round" opacity=".6">
        <path d="M60 300h110M250 318h80M380 296h140M470 340h90M120 350h70M600 330h60" />
      </g>
      <ellipse cx="430" cy="300" rx="38" ry="5" fill="#fff6e6" opacity=".5" />

      {/* island with autumn trees (right) */}
      <path d="M520 282 Q600 252 720 262 Q780 268 800 282z" fill="#3c4a3f" />
      <g>
        <rect x="608" y="214" width="6" height="52" fill="#5a3a2c" />
        <circle cx="611" cy="206" r="30" fill="#ef6c3c" /><circle cx="590" cy="222" r="20" fill="#f5894f" /><circle cx="632" cy="220" r="22" fill="#e2552e" />
        <circle cx="612" cy="186" r="18" fill="#f9a35f" />
        <rect x="676" y="200" width="7" height="66" fill="#5a3a2c" />
        <circle cx="680" cy="190" r="36" fill="#e85a2e" /><circle cx="654" cy="208" r="22" fill="#f27a43" /><circle cx="706" cy="206" r="24" fill="#d4472a" />
        <circle cx="682" cy="164" r="20" fill="#fbb36a" />
        <path d="M740 266 L752 212 L764 266z" fill="#2f3d3a" /><path d="M758 266 L772 196 L786 266z" fill="#3c4d47" />
      </g>
      {/* reflections */}
      <g opacity=".25">
        <ellipse cx="611" cy="296" rx="34" ry="10" fill="#ef6c3c" />
        <ellipse cx="680" cy="300" rx="40" ry="11" fill="#e85a2e" />
      </g>

      {/* pines (left) */}
      <g fill="#344640">
        <path d="M24 274 L44 206 L64 274z" /><path d="M54 276 L78 186 L102 276z" /><path d="M94 274 L110 226 L126 274z" />
      </g>

      {/* birds */}
      <g stroke="#5b3a33" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity=".75">
        <path d="M250 92q7-7 14 0q7-7 14 0" /><path d="M292 72q5-5 10 0q5-5 10 0" /><path d="M520 70q6-6 12 0q6-6 12 0" />
      </g>

      {/* falling leaves */}
      <g>
        <path d="M360 200 q8 -10 16 0 q-8 10 -16 0z" fill="#f27a43" transform="rotate(-20 368 200)" />
        <path d="M560 150 q7 -9 14 0 q-7 9 -14 0z" fill="#fbb36a" transform="rotate(25 567 150)" />
        <path d="M700 120 q6 -8 12 0 q-6 8 -12 0z" fill="#e2552e" transform="rotate(-35 706 120)" />
      </g>
    </svg>
  );
}

export function Sprig() {
  return (
    <svg className="sprig" viewBox="0 0 100 100" aria-hidden="true">
      <path d="M86 94 C70 70 60 46 58 10" stroke="#8a5a44" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <g>
        <path d="M60 24 C46 18 40 6 42 2 C52 6 60 14 60 24z" fill="#f5894f" />
        <path d="M60 24 C72 16 78 6 76 2 C66 6 60 14 60 24z" fill="#ef6c3c" />
        <path d="M63 44 C48 40 40 28 41 22 C52 26 61 34 63 44z" fill="#e85a2e" />
        <path d="M64 44 C78 36 86 26 86 20 C74 24 66 32 64 44z" fill="#fbb36a" />
        <path d="M70 64 C56 62 46 52 46 44 C58 48 67 56 70 64z" fill="#f27a43" />
        <path d="M71 63 C84 56 92 46 92 40 C80 44 73 52 71 63z" fill="#7cc4a0" />
        <path d="M78 80 C66 80 58 72 57 66 C67 68 75 74 78 80z" fill="#f9a35f" />
      </g>
    </svg>
  );
}
