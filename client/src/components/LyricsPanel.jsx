import React, { useEffect, useRef } from 'react';
import { hasDevanagari } from '../api.js';

function Words({ words, field, time, state }) {
  return words.map((w, i) => {
    const sung = state === 'done' || (state === 'active' && w.start != null && time >= w.start);
    return (
      <span key={i} className={sung ? 'word sung' : 'word'}>
        {w[field] || w.text}{' '}
      </span>
    );
  });
}

/** Lines start gray and light up in sync with playback (word by word when timings exist). */
export default function LyricsPanel({ song, time, started, paused, selectedIndex, onSelect }) {
  const activeRef = useRef(null);
  // Two columns (script + romanized) only when the lyrics are actually in Devanagari.
  const isHindi = song.language === 'hi' && song.lines.some((l) => hasDevanagari(l.original));
  // Active = the latest line that has started. Before the first line, nothing is active.
  let activeIndex = -1;
  for (const line of song.lines) if (time >= line.start) activeIndex = line.index;

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIndex]);

  return (
    <div className={`lyrics ${paused ? 'selectable' : ''}`}>
      {song.lines.map((line) => {
        const state = !started ? 'pending' : line.index < activeIndex || time >= line.end ? 'done' : line.index === activeIndex ? 'active' : 'pending';
        const hasWords = line.words?.length > 0;
        const classes = ['line', state, selectedIndex === line.index ? 'selected' : ''].join(' ');
        return (
          <div
            key={line.index}
            ref={line.index === activeIndex ? activeRef : null}
            className={classes}
            role={paused ? 'button' : undefined}
            tabIndex={paused ? 0 : undefined}
            onClick={paused ? () => onSelect(line.index) : undefined}
            onKeyDown={paused ? (e) => (e.key === 'Enter' || e.key === ' ') && onSelect(line.index) : undefined}
          >
            <div className={isHindi ? 'line-cols' : undefined}>
              <div className="original" lang={song.language}>
                {hasWords ? <Words words={line.words} field="text" time={time} state={state} /> : line.original}
              </div>
              {isHindi && (
                <div className="romanized">
                  {hasWords && line.words.every((w) => w.romanized) ? <Words words={line.words} field="romanized" time={time} state={state} /> : line.romanized}
                </div>
              )}
            </div>
            {line.translation && <div className="translation">{line.translation}</div>}
          </div>
        );
      })}
    </div>
  );
}
