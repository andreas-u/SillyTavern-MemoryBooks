import { extension_settings } from '../../../extensions.js';
import { chat, chat_metadata } from '../../../../script.js';
import { METADATA_KEY } from '../../../world-info.js';
import { getSceneMarkers, saveMetadataForCurrentContext, clearScene } from './sceneManager.js';
import { showLorebookSelectionPopup, clampInt } from './utils.js';
import { Popup, POPUP_TYPE, POPUP_RESULT } from '../../../popup.js';
import { isMemoryProcessing } from './index.js';
import { translate } from '../../../i18n.js';
import { validateLorebookRequirement } from './lorebookValidation.js';
import { RPG_MEMORY } from './constants.js';
import { evaluateRpgContentTrigger } from './rpgTriggers.js';

let autoSummarySkippedForProcessing = false;
let autoSummarySkippedMarkersRef = null;

/**
 * i18n helper: translate with Mustache-style {{var}} interpolation
 * Use like i18n('KEY', 'Fallback {{var}}', { var: 'value' })
 * Internally calls SillyTavern's translate(fallback, key).
 */
function i18n(key, fallback, params) {
    const localized = translate(fallback, key);
    if (!params) return localized;
    return localized.replace(/{{\s*(\w+)\s*}}/g, (m, p1) => {
        const v = params[p1];
        return v !== undefined && v !== null ? String(v) : '';
    });
}

function storeScratchpadSignal(stmbData, signal) {
    if (!signal) {
        return;
    }

    stmbData.rpgScratchpadTriggerState = signal.state || '';
    stmbData.rpgScratchpadTriggerType = signal.type || '';
    stmbData.rpgScratchpadTriggerReason = signal.reason || '';
    stmbData.rpgScratchpadMemoryScope = signal.scope || '';
    stmbData.rpgScratchpadTemporalAnchor = signal.temporalAnchor || '';
    if (Number.isFinite(signal.scratchpadMessage)) {
        stmbData.rpgScratchpadLastSignalMessage = signal.scratchpadMessage;
    }
}

/**
 * Validates lorebook for auto-summary with user-friendly prompts
 */
async function validateLorebookForAutoSummary() {
    const settings = extension_settings.STMemoryBooks;
    const manualMode = !!settings?.moduleSettings?.manualModeEnabled;

    if (manualMode) {
        // Manual mode - check if a lorebook is already selected
        const stmbData = getSceneMarkers() || {};
        let lorebookName = stmbData.manualLorebook ?? null;

        // If no lorebook is selected, ask user what to do
        if (!lorebookName) {
            const popupContent = `
                <h4 data-i18n="STMemoryBooks_AutoSummaryReadyTitle">Auto-Summary Ready</h4>
                <div class="world_entry_form_control">
                    <p data-i18n="STMemoryBooks_AutoSummaryNoAssignedLorebook">Auto-summary is enabled but there is no assigned lorebook for this chat.</p>
                    <p data-i18n="STMemoryBooks_AutoSummarySelectOrPostponeQuestion">Would you like to select a lorebook for memory storage, or postpone this auto-summary?</p>
                    <label for="stmb-postpone-messages" data-i18n="STMemoryBooks_PostponeLabel">Postpone for how many messages?</label>
                    <select id="stmb-postpone-messages" class="text_pole">
                        <option value="10" data-i18n="STMemoryBooks_Postpone10">10 messages</option>
                        <option value="20" data-i18n="STMemoryBooks_Postpone20">20 messages</option>
                        <option value="30" data-i18n="STMemoryBooks_Postpone30">30 messages</option>
                        <option value="40" data-i18n="STMemoryBooks_Postpone40">40 messages</option>
                        <option value="50" data-i18n="STMemoryBooks_Postpone50">50 messages</option>
                    </select>
                </div>
            `;

            const popup = new Popup(popupContent, POPUP_TYPE.TEXT, '', {
                okButton: i18n('STMemoryBooks_Button_SelectLorebook', 'Select Lorebook'),
                cancelButton: i18n('STMemoryBooks_Button_Postpone', 'Postpone')
            });
            const result = await popup.show();

            if (result === POPUP_RESULT.AFFIRMATIVE) {
                // User wants to select a lorebook
                const selectedLorebook = await showLorebookSelectionPopup();
                if (selectedLorebook) {
                    stmbData.manualLorebook = selectedLorebook;
                    saveMetadataForCurrentContext();
                    lorebookName = selectedLorebook;
                } else {
                    return { valid: false, error: i18n('STMemoryBooks_Error_NoLorebookSelectedForAutoSummary', 'No lorebook selected for auto-summary.') };
                }
            } else {
                // User wants to postpone
                const postponeSelect = popup.dlg.querySelector('#stmb-postpone-messages');
                const parsed = parseInt(postponeSelect.value, 10);
                const postponeMessages = Number.isFinite(parsed) ? parsed : 10;

                const currentMessageCount = chat.length;

                // Set postpone flag
                stmbData.autoSummaryNextPromptAt = currentMessageCount + postponeMessages;
                saveMetadataForCurrentContext();

                console.log(i18n('autosummary.log.postponed', 'STMemoryBooks: Auto-summary postponed for {{count}} messages (until message {{until}})', { count: postponeMessages, until: stmbData.autoSummaryNextPromptAt }));
                return { valid: false, error: i18n('STMemoryBooks_Info_AutoSummaryPostponed', 'Auto-summary postponed for {{count}} messages.', { count: postponeMessages }) };
            }
        }

        return await validateLorebookRequirement({
            createContext: 'auto-summary',
            manualMode: true,
            lorebookName,
            retryText: i18n('STMemoryBooks_AutoSummaryRetryAfterSelection', 'After selecting a lorebook, try again.'),
        });
    }

    return await validateLorebookRequirement({
        createContext: 'auto-summary',
        manualMode: false,
        lorebookName: chat_metadata?.[METADATA_KEY] || null,
        retryText: i18n('STMemoryBooks_AutoSummaryRetryAfterSelection', 'After selecting a lorebook, try again.'),
    });
}

