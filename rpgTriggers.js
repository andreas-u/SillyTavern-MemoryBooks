import { chat } from '../../../../script.js';
import { RPG_MEMORY } from './constants.js';
import { clampInt } from './utils.js';

const TRIGGER_PATTERNS = [
    {
        type: 'user_importance_signal',
        weight: 4,
        pattern: /\b(remember this|note this|important|canon|this matters|write this down|log this|keep track)\b/i,
        reason: 'User marked the event as important',
    },
    {
        type: 'quest_progress',
        weight: 3,
        pattern: /\b(quest|mission|objective|task|contract|bounty|clue|lead|ritual|investigation)\b.*\b(completed|failed|accepted|started|revealed|solved|found|lost|changed|updated)\b|\b(completed|failed|accepted|started|revealed|solved|found|lost|changed|updated)\b.*\b(quest|mission|objective|task|contract|bounty|clue|lead|ritual|investigation)\b/i,
        reason: 'Quest or thread progress changed',
    },
    {
        type: 'entity_update',
        weight: 3,
        pattern: /\b(npc|ally|enemy|companion|party|faction|guild|cult|kingdom|house|item|artifact|weapon|key|map|letter)\b.*\b(joined|left|betrayed|promised|died|killed|captured|escaped|stole|gave|received|discovered|destroyed|revealed)\b/i,
        reason: 'Entity or inventory state changed',
    },
    {
        type: 'relationship_shift',
        weight: 3,
        pattern: /\b(trust|betray|betrayed|alliance|rivalry|romance|confessed|kissed|threatened|forgave|blackmailed|owed|debt|favor)\b/i,
        reason: 'Relationship or faction standing shifted',
    },
    {
        type: 'location_time_transition',
        weight: 2,
        pattern: /\b(arrive|arrived|leave|left|enter|entered|return|returned|travel|traveled|journey|camp|rest|morning|evening|dawn|dusk|next day|hours later|days later)\b/i,
        reason: 'Location or time changed',
    },
    {
        type: 'scene_boundary',
        weight: 2,
        pattern: /\b(scene ends|scene closes|chapter ends|later that|afterward|meanwhile|cut to|fade out)\b/i,
        reason: 'Scene boundary detected',
    },
    {
        type: 'canon_event',
        weight: 4,
        pattern: /\b(reveals?|revealed|secret|truth|identity|prophecy|curse|murderer|culprit|heir|betrayal|dead|death|destroyed|saved|banished)\b/i,
        reason: 'Major canon event detected',
    },
];

const SCRATCHPAD_SECTION_RULES = [
    {
        key: 'scene_state',
        label: 'Scene State',
        weight: 4,
        memoryType: 'scratchpad_scene_state',
        reason: 'Scratchpad scene state changed',
    },
    {
        key: 'active_threads',
        label: 'Active Threads & Stakes',
        aliases: ['Active Threads &amp; Stakes'],
        weight: 4,
        memoryType: 'scratchpad_thread_update',
        reason: 'Scratchpad active threads changed',
    },
    {
        key: 'parallel_storylines',
        label: 'Parallel Storylines',
        weight: 4,
        memoryType: 'scratchpad_parallel_storyline',
        reason: 'Scratchpad parallel storyline changed',
    },
    {
        key: 'knowledge',
        label: 'Knowledge',
        repeated: true,
        weight: 3,
        memoryType: 'scratchpad_knowledge_update',
        reason: 'Scratchpad character knowledge changed',
    },
    {
        key: 'read_of_user',
        label: 'Their read of <user>',
        aliases: ['Their read of user', 'Their read of'],
        repeated: true,
        weight: 3,
        memoryType: 'scratchpad_relationship_update',
        reason: 'Scratchpad relationship read changed',
    },
    {
        key: 'next_cutaway',
        label: 'Next Cutaway Candidate',
        weight: 2,
        memoryType: 'scratchpad_cutaway_update',
        reason: 'Scratchpad cutaway candidate changed',
    },
    {
        key: 'narrator_notes',
        label: 'Narrator Notes',
        weight: 2,
        memoryType: 'scratchpad_narrator_note',
        reason: 'Scratchpad narrator notes changed',
    },
];

const SCRATCHPAD_LABELS = [
    'Emotional State',
    'Knowledge',
    'Their read of <user>',
    'Their read of user',
    'Scene State',
    'Memory Trigger',
    'Active Threads & Stakes',
    'Active Threads &amp; Stakes',
    'Parallel Storylines',
    'Next Cutaway Candidate',
    'Narrator Notes',
];

const MEMORY_TRIGGER_FIELDS = [
    'State',
    'Type',
    'Reason',
    'Memory Scope',
    'Temporal Anchor',
];

function getMessageText(message) {
    if (!message || typeof message !== 'object') {
        return '';
    }
    return String(message.mes || message.message || message.text || '').trim();
}

function isAssistantMessage(message) {
    return !!message && typeof message === 'object' && message.is_user !== true;
}

function decodeEntities(text) {
    return String(text || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function stripHtml(text) {
    return decodeEntities(String(text || '')
        .replace(/<user>/gi, 'user')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|details|summary|li|h[1-6])>/gi, '\n')
        .replace(/<[^>]*>/g, ' '));
}

function normalizeComparableText(text) {
    return stripHtml(text)
        .replace(/\[[^\]]*]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function extractScratchpadText(rawText) {
    const text = String(rawText || '');
    const markerIndex = text.toLowerCase().lastIndexOf('scene scratchpad');
    if (markerIndex < 0) {
        return '';
    }

    const detailsStart = text.toLowerCase().lastIndexOf('<details', markerIndex);
    const divStart = text.toLowerCase().lastIndexOf('<div', markerIndex);
    const start = Math.max(detailsStart, divStart, 0);
    return stripHtml(text.slice(start));
}

function findNextLabelIndex(text, startIndex) {
    const lower = text.toLowerCase();
    let nextIndex = -1;
    for (const label of SCRATCHPAD_LABELS) {
        const index = lower.indexOf(`${label.toLowerCase()}:`, startIndex);
        if (index >= 0 && (nextIndex < 0 || index < nextIndex)) {
            nextIndex = index;
        }
    }
    return nextIndex;
}

function extractLabelValues(text, labels, repeated = false) {
    const values = [];
    const lower = text.toLowerCase();
    const candidates = labels.map((label) => `${label.toLowerCase()}:`);

    for (const candidate of candidates) {
        let searchFrom = 0;
        while (searchFrom < lower.length) {
            const index = lower.indexOf(candidate, searchFrom);
            if (index < 0) {
                break;
            }

            const valueStart = index + candidate.length;
            const nextLabel = findNextLabelIndex(text, valueStart);
            const valueEnd = nextLabel >= 0 ? nextLabel : text.length;
            const value = normalizeComparableText(text.slice(valueStart, valueEnd));
            if (value) {
                values.push(value);
            }

            if (!repeated) {
                break;
            }
            searchFrom = valueEnd;
        }
    }

    return repeated ? values.join(' | ') : values[0] || '';
}

function extractLabelRawValue(text, labels) {
    const lower = text.toLowerCase();
    const candidates = labels.map((label) => `${label.toLowerCase()}:`);

    for (const candidate of candidates) {
        const index = lower.indexOf(candidate);
        if (index < 0) {
            continue;
        }

        const valueStart = index + candidate.length;
        const nextLabel = findNextLabelIndex(text, valueStart);
        const valueEnd = nextLabel >= 0 ? nextLabel : text.length;
        return text.slice(valueStart, valueEnd).trim();
    }

    return '';
}

function cleanMemoryTriggerValue(value) {
    const cleaned = stripHtml(value)
        .replace(/\s+/g, ' ')
        .trim();
    return /^[-\u2013\u2014]+$/.test(cleaned) ? '' : cleaned;
}

function extractMemoryTriggerField(triggerText, field) {
    const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const otherFields = MEMORY_TRIGGER_FIELDS
        .filter((candidate) => candidate !== field)
        .map((candidate) => candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
    const pattern = new RegExp(
        `(?:^|\\n)\\s*${escapedField}:\\s*([\\s\\S]*?)(?=\\n\\s*(?:${otherFields}):|$)`,
        'i',
    );
    const match = String(triggerText || '').match(pattern);
    return cleanMemoryTriggerValue(match?.[1] || '');
}

function parseExplicitMemoryTrigger(scratchpadText) {
    const triggerText = extractLabelRawValue(scratchpadText, ['Memory Trigger']);
    if (!triggerText) {
        return null;
    }

    const state = extractMemoryTriggerField(triggerText, 'State');
    const type = extractMemoryTriggerField(triggerText, 'Type');
    const reason = extractMemoryTriggerField(triggerText, 'Reason');
    const scope = extractMemoryTriggerField(triggerText, 'Memory Scope');
    const temporalAnchor = extractMemoryTriggerField(triggerText, 'Temporal Anchor');

    if (!state && !type && !reason && !scope && !temporalAnchor) {
        return null;
    }

    return {
        state,
        type,
        reason,
        scope,
        temporalAnchor,
    };
}

function parseScratchpad(rawText) {
    const scratchpadText = extractScratchpadText(rawText);
    if (!scratchpadText) {
        return null;
    }

    const sections = {};
    for (const rule of SCRATCHPAD_SECTION_RULES) {
        const labels = [rule.label, ...(rule.aliases || [])];
        sections[rule.key] = extractLabelValues(scratchpadText, labels, !!rule.repeated);
    }

    return {
        sections,
        memoryTrigger: parseExplicitMemoryTrigger(scratchpadText),
    };
}

function tokenSimilarity(a, b) {
    const left = new Set(String(a || '').split(/\s+/).filter(Boolean));
    const right = new Set(String(b || '').split(/\s+/).filter(Boolean));
    if (left.size === 0 && right.size === 0) {
        return 1;
    }
    let intersection = 0;
    for (const token of left) {
        if (right.has(token)) {
            intersection += 1;
        }
    }
    const union = new Set([...left, ...right]).size;
    return union > 0 ? intersection / union : 0;
}

function hasMeaningfulSectionChange(previousValue, currentValue) {
    if (!currentValue || currentValue.length < 12) {
        return false;
    }
    if (!previousValue) {
        return currentValue.length >= 30;
    }
    if (previousValue === currentValue) {
        return false;
    }

    const lengthDelta = Math.abs(currentValue.length - previousValue.length);
    return lengthDelta >= 35 || tokenSimilarity(previousValue, currentValue) < 0.82;
}

function findRecentScratchpads(sceneStart, safeEnd) {
    const scratchpads = [];
    const lookbackStart = Math.max(0, sceneStart - 20);
    for (let index = safeEnd; index >= lookbackStart && scratchpads.length < 3; index -= 1) {
        const message = chat[index];
        if (!isAssistantMessage(message)) {
            continue;
        }
        const parsed = parseScratchpad(getMessageText(message));
        if (parsed) {
            scratchpads.push({ index, ...parsed });
        }
    }
    return scratchpads.reverse();
}

function evaluateScratchpadTrigger(sceneStart, safeEnd) {
    const scratchpads = findRecentScratchpads(sceneStart, safeEnd);
    if (scratchpads.length < 2) {
        return null;
    }

    const current = scratchpads[scratchpads.length - 1];
    if (current.index < sceneStart) {
        return null;
    }
    const explicitTrigger = current.memoryTrigger;
    const explicitState = String(explicitTrigger?.state || '').toLowerCase();
    const explicitSignal = explicitTrigger
        ? {
            state: explicitTrigger.state || 'unspecified',
            type: explicitTrigger.type || '',
            reason: explicitTrigger.reason || '',
            scope: explicitTrigger.scope || '',
            temporalAnchor: explicitTrigger.temporalAnchor || '',
            scratchpadMessage: current.index,
        }
        : null;

    if (explicitState === 'required') {
        return {
            confidence: 0.98,
            urgency: 'high',
            reason: explicitTrigger.reason || 'Scratchpad memory trigger marked required',
            memoryType: explicitTrigger.type || 'scratchpad_memory_required',
            reviewRequired: true,
            scratchpadMessage: current.index,
            scratchpadSignal: explicitSignal,
            memoryScope: explicitTrigger.scope || '',
            temporalAnchor: explicitTrigger.temporalAnchor || '',
            forceRequired: true,
        };
    }

    if (explicitState === 'none') {
        return {
            suppressed: true,
            scratchpadMessage: current.index,
            scratchpadSignal: explicitSignal,
        };
    }

    const previous = scratchpads[scratchpads.length - 2];
    const changes = [];
    let score = 0;

    for (const rule of SCRATCHPAD_SECTION_RULES) {
        const previousValue = previous.sections[rule.key] || '';
        const currentValue = current.sections[rule.key] || '';
        if (hasMeaningfulSectionChange(previousValue, currentValue)) {
            changes.push(rule);
            score += rule.weight;
        }
    }

    if (score < 4) {
        return explicitSignal
            ? {
                suppressed: true,
                scratchpadMessage: current.index,
                scratchpadSignal: explicitSignal,
            }
            : null;
    }

    changes.sort((a, b) => b.weight - a.weight);
    const primary = changes[0];
    const changedLabels = changes.slice(0, 3).map((change) => change.label).join(', ');
    return {
        confidence: Math.min(0.96, 0.5 + (score * 0.08)),
        urgency: score >= 7 ? 'high' : 'normal',
        reason: `${primary.reason}: ${changedLabels}`,
        memoryType: primary.memoryType,
        reviewRequired: score >= 7,
        scratchpadMessage: current.index,
        scratchpadSignal: explicitSignal,
        memoryScope: explicitTrigger?.scope || '',
        temporalAnchor: explicitTrigger?.temporalAnchor || '',
    };
}

function normalizeTriggerSettings(settings) {
    const moduleSettings = settings?.moduleSettings || {};
    return {
        enabled: moduleSettings.rpgContentTriggersEnabled !== false,
        checkCadence: clampInt(
            moduleSettings.rpgContentTriggerCheckCadence ?? RPG_MEMORY.CONTENT_TRIGGER.DEFAULT_CHECK_CADENCE,
            RPG_MEMORY.CONTENT_TRIGGER.MIN_CHECK_CADENCE,
            RPG_MEMORY.CONTENT_TRIGGER.MAX_CHECK_CADENCE,
        ),
        cooldown: clampInt(
            moduleSettings.rpgContentTriggerCooldown ?? RPG_MEMORY.CONTENT_TRIGGER.DEFAULT_COOLDOWN,
            RPG_MEMORY.CONTENT_TRIGGER.MIN_COOLDOWN,
            RPG_MEMORY.CONTENT_TRIGGER.MAX_COOLDOWN,
        ),
    };
}

function buildRecentText(start, end) {
    const lines = [];
    for (let index = start; index <= end; index += 1) {
        const text = getMessageText(chat[index]);
        if (text) {
            lines.push(text);
        }
    }
    return lines.join('\n');
}

export function evaluateRpgContentTrigger(settings, stmbData, highestProcessed, currentLastMessage, buffer) {
    const triggerSettings = normalizeTriggerSettings(settings);
    if (!settings?.moduleSettings?.rpgMemoryModeEnabled || !triggerSettings.enabled) {
        return { shouldCreateMemory: false };
    }

    const safeEnd = Math.max(0, currentLastMessage - buffer);
    const sceneStart = highestProcessed + 1;
    if (sceneStart > safeEnd) {
        return { shouldCreateMemory: false };
    }

    const lastCheck = Number.isFinite(stmbData.rpgContentLastCheckMessage)
        ? stmbData.rpgContentLastCheckMessage
        : highestProcessed;
    if (safeEnd - lastCheck < triggerSettings.checkCadence) {
        return { shouldCreateMemory: false };
    }

    const checkStart = Math.max(sceneStart, safeEnd - triggerSettings.checkCadence + 1);
    const recentText = buildRecentText(checkStart, safeEnd);
    stmbData.rpgContentLastCheckMessage = safeEnd;

    const scratchpadTrigger = evaluateScratchpadTrigger(sceneStart, safeEnd);
    const lastTriggered = Number.isFinite(stmbData.rpgContentLastTriggeredMessage)
        ? stmbData.rpgContentLastTriggeredMessage
        : highestProcessed;
    const cooldownActive = safeEnd - lastTriggered < triggerSettings.cooldown;
    const duplicateRequired =
        scratchpadTrigger?.forceRequired &&
        String(stmbData.rpgContentLastTriggerReason || '').trim().toLowerCase() === String(scratchpadTrigger.reason || '').trim().toLowerCase() &&
        String(stmbData.rpgContentLastTriggerType || '').trim().toLowerCase() === String(scratchpadTrigger.memoryType || '').trim().toLowerCase() &&
        String(stmbData.rpgContentLastTemporalAnchor || '').trim().toLowerCase() === String(scratchpadTrigger.temporalAnchor || '').trim().toLowerCase();

    if (cooldownActive && (!scratchpadTrigger?.forceRequired || duplicateRequired)) {
        return {
            shouldCreateMemory: false,
            checked: true,
            scratchpadSignal: scratchpadTrigger?.scratchpadSignal || null,
        };
    }

    if (scratchpadTrigger?.suppressed) {
        return {
            shouldCreateMemory: false,
            checked: true,
            scratchpadSignal: scratchpadTrigger.scratchpadSignal || null,
        };
    }

    if (scratchpadTrigger) {
        return {
            shouldCreateMemory: true,
            checked: true,
            confidence: scratchpadTrigger.confidence,
            urgency: scratchpadTrigger.urgency,
            reason: scratchpadTrigger.reason,
            memoryType: scratchpadTrigger.memoryType,
            sceneStart,
            sceneEnd: safeEnd,
            reviewRequired: scratchpadTrigger.reviewRequired,
            scratchpadSignal: scratchpadTrigger.scratchpadSignal || null,
            memoryScope: scratchpadTrigger.memoryScope || '',
            temporalAnchor: scratchpadTrigger.temporalAnchor || '',
        };
    }

    if (cooldownActive) {
        return { shouldCreateMemory: false, checked: true };
    }

    if (!recentText) {
        return { shouldCreateMemory: false, checked: true };
    }

    const matches = [];
    let score = 0;
    for (const trigger of TRIGGER_PATTERNS) {
        if (trigger.pattern.test(recentText)) {
            matches.push(trigger);
            score += trigger.weight;
        }
    }

    if (score < 4) {
        return { shouldCreateMemory: false, checked: true };
    }

    matches.sort((a, b) => b.weight - a.weight);
    const primary = matches[0];
    const confidence = Math.min(0.95, 0.45 + (score * 0.1));

    return {
        shouldCreateMemory: true,
        checked: true,
        confidence,
        urgency: score >= 6 ? 'high' : 'normal',
        reason: primary.reason,
        memoryType: primary.type,
        sceneStart,
        sceneEnd: safeEnd,
        reviewRequired: score >= 6,
    };
}
