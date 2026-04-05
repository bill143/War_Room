/**
 * src/privacy/piiScrubber.js
 * PII regex scrubber with audit logging
 * All regex patterns are pre-compiled at module scope.
 */

const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;
const CREDIT_CARD_REGEX = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g;
const EMAIL_REGEX = /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}/g;
const URL_REGEX = /https?:\/\/[^\s"'<>]+/gi;
const IP_REGEX = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b/g;
const ADDRESS_REGEX = /\b\d{1,6}\s+[A-Za-z0-9\s.]+\s+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct)\.?[^\n]*/gi;
const INTL_PHONE_REGEX = /\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g;
const PHONE_REGEX = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g;

const auditLog = [];

export function piiScrubber(text, options = {}) {
    if (!text || typeof text !== 'string') return text || '';

  let scrubbed = text;
    let count = 0;

  const replacements = [
    { regex: SSN_REGEX, label: '[SSN]' },
    { regex: CREDIT_CARD_REGEX, label: '[CARD]' },
    { regex: EMAIL_REGEX, label: '[EMAIL]' },
    { regex: URL_REGEX, label: '[URL]' },
    { regex: IP_REGEX, label: '[IP]' },
    { regex: ADDRESS_REGEX, label: '[ADDRESS]' },
    { regex: INTL_PHONE_REGEX, label: '[PHONE]' },
    { regex: PHONE_REGEX, label: '[PHONE]' }
      ];

  for (const { regex, label } of replacements) {
        regex.lastIndex = 0;
        const matches = scrubbed.match(regex);
        if (matches) {
                count += matches.length;
                scrubbed = scrubbed.replace(regex, label);
        }
  }

  if (options.scrubNames && Array.isArray(options.participants)) {
        for (const p of options.participants) {
                if (p.fullName && p.id) {
                          const escaped = p.fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                          const nameRegex = new RegExp('\\b' + escaped + '\\b', 'gi');
                          const nameMatches = scrubbed.match(nameRegex);
                          if (nameMatches) {
                                      count += nameMatches.length;
                                      scrubbed = scrubbed.replace(nameRegex, p.id);
                          }
                }
        }
  }

  if (count > 0) {
        console.log(`[PII SCRUBBER] Scrubbed ${count} PII entities`);
  }

  return scrubbed;
}

export function piiAuditLog(sessionId, count) {
    const entry = { sessionId, count, timestamp: new Date().toISOString() };
    auditLog.push(entry);
    return entry;
}

export function getAuditLog() {
    return [...auditLog];
}
