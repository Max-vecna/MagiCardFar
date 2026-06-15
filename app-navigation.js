import { saveCharacterCard, editCard, importCard, getCurrentEditingCardId, exportCard, resetCharacterFormState, setCharacterFormType, populateCharacterSelect, getCharacterItems, handleCharacterFormCloseRequest } from './manager-character.js';
import { populateSpellAumentosSelect, saveSpellCard, editSpell, importSpell, exportSpell, showImagePreview, resetSpellFormState, handleSpellFormCloseRequest } from './manager-magic.js';
import { populateItemAumentosSelect, saveItemCard, editItem, importItem, removeItem, exportItem, resetItemFormState, handleItemFormCloseRequest } from './manager-item.js';
import { renderCategoryScreen, populateCategorySelect } from './manager-category.js';
import { renderGrimoireScreen } from './manager-grimoire.js';
import { openDatabase, removeData, getData, saveData, exportDatabase, importDatabase, exportImagesAsPng, showProgressModal, hideProgressModal, updateProgress } from './db-local.js';
import { renderFullCharacterSheet } from './renderer-character-card.js';
import { renderFullSpellSheet } from './renderer-magic-card.js';
import { renderFullItemSheet } from './renderer-item-card.js';
import { clearArenaModelTemplates, hasArenaModel, seedArenaModelTemplatesFromLocalData } from './renderer-arena-model.js';
import { bufferToBlob, renderCompactCardPreview, showCustomAlert, showCustomConfirm } from './ui-utils.js';

let renderContent;
let contentDisplay;
let mainContainer;

const PRELOAD_VIEW_TARGETS = ['personagem-em-jogo', 'personagem', 'criaturas', 'magias', 'habilidades', 'ataques', 'itens'];
const IN_PLAY_DEPENDENCY_TYPES = new Set(['personagem', 'itens', 'magias', 'habilidades', 'ataques']);

export function isCombatActive() {
    return false;
}

const RELATED_GRID_TYPES = new Set(['magias', 'habilidades', 'ataques']);
const RELATED_CARD_TYPES = new Set(['spell', 'attack']);
const ROLE_LABELS = {
    base: 'Base',
    enhance: 'Aprimorar',
    true: 'Verdadeiro'
};
const MENU_ACTION_LABELS = {
    edit: 'editar',
    remove: 'excluir',
    delete: 'excluir',
    'export-json': 'exportar',
    'reset-arena-model': 'voltar ao visual original'
};

const EFFECT_FORM_CONFIGS = {
    magias: {
        dataType: 'magia',
        createTitle: 'Nova Magia',
        createSubmitText: 'Criar Magia',
        hideManaCost: false
    },
    habilidades: {
        dataType: 'habilidade',
        createTitle: 'Nova Habilidade',
        createSubmitText: 'Criar Habilidade',
        hideManaCost: true
    },
    ataques: {
        dataType: 'ataque',
        createTitle: 'Novo Ataque',
        createSubmitText: 'Criar Ataque',
        hideManaCost: true
    }
};

const EFFECT_VIEW_BY_ACTION = {
    'add-spell': 'magias',
    'add-habilidade': 'habilidades',
    'add-attack': 'ataques'
};

function getEffectFormConfigFromAction(action) {
    return EFFECT_FORM_CONFIGS[EFFECT_VIEW_BY_ACTION[action]] || EFFECT_FORM_CONFIGS.magias;
}

function applyEffectFormChrome(elements, config) {
    if (elements.form) elements.form.dataset.type = config.dataType;
    if (elements.title) elements.title.textContent = config.createTitle;
    if (elements.submitButton) elements.submitButton.textContent = config.createSubmitText;
    document.getElementById('mana-cost-wrapper')?.classList.toggle('hidden', config.hideManaCost);
}

async function prepareEffectFormCreate(elements, config) {
    resetSpellFormState();
    applyEffectFormChrome(elements, config);
    populateSpellAumentosSelect();
    await populateCharacterSelect('spellCharacterOwner');
    await populateCategorySelect('spell-category-select', config.dataType);
}

async function runLocalDatabaseExport() {
    showProgressModal("Exportando Banco de Dados...");
    try {
        await exportDatabase(updateProgress);
        showCustomAlert("Banco de dados exportado com sucesso!");
    } catch (error) {
        console.error("Erro ao exportar banco de dados:", error);
        showCustomAlert("Ocorreu um erro ao exportar.");
    } finally {
        hideProgressModal();
    }
}

async function runImagesExport() {
    showProgressModal("Exportando Imagens...");
    try {
        await exportImagesAsPng(updateProgress);
    } catch (error) {
        console.error("Erro ao exportar imagens:", error);
        showCustomAlert("Ocorreu um erro ao exportar as imagens.");
    } finally {
        hideProgressModal();
    }
}

function cardHasArenaLayout(card) {
    return Boolean(card && hasArenaModel(card));
}

const ARENA_MODEL_RECORD_STORES = ['rpgCards', 'rpgEffects', 'rpgItems', 'rpgSpells', 'rpgAttacks'];

function removeArenaModelFields(record) {
    if (!record || typeof record !== 'object') return false;
    const keys = ['arenaModel', '_arenaModel', 'disableArenaModel', '_disableArenaModel'];
    const hadArenaState = keys.some(key => Object.prototype.hasOwnProperty.call(record, key));
    keys.forEach(key => delete record[key]);
    return hadArenaState;
}

function refreshAllCardViews() {
    ['personagem-em-jogo', 'personagem', 'criaturas', 'magias', 'habilidades', 'itens', 'ataques'].forEach(view => {
        document.getElementById(`view-${view}`)?.remove();
    });
    const activeNav = document.querySelector('.nav-button.active, .desktop-nav-button.active')?.dataset.target || 'personagem-em-jogo';
    if (typeof renderContent === 'function') renderContent(activeNav, true);
}

async function resetAllArenaModelsToDefault() {
    if (!(await showCustomConfirm('Remover o modelo Arena exportado e voltar todos os cards para o visual padrao da ficha?'))) return;

    clearArenaModelTemplates();
    let changedRecords = 0;
    for (const storeName of ARENA_MODEL_RECORD_STORES) {
        const records = (await getData(storeName)) || [];
        for (const record of records) {
            if (!removeArenaModelFields(record)) continue;
            await saveData(storeName, record);
            changedRecords++;
        }
    }

    refreshAllCardViews();
    const suffix = changedRecords ? ` ${changedRecords} card${changedRecords === 1 ? '' : 's'} atualizado${changedRecords === 1 ? '' : 's'}.` : '';
    showCustomAlert(`Modelo Arena removido. Os cards voltaram ao modelo padrao.${suffix}`);
}

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getCardDisplayName(card) {
    return card?.name || card?.title || 'Card sem nome';
}

function getStoreNameForCardType(cardType) {
    if (cardType === 'character' || cardType === 'creature') return 'rpgCards';
    if (cardType === 'item') return 'rpgItems';
    if (cardType === 'spell' || cardType === 'attack') return 'rpgEffects';
    return '';
}

function buildRelatedCardIdSets(items) {
    const enhanceIds = new Set();
    const trueIds = new Set();

    items.forEach(item => {
        if (item?.enhanceCardId) enhanceIds.add(String(item.enhanceCardId));
        if (item?.trueCardId) trueIds.add(String(item.trueCardId));
    });

    return { enhanceIds, trueIds };
}

function getGridBaseCards(items, referenceItems = items) {
    const { enhanceIds, trueIds } = buildRelatedCardIdSets(referenceItems);

    return items.filter(item => {
        if (!item?.id) return false;
        const id = String(item.id);
        if (enhanceIds.has(id) || trueIds.has(id)) return false;
        if (item.cardVariant === 'enhance' || item.cardVariant === 'true') return false;
        return true;
    });
}

function getEventTypeForEffect(effectData) {
    if (effectData?.type === 'habilidade') return 'habilidades';
    if (effectData?.type === 'ataque') return 'ataques';
    return 'magias';
}

async function unlinkCardsFromRelatedBases(storeName, cardIds) {
    if (!storeName || !Array.isArray(cardIds) || cardIds.length === 0) return;

    const targetIds = new Set(cardIds.map(id => String(id)).filter(Boolean));
    if (targetIds.size === 0) return;

    const cards = (await getData(storeName)) || [];
    const parentsToUpdate = cards.filter(card => {
        if (targetIds.has(String(card?.id || ''))) return false;
        return targetIds.has(String(card?.enhanceCardId || '')) || targetIds.has(String(card?.trueCardId || ''));
    });

    await Promise.all(parentsToUpdate.map(parent => {
        if (targetIds.has(String(parent.enhanceCardId || ''))) parent.enhanceCardId = '';
        if (targetIds.has(String(parent.trueCardId || ''))) parent.trueCardId = '';
        return saveData(storeName, parent);
    }));
}

function normalizeRelatedRole(role) {
    return role === 'enhance' || role === 'true' ? role : 'base';
}

function getReferencedRelation(cards, cardId) {
    const targetId = String(cardId || '');
    const parent = cards.find(card => String(card?.enhanceCardId || '') === targetId || String(card?.trueCardId || '') === targetId);
    if (!parent) return { role: 'base', baseCardId: '' };
    return {
        role: String(parent.trueCardId || '') === targetId ? 'true' : 'enhance',
        baseCardId: parent.id
    };
}