function isRpgAutoMemoryEnabled(settings) {
    return !!settings?.moduleSettings?.autoSummaryEnabled ||
        !!settings?.moduleSettings?.rpgMemoryModeEnabled;
}

function getRpgAutomationPolicy(settings) {
    const policy = String(settings?.moduleSettings?.rpgAutomationPolicy || '');
    return Object.values(RPG_MEMORY.AUTOMATION_POLICIES).includes(policy)
        ? policy
        : RPG_MEMORY.DEFAULT_AUTOMATION_POLICY;
}

async function confirmRpgManualAutoSummary(sceneStart, sceneEnd, reason = null) {
    const rangeText = i18n(
        'STMemoryBooks_RpgManualReviewReadyDescRange',
        'RPG campaign memory mode is ready to create a memory for messages {{start}}-{{end}}.',
        { start: sceneStart, end: sceneEnd },
    );
    const reasonText = reason
        ? `<p>${i18n('STMemoryBooks_RpgManualReviewReason', 'Trigger reason: {{reason}}', { reason })}</p>`
        : '';
    const questionText = i18n(
        'STMemoryBooks_RpgManualReviewQuestion',
        'Create it now, or postpone the check?',
    );
    const popupContent = `
        <h4 data-i18n="STMemoryBooks_RpgManualReviewReadyTitle">RPG Memory Ready</h4>
        <div class="world_entry_form_control">
            <p>${rangeText}</p>
            ${reasonText}
            <p>${questionText}</p>
        </div>
    `;
    const popup = new Popup(popupContent, POPUP_TYPE.TEXT, '', {
        okButton: i18n('STMemoryBooks_Button_CreateMemory', 'Create Memory'),
        cancelButton: i18n('STMemoryBooks_Button_Postpone', 'Postpone'),
    });
    const result = await popup.show();
    return result === POPUP_RESULT.AFFIRMATIVE;
}

/**
 * Check if auto-summary should trigger based on current message count and settings
 * @returns {Promise<void>}
 */
