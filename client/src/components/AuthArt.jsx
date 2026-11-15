import React from 'react';

const TEAL = '#4f9d8f';
const MINT = '#cfe6df';
const YELLOW = '#f7c244';
const RED = '#d2402f';
const BROWN = '#a8563a';

const Sparkle = ({ x, y, s = 1, fill = YELLOW }) => (
  <path transform={`translate(${x} ${y}) scale(${s})`} d="M0-12C1.5-4 4-1.5 12 0 4 1.5 1.5 4 0 12-1.5 4-4 1.5-12 0-4-1.5-1.5-4 0-12Z" fill={fill} />
);

/** A single eighth note; (x, y) is the centre of the note head. */
const Note = ({ x, y, s = 1, fill, rotate = 0 }) => (
  <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${s})`} fill={fill}>
    <ellipse cx="0" cy="0" rx="15" ry="11" transform="rotate(-22)" />
    <rect x="11" y="-74" width="5.5" height="74" rx="2.5" />
    <path d="M16.5-74c4 16 26 20 22 46-3-16-13-22-22-24Z" />
  </g>
);

/** Decorative illustration for the log in screen: notes, beats and a lyric card. */
export default function AuthArt() {
  const bars = [46, 78, 112, 64, 132, 92, 150, 70, 104, 54, 86];
  const barColors = [MINT, TEAL, YELLOW, MINT, TEAL, RED, TEAL, YELLOW, MINT, TEAL, MINT];
  return (
    <svg className="auth-art" viewBox="0 0 560 520" role="img" aria-label="Music notes, a microphone and sound bars">
      <ellipse cx="290" cy="468" rx="210" ry="16" fill="#f1e6da" />

      {/* Lyric card with a highlighted line */}
      <g transform="rotate(-6 170 120)">
        <rect x="70" y="62" width="230" height="118" rx="16" fill="#fff" stroke="#efe4d8" strokeWidth="2" />
        <circle cx="104" cy="96" r="13" fill={RED} />
        <path d="M100 89.5v13l11-6.5Z" fill="#fff" />
        <rect x="128" y="89" width="140" height="9" rx="4.5" fill={RED} opacity="0.85" />
        <rect x="92" y="122" width="176" height="8" rx="4" fill={MINT} />
        <rect x="92" y="146" width="124" height="8" rx="4" fill={MINT} />
      </g>

      {/* Pitch bars with the singer's dot */}
      <g>
        <rect x="352" y="118" width="62" height="12" rx="6" fill={MINT} />
        <rect x="422" y="96" width="54" height="12" rx="6" fill={TEAL} />
        <rect x="484" y="132" width="46" height="12" rx="6" fill={MINT} />
        <circle cx="449" cy="102" r="9" fill={YELLOW} stroke="#fff" strokeWidth="3" />
      </g>

      {/* Big beamed pair of notes */}
      <g fill={TEAL}>
        <ellipse cx="222" cy="352" rx="30" ry="22" transform="rotate(-22 222 352)" />
        <ellipse cx="338" cy="322" rx="30" ry="22" transform="rotate(-22 338 322)" />
        <rect x="243" y="196" width="10" height="158" rx="4" />
        <rect x="359" y="166" width="10" height="158" rx="4" />
        <path d="M243 196l126-32v34l-126 32Z" />
      </g>

      {/* Microphone */}
      <g transform="rotate(24 420 300)">
        <rect x="398" y="226" width="44" height="78" rx="22" fill={BROWN} />
        <path d="M402 258h36M402 272h36M402 244h36" stroke="#fff" strokeWidth="3" opacity="0.45" />
        <path d="M388 286c0 20 14 34 32 34s32-14 32-34" fill="none" stroke="#3f7f74" strokeWidth="6" strokeLinecap="round" />
        <rect x="417" y="320" width="6" height="40" rx="3" fill="#3f7f74" />
        <rect x="398" y="358" width="44" height="7" rx="3.5" fill="#3f7f74" />
      </g>

      {/* Loose notes */}
      <Note x={118} y={300} s={0.9} fill={YELLOW} rotate={-10} />
      <Note x={470} y={236} s={0.62} fill={RED} rotate={12} />
      <Note x={96} y={420} s={0.5} fill={TEAL} rotate={-18} />

      {/* Beats: equaliser bars */}
      <g className="auth-bars">
        {bars.map((h, i) => (
          <rect key={i} x={150 + i * 26} y={460 - h} width="16" height={h} rx="8" fill={barColors[i]} style={{ animationDelay: `${(i % 5) * -0.23}s` }} />
        ))}
      </g>

      <Sparkle x={66} y={214} s={1.3} />
      <Sparkle x={336} y={70} s={0.8} />
      <Sparkle x={506} y={330} s={1} fill="#f9d98a" />
      <Sparkle x={196} y={36} s={0.6} fill="#f9d98a" />
    </svg>
  );
}
