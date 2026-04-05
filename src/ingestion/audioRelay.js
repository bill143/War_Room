/**
 * src/ingestion/audioRelay.js
 * WebSocket server -> Deepgram bridge for real-time audio transcription
 */

import { WebSocketServer } from 'ws';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { piiScrubber } from '../privacy/piiScrubber.js';
import { speakerRegistry } from '../diarization/speakerRegistry.js';
import { intelligenceProcessor } from '../intelligence/intelligenceProcessor.js';

export function initAudioRelay(httpServer, io) {
  const wss = new WebSocketServer({ server: httpServer, path: '/audio' });

  wss.on('connection', (clientWs) => {
    console.log('[AUDIO RELAY] Client connected');
    let deepgramConnection = null;

    try {
      const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

      deepgramConnection = deepgram.listen.live({
        model: 'nova-2-meeting',
        language: 'en-US',
        encoding: 'linear16',
        sample_rate: 16000,
        channels: 1,
        diarize: true,
        diarize_version: 'latest',
        punctuate: true,
        smart_format: true,
        utterances: true,
        interim_results: true,
        endpointing: 300
      });

      deepgramConnection.on(LiveTranscriptionEvents.Open, () => {
        console.log('[AUDIO RELAY] Deepgram connection opened');
      });

      deepgramConnection.on(LiveTranscriptionEvents.Transcript, (data) => {
        try {
          handleTranscriptResult(data, clientWs, io);
        } catch (err) {
          console.error('[AUDIO RELAY] Transcript handling error:', err.message);
        }
      });

      deepgramConnection.on(LiveTranscriptionEvents.Error, (err) => {
        console.error('[AUDIO RELAY] Deepgram error:', err.message);
      });

      deepgramConnection.on(LiveTranscriptionEvents.Close, () => {
        console.log('[AUDIO RELAY] Deepgram connection closed');
      });
    } catch (err) {
      console.error('[AUDIO RELAY] Failed to create Deepgram connection:', err.message);
      clientWs.close();
      return;
    }

    clientWs.on('message', (data) => {
      try {
        if (deepgramConnection && data instanceof Buffer) {
          deepgramConnection.send(data);
        }
      } catch (err) {
        console.error('[AUDIO RELAY] Error forwarding audio:', err.message);
      }
    });

    clientWs.on('close', () => {
      console.log('[AUDIO RELAY] Client disconnected');
      try {
        if (deepgramConnection) {
          deepgramConnection.requestClose();
        }
      } catch (err) {
        console.error('[AUDIO RELAY] Error closing Deepgram:', err.message);
      }
    });

    clientWs.on('error', (err) => {
      console.error('[AUDIO RELAY] Client WebSocket error:', err.message);
    });
  });

  console.log('[AUDIO RELAY] WebSocket server initialized on /audio');
}

function handleTranscriptResult(data, clientWs, io) {
  if (!data.is_final) return;

  const channel = data.channel;
  if (!channel || !channel.alternatives || channel.alternatives.length === 0) return;

  const alt = channel.alternatives[0];
  if (!alt.transcript || alt.transcript.trim() === '') return;

  const scrubbedTranscript = piiScrubber(alt.transcript);
  const words = alt.words || [];
  const diarizedUtterances = speakerRegistry.diarize(words);

  const utterances = diarizedUtterances.map((utt) => ({
    speakerIdx: utt.speakerIdx,
    speakerId: utt.speakerId,
    speakerName: utt.speakerName,
    text: piiScrubber(utt.text),
    startTime: utt.startTime,
    endTime: utt.endTime,
    duration: utt.duration,
    timestamp: new Date().toISOString()
  }));

  if (utterances.length === 0) {
    utterances.push({
      speakerIdx: 0,
      speakerId: 'JD',
      speakerName: 'JD',
      text: scrubbedTranscript,
      startTime: alt.words?.[0]?.start || 0,
      endTime: alt.words?.[alt.words.length - 1]?.end || 0,
      duration: 0,
      timestamp: new Date().toISOString()
    });
  }

  for (const utterance of utterances) {
    try {
      if (clientWs.readyState === 1) {
        clientWs.send(JSON.stringify(utterance));
      }
    } catch (err) {
      console.error('[AUDIO RELAY] Error sending to client:', err.message);
    }
    intelligenceProcessor.addUtterance(utterance);
    io.emit('war-room:utterance', utterance);
  }
}