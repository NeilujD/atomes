// Reads book barcodes from the camera, on the device: no picture leaves the
// phone (ADR 0003). Spike 0002 §3: the native BarcodeDetector when it reads
// EAN-13 (Android Chrome, macOS Chrome), else the same API from
// `barcode-detector` (zxing-wasm; always on iPhone). The wasm comes from our
// origin, never a CDN. It is a built asset in `_astro/`, so the service worker
// precaches it and the first scan works offline.
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

interface NativeDetector {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
}

// Books carry their ISBN as an EAN-13. Fewer formats, faster decoding.
const formats: ['ean_13'] = ['ean_13'];

let detector: Promise<Detector> | undefined;

function bookDetector(): Promise<Detector> {
  detector ??= createDetector().catch((error: unknown) => {
    detector = undefined;
    throw error;
  });
  return detector;
}

async function createDetector(): Promise<Detector> {
  const native = (globalThis as { BarcodeDetector?: NativeDetector }).BarcodeDetector;
  if (native && (await native.getSupportedFormats()).includes('ean_13')) return new native({ formats });
  const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill');
  prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
  });
  return new BarcodeDetector({ formats });
}

// The back camera. iPhones cannot focus close up (no `focusMode`): a 2× zoom
// lets the reader hold the book further away, in focus.
export async function openCamera(): Promise<MediaStream> {
  void bookDetector().catch(() => undefined); // load while the reader answers the permission prompt
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  const [track] = stream.getVideoTracks();
  const zoom = (track?.getCapabilities?.() as { zoom?: { max: number } } | undefined)?.zoom;
  if (track && zoom) {
    const constraint = { zoom: Math.min(2, zoom.max) } as MediaTrackConstraintSet;
    await track.applyConstraints({ advanced: [constraint] }).catch(() => undefined);
  }
  return stream;
}

export type CameraProblem = 'refused' | 'no-camera' | 'failed';

export function cameraProblem(error: unknown): CameraProblem {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'refused';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no-camera';
  return 'failed';
}

export const cameraProblemText: Record<CameraProblem, string> = {
  refused: 'Atomes may not use the camera. Type the ISBN, or allow the camera in your browser settings.',
  'no-camera': 'No camera found. Type the ISBN.',
  failed: 'The camera did not start. Type the ISBN.',
};

// Reads what the video shows, a few times a second, until `onBarcode` returns
// true or `signal` aborts.
export async function watchBarcodes(
  video: HTMLVideoElement,
  onBarcode: (text: string) => boolean,
  signal: AbortSignal,
): Promise<void> {
  const reader = await bookDetector();
  while (!signal.aborted) {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const barcodes = await reader.detect(video);
      if (signal.aborted || barcodes.some((barcode) => onBarcode(barcode.rawValue))) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
