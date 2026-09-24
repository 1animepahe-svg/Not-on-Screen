"use client";

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Linear-averaging downsampler + Float32 → PCM16 little-endian. */
export function floatTo16kPcm(input: Float32Array, inRate: number): Uint8Array {
  const ratio = inRate / 16000;
  const outLen = Math.floor(input.length / ratio);
  const buf = new DataView(new ArrayBuffer(outLen * 2));
  let pos = 0;
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    const v = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    buf.setInt16(pos, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    pos += 2;
  }
  return new Uint8Array(buf.buffer);
}

const WORKLET = `
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() { super(); this.buf = []; this.len = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      this.buf.push(new Float32Array(ch)); this.len += ch.length;
      if (this.len >= 2048) {
        const out = new Float32Array(this.len); let o = 0;
        for (const b of this.buf) { out.set(b, o); o += b.length; }
        this.port.postMessage(out, [out.buffer]); this.buf = []; this.len = 0;
      }
    }
    return true;
  }
}
registerProcessor('nos-capture', CaptureProcessor);
`;

export type MicErrorKind = "mic_blocked" | "mic_missing" | "mic_busy" | "mic_unsupported";

export class MicError extends Error {
  constructor(public kind: MicErrorKind, message: string) {
    super(message);
  }
}

/** Captures microphone → 16 kHz PCM16 base64 chunks (~40–100ms each). */
export class MicCapture {
  stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private analyser: AnalyserNode | null = null;
  private data = new Uint8Array(512);
  onChunk: ((b64: string) => void) | null = null;

  async start() {
    if (this.stream) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new MicError("mic_unsupported", "This browser can't access a microphone.");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError")
        throw new MicError("mic_blocked", "Microphone access is blocked. Allow it in your browser's site settings, or continue in text mode.");
      if (name === "NotFoundError") throw new MicError("mic_missing", "No microphone was found. Plug one in or continue in text mode.");
      if (name === "NotReadableError") throw new MicError("mic_busy", "Your microphone is in use by another app.");
      throw new MicError("mic_unsupported", "Couldn't start the microphone.");
    }
    this.ctx = new AudioContext();
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    await this.ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.node = new AudioWorkletNode(this.ctx, "nos-capture");
    const rate = this.ctx.sampleRate;
    this.node.port.onmessage = (ev: MessageEvent<Float32Array>) => {
      if (this.onChunk) this.onChunk(bytesToBase64(floatTo16kPcm(ev.data, rate)));
    };
    src.connect(this.analyser);
    src.connect(this.node);
    // Worklet must be pulled by the graph; route to a muted gain.
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    this.node.connect(mute).connect(this.ctx.destination);
  }

  level(): number {
    if (!this.analyser) return 0;
    this.analyser.getByteTimeDomainData(this.data);
    let sum = 0;
    for (let i = 0; i < this.data.length; i++) {
      const v = (this.data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / this.data.length) * 4);
  }

  stop() {
    try {
      this.node?.disconnect();
      this.stream?.getTracks().forEach((t) => t.stop());
      void this.ctx?.close();
    } catch {}
    this.stream = null;
    this.ctx = null;
    this.node = null;
    this.analyser = null;
  }
}

/** Gapless PCM16 24 kHz player with immediate interruption + mixed recording bus. */
export class PcmPlayer {
  ctx: AudioContext;
  private analyser: AnalyserNode;
  private data = new Uint8Array(512);
  private nextTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  recordDest: MediaStreamAudioDestinationNode;

  constructor() {
    this.ctx = new AudioContext({ sampleRate: 24000 });
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.recordDest = this.ctx.createMediaStreamDestination();
    this.analyser.connect(this.ctx.destination);
    this.analyser.connect(this.recordDest);
  }

  async resume() {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  enqueue(b64: string) {
    const bytes = base64ToBytes(b64);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const n = Math.floor(bytes.byteLength / 2);
    const buf = this.ctx.createBuffer(1, n, 24000);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = view.getInt16(i * 2, true) / 0x8000;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.analyser);
    const startAt = Math.max(this.ctx.currentTime + 0.02, this.nextTime);
    src.start(startAt);
    this.nextTime = startAt + buf.duration;
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  }

  /** Barge-in: stop everything that is queued right now. */
  interrupt() {
    this.sources.forEach((s) => {
      try {
        s.stop();
      } catch {}
    });
    this.sources.clear();
    this.nextTime = 0;
  }

  get isPlaying() {
    return this.sources.size > 0 && this.nextTime > this.ctx.currentTime;
  }

  remainingMs() {
    return Math.max(0, (this.nextTime - this.ctx.currentTime) * 1000);
  }

  level(): number {
    this.analyser.getByteTimeDomainData(this.data);
    let sum = 0;
    for (let i = 0; i < this.data.length; i++) {
      const v = (this.data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / this.data.length) * 4);
  }

  /** Mix mic into the recording bus (both sides of the conversation). */
  attachMic(stream: MediaStream) {
    try {
      this.ctx.createMediaStreamSource(stream).connect(this.recordDest);
      return true;
    } catch {
      return false;
    }
  }

  close() {
    this.interrupt();
    void this.ctx.close().catch(() => {});
  }
}

export function pickRecorderMime() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}
