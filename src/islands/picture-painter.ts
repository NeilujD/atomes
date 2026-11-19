// Runs the drawing steps of the share picture (src/lib/library/share-picture.ts)
// on a canvas, once the font is loaded, then makes its PNG. Only text,
// rectangles and gradients: no picture from elsewhere, so the canvas is never
// tainted and toBlob always works. Nothing leaves the device.
import { pictureSize, pictureSteps, type PictureChoice, type Step, type TextStyle } from '../lib/library/share-picture';

// The font of the app (theme.css --font), self-hosted, so it works offline.
const family = '"Schibsted Grotesk Variable", "Schibsted Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif';
const font = ({ weight, size }: TextStyle) => `${weight} ${size}px ${family}`;

// Letter spacing, where the canvas has it (not every Safari): else none, and
// the measure agrees with what is drawn.
function applyText(context: CanvasRenderingContext2D, style: TextStyle) {
  context.font = font(style);
  if ('letterSpacing' in context) context.letterSpacing = `${style.tracking * style.size}px`;
}

// The canvas should be one the page does not show, read on the CPU
// (willReadFrequently): its PNG then needs no read back from the GPU, which
// stalled the screen of an Android phone (SharePicture.tsx).
export async function paintPicture(canvas: HTMLCanvasElement, input: PictureChoice): Promise<void> {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('No 2D canvas');
  // The font files of the letters on the picture: a guess at their widths is enough to list them.
  const letters = pictureSteps({ ...input, measure: (text, style) => text.length * style.size })
    .flatMap((step) => (step.kind === 'text' ? [step.text] : []))
    .join('');
  await Promise.all(([500, 600, 700] as const).map((weight) => document.fonts.load(font({ weight, size: 16, tracking: 0 }), letters)));
  await document.fonts.ready;

  const { width, height } = pictureSize(input.format);
  canvas.width = width;
  canvas.height = height;
  const measure = (text: string, style: TextStyle) => {
    applyText(context, style);
    return context.measureText(text).width;
  };
  for (const step of pictureSteps({ ...input, measure })) paint(context, step);
}

function paint(context: CanvasRenderingContext2D, step: Step) {
  switch (step.kind) {
    case 'rect': {
      roundedRect(context, step.x, step.y, step.width, step.height, step.radius);
      context.fillStyle = step.fill;
      context.fill();
      if (step.stroke) {
        // Inside the rectangle, as a CSS border.
        const half = step.stroke.width / 2;
        roundedRect(
          context,
          step.x + half,
          step.y + half,
          step.width - step.stroke.width,
          step.height - step.stroke.width,
          step.radius.map((corner) => Math.max(0, corner - half)),
        );
        context.strokeStyle = step.stroke.color;
        context.lineWidth = step.stroke.width;
        context.stroke();
      }
      return;
    }
    case 'text':
      applyText(context, step.style);
      context.fillStyle = step.color;
      context.textAlign = step.align;
      context.textBaseline = 'alphabetic';
      context.fillText(step.text, step.x, step.y, step.maxWidth);
      return;
    case 'gradient': {
      const gradient = context.createRadialGradient(step.x, step.y, 0, step.x, step.y, step.radius);
      for (const { at, color } of step.stops) gradient.addColorStop(at, color);
      context.fillStyle = gradient;
      context.fillRect(step.x - step.radius, step.y - step.radius, step.radius * 2, step.radius * 2);
      return;
    }
  }
}

// A path with its own corners: roundRect() is missing before Safari 16.
function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, [tl, tr, br, bl]: number[]) {
  context.beginPath();
  context.moveTo(x + tl, y);
  context.arcTo(x + width, y, x + width, y + height, tr);
  context.arcTo(x + width, y + height, x, y + height, br);
  context.arcTo(x, y + height, x, y, bl);
  context.arcTo(x, y, x + width, y, tl);
  context.closePath();
}

// The PNG of the canvas.
export function pictureBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No PNG'))), 'image/png'));
}
