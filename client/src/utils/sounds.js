/*
  Small sound helpers for suspect / jackwhot / match end events.
  Uses WebAudio API.
*/
export function playTone(freq = 440, duration = 150) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration / 1000);
    setTimeout(() => { try { o.stop(); } catch (e) {} }, duration + 30);
  } catch (e) {
    // ignore on unsupported platforms
  }
}

export function playSuspect() { playTone(520, 180); }
export function playSignal() { playTone(660, 120); }
export function playJackwhotFalse() { playTone(220, 400); }
export function playMatchEnd() { playTone(880, 200); }