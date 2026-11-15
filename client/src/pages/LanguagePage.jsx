import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, LANGUAGES } from '../api.js';
import { IndiaFlag, MexicoFlag, NepalFlag, SpainFlag } from '../components/Flags.jsx';

const CARDS = [
  { code: 'es', flags: [<MexicoFlag key="mx" />, <SpainFlag key="es" />], blurb: 'Sing along to songs from Mexico, Spain and across Latin America.' },
  { code: 'hi', flags: [<IndiaFlag key="in" />, <NepalFlag key="np" />], blurb: 'Learn Hindi songs and their pronunciation through romanized lyrics. No new script to learn first, just read and sing.' },
];

export default function LanguagePage() {
  const navigate = useNavigate();
  const [counts, setCounts] = useState(null);

  // Song counts are a nicety; the page works without them.
  useEffect(() => {
    api('/songs')
      .then(({ songs }) => setCounts(songs.reduce((acc, s) => ({ ...acc, [s.language]: (acc[s.language] || 0) + 1 }), {})))
      .catch(() => {});
  }, []);

  const choose = (code) => {
    localStorage.setItem('musiglot.language', code);
    navigate(`/catalog/${code}`);
  };

  return (
    <main className="languages">
      <h1>Languages</h1>
      <p className="languages-lead">Pick a language and learn it one song at a time.</p>
      <div className="language-grid">
        {CARDS.map(({ code, flags, blurb }) => {
          const n = counts?.[code];
          return (
            <button key={code} className="language-card" onClick={() => choose(code)}>
              <span className="language-flags">
                {flags}
                {n != null && <span className="language-count">{n} {n === 1 ? 'song' : 'songs'}</span>}
              </span>
              <span className="language-body">
                <span className="language-name">{LANGUAGES[code].name}</span>
                <span className="language-native" lang={code}>{LANGUAGES[code].native}</span>
                <span className="language-blurb">{blurb}</span>
              </span>
            </button>
          );
        })}
      </div>
    </main>
  );
}
