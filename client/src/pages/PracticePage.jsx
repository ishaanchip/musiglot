import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, formatDuration } from '../api.js';
import { MicRecorder } from '../audio/recorder.js';
import { SongPlayer } from '../audio/player.js';
import { stopSpeaking } from '../audio/tts.js';
import LyricsPanel from '../components/LyricsPanel.jsx';
import LinePanel from '../components/LinePanel.jsx';
import PitchLane from '../components/PitchLane.jsx';

const GUIDE_KEY = 'musiglot.guideVocals';
const LEAD_IN_SEC = 2; // music before the first chosen line, so you can find your entry
const SKIP_SEC = 10;
const clip = (text, n = 34) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

// phase:
//   loading -> headphones -> idle
//   idle -> listening <-> listenPaused     (preview with the original singer, nothing recorded)
//   idle | listening | listenPaused -> playing <-> paused -> scoring -> results page
export default function PracticePage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [song, setSong] = useState(null);
  const [pitch, setPitch] = useState(null);
  const [phase, setPhase] = useState('loading');
  const [time, setTime] = useState(0);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [guideOn, setGuideOn] = useState(() => localStorage.getItem(GUIDE_KEY) === '1');
  // Optional section to practise, as line indexes. null = from the beginning / to the end.
  const [section, setSection] = useState({ from: null, to: null });
  const playerRef = useRef(null);
  const recorderRef = useRef(null);
  const finishingRef = useRef(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const getTime = useCallback(() => playerRef.current?.currentTime || 0, []);

  const listening = phase === 'listening' || phase === 'listenPaused';
  const singing = phase === 'playing' || phase === 'paused' || phase === 'scoring';
  const paused = phase === 'paused' || phase === 'listenPaused';
  const running = phase === 'playing' || phase === 'listening';

  const duration = song?.durationSec || 0;
  const startTime = section.from != null && song ? Math.max(0, song.lines[section.from].start - LEAD_IN_SEC) : 0;
  const endTime = section.to != null && song ? Math.min(duration, song.lines[section.to].end + 0.5) : null;
  const boundsRef = useRef({ startTime, endTime });
  boundsRef.current = { startTime, endTime };
  const insideSection = (t) => t >= startTime - 0.05 && t < (endTime ?? duration) - 0.3;

  // Load the song and its reference pitch.
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
    playerRef.current?.pause();
    recorderRef.current.pause();
    setSelected(null);
    setPhase('scoring');
    setError('');
    try {
      const form = new FormData();
      form.append('songId', song._id);
      form.append('pitchTrack', JSON.stringify(recorderRef.current.track));
      form.append('coverage', JSON.stringify(recorderRef.current.coverage()));
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

  // Reaching the end of the song or of the chosen section: a preview goes back
  // to the start of the section, a take gets scored.
  const finishRef = useRef(finish);
  finishRef.current = finish;
  const reachedEnd = useCallback(() => {
    if (phaseRef.current === 'listening') {
      const player = playerRef.current;
      player.pause();
      player.seek(boundsRef.current.startTime);
      setTime(boundsRef.current.startTime);
      setPhase('idle');
    } else if (phaseRef.current === 'playing') {
      finishRef.current();
    }
  }, []);
  useEffect(() => {
    if (!song) return undefined;
    const player = new SongPlayer(song.audio, { onError: setError, onEnded: reachedEnd });
    playerRef.current = player;
    return () => {
      player.destroy();
      playerRef.current = null;
    };
  }, [song, reachedEnd]);

  // The original singer is always audible in a preview; while singing it follows the toggle.
  useEffect(() => {
    playerRef.current?.setGuide(listening || guideOn);
  }, [listening, guideOn, song]);

  // Release the microphone and stop any speech when leaving the page.
  useEffect(() => () => {
    recorderRef.current?.destroy();
    stopSpeaking();
  }, []);

  // Drive lyric highlighting while audio is running.
  useEffect(() => {
    if (!running) return undefined;
    let raf;
    const tick = () => {
      const t = getTime();
      setTime(t);
      const { endTime: stopAt } = boundsRef.current;
      if (stopAt != null && t >= stopAt) {
        reachedEnd();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, getTime, reachedEnd]);

  // ---- Moving around the song ----
  const seekTo = async (target) => {
    const player = playerRef.current;
    if (!player || phase === 'scoring') return;
    const t = Math.max(0, Math.min(target, duration - 0.2));
    player.seek(t);
    setTime(t);
    if (phase === 'playing') {
      // Start a new stretch of recording at the new position. Whatever was skipped is not graded.
      recorderRef.current.pause();
      await recorderRef.current.start(getTime);
    }
  };
  const nextLine = song?.lines.find((l) => l.start - 1 > time + 0.25);
  const chooseSection = (next) => {
    if (next.from != null && next.to != null && next.to < next.from) next.to = next.from;
    setSection(next);
    // Line up on the new start so Listen / Start singing begin there.
    const t = next.from != null ? Math.max(0, song.lines[next.from].start - LEAD_IN_SEC) : 0;
    if (!singing) seekTo(t);
  };

  const toggleGuide = (on) => {
    setGuideOn(on);
    localStorage.setItem(GUIDE_KEY, on ? '1' : '0');
  };

  // ---- Listen first (no microphone, nothing recorded) ----
  const listen = async () => {
    setError('');
    setSelected(null);
    stopSpeaking();
    try {
      if (!insideSection(getTime())) {
        playerRef.current.seek(startTime);
        setTime(startTime);
      }
      playerRef.current.setGuide(true);
      await playerRef.current.play();
      setPhase('listening');
    } catch (err) {
      setError(err.message || 'Could not start playback.');
    }
  };
  const pauseListening = () => {
    playerRef.current.pause();
    setTime(getTime());
    setPhase('listenPaused');
  };

  // ---- Sing (instrumental and mic recording start together) ----
  const sing = async () => {
    setError('');
    setSelected(null);
    stopSpeaking();
    const player = playerRef.current;
    try {
      // Resuming carries on where you paused. A new take starts at the start of
      // the section (or the song), unless you moved the slider somewhere first.
      if (phase !== 'paused' && (listening || !insideSection(getTime()))) {
        player.pause();
        player.seek(startTime);
        setTime(startTime);
      }
      player.setGuide(guideOn);
      if (!recorderRef.current) {
        const recorder = new MicRecorder();
        await recorder.init();
        recorderRef.current = recorder;
      }
      await player.play();
      await recorderRef.current.start(getTime);
      setPhase('playing');
    } catch (err) {
      player?.pause();
      if (listening) setPhase('idle');
      setError(err.message || 'Could not start playback.');
    }
  };
  const pauseSinging = () => {
    playerRef.current.pause();
    recorderRef.current?.pause();
    setTime(getTime());
    setPhase('paused');
  };

  if (phase === 'loading') return <main className="center muted">Loading song…</main>;
  if (!song) return <main className="narrow"><p className="error">{error}</p><Link to="/">Back to songs</Link></main>;

  const selectedLine = selected != null ? song.lines.find((l) => l.index === selected) : null;
  const blocked = phase === 'scoring' || phase === 'headphones';

  return (
    <main className="practice">
      {phase === 'headphones' && (
        <div className="modal-backdrop">
          <div className="card modal" role="dialog" aria-modal="true" aria-labelledby="hp-title">
            <h2 id="hp-title">Put on headphones</h2>
            <p>We record your voice while the backing track plays. Without headphones the microphone picks up the music and your scores will be off.</p>
            <p className="muted">You can listen to the song first. Your browser asks for microphone access only when you start singing.</p>
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
            <span className="muted">{song.artist}</span>
          </div>
          <Link to={`/catalog/${song.language}`} className="muted">Back to songs</Link>
        </div>

        <PitchLane pitch={pitch} getTime={getTime} recorderRef={recorderRef} />
        <LyricsPanel song={song} time={time} started={listening || singing} paused={paused} selectedIndex={selected} onSelect={setSelected} />

        <div className="controls">
          {singing ? (
            <>
              {phase === 'playing' ? (
                <button className="primary" onClick={pauseSinging}>Pause</button>
              ) : (
                <button className="primary" onClick={sing} disabled={blocked}>Resume</button>
              )}
              <button onClick={finish} disabled={phase === 'scoring'}>End</button>
            </>
          ) : (
            <>
              {phase === 'listening' ? (
                <button onClick={pauseListening}>Pause</button>
              ) : (
                <button onClick={listen} disabled={blocked}>{phase === 'listenPaused' ? 'Keep listening' : 'Listen first'}</button>
              )}
              <button className="primary" onClick={sing} disabled={blocked}>Start singing</button>
            </>
          )}
          <span className="status" role="status">
            {phase === 'listening' && 'Listening to the original. Nothing is being recorded.'}
            {phase === 'listenPaused' && 'Paused. Click any line to study it.'}
            {phase === 'playing' && <><i className="rec-dot" /> Recording</>}
            {phase === 'paused' && 'Paused. Click any line to study it.'}
            {phase === 'scoring' && 'Scoring your take…'}
          </span>
        </div>

        <div className="seek">
          <button onClick={() => seekTo(time - SKIP_SEC)} disabled={blocked} aria-label="Back 10 seconds">« 10s</button>
          <span className="muted clock">{formatDuration(time)}</span>
          <input
            type="range"
            min={0}
            max={duration}
            step={0.1}
            value={Math.min(time, duration)}
            onChange={(e) => seekTo(Number(e.target.value))}
            disabled={blocked}
            aria-label="Position in the song"
          />
          <span className="muted clock">{formatDuration(duration)}</span>
          <button onClick={() => seekTo(time + SKIP_SEC)} disabled={blocked} aria-label="Forward 10 seconds">10s »</button>
          <button onClick={() => seekTo(nextLine.start - 1)} disabled={blocked || !nextLine} title="Jump to just before the next line">Next line »</button>
        </div>

        <div className="options-row">
        <div className="section-picker">
          <span className="muted">Practise a section:</span>
          <label>
            from
            <select value={section.from ?? ''} disabled={singing || blocked} onChange={(e) => chooseSection({ ...section, from: e.target.value === '' ? null : Number(e.target.value) })}>
              <option value="">the beginning</option>
              {song.lines.map((l) => (
                <option key={l.index} value={l.index}>{`${formatDuration(l.start)}  ${l.index + 1}. ${clip(l.original)}`}</option>
              ))}
            </select>
          </label>
          <label>
            to
            <select value={section.to ?? ''} disabled={singing || blocked} onChange={(e) => chooseSection({ ...section, to: e.target.value === '' ? null : Number(e.target.value) })}>
              <option value="">the end</option>
              {song.lines.filter((l) => section.from == null || l.index >= section.from).map((l) => (
                <option key={l.index} value={l.index}>{`${formatDuration(l.end)}  ${l.index + 1}. ${clip(l.original)}`}</option>
              ))}
            </select>
          </label>
          {(section.from != null || section.to != null) && (
            <button className="link" disabled={singing || blocked} onClick={() => chooseSection({ from: null, to: null })}>Whole song</button>
          )}
        </div>

        <label
          className={`toggle ${listening ? 'disabled' : ''}`}
          title={listening ? 'Always on while you listen. This switch applies when you sing.' : 'Hear the original singer while you sing. Off gives you the backing track only.'}
        >
          <input type="checkbox" checked={listening || guideOn} disabled={listening || phase === 'scoring'} onChange={(e) => toggleGuide(e.target.checked)} />
          <span>
            <strong>Guide vocals</strong>
            <small className="muted">{listening ? 'on while listening' : guideOn ? 'singer on' : 'backing track only'}</small>
          </span>
        </label>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      {selectedLine ? (
        <LinePanel line={selectedLine} song={song} onClose={() => setSelected(null)} onJump={() => seekTo(selectedLine.start - 1)} />
      ) : (
        <aside className="card line-panel hint">
          <h3>How it works</h3>
          <ol>
            <li><strong>Listen first</strong> to hear the original with the lyrics lighting up. Nothing is recorded.</li>
            <li>Press <strong>Start singing</strong> and sing along as each line lights up. Switch on <strong>Guide vocals</strong> if you want the original singer to help.</li>
            <li>Follow the bars in the pitch lane. Your voice is the dot.</li>
            <li><strong>Pause</strong> and click a line to see what it means and hear it.</li>
            <li>Short on time? Drag the slider, skip ahead, or pick a section to practise.</li>
            <li>Press <strong>End</strong> whenever you like. You are graded only on the lines you sang.</li>
          </ol>
        </aside>
      )}
    </main>
  );
}
