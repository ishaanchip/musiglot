import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatDuration, formatScore, LANGUAGES, scoreLevel } from '../api.js';

function Grades({ label, grade }) {
  return (
    <div className="grades">
      <span className="muted">{label}</span>
      {grade ? (
        <Link to={`/results/${grade.attemptId}`} onClick={(e) => e.stopPropagation()} title="Open this attempt">
          <span className={`pill ${scoreLevel(grade.pronunciation)}`}>Pron {formatScore(grade.pronunciation)}</span>
          <span className={`pill ${scoreLevel(grade.pitch)}`}>Pitch {formatScore(grade.pitch)}</span>
        </Link>
      ) : (
        <span className="muted">not yet</span>
      )}
    </div>
  );
}

function Difficulty({ d }) {
  if (!d) return null;
  const why = [
    ['Tempo', d.tempo, d.details?.syllablesPerSec && `${d.details.syllablesPerSec} syllables/sec, ${d.details.bpm} BPM`],
    ['Range', d.range, d.details?.rangeSemitones && `${d.details.rangeSemitones} semitones`],
    ['Vocabulary', d.vocab, d.details?.rarestWords?.length ? `rare: ${d.details.rarestWords.slice(0, 3).join(', ')}` : ''],
    ['Grammar', d.grammar, d.details?.grammarNotes],
  ];
  return (
    <details className="difficulty">
      <summary>
        Difficulty <strong>{d.overall}/10</strong>
      </summary>
      <ul>
        {why.map(([name, value, note]) => (
          <li key={name}>
            <span>{name}</span>
            <span className="bar"><i style={{ width: `${(value || 0) * 10}%` }} /></span>
            <span>{value ?? '–'}</span>
            {note && <small className="muted">{note}</small>}
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function CatalogPage() {
  const { language } = useParams();
  const [songs, setSongs] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setSongs(null);
    api(`/songs?language=${language}`)
      .then((d) => setSongs(d.songs))
      .catch((err) => setError(err.message));
  }, [language]);

  return (
    <main>
      <h1>{LANGUAGES[language]?.name || 'All'} songs</h1>
      {error && <p className="error">{error}</p>}
      {!songs && !error && <p className="muted">Loading songs…</p>}
      {songs?.length === 0 && (
        <p className="card">
          No {LANGUAGES[language]?.name} songs yet. Add one with <code>python pipeline/process_song.py songs/&lt;slug&gt;</code>
          {language === 'hi' && <> or run <code>npm run seed</code> for the demo song</>}.
        </p>
      )}
      <div className="catalog">
        {songs?.map((song) => (
          <article key={song.slug} className="card song-card">
            <div>
              <h2>{song.title}</h2>
              <p className="muted">
                {song.artist} · {formatDuration(song.durationSec)}
              </p>
            </div>
            <Difficulty d={song.difficulty} />
            <Grades label="Best" grade={song.best} />
            <Grades label="Latest" grade={song.recent} />
            <Link className="button primary" to={`/practice/${song.slug}`}>
              {song.attempts ? 'Sing again' : 'Sing'}
            </Link>
          </article>
        ))}
      </div>
    </main>
  );
}
