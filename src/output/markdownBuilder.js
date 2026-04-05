/**
 * src/output/markdownBuilder.js
  * Builds a structured Markdown post-call summary from the intelligence summary object.
   */

   /**
    * @param {Object} summary - The full post-call summary from intelligenceProcessor
     * @returns {string} Markdown formatted string
      */
      export function buildMarkdown(summary) {
        const lines = [];

          const title = summary.meetingTitle || 'War Room Session';
            const date = summary.endedAt
                ? new Date(summary.endedAt).toLocaleString('en-US', { timeZone: 'UTC' }) + ' UTC'
                    : new Date().toUTCString();

                      lines.push(`# ${title}`);
                        lines.push('');
                          lines.push(`**Date:** ${date}`);
                            lines.push(`**Duration:** ${summary.durationMinutes ?? 0} minutes`);
                              lines.push(`**Session ID:** \`${summary.sessionId || 'N/A'}\``);
                                lines.push('');

                                  // Sentiment & Momentum
                                    if (summary.sentiment) {
                                        const mood = summary.sentiment.meetingMood || 'N/A';
                                            const momentum = summary.sentiment.momentumScore ?? 'N/A';
                                                lines.push('## Meeting Pulse');
                                                    lines.push('');
                                                        lines.push(`- **Mood:** ${mood}`);
                                                            lines.push(`- **Momentum Score:** ${momentum}/100`);
                                                                lines.push('');
                                                                  }

                                                                    // Decisions
                                                                      lines.push('## Decisions');
                                                                        lines.push('');
                                                                          if (Array.isArray(summary.decisions) && summary.decisions.length > 0) {
                                                                              for (const d of summary.decisions) {
                                                                                    lines.push(`### ${d.decision || 'Unnamed Decision'}`);
                                                                                          if (d.decidedBy) lines.push(`- **Decided by:** ${d.decidedBy}`);
                                                                                                if (d.rationale) lines.push(`- **Rationale:** ${d.rationale}`);
                                                                                                      if (d.confidence !== undefined) lines.push(`- **Confidence:** ${Math.round(d.confidence * 100)}%`);
                                                                                                            lines.push('');
                                                                                                                }
                                                                                                                  } else {
                                                                                                                      lines.push('_No decisions recorded._');
                                                                                                                          lines.push('');
                                                                                                                            }
                                                                                                                            
                                                                                                                              // Action Items
                                                                                                                                lines.push('## Action Items');
                                                                                                                                  lines.push('');
                                                                                                                                    if (Array.isArray(summary.actions) && summary.actions.length > 0) {
                                                                                                                                        for (const a of summary.actions) {
                                                                                                                                              const priority = a.priority ? `[${a.priority.toUpperCase()}]` : '';
                                                                                                                                                    lines.push(`- ${priority} **${a.owner || 'Unassigned'}** — ${a.task || 'No task description'}`);
                                                                                                                                                          if (a.deadline) lines.push(`  - *Deadline:* ${a.deadline}`);
                                                                                                                                                                if (Array.isArray(a.dependencies) && a.dependencies.length > 0) {
                                                                                                                                                                        lines.push(`  - *Dependencies:* ${a.dependencies.join(', ')}`);
                                                                                                                                                                              }
                                                                                                                                                                                    lines.push(`  - *Status:* ${a.status || 'open'}`);
                                                                                                                                                                                        }
                                                                                                                                                                                            lines.push('');
                                                                                                                                                                                              } else {
                                                                                                                                                                                                  lines.push('_No action items recorded._');
                                                                                                                                                                                                      lines.push('');
                                                                                                                                                                                                        }
                                                                                                                                                                                                        
                                                                                                                                                                                                          // Stats
                                                                                                                                                                                                            lines.push('## Session Stats');
                                                                                                                                                                                                              lines.push('');
                                                                                                                                                                                                                lines.push(`- **Total Utterances:** ${summary.totalUtterances ?? 0}`);
                                                                                                                                                                                                                  lines.push(`- **Processing Windows:** ${summary.windowsProcessed ?? 0}`);
                                                                                                                                                                                                                    lines.push(`- **Decisions Captured:** ${summary.decisions?.length ?? 0}`);
                                                                                                                                                                                                                      lines.push(`- **Action Items Captured:** ${summary.actions?.length ?? 0}`);
                                                                                                                                                                                                                        lines.push('');
                                                                                                                                                                                                                          lines.push('---');
                                                                                                                                                                                                                            lines.push('_Generated by The War Room AI Meeting Intelligence Platform_');
                                                                                                                                                                                                                            
                                                                                                                                                                                                                              return lines.join('\n');
                                                                                                                                                                                                                              }
