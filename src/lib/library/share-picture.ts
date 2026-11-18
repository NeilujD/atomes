// The share picture (ADR 0019, R4, R5): the numbers of the Statistics screen
// as a list of drawing steps (rectangles, text, radial gradients) with their
// positions in pixels and hex colours. Pure: the painter
// (src/islands/picture-painter.ts) runs the steps on a canvas, and gives the
// width of a text (`measure`), the one thing only a canvas knows. No cover
// and no title of a Work: only numbers, and the "Most read" Series when the
// reader leaves their names on. One fixed dark look (picture-colours.ts).
//
// The layout is the mock-up of the spec, drawn at 240 px wide for a Story
// (300 px for a Square): every size below is in those pixels, then scaled.
import { translator, type Language } from '../i18n/i18n';
import { pictureAlpha, pictureColours, pictureGlow, withAlpha } from './picture-colours';
import type { Period, Statistics } from './stats';

export const pictureFormats = ['story', 'square'] as const;
export type PictureFormat = (typeof pictureFormats)[number];

export interface TextStyle {
  // In pixels of the picture.
  size: number;
  weight: 500 | 600 | 700;
  // Letter spacing, in em.
  tracking: number;
}

// The width of a text in pixels of the picture, with its letter spacing.
export type Measure = (text: string, style: TextStyle) => number;

// Corners: top left, top right, bottom right, bottom left.
type Corners = [number, number, number, number];

export type Step =
  | { kind: 'rect'; x: number; y: number; width: number; height: number; radius: Corners; fill: string; stroke?: { color: string; width: number } }
  // `y` is the baseline. `maxWidth`: the painter squeezes a text wider than it.
  | { kind: 'text'; x: number; y: number; text: string; style: TextStyle; color: string; align: 'left' | 'center' | 'right'; maxWidth?: number }
  // A circle, its colour fading from the centre (`at` 0) to the edge (`at` 1).
  | { kind: 'gradient'; x: number; y: number; radius: number; stops: { at: number; color: string }[] };

// What the reader sees and picks: the numbers of the screen, the format, "Series names".
export interface PictureChoice {
  numbers: Statistics;
  period: Period;
  format: PictureFormat;
  language: Language;
  // "Series names": off, no Series name is on the picture.
  names: boolean;
}

export interface PictureInput extends PictureChoice {
  measure: Measure;
}

const sizes: Record<PictureFormat, { width: number; height: number; drawn: number }> = {
  story: { width: 1080, height: 1920, drawn: 240 },
  square: { width: 1080, height: 1080, drawn: 300 },
};

export function pictureSize(format: PictureFormat): { width: number; height: number } {
  const { width, height } = sizes[format];
  return { width, height };
}

export function pictureFileName(period: Period, format: PictureFormat): string {
  return `atomes-${period === 'all' ? 'all-time' : period}-${format}.png`;
}

// The Series on a Story with the names on, the most read first.
const mostReadRows = 3;
function seriesShown({ numbers, format, names }: PictureChoice): { name: string; value: number }[] {
  return format === 'story' && names ? numbers.mostRead.series.rows.slice(0, mostReadRows) : [];
}

// The text alternative of the preview: the numbers of the picture, and the Series it names.
export function pictureAlt(input: PictureChoice): string {
  const { numbers, period, language } = input;
  const year = period === 'all' ? undefined : String(period);
  return translator(language)(
    'picture.alt',
    numbers.read,
    year,
    numbers.added,
    numbers.followed,
    seriesShown(input).map(({ name }) => name),
  );
}

const pad = 18;
const ink = pictureColours.ink;
const heading = withAlpha(ink, pictureAlpha.textHeading);
const quiet = withAlpha(ink, pictureAlpha.textQuiet);

export function pictureSteps(input: PictureInput): Step[] {
  const { numbers, period, format, language, measure } = input;
  const t = translator(language);
  const numberFormat = new Intl.NumberFormat(language);
  const number = (value: number) => numberFormat.format(value);
  const story = format === 'story';
  const { width, height, drawn } = sizes[format];
  const unit = width / drawn;
  const wide = drawn - pad * 2;
  const steps: Step[] = [];

  // Every size in drawn pixels; the steps hold pixels of the picture.
  const style = (size: number, weight: TextStyle['weight'], tracking = 0): TextStyle => ({ size: size * unit, weight, tracking });
  const rect = (x: number, y: number, w: number, h: number, fill: string, radius: Corners = [0, 0, 0, 0], stroke?: { color: string; width: number }) =>
    steps.push({
      kind: 'rect',
      x: x * unit,
      y: y * unit,
      width: w * unit,
      height: h * unit,
      radius: radius.map((corner) => corner * unit) as Corners,
      fill,
      ...(stroke && { stroke: { color: stroke.color, width: stroke.width * unit } }),
    });
  const text = (x: number, y: number, value: string, textStyle: TextStyle, color: string, align: 'left' | 'center' | 'right' = 'left', room = wide) => {
    const maxWidth = room * unit;
    steps.push({ kind: 'text', x: x * unit, y: y * unit, text: fit(value, maxWidth, textStyle, measure, language), style: textStyle, color, align, maxWidth });
  };
  const glow = (x: number, y: number, radius: number, colour: string, opacity: number) =>
    steps.push({
      kind: 'gradient',
      x: x * unit,
      y: y * unit,
      radius: radius * unit,
      stops: [
        ...pictureGlow.stops.map((at, index) => ({ at, color: withAlpha(colour, pictureGlow.alphas[index] * opacity) })),
        { at: 1, color: withAlpha(colour, 0) },
      ],
    });

  rect(0, 0, drawn, height / unit, pictureColours.ground);
  glow(60, 70, 130, pictureColours.accentFill, pictureGlow.opacities[0]);
  glow(drawn - 20, 170, 110, pictureColours.accent, pictureGlow.opacities[2]);

  // The mark (src/components/Mark.astro): two ink books, the empty slot, the cobalt book.
  const mark = 13;
  const scale = mark / 584;
  const fills = [ink, ink, withAlpha(ink, pictureAlpha.shadeFaint), pictureColours.accent];
  fills.forEach((fill, at) => {
    const corner = 14 * scale;
    rect(pad + (16 + 152 * at) * scale, 20 + (mark - 552 * scale) / 2 + 16 * scale, 96 * scale, 520 * scale, fill, [corner, corner, corner, corner]);
  });
  text(pad + mark + 5, 20 + mark / 2 + 11 * 0.36, t('picture.brand'), style(11, 700, -0.02), ink, 'left', wide - mark - 5);

  // The period, the lead number and "read".
  let top = 20 + mark + (story ? 20 : 12);
  const caps = (value: string) => value.toLocaleUpperCase(language);
  text(pad, top + 9 * 0.8, caps(t('picture.period', period === 'all' ? undefined : String(period))), style(9, 500, 0.08), heading);
  top += 9 * 1.25;
  // A number is never cut: a wide one gets smaller.
  const shrunk = (value: string, size: number, weight: TextStyle['weight'], tracking: number, room: number): TextStyle => {
    const full = style(size, weight, tracking);
    const share = (room * unit) / measure(value, full);
    // Down to a hundredth of a pixel, so the smaller number still fits.
    return share >= 1 ? full : { ...full, size: Math.floor(full.size * share * 100) / 100 };
  };
  const lead = story ? 84 : 64;
  const read = number(numbers.read);
  text(pad, top + lead * 0.8, read, shrunk(read, lead, 700, -0.04, wide), ink);
  top += lead * 0.92;
  text(pad, top + 14 * 0.9, t('picture.read', numbers.read), style(14, 600), ink);
  top += 14 * 1.25;

  // Two tiles: Added and Series followed. A label takes two lines when it must.
  top += 16;
  const tile = (wide - 6) / 2;
  const tiles = [
    { value: numbers.added, label: wrap(t('picture.added', numbers.added), (tile - 16) * unit, style(8, 500), measure, language) },
    { value: numbers.followed, label: wrap(t('picture.followed', numbers.followed), (tile - 16) * unit, style(8, 500), measure, language) },
  ];
  const lines = Math.max(...tiles.map(({ label }) => label.length));
  const tileHeight = 8 + 17 * 1.05 + 3 + lines * 8 * 1.3 + 6;
  tiles.forEach(({ value, label }, at) => {
    const left = pad + at * (tile + 6);
    rect(left, top, tile, tileHeight, withAlpha(ink, pictureAlpha.fillCard), [8, 8, 8, 8], { color: withAlpha(ink, pictureAlpha.lineCard), width: 1 });
    text(left + 8, top + 8 + 17 * 0.85, number(value), shrunk(number(value), 17, 700, 0, tile - 16), ink, 'left', tile - 16);
    label.forEach((line, index) => text(left + 8, top + 8 + 17 * 1.05 + 3 + 8 * (1.3 * index + 1), line, style(8, 500), quiet, 'left', tile - 16));
  });
  top += tileHeight;

  // The columns of the reads, on a baseline; the tallest is the most read group.
  top += story ? 16 : 12;
  const chart = story ? 52 : 44;
  const groups = numbers.columns.groups;
  const gap = 4;
  const slot = groups.length === 0 ? 0 : Math.min((wide - gap * (groups.length - 1)) / groups.length, 24);
  const first = pad + (wide - (slot * groups.length + gap * Math.max(groups.length - 1, 0))) / 2;
  const most = Math.max(0, ...groups.map(({ read }) => read));
  const bottom = top + chart - 1;
  groups.forEach(({ read }, at) => {
    if (read === 0) return;
    const tall = (read / most) * (chart - 1);
    const corner = Math.min(2, tall, slot / 2);
    rect(first + at * (slot + gap), bottom - tall, slot, tall, ink, [corner, corner, 0, 0]);
  });
  rect(pad, bottom, wide, 1, withAlpha(ink, pictureAlpha.lineButton));
  top += chart;

  // Story: the month letters under the columns; by year, the first and the last year.
  if (story) {
    top += 3;
    groups.forEach(({ at }, index) => {
      if (numbers.columns.scale === 'year' && index !== 0 && index !== groups.length - 1) return;
      text(first + index * (slot + gap) + slot / 2, top + 7 * 0.9, groupLabel(at, language), style(7, 500), quiet, 'center', Math.max(slot + gap, 30));
    });
    top += 7 * 1.3;
  }

  // Story, names on: the Series read most.
  const rows = seriesShown(input);
  if (rows.length > 0) {
    top += 12;
    text(pad, top + 8 * 0.8, caps(t('stats.most-read')), style(8, 500, 0.08), heading);
    top += 8 * 1.2 + 6;
    for (const { name, value } of rows) {
      rect(pad, top, wide, 1, withAlpha(ink, pictureAlpha.lineCard));
      const figure = number(value);
      const figureWidth = measure(figure, style(10, 500)) / unit;
      text(pad, top + 4 + 10 * 0.85, name, style(10, 500), ink, 'left', wide - figureWidth - 12);
      text(pad + wide, top + 4 + 10 * 0.85, figure, style(10, 500), quiet, 'right', figureWidth + 1);
      top += 18;
    }
  }

  text(pad, height / unit - 16 - 8 * 0.2, t('picture.made-with'), style(8, 500), quiet);
  return steps;
}

