/**
 * src/bubble/bubbleConnector.js
 * Bubble.io API connector — session management, intel push, finalization
 */

const BUBBLE_API_URL = process.env.BUBBLE_API_URL || '';
const BUBBLE_API_KEY = process.env.BUBBLE_API_KEY || '';

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${BUBBLE_API_KEY}`
  };
}

export async function createBubbleSession(sessionData) {
  const endpoint = `${BUBBLE_API_URL}/create_meeting_session`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        session_id: sessionData.sessionId,
        title: sessionData.title,
        participants: sessionData.participants,
        started_at: sessionData.startedAt
      })
    });

    if (!response.ok) {
      console.error(`[BUBBLE] create_meeting_session failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    console.log(`[BUBBLE] Session created: ${sessionData.sessionId}`);
    return data;
  } catch (err) {
    console.error(`[BUBBLE] create_meeting_session error: ${err.message}`);
    return null;
  }
}

export async function pushBubbleIntelUpdate(sessionId, intel) {
  const promises = [];

  if (Array.isArray(intel.decisions)) {
    for (const decision of intel.decisions) {
      promises.push(
        postToBubble('/create_decision', {
          session_id: sessionId,
          decision_id: decision.id,
          decision: decision.decision,
          decided_by: decision.decidedBy,
          rationale: decision.rationale,
          confidence: decision.confidence
        })
      );
    }
  }

  if (Array.isArray(intel.actions)) {
    for (const action of intel.actions) {
      promises.push(
        postToBubble('/create_action_item', {
          session_id: sessionId,
          action_id: action.id,
          owner: action.owner,
          task: action.task,
          deadline: action.deadline,
          priority: action.priority,
          dependencies: action.dependencies,
          status: action.status
        })
      );
    }
  }

  try {
    const results = await Promise.allSettled(promises);
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      console.error(`[BUBBLE] ${failed.length} intel push(es) failed`);
    }
    console.log(`[BUBBLE] Intel update pushed: ${promises.length} items`);
  } catch (err) {
    console.error(`[BUBBLE] pushBubbleIntelUpdate error: ${err.message}`);
  }
}

export async function finalizeBubbleSession(sessionId, summary) {
  const endpoint = `${BUBBLE_API_URL}/finalize_meeting_session`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        session_id: sessionId,
        meeting_title: summary.meetingTitle,
        duration_minutes: summary.durationMinutes,
        ended_at: summary.endedAt,
        total_utterances: summary.totalUtterances,
        windows_processed: summary.windowsProcessed,
        decisions_count: summary.decisions?.length || 0,
        actions_count: summary.actions?.length || 0,
        meeting_mood: summary.sentiment?.meetingMood,
        momentum_score: summary.sentiment?.momentumScore,
        markdown_summary: summary.markdown,
        full_intel: JSON.stringify(summary)
      })
    });

    if (!response.ok) {
      console.error(`[BUBBLE] finalize_meeting_session failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    console.log(`[BUBBLE] Session finalized: ${sessionId}`);
    return data;
  } catch (err) {
    console.error(`[BUBBLE] finalize_meeting_session error: ${err.message}`);
    return null;
  }
}

async function postToBubble(path, body) {
  const endpoint = `${BUBBLE_API_URL}${path}`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      console.error(`[BUBBLE] ${path} failed: ${response.status} ${response.statusText}`);
      return null;
    }

    return await response.json();
  } catch (err) {
    console.error(`[BUBBLE] ${path} error: ${err.message}`);
    return null;
  }
}