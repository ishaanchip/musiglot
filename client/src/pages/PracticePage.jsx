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

  // The song reached its end: a preview just rewinds, a take gets scored.
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    if (!song) return undefined;
    const player = new SongPlayer(song.audio, {
      onError: setError,
      onEnded: () => {
        if (phaseRef.current === 'listening') {
          player.rewind();
          setTime(0);
          setPhase('idle');
        } else {
          finishRef.current();
        }
      },
    });
    playerRef.current = player;
    return () => {
      player.destroy();
      playerRef.current = null;
    };
  }, [song]);

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
      setTime(getTime());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, getTime]);

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
      if (listening) {
        // A take always starts from the top, whatever was being previewed.
        player.rewind();
        setTime(0);
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
            <p className="muted">{song.artist}</p>
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
          <span className="muted clock">{formatDuration(time)} / {formatDuration(song.durationSec)}</span>
          <span className="status" role="status">
            {phase === 'listening' && 'Listening to the original. Nothing is being recorded.'}
            {phase === 'listenPaused' && 'Paused. Click any line to study it.'}
            {phase === 'playing' && <><i className="rec-dot" /> Recording</>}
            {phase === 'paused' && 'Paused. Click any line to study it.'}
            {phase === 'scoring' && 'Scoring your take…'}
          </span>
        </div>

        <label className={`toggle ${listening ? 'disabled' : ''}`}>
          <input type="checkbox" checked={listening || guideOn} disabled={listening || phase === 'scoring'} onChange={(e) => toggleGuide(e.target.checked)} />
          <span>
            <strong>Guide vocals</strong>
            <small className="muted">
              {listening
                ? 'Always on while you listen. This switch applies when you sing.'
                : guideOn
                  ? 'You will hear the original singer while you sing. Easier to follow along.'
                  : 'Backing track only while you sing. Turn on to hear the original singer.'}
            </small>
          </span>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      {selectedLine ? (
        <LinePanel line={selectedLine} song={song} onClose={() => setSelected(null)} />
      ) : (
        <aside className="card line-panel hint">
          <h3>How it works</h3>
          <ol>
            <li><strong>Listen first</strong> to hear the original with the lyrics lighting up. Nothing is recorded.</li>
            <li>Press <strong>Start singing</strong> and sing along as each line lights up. Switch on <strong>Guide vocals</strong> if you want the original singer to help.</li>
            <li>Follow the bars in the pitch lane. Your voice is the dot.</li>
            <li><strong>Pause</strong> and click a line to see what it means and hear it.</li>
            <li>Press <strong>End</strong> (or sing to the end) to get your grades.</li>
          </ol>
        </aside>
      )}
    </main>
  );
}
