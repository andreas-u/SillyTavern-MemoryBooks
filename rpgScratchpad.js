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

export function getMessageText(message) {
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

function cleanDisplayText(text) {
    return stripHtml(text)
        .replace(/\s+/g, ' ')
        .trim();
}

function extractLabelDisplayValue(text, labels, repeated = false) {
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
            const value = cleanDisplayText(text.slice(valueStart, valueEnd));
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

export function parseScratchpad(rawText) {
    const scratchpadText = extractScratchpadText(rawText);
    if (!scratchpadText) {
        return null;
    }

    const sections = {};
    const displaySections = {};
    for (const rule of SCRATCHPAD_SECTION_RULES) {
        const labels = [rule.label, ...(rule.aliases || [])];
        sections[rule.key] = extractLabelValues(scratchpadText, labels, !!rule.repeated);
        displaySections[rule.key] = extractLabelDisplayValue(scratchpadText, labels, !!rule.repeated);
    }

    return {
        sections,
        displaySections,
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

function findRecentScratchpads(messages, sceneStart, safeEnd) {
    const scratchpads = [];
    const lookbackStart = Math.max(0, sceneStart - 20);
    for (let index = safeEnd; index >= lookbackStart && scratchpads.length < 3; index -= 1) {
        const message = messages[index];
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

function summarizeForDashboard(value, maxLength = 240) {
    const text = cleanDisplayText(value);
    if (!text) {
        return '';
    }
    if (text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

export function getLatestRpgScratchpadSnapshotFromMessages(messages, maxLookback = 80) {
    const end = messages.length - 1;
    const start = Math.max(0, end - maxLookback + 1);

    for (let index = end; index >= start; index -= 1) {
        const message = messages[index];
        if (!isAssistantMessage(message)) {
            continue;
        }

        const parsed = parseScratchpad(getMessageText(message));
        if (!parsed) {
            continue;
        }

        return {
            messageIndex: index,
            sceneState: summarizeForDashboard(parsed.displaySections.scene_state, 260),
            activeThreads: summarizeForDashboard(parsed.displaySections.active_threads, 280),
            parallelStorylines: summarizeForDashboard(parsed.displaySections.parallel_storylines, 260),
            nextCutaway: summarizeForDashboard(parsed.displaySections.next_cutaway, 220),
            narratorNotes: summarizeForDashboard(parsed.displaySections.narrator_notes, 220),
            memoryTrigger: parsed.memoryTrigger || null,
        };
    }

    return null;
}

export function evaluateScratchpadTriggerFromMessages(messages, sceneStart, safeEnd) {
    const scratchpads = findRecentScratchpads(messages, sceneStart, safeEnd);
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

    if (explicitState === 'candidate') {
        return {
            candidateOnly: true,
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

export function isDuplicateRequiredScratchpadTrigger(stmbData, scratchpadTrigger) {
    return !!scratchpadTrigger?.forceRequired &&
        String(stmbData?.rpgContentLastTriggerReason || '').trim().toLowerCase() === String(scratchpadTrigger.reason || '').trim().toLowerCase() &&
        String(stmbData?.rpgContentLastTriggerType || '').trim().toLowerCase() === String(scratchpadTrigger.memoryType || '').trim().toLowerCase() &&
        String(stmbData?.rpgContentLastTemporalAnchor || '').trim().toLowerCase() === String(scratchpadTrigger.temporalAnchor || '').trim().toLowerCase();
}
