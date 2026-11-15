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
const Sparkle = ({ c }) => <path d="M50 6c5 30 14 39 44 44-30 5-39 14-44 44-5-30-14-39-44-44 30-5 39-14 44-44Z" fill={c} />;
const Speaker = ({ c }) => (
  <g>
    <path d="M14 38h18l24-20v64L32 62H14Z" fill={c} />
    <path d="M66 36c8 8 8 20 0 28M76 26c14 14 14 34 0 48" fill="none" stroke={c} strokeWidth="6" strokeLinecap="round" />
  </g>
);
const Heart = ({ c }) => <path d="M50 86C22 66 8 50 8 33a21 21 0 0 1 42-6 21 21 0 0 1 42 6c0 17-14 33-42 53Z" fill={c} />;

// Two rings around the form: [component, colour, angle in degrees, size in px, tilt].
// Angle 0 is to the right of the form, 90 is below it.
const INNER = [
  [Beamed, PURPLE, 270, 104, -6], [Mic, PINK, 306, 92, 16], [Sparkle, YELLOW, 338, 46, 0], [Vinyl, ORANGE, 8, 108, 0],
  [Note, TEAL, 40, 84, 12], [Bars, PINK, 68, 96, 0], [Headphones, YELLOW, 100, 100, -8], [Sparkle, VIOLET, 126, 40, 0],
  [Speaker, BLUE, 150, 88, -10], [Note, PINK, 182, 92, -14], [Heart, ORANGE, 212, 58, -12], [Wave, TEAL, 238, 104, -8],
];
const OUTER = [
  [Note, YELLOW, 288, 62, 14], [Sparkle, PINK, 322, 38, 0], [Wave, VIOLET, 350, 86, 10], [Beamed, TEAL, 22, 78, 8],
  [Sparkle, YELLOW, 52, 34, 0], [Vinyl, PINK, 84, 76, 0], [Note, PURPLE, 114, 66, -10], [Bars, TEAL, 142, 78, 0],
  [Sparkle, ORANGE, 166, 36, 0], [Headphones, VIOLET, 196, 80, 10], [Mic, TEAL, 226, 72, -14], [Sparkle, BLUE, 254, 34, 0],
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