function getBaseChildRole(baseCard, childCard) {
    const childId = String(childCard?.id || '');
    if (String(baseCard?.trueCardId || '') === childId) return 'true';
    if (String(baseCard?.enhanceCardId || '') === childId) return 'enhance';

    const explicitRole = normalizeRelatedRole(childCard?.cardVariant);
    return explicitRole === 'base' ? 'enhance' : explicitRole;
}

async function getRelatedDeleteTargets(storeName, cardId) {
    if (!storeName || !cardId) return [];

    const selectedCard = await getData(storeName, cardId);
    if (!selectedCard) return [];
    if (storeName === 'rpgItems') {
        return [{
            role: 'base',
            id: String(selectedCard.id || cardId),
            card: selectedCard
        }];
    }

    const cards = (await getData(storeName)) || [];
    const cardsById = new Map(cards.map(card => [String(card?.id || ''), card]).filter(([id]) => id));
    const selectedId = String(selectedCard.id || cardId);
    const referencedRelation = getReferencedRelation(cards, selectedId);
    const selectedRole = normalizeRelatedRole(selectedCard.cardVariant);
    const isRelatedCard = selectedRole !== 'base' || referencedRelation.role !== 'base';
    const targets = [];
    const seenIds = new Set();

    const addTarget = (role, id) => {
        const normalizedId = String(id || '');
        if (!normalizedId || seenIds.has(normalizedId)) return;
        const card = normalizedId === selectedId ? selectedCard : cardsById.get(normalizedId);
        if (!card) return;
        seenIds.add(normalizedId);
        targets.push({
            role: normalizeRelatedRole(role),
            id: normalizedId,
            card
        });
    };

    if (isRelatedCard) {
        addTarget(selectedRole !== 'base' ? selectedRole : referencedRelation.role, selectedId);
        return targets;
    }

    addTarget('base', selectedId);
    addTarget('enhance', selectedCard.enhanceCardId);
    addTarget('true', selectedCard.trueCardId);

    cards.forEach(card => {
        if (String(card?.baseCardId || '') !== selectedId) return;
        addTarget(getBaseChildRole(selectedCard, card), card.id);
    });

    return targets;
}

function buildDeleteConfirmMessage(deleteTargets) {
    if (!Array.isArray(deleteTargets) || deleteTargets.length <= 1) {
        return 'Tem certeza que deseja excluir?';
    }

    const relatedTargets = deleteTargets.filter(target => target.role !== 'base');
    const relatedList = relatedTargets
        .map(target => `${ROLE_LABELS[target.role] || 'Relacionado'}: ${getCardDisplayName(target.card)}`)
        .join(', ');

    return `Excluir este card base tambem exclui ${relatedTargets.length === 1 ? 'o card relacionado' : 'os cards relacionados'}: ${relatedList}. Deseja continuar?`;
}

function getCardCountLabel(count) {
    return count === 1 ? 'card' : 'cards';
}

function buildBulkDeleteConfirmMessage(selectedCount, deleteTargetCount) {
    if (selectedCount <= 1) {
        return null;
    }

    const relatedCount = Math.max(0, deleteTargetCount - selectedCount);
    if (relatedCount > 0) {
        return `Apagar ${selectedCount} ${getCardCountLabel(selectedCount)} selecionados tambem apagara ${relatedCount} ${getCardCountLabel(relatedCount)} relacionados. No total, ${deleteTargetCount} ${getCardCountLabel(deleteTargetCount)} serao apagados. Deseja continuar?`;
    }

    return `Tem certeza que deseja apagar ${selectedCount} ${getCardCountLabel(selectedCount)} selecionados?`;
}

async function removeRelatedDeleteTargets(storeName, deleteTargets) {
    const targetIds = deleteTargets.map(target => target.id).filter(Boolean);
    await unlinkCardsFromRelatedBases(storeName, targetIds);

    for (const targetId of targetIds) {
        await removeData(storeName, targetId);
    }
}

async function collectBulkDeleteTargets(selectedCards) {
    const groupsByStore = new Map();
    const selectedKeys = new Set();

    for (const card of selectedCards) {
        const cardId = card.dataset.id;
        const cardType = card.dataset.type;
        const storeName = getStoreNameForCardType(cardType);
        if (!storeName || !cardId) continue;

        const deleteTargets = await getRelatedDeleteTargets(storeName, cardId);
        if (deleteTargets.length === 0) continue;

        selectedKeys.add(`${storeName}:${cardId}`);

        if (!groupsByStore.has(storeName)) {
            groupsByStore.set(storeName, new Map());
        }

        const targetsById = groupsByStore.get(storeName);
        deleteTargets.forEach(target => {
            if (!target?.id) return;
            targetsById.set(String(target.id), target);
        });
    }

    const groups = Array.from(groupsByStore, ([storeName, targetsById]) => ({
        storeName,
        deleteTargets: Array.from(targetsById.values())
    }));

    const deleteTargetCount = groups.reduce((total, group) => total + group.deleteTargets.length, 0);

    return {
        groups,
        selectedCount: selectedKeys.size,
        deleteTargetCount
    };
}

async function removeBulkDeleteTargets(groups) {
    for (const group of groups) {
        await removeRelatedDeleteTargets(group.storeName, group.deleteTargets);
    }
}

async function getMenuActionTargets(cardType, cardId) {
    if (!RELATED_CARD_TYPES.has(cardType)) return [];

    const storeName = getStoreNameForCardType(cardType);
    const selectedCard = await getData(storeName, cardId);
    if (!selectedCard) return [];

    let baseCard = selectedCard;
    if (selectedCard.baseCardId && selectedCard.cardVariant !== 'base') {
        baseCard = await getData(storeName, selectedCard.baseCardId) || selectedCard;
    }

    const targetSpecs = [
        { role: 'base', id: baseCard.id },
        { role: 'enhance', id: baseCard.enhanceCardId },
        { role: 'true', id: baseCard.trueCardId }
    ];

    const seenIds = new Set();
    const targets = [];

    for (const spec of targetSpecs) {
        if (!spec.id || seenIds.has(spec.id)) continue;
        const card = spec.id === selectedCard.id ? selectedCard : await getData(storeName, spec.id);
        if (!card) continue;
        seenIds.add(spec.id);
        targets.push({
            ...spec,
            card,
            cardType
        });
    }

    return targets;
}

function showRelatedCardActionModal(targets, action) {
    return new Promise(resolve => {
        const modalId = `related-card-action-modal-${Date.now()}`;
        const actionLabel = MENU_ACTION_LABELS[action] || 'usar';
        const optionsHtml = targets.map(target => {
            const roleLabel = ROLE_LABELS[target.role] || 'Card';
            const cardName = getCardDisplayName(target.card);
            const typeLabel = target.card?.type === 'ataque'
                ? 'Ataque'
                : (target.card?.type === 'habilidade' ? 'Habilidade' : (target.cardType === 'item' ? 'Item' : 'Magia'));

            return `
                <button type="button" class="related-card-action-option" data-target-id="${escapeHtml(String(target.id))}">
                    <span class="related-card-action-option__role">${escapeHtml(roleLabel)}</span>
                    <span class="related-card-action-option__name">${escapeHtml(cardName)}</span>
                    <span class="related-card-action-option__type">${escapeHtml(typeLabel)}</span>
                </button>
            `;
        }).join('');

        document.body.insertAdjacentHTML('beforeend', `
            <div id="${modalId}" class="related-card-action-modal" role="dialog" aria-modal="true">
                <div class="related-card-action-modal__dialog">
                    <div class="related-card-action-modal__header">
                        <div>
                            <p class="related-card-action-modal__eyebrow">Escolher alvo</p>
                            <h3 class="related-card-action-modal__title">Qual card voce quer ${escapeHtml(actionLabel)}?</h3>
                        </div>
                        <button type="button" class="related-card-action-modal__close" data-related-action-cancel aria-label="Fechar">&times;</button>
                    </div>
                    <div class="related-card-action-modal__list">
                        ${optionsHtml}
                    </div>
                    <button type="button" class="related-card-action-modal__cancel" data-related-action-cancel>Cancelar</button>
                </div>
            </div>
        `);

        const modal = document.getElementById(modalId);
        const cleanup = (target = null) => {
            modal.remove();
            resolve(target);
        };

        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.closest('[data-related-action-cancel]')) {
                cleanup(null);
                return;
            }

            const optionBtn = e.target.closest('.related-card-action-option');
            if (!optionBtn) return;
            cleanup(targets.find(target => String(target.id) === optionBtn.dataset.targetId) || null);
        });
    });
}

async function resolveMenuActionTarget(cardType, cardId, action) {
    if (!RELATED_CARD_TYPES.has(cardType)) {
        return { cardType, id: cardId };
    }

    const targets = await getMenuActionTargets(cardType, cardId);
    if (targets.length <= 1) {
        return { cardType, id: cardId };
    }

    const selectedTarget = await showRelatedCardActionModal(targets, action);
    if (!selectedTarget) return null;

    return {
        cardType: selectedTarget.cardType,
        id: selectedTarget.id
    };
}

function createBulkDeleteToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'bulk-delete-toolbar';
    toolbar.dataset.bulkDeleteToolbar = 'true';
    toolbar.innerHTML = `
        <button type="button" class="bulk-delete-toolbar__button bulk-delete-toolbar__button--icon bulk-delete-toolbar__button--select" data-bulk-action="start" title="Selecionar cards" aria-label="Selecionar cards">
            <i class="fas fa-square-check"></i>
        </button>
        <button type="button" class="bulk-delete-toolbar__button bulk-delete-toolbar__button--icon bulk-delete-toolbar__button--model-reset" data-bulk-action="reset-arena-models" title="Remover modelo Arena exportado" aria-label="Remover modelo Arena exportado">
            <i class="fas fa-rotate-left"></i>
        </button>
        <span class="bulk-delete-toolbar__status" data-bulk-status>0 selecionados</span>
        <button type="button" class="bulk-delete-toolbar__button bulk-delete-toolbar__button--danger" data-bulk-action="delete" disabled title="Apagar selecionados">
            <i class="fas fa-trash-alt"></i>
            <span>Apagar</span>
        </button>
        <button type="button" class="bulk-delete-toolbar__button bulk-delete-toolbar__button--ghost" data-bulk-action="cancel" title="Cancelar selecao">
            <i class="fa-solid fa-xmark"></i>
            <span>Cancelar</span>
        </button>
    `;
    return toolbar;
}

function createCardListActionBar({ addAction, addLabel, importBtnId, importInputId, importTitle }) {
    const actionBar = document.createElement('div');
    actionBar.className = 'card-list-actions';
    actionBar.innerHTML = `
        <div class="card-list-actions__primary">
            <button type="button" class="card-list-actions__button card-list-actions__button--add" data-action="${addAction}" title="${addLabel}" aria-label="${addLabel}">
                <i class="fas fa-plus"></i>
            </button>
            <button type="button" id="${importBtnId}" class="card-list-actions__button card-list-actions__button--import" title="${importTitle}" aria-label="${importTitle}">
                <i class="fas fa-upload"></i>
            </button>
            <input type="file" id="${importInputId}" accept=".json" class="hidden">
            <button type="button" class="card-list-actions__button card-list-actions__button--export" data-action="export-database" title="Exportar Backup Local" aria-label="Exportar Backup Local">
                <i class="fas fa-file-download"></i>
            </button>
        </div>
    `;
    actionBar.appendChild(createBulkDeleteToolbar());
    return actionBar;
}

function addBulkSelectorToCard(cardWrapper, cardData) {
    const cardName = getCardDisplayName(cardData);
    cardWrapper.classList.add('bulk-selectable-card');
    cardWrapper.dataset.bulkSelectable = 'true';
    cardWrapper.dataset.cardName = cardName;
    cardWrapper.insertAdjacentHTML('beforeend', `
        <button type="button" class="bulk-card-selector" data-bulk-selector aria-label="Selecionar ${escapeHtml(cardName)}" aria-pressed="false">
            <span class="bulk-card-selector__mark">&#10003;</span>
        </button>
    `);
}

function setupBulkDeleteControls(container, eventType) {
    const toolbar = container.querySelector('[data-bulk-delete-toolbar]');
    if (!toolbar || toolbar.dataset.bulkReady === 'true') return;

    toolbar.dataset.bulkReady = 'true';

    const startBtn = toolbar.querySelector('[data-bulk-action="start"]');
    const deleteBtn = toolbar.querySelector('[data-bulk-action="delete"]');
    const cancelBtn = toolbar.querySelector('[data-bulk-action="cancel"]');
    const statusEl = toolbar.querySelector('[data-bulk-status]');
    const selectedKeys = new Set();
    let selectionActive = false;
    let isDeleting = false;

    const getSelectableCards = () => Array.from(container.querySelectorAll('.rpg-thumbnail[data-bulk-selectable="true"]'));
    const getCardKey = card => `${card.dataset.type || ''}:${card.dataset.id || ''}`;

    const updateToolbar = () => {
        const selectedCount = selectedKeys.size;
        if (statusEl) {
            statusEl.textContent = `${selectedCount} ${selectedCount === 1 ? 'selecionado' : 'selecionados'}`;
        }
        if (deleteBtn) {
            deleteBtn.disabled = selectedCount === 0 || isDeleting;
        }
    };

    const setCardSelected = (card, selected) => {
        const key = getCardKey(card);
        if (!key.includes(':') || key.endsWith(':')) return;

        card.classList.toggle('bulk-selected', selected);
        const selector = card.querySelector('[data-bulk-selector]');
        if (selector) {
            selector.setAttribute('aria-pressed', selected ? 'true' : 'false');
            selector.title = selected ? 'Remover da selecao' : 'Selecionar card';
        }

        if (selected) {
            selectedKeys.add(key);
        } else {
            selectedKeys.delete(key);
        }
        updateToolbar();
    };

    const clearSelection = () => {
        getSelectableCards().forEach(card => setCardSelected(card, false));
        selectedKeys.clear();
        updateToolbar();
    };

    const closeThumbnailMenus = () => {
        container.querySelectorAll('.rpg-thumbnail.menu-active').forEach(activeThumb => {
            activeThumb.classList.remove('menu-active');
            activeThumb.style.zIndex = '';
            activeThumb.querySelector('.thumbnail-menu')?.classList.remove('active', 'menu-left');
        });
    };

    const setSelectionActive = (active) => {
        selectionActive = active;
        container.classList.toggle('bulk-delete-active', active);
        toolbar.classList.toggle('bulk-delete-toolbar--active', active);
        closeThumbnailMenus();

        if (!active) {
            clearSelection();
        } else {
            updateToolbar();
        }
    };

    const deleteSelectedCards = async () => {
        if (isDeleting || selectedKeys.size === 0) return;

        const selectedCards = getSelectableCards().filter(card => selectedKeys.has(getCardKey(card)));
        const { groups, selectedCount, deleteTargetCount } = await collectBulkDeleteTargets(selectedCards);

        if (deleteTargetCount === 0) {
            showCustomAlert('Nenhum card selecionado foi encontrado.');
            setSelectionActive(false);
            return;
        }

        const confirmMessage = selectedCount === 1
            ? buildDeleteConfirmMessage(groups[0]?.deleteTargets || [])
            : buildBulkDeleteConfirmMessage(selectedCount, deleteTargetCount);

        if (!(await showCustomConfirm(confirmMessage))) return;

        isDeleting = true;
        updateToolbar();

        try {
            await removeBulkDeleteTargets(groups);
            setSelectionActive(false);
            document.dispatchEvent(new CustomEvent('dataChanged', { detail: { type: eventType } }));
        } finally {
            isDeleting = false;
            updateToolbar();
        }
    };

    toolbar.hidden = getSelectableCards().length === 0;

    toolbar.addEventListener('click', async (e) => {
        const actionBtn = e.target.closest('[data-bulk-action]');
        if (!actionBtn) return;

        e.preventDefault();
        e.stopPropagation();

        const action = actionBtn.dataset.bulkAction;
        if (action === 'start') {
            setSelectionActive(true);
        } else if (action === 'cancel') {
            setSelectionActive(false);
        } else if (action === 'delete') {
            await deleteSelectedCards();
        } else if (action === 'reset-arena-models') {
            await resetAllArenaModelsToDefault();
        }
    });

    container.addEventListener('click', (e) => {
        if (!selectionActive) return;

        const card = e.target.closest('.rpg-thumbnail[data-bulk-selectable="true"]');
        if (!card || !container.contains(card)) return;

        e.preventDefault();
        e.stopPropagation();
        setCardSelected(card, !selectedKeys.has(getCardKey(card)));
    });
}
async function renderCharacterInGame(container) {
    const allCharacters = (await getData('rpgCards')).filter(char => char.cardType !== 'creature');
    const characterInPlay = allCharacters.find(char => char.inPlay);

    container.innerHTML = '';
    contentDisplay.style.background = '';
    contentDisplay.style.boxShadow = '';
    if (mainContainer) mainContainer.style.overflowY = 'hidden';
    contentDisplay.style.overflowY = 'visible';
    contentDisplay.classList.add('justify-center');

    if (characterInPlay) {
        await renderFullCharacterSheet(characterInPlay, false, true, container);
    } else {
        container.innerHTML = `
            <div class="w-full h-full flex flex-col items-center justify-center">
                <button id="select-character-btn" class="add-card-button p-10">
                    <i class="fas fa-dice-d20 text-4xl mb-2"></i>
                    <span class="text-lg font-semibold">Selecionar Personagem em Jogo</span>
                </button>
            </div>
        `;
    }
}
function applyThumbnailScaling(container) {
    requestAnimationFrame(() => {
        const thumbnails = Array.from(container.querySelectorAll('.rpg-thumbnail'));

        thumbnails.forEach(t => t.classList.remove('visible'));
        requestAnimationFrame(() => {
            thumbnails.forEach(cardWrapper => cardWrapper.classList.add('visible'));
        });
    });
}
export async function openCharacterSelectionForRelationship() {
    const selectCharacterModal = document.getElementById('select-character-modal');
    const selectCharacterList = document.getElementById('select-character-list');
    const modalTitleEl = selectCharacterModal.querySelector('h3');

    modalTitleEl.textContent = 'Adicionar Criatura';
    selectCharacterList.innerHTML = '';
    const creaturesToShow = (await getData('rpgCards')).filter(char => char.cardType === 'creature');
    const selectedIds = new Set();
    document.querySelectorAll('#selected-relationships-container [data-id]').forEach(el => selectedIds.add(el.dataset.id));

    if (creaturesToShow.length === 0) {
        selectCharacterList.innerHTML = '<p class="text-gray-400 text-center p-4">Nao ha criaturas para relacionar.</p>';
    } else {
        creaturesToShow.forEach(char => {
            const charItem = document.createElement('button');
            charItem.className = 'w-full text-left p-2 rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-3 justify-between';

            let iconHtml = '';
            if (char.image) {
                const imageUrl = URL.createObjectURL(bufferToBlob(char.image, char.imageMimeType));
                iconHtml = `<img src="${imageUrl}" class="w-8 h-8 rounded-full object-cover flex-shrink-0">`;
            } else {
                iconHtml = `<div class="w-8 h-8 rounded-full bg-gray-600 flex-shrink-0 flex items-center justify-center"><i class="fas fa-dragon"></i></div>`;
            }

            const isSelected = selectedIds.has(char.id);
            if (isSelected) {
                charItem.classList.add('bg-indigo-900', 'border', 'border-indigo-500');
            }

            charItem.innerHTML = `
                <div class="flex items-center gap-3">
                    ${iconHtml}
                    <span>${char.title}</span>
                </div>
                ${isSelected ? '<span class="text-xs text-indigo-300 font-bold px-2 py-1 bg-black/30 rounded">Selecionado</span>' : ''}
            `;

            charItem.dataset.characterId = char.id;

            charItem.addEventListener('click', async () => {
                const selectedChar = await getData('rpgCards', char.id);
                if (selectedChar) {
                    document.dispatchEvent(new CustomEvent('addRelationshipToCharacter', { detail: { data: selectedChar } }));
                    selectCharacterModal.classList.add('hidden');
                }
            });
            selectCharacterList.appendChild(charItem);
        });
    }
    selectCharacterModal.classList.remove('hidden');
}

