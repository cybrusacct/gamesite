/* Play short sound effects from public/assets folder.
   Expected files (place in client/public/assets):
     - pass.mp3
     - match-start.mp3
     - match-end.mp3
     - signal.mp3
     - kick.mp3
     - suspect.mp3
     - jackwhot-false.mp3

   Usage: import { playPass, playSignal, ... } from '../utils/sounds'
   The code falls back gracefully if audio cannot be played.
*/

const audioFiles = {
  pass: "/assets/pass.mp3",
  "match-start": "/assets/match-start.mp3",
  "match-end": "/assets/match-end.mp3",
  signal: "/assets/signal.mp3",
  kick: "/assets/kick.mp3",
  suspect: "/assets/suspect.mp3",
  "jackwhot-false": "/assets/jackwhot-false.mp3",
};

function playUrl(url) {
  try {
    const a = new Audio(url);
    a.volume = 0.9;
    // Play returns a promise; swallow rejections
    a.play && a.play().catch(() => {});
  } catch (e) {
    // ignore
  }
}

export function playPass() { playUrl(audioFiles.pass); }
export function playMatchStart() { playUrl(audioFiles["match-start"]); }
export function playMatchEnd() { playUrl(audioFiles["match-end"]); }
export function playSignal() { playUrl(audioFiles.signal); }
export function playKick() { playUrl(audioFiles.kick); }
export function playSuspect() { playUrl(audioFiles.suspect); }
export function playJackwhotFalse() { playUrl(audioFiles["jackwhot-false"]); }