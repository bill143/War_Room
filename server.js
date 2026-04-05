/**
 * server.js — THE WAR ROOM Entry Point
 * Express + Socket.IO + WebSocket relay orchestrator
 */

import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initAudioRelay } from './src/ingestion/audioRelay.js';
import { intelligenceProcessor } from './src/intelligence/intelligenceProcessor.js';
import {
  createBubbleSession,
  pushBubbleIntelUpdate,
  finalizeBubbleSession
} from './src/bubble/bubbleConnector.js';
import { buildMarkdown } from './src/output/markdownBuilder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(express.static(join(__dirname, 'public')));
app.use(express.json());

const sessions = new Map();

app.get('/post-call', (req, res) => {
  const sessionId = req.query.session;
  const session = sessions.get(sessionId);
  if (!session || !session.summary) {
    return res.status(404).json({ error: 'Session not found or not finalized' });
  }
  res.json(session.summary);
});

io.on('connection', (socket) => {
  console.log(`[WAR ROOM] Socket connected: ${socket.id}`);

  socket.on('war-room:session-start', async (data) => {
    try {
      const sessionId = `wr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const sessionData = {
        sessionId,
        title: data?.title || 'War Room Session',
        participants: ['JD', 'AK', 'MR', 'SW'],
        startedAt: new Date().toISOString()
      };

      sessions.set(sessionId, {
        ...sessionData,
        startTime: Date.now(),
        summary: null
      });

      await createBubbleSession(sessionData);
      intelligenceProcessor.reset();

      intelligenceProcessor.on('intel-update', async (intel) => {
        io.emit('war-room:intel-update', intel);
        try {
          await pushBubbleIntelUpdate(sessionId, intel);
        } catch (err) {
          console.error('[WAR ROOM] Bubble intel push error:', err.message);
        }
      });

      socket.emit('war-room:session-started', { sessionId });
      io.emit('war-room:session-started', { sessionId });
      console.log(`[WAR ROOM] Session started: ${sessionId}`);
    } catch (err) {
      console.error('[WAR ROOM] Session start error:', err.message);
      socket.emit('war-room:error', { error: 'Failed to start session' });
    }
  });

  socket.on('war-room:session-end', async (data) => {
    try {
      const sessionId = data?.sessionId;
      const session = sessions.get(sessionId);

      if (!session) {
        socket.emit('war-room:error', { error: 'Session not found' });
        return;
      }

      const summary = intelligenceProcessor.generatePostCallSummary();
      const durationMs = Date.now() - session.startTime;
      const durationMin = Math.round(durationMs / 60000);

      const fullSummary = {
        ...summary,
        sessionId,
        meetingTitle: session.title,
        durationMinutes: durationMin,
        endedAt: new Date().toISOString()
      };

      session.summary = fullSummary;
      const markdown = buildMarkdown(fullSummary);
      fullSummary.markdown = markdown;

      await finalizeBubbleSession(sessionId, fullSummary);
      io.emit('war-room:session-end', { sessionId, summary: fullSummary });
      console.log(`[WAR ROOM] Session ended: ${sessionId} (${durationMin} min)`);
    } catch (err) {
      console.error('[WAR ROOM] Session end error:', err.message);
      socket.emit('war-room:error', { error: 'Failed to end session' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[WAR ROOM] Socket disconnected: ${socket.id}`);
  });
});

initAudioRelay(httpServer, io);

const PORT = process.env.PORT || 8765;
httpServer.listen(PORT, () => {
  console.log(`\n  THE WAR ROOM - AI Meeting Intelligence Platform\n  Running on http://localhost:${PORT}\n`);
});
