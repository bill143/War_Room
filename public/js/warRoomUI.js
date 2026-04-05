/**
 * public/js/warRoomUI.js
 * Socket.IO listener + live sidebar panel updates
 */

class WarRoomUI {
  constructor() {
    this.socket = null;
    this.ingestion = null;
    this.sessionId = null;
    this.sessionTimerInterval = null;
    this.sessionStartTime = null;
    this.speakerColors = { JD: '#00d4ff', AK: '#ff4d6d', MR: '#39ff14', SW: '#ffd700' };
    this.priorityColors = { CRITICAL: '#ff0040', HIGH: '#ff4d6d', STANDARD: '#00d4ff', LOW: '#666' };
  }

  init() {
    try {
      this.socket = io();
      this._bindSocketEvents();
      this._bindButtonEvents();
      console.log('[WAR ROOM UI] Initialized');
    } catch (err) {
      console.error('[WAR ROOM UI] Initialization error:', err.message);
    }
  }

  _bindSocketEvents() {
    this.socket.on('connect', () => { this._setStatus('CONNECTED', '#39ff14'); });
    this.socket.on('disconnect', () => { this._setStatus('DISCONNECTED', '#ff4d6d'); });

    this.socket.on('war-room:session-started', (data) => {
      this.sessionId = data.sessionId;
      this._setStatus('LIVE', '#ff0040');
      this._startSessionTimer();
    });

    this.socket.on('war-room:utterance', (utterance) => { this._appendUtterance(utterance); });

    this.socket.on('war-room:intel-update', (intel) => {
      this._updateDecisionsPanel(intel.decisions || []);
      this._updateActionsPanel(intel.actions || []);
      this._updateVibeCheck(intel.sentiment || {});
    });

    this.socket.on('war-room:session-end', (data) => {
      this._stopSessionTimer();
      this._setStatus('SESSION ENDED', '#ffd700');
      if (data.sessionId) {
        setTimeout(() => { window.location.href = `/post-call?session=${data.sessionId}`; }, 2000);
      }
    });

    this.socket.on('war-room:error', (data) => { console.error('[WAR ROOM UI] Server error:', data.error); });
  }

  _bindButtonEvents() {
    const startBtn = document.getElementById('btn-start');
    const stopBtn = document.getElementById('btn-stop');

    if (startBtn) {
      startBtn.addEventListener('click', async () => {
        try {
          startBtn.disabled = true;
          stopBtn.disabled = false;
          this.ingestion = new window.WarRoomIngestion();
          await this.ingestion.start();
          this.socket.emit('war-room:session-start', { title: 'War Room Session' });
        } catch (err) {
          console.error('[WAR ROOM UI] Failed to start:', err.message);
          startBtn.disabled = false;
          stopBtn.disabled = true;
        }
      });
    }

    if (stopBtn) {
      stopBtn.addEventListener('click', () => {
        try {
          if (this.ingestion) { this.ingestion.stop(); this.ingestion = null; }
          if (this.sessionId) { this.socket.emit('war-room:session-end', { sessionId: this.sessionId }); }
          startBtn.disabled = false;
          stopBtn.disabled = true;
        } catch (err) {
          console.error('[WAR ROOM UI] Failed to stop:', err.message);
        }
      });
    }
  }

  _appendUtterance(utterance) {
    const panel = document.getElementById('live-transcript');
    if (!panel) return;
    const empty = panel.querySelector('.panel-empty');
    if (empty) empty.remove();

    const div = document.createElement('div');
    div.className = 'utterance';
    const color = this.speakerColors[utterance.speakerId] || '#ffffff';
    const time = this._formatTime(utterance.startTime);
    div.innerHTML = `<span class="utterance-time">${time}</span><span class="utterance-speaker" style="color:${color};border-color:${color};">${utterance.speakerId}</span><span class="utterance-text">${this._escapeHtml(utterance.text)}</span>`;
    panel.appendChild(div);
    panel.scrollTop = panel.scrollHeight;
  }

