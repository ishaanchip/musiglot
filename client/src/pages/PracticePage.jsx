import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, formatDuration } from '../api.js';
import { MicRecorder } from '../audio/recorder.js';
import { stopSpeaking } from '../audio/tts.js';
import LyricsPanel from '../components/LyricsPanel.jsx';
import LinePanel from '../components/LinePanel.jsx';
import PitchLane from '../components/PitchLane.jsx';

// phase: loading -> headphones -> idle -> playing <-> paused -> scoring -> (results page)
export default function PracticePage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [song, setSong] = useState(null);
  const [pitch, setPitch] = useState(null);
  const [phase, setPhase] = useState('loading');
  const [time, setTime] = useState(0);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const audioRef = useRef(null);
  const recorderRef = useRef(null);
  const finishingRef = useRef(false);
  const getTime = useCallback(() => audioRef.current?.currentTime || 0, []);

  // Load the song, its reference pitch, and the instrumental.
  useEffect(() => {
    let cancelled = false;
    api(`/songs/${slug}`)
      .then(async ({ song: s }) => {
        if (cancelled) return;
        setSong(s);
        setPhase('headphones');
        if (s.pitchContour?.path) {
          const res = await fetch(s.pitchContour.path);
          if (res.ok && !cancelled) setPitch(await res.json());
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setPhase('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const finish = useCallback(async () => {
    if (finishingRef.current || !recorderRef.current) return;
    finishingRef.current = true;
    audioRef.current?.pause();
    recorderRef.current.pause();
    setSelected(null);
    setPhase('scoring');
    setError('');
    try {
      const form = new FormData();
      form.append('songId', song._id);
      form.append('pitchTrack', JSON.stringify(recorderRef.current.track));
      form.append('recording', recorderRef.current.buildWav(), 'recording.wav');
      const { attempt, warning } = await api('/attempts', { method: 'POST', formData: form });
      navigate(`/results/${attempt._id}`, { state: { warning } });
    } catch (err) {
      setError(`Could not score this take: ${err.message}`);
      setPhase('paused'); // the recording is still in memory, so End can be retried
    } finally {
      finishingRef.current = false;
    }
  }, [song, navigate]);

  useEffect(() => {
    if (!song) return undefined;
    const audio = new Audio(song.audio.instrumental);
    audio.preload = 'auto';
    audioRef.current = audio;
    audio.addEventListener('ended', finish);
    audio.addEventListener('error', () => setError('Could not load the backing track for this song.'));
    return () => {
      audio.removeEventListener('ended', finish);
      audio.pause();
      audioRef.current = null;
    };
  }, [song, finish]);

  // Release the microphone and stop any speech when leaving the page.
  useEffect(() => () => {
    recorderRef.current?.destroy();
    stopSpeaking();
  }, []);

  // Drive lyric highlighting while playing.
  useEffect(() => {
    if (phase !== 'playing') return undefined;
    let raf;
    const tick = () => {
      setTime(getTime());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, getTime]);

  const play = async () => {
    setError('');
    setSelected(null);
    stopSpeaking();
    try {
      if (!recorderRef.current) {
        const recorder = new MicRecorder();
        await recorder.init();
        recorderRef.current = recorder;
      }
      // Instrumental and mic recording start together.
      await audioRef.current.play();
      await recorderRef.current.start(getTime);
      setPhase('playing');
    } catch (err) {
      audioRef.current?.pause();
      setError(err.message || 'Could not start playback.');
    }
  };

  const pause = () => {
    audioRef.current.pause();
    recorderRef.current?.pause();
    setTime(getTime());
    setPhase('paused');
  };

  if (phase === 'loading') return <main className="center muted">Loading song…</main>;
  if (!song) return <main className="narrow"><p className="error">{error}</p><Link to="/">Back to songs</Link></main>;

  const started = phase === 'playing' || phase === 'paused' || phase === 'scoring';
  const paused = phase === 'paused';
  const selectedLine = selected != null ? song.lines.find((l) => l.index === selected) : null;

  return (
    <main className="practice">
      {phase === 'headphones' && (
        <div className="modal-backdrop">
          <div className="card modal" role="dialog" aria-modal="true" aria-labelledby="hp-title">
            <h2 id="hp-title">Put on headphones</h2>
            <p>We record your voice while the backing track plays. Without headphones the microphone picks up the music and your scores will be off.</p>
            <p className="muted">Your browser will ask for microphone access when you press Play.</p>
            <button className="primary" autoFocus onClick={() => setPhase('idle')}>
              I'm wearing headphones
            </button>
          </div>
        </div>
      )}

      <section className="stage">
        <div className="stage-head">
          <div>
            <h1>{song.title}</h1>
            <p className="muted">{song.artist}</p>
          </div>
          <Link to={`/catalog/${song.language}`} className="muted">Back to songs</Link>
        </div>

        <PitchLane pitch={pitch} getTime={getTime} recorderRef={recorderRef} />
        <LyricsPanel song={song} time={time} started={started} paused={paused} selectedIndex={selected} onSelect={setSelected} />

        <div className="controls">
          {phase === 'playing' ? (
            <button className="primary" onClick={pause}>Pause</button>
          ) : (
            <button className="primary" onClick={play} disabled={phase === 'scoring' || phase === 'headphones'}>
              {started ? 'Resume' : 'Play'}
            </button>
          )}
          <button onClick={finish} disabled={!recorderRef.current || phase === 'scoring'}>End</button>
          <span className="muted clock">{formatDuration(time)} / {formatDuration(song.durationSec)}</span>
          <span className="status" role="status">
            {phase === 'playing' && <><i className="rec-dot" /> Recording</>}
            {phase === 'paused' && 'Paused. Click any line to study it.'}
            {phase === 'scoring' && 'Scoring your take…'}
          </span>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      {selectedLine ? (
        <LinePanel line={selectedLine} song={song} onClose={() => setSelected(null)} />
      ) : (
        <aside className="card line-panel hint">
          <h3>How it works</h3>
          <ol>
            <li>Press <strong>Play</strong> and sing along as each line lights up.</li>
            <li>Follow the bars in the pitch lane. Your voice is the dot.</li>
            <li><strong>Pause</strong> and click a line to see what it means and hear it.</li>
            <li>Press <strong>End</strong> (or sing to the end) to get your grades.</li>
          </ol>
        </aside>
      )}
    </main>
  );
}