export async function openSelectionModal(type) {
    const selectionModal = document.getElementById('selection-modal');
    const selectionModalTitle = document.getElementById('selection-modal-title');
    const selectionModalList = document.getElementById('selection-modal-list');

    selectionModalList.innerHTML = '<div class="text-center p-4"><i class="fas fa-spinner fa-spin text-2xl text-gray-400"></i></div>';
    selectionModal.classList.remove('hidden');

    const isItem = type === 'item';
    let storeName;
    switch(type) {
        case 'item': storeName = 'rpgItems'; break;
        case 'magic': storeName = 'rpgEffects'; break;
        case 'relationship': storeName = 'rpgCards'; break;
        case 'attack': storeName = 'rpgEffects'; break;
        default: storeName = 'rpgEffects';
    }

    const title = isItem ? 'Selecionar Item' : (type === 'magic' ? 'Selecionar Magia/Habilidade' : (type === 'attack' ? 'Selecionar Ataque' : 'Selecionar Criatura'));
    let color = 'text-gray-300';
    if (isItem) color = 'text-amber-300';
    if (type === 'magic') color = 'text-teal-300';
    if (type === 'relationship') color = 'text-purple-300';
    if (type === 'attack') color = 'text-red-400';

    selectionModalTitle.className = `text-xl font-bold ${color}`;
    selectionModalTitle.textContent = title;

    if (type !== 'relationship') {
        const filterHtml = `
            <div class="mb-4">
                <label for="selection-modal-filter" class="text-sm font-semibold mr-2">Filtrar por Personagem:</label>
                <select id="selection-modal-filter" class="px-4 py-2 bg-gray-900 text-white rounded-lg border border-gray-600 text-sm w-full mt-1">
                </select>
            </div>
        `;
        selectionModalList.innerHTML = filterHtml;
    } else {
        selectionModalList.innerHTML = '';
    }

    const listContainer = document.createElement('div');
    listContainer.className = 'space-y-2';
    selectionModalList.appendChild(listContainer);

    const renderList = async (characterId) => {
        listContainer.innerHTML = '<div class="text-center p-4"><i class="fas fa-spinner fa-spin text-2xl text-gray-400"></i></div>';
        let data = await getData(storeName);
        let referenceData = Array.isArray(data) ? data.slice() : [];
        const selectedIds = new Set();
        const selectedItemCounts = new Map();
        if (type === 'magic') {
            document.querySelectorAll('#selected-magics-container [data-id]').forEach(el => selectedIds.add(el.dataset.id));
            document.querySelectorAll('#selected-skills-container [data-id]').forEach(el => selectedIds.add(el.dataset.id));
        } else if (type === 'attack') {
            document.querySelectorAll('#selected-attacks-container [data-id]').forEach(el => selectedIds.add(el.dataset.id));
        } else if (type === 'relationship') {
            document.querySelectorAll('#selected-relationships-container [data-id]').forEach(el => selectedIds.add(el.dataset.id));
        } else if (type === 'item') {
            const currentItems = getCharacterItems();
            currentItems.forEach(item => {
                selectedIds.add(item.id);
                selectedItemCounts.set(item.id, (selectedItemCounts.get(item.id) || 0) + 1);
            });
        }

        if (type === 'relationship') {
            if (data && Array.isArray(data)) {
                data = data.filter(c => c.cardType === 'creature');
            }
        }
        if (storeName === 'rpgEffects') {
            if (type === 'magic') {
                data = data.filter(item => item.type === 'magia' || item.type === 'habilidade');
                referenceData = referenceData.filter(item => item.type === 'magia' || item.type === 'habilidade');
            } else if (type === 'attack') {
                data = data.filter(item => item.type === 'ataque');
                referenceData = referenceData.filter(item => item.type === 'ataque');
            }
        }

        if (type !== 'relationship' && characterId && characterId !== 'all') {
            data = data.filter(item => item.characterId === characterId);
        }

        if (type !== 'relationship') {
            data = getGridBaseCards(data, referenceData);
        }

        listContainer.innerHTML = '';

        if (!data || data.length === 0) {
            let contentType = 'conteúdo';
            if(isItem) contentType = 'item';
            else if (type === 'magic') contentType = 'magia/habilidade';
            else if (type === 'relationship') contentType = 'criatura';
            else if (type === 'attack') contentType = 'ataque';
            listContainer.innerHTML = `<p class="text-gray-400 text-center p-4">Nenhum ${contentType} encontrado.</p>`;
            return;
        }

        data.forEach(item => {
            const el = document.createElement('button');
            el.className = 'w-full text-left p-2 rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-3 justify-between';

            let iconHtml = '';
            if (item.image) {
                const imageUrl = URL.createObjectURL(bufferToBlob(item.image, item.imageMimeType));
                iconHtml = `<img src="${imageUrl}" class="w-8 h-8 rounded-full object-cover flex-shrink-0" style="image-rendering: pixelated;">`;
            } else {
                let iconClass;
                switch(type) {
                    case 'item': iconClass = 'fa-box'; break;
                    case 'magic': iconClass = item.type === 'habilidade' ? 'fa-fist-raised' : 'fa-magic'; break;
                    case 'relationship': iconClass = 'fa-dragon'; break;
                    case 'attack': iconClass = 'fa-khanda'; break;
                    default: iconClass = 'fa-question-circle';
                }
                iconHtml = `<i class="fas ${iconClass} w-8 text-center text-xl text-gray-400"></i>`;
            }

            const currentItemCount = isItem ? (selectedItemCounts.get(item.id) || 0) : 0;
            const isSelected = isItem ? currentItemCount > 0 : selectedIds.has(item.id);
            if (isSelected) {
                el.classList.add('bg-indigo-900', 'border', 'border-indigo-500');
            }

            el.innerHTML = `
                <div class="flex items-center gap-3">
                    ${iconHtml}
                    <div>
                        <p class="font-semibold">${item.name || item.title}</p>
                        ${(type === 'magic' && item.type) ? `<p class="text-xs text-gray-400 capitalize">${item.type}</p>` : ''}
                        ${isItem ? `<p class="text-xs ${currentItemCount > 0 ? 'text-amber-200' : 'text-gray-500'}">${currentItemCount} no inventario</p>` : ''}
                    </div>
                </div>
                ${isItem ? `<span class="text-xs ${currentItemCount > 0 ? 'text-amber-200' : 'text-gray-400'} font-bold px-2 py-1 bg-black/30 rounded">x${currentItemCount}</span>` : (isSelected ? '<span class="text-xs text-indigo-300 font-bold px-2 py-1 bg-black/30 rounded">Selecionado</span>' : '')}
            `;

            el.addEventListener('click', () => {
                let eventType = 'addItemToCharacter';
                let detail = { data: item, type: type === 'relationship' ? 'relationship' : (type === 'item' ? 'item' : (type === 'magic' ? 'magic' : 'attack')) };

                if (type === 'relationship') eventType = 'addRelationshipToCharacter';

                document.dispatchEvent(new CustomEvent(eventType, { detail }));
                selectionModal.classList.add('hidden');
            });
            listContainer.appendChild(el);
        });
    };

    if (type !== 'relationship') {
        const filterSelect = document.getElementById('selection-modal-filter');
        const allCharacters = (await getData('rpgCards')).filter(char => char.cardType !== 'creature');
        let optionsHtml = '<option value="all">Todos</option><option value="">Nenhum</option>';
        if (allCharacters) {
            allCharacters.sort((a,b) => a.title.localeCompare(b.title)).forEach(char => {
                optionsHtml += `<option value="${char.id}">${char.title}</option>`;
            });
        }
        filterSelect.innerHTML = optionsHtml;

        const currentCharacterId = getCurrentEditingCardId();
        filterSelect.value = currentCharacterId || 'all';

        filterSelect.addEventListener('change', () => {
            renderList(filterSelect.value);
        });

        renderList(filterSelect.value);
    } else {
        renderList(null);
    }
}
async function createItemGrid(items, type) {
    const gridContainer = document.createElement('div');
    gridContainer.className = 'grid gap-4 w-full justify-items-center grid-cols-3 md:grid-cols-4 lg:grid-cols-5';

    if (items.length === 0) return gridContainer;

    const cardElements = items.map((item) => {
        const cardWrapper = document.createElement('div');
        let cardType = type;

        if (type === 'magias' || type === 'habilidades') cardType = 'spell';
        else if (type === 'itens') cardType = 'item';
        else if (type === 'ataques') cardType = 'attack';

        cardWrapper.className = 'rpg-thumbnail bg-cover bg-center relative';
        cardWrapper.dataset.action = "view";
        cardWrapper.dataset.type = cardType;
        cardWrapper.dataset.id = item.id;
        cardWrapper.innerHTML = `
            <div class="miniCard absolute inset-0 text-white">
                ${renderCompactCardPreview(item, cardType)}
            </div>
            <div class="thumbnail-actions absolute z-10">
                <button class="thumb-btn thumb-btn-menu"><i class="fas fa-ellipsis-v"></i></button>
                <div class="thumbnail-menu" data-type="${cardType}">
                    <button class="menu-item" data-action="edit" data-id="${item.id}"><i class="fas fa-edit"></i></button>
                    <button class="menu-item" data-action="remove" data-id="${item.id}"><i class="fas fa-trash-alt"></i></button>
                    <button class="menu-item" data-action="export-json" data-id="${item.id}"><i class="fas fa-file-download"></i></button>
                    ${cardHasArenaLayout(item) ? `<button class="menu-item" data-action="reset-arena-model" data-id="${item.id}" title="Voltar ao visual original"><i class="fas fa-rotate-left"></i></button>` : ''}
                </div>
            </div>
        `;
        addBulkSelectorToCard(cardWrapper, item);
        return cardWrapper;
    });

    cardElements.forEach(el => gridContainer.appendChild(el));
    return gridContainer;
}

