import React, { useEffect, useRef, useState } from 'react';
import { speak, stopSpeaking } from '../audio/tts.js';

/** Right-side explainer for one line: glosses, translation, hear it sung / spoken. */
export default function LinePanel({ line, song, onClose, onJump }) {
  const [wordIndex, setWordIndex] = useState(null);
  const [note, setNote] = useState('');
  const clipRef = useRef(null);
  const isHindi = song.language === 'hi';
  const word = wordIndex != null ? line.words[wordIndex] : null;

  const stopAll = () => {
    clipRef.current?.pause();
    stopSpeaking();
  };
  useEffect(() => {
    setWordIndex(null);
    setNote('');
    return stopAll;
  }, [line.index]);

  const hearSung = async () => {
    stopAll();
    setNote('');
    // Prefer the pre-cut clip; otherwise play the full vocal stem between the line's timestamps.
    const audio = new Audio(line.clipPath || song.audio.vocals);
    clipRef.current = audio;
    if (!line.clipPath) {
      audio.currentTime = line.start;
      audio.ontimeupdate = () => audio.currentTime >= line.end && audio.pause();
    }
    try {
      await audio.play();
    } catch {
      setNote('Could not play the clip for this line.');
    }
  };
  const hearSpoken = async (text) => {
    clipRef.current?.pause();
    const result = await speak(text, song.language, { slow: true });
    setNote(result.message || '');
  };

  return (
    <aside className="card line-panel">
      <div className="panel-head">
        <span className="muted">Line {line.index + 1}</span>
        <button className="link" onClick={onClose} aria-label="Close line details">
          Close
        </button>
      </div>
      <p className="panel-original" lang={song.language}>{line.original}</p>
      {isHindi && line.romanized && <p className="panel-romanized">{line.romanized}</p>}
      {line.phonetic && (
        <p className="muted">
          Say it: <em>{line.phonetic}</em>
        </p>
      )}

      <h3>Word by word</h3>
      <div className="glosses">
        {line.words.map((w, i) => (
          <button key={i} className={`gloss ${i === wordIndex ? 'selected' : ''}`} onClick={() => setWordIndex(i === wordIndex ? null : i)}>
            <span lang={song.language}>{w.text}</span>
            {isHindi && w.romanized && <small>{w.romanized}</small>}
            <small className="muted">{w.gloss || '—'}</small>
          </button>
        ))}
      </div>
      {word && (
        <div className="word-detail">
          <strong lang={song.language}>{word.text}</strong>
          {isHindi && word.romanized && <span> · {word.romanized}</span>}
          <div>{word.gloss || 'No gloss available'}</div>
          {word.phonetic && <div className="muted">Say it: <em>{word.phonetic}</em></div>}
          <button className="link" onClick={() => hearSpoken(word.text)}>Hear this word</button>
        </div>
      )}

      <h3>Translation</h3>
      <p>{line.translation || <span className="muted">No translation yet. Run the pipeline with an LLM key to add one.</span>}</p>

      <div className="panel-actions">
        <button onClick={hearSung}>Hear it sung</button>
        <button onClick={() => hearSpoken(line.original)}>Hear it spoken (slow)</button>
        {onJump && <button onClick={() => { stopAll(); onJump(); }}>Jump to this line</button>}
      </div>
      {note && <p className="muted small">{note}</p>}
    </aside>
  );
}
