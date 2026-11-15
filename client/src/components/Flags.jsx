import React from 'react';

// Small simplified flags drawn inline, so they look the same on every platform
// (emoji flags do not render on Windows).
const Frame = ({ title, children, width = 60 }) => (
  <svg className="flag" width={width * 1.2} height="48" viewBox={`0 0 ${width} 40`} role="img" aria-label={title}>
    <title>{title}</title>
    {children}
  </svg>
);
const clip = (id) => (
  <clipPath id={id}>
    <rect width="60" height="40" rx="5" />
  </clipPath>
);
const outline = <rect x="0.5" y="0.5" width="59" height="39" rx="4.5" fill="none" stroke="#000" strokeOpacity="0.12" />;

export const MexicoFlag = () => (
  <Frame title="Flag of Mexico">
    {clip('flag-mx')}
    <g clipPath="url(#flag-mx)">
      <rect width="20" height="40" fill="#006847" />
      <rect x="20" width="20" height="40" fill="#fff" />
      <rect x="40" width="20" height="40" fill="#ce1126" />
      <circle cx="30" cy="20" r="5" fill="#8c6b3f" />
      <path d="M24.5 22.5a6 6 0 0 0 11 0" fill="none" stroke="#3f8f4f" strokeWidth="1.6" />
    </g>
    {outline}
  </Frame>
);

export const SpainFlag = () => (
  <Frame title="Flag of Spain">
    {clip('flag-es')}
    <g clipPath="url(#flag-es)">
      <rect width="60" height="40" fill="#aa151b" />
      <rect y="10" width="60" height="20" fill="#f1bf00" />
      <rect x="15" y="15" width="7" height="10" rx="1.5" fill="#aa151b" />
      <rect x="15" y="14" width="7" height="2.5" rx="1" fill="#c8a400" />
    </g>
    {outline}
  </Frame>
);

export const IndiaFlag = () => (
  <Frame title="Flag of India">
    {clip('flag-in')}
    <g clipPath="url(#flag-in)">
      <rect width="60" height="13.4" fill="#ff9933" />
      <rect y="13.3" width="60" height="13.4" fill="#fff" />
      <rect y="26.6" width="60" height="13.4" fill="#138808" />
      <g stroke="#000080" strokeWidth="0.7" fill="none">
        <circle cx="30" cy="20" r="5" strokeWidth="1" />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * Math.PI) / 12;
          return <line key={i} x1={30 - 5 * Math.cos(a)} y1={20 - 5 * Math.sin(a)} x2={30 + 5 * Math.cos(a)} y2={20 + 5 * Math.sin(a)} />;
        })}
      </g>
    </g>
    {outline}
  </Frame>
);

// Nepal's flag is two stacked pennants rather than a rectangle.
export const NepalFlag = () => (
  <Frame title="Flag of Nepal" width={36}>
    <path d="M2 2 33 19H14l19 19H2Z" fill="#dc143c" stroke="#003893" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M6.5 11.5a4.3 4.3 0 0 0 8.6 0 5.2 5.2 0 0 1-8.6 0Z" fill="#fff" />
    <circle cx="10.8" cy="11" r="1.5" fill="#fff" />
    <g fill="#fff" stroke="#fff" strokeWidth="1" strokeLinecap="round">
      <circle cx="10.8" cy="28.5" r="3" stroke="none" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return <line key={i} x1={10.8 + 3.6 * Math.cos(a)} y1={28.5 + 3.6 * Math.sin(a)} x2={10.8 + 5 * Math.cos(a)} y2={28.5 + 5 * Math.sin(a)} />;
      })}
    </g>
  </Frame>
);