function effectBelongsToListType(item, type) {
    if (!item) return false;
    if (type === 'magias') return !item.type || item.type === 'magia';
    if (type === 'habilidades') return item.type === 'habilidade';
    if (type === 'ataques') return item.type === 'ataque';
    return true;
}

function normalizeCardListRole(item, enhanceIds, trueIds) {
    const id = String(item?.id || '');
    if (item?.cardVariant === 'enhance' || enhanceIds.has(id)) return 'enhance';
    if (item?.cardVariant === 'true' || trueIds.has(id)) return 'true';
    return 'base';
}

function sortCardsByRelationRole(items) {
    const enhanceIds = new Set();
    const trueIds = new Set();

    items.forEach(item => {
        if (item?.enhanceCardId) enhanceIds.add(String(item.enhanceCardId));
        if (item?.trueCardId) trueIds.add(String(item.trueCardId));
    });

    const order = { base: 0, enhance: 1, true: 2 };

    return [...items].sort((a, b) => {
        const roleA = normalizeCardListRole(a, enhanceIds, trueIds);
        const roleB = normalizeCardListRole(b, enhanceIds, trueIds);
        if (order[roleA] !== order[roleB]) return order[roleA] - order[roleB];
        return (a?.name || a?.title || '').localeCompare(b?.name || b?.title || '');
    });
}

function createEmptyCardsMessage(message = 'Nao ha cards para serem listados.') {
    const emptyState = document.createElement('div');
    emptyState.className = 'w-full min-h-[40vh] flex items-center justify-center p-8 text-center text-gray-400';
    emptyState.innerHTML = `
        <div class="rounded-lg border border-dashed border-gray-700 bg-gray-900/30 px-6 py-8">
            <i class="fas fa-layer-group text-3xl mb-3 text-gray-500"></i>
            <p class="text-sm font-semibold">${message}</p>
        </div>
    `;
    return emptyState;
}

async function renderGroupedList({ type, storeName, buttonText, buttonAction, importBtnId, importInputId, importTitle, importFunction, themeColor, unassignedTitle }, container) {
    container.innerHTML = '';

    const rawItems = (await getData(storeName)) || [];
    const listItems = rawItems.filter(item => effectBelongsToListType(item, type));
    const allItems = sortCardsByRelationRole(RELATED_GRID_TYPES.has(type) ? getGridBaseCards(listItems, rawItems) : listItems);
    const allCharacters = (await getData('rpgCards')).filter(char => char.cardType !== 'creature');
    const allCategories = (await getData('rpgCategories')) || [];

    const charactersById = allCharacters.reduce((acc, char) => { acc[char.id] = char; return acc; }, {});
    const categoriesById = allCategories.reduce((acc, cat) => { acc[cat.id] = cat; return acc; }, {});

    const itemsByCharacter = {};
    const unassignedItems = [];

    allItems.forEach(item => {
        if (type === 'magias') {
            if (item.type && item.type !== 'magia') return;
        }
        if (type === 'habilidades' && item.type !== 'habilidade') return;
        if (type === 'ataques' && item.type !== 'ataque') return;

        const charId = item.characterId;
        if (charId && charactersById[charId]) {
            if (!itemsByCharacter[charId]) {
                itemsByCharacter[charId] = { character: charactersById[charId], items: [] };
            }
            itemsByCharacter[charId].items.push(item);
        } else {
            unassignedItems.push(item);
        }
    });

    const pageContainer = document.createElement('div');
    pageContainer.className = 'card-list-page w-full p-6 space-y-6';
    pageContainer.appendChild(createCardListActionBar({
        addAction: buttonAction,
        addLabel: buttonText,
        importBtnId,
        importInputId,
        importTitle
    }));

    if (allItems.length === 0) {
        pageContainer.appendChild(createEmptyCardsMessage());
    }

    const renderCharacterItems = async (characterName, items, container) => {
        const itemsByCategory = items.reduce((acc, item) => {
            const catId = item.categoryId || 'unassigned';
            if (!acc[catId]) acc[catId] = [];
            acc[catId].push(item);
            return acc;
        }, {});

        const section = document.createElement('section');
        section.className = 'character-section pt-4';
        section.innerHTML = `<h2 class="text-xl font-bold ${themeColor} mb-4 border-b-2 border-gray-700 pb-2">${characterName}</h2>`;

        const categoryIds = Object.keys(itemsByCategory).sort((a,b) => {
            if (a === 'unassigned') return 1;
            if (b === 'unassigned') return -1;
            const catA = categoriesById[a];
            const catB = categoriesById[b];
            if (!catA || !catA.name) return 1;
            if (!catB || !catB.name) return -1;
            return catA.name.localeCompare(catB.name);
        });

        for(const catId of categoryIds) {
            const category = categoriesById[catId];
            const categoryName = catId === 'unassigned' ? 'Sem Categoria' : (category?.name || 'Categoria Inválida');
            const categoryDesc = catId === 'unassigned' ? '' : (category?.description || '');

            const subSection = document.createElement('div');
            subSection.className = 'mb-6';

             const tooltipHtml = categoryDesc ? ` data-tooltip="${categoryDesc}"` : '';
             subSection.innerHTML = `<h3 class="category-title text-lg font-semibold text-gray-300 mb-3 relative inline-block cursor-help"${tooltipHtml}>
                                        ${categoryName}
                                     </h3>`;

            const grid = await createItemGrid(sortCardsByRelationRole(itemsByCategory[catId]), type);
            subSection.appendChild(grid);
            section.appendChild(subSection);
        }
        container.appendChild(section);
    };

    const characterIds = Object.keys(itemsByCharacter).sort((a, b) => itemsByCharacter[a].character.title.localeCompare(itemsByCharacter[b].character.title));

    for (const charId of characterIds) {
        const group = itemsByCharacter[charId];
        await renderCharacterItems(group.character.title, group.items, pageContainer);
    }

    if (unassignedItems.length > 0) {
        await renderCharacterItems(unassignedTitle, unassignedItems, pageContainer);
    }

    container.appendChild(pageContainer);
    setupBulkDeleteControls(pageContainer, type);

    pageContainer.querySelectorAll('.category-title[data-tooltip]').forEach(title => {
        let tooltipElement = null;
        title.addEventListener('mouseenter', (e) => {
            tooltipElement = document.createElement('div');
            tooltipElement.className = 'category-tooltip';
            tooltipElement.textContent = title.dataset.tooltip;
            document.body.appendChild(tooltipElement);

            const rect = title.getBoundingClientRect();
            tooltipElement.style.left = `${rect.left + window.scrollX}px`;
            tooltipElement.style.top = `${rect.bottom + window.scrollY + 5}px`;
        });
        title.addEventListener('mouseleave', () => {
            if (tooltipElement) {
                tooltipElement.remove();
                tooltipElement = null;
            }
        });
    });

    document.getElementById(importBtnId).addEventListener('click', () => {
        document.getElementById(importInputId).click();
    });

    document.getElementById(importInputId).addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                const imported = await importFunction(file, type);
                if (imported?.__arenaModelTemplateOnly) {
                    showCustomAlert('Modelo Arena importado como template. Ele nao sera adicionado como card no grid.');
                }
                document.dispatchEvent(new CustomEvent('dataChanged', { detail: { type } }));
             } catch (error) {
                 showCustomAlert(`Erro ao importar ${type}: ${error.message}`);
                 console.error("Import error:", error);
             } finally {
                 e.target.value = '';
             }
        }
    });
}