async function checkAutoSummaryTrigger() {
    try {
        const settings = extension_settings.STMemoryBooks;
        if (!isRpgAutoMemoryEnabled(settings)) {
            return;
        }

        const stmbData = getSceneMarkers() || {};
        const currentMessageCount = chat.length;
        const currentLastMessage = currentMessageCount - 1;
        const requiredInterval = settings.moduleSettings.autoSummaryInterval;
        const rawBuf = settings?.moduleSettings?.autoSummaryBuffer;
        const buffer = clampInt(parseInt(rawBuf) || 0, 0, 50);
        const requiredTotal = requiredInterval + buffer;
        const rawHighestProcessed = stmbData.highestMemoryProcessed;
        const hasHighestProcessed =
            typeof rawHighestProcessed === 'number' && Number.isFinite(rawHighestProcessed);
        // Treat "no baseline" as -1 (none processed yet) so the next range starts at 0.
        const highestProcessed = hasHighestProcessed ? rawHighestProcessed : -1;

        // Check if memory creation is in progress
        if (isMemoryProcessing()) {
            autoSummarySkippedForProcessing = true;
            autoSummarySkippedMarkersRef = stmbData;
            console.log(i18n('autosummary.log.skippedInProgress', 'STMemoryBooks: Auto-summary skipped - memory creation in progress'));
            return;
        }

        // Calculate messages since last memory
        let messagesSinceLastMemory;
        // Count messages since the last processed memory. With highestProcessed = -1, this becomes currentMessageCount.
        messagesSinceLastMemory = currentLastMessage - highestProcessed;
        if (!hasHighestProcessed) {
            console.log(i18n('autosummary.log.noPrevious', 'STMemoryBooks: No previous memories found - counting from start'));
        } else {
            console.log(i18n('autosummary.log.sinceLast', 'STMemoryBooks: Messages since last memory ({{highestProcessed}}): {{count}}', { highestProcessed, count: messagesSinceLastMemory }));
        }

        const contentTrigger = evaluateRpgContentTrigger(
            settings,
            stmbData,
            highestProcessed,
            currentLastMessage,
            buffer,
        );
        if (contentTrigger.checked) {
            storeScratchpadSignal(stmbData, contentTrigger.scratchpadSignal);
            saveMetadataForCurrentContext();
        }

        const intervalTriggered = messagesSinceLastMemory >= requiredTotal;
        console.log(i18n('autosummary.log.triggerCheck', 'STMemoryBooks: Auto-summary trigger check: {{count}} >= {{required}}?', { count: messagesSinceLastMemory, required: requiredTotal }));

        if (!contentTrigger.shouldCreateMemory && !intervalTriggered) {
            console.log(i18n('autosummary.log.notTriggered', 'STMemoryBooks: Auto-summary not triggered - need {{needed}} more messages', { needed: requiredTotal - messagesSinceLastMemory }));
            return;
        }

        // Check if user has postponed auto-summary
        if (stmbData.autoSummaryNextPromptAt && currentMessageCount < stmbData.autoSummaryNextPromptAt) {
            console.log(i18n('autosummary.log.postponedUntil', 'STMemoryBooks: Auto-summary postponed until message {{until}}', { until: stmbData.autoSummaryNextPromptAt }));
            return; // Still in postpone period
        }

        // Auto-summary will set new scene markers - no need to clear existing ones
        const lorebookValidation = await validateLorebookForAutoSummary();
        if (!lorebookValidation.valid) {
            console.log(i18n('autosummary.log.blocked', 'STMemoryBooks: Auto-summary blocked - lorebook validation failed: {{error}}', { error: lorebookValidation.error }));
            return; // No lorebook available or user cancelled
        }

        // Clear any postpone flag since we're proceeding with auto-summary
        if (stmbData.autoSummaryNextPromptAt) {
            delete stmbData.autoSummaryNextPromptAt;
            saveMetadataForCurrentContext();
            console.log(i18n('autosummary.log.clearedPostpone', 'STMemoryBooks: Cleared auto-summary postpone flag'));
        }

        // Calculate the scene range for auto-summary (apply buffer to end)
        let sceneStart, sceneEnd;
        if (contentTrigger.shouldCreateMemory) {
            sceneStart = contentTrigger.sceneStart;
            sceneEnd = contentTrigger.sceneEnd;
        } else {
            const sceneEndCandidate = currentLastMessage - buffer;
            const safeEnd = Math.max(0, sceneEndCandidate);
            // Start from the message after the last processed memory (or 0 if none processed yet).
            sceneStart = highestProcessed + 1;
            sceneEnd = safeEnd;
        }
        // Defensive: ensure valid range
        if (sceneStart > sceneEnd) {
            return;
        }

        if (contentTrigger.shouldCreateMemory) {
            console.log(i18n('autosummary.log.rpgContentTriggered', 'STMemoryBooks: RPG content trigger matched - {{reason}}; creating memory for range {{start}}-{{end}}', { reason: contentTrigger.reason, start: sceneStart, end: sceneEnd }));
        } else {
            console.log(i18n('autosummary.log.triggered', 'STMemoryBooks: Auto-summary triggered - creating memory for range {{start}}-{{end}}', { start: sceneStart, end: sceneEnd }));
        }

        if (
            settings?.moduleSettings?.rpgMemoryModeEnabled &&
            getRpgAutomationPolicy(settings) === RPG_MEMORY.AUTOMATION_POLICIES.MANUAL
        ) {
            const confirmed = await confirmRpgManualAutoSummary(sceneStart, sceneEnd, contentTrigger.reason);
            if (!confirmed) {
                stmbData.autoSummaryNextPromptAt = currentMessageCount + 10;
                saveMetadataForCurrentContext();
                console.log(i18n('autosummary.log.rpgManualPostponed', 'STMemoryBooks: RPG memory creation postponed for 10 messages'));
                return;
            }
        }

        // Set scene markers for the range we want to process
        stmbData.sceneStart = sceneStart;
        stmbData.sceneEnd = sceneEnd;
        if (contentTrigger.shouldCreateMemory) {
            stmbData.rpgContentLastTriggeredMessage = sceneEnd;
            stmbData.rpgContentLastTriggerReason = contentTrigger.reason;
            stmbData.rpgContentLastTriggerType = contentTrigger.memoryType;
            stmbData.rpgContentLastTriggerConfidence = contentTrigger.confidence;
            stmbData.rpgContentLastMemoryScope = contentTrigger.memoryScope || contentTrigger.scratchpadSignal?.scope || '';
            stmbData.rpgContentLastTemporalAnchor = contentTrigger.temporalAnchor || contentTrigger.scratchpadSignal?.temporalAnchor || '';
            stmbData.rpgContentLastScratchpadState = contentTrigger.scratchpadSignal?.state || '';
            stmbData.rpgContentLastReviewRequired = contentTrigger.reviewRequired === true;
        }
        saveMetadataForCurrentContext();

        // Use the existing memory creation system via slash command
        const { executeSlashCommands } = await import('../../../slash-commands.js');
        await executeSlashCommands('/creatememory');
    } catch (error) {
        console.error(i18n('autosummary.log.triggerError', 'STMemoryBooks: Error in auto-summary trigger check:'), error);
    }
}

