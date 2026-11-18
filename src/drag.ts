// Tiny pointer-based drag and drop that works with mouse and touch.
// Mouse: drag starts after moving 6px. Touch: press and hold ~300ms, then drag (a quick swipe still scrolls).
// Drop targets are any element with a data-drop="..." attribute.
import { useRef } from 'react';

type Drop = (target: string) => void;

function begin(e: React.PointerEvent<HTMLElement>, onDrop: Drop) {
  if (e.button !== 0) return;
  const el = e.currentTarget;
  const touch = e.pointerType !== 'mouse';
  const sx = e.clientX, sy = e.clientY;
  let x = sx, y = sy;
  let dragging = false;
  let ghost: HTMLElement | null = null;
  let over: HTMLElement | null = null;
  let dx = 0, dy = 0;
  let timer = 0;

  const start = () => {
    dragging = true;
    const r = el.getBoundingClientRect();
    dx = sx - r.left; dy = sy - r.top;
    ghost = el.cloneNode(true) as HTMLElement;
    ghost.classList.add('drag-ghost');
    Object.assign(ghost.style, { width: `${r.width}px`, left: '0px', top: '0px' });
    document.body.appendChild(ghost);
    el.classList.add('drag-src');
    document.body.classList.add('is-dragging');
    if (touch) navigator.vibrate?.(15);
    move();
  };
  const move = () => {
    if (!ghost) return;
    ghost.style.transform = `translate(${x - dx}px, ${y - dy}px) rotate(2deg)`;
    const t = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-drop]') ?? null;
    if (t !== over) { over?.classList.remove('drop-over'); t?.classList.add('drop-over'); over = t; }
    // auto-scroll near the screen edges
    if (y < 60) window.scrollBy(0, -12); else if (y > window.innerHeight - 90) window.scrollBy(0, 12);
  };
  const onMove = (ev: PointerEvent) => {
    x = ev.clientX; y = ev.clientY;
    const dist = Math.hypot(x - sx, y - sy);
    if (!dragging) {
      if (touch) { if (dist > 8) cleanup(); }   // user is scrolling
      else if (dist > 6) start();
      return;
    }
    move();
  };
  const onTouchMove = (ev: TouchEvent) => { if (dragging) ev.preventDefault(); };
  const onUp = () => {
    const target = dragging ? over?.dataset.drop : undefined;
    const wasDragging = dragging;
    cleanup();
    if (wasDragging) {
      // swallow the click that follows a drag
      const stop = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 50);
      if (target) onDrop(target);
    }
  };
  const onCancel = () => cleanup();
  const noMenu = (ev: Event) => ev.preventDefault();

  function cleanup() {
    clearTimeout(timer);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('touchmove', onTouchMove);
    el.removeEventListener('contextmenu', noMenu);
    ghost?.remove(); ghost = null;
    over?.classList.remove('drop-over'); over = null;
    el.classList.remove('drag-src');
    document.body.classList.remove('is-dragging');
    dragging = false;
  }

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  if (touch) { el.addEventListener('contextmenu', noMenu); timer = window.setTimeout(start, 300); }
}

/** `const drag = useDrag((id, target) => ...)`, then spread `{...drag(id)}` on each draggable element. */
export function useDrag(onDrop: (id: string, target: string) => void) {
  const cb = useRef(onDrop);
  cb.current = onDrop;
  return (id: string) => ({
    'data-drag': '',
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => begin(e, (target) => cb.current(id, target)),
  });
}