async function renderCharacterList(container, listType = 'character') {
    const isCreatureList = listType === 'creature';
    const allCharacters = (await getData('rpgCards')).filter(char => {
        const isCreature = char.cardType === 'creature';
        return isCreatureList ? isCreature : !isCreature;
    });

    const importBtnId = isCreatureList ? 'import-creatures-btn' : 'import-cards-btn';
    const importInputId = isCreatureList ? 'import-creature-json-input' : 'import-json-input';

    const pageContainer = document.createElement('div');
    pageContainer.className = 'card-list-page w-full p-6 space-y-6';
    pageContainer.appendChild(createCardListActionBar({
        addAction: isCreatureList ? 'add-creature' : 'add-character',
        addLabel: isCreatureList ? 'Adicionar Criatura' : 'Adicionar Personagem',
        importBtnId,
        importInputId,
        importTitle: isCreatureList ? 'Importar Criatura (JSON)' : 'Importar Personagem (JSON)'
    }));

    const gridContainer = document.createElement('div');
    gridContainer.className = 'grid gap-4 w-full justify-items-center grid-cols-3 md:grid-cols-4 lg:grid-cols-5';

    if (allCharacters.length === 0) {
        pageContainer.appendChild(createEmptyCardsMessage());
    }

    const cardElements = allCharacters.map((char) => {
        const cardWrapper = document.createElement('div');
        cardWrapper.className = 'rpg-thumbnail bg-cover bg-center relative';
        cardWrapper.dataset.action = "view";
        cardWrapper.dataset.type = isCreatureList ? "creature" : "character";
        cardWrapper.dataset.id = char.id;

        cardWrapper.innerHTML = `
            <div class="miniCard absolute inset-0 text-white">
                ${renderCompactCardPreview(char, isCreatureList ? 'creature' : 'character')}
            </div>
            <div class="thumbnail-actions absolute z-10">
                <button class="thumb-btn thumb-btn-menu">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
                <div class="thumbnail-menu" data-type="${isCreatureList ? 'creature' : 'character'}">
                    <button class="menu-item" data-action="edit" data-id="${char.id}"><i class="fas fa-edit"></i></button>
                    <button class="menu-item" data-action="remove" data-id="${char.id}"><i class="fas fa-trash-alt"></i></button>
                    <button class="menu-item" data-action="export-json" data-id="${char.id}"><i class="fas fa-file-download"></i></button>
                    ${cardHasArenaLayout(char) ? `<button class="menu-item" data-action="reset-arena-model" data-id="${char.id}" title="Voltar ao visual original"><i class="fas fa-rotate-left"></i></button>` : ''}
                    ${!isCreatureList ? (char.inPlay
                        ? `<button class="menu-item" data-action="remove-from-play" data-id="${char.id}"><i class="fas fa-sign-out-alt"></i></button>`
                        : `<button class="menu-item" data-action="set-in-play" data-id="${char.id}"><i class="fas fa-play-circle"></i></button>`) : ''}
                </div>
            </div>
        `;
        addBulkSelectorToCard(cardWrapper, char);
        return cardWrapper;
    });

    cardElements.forEach(el => gridContainer.appendChild(el));
    pageContainer.appendChild(gridContainer);
    container.appendChild(pageContainer);
    setupBulkDeleteControls(pageContainer, isCreatureList ? 'criaturas' : 'personagem');

    document.getElementById(importBtnId).addEventListener('click', () => {
        document.getElementById(importInputId).click();
    });

    document.getElementById(importInputId).addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
             try {
                const imported = await importCard(file, isCreatureList ? 'creature' : 'character');
                if (imported?.__arenaModelTemplateOnly) {
                    showCustomAlert('Modelo Arena importado como template. Ele nao sera adicionado como card no grid.');
                    document.dispatchEvent(new CustomEvent('dataChanged', { detail: { type: isCreatureList ? 'criaturas' : 'personagem' } }));
                    return;
                }
                imported.cardType = isCreatureList ? 'creature' : 'character';
                await saveData('rpgCards', imported);
                document.dispatchEvent(new CustomEvent('dataChanged', { detail: { type: isCreatureList ? 'criaturas' : 'personagem' } }));
            } catch (error) {
                showCustomAlert(`Erro ao importar ${isCreatureList ? 'criatura' : 'personagem'}: ${error.message}`);
                console.error("Import error:", error);
            } finally {
                e.target.value = '';
            }
        }
    });
}

async function renderSpellList(container, type = 'magias') {
    const isHabilidade = type === 'habilidades';
    await renderGroupedList({
        type: type,
        storeName: 'rpgEffects',
        buttonText: isHabilidade ? 'Adicionar Habilidade' : 'Adicionar Magia',
        buttonAction: isHabilidade ? 'add-habilidade' : 'add-spell',
        importBtnId: isHabilidade ? 'import-habilidade-btn' : 'import-spell-btn',
        importInputId: isHabilidade ? 'import-habilidade-json-input' : 'import-spell-json-input',
        importTitle: isHabilidade ? 'Importar Habilidade (JSON)' : 'Importar Magia (JSON)',
        importFunction: importSpell,
        themeColor: 'text-teal-300',
        unassignedTitle: isHabilidade ? 'Habilidades Sem Dono' : 'Magias Sem Dono'
    }, container);
}

async function renderItemList(container) {
    await renderGroupedList({
        type: 'itens',
        storeName: 'rpgItems',
        buttonText: 'Adicionar Item',
        buttonAction: 'add-item',
        importBtnId: 'import-item-btn',
        importInputId: 'import-item-json-input',
        importTitle: 'Importar Item (JSON)',
        importFunction: importItem,
        themeColor: 'text-amber-300',
        unassignedTitle: 'Itens Sem Dono'
    }, container);
}

async function renderAttackList(container) {
    await renderGroupedList({
        type: 'ataques',
        storeName: 'rpgEffects',
        buttonText: 'Adicionar Ataque',
        buttonAction: 'add-attack',
        importBtnId: 'import-attack-btn',
        importInputId: 'import-attack-json-input',
        importTitle: 'Importar Ataque (JSON)',
        importFunction: importSpell,
        themeColor: 'text-red-400',
        unassignedTitle: 'Ataques Sem Dono'
    }, container);
}