  _updateDecisionsPanel(decisions) {
    const panel = document.getElementById('decisions-panel');
    if (!panel) return;
    if (decisions.length === 0) { panel.innerHTML = '<div class="panel-empty">No decisions yet...</div>'; return; }
    panel.innerHTML = decisions.map((d) => `<div class="decision-item"><div class="decision-text">${this._escapeHtml(d.decision)}</div><div class="decision-meta"><span class="decision-owner">${d.decidedBy || '—'}</span><span class="decision-confidence">${d.confidence != null ? d.confidence + '%' : '—'}</span></div></div>`).join('');
  }

  _updateActionsPanel(actions) {
    const panel = document.getElementById('actions-panel');
    if (!panel) return;
    const openActions = actions.filter((a) => a.status === 'OPEN');
    if (openActions.length === 0) { panel.innerHTML = '<div class="panel-empty">No action items yet...</div>'; return; }
    panel.innerHTML = openActions.map((a) => {
      const prioColor = this.priorityColors[a.priority] || '#00d4ff';
      return `<div class="action-item"><div class="action-priority" style="background:${prioColor};">${a.priority || 'STD'}</div><div class="action-body"><div class="action-task">${this._escapeHtml(a.task)}</div><div class="action-meta"><span class="action-owner">${a.owner || '—'}</span>${a.deadline ? `<span class="action-deadline">⏰ ${a.deadline}</span>` : ''}</div></div></div>`;
    }).join('');
  }

  _updateVibeCheck(sentiment) {
    const panel = document.getElementById('vibe-check');
    if (!panel) return;
    const mood = sentiment.meetingMood || 'NEUTRAL';
    const momentum = sentiment.momentumScore ?? 0.5;
    const speakerScores = sentiment.speakerSentiment || {};
    const moodEmojis = { ALIGNED: '🤝', TENSE: '⚡', DIVERGENT: '🔀', ENERGIZED: '🔥', NEUTRAL: '😐' };
    const emoji = moodEmojis[mood] || '😐';
    const momentumPct = Math.round(momentum * 100);
    let html = `<div class="vibe-mood"><span class="vibe-emoji">${emoji}</span><span class="vibe-mood-text">${mood}</span></div><div class="vibe-momentum"><label>Momentum</label><div class="momentum-bar"><div class="momentum-fill" style="width:${momentumPct}%;"></div></div><span class="momentum-value">${momentumPct}%</span></div><div class="vibe-speakers">`;
    for (const [speaker, score] of Object.entries(speakerScores)) {
      const color = this.speakerColors[speaker] || '#fff';
      const scoreDisplay = typeof score === 'number' ? score.toFixed(2) : '—';
      const barWidth = typeof score === 'number' ? Math.round((score + 1) * 50) : 50;
      html += `<div class="vibe-speaker-row"><span class="vibe-speaker-id" style="color:${color};">${speaker}</span><div class="sentiment-bar"><div class="sentiment-fill" style="width:${barWidth}%;background:${color};"></div></div><span class="sentiment-value">${scoreDisplay}</span></div>`;
    }
    html += '</div>';
    panel.innerHTML = html;
  }

  _setStatus(text, color) {
    const el = document.getElementById('status-indicator');
    if (el) { el.textContent = text; el.style.color = color; }
  }

  _startSessionTimer() {
    this.sessionStartTime = Date.now();
    const timerEl = document.getElementById('session-timer');
    this.sessionTimerInterval = setInterval(() => {
      if (!timerEl) return;
      const elapsed = Date.now() - this.sessionStartTime;
      const mins = Math.floor(elapsed / 60000);
      const secs = Math.floor((elapsed % 60000) / 1000);
      timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }, 1000);
  }

  _stopSessionTimer() {
    if (this.sessionTimerInterval) { clearInterval(this.sessionTimerInterval); this.sessionTimerInterval = null; }
  }

  _formatTime(seconds) {
    if (typeof seconds !== 'number') return '00:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const ui = new WarRoomUI();
  ui.init();
  window.warRoomUI = ui;
});