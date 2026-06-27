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

function getMessageText(message) {
    if (!message || typeof message !== 'object') {
        return '';
    }
    return String(message.mes || message.message || message.text || '').trim();
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

    const lastTriggered = Number.isFinite(stmbData.rpgContentLastTriggeredMessage)
        ? stmbData.rpgContentLastTriggeredMessage
        : highestProcessed;
    if (safeEnd - lastTriggered < triggerSettings.cooldown) {
        stmbData.rpgContentLastCheckMessage = safeEnd;
        return { shouldCreateMemory: false, checked: true };
    }

    const checkStart = Math.max(sceneStart, safeEnd - triggerSettings.checkCadence + 1);
    const recentText = buildRecentText(checkStart, safeEnd);
    stmbData.rpgContentLastCheckMessage = safeEnd;

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
