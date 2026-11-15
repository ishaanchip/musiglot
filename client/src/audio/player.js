// Song playback with an optional guide (the original singer).
//
// The instrumental is always the clock. A second element carries the guide:
// the full mix when the song has one, otherwise the isolated vocal stem.
//   guide off -> you hear the instrumental only
//   guide on  -> full mix (instrumental muted), or instrumental + vocal stem
// Both elements always run together, so the guide can be switched mid-song.
const MAX_DRIFT_SEC = 0.07;

export class SongPlayer {
  constructor(audio, { onEnded, onError } = {}) {
    this.hasFullMix = Boolean(audio.full);
    this.backing = new Audio(audio.instrumental);
    this.guide = new Audio(audio.full || audio.vocals);
    for (const el of [this.backing, this.guide]) el.preload = 'auto';
    this.backing.addEventListener('ended', () => {
      this.guide.pause();
      onEnded?.();
    });
    this.backing.addEventListener('error', () => onError?.('Could not load the backing track for this song.'));
    // A missing guide should not stop anyone from singing.
    this.guide.addEventListener('error', () => {
      this.guideBroken = true;
      this.setGuide(false);
    });
    this.setGuide(false);
  }

  get currentTime() {
    return this.backing.currentTime;
  }

  setGuide(on) {
    const audible = on && !this.guideBroken;
    this.guide.muted = !audible;
    this.backing.muted = audible && this.hasFullMix;
    if (audible) this.resync(true);
  }

  /** Pull the guide back onto the instrumental's clock if it has drifted. */
  resync(force = false) {
    if (this.guideBroken) return;
    if (force || Math.abs(this.guide.currentTime - this.backing.currentTime) > MAX_DRIFT_SEC) {
      this.guide.currentTime = this.backing.currentTime;
    }
  }

  async play() {
    this.resync(); // only seek when actually out of step: a seek delays that track's start
    // Start both in the same tick so they stay together (matters when the
    // instrumental and the vocal stem are both audible).
    const backing = this.backing.play();
    if (!this.guideBroken) this.guide.play().catch(() => {});
    await backing;
    clearInterval(this.timer);
    this.timer = setInterval(() => this.resync(), 1000);
  }

  pause() {
    clearInterval(this.timer);
    this.backing.pause();
    this.guide.pause();
    this.resync(true); // seeking is free while paused, so the next play starts lined up
  }

  rewind() {
    this.pause();
    this.backing.currentTime = 0;
    if (!this.guideBroken) this.guide.currentTime = 0;
  }

  destroy() {
    this.pause();
    this.backing.removeAttribute('src');
    this.guide.removeAttribute('src');
  }
}