/**
 * Handle auto-summary on message received
 * @returns {Promise<void>}
 */
export async function handleAutoSummaryMessageReceived() {
    try {
        if (isRpgAutoMemoryEnabled(extension_settings.STMemoryBooks)) {
            const currentMessageCount = chat.length;
            console.log(i18n('autosummary.log.messageReceivedSingle', 'STMemoryBooks: Message received - auto-summary enabled, current count: {{count}}', { count: currentMessageCount }));

            await checkAutoSummaryTrigger();
        }
    } catch (error) {
        console.error(i18n('autosummary.log.messageHandlerError', 'STMemoryBooks: Error in auto-summary message received handler:'), error);
    }
}

/**
 * Retry an auto-summary check that was skipped while memory/job processing was active.
 * @returns {Promise<void>}
 */
export async function retryAutoSummaryAfterJobIdle() {
    if (!autoSummarySkippedForProcessing) {
        return;
    }
    if (isMemoryProcessing()) {
        return;
    }
    if (autoSummarySkippedMarkersRef && autoSummarySkippedMarkersRef !== getSceneMarkers()) {
        autoSummarySkippedForProcessing = false;
        autoSummarySkippedMarkersRef = null;
        return;
    }

    autoSummarySkippedForProcessing = false;
    autoSummarySkippedMarkersRef = null;
    await checkAutoSummaryTrigger();
}

/**
 * Clear auto-summary state after successful memory creation
 * @returns {void}
 */
export function clearAutoSummaryState() {
    if (isRpgAutoMemoryEnabled(extension_settings.STMemoryBooks)) {
        // Clear scene markers; baseline is updated upon successful memory creation
        clearScene();
    }
}
