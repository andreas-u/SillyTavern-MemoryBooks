import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
    evaluateScratchpadTriggerFromMessages,
    getLatestRpgScratchpadSnapshotFromMessages,
    isDuplicateRequiredScratchpadTrigger,
    parseScratchpad,
} from '../rpgScratchpad.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const fixtureDir = resolve(rootDir, 'fixtures/rpg-scratchpad');

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function loadFixture(name) {
    return readFile(resolve(fixtureDir, name), 'utf8');
}

function assistantMessage(mes) {
    return { is_user: false, mes };
}

function userMessage(mes) {
    return { is_user: true, mes };
}

function assertParsedFixture(name, parsed, expectedState) {
    assert(parsed, `${name}: scratchpad was not parsed`);
    assert(parsed.displaySections.scene_state, `${name}: missing Scene State`);
    assert(parsed.displaySections.active_threads, `${name}: missing Active Threads & Stakes`);
    assert(parsed.displaySections.parallel_storylines, `${name}: missing Parallel Storylines`);
    assert(parsed.displaySections.next_cutaway, `${name}: missing Next Cutaway Candidate`);
    assert(parsed.displaySections.narrator_notes, `${name}: missing Narrator Notes`);
    assert(parsed.memoryTrigger, `${name}: missing Memory Trigger`);
    assert(
        String(parsed.memoryTrigger.state).toLowerCase() === expectedState,
        `${name}: expected trigger state ${expectedState}, got ${parsed.memoryTrigger.state}`,
    );
}

const previous = await loadFixture('previous.html');
const none = await loadFixture('none.html');
const candidate = await loadFixture('candidate.html');
const required = await loadFixture('required.html');

const parsedPrevious = parseScratchpad(previous);
const parsedNone = parseScratchpad(none);
const parsedCandidate = parseScratchpad(candidate);
const parsedRequired = parseScratchpad(required);

assertParsedFixture('previous.html', parsedPrevious, 'none');
assertParsedFixture('none.html', parsedNone, 'none');
assertParsedFixture('candidate.html', parsedCandidate, 'candidate');
assertParsedFixture('required.html', parsedRequired, 'required');

const noneMessages = [
    userMessage('Can a look be enough?'),
    assistantMessage(previous),
    userMessage('So what does before look like?'),
    assistantMessage(none),
];
const noneTrigger = evaluateScratchpadTriggerFromMessages(noneMessages, 0, noneMessages.length - 1);
assert(noneTrigger?.suppressed === true, 'State none should suppress scratchpad-delta memory creation');
assert(noneTrigger?.scratchpadSignal?.state === 'none', 'State none should expose a dashboard signal');

const candidateMessages = [
    userMessage('Can a look be enough?'),
    assistantMessage(previous),
    userMessage('So what does before look like?'),
    assistantMessage(candidate),
];
const candidateTrigger = evaluateScratchpadTriggerFromMessages(candidateMessages, 0, candidateMessages.length - 1);
assert(candidateTrigger?.candidateOnly === true, 'State candidate should remain a non-generating scratchpad signal');
assert(candidateTrigger?.scratchpadSignal?.state === 'candidate', 'State candidate should expose a dashboard signal');
assert(candidateTrigger?.scratchpadSignal?.scope.includes('relationship framework'), 'State candidate should preserve Memory Scope');
assert(candidateTrigger?.scratchpadSignal?.temporalAnchor.includes('Thursday Oct 17 2024'), 'State candidate should preserve Temporal Anchor');

const requiredMessages = [
    userMessage('Can a look be enough?'),
    assistantMessage(previous),
    userMessage('So what does before look like?'),
    assistantMessage(required),
];
const requiredTrigger = evaluateScratchpadTriggerFromMessages(requiredMessages, 0, requiredMessages.length - 1);
assert(requiredTrigger?.forceRequired === true, 'State required should force memory creation');
assert(requiredTrigger?.reviewRequired === true, 'State required should require review');
assert(requiredTrigger?.memoryType === 'relationship_framework_rule', 'State required should preserve Type');
assert(requiredTrigger?.memoryScope.includes('durable relationship framework'), 'State required should preserve Memory Scope');
assert(requiredTrigger?.temporalAnchor.includes('~6:30 PM'), 'State required should preserve Temporal Anchor');

const duplicateMarkers = {
    rpgContentLastTriggerReason: requiredTrigger.reason,
    rpgContentLastTriggerType: requiredTrigger.memoryType,
    rpgContentLastTemporalAnchor: requiredTrigger.temporalAnchor,
};
assert(
    isDuplicateRequiredScratchpadTrigger(duplicateMarkers, requiredTrigger),
    'Duplicate required trigger should be detectable for cooldown suppression',
);

const snapshot = getLatestRpgScratchpadSnapshotFromMessages(requiredMessages);
assert(snapshot?.messageIndex === 3, 'Dashboard snapshot should point at latest scratchpad message');
assert(snapshot.sceneState.includes('Thursday, October 17, 2024'), 'Dashboard snapshot should include readable Scene State');
assert(snapshot.activeThreads.includes('framework'), 'Dashboard snapshot should include readable Active Threads');
assert(snapshot.parallelStorylines.includes('The Lone Star Friday'), 'Dashboard snapshot should include readable Parallel Storylines');
assert(snapshot.nextCutaway.includes('Lone Star exterior'), 'Dashboard snapshot should include readable Next Cutaway');
assert(snapshot.narratorNotes.includes('Store the live pre-action signal rule'), 'Dashboard snapshot should include readable Narrator Notes');

console.log('RPG scratchpad parser/debug checks passed.');
