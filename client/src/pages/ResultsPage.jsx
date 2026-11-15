import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatScore, hasDevanagari, scoreLevel } from '../api.js';

function Score({ label, value }) {
  return (
    <div className={`card score ${scoreLevel(value)}`}>
      <span className="score-value">{formatScore(value)}</span>
      <span className="score-max">/ 10</span>
      <span className="score-label">{label}</span>
    </div>
  );
}

const lineAverage = (r) => {
  const vals = [r.pronunciation, r.pitch].filter((v) => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
};

export default function ResultsPage() {
  const { attemptId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/attempts/${attemptId}`).then(setData).catch((err) => setError(err.message));
  }, [attemptId]);

  if (error) return <main className="narrow"><p className="error">{error}</p><Link to="/">Back to songs</Link></main>;
  if (!data) return <main className="center muted">Loading results…</main>;
  const { attempt, song } = data;
  const isHindi = song.language === 'hi' && song.lines.some((l) => hasDevanagari(l.original));
  const partial = attempt.linesAttempted != null && attempt.linesAttempted < attempt.linesTotal;

  return (
    <main className="results">
      <h1>{song.title}</h1>
      <p className="muted">{song.artist} · {new Date(attempt.createdAt).toLocaleString()}</p>

      <div className="scores">
        <Score label="Pronunciation" value={attempt.pronunciationScore} />
        <Score label="Pitch and timing" value={attempt.pitchScore} />
      </div>
      {partial && (
        <p className="muted small">
          Graded on the {attempt.linesAttempted} of {attempt.linesTotal} lines you sang. Lines you skipped do not count against you.
        </p>
      )}

      <div className="feedback">
        <section className="card">
          <h2>What went well</h2>
          <ul>{attempt.feedback?.wentWell?.map((b, i) => <li key={i}>{b}</li>)}</ul>
        </section>
        <section className="card">
          <h2>What to improve</h2>
          <ul>{attempt.feedback?.improve?.map((b, i) => <li key={i}>{b}</li>)}</ul>
        </section>
      </div>

      <h2>Line by line</h2>
      <p className="muted small">
        <span className="pill good">7+ good</span> <span className="pill ok">4–7 getting there</span> <span className="pill poor">under 4 needs work</span>
      </p>
      <ol className="line-results">
        {attempt.perLine.map((r) => {
          const line = song.lines.find((l) => l.index === r.index);
          const weak = (r.words || []).filter((w) => w.score < 6);
          return (
            <li key={r.index} className={`card line-result ${r.attempted === false ? 'skipped' : scoreLevel(lineAverage(r))}`}>
              <div>
                <div lang={song.language}>{line?.original}</div>
                {isHindi && line?.romanized && <div className="romanized">{line.romanized}</div>}
                <div className="muted small">
                  {line?.translation}
                  {r.heard && <> · heard: “{r.heard}”</>}
                  {weak.length > 0 && <> · practice: {weak.map((w) => w.text).join(', ')}</>}
                  {Math.abs(r.timingOffsetMs ?? 0) >= 200 && <> · {r.timingOffsetMs > 0 ? 'late' : 'early'} by {Math.abs(r.timingOffsetMs)} ms</>}
                </div>
              </div>
              {r.attempted === false ? (
                <div className="line-scores"><span className="pill">Not sung</span></div>
              ) : (
                <div className="line-scores">
                  <span className={`pill ${scoreLevel(r.pronunciation)}`}>Pron {formatScore(r.pronunciation)}</span>
                  <span className={`pill ${scoreLevel(r.pitch)}`}>Pitch {formatScore(r.pitch)}</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="controls">
        <Link className="button primary" to={`/practice/${song.slug}`}>Try again</Link>
        <Link className="button" to={`/catalog/${song.language}`}>Back to songs</Link>
      </div>
    </main>
  );
}
