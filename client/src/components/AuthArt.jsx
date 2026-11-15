import React from 'react';

const PURPLE = '#7c3aed';
const VIOLET = '#a78bfa';
const PINK = '#ec4899';
const YELLOW = '#fbbf24';
const TEAL = '#14b8a6';
const ORANGE = '#fb923c';
const BLUE = '#38bdf8';

// Each piece is drawn in a 100 x 100 box.
const Note = ({ c }) => (
  <g fill={c}>
    <ellipse cx="38" cy="78" rx="19" ry="14" transform="rotate(-22 38 78)" />
    <rect x="52" y="12" width="7" height="68" rx="3" />
    <path d="M59 12c5 18 30 22 25 52-4-18-15-25-25-28Z" />
  </g>
);
const Beamed = ({ c }) => (
  <g fill={c}>
    <ellipse cx="24" cy="80" rx="16" ry="12" transform="rotate(-22 24 80)" />
    <ellipse cx="72" cy="68" rx="16" ry="12" transform="rotate(-22 72 68)" />
    <rect x="35" y="22" width="6" height="60" rx="3" />
    <rect x="83" y="10" width="6" height="60" rx="3" />
    <path d="M35 22 89 8v16L35 38Z" />
  </g>
);
const Mic = ({ c }) => (
  <g>
    <rect x="35" y="8" width="30" height="50" rx="15" fill={c} />
    <path d="M39 26h22M39 36h22" stroke="#fff" strokeWidth="3" opacity="0.5" />
    <path d="M26 46c0 15 10 25 24 25s24-10 24-25" fill="none" stroke="#3b2a6b" strokeWidth="6" strokeLinecap="round" />
    <rect x="47" y="71" width="6" height="16" fill="#3b2a6b" />
    <rect x="32" y="86" width="36" height="7" rx="3.5" fill="#3b2a6b" />
  </g>
);
const Headphones = ({ c }) => (
  <g>
    <path d="M16 62V50a34 34 0 0 1 68 0v12" fill="none" stroke="#3b2a6b" strokeWidth="7" strokeLinecap="round" />
    <rect x="8" y="54" width="22" height="34" rx="10" fill={c} />
    <rect x="70" y="54" width="22" height="34" rx="10" fill={c} />
  </g>
);
const Vinyl = ({ c }) => (
  <g>
    <circle cx="50" cy="50" r="42" fill="#2b1d52" />
    <circle cx="50" cy="50" r="30" fill="none" stroke="#fff" strokeOpacity="0.18" strokeWidth="2" />
    <circle cx="50" cy="50" r="22" fill="none" stroke="#fff" strokeOpacity="0.18" strokeWidth="2" />
    <circle cx="50" cy="50" r="15" fill={c} />
    <circle cx="50" cy="50" r="3.5" fill="#fff" />
  </g>
);
const Bars = ({ c }) => (
  <g className="auth-bars">
    {[34, 62, 84, 50, 72].map((h, i) => (
      <rect key={i} x={10 + i * 17} y={92 - h} width="11" height={h} rx="5.5" fill={i % 2 ? c : VIOLET} style={{ animationDelay: `${i * -0.21}s` }} />
    ))}
  </g>
);
const Wave = ({ c }) => (
  <g fill="none" stroke={c} strokeWidth="7" strokeLinecap="round">
    <path d="M8 50c8-28 16-28 24 0s16 28 24 0 16-28 24 0 8 14 12 14" />
  </g>
);
const Keys = ({ c }) => (
  <g>
    <rect x="8" y="24" width="84" height="56" rx="8" fill="#fff" stroke={c} strokeWidth="5" />
    <path d="M29 26v52M50 26v52M71 26v52" stroke={c} strokeWidth="3" />
    <rect x="22" y="26" width="13" height="30" rx="2" fill="#3b2a6b" />
    <rect x="43.5" y="26" width="13" height="30" rx="2" fill="#3b2a6b" />
    <rect x="65" y="26" width="13" height="30" rx="2" fill="#3b2a6b" />
  </g>
);
const Drum = ({ c }) => (
  <g>
    <path d="M14 40v32c0 9 16 16 36 16s36-7 36-16V40Z" fill={c} />
    <path d="M26 52v28M50 56v30M74 52v28" stroke="#fff" strokeWidth="3" opacity="0.5" />
    <ellipse cx="50" cy="40" rx="36" ry="14" fill="#fff" stroke="#3b2a6b" strokeWidth="5" />
    <path d="M30 34 8 12M70 34 92 12" stroke="#3b2a6b" strokeWidth="5" strokeLinecap="round" />
  </g>
);
const Speaker = ({ c }) => (
  <g>
    <path d="M14 38h18l24-20v64L32 62H14Z" fill={c} />
    <path d="M66 36c8 8 8 20 0 28M76 26c14 14 14 34 0 48" fill="none" stroke={c} strokeWidth="6" strokeLinecap="round" />
  </g>
);
// Two rings around the form: [component, colour, angle in degrees, size in px, tilt].
// Angle 0 is to the right of the form, 90 is below it.
const INNER = [
  [Beamed, PURPLE, 270, 100, -6], [Mic, PINK, 300, 88, 16], [Keys, TEAL, 330, 84, 8], [Vinyl, ORANGE, 2, 100, 0],
  [Note, TEAL, 32, 82, 12], [Bars, PINK, 62, 92, 0], [Headphones, YELLOW, 92, 96, -8], [Drum, ORANGE, 122, 86, 6],
  [Speaker, BLUE, 150, 84, -10], [Note, PINK, 180, 88, -14], [Keys, PURPLE, 210, 80, -10], [Wave, TEAL, 240, 100, -8],
];
const OUTER = [
  [Note, YELLOW, 285, 60, 14], [Drum, VIOLET, 318, 66, -8], [Wave, VIOLET, 348, 84, 10], [Beamed, TEAL, 18, 76, 8],
  [Note, ORANGE, 46, 54, -12], [Vinyl, PINK, 76, 72, 0], [Note, PURPLE, 106, 64, -10], [Bars, TEAL, 136, 76, 0],
  [Beamed, PINK, 164, 62, -8], [Headphones, VIOLET, 194, 78, 10], [Mic, TEAL, 224, 70, -14], [Speaker, YELLOW, 254, 60, 8],
];

function Ring({ items, className }) {
  return items.map(([Piece, colour, angle, size, tilt], i) => {
    const rad = (angle * Math.PI) / 180;
    return (
      <span
        key={`${className}-${i}`}
        className={`auth-piece ${className}`}
        style={{ '--cos': Math.cos(rad).toFixed(4), '--sin': Math.sin(rad).toFixed(4), '--tilt': `${tilt}deg`, width: size, height: size, animationDelay: `${(i % 6) * -0.9}s` }}
      >
        <svg viewBox="0 0 100 100" width="100%" height="100%">
          <Piece c={colour} />
        </svg>
      </span>
    );
  });
}

/** Decorative musical pieces arranged in two rings around the log in form. */
export default function AuthArt() {
  return (
    <div className="auth-ring" aria-hidden="true">
      <Ring items={INNER} className="inner" />
      <Ring items={OUTER} className="outer" />
    </div>
  );
}
