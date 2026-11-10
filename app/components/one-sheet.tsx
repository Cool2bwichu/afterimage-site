'use client';

import { useEffect, useRef, useState } from 'react';
import { billingBlock, sheetDescription, sheetFilename, sheetNumber, type OneSheetData } from '../lib/one-sheet';
import { facetWords, plateDesign, plateSvg, reelMotifs, type PlateShape } from '../lib/plate';
import { saveFile } from '../lib/save-file';
import { fontFamily, spaced, wrap } from './star-chart';

const WIDTH = 1080;
const HEIGHT = 1620;
const IVORY = '#f4efe5';
const GOLD = '#dec6a0';

function loadPlate(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('A plate could not be drawn.'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/** One branch of a laurel wreath: leaves along an arc, opening upward. */
function laurel(context: CanvasRenderingContext2D, cx: number, cy: number, radius: number, side: 1 | -1) {
  for (let leaf = 0; leaf < 9; leaf += 1) {
    const angle = Math.PI / 2 + side * (0.28 + leaf * 0.27);
    const x = cx + Math.cos(angle) * radius, y = cy + Math.sin(angle) * radius;
    context.save();
    context.translate(x, y);
    context.rotate(angle + side * (Math.PI / 2 - 0.55));
    context.beginPath();
    context.ellipse(0, 0, radius * (0.2 - leaf * 0.006), radius * 0.075, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
}

/** Draws the poster. The plates are the films' own; the type is the site's. */
export async function renderOneSheet(data: OneSheetData): Promise<HTMLCanvasElement> {
  const display = fontFamily('--font-display', 'Georgia, serif');
  const sans = fontFamily('--font-sans', 'system-ui, sans-serif');
  await Promise.all([
    document.fonts.load(`italic 400 150px ${display}`), document.fonts.load(`400 40px ${display}`),
    document.fonts.load(`500 20px ${sans}`), document.fonts.load(`700 20px ${sans}`),
  ]).catch(() => undefined);

  const films = data.films.slice(0, 5);
  const motifs = reelMotifs(films.map(film => ({ title: film.title, year: film.year, words: facetWords(film.facets) })));
  const input = (index: number) => ({ title: films[index].title, year: films[index].year, palette: data.palette, words: facetWords(films[index].facets), index, motif: motifs[index] });
  const plate = (index: number, shape: PlateShape) => loadPlate(plateSvg(input(index), { shape, id: `sheet${index}${shape}`, offset: false }));
  const [hero, ...frames] = await Promise.all([plate(0, 'square'), ...films.map((_, index) => plate(index, 'wide'))]);
  const design = plateDesign(input(0));

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH; canvas.height = HEIGHT;
  const context = canvas.getContext('2d')!;
  context.fillStyle = design.ground;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  // The first film's plate is the picture, hung below the laurels and fading into the sheet.
  const heroTop = 200;
  context.drawImage(hero, 0, heroTop, WIDTH, WIDTH);
  const fade = context.createLinearGradient(0, heroTop + 560, 0, heroTop + WIDTH);
  fade.addColorStop(0, `${design.ground}00`); fade.addColorStop(0.7, design.ground); fade.addColorStop(1, design.ground);
  context.fillStyle = fade; context.fillRect(0, heroTop + 560, WIDTH, WIDTH - 560 + 2);
  const top = context.createLinearGradient(0, heroTop, 0, heroTop + 260);
  top.addColorStop(0, design.ground); top.addColorStop(1, `${design.ground}00`);
  context.fillStyle = top; context.fillRect(0, heroTop - 1, WIDTH, 262);

  // Presented by, and the reel's three sensibilities as festival laurels.
  context.textAlign = 'center';
  context.fillStyle = IVORY;
  context.font = `500 19px ${sans}`;
  spaced(context, 'AFTERIMAGE PRESENTS', WIDTH / 2, 84, 9);
  const laurels = data.sensibilities.slice(0, 3);
  laurels.forEach((words, index) => {
    const cx = WIDTH / 2 + (index - (laurels.length - 1) / 2) * 300, cy = 180;
    context.fillStyle = GOLD; context.globalAlpha = 0.92;
    laurel(context, cx, cy - 6, 62, 1); laurel(context, cx, cy - 6, 62, -1);
    context.globalAlpha = 1; context.fillStyle = IVORY;
    context.font = `700 13px ${sans}`;
    const lines = wrap(context, words.toLocaleUpperCase(), 84, 3);
    lines.forEach((line, row) => spaced(context, line, cx, cy - (lines.length - 1) * 9 + row * 18, 1.6));
  });

  // The title: the reel's name, as large as the sheet allows.
  context.fillStyle = IVORY;
  let size = 168;
  let title: string[] = [];
  for (; size >= 84; size -= 6) {
    context.font = `italic 400 ${size}px ${display}`;
    title = wrap(context, data.persona, 960, 2);
    if (title.join(' ').replace(/…$/, '') === data.persona.trim().replace(/\s+/g, ' ') && title.every(line => context.measureText(line).width <= 960)) break;
  }
  const titleTop = 1092 - title.length * size * 0.9;
  context.save();
  context.shadowColor = '#000a'; context.shadowBlur = 30;
  title.forEach((line, row) => context.fillText(line, WIDTH / 2, titleTop + (row + 1) * size * 0.9));
  context.restore();
  context.fillStyle = '#e9e1d1';
  context.font = `italic 400 31px ${display}`;
  wrap(context, data.insight, 880, 2).forEach((line, row) => context.fillText(line, WIDTH / 2, 1160 + row * 40));

  // The five films as a strip of frames, sprocket holes and all.
  const stripTop = 1246, stripHeight = 156, frameWidth = 184, frameHeight = 100, gap = 16;
  context.fillStyle = '#05080dcc';
  context.fillRect(0, stripTop, WIDTH, stripHeight);
  context.fillStyle = design.ground;
  for (let x = 14; x < WIDTH; x += 36) { context.fillRect(x, stripTop + 9, 18, 12); context.fillRect(x, stripTop + stripHeight - 21, 18, 12); }
  const stripLeft = (WIDTH - (frameWidth * films.length + gap * (films.length - 1))) / 2;
  frames.forEach((frame, index) => context.drawImage(frame, stripLeft + index * (frameWidth + gap), stripTop + 28, frameWidth, frameHeight));
  context.font = `500 14px ${sans}`;
  films.forEach((film, index) => {
    const cx = stripLeft + index * (frameWidth + gap) + frameWidth / 2;
    context.fillStyle = GOLD;
    context.font = `500 12px ${sans}`;
    spaced(context, `${String(index + 1).padStart(2, '0')} · ${film.year}`, cx, stripTop + stripHeight + 28, 2);
    context.fillStyle = IVORY;
    context.font = `400 22px ${display}`;
    wrap(context, film.title, frameWidth + 8, 2).forEach((line, row) => context.fillText(line, cx, stripTop + stripHeight + 54 + row * 23));
  });

  // The billing block: tall, narrow names, with small words leading into each.
  const runs = billingBlock({ persona: data.persona, director: data.director, films });
  const squeeze = 0.5, tall = 34, small = 15, limit = 940 / squeeze;
  const measure = (run: { text: string; small: boolean }) => { context.font = run.small ? `500 ${small}px ${sans}` : `700 ${tall}px ${sans}`; return context.measureText(run.text).width + (run.small ? 12 : 18); };
  // Small words stay on the line of the name they lead into.
  const groups: Array<{ runs: typeof runs; width: number }> = [];
  for (const run of runs) {
    const last = groups[groups.length - 1];
    if (last && last.runs[last.runs.length - 1].small) { last.runs.push(run); last.width += measure(run); }
    else groups.push({ runs: [run], width: measure(run) });
  }
  const rows: Array<{ runs: typeof runs; width: number }> = [{ runs: [], width: 0 }];
  for (const group of groups) {
    let row = rows[rows.length - 1];
    if (row.width + group.width > limit && row.runs.length) { row = { runs: [], width: 0 }; rows.push(row); }
    row.runs.push(...group.runs); row.width += group.width;
  }
  context.save();
  context.textAlign = 'left';
  context.fillStyle = '#cfc7b8';
  rows.slice(0, 3).forEach((row, line) => {
    context.save();
    context.translate(WIDTH / 2 - (row.width * squeeze) / 2, 1538 + line * 38 - (Math.min(rows.length, 2) - 1) * 19);
    context.scale(squeeze, 1);
    let x = 0;
    for (const run of row.runs) {
      context.font = run.small ? `500 ${small}px ${sans}` : `700 ${tall}px ${sans}`;
      context.fillText(run.text, x, run.small ? -11 : 0);
      x += measure(run);
    }
    context.restore();
  });
  context.restore();

  const developed = (data.developedAt ?? new Date()).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  context.fillStyle = '#a7b6c5';
  context.font = `500 11px ${sans}`;
  context.textAlign = 'center';
  spaced(context, `ONE-SHEET No. ${sheetNumber(data.seed)} · DEVELOPED ${developed.toLocaleUpperCase()} · FIVE FILMS, NEVER A FEED`, WIDTH / 2, HEIGHT - 36, 2.4);
  context.strokeStyle = `${GOLD}55`; context.lineWidth = 1;
  context.strokeRect(22.5, 22.5, WIDTH - 45, HEIGHT - 45);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The one-sheet could not be drawn.')), 'image/png'));
}

/** The reel's poster, shown large, with a way to keep it. */
export function OneSheet({ data, opener, onClose, onNotice }: { data: OneSheetData | null; opener: HTMLElement | null; onClose: () => void; onNotice: (message: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [picture, setPicture] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const open = Boolean(data);

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    heading.current?.focus();
    return () => { if (element?.open) element.close(); if (opener?.isConnected) opener.focus(); };
  }, [open, opener]);

  useEffect(() => {
    if (!data) return;
    let current = true;
    renderOneSheet(data).then(drawn => { if (!current) return; canvas.current = drawn; setPicture(drawn.toDataURL('image/jpeg', 0.9)); })
      .catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [data]);

  if (!data) return null;
  async function save() {
    if (!canvas.current || !data || saving) return;
    setSaving(true);
    try {
      const blob = await toBlob(canvas.current);
      const name = sheetFilename(data.persona);
      const file = new File([blob], name, { type: 'image/png' });
      if (window.matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: `${data.persona} · AFTERIMAGE` }); onNotice('Your one-sheet is ready to share.'); return; }
        catch (reason) { if (reason instanceof DOMException && reason.name === 'AbortError') return; }
      }
      if (await saveFile(name, blob) !== 'cancelled') onNotice('Your one-sheet has been saved as an image.');
    } catch { onNotice('The one-sheet could not be saved in this browser.'); }
    finally { setSaving(false); }
  }
  return <dialog ref={dialog} className="one-sheet" aria-labelledby="one-sheet-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === dialog.current) onClose(); }}>
    <div className="one-sheet-body">
      <div className="one-sheet-poster">
        {/* A picture drawn on a canvas in this browser; there is nothing for an image optimiser to fetch. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {picture ? <img src={picture} alt={sheetDescription(data)} width={WIDTH} height={HEIGHT} />
          : <p role="status">{failed ? 'The one-sheet could not be drawn in this browser.' : 'Printing the one-sheet…'}</p>}
      </div>
      <div className="one-sheet-side">
        <p className="one-sheet-kicker">The one-sheet</p>
        <h2 id="one-sheet-title" ref={heading} tabIndex={-1}>{data.persona}</h2>
        <p>Every reel gets a poster. The picture is the plate of its first film, the laurels are its three sensibilities, and the credits at the foot bill its five films the way a cinema would.</p>
        <p className="one-sheet-fine">Drawn in this browser from the reel itself. No film’s own artwork is used.</p>
        <div className="one-sheet-actions">
          <button type="button" className="one-sheet-save" disabled={!picture || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save the one-sheet'} <span aria-hidden="true">↓</span></button>
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  </dialog>;
}
