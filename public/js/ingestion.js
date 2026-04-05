/**
 * public/js/ingestion.js
 * Client-side AudioWorklet capture -> WebSocket streaming to server
 */

class WarRoomIngestion {
  constructor() {
    this.audioContext = null;
    this.mediaStream = null;
    this.workletNode = null;
    this.socket = null;
    this.isStreaming = false;
  }

  async initCapture() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      console.log('[INGESTION] Microphone capture initialized');
    } catch (err) {
      console.error('[INGESTION] Failed to initialize capture:', err.message);
      throw err;
    }
  }

  async initWorklet() {
    try {
      const workletCode = `
        class WarRoomProcessor extends AudioWorkletProcessor {
          constructor() {
            super();
            this.buffer = [];
            this.bufferSize = 4000;
          }
          process(inputs, outputs, parameters) {
            const input = inputs[0];
            if (input && input.length > 0) {
              const channelData = input[0];
              for (let i = 0; i < channelData.length; i++) {
                this.buffer.push(channelData[i]);
              }
              while (this.buffer.length >= this.bufferSize) {
                const frame = this.buffer.splice(0, this.bufferSize);
                this.port.postMessage(new Float32Array(frame));
              }
            }
            return true;
          }
        }
        registerProcessor('war-room-processor', WarRoomProcessor);
      `;

      const blob = new Blob([workletCode], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);

      await this.audioContext.audioWorklet.addModule(blobUrl);
      URL.revokeObjectURL(blobUrl);

      this.workletNode = new AudioWorkletNode(this.audioContext, 'war-room-processor');

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      source.connect(this.workletNode);
      this.workletNode.connect(this.audioContext.destination);

      console.log('[INGESTION] AudioWorklet initialized');
    } catch (err) {
      console.error('[INGESTION] Failed to initialize worklet:', err.message);
      throw err;
    }
  }

  initSocket() {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      this.socket = new WebSocket(`${protocol}//${host}/audio`);
      this.socket.binaryType = 'arraybuffer';

      this.socket.onopen = () => {
        console.log('[INGESTION] WebSocket connected');
      };

      this.socket.onmessage = (event) => {
        try {
          const utterance = JSON.parse(event.data);
          window.dispatchEvent(new CustomEvent('war-room:ws-utterance', { detail: utterance }));
        } catch (err) {
          // Binary data or non-JSON
        }
      };

      this.socket.onerror = (err) => {
        console.error('[INGESTION] WebSocket error:', err);
      };

      this.socket.onclose = () => {
        console.log('[INGESTION] WebSocket disconnected');
      };
    } catch (err) {
      console.error('[INGESTION] Failed to initialize socket:', err.message);
      throw err;
    }
  }

  startStreaming() {
    if (!this.workletNode || !this.socket) {
      console.error('[INGESTION] Worklet or socket not initialized');
      return;
    }

    this.workletNode.port.onmessage = (event) => {
      if (this.socket.readyState !== WebSocket.OPEN) return;

      const float32Data = event.data;
      const int16Data = new Int16Array(float32Data.length);

      for (let i = 0; i < float32Data.length; i++) {
        const sample = float32Data[i];
        int16Data[i] = Math.max(-32768, Math.min(32767, Math.round(sample * 32768)));
      }

      this.socket.send(int16Data.buffer);
    };

    this.isStreaming = true;
    console.log('[INGESTION] Audio streaming started');
  }

  async start() {
    try {
      await this.initCapture();
      await this.initWorklet();
      this.initSocket();

      await new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (this.socket.readyState === WebSocket.OPEN) {
            clearInterval(checkInterval);
            resolve();
          } else if (this.socket.readyState === WebSocket.CLOSED) {
            clearInterval(checkInterval);
            reject(new Error('WebSocket failed to connect'));
          }
        }, 100);
        setTimeout(() => {
          clearInterval(checkInterval);
          reject(new Error('WebSocket connection timeout'));
        }, 10000);
      });

      this.startStreaming();
      console.log('[INGESTION] War Room audio pipeline active');
    } catch (err) {
      console.error('[INGESTION] Start failed:', err.message);
      this.stop();
      throw err;
    }
  }

  stop() {
    this.isStreaming = false;

    if (this.workletNode) {
      try { this.workletNode.disconnect(); this.workletNode.port.onmessage = null; } catch (e) {}
      this.workletNode = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try { this.audioContext.close(); } catch (e) {}
      this.audioContext = null;
    }
    if (this.mediaStream) {
      try { this.mediaStream.getTracks().forEach((track) => track.stop()); } catch (e) {}
      this.mediaStream = null;
    }
    if (this.socket) {
      try { if (this.socket.readyState === WebSocket.OPEN) { this.socket.close(); } } catch (e) {}
      this.socket = null;
    }
    console.log('[INGESTION] All resources released');
  }
}

window.WarRoomIngestion = WarRoomIngestion;