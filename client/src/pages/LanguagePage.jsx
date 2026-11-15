import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, LANGUAGES } from '../api.js';
import { IndiaFlag, MexicoFlag, NepalFlag, SpainFlag } from '../components/Flags.jsx';

const CARDS = [
  { code: 'es', flags: [<MexicoFlag key="mx" />, <SpainFlag key="es" />], blurb: 'Sing along to songs from Mexico, Spain and across Latin America.' },
  { code: 'hi', flags: [<IndiaFlag key="in" />, <NepalFlag key="np" />], blurb: 'Learn Hindi songs and their pronunciation through romanized lyrics. No new script to learn first, just read and sing.' },
];

/**
 * What to feature in the hero: the language the user picked last (Spanish for a
 * new user), and within it the song they sang most recently, else the first one.
 * If that language has no songs yet, feature one that does.
 */
function pickFeatured(songs) {
  const saved = localStorage.getItem('musiglot.language');
  const preferred = LANGUAGES[saved] ? saved : 'es';
  const order = [preferred, ...Object.keys(LANGUAGES).filter((c) => c !== preferred)];
  const language = (songs && order.find((code) => songs.some((s) => s.language === code))) || preferred;
  const inLanguage = (songs || []).filter((s) => s.language === language);
  const sung = inLanguage.filter((s) => s.recent).sort((a, b) => new Date(b.recent.createdAt) - new Date(a.recent.createdAt));
  return { language, song: sung[0] || inLanguage[0] || null, returning: sung.length > 0 };
}

function Hero({ songs, onOpen }) {
  const { language, song, returning } = pickFeatured(songs);
  return (
    <section className="hero">
      <div className="hero-text">
        <span className="hero-pill">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
            <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
          </svg>
          {returning ? 'Learning now' : 'Start here'}
        </span>
        <h1>
          Turn up your <span className="hero-language">{LANGUAGES[language].name}.</span>
        </h1>
        <p className="hero-lead">Learn naturally through songs you'll love, one lyric at a time.</p>
        <button className="hero-cta" onClick={() => onOpen(language, song)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 4.5v15l12-7.5Z" />
          </svg>
          {returning ? 'Continue learning' : song ? 'Start learning' : 'Browse songs'}
        </button>
      </div>

      <div className="hero-art" aria-hidden="true">
        <div className="hero-vinyl">
          <div className="hero-label" />
        </div>
      </div>
      {song && (
        <div className="hero-now">
          <span className="hero-eq" aria-hidden="true"><i /><i /><i /></span>
          <span>
            <small>{returning ? 'Now learning' : 'Up first'}</small>
            <strong>{song.title}</strong>
            <span>{song.artist}</span>
          </span>
        </div>
      )}
    </section>
  );
}

export default function LanguagePage() {
  const navigate = useNavigate();
  const [songs, setSongs] = useState(null);

  // Songs drive the hero and the counts; the page still works if this fails.
  useEffect(() => {
    api('/songs').then((d) => setSongs(d.songs)).catch(() => setSongs([]));
  }, []);

  const choose = (code) => {
    localStorage.setItem('musiglot.language', code);
    navigate(`/catalog/${code}`);
  };
  const openFeatured = (code, song) => {
    localStorage.setItem('musiglot.language', code);
    navigate(song ? `/practice/${song.slug}` : `/catalog/${code}`);
  };
  const count = (code) => songs?.filter((s) => s.language === code).length;

  return (
    <main className="languages">
      <Hero songs={songs} onOpen={openFeatured} />
      <section className="language-list" aria-labelledby="languages-title">
        <h2 id="languages-title">Languages</h2>
        {CARDS.map(({ code, flags, blurb }) => {
          const n = count(code);
          return (
            <button key={code} className="language-card" onClick={() => choose(code)}>
              <span className="language-flags">{flags}</span>
              <span className="language-body">
                <span className="language-name">{LANGUAGES[code].name}</span>
                <span className="language-native" lang={code}>{LANGUAGES[code].native}</span>
                <span className="language-blurb">{blurb}</span>
              </span>
              {n > 0 && <span className="language-count">{n} {n === 1 ? 'song' : 'songs'}</span>}
            </button>
          );
        })}
      </section>
    </main>
  );
}
