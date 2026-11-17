// How finely the moving sky is drawn, judged from how far apart its frames come.
//
// Where the graphics cannot keep up at full sharpness (a phone, deep in a galaxy, with every glow and grain
// of dust close by), the sky is drawn a step coarser until they can: its lights are soft, so it hardly
// shows. Finer is tried again once frames come easily, and a step that could not be kept is tried again
// only much later. A device that holds its frames back anyway (a phone saving its battery shows thirty a
// second whatever is drawn) is noticed, because a coarser sky is no quicker there, and it is left sharp.

/** Canvas pixels per finest pixel, step by step. */
export const STEPS = [1, 0.86, 0.74, 0.64];
/** Frames weighed together before anything is decided. */
export const WINDOW = 40;
const EASY = 18.5; // ms apart: frames that come easily (about 54 a second)
const SLOW = 21;   // ms apart: frames that come slowly (fewer than about 48 a second)

export function createSharpness({ onChange = () => {} } = {}) {
  const coarsest = STEPS.length - 1;
  let step = 0;
  let calm = 0;        // windows of easy frames in a row
  let trial = -1;      // a finer step just taken, still on trial
  let refused = -1;    // a finer step that was tried and could not be kept
  let slowAt = SLOW;   // raised on a device that holds its frames back
  let before = 0;      // how far apart frames came at the finest step, when it was left
  const atCoarsest = []; // the last windows weighed at the coarsest step
  const gaps = [];

  function go(next) {
    step = next;
    calm = 0;
    gaps.length = 0;
    onChange(step);
  }

  return {
    get step() { return step; },
    get scale() { return STEPS[step]; },
    /** Forgets the frames weighed so far: the canvas changed, or the frames stopped counting. */
    forget() { gaps.length = 0; },
    /** One more frame of the moving sky, drawn `gap` ms after the one before. */
    frame(gap) {
      gaps.push(gap);
      if (gaps.length < WINDOW) return;
      gaps.sort((a, b) => a - b);
      const typical = gaps[Math.floor(gaps.length / 2)];
      gaps.length = 0;
      const slow = typical > slowAt;
      if (typical < EASY) slowAt = SLOW; // whatever held the frames back has let go
      if (slow && step === 0) before = typical;
      if (step !== coarsest) atCoarsest.length = 0;
      else if (slow) {
        atCoarsest.push(typical);
        if (atCoarsest.length > 2) atCoarsest.shift();
      }
      if (atCoarsest.length === 2 && Math.min(...atCoarsest) > before * 0.85) {
        // As coarse as it goes, twice over, and hardly quicker than at the finest: the frames are being held
        // back, not slowed by the drawing. Sharp again, and only frames slower than these count as slow.
        atCoarsest.length = 0;
        slowAt = Math.max(SLOW, before * 1.2);
        trial = -1;
        refused = -1;
        go(0);
        return;
      }
      if (slow && step < coarsest) {
        if (trial === step) refused = step;
        trial = -1;
        go(step + 1);
        return;
      }
      if (!slow) trial = -1; // the step held
      if (typical < EASY && step > 0) {
        calm += 1;
        if (calm >= (step - 1 === refused ? 14 : 5)) {
          const finer = step - 1;
          go(finer);
          trial = finer;
        }
      } else calm = 0;
    },
  };
}