// "2026-11": "N" in the language; "2026": the year.
function groupLabel(at: string, language: Language): string {
  if (at.length === 4) return at;
  const day = new Date(Date.UTC(Number(at.slice(0, 4)), Number(at.slice(5, 7)) - 1, 1));
  return new Intl.DateTimeFormat(language, { month: 'narrow', timeZone: 'UTC' }).format(day);
}

// The text, or as much of it as fits, cut at a letter (a grapheme) with an ellipsis.
function fit(text: string, room: number, style: TextStyle, measure: Measure, language: Language): string {
  if (measure(text, style) <= room) return text;
  const letters = Array.from(new Intl.Segmenter(language, { granularity: 'grapheme' }).segment(text), ({ segment }) => segment);
  for (let kept = letters.length - 1; kept > 0; kept -= 1) {
    const cut = `${letters.slice(0, kept).join('').trimEnd()}…`;
    if (measure(cut, style) <= room) return cut;
  }
  return '…';
}

// At most two lines, cut between words; what does not fit ends with an ellipsis.
function wrap(text: string, room: number, style: TextStyle, measure: Measure, language: Language): string[] {
  const lines: string[] = [];
  const words = text.split(' ');
  while (words.length > 0 && lines.length < 2) {
    let line = words.shift()!;
    while (words.length > 0 && measure(`${line} ${words[0]}`, style) <= room) line = `${line} ${words.shift()}`;
    lines.push(line);
  }
  if (words.length > 0) lines[1] = `${lines[1]} ${words.join(' ')}`;
  return lines.map((line) => fit(line, room, style, measure, language));
}
