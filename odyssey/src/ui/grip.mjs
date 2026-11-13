// A phone sheet's grip. A tap makes the sheet taller or shorter, as before;
// a drag moves its top edge with the finger. Let go high and it stays tall,
// low and it settles back to its usual height, lower still (or flung down)
// and it closes. Extra handles, such as a panel's header, drag the same way
// but leave their own buttons alone.
const TALL_GAP = 110; // .sheet.tall is the whole screen less this (styles.css)
const SHORT = 0.56; // .sheet is this much of the screen on a phone (styles.css)
const CONTROLS = 'button, a, input, select, textarea';

export function createGrip({ sheet, grip, handles = [], onResize, onClose }) {
  let drag = null;
  let swallowUntil = 0;

  grip.addEventListener('click', () => {
    if (performance.now() < swallowUntil) return;
    sheet.classList.toggle('tall');
    onResize();
  });

  function down(event) {
    if (drag || !grip.getClientRects().length) return; // the grip only shows on phones
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const control = event.target.closest(CONTROLS);
    if (control && control !== grip) return;
    drag = {
      id: event.pointerId,
      from: event.clientY,
      height: sheet.getBoundingClientRect().height,
      room: sheet.parentElement.getBoundingClientRect().height,
      moved: false,
      trail: [[event.timeStamp, event.clientY]],
      handle: event.currentTarget,
    };
    drag.handle.setPointerCapture?.(event.pointerId);
  }

  function move(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const dy = event.clientY - drag.from;
    if (!drag.moved) {
      if (Math.abs(dy) < 6) return;
      drag.moved = true;
      sheet.classList.add('dragging');
    }
    drag.trail.push([event.timeStamp, event.clientY]);
    if (drag.trail.length > 6) drag.trail.shift();
    const height = Math.max(48, Math.min(drag.room - TALL_GAP, drag.height - dy));
    sheet.style.height = `${height}px`;
  }

  function settle() {
    sheet.classList.remove('dragging');
    sheet.style.height = '';
  }

  function up(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const { moved, trail, room, handle } = drag;
    drag = null;
    if (handle.hasPointerCapture?.(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    if (!moved) return; // a tap: the grip's click handles it
    swallowUntil = performance.now() + 400;
    const height = sheet.getBoundingClientRect().height;
    const [t0, y0] = trail[0];
    const [t1, y1] = trail[trail.length - 1];
    const speed = t1 > t0 ? (y1 - y0) / (t1 - t0) : 0; // pixels a millisecond, downward
    const landing = height - speed * 220;
    const short = room * SHORT;
    if (event.type === 'pointerup' && landing < short * 0.62) {
      // Gone: it slides the rest of the way down before it closes.
      sheet.classList.remove('dragging');
      sheet.style.transition = 'transform 0.22s ease-in, opacity 0.22s ease-in';
      sheet.style.transform = 'translateY(100%)';
      sheet.style.opacity = '0';
      setTimeout(() => {
        onClose();
        sheet.style.transition = '';
        sheet.style.transform = '';
        sheet.style.opacity = '';
        sheet.style.height = '';
      }, 220);
      return;
    }
    const tall = landing > (short + room - TALL_GAP) / 2;
    const changed = tall !== sheet.classList.contains('tall');
    sheet.classList.toggle('tall', tall);
    settle();
    if (changed) onResize();
  }

  for (const handle of [grip, ...handles]) {
    handle.addEventListener('pointerdown', down);
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }
}
