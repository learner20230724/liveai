class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sum = 0;
    this.count = 0;
    this.phase = 0;
    this.frame = new Int16Array(320);
    this.index = 0;
    this.muted = false;
    this.port.onmessage = (e) => {
      this.muted = e.data.muted === true;
    };
  }
  process(inputs, outputs) {
    const samples = inputs[0]?.[0];
    if (!samples) return true;
    for (const s of samples) {
      this.sum += s;
      this.count++;
      this.phase += 16000;
      if (this.phase >= sampleRate) {
        this.phase -= sampleRate;
        const value = this.muted
          ? 0
          : Math.max(-1, Math.min(1, this.sum / this.count));
        this.frame[this.index++] = value < 0 ? value * 32768 : value * 32767;
        this.sum = 0;
        this.count = 0;
        if (this.index === 320) {
          this.port.postMessage(this.frame.buffer, [this.frame.buffer]);
          this.frame = new Int16Array(320);
          this.index = 0;
        }
      }
    }
    // Output remains silent. This connection keeps capture running without mic echo.
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
