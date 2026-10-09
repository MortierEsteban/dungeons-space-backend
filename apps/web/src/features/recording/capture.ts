/**
 * Capture du son de la table, sans dépendance au framework :
 * - `SpeechCapture` transcrit en continu avec la reconnaissance vocale du navigateur (Web Speech API),
 *   et redémarre d'elle-même (le navigateur coupe après un silence ou au bout d'une minute) ;
 * - `AudioCapture` enregistre l'audio par morceaux (MediaRecorder) pour l'archive facultative.
 */

/** Sous-ensemble typé de la Web Speech API (absente des types DOM standard). */
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: RecognitionAlternative;
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [index: number]: RecognitionResult };
}
interface RecognitionErrorEvent {
  readonly error: string;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  const w = globalThis as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const speechSupported = () => recognitionCtor() !== null;
export const audioSupported = () => typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export interface SpokenSegment {
  text: string;
  /** Horodatages locaux (Date.now()) du début et de la fin de la phrase. */
  startedAt: number;
  endedAt: number;
}

export type CaptureState = 'idle' | 'listening' | 'error';

interface SpeechOptions {
  lang: string;
  onSegment(segment: SpokenSegment): void;
  onInterim?(text: string): void;
  onState?(state: CaptureState, error?: string): void;
}

const FATAL = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported']);
const ERROR_LABELS: Record<string, string> = {
  'not-allowed': 'Accès au micro refusé : autorisez-le dans le navigateur.',
  'service-not-allowed': 'La reconnaissance vocale est bloquée par le navigateur.',
  'audio-capture': 'Aucun micro détecté.',
  'language-not-supported': 'Le français n’est pas pris en charge par la reconnaissance vocale de ce navigateur.',
  network: 'Reconnaissance vocale injoignable, nouvelle tentative…',
};

export class SpeechCapture {
  private recognition: Recognition | null = null;
  private running = false;
  private utteranceStart: number | null = null;
  private restartDelay = 250;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly opts: SpeechOptions) {}

  start(): void {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      this.opts.onState?.('error', 'La reconnaissance vocale n’est pas disponible dans ce navigateur (essayez Chrome ou Edge).');
      return;
    }
    if (this.running) return;
    this.running = true;
    const r = new Ctor();
    r.lang = this.opts.lang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onstart = () => {
      this.restartDelay = 250;
      this.opts.onState?.('listening');
    };
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]!;
        const text = result[0]?.transcript.trim() ?? '';
        if (!text) continue;
        this.utteranceStart ??= Date.now();
        if (result.isFinal) {
          this.opts.onSegment({ text, startedAt: this.utteranceStart, endedAt: Date.now() });
          this.utteranceStart = null;
        } else interim += `${text} `;
      }
      this.opts.onInterim?.(interim.trim());
    };
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (FATAL.has(e.error)) {
        this.running = false;
        this.opts.onState?.('error', ERROR_LABELS[e.error] ?? e.error);
        return;
      }
      this.restartDelay = Math.min(10_000, this.restartDelay * 2);
      this.opts.onState?.('error', ERROR_LABELS[e.error] ?? `Reconnaissance vocale interrompue (${e.error}), reprise…`);
    };
    // Le navigateur arrête la reconnaissance après un silence : on la relance tant que la capture est voulue.
    r.onend = () => {
      this.opts.onInterim?.('');
      if (!this.running) return;
      this.restartTimer = setTimeout(() => {
        if (!this.running) return;
        try {
          r.start();
        } catch {
          /* déjà relancée */
        }
      }, this.restartDelay);
    };
    this.recognition = r;
    try {
      r.start();
    } catch (err) {
      this.running = false;
      this.opts.onState?.('error', err instanceof Error ? err.message : 'Impossible de démarrer la reconnaissance vocale.');
    }
  }

  stop(): void {
    this.running = false;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.recognition?.stop();
    this.recognition = null;
    this.utteranceStart = null;
    this.opts.onState?.('idle');
  }
}

const AUDIO_TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'];

interface AudioOptions {
  /** Durée d'un morceau envoyé au serveur. */
  sliceMs?: number;
  onChunk(blob: Blob): void;
  onError?(message: string): void;
}

export class AudioCapture {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;

  constructor(private readonly opts: AudioOptions) {}

  async start(): Promise<void> {
    if (!audioSupported()) {
      this.opts.onError?.('L’enregistrement audio n’est pas disponible dans ce navigateur.');
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      this.opts.onError?.('Accès au micro refusé : l’audio ne sera pas conservé.');
      return;
    }
    const mimeType = AUDIO_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    this.recorder = new MediaRecorder(this.stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32_000 });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.opts.onChunk(e.data);
    };
    this.recorder.start(this.opts.sliceMs ?? 15_000);
  }

  stop(): void {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.recorder = null;
    this.stream = null;
  }
}