document.addEventListener('DOMContentLoaded', async () => {
    const style = document.createElement('style');
    style.innerHTML = `
        .rpg-thumbnail { opacity: 0; transition: opacity 0.4s ease; will-change: opacity; }
        .rpg-thumbnail.visible { opacity: 1; }
        .category-tooltip { position: absolute; background-color: rgba(0, 0, 0, 0.85); color: white; padding: 8px 12px; border-radius: 6px; font-size: 0.8rem; white-space: pre-wrap; z-index: 1000; max-width: 250px; pointer-events: none; border: 1px solid #4a5568; box-shadow: 0 2px 5px rgba(0,0,0,0.3); }
        .view-section.hidden { display: none !important; }
        .view-section { width: 100%; height: 100%; }
    `;
    document.head.appendChild(style);

    const navButtons = document.querySelectorAll('[data-target]');
    contentDisplay = document.getElementById('content-display');
    mainContainer = document.querySelector('main.max-w-6xl');
    const creationSection = document.getElementById('creation-section');
    const spellCreationSection = document.getElementById('spell-creation-section');
    const itemCreationSection = document.getElementById('item-creation-section');
    const selectCharacterModal = document.getElementById('select-character-modal');

    const selectCharacterCloseBtn = document.getElementById('select-character-close-btn');
    const closeFormBtn = document.getElementById('close-form-btn');
    const closeSpellFormBtn = document.getElementById('close-spell-form-btn');
    const closeItemFormBtn = document.getElementById('close-item-form-btn');

    const cardForm = document.getElementById('cardForm');
    const formTitle = document.getElementById('form-title');
    const submitButton = document.getElementById('submitButton');

    const spellForm = document.getElementById('spellForm');
    const spellFormTitle = document.getElementById('spell-form-title');
    const spellSubmitButton = document.getElementById('spellSubmitButton');

    const itemForm = document.getElementById('itemForm');
    const itemFormTitle = document.getElementById('item-form-title');
    const itemSubmitButton = document.getElementById('itemSubmitButton');

    const selectionModal = document.getElementById('selection-modal');
    const selectionModalCloseBtn = document.getElementById('selection-modal-close-btn');

    const importDbBtn = document.getElementById('import-db-btn');
    const exportDbBtn = document.getElementById('export-db-btn');
    const importDbInput = document.getElementById('import-db-input');
    const importDbBtnMobile = document.getElementById('import-db-btn-mobile');
    const exportDbBtnMobile = document.getElementById('export-db-btn-mobile');
    const exportImagesBtn = document.getElementById('export-images-btn');
    const exportImagesBtnMobile = document.getElementById('export-images-btn-mobile');

    const effectFormElements = {
        section: spellCreationSection,
        form: spellForm,
        title: spellFormTitle,
        submitButton: spellSubmitButton
    };


    const executeCardMenuAction = async (action, cardId, cardType, activeNav) => {
        if (action === 'edit') {
            if (cardType === 'character' || cardType === 'creature') {
                showView(creationSection, true);
                await editCard(cardId);
            } else if (cardType === 'spell' || cardType === 'attack') {
                showView(spellCreationSection, true);
                resetSpellFormState();
                await editSpell(cardId);
            } else if (cardType === 'item') {
                itemFormTitle.textContent = 'Editando Item';
                itemSubmitButton.textContent = 'Salvar Item';
                showView(itemCreationSection, true);
                await editItem(cardId);
            }
        } else if (action === 'remove' || action === 'delete') {
            let storeName;
            let eventType = activeNav;

            if (cardType === 'character' || cardType === 'creature') {
                storeName = 'rpgCards';
                eventType = cardType === 'creature' ? 'criaturas' : 'personagem';
            } else if (cardType === 'spell') {
                storeName = 'rpgEffects';
                eventType = getEventTypeForEffect(await getData('rpgEffects', cardId));
            } else if (cardType === 'item') {
                storeName = 'rpgItems';
                eventType = 'itens';
            } else if (cardType === 'attack') {
                storeName = 'rpgEffects';
                eventType = 'ataques';
            }

            if (storeName) {
                const deleteTargets = await getRelatedDeleteTargets(storeName, cardId);
                if (deleteTargets.length === 0) return;

                if (await showCustomConfirm(buildDeleteConfirmMessage(deleteTargets))) {
                    await removeRelatedDeleteTargets(storeName, deleteTargets);
                    document.dispatchEvent(new CustomEvent('dataChanged', { detail: { type: eventType } }));
                }
            }
        } else if (action === 'export-json') {
            if (cardType === 'character' || cardType === 'creature') await exportCard(cardId);
            if (cardType === 'spell') await exportSpell(cardId);
            if (cardType === 'item') await exportItem(cardId);
            if (cardType === 'attack') await exportSpell(cardId);
        } else if (action === 'reset-arena-model') {
            let storeName = '';
            let eventType = activeNav;
            if (cardType === 'character' || cardType === 'creature') {
                storeName = 'rpgCards';
                eventType = cardType === 'creature' ? 'criaturas' : 'personagem';
            } else if (cardType === 'spell' || cardType === 'attack') {
                storeName = 'rpgEffects';
                eventType = cardType === 'attack' ? 'ataques' : getEventTypeForEffect(await getData('rpgEffects', cardId));
            } else if (cardType === 'item') {
                storeName = 'rpgItems';
                eventType = 'itens';
            }

            if (!storeName) return;
            const card = await getData(storeName, cardId);
            if (!card) return;
            if (!(await showCustomConfirm('Voltar este card para o visual original da pagina? O layout da Arena sera removido deste card.'))) return;
            delete card.arenaModel;
            delete card._arenaModel;
            card.disableArenaModel = true;
            card._disableArenaModel = true;
            await saveData(storeName, card);
            document.dispatchEvent(new CustomEvent('dataChanged', { detail: { type: eventType } }));
        } else if (action === 'set-in-play' || action === 'remove-from-play') {
            const isSettingInPlay = action === 'set-in-play';
            const allCharacters = (await getData('rpgCards')).filter(char => char.cardType !== 'creature');
            if (isSettingInPlay) {
                await Promise.all(allCharacters.map(c => {
                    if (c.inPlay) {
                        c.inPlay = false;
                        return saveData('rpgCards', c);
                    }
                    return null;
                }));
            }
            const charToUpdate = allCharacters.find(c => c.id === cardId);
            if (charToUpdate) {
                charToUpdate.inPlay = isSettingInPlay;
                await saveData('rpgCards', charToUpdate);
            }
            document.dispatchEvent(new CustomEvent('dataChanged', { detail: { type: 'personagem' } }));
        }
    };

    async function renderViewIntoContainer(target, viewContainer) {
        if (target === 'personagem') await renderCharacterList(viewContainer, 'character');
        else if (target === 'criaturas') await renderCharacterList(viewContainer, 'creature');
        else if (target === 'magias' || target === 'habilidades') await renderSpellList(viewContainer, target);
        else if (target === 'ataques') await renderAttackList(viewContainer);
        else if (target === 'itens') await renderItemList(viewContainer);
        else if (target === 'categorias') await renderCategoryScreen(viewContainer);
        else if (target === 'grimorio') await renderGrimoireScreen(viewContainer);
        else if (target === 'personagem-em-jogo') await renderCharacterInGame(viewContainer);
    }

    async function ensureViewRendered(target, force = false) {
        const viewId = `view-${target}`;
        let viewContainer = document.getElementById(viewId);
        if (force && viewContainer) {
            viewContainer.remove();
            viewContainer = null;
        }

        if (!viewContainer) {
            viewContainer = document.createElement('div');
            viewContainer.id = viewId;
            viewContainer.className = 'view-section hidden';
            contentDisplay.appendChild(viewContainer);
            await renderViewIntoContainer(target, viewContainer);
        }

        return viewContainer;
    }

    async function preloadCachedViews() {
        for (const target of PRELOAD_VIEW_TARGETS) {
            try {
                await ensureViewRendered(target);
            } catch (error) {
                console.error(`Erro ao pre-carregar a tela ${target}:`, error);
            }
        }
    }

    renderContent = async (target, force = false) => {
        contentDisplay.classList.remove('justify-center');
        contentDisplay.removeAttribute('style');
        Array.from(contentDisplay.children).forEach(child => {
            child.classList.add('hidden');
        });

        creationSection.classList.add('hidden');
        spellCreationSection.classList.add('hidden');
        itemCreationSection.classList.add('hidden');

        if (target !== 'personagem-em-jogo') {
            if (mainContainer) mainContainer.style.overflowY = 'auto';
            contentDisplay.style.overflowY = 'scroll';
        }

        const viewContainer = await ensureViewRendered(target, force);
        viewContainer.classList.remove('hidden');
        if (target === 'personagem-em-jogo') {
            if (mainContainer) mainContainer.style.overflowY = 'hidden';
            contentDisplay.style.overflowY = 'visible';
            contentDisplay.classList.add('justify-center');
        } else {
             applyThumbnailScaling(viewContainer);
        }
    };

    function showView(section, isEditing, setupFunction) {
        section.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
        if (setupFunction) setupFunction();
    }

    const showCharacterSelectionModalForPlay = async () => {
        const modalTitleEl = selectCharacterModal.querySelector('h3');
        modalTitleEl.textContent = 'Selecionar Personagem em Jogo';
        selectCharacterList.innerHTML = '';
        const allCharacters = (await getData('rpgCards')).filter(char => char.cardType !== 'creature');

        if (!allCharacters || allCharacters.length === 0) {
            selectCharacterList.innerHTML = '<p class="text-gray-400">Nenhum personagem disponível.</p>';
        } else {
            allCharacters.forEach(char => {
                const charItem = document.createElement('button');
                charItem.className = 'w-full text-left p-2 rounded-lg hover:bg-gray-700 transition-colors';
                charItem.textContent = char.title;
                charItem.dataset.characterId = char.id;
                charItem.addEventListener('click', async () => {
                    const selectedChar = await getData('rpgCards', char.id);
                    if (selectedChar) {
                        await Promise.all(allCharacters.map(c => {
                            if (c.id !== selectedChar.id && c.inPlay) {
                                c.inPlay = false;
                                return saveData('rpgCards', c);
                            }
                            return Promise.resolve();
                        }));
                        selectedChar.inPlay = true;
                        await saveData('rpgCards', selectedChar);
                        document.dispatchEvent(new CustomEvent('dataChanged', { detail: { type: 'personagem' } }));
                        selectCharacterModal.classList.add('hidden');
                    }
                });
                selectCharacterList.appendChild(charItem);
            });
        }
        selectCharacterModal.classList.remove('hidden');
    };

    navButtons.forEach(button => {
        button.addEventListener('click', (event) => {
            const target = event.currentTarget.dataset.target;
            if (!target) return;

            const sidebar = document.getElementById('actions-sidebar');
            const sidebar1 = document.getElementById('actions-sidebar-1');
            if (sidebar) sidebar.classList.remove('active');
            if (sidebar1) sidebar1.classList.remove('active');

            navButtons.forEach(btn => btn.classList.remove('active'));

            document.querySelectorAll(`[data-target="${target}"]`).forEach(b => b.classList.add('active'));

            renderContent(target);
        });
    });

    const actionButtons = document.querySelectorAll('#actions-sidebar button:not([data-target]), #actions-sidebar-1 button:not([data-target])');

    actionButtons.forEach(button => {
        if (button.id !== 'sidebar-toggle' && button.id !== 'sidebar-toggle-1') {
            button.addEventListener('click', () => {
                const sidebar = document.getElementById('actions-sidebar');
                const sidebar1 = document.getElementById('actions-sidebar-1');
                if (sidebar) sidebar.classList.remove('active');
                if (sidebar1) sidebar1.classList.remove('active');
            });
        }
    });

    document.addEventListener('click', (e) => {
        const action = e.target.closest('[data-action]')?.dataset.action;
        if (!action) return;

        if (action === "export-database") {
            e.preventDefault();
            runLocalDatabaseExport();
            return;
        }
        if (action === "add-character") showView(creationSection, false, () => {
            resetCharacterFormState();
            setCharacterFormType('character');
            formTitle.textContent = 'Novo Personagem';
            submitButton.textContent = 'Criar Cartão';
            document.getElementById('form-inventory-section').classList.remove('hidden');
        });
        if (action === "add-creature") showView(creationSection, false, () => {
            resetCharacterFormState();
            setCharacterFormType('creature');
        });
        if (action === "add-spell" || action === "add-habilidade" || action === "add-attack") {
            const config = getEffectFormConfigFromAction(action);
            showView(spellCreationSection, false, () => prepareEffectFormCreate(effectFormElements, config));
        }
        if (action === "add-item") showView(itemCreationSection, false, async () => {
            resetItemFormState();
            itemFormTitle.textContent = 'Novo Item';
            itemSubmitButton.textContent = 'Criar Item';
            populateItemAumentosSelect();
            await populateCharacterSelect('itemCharacterOwner');
            await populateCategorySelect('item-category-select', 'item');
        });
        if (e.target.closest('#select-character-btn')) showCharacterSelectionModalForPlay();
    });

    const closeForm = async (section) => {
        if (section.id === 'creation-section') {
            const restoredBaseDraft = await handleCharacterFormCloseRequest();
            if (restoredBaseDraft) return;
            resetCharacterFormState();
        } else if (section.id === 'spell-creation-section') {
             const restoredBaseSpellDraft = await handleSpellFormCloseRequest();
             if (restoredBaseSpellDraft) return;
             resetSpellFormState();
        } else if (section.id === 'item-creation-section') {
             const restoredBaseItemDraft = await handleItemFormCloseRequest();
             if (restoredBaseItemDraft) return;
             resetItemFormState();
        }

        section.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    };

    closeFormBtn.addEventListener('click', () => closeForm(creationSection));
    closeSpellFormBtn.addEventListener('click', () => closeForm(spellCreationSection));
    closeItemFormBtn.addEventListener('click', () => closeForm(itemCreationSection));

    selectCharacterCloseBtn.addEventListener('click', () => selectCharacterModal.classList.add('hidden'));
    selectCharacterModal.addEventListener('click', (e) => {
        if (e.target === selectCharacterModal) {
            selectCharacterModal.classList.add('hidden');
        }
    });

    cardForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const result = await saveCharacterCard(cardForm);
        if (!result?.keepOpen) {
            await closeForm(creationSection);
        }
    });

    spellForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const result = await saveSpellCard(spellForm, spellForm.dataset.type || 'magia');
        if (!result?.keepOpen) {
            await closeForm(spellCreationSection);
        }
    });

    itemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const result = await saveItemCard(itemForm);
        if (!result?.keepOpen) {
            await closeForm(itemCreationSection);
        }
    });

    document.getElementById('add-relationship-btn').addEventListener('click', () => {
        openCharacterSelectionForRelationship();
    });

    document.getElementById('add-magic-to-char-btn').addEventListener('click', () => openSelectionModal('magic'));
    document.getElementById('add-skill-to-char-btn').addEventListener('click', () => openSelectionModal('magic'));
    document.getElementById('add-attack-to-char-btn').addEventListener('click', () => openSelectionModal('attack'));

    selectionModalCloseBtn.addEventListener('click', () => selectionModal.classList.add('hidden'));
    selectionModal.addEventListener('click', (e) => {
        if (e.target === selectionModal) {
             selectionModal.classList.add('hidden');
        }
    });

    document.addEventListener('openItemSelectionModal', () => openSelectionModal('item'));

    document.addEventListener('navigateHome', () => {
        const charactersButton = document.querySelector('[data-target="personagem"]');
        if (charactersButton) {
            charactersButton.click();
        }
    });

    try {
        await openDatabase();
        await seedArenaModelTemplatesFromLocalData();
        await preloadCachedViews();

        const emJogoButtons = document.querySelectorAll('[data-target="personagem-em-jogo"]');
        emJogoButtons.forEach(btn => btn.classList.add('active'));
        await renderContent('personagem-em-jogo');
    } catch (error) {
        console.error('Erro ao iniciar a navegacao:', error);
    } finally {
        window.__fichaLimpaReady = true;
        document.dispatchEvent(new CustomEvent('fichaLimpaReady'));
    }

    const importHandler = () => {
        importDbInput.click();
    };

    exportDbBtn.addEventListener('click', runLocalDatabaseExport);
    importDbBtn.addEventListener('click', importHandler);
    exportDbBtnMobile.addEventListener('click', runLocalDatabaseExport);
    importDbBtnMobile.addEventListener('click', importHandler);
    if (exportImagesBtn) exportImagesBtn.addEventListener('click', runImagesExport);
    if (exportImagesBtnMobile) exportImagesBtnMobile.addEventListener('click', runImagesExport);

    importDbInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            if (await showCustomConfirm('Isso substituirá TODOS os dados atuais. Deseja continuar?')) {
                showProgressModal("Importando Banco de Dados...");
                try {
                    await importDatabase(file, updateProgress);
                    showCustomAlert("Banco de dados importado com sucesso!");
                    Array.from(contentDisplay.children).forEach(child => child.remove());

                    const activeNav = document.querySelector('.nav-button.active, .desktop-nav-button.active')?.dataset.target || 'personagem-em-jogo';
                    await preloadCachedViews();
                    await renderContent(activeNav);
                } catch (error) {
                    console.error("Erro ao importar banco de dados:", error);
                    showCustomAlert("Erro ao importar. Verifique se o arquivo é válido.");
                } finally {
                    hideProgressModal();
                    importDbInput.value = '';
                }
            } else {
                 importDbInput.value = '';
            }
        }
    });

     document.addEventListener('dataChanged', (e) => {
        const type = e.detail.type;
        let targetView = '';
        if (type === 'personagem') targetView = 'personagem';
        else if (type === 'criaturas') targetView = 'criaturas';
        else if (type === 'magias') targetView = 'magias';
        else if (type === 'habilidades') targetView = 'habilidades';
        else if (type === 'itens') targetView = 'itens';
        else if (type === 'ataques') targetView = 'ataques';
        else if (type === 'categorias') targetView = 'categorias';

        if (targetView) {
            const cachedView = document.getElementById(`view-${targetView}`);
            if (cachedView) cachedView.remove();
        }
        if (type === 'categorias') {
            ['magias', 'habilidades', 'itens', 'ataques'].forEach(view => {
                const cachedView = document.getElementById(`view-${view}`);
                if (cachedView) cachedView.remove();
            });
        }
        const affectsInPlay = IN_PLAY_DEPENDENCY_TYPES.has(type);
        if (affectsInPlay) {
            const cachedInPlayView = document.getElementById('view-personagem-em-jogo');
            if (cachedInPlayView) cachedInPlayView.remove();
        }
        const activeNav = document.querySelector('.nav-button.active, .desktop-nav-button.active')?.dataset.target || 'personagem-em-jogo';
        const activeDependsOnCategories = type === 'categorias' && ['magias', 'habilidades', 'itens', 'ataques'].includes(activeNav);
        if (activeNav === targetView || (activeNav === 'personagem-em-jogo' && affectsInPlay) || activeDependsOnCategories) {
            renderContent(activeNav, true);
        }
    });

    document.addEventListener('click', async (e) => {
        const thumbCard = e.target.closest('.rpg-thumbnail');
        const menuBtn = e.target.closest('.thumb-btn-menu');
        const menuItem = e.target.closest('.thumbnail-menu .menu-item');

        if (thumbCard && !menuBtn && !menuItem) {
            const cardId = thumbCard.dataset.id;
            const cardType = thumbCard.dataset.type;
            if (cardType === 'character' || cardType === 'creature') await renderFullCharacterSheet(await getData('rpgCards', cardId), true, false);
            if (cardType === 'spell') await renderFullSpellSheet(await getData('rpgEffects', cardId), true);
            if (cardType === 'item') await renderFullItemSheet(await getData('rpgItems', cardId), true);
            if (cardType === 'attack') await renderFullSpellSheet(await getData('rpgEffects', cardId), true);
            return;
        }

       if (menuBtn) {
            e.preventDefault();
            e.stopPropagation();
            const menu = menuBtn.nextElementSibling;
            const parentThumbnail = menuBtn.closest('.rpg-thumbnail');

            document.querySelectorAll('.rpg-thumbnail.menu-active').forEach(activeThumb => {
                if (activeThumb !== parentThumbnail) {
                    activeThumb.classList.remove('menu-active');
                    activeThumb.style.zIndex = '';
                    const activeMenu = activeThumb.querySelector('.thumbnail-menu');
                    if (activeMenu) {
                        activeMenu.classList.remove('active', 'menu-left');
                    }
                }
            });

            const isActive = menu.classList.toggle('active');
            parentThumbnail.classList.toggle('menu-active', isActive);

            return;
        }

        if (menuItem) {
            e.preventDefault();
            e.stopPropagation();
            const action = menuItem.dataset.action;
            const cardId = menuItem.dataset.id;
            const cardType = menuItem.closest('[data-type]').dataset.type;
            const activeNav = document.querySelector('.nav-button.active, .desktop-nav-button.active')?.dataset.target;

            const parentThumbnail = menuItem.closest('.rpg-thumbnail');
            if(parentThumbnail){
                parentThumbnail.classList.remove('menu-active');
                 parentThumbnail.style.zIndex = '';
            }
            const parentMenu = menuItem.closest('.thumbnail-menu');
            if(parentMenu){
                parentMenu.classList.remove('active', 'menu-left');
            }

            const target = await resolveMenuActionTarget(cardType, cardId, action);
            if (!target) return;

            await executeCardMenuAction(action, target.id, target.cardType, activeNav);

            return;
        }

        if (!e.target.closest('.thumbnail-menu') && !e.target.closest('.thumb-btn-menu')) {
            document.querySelectorAll('.rpg-thumbnail.menu-active').forEach(activeThumb => {
                activeThumb.classList.remove('menu-active');
                 activeThumb.style.zIndex = '';
                const activeMenu = activeThumb.querySelector('.thumbnail-menu');
                if (activeMenu) {
                    activeMenu.classList.remove('active', 'menu-left');
                }
            });
        }
    });
});
