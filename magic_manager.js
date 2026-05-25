import { saveData, getData, removeData } from './local_db.js';
import { getAumentosData, populateCharacterSelect } from './character_manager.js';
import { populateCategorySelect } from './category_manager.js';
import { isArenaModelTemplatePayload, saveArenaModelTemplateFromCard } from './arena_model_renderer.js';
import {
    showImagePreview,
    readFileAsArrayBuffer as readFileAsArrayBufferUtil,
    bufferToBlob as bufferToBlobUtil,
    arrayBufferToBase64 as arrayBufferToBase64Util,
    base64ToArrayBuffer as base64ToArrayBufferUtil,
    calculateColor as calculateColorUtil,
    showCustomAlert,
    showCustomConfirm
} from './ui_utils.js';

export { showImagePreview } from './ui_utils.js';

let currentEditingSpellId = null;
let spellImageFile = null;
let activeSpellRelationType = 'enhance';
let pendingRelatedSpellCreation = null;
let spellInlineRelatedImageFiles = { enhance: null, true: null };
let spellBaseDraftId = null;
const spellPendingRelatedDrafts = { enhance: null, true: null };
let openSpellRelationsModalForRole = null;

const RELATED_CARD_ROLES = ['enhance', 'true'];
const RELATED_ROLE_LABELS = {
    enhance: 'Aprimorar',
    true: 'Verdadeiro'
};
const TRUE_SCHOOL_OPTIONS = [
    'ADIVINHAÇÃO',
    'CONJURAÇÃO',
    'ENCANTAMENTO',
    'ILUSÃO',
    'NECROMANCIA',
    'PROTEÇÃO',
    'TRANSMUTAÇÃO'
];

function createRecordId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeEffectType(type) {
    if (type === 'habilidade' || type === 'ataque') return type;
    return 'magia';
}

function getCurrentSpellFormType() {
    const form = document.getElementById('spellForm');
    return normalizeEffectType(form?.dataset.type);
}

function getEffectTypeMeta(type) {
    const normalizedType = normalizeEffectType(type);
    if (normalizedType === 'habilidade') {
        return { label: 'Habilidade', icon: 'fa-fist-raised', tone: 'text-cyan-300' };
    }
    if (normalizedType === 'ataque') {
        return { label: 'Ataque', icon: 'fa-khanda', tone: 'text-red-400' };
    }
    return { label: 'Magia', icon: 'fa-magic', tone: 'text-teal-300' };
}

function normalizeCardRole(role) {
    return role === 'enhance' || role === 'true' ? role : 'base';
}

function getCanonicalEffectBaseId(effectData, role, baseCardId, allEffects = []) {
    const normalizedRole = normalizeCardRole(role || effectData?.cardVariant);
    if (!effectData?.id) return '';
    if (normalizedRole === 'base') return effectData.id;
    if (baseCardId || effectData.baseCardId) return baseCardId || effectData.baseCardId;

    const parent = (allEffects || []).find(effect =>
        String(effect?.enhanceCardId || '') === String(effectData.id) ||
        String(effect?.trueCardId || '') === String(effectData.id)
    );

    return parent?.id || effectData.id;
}

async function addCardToCharacterCollection(characterId, collectionKey, cardId) {
    if (!characterId || !cardId) return false;

    const character = await getData('rpgCards', characterId);
    if (!character || character.cardType === 'creature') return false;

    const currentIds = Array.isArray(character[collectionKey]) ? character[collectionKey].map(String) : [];
    if (currentIds.includes(String(cardId))) return false;

    character[collectionKey] = [...currentIds, String(cardId)];
    await saveData('rpgCards', character);
    return true;
}

async function syncEffectOwnerToCharacter(effectData, role, baseCardId, allEffects = []) {
    const ownerId = effectData?.characterId || '';
    if (!ownerId) return false;

    const effectId = getCanonicalEffectBaseId(effectData, role, baseCardId, allEffects);
    const collectionKey = effectData?.type === 'ataque' ? 'attacks' : 'spells';
    return addCardToCharacterCollection(ownerId, collectionKey, effectId);
}

function getCardDisplayName(card) {
    return card?.name || card?.title || 'Card sem nome';
}

function normalizeTrueSchool(value) {
    return TRUE_SCHOOL_OPTIONS.includes(value) ? value : '';
}

function getTrueSchoolOptionsHtml(selectedValue = '') {
    const selected = normalizeTrueSchool(selectedValue);
    return `
        <option value="">Selecione a escola</option>
        ${TRUE_SCHOOL_OPTIONS.map(option => `<option value="${option}"${option === selected ? ' selected' : ''}>${option}</option>`).join('')}
    `;
}

function getReferencedSpellRole(cards, spellId) {
    const parent = cards.find(card => card?.enhanceCardId === spellId || card?.trueCardId === spellId);
    if (!parent) return { role: 'base', baseCardId: '' };
    return {
        role: parent.trueCardId === spellId ? 'true' : 'enhance',
        baseCardId: parent.id
    };
}

function resolveSpellRole(spellData, cards) {
    const referenced = getReferencedSpellRole(cards, spellData?.id);
    const explicitRole = normalizeCardRole(spellData?.cardVariant);
    if (explicitRole !== 'base') {
        return { role: explicitRole, baseCardId: spellData?.baseCardId || referenced.baseCardId || '' };
    }
    if (referenced.role !== 'base') return referenced;
    return { role: 'base', baseCardId: spellData?.baseCardId || '' };
}

async function populateSpellBaseCardSelect(selectedBaseId = '', currentId = '') {
    const select = document.getElementById('spell-base-card-select');
    if (!select) return;

    const currentType = getCurrentSpellFormType();
    const allEffects = ((await getData('rpgEffects')) || []);
    const relatedIds = new Set();
    allEffects.forEach(effect => {
        if (effect?.enhanceCardId) relatedIds.add(effect.enhanceCardId);
        if (effect?.trueCardId) relatedIds.add(effect.trueCardId);
    });

    const effects = allEffects
        .filter(effect => effect?.id !== currentId)
        .filter(effect => normalizeEffectType(effect.type) === currentType)
        .filter(effect => normalizeCardRole(effect.cardVariant) === 'base')
        .filter(effect => !relatedIds.has(effect.id) || effect.id === selectedBaseId);

    const typeMeta = getEffectTypeMeta(currentType);
    select.innerHTML = `
        <option value="">Selecione um card base</option>
        ${effects.map(effect => `<option value="${effect.id}">${getCardDisplayName(effect)} (${typeMeta.label})</option>`).join('')}
    `;
    select.value = selectedBaseId || '';
}

function updateSpellRoleUi() {
    const roleSelect = document.getElementById('spell-card-role');
    const roleControl = roleSelect?.closest('div');
    const baseWrapper = document.getElementById('spell-base-card-wrapper');
    const baseSelect = document.getElementById('spell-base-card-select');
    const role = normalizeCardRole(roleSelect?.value);
    const isBase = role === 'base';
    const isRelatedCreation = Boolean(pendingRelatedSpellCreation);

    if (roleControl) roleControl.classList.toggle('hidden', isRelatedCreation);
    if (baseWrapper) baseWrapper.classList.toggle('hidden', isBase || isRelatedCreation);
    if (baseSelect) baseSelect.required = !isBase && !isRelatedCreation;
    const trueSchoolWrapper = document.getElementById('spell-true-school-wrapper');
    const trueSchoolSelect = document.getElementById('spell-true-school-select');
    if (trueSchoolWrapper) trueSchoolWrapper.classList.add('hidden');
    if (trueSchoolSelect) {
        trueSchoolSelect.required = false;
        trueSchoolSelect.value = '';
    }
    updateRelatedSpellCreationUi();
    updateSpellInlineRelatedUi();
}

async function syncBaseEffectRelation(spellData, role, baseCardId, previousBaseCardId = '') {
    const normalizedRole = normalizeCardRole(role);
    const oldBaseId = previousBaseCardId && (previousBaseCardId !== baseCardId || normalizedRole === 'base') ? previousBaseCardId : '';

    if (oldBaseId) {
        const oldBase = await getData('rpgEffects', oldBaseId);
        if (oldBase) {
            if (oldBase.enhanceCardId === spellData.id) oldBase.enhanceCardId = '';
            if (oldBase.trueCardId === spellData.id) oldBase.trueCardId = '';
            await saveData('rpgEffects', oldBase);
        }
    }

    if (normalizedRole === 'base' || !baseCardId) return;

    const baseCard = await getData('rpgEffects', baseCardId);
    if (!baseCard) return;

    if (baseCard.enhanceCardId === spellData.id && normalizedRole !== 'enhance') baseCard.enhanceCardId = '';
    if (baseCard.trueCardId === spellData.id && normalizedRole !== 'true') baseCard.trueCardId = '';
    if (normalizedRole === 'true') baseCard.trueCardId = spellData.id;
    else baseCard.enhanceCardId = spellData.id;
    await saveData('rpgEffects', baseCard);
}

async function unlinkRemovedBaseEffectRelations(baseSpellId, previousEnhanceId = '', previousTrueId = '', nextEnhanceId = '', nextTrueId = '') {
    if (!baseSpellId) return;

    const removedRelations = [
        { role: 'enhance', id: previousEnhanceId, nextId: nextEnhanceId },
        { role: 'true', id: previousTrueId, nextId: nextTrueId }
    ].filter(relation => relation.id && relation.id !== relation.nextId);

    for (const relation of removedRelations) {
        const relatedCard = await getData('rpgEffects', relation.id);
        if (!relatedCard || String(relatedCard.baseCardId || '') !== String(baseSpellId || '')) continue;

        relatedCard.baseCardId = '';
        relatedCard.cardVariant = 'base';
        if (relation.role === 'true') relatedCard.trueSchool = '';
        await saveData('rpgEffects', relatedCard);
    }
}

function getSpellFormUiMeta(type, mode = 'create') {
    const normalizedType = normalizeEffectType(type);
    const isRelated = mode === 'related';
    const isEdit = mode === 'edit';

    if (normalizedType === 'habilidade') {
        return {
            title: isRelated ? 'Nova Habilidade relacionada' : (isEdit ? 'Editando Habilidade' : 'Nova Habilidade'),
            submit: isRelated ? 'Criar relacionada' : (isEdit ? 'Salvar Habilidade' : 'Criar Habilidade'),
            hideMana: true
        };
    }

    if (normalizedType === 'ataque') {
        return {
            title: isRelated ? 'Novo Ataque relacionado' : (isEdit ? 'Editando Ataque' : 'Novo Ataque'),
            submit: isRelated ? 'Criar relacionado' : (isEdit ? 'Salvar Ataque' : 'Criar Ataque'),
            hideMana: true
        };
    }

    return {
        title: isRelated ? 'Nova Magia relacionada' : (isEdit ? 'Editando Magia' : 'Nova Magia'),
        submit: isRelated ? 'Criar relacionada' : (isEdit ? 'Salvar Magia' : 'Criar Magia'),
        hideMana: false
    };
}

function applySpellFormUi(type, mode = 'create', baseName = '') {
    const meta = getSpellFormUiMeta(type, mode);
    const titleEl = document.getElementById('spell-form-title');
    const submitEl = document.getElementById('spellSubmitButton');
    const manaWrapper = document.getElementById('mana-cost-wrapper');
    const form = document.getElementById('spellForm');

    if (titleEl) {
        titleEl.textContent = mode === 'related' && baseName
            ? `${meta.title}: ${baseName}`
            : meta.title;
    }
    if (submitEl) submitEl.textContent = meta.submit;
    if (manaWrapper) manaWrapper.classList.toggle('hidden', meta.hideMana);
    if (form) form.dataset.type = normalizeEffectType(type);
    updateSpellRoleUi();
}

function normalizeFixedAumentos(aumentos) {
    if (!Array.isArray(aumentos)) return [];

    return aumentos
        .filter(Boolean)
        .map(aumento => ({
            nome: aumento.nome,
            valor: parseInt(aumento.valor, 10) || 0,
            tipo: 'fixo'
        }))
        .filter(aumento => aumento.nome && aumento.valor !== 0);
}

export function populateSpellAumentosSelect() {
    const select = document.getElementById('spell-aumento-select');
    if (!select) return;
    select.innerHTML = ''; 

    const AUMENTOS_DATA = getAumentosData();

    const statusGroup = document.createElement('optgroup');
    statusGroup.label = 'Status';
    AUMENTOS_DATA.Status.forEach(stat => {
        const option = document.createElement('option');
        option.value = stat.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        option.textContent = stat;
        statusGroup.appendChild(option);
    });
    select.appendChild(statusGroup);

    const atributosGroup = document.createElement('optgroup');
    atributosGroup.label = 'Atributos';
    AUMENTOS_DATA.Atributos.forEach(attr => {
        const option = document.createElement('option');
        option.value = attr.toLowerCase();
        option.textContent = attr;
        atributosGroup.appendChild(option);
    });
    select.appendChild(atributosGroup);

    for (const attr in AUMENTOS_DATA.Perícias) {
        const periciasGroup = document.createElement('optgroup');
        periciasGroup.label = `Perícias (${attr})`;
        AUMENTOS_DATA.Perícias[attr].forEach(pericia => {
            const option = document.createElement('option');
            option.value = pericia;
            option.textContent = pericia;
            periciasGroup.appendChild(option);
        });
        select.appendChild(periciasGroup);
    }
}

function renderAumentoNaLista(aumento) {
    const list = document.getElementById('spell-aumentos-list');
    if (!list) return;

    const normalizedAumento = normalizeFixedAumentos([aumento])[0];
    if (!normalizedAumento) return;

    const div = document.createElement('div');
    div.className = 'flex items-center justify-between bg-gray-800 p-2 rounded-lg';
    div.dataset.nome = normalizedAumento.nome;
    div.dataset.valor = normalizedAumento.valor;
    div.dataset.tipo = 'fixo';

    div.innerHTML = `
        <div>
            <span class="font-semibold text-teal-300">${normalizedAumento.nome}</span>
            <span class="text-white ml-2">${normalizedAumento.valor > 0 ? '+' : ''}${normalizedAumento.valor}</span>
        </div>
        <button type="button" class="text-red-500 hover:text-red-400 remove-aumento-btn text-xl leading-none">&times;</button>
    `;

    div.querySelector('.remove-aumento-btn').addEventListener('click', () => {
        div.remove();
    });

    list.appendChild(div);
}

function getSpellInlinePrefix(role) {
    return `spell-inline-${role}`;
}

function cloneSelectOptions(sourceId, fallback = '<option value="">Nenhum</option>') {
    const source = document.getElementById(sourceId);
    return source?.innerHTML || fallback;
}

function getSpellPendingRelatedDraftById(id) {
    if (!id) return null;
    return RELATED_CARD_ROLES
        .map(role => spellPendingRelatedDrafts[role])
        .find(draft => String(draft?.id || '') === String(id)) || null;
}

function resetSpellPendingRelatedDrafts() {
    RELATED_CARD_ROLES.forEach(role => {
        spellPendingRelatedDrafts[role] = null;
    });
}

function copySpellPendingRelatedDrafts() {
    return RELATED_CARD_ROLES.reduce((acc, role) => {
        acc[role] = spellPendingRelatedDrafts[role] ? { ...spellPendingRelatedDrafts[role] } : null;
        return acc;
    }, {});
}

function restoreSpellPendingRelatedDrafts(drafts = {}) {
    RELATED_CARD_ROLES.forEach(role => {
        spellPendingRelatedDrafts[role] = drafts?.[role] ? { ...drafts[role] } : null;
    });
}

function renderSpellRelatedDraftStatus() {
    const container = document.getElementById('spell-inline-related-sections');
    if (!container) return;

    const rows = RELATED_CARD_ROLES.map(role => {
        const inputId = role === 'true' ? 'spellTrueCardId' : 'spellEnhanceCardId';
        const id = document.getElementById(inputId)?.value || '';
        const draft = spellPendingRelatedDrafts[role];
        const label = RELATED_ROLE_LABELS[role] || 'Relacionado';
        const name = draft?.name || (id ? 'Card selecionado' : 'Nenhum card criado');
        return `
            <div class="related-page-status related-page-status--action" data-open-spell-related-action="${role}" role="button" tabindex="0">
                <div>
                    <span>${label}</span>
                    <strong>${name}</strong>
                </div>
                ${id ? `<button type="button" data-remove-spell-related="${role}" aria-label="Remover ${label}">&times;</button>` : ''}
            </div>
        `;
    }).join('');

    container.innerHTML = `<div class="related-page-status-grid">${rows}</div>`;
    container.querySelectorAll('[data-open-spell-related-action]').forEach(card => {
        const open = () => openSpellRelatedActionModal(card.dataset.openSpellRelatedAction);
        card.addEventListener('click', (e) => {
            if (e.target.closest('[data-remove-spell-related]')) return;
            open();
        });
        card.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            open();
        });
    });
    container.querySelectorAll('[data-remove-spell-related]').forEach(button => {
        button.addEventListener('click', async () => {
            const role = button.dataset.removeSpellRelated;
            const input = document.getElementById(role === 'true' ? 'spellTrueCardId' : 'spellEnhanceCardId');
            if (input) input.value = '';
            spellPendingRelatedDrafts[role] = null;
            await updateSpellRelationLabels();
            updateSpellInlineRelatedUi();
        });
    });
}

function getSpellRelatedSlotId(role) {
    const inputId = role === 'true' ? 'spellTrueCardId' : 'spellEnhanceCardId';
    return document.getElementById(inputId)?.value || spellPendingRelatedDrafts[role]?.id || '';
}

function updateSpellBaseTextFieldsUi() {
    const roleSelect = document.getElementById('spell-card-role');
    const isBase = normalizeCardRole(roleSelect?.value) === 'base';
    const isRelatedCreation = Boolean(pendingRelatedSpellCreation);
    const container = document.getElementById('spell-base-text-fields');
    if (!container) return;

    const shouldShowContainer = isBase && !isRelatedCreation;
    container.classList.toggle('hidden', !shouldShowContainer);
    if (!shouldShowContainer) return;

    let visibleTextFields = 0;
    RELATED_CARD_ROLES.forEach(role => {
        const wrapper = document.getElementById(role === 'true' ? 'spell-true-text-wrapper' : 'spell-enhance-text-wrapper');
        const hasRelatedCard = Boolean(getSpellRelatedSlotId(role));
        if (wrapper) wrapper.classList.toggle('hidden', hasRelatedCard);
        if (!hasRelatedCard) visibleTextFields += 1;
    });
    container.classList.toggle('hidden', visibleTextFields === 0);
}

function openSpellRelatedActionModal(role) {
    const normalizedRole = role === 'true' ? 'true' : 'enhance';
    const label = RELATED_ROLE_LABELS[normalizedRole] || 'Relacionado';
    const modal = document.getElementById('related-action-modal');
    const title = document.getElementById('related-action-title');
    const closeBtn = document.getElementById('close-related-action-modal-btn');
    const createBtn = document.getElementById('related-action-create-btn');
    const linkBtn = document.getElementById('related-action-link-btn');
    if (!modal || !title || !closeBtn || !createBtn || !linkBtn) return;

    const closeModal = () => modal.classList.add('hidden');
    title.textContent = `${label} relacionado`;
    createBtn.onclick = async () => {
        closeModal();
        await startRelatedSpellCreation(normalizedRole);
    };
    linkBtn.onclick = async () => {
        closeModal();
        if (typeof openSpellRelationsModalForRole === 'function') {
            await openSpellRelationsModalForRole(normalizedRole);
        }
    };
    closeBtn.onclick = closeModal;
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };
    modal.classList.remove('hidden');
}

function getSpellInlineAumentos(role) {
    const aumentos = [];
    document.querySelectorAll(`#${getSpellInlinePrefix(role)}-aumentos-list div[data-nome]`).forEach(el => {
        aumentos.push({
            nome: el.dataset.nome,
            valor: parseInt(el.dataset.valor, 10) || 0,
            tipo: el.dataset.tipo || 'fixo'
        });
    });
    return normalizeFixedAumentos(aumentos);
}

function renderSpellInlineAumento(role, aumento) {
    const list = document.getElementById(`${getSpellInlinePrefix(role)}-aumentos-list`);
    if (!list) return;

    const normalizedAumento = normalizeFixedAumentos([aumento])[0];
    if (!normalizedAumento) return;

    const div = document.createElement('div');
    div.className = 'flex items-center justify-between bg-gray-800 p-2 rounded-lg';
    div.dataset.nome = normalizedAumento.nome;
    div.dataset.valor = normalizedAumento.valor;
    div.dataset.tipo = 'fixo';
    div.innerHTML = `
        <div>
            <span class="font-semibold text-teal-300">${normalizedAumento.nome}</span>
            <span class="text-white ml-2">${normalizedAumento.valor > 0 ? '+' : ''}${normalizedAumento.valor}</span>
        </div>
        <button type="button" class="text-red-500 hover:text-red-400 remove-aumento-btn text-xl leading-none">&times;</button>
    `;
    div.querySelector('.remove-aumento-btn').addEventListener('click', () => div.remove());
    list.appendChild(div);
}

function syncSpellInlineSelectOptions(role) {
    const prefix = getSpellInlinePrefix(role);
    const ownerSelect = document.getElementById(`${prefix}-character-owner`);
    const categorySelect = document.getElementById(`${prefix}-category-select`);
    const aumentoSelect = document.getElementById(`${prefix}-aumento-select`);

    if (ownerSelect) ownerSelect.innerHTML = cloneSelectOptions('spellCharacterOwner');
    if (categorySelect) categorySelect.innerHTML = cloneSelectOptions('spell-category-select');
    if (aumentoSelect) aumentoSelect.innerHTML = cloneSelectOptions('spell-aumento-select');
}

function updateSpellInlineImagePreview(role) {
    const prefix = getSpellInlinePrefix(role);
    const useBaseCheckbox = document.getElementById(`${prefix}-use-base-image`);
    const upload = document.getElementById(`${prefix}-image-upload`);
    const preview = document.getElementById(`${prefix}-image-preview`);
    const placeholder = document.getElementById(`${prefix}-image-placeholder`);
    if (!preview) return;

    const useBaseImage = useBaseCheckbox ? useBaseCheckbox.checked : true;
    if (upload) upload.disabled = useBaseImage;
    const applyPreview = (url) => {
        showImagePreview(preview, url || null, true);
        if (placeholder) placeholder.classList.toggle('hidden', Boolean(url));
    };

    if (useBaseImage) {
        const basePreview = document.getElementById('spellImagePreview');
        const baseUrl = basePreview && !basePreview.classList.contains('hidden') ? basePreview.src : '';
        applyPreview(baseUrl);
        return;
    }

    const file = spellInlineRelatedImageFiles[role];
    applyPreview(file ? URL.createObjectURL(file) : null);
}

function renderSpellInlineRelatedSection(role) {
    const container = document.getElementById('spell-inline-related-sections');
    if (!container || document.getElementById(`${getSpellInlinePrefix(role)}-section`)) return;

    const prefix = getSpellInlinePrefix(role);
    const label = RELATED_ROLE_LABELS[role] || 'Relacionado';
    const showManaFields = getCurrentSpellFormType() === 'magia';

    container.insertAdjacentHTML('beforeend', `
        <div id="${prefix}-section" class="bg-gray-900/50 border border-teal-500/30 rounded-lg p-3" data-inline-related-role="${role}">
            <div class="flex items-center justify-between gap-3 mb-3">
                <h4 class="text-sm font-bold text-teal-200">${label}</h4>
                <label for="${prefix}-use-base-image" class="flex items-center gap-2 text-xs text-gray-300">
                    <input type="checkbox" id="${prefix}-use-base-image" class="rounded border-gray-600 bg-gray-800 text-teal-500 focus:ring-teal-500" checked>
                    <span>Usar imagem da base</span>
                </label>
            </div>
            <div class="flex flex-col md:flex-row gap-4">
                <div class="w-full md:w-1/5 flex flex-col items-center gap-2 bg-gray-950/40 p-3 rounded-lg border border-gray-700 h-fit">
                    <label for="${prefix}-image-upload" class="block text-xs font-bold text-teal-300 uppercase cursor-pointer hover:text-white">Icone</label>
                    <div class="relative group cursor-pointer w-24 h-24" data-inline-image-picker="${role}">
                        <input type="file" id="${prefix}-image-upload" accept="image/*" class="hidden">
                        <img id="${prefix}-image-preview" class="w-full h-full object-cover rounded-full border-4 border-teal-900/50 group-hover:border-teal-500 transition-colors hidden">
                        <div id="${prefix}-image-placeholder" class="w-full h-full rounded-full border-2 border-dashed border-gray-600 flex items-center justify-center text-gray-500 group-hover:border-teal-500 group-hover:text-teal-400 transition-colors">
                            <i class="fas fa-layer-group text-3xl"></i>
                        </div>
                    </div>
                </div>
                <div class="w-full md:w-4/5 space-y-3">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div class="md:col-span-2">
                            <label for="${prefix}-name" class="block text-xs font-semibold text-gray-400 mb-1">Nome</label>
                            <input type="text" id="${prefix}-name" required class="w-full px-3 py-1.5 bg-gray-700 text-white text-sm rounded border border-gray-600 focus:border-teal-500 focus:outline-none">
                        </div>
                        <div>
                            <label for="${prefix}-category-select" class="block text-xs font-semibold text-gray-400 mb-1">Categoria</label>
                            <select id="${prefix}-category-select" class="w-full px-3 py-1.5 bg-gray-700 text-white text-sm rounded border border-gray-600 focus:border-teal-500 focus:outline-none"></select>
                        </div>
                    </div>
                    <div>
                        <label for="${prefix}-character-owner" class="block text-xs font-semibold text-gray-400 mb-1">Dono (Opcional)</label>
                        <select id="${prefix}-character-owner" class="w-full px-3 py-1.5 bg-gray-700 text-white text-sm rounded border border-gray-600 focus:border-teal-500 focus:outline-none"></select>
                    </div>
                    <div class="bg-gray-800/50 p-2 rounded border border-gray-700/50 grid grid-cols-2 md:grid-cols-4 gap-3">
                        ${showManaFields ? `
                            <div>
                                <label for="${prefix}-circle" class="block text-[10px] text-gray-500 uppercase mb-1">Circulo</label>
                                <input type="number" id="${prefix}-circle" placeholder="1" class="w-full px-2 py-1 bg-gray-700 text-white text-sm rounded border border-gray-600">
                            </div>
                            <div>
                                <label for="${prefix}-mana-cost" class="block text-[10px] text-gray-500 uppercase mb-1">Custo Mana</label>
                                <input type="number" id="${prefix}-mana-cost" placeholder="0" class="w-full px-2 py-1 bg-gray-700 text-white text-sm rounded border border-gray-600">
                            </div>
                        ` : ''}
                        <div>
                            <label for="${prefix}-execution" class="block text-[10px] text-gray-500 uppercase mb-1">Execucao</label>
                            <input type="text" id="${prefix}-execution" class="w-full px-2 py-1 bg-gray-700 text-white text-sm rounded border border-gray-600">
                        </div>
                        <div>
                            <label for="${prefix}-range" class="block text-[10px] text-gray-500 uppercase mb-1">Alcance</label>
                            <input type="text" id="${prefix}-range" class="w-full px-2 py-1 bg-gray-700 text-white text-sm rounded border border-gray-600">
                        </div>
                        <div>
                            <label for="${prefix}-target" class="block text-[10px] text-gray-500 uppercase mb-1">Alvo</label>
                            <input type="text" id="${prefix}-target" class="w-full px-2 py-1 bg-gray-700 text-white text-sm rounded border border-gray-600">
                        </div>
                        <div>
                            <label for="${prefix}-duration" class="block text-[10px] text-gray-500 uppercase mb-1">Duracao</label>
                            <input type="text" id="${prefix}-duration" class="w-full px-2 py-1 bg-gray-700 text-white text-sm rounded border border-gray-600">
                        </div>
                        <div class="md:col-span-2">
                            <label for="${prefix}-resistencia" class="block text-[10px] text-gray-500 uppercase mb-1">Resistencia</label>
                            <input type="text" id="${prefix}-resistencia" class="w-full px-2 py-1 bg-gray-700 text-white text-sm rounded border border-gray-600">
                        </div>
                    </div>
                    <div class="bg-gray-800/50 p-2 rounded border border-gray-700/50">
                        <h5 class="text-xs font-bold text-red-400 uppercase mb-2">Combate</h5>
                        <div class="grid grid-cols-2 gap-2">
                            <div><label for="${prefix}-acerto" class="block text-[10px] text-gray-500 text-center truncate text-yellow-400">Acerto</label><input type="text" id="${prefix}-acerto" class="w-full text-center px-1 py-1 bg-gray-700 text-white text-sm rounded border border-gray-600"></div>
                            <div><label for="${prefix}-critico" class="block text-[10px] text-gray-500 text-center truncate text-yellow-400">Critico</label><input type="text" id="${prefix}-critico" class="w-full text-center px-1 py-1 bg-gray-700 text-white text-sm rounded border border-gray-600"></div>
                            <div><label for="${prefix}-damage" class="block text-[10px] text-gray-500 text-center truncate text-red-400">Dano</label><input type="text" id="${prefix}-damage" class="w-full text-center px-1 py-1 bg-gray-700 text-white text-sm rounded border border-gray-600"></div>
                            <div><label for="${prefix}-dano-sem-mana" class="block text-[10px] text-gray-500 text-center truncate text-red-400">Dano Sem Mana</label><input type="text" id="${prefix}-dano-sem-mana" class="w-full text-center px-1 py-1 bg-gray-700 text-white text-sm rounded border border-gray-600"></div>
                            <div><label for="${prefix}-vida-dado" class="block text-[10px] text-gray-500 text-center truncate text-red-300">Dado Vida</label><input type="text" id="${prefix}-vida-dado" class="w-full text-center px-1 py-1 bg-gray-700 text-white text-sm rounded border border-gray-600"></div>
                            <div><label for="${prefix}-mana-dado" class="block text-[10px] text-gray-500 text-center truncate text-blue-300">Dado Mana</label><input type="text" id="${prefix}-mana-dado" class="w-full text-center px-1 py-1 bg-gray-700 text-white text-sm rounded border border-gray-600"></div>
                        </div>
                    </div>
                    <div>
                        <label for="${prefix}-description" class="block text-xs font-semibold text-gray-400 mb-1">Descricao</label>
                        <textarea id="${prefix}-description" rows="3" class="w-full h-48 px-3 py-1.5 bg-gray-700 text-white text-sm rounded border border-gray-600 focus:border-teal-500 focus:outline-none"></textarea>
                    </div>
                    <div class="bg-gray-800/30 p-2 rounded border border-gray-700/50">
                        <h5 class="text-xs font-bold text-teal-300 uppercase mb-2">Aumentos Fixos</h5>
                        <div class="flex flex-wrap gap-2 items-end mb-2" style="justify-content: space-between;">
                            <div class="flex-grow min-w-[120px]">
                                <select id="${prefix}-aumento-select" class="w-full px-2 py-1 bg-gray-800 text-white text-sm rounded border border-gray-600"></select>
                            </div>
                            <div class="w-20">
                                <input type="number" id="${prefix}-aumento-value" placeholder="Valor" class="w-full px-2 py-1 bg-gray-800 text-white text-sm rounded border border-gray-600">
                            </div>
                            <button type="button" id="${prefix}-add-aumento-btn" class="bg-teal-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-teal-500">Add</button>
                        </div>
                        <div id="${prefix}-aumentos-list" class="flex flex-wrap gap-2"></div>
                    </div>
                </div>
            </div>
        </div>
    `);

    syncSpellInlineSelectOptions(role);
    document.getElementById(`${prefix}-image-upload`)?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        spellInlineRelatedImageFiles[role] = file || null;
        if (file) {
            const useBaseCheckbox = document.getElementById(`${prefix}-use-base-image`);
            if (useBaseCheckbox) useBaseCheckbox.checked = false;
        }
        updateSpellInlineImagePreview(role);
    });
    document.querySelector(`[data-inline-image-picker="${role}"]`)?.addEventListener('click', () => {
        const useBaseCheckbox = document.getElementById(`${prefix}-use-base-image`);
        if (useBaseCheckbox?.checked) return;
        document.getElementById(`${prefix}-image-upload`)?.click();
    });
    document.getElementById(`${prefix}-use-base-image`)?.addEventListener('change', () => updateSpellInlineImagePreview(role));
    document.getElementById(`${prefix}-add-aumento-btn`)?.addEventListener('click', () => {
        const select = document.getElementById(`${prefix}-aumento-select`);
        const valueInput = document.getElementById(`${prefix}-aumento-value`);
        const nome = select?.options[select.selectedIndex]?.text || '';
        const valor = parseInt(valueInput?.value, 10) || 0;

        if (!nome || valor === 0) {
            showCustomAlert('Selecione um aumento e informe um valor diferente de zero.');
            return;
        }

        renderSpellInlineAumento(role, { nome, valor, tipo: 'fixo' });
        if (valueInput) valueInput.value = '0';
    });
    updateSpellInlineImagePreview(role);
}

function renderSpellInlineRelatedSections() {
    const container = document.getElementById('spell-inline-related-sections');
    if (!container) return;

    RELATED_CARD_ROLES.forEach(role => {
        const checkbox = document.getElementById(`spell-create-${role}-card`);
        const section = document.getElementById(`${getSpellInlinePrefix(role)}-section`);

        if (checkbox?.checked) {
            renderSpellInlineRelatedSection(role);
            syncSpellInlineSelectOptions(role);
            updateSpellInlineImagePreview(role);
        } else if (section) {
            section.remove();
            spellInlineRelatedImageFiles[role] = null;
        }
    });
}

function clearSpellInlineRelatedSections() {
    RELATED_CARD_ROLES.forEach(role => {
        const checkbox = document.getElementById(`spell-create-${role}-card`);
        if (checkbox) checkbox.checked = false;
        spellInlineRelatedImageFiles[role] = null;
    });

    const container = document.getElementById('spell-inline-related-sections');
    if (container) container.innerHTML = '';
}

function updateSpellInlineRelatedUi() {
    const wrapper = document.getElementById('spell-inline-related-options');
    if (!wrapper) return;

    const roleSelect = document.getElementById('spell-card-role');
    const isRelatedCreation = Boolean(pendingRelatedSpellCreation);
    const canCreateInlineRelated = normalizeCardRole(roleSelect?.value) === 'base' && !pendingRelatedSpellCreation;
    wrapper.classList.toggle('hidden', !canCreateInlineRelated && !isRelatedCreation);
    wrapper.classList.toggle('related-form-only', isRelatedCreation);

    if (isRelatedCreation) {
        const container = document.getElementById('spell-inline-related-sections');
        if (container) container.innerHTML = '';
        updateSpellBaseTextFieldsUi();
        return;
    }

    if (!canCreateInlineRelated) {
        clearSpellInlineRelatedSections();
        updateSpellBaseTextFieldsUi();
        return;
    }

    renderSpellRelatedDraftStatus();
    updateSpellBaseTextFieldsUi();
}

function getSpellInlineRelatedRoles(cardVariant, relatedCreationContext) {
    return [];
}

async function collectSpellInlineRelatedPayloads(roles, type, baseSpellId, roleIds, baseImageBuffer, baseImageMimeType) {
    const payloads = [];

    for (const role of roles) {
        const prefix = getSpellInlinePrefix(role);
        const label = RELATED_ROLE_LABELS[role] || 'Relacionado';
        const name = document.getElementById(`${prefix}-name`)?.value?.trim() || '';
        if (!name) {
            showCustomAlert(`Informe o nome do card ${label}.`);
            return null;
        }

        const useBaseImage = document.getElementById(`${prefix}-use-base-image`)?.checked ?? true;
        const imageFile = spellInlineRelatedImageFiles[role];
        const imageBuffer = useBaseImage
            ? baseImageBuffer
            : (imageFile ? await readFileAsArrayBufferUtil(imageFile) : null);
        const imageMimeType = useBaseImage
            ? baseImageMimeType
            : (imageFile ? imageFile.type : null);

        payloads.push({
            role,
            id: roleIds[role],
            data: {
                id: roleIds[role],
                name,
                circle: parseInt(document.getElementById(`${prefix}-circle`)?.value, 10) || 0,
                execution: document.getElementById(`${prefix}-execution`)?.value || '',
                manaCost: parseInt(document.getElementById(`${prefix}-mana-cost`)?.value, 10) || 0,
                range: document.getElementById(`${prefix}-range`)?.value || '',
                target: document.getElementById(`${prefix}-target`)?.value || '',
                duration: document.getElementById(`${prefix}-duration`)?.value || '',
                resistencia: document.getElementById(`${prefix}-resistencia`)?.value || '',
                description: document.getElementById(`${prefix}-description`)?.value || '',
                cardVariant: role,
                trueSchool: '',
                baseCardId: baseSpellId,
                enhanceCardId: '',
                trueCardId: '',
                aumentos: getSpellInlineAumentos(role),
                type,
                characterId: document.getElementById(`${prefix}-character-owner`)?.value || '',
                categoryId: document.getElementById(`${prefix}-category-select`)?.value || '',
                image: imageBuffer,
                imageMimeType,
                acerto: document.getElementById(`${prefix}-acerto`)?.value || '',
                dano: document.getElementById(`${prefix}-damage`)?.value || '',
                critico: document.getElementById(`${prefix}-critico`)?.value || '',
                danoSemMana: document.getElementById(`${prefix}-dano-sem-mana`)?.value || '',
                vidaDado: document.getElementById(`${prefix}-vida-dado`)?.value || '',
                manaDado: document.getElementById(`${prefix}-mana-dado`)?.value || ''
            }
        });
    }

    return payloads;
}

function hasBaseSpellImage(snapshot) {
    return Boolean(snapshot?.spellImageFile || snapshot?.spellImage);
}

function updateRelatedSpellCreationUi() {
    const panel = document.getElementById('related-spell-creation-panel');
    const baseNameEl = document.getElementById('related-spell-base-name');
    const targetSlotEl = document.getElementById('related-spell-target-slot');
    const sameImageCheckbox = document.getElementById('related-spell-base-image-option');
    const sameImageWrapper = document.getElementById('related-spell-base-image-option-wrapper');
    const mainUpload = document.getElementById('spellImageUpload');

    if (panel) panel.classList.toggle('hidden', !pendingRelatedSpellCreation);

    if (!pendingRelatedSpellCreation) {
        if (sameImageCheckbox) {
            sameImageCheckbox.checked = false;
            sameImageCheckbox.disabled = false;
        }
        if (sameImageWrapper) sameImageWrapper.classList.add('hidden');
        if (mainUpload) mainUpload.disabled = false;
        return;
    }

    if (baseNameEl) baseNameEl.textContent = pendingRelatedSpellCreation.baseName || 'card base';
    if (targetSlotEl) targetSlotEl.textContent = pendingRelatedSpellCreation.targetRelationType === 'true' ? 'Verdadeiro' : 'Aprimorar';

    const canReuseImage = hasBaseSpellImage(pendingRelatedSpellCreation.baseSnapshot);
    if (!canReuseImage) pendingRelatedSpellCreation.useBaseImage = false;
    if (sameImageCheckbox) {
        sameImageCheckbox.checked = canReuseImage && Boolean(pendingRelatedSpellCreation.useBaseImage);
        sameImageCheckbox.disabled = !canReuseImage;
    }
    if (sameImageWrapper) sameImageWrapper.classList.toggle('hidden', !canReuseImage);
    if (mainUpload) mainUpload.disabled = canReuseImage && Boolean(pendingRelatedSpellCreation.useBaseImage);
}

async function captureSpellFormSnapshot() {
    const persistedData = currentEditingSpellId ? await getData('rpgEffects', currentEditingSpellId) : null;
    const aumentos = [];
    document.querySelectorAll('#spell-aumentos-list div[data-nome]').forEach(el => {
        aumentos.push({
            nome: el.dataset.nome,
            valor: parseInt(el.dataset.valor, 10) || 0,
            tipo: el.dataset.tipo || 'fixo'
        });
    });

    return {
        currentEditingSpellId,
        type: getCurrentSpellFormType(),
        name: document.getElementById('spellName')?.value || '',
        circle: document.getElementById('spellCircle')?.value || '',
        execution: document.getElementById('spellExecution')?.value || '',
        manaCost: document.getElementById('spellManaCost')?.value || '',
        range: document.getElementById('spellRange')?.value || '',
        target: document.getElementById('spellTarget')?.value || '',
        duration: document.getElementById('spellDuration')?.value || '',
        resistencia: document.getElementById('spellResistencia')?.value || '',
        description: document.getElementById('spellDescription')?.value || '',
        enhance: document.getElementById('spellEnhanceText')?.value || '',
        true: document.getElementById('spellTrueText')?.value || '',
        cardVariant: normalizeCardRole(document.getElementById('spell-card-role')?.value),
        trueSchool: '',
        baseCardId: document.getElementById('spell-base-card-select')?.value || '',
        enhanceCardId: document.getElementById('spellEnhanceCardId')?.value || '',
        trueCardId: document.getElementById('spellTrueCardId')?.value || '',
        characterId: document.getElementById('spellCharacterOwner')?.value || '',
        categoryId: document.getElementById('spell-category-select')?.value || '',
        acerto: document.getElementById('spellAcerto')?.value || '',
        dano: document.getElementById('spellDamage')?.value || '',
        critico: document.getElementById('spellcritico')?.value || '',
        danoSemMana: document.getElementById('spellDanoSemMana')?.value || '',
        vidaDado: document.getElementById('spellVidaDado')?.value || '',
        manaDado: document.getElementById('spellManaDado')?.value || '',
        aumentos,
        spellImageFile,
        spellImage: persistedData?.image || null,
        spellImageMimeType: persistedData?.imageMimeType || null,
        draftBaseId: spellBaseDraftId,
        pendingRelatedDrafts: copySpellPendingRelatedDrafts()
    };
}

async function restoreSpellFormSnapshot(snapshot, options = {}) {
    if (!snapshot) return;
    const { asNew = false, mode = 'edit' } = options;

    resetSpellFormState(true);
    applySpellFormUi(snapshot.type, mode, asNew ? (snapshot.name || 'card base') : '');
    currentEditingSpellId = asNew ? null : (snapshot.currentEditingSpellId || null);
    spellBaseDraftId = asNew ? null : (snapshot.draftBaseId || null);
    if (!asNew) restoreSpellPendingRelatedDrafts(snapshot.pendingRelatedDrafts);

    document.getElementById('spellName').value = snapshot.name || '';
    document.getElementById('spellCircle').value = snapshot.circle || '';
    document.getElementById('spellExecution').value = snapshot.execution || '';
    document.getElementById('spellManaCost').value = snapshot.manaCost || '';
    document.getElementById('spellRange').value = snapshot.range || '';
    document.getElementById('spellTarget').value = snapshot.target || '';
    document.getElementById('spellDuration').value = snapshot.duration || '';
    document.getElementById('spellResistencia').value = snapshot.resistencia || '';
    document.getElementById('spellDescription').value = snapshot.description || '';
    const spellEnhanceText = document.getElementById('spellEnhanceText');
    const spellTrueText = document.getElementById('spellTrueText');
    if (spellEnhanceText) spellEnhanceText.value = snapshot.enhance || '';
    if (spellTrueText) spellTrueText.value = snapshot.true || '';
    const roleSelect = document.getElementById('spell-card-role');
    if (roleSelect) roleSelect.value = normalizeCardRole(snapshot.cardVariant);
    const trueSchoolSelect = document.getElementById('spell-true-school-select');
    if (trueSchoolSelect) trueSchoolSelect.value = '';
    await populateSpellBaseCardSelect(snapshot.baseCardId || '', currentEditingSpellId);
    const baseSelect = document.getElementById('spell-base-card-select');
    if (baseSelect) baseSelect.value = snapshot.baseCardId || '';
    document.getElementById('spellEnhanceCardId').value = asNew ? '' : (snapshot.enhanceCardId || '');
    document.getElementById('spellTrueCardId').value = asNew ? '' : (snapshot.trueCardId || '');
    document.getElementById('spellAcerto').value = snapshot.acerto || '';
    document.getElementById('spellDamage').value = snapshot.dano || '';
    document.getElementById('spellcritico').value = snapshot.critico || '';
    document.getElementById('spellDanoSemMana').value = snapshot.danoSemMana || '';
    document.getElementById('spellVidaDado').value = snapshot.vidaDado || '';
    document.getElementById('spellManaDado').value = snapshot.manaDado || '';

    await populateCharacterSelect('spellCharacterOwner');
    document.getElementById('spellCharacterOwner').value = snapshot.characterId || '';

    await populateCategorySelect('spell-category-select', snapshot.type);
    document.getElementById('spell-category-select').value = snapshot.categoryId || '';

    const aumentosList = document.getElementById('spell-aumentos-list');
    if (aumentosList) {
        aumentosList.innerHTML = '';
        normalizeFixedAumentos(snapshot.aumentos).forEach(aumento => renderAumentoNaLista(aumento));
    }

    spellImageFile = snapshot.spellImageFile || null;
    if (spellImageFile) {
        showImagePreview(document.getElementById('spellImagePreview'), URL.createObjectURL(spellImageFile), true);
    } else if (snapshot.spellImage) {
        const imageBlob = bufferToBlobUtil(snapshot.spellImage, snapshot.spellImageMimeType);
        showImagePreview(document.getElementById('spellImagePreview'), URL.createObjectURL(imageBlob), true);
    } else {
        showImagePreview(document.getElementById('spellImagePreview'), null, true);
    }

    if (!asNew) pendingRelatedSpellCreation = null;
    await updateSpellRelationLabels();
    updateSpellRoleUi();
    updateRelatedSpellCreationUi();
    updateSpellInlineRelatedUi();
}

async function restoreBaseSpellDraft(newRelatedId = '') {
    const snapshot = pendingRelatedSpellCreation?.baseSnapshot;
    if (!snapshot) return false;

    if (newRelatedId) {
        if (pendingRelatedSpellCreation.targetRelationType === 'true') snapshot.trueCardId = newRelatedId;
        else snapshot.enhanceCardId = newRelatedId;
    }

    snapshot.draftBaseId = spellBaseDraftId || snapshot.draftBaseId || pendingRelatedSpellCreation?.baseDraftId || null;
    snapshot.pendingRelatedDrafts = copySpellPendingRelatedDrafts();
    await restoreSpellFormSnapshot(snapshot, { mode: snapshot.currentEditingSpellId ? 'edit' : 'create' });
    return true;
}

function getRelatedSpellBaseImage(snapshot) {
    if (!snapshot) return { image: null, mimeType: null, isFile: false };

    if (snapshot.spellImageFile) {
        return {
            image: snapshot.spellImageFile,
            mimeType: snapshot.spellImageFile.type || null,
            isFile: true
        };
    }

    return {
        image: snapshot.spellImage || null,
        mimeType: snapshot.spellImageMimeType || null,
        isFile: false
    };
}

function applyRelatedSpellBaseImageOption() {
    if (!pendingRelatedSpellCreation) return;

    const baseSnapshot = pendingRelatedSpellCreation.baseSnapshot;
    const upload = document.getElementById('spellImageUpload');
    const canReuseImage = hasBaseSpellImage(baseSnapshot);
    if (!canReuseImage) pendingRelatedSpellCreation.useBaseImage = false;
    if (upload) upload.disabled = canReuseImage && Boolean(pendingRelatedSpellCreation.useBaseImage);

    if (!pendingRelatedSpellCreation.useBaseImage) {
        spellImageFile = null;
        showImagePreview(document.getElementById('spellImagePreview'), null, true);
        return;
    }

    if (baseSnapshot?.spellImageFile) {
        spellImageFile = baseSnapshot.spellImageFile;
        showImagePreview(document.getElementById('spellImagePreview'), URL.createObjectURL(baseSnapshot.spellImageFile), true);
    } else if (baseSnapshot?.spellImage) {
        spellImageFile = null;
        const imageBlob = bufferToBlobUtil(baseSnapshot.spellImage, baseSnapshot.spellImageMimeType);
        showImagePreview(document.getElementById('spellImagePreview'), URL.createObjectURL(imageBlob), true);
    } else {
        spellImageFile = null;
        showImagePreview(document.getElementById('spellImagePreview'), null, true);
    }
}

async function openBlankRelatedSpellForm(snapshot, role) {
    resetSpellFormState(true);
    currentEditingSpellId = null;
    spellImageFile = null;

    applySpellFormUi(snapshot.type, 'related', snapshot.name || 'card base');
    const roleSelect = document.getElementById('spell-card-role');
    if (roleSelect) roleSelect.value = role;

    await populateSpellBaseCardSelect(snapshot.currentEditingSpellId || '', null);
    const baseSelect = document.getElementById('spell-base-card-select');
    if (baseSelect) baseSelect.value = snapshot.currentEditingSpellId || '';
    await populateCharacterSelect('spellCharacterOwner');
    await populateCategorySelect('spell-category-select', snapshot.type);

    const aumentosList = document.getElementById('spell-aumentos-list');
    if (aumentosList) aumentosList.innerHTML = '';
    updateSpellRoleUi();
    updateRelatedSpellCreationUi();
    applyRelatedSpellBaseImageOption();
}

export async function startRelatedSpellCreation(preferredRole = '') {
    const normalizedPreferredRole = preferredRole === 'true' ? 'true' : (preferredRole === 'enhance' ? 'enhance' : '');

    const enhanceId = document.getElementById('spellEnhanceCardId')?.value || '';
    const trueId = document.getElementById('spellTrueCardId')?.value || '';
    const targetRelationType = normalizedPreferredRole || (!enhanceId ? 'enhance' : (!trueId ? 'true' : ''));

    if (!targetRelationType) {
        showCustomAlert('Os slots Aprimorar e Verdadeiro ja estao ocupados. Remova um ou use Relacionar Cards.');
        return false;
    }

    if ((targetRelationType === 'enhance' && enhanceId) || (targetRelationType === 'true' && trueId)) {
        showCustomAlert(`O slot ${RELATED_ROLE_LABELS[targetRelationType]} ja possui um card. Remova o relacionado atual antes de criar outro.`);
        return false;
    }

    const snapshot = await captureSpellFormSnapshot();
    if (!snapshot.currentEditingSpellId && !spellBaseDraftId) {
        spellBaseDraftId = createRecordId();
        snapshot.draftBaseId = spellBaseDraftId;
    }

    pendingRelatedSpellCreation = {
        baseSpellId: snapshot.currentEditingSpellId || '',
        baseDraftId: spellBaseDraftId || snapshot.draftBaseId || '',
        baseName: snapshot.name || 'card base',
        baseSnapshot: snapshot,
        targetRelationType,
        useBaseImage: true,
        storeAsDraft: !snapshot.currentEditingSpellId
    };

    await openBlankRelatedSpellForm(snapshot, targetRelationType);
    return true;
}

export async function handleSpellFormCloseRequest() {
    if (!pendingRelatedSpellCreation) return false;
    await restoreBaseSpellDraft();
    return true;
}

export function resetSpellFormState(preserveRelatedCreation = false) {
    if (!preserveRelatedCreation) {
        pendingRelatedSpellCreation = null;
        spellBaseDraftId = null;
        resetSpellPendingRelatedDrafts();
    }
    currentEditingSpellId = null;
    spellImageFile = null;
    clearSpellInlineRelatedSections();

    const spellForm = document.getElementById('spellForm');
    if (spellForm) spellForm.reset();

    const aumentosList = document.getElementById('spell-aumentos-list');
    if (aumentosList) aumentosList.innerHTML = '';

    showImagePreview(document.getElementById('spellImagePreview'), null, true);

    const enhanceInput = document.getElementById('spellEnhanceCardId');
    const trueInput = document.getElementById('spellTrueCardId');
    const roleSelect = document.getElementById('spell-card-role');
    const baseSelect = document.getElementById('spell-base-card-select');
    const trueSchoolSelect = document.getElementById('spell-true-school-select');
    const enhanceText = document.getElementById('spellEnhanceText');
    const trueText = document.getElementById('spellTrueText');

    if (enhanceInput) enhanceInput.value = '';
    if (trueInput) trueInput.value = '';
    if (roleSelect) roleSelect.value = 'base';
    if (baseSelect) baseSelect.innerHTML = '<option value="">Selecione um card base</option>';
    if (trueSchoolSelect) trueSchoolSelect.value = '';
    if (enhanceText) enhanceText.value = '';
    if (trueText) trueText.value = '';
    updateSpellRoleUi();
    updateRelatedSpellCreationUi();
}

async function updateSpellRelationLabels() {
    renderSpellRelatedDraftStatus();
}

export async function saveSpellCard(spellForm, type) {
    const relatedCreationContext = pendingRelatedSpellCreation;
    const spellNameInput = document.getElementById('spellName');
    const spellCircleInput = document.getElementById('spellCircle');
    const spellExecutionInput = document.getElementById('spellExecution');
    const spellManaCostInput = document.getElementById('spellManaCost');
    const spellRangeInput = document.getElementById('spellRange');
    const spellTargetInput = document.getElementById('spellTarget');
    const spellDurationInput = document.getElementById('spellDuration');
    const spellResistenciaInput = document.getElementById('spellResistencia');
    const spellDescriptionInput = document.getElementById('spellDescription');
    const spellEnhanceTextInput = document.getElementById('spellEnhanceText');
    const spellTrueTextInput = document.getElementById('spellTrueText');
    const spellEnhanceCardInput = document.getElementById('spellEnhanceCardId');
    const spellTrueCardInput = document.getElementById('spellTrueCardId');
    const spellCharacterOwnerInput = document.getElementById('spellCharacterOwner');
    const spellCategorySelect = document.getElementById('spell-category-select');
    const spellRoleSelect = document.getElementById('spell-card-role');
    const spellBaseCardSelect = document.getElementById('spell-base-card-select');
    
    const spellAcertoInput = document.getElementById('spellAcerto');
    const spellDamageInput = document.getElementById('spellDamage');
    // Novos campos
    const spellcriticoInput = document.getElementById('spellcritico');
    const spellDanoSemManaInput = document.getElementById('spellDanoSemMana');
    const spellVidaDadoInput = document.getElementById('spellVidaDado');
    const spellManaDadoInput = document.getElementById('spellManaDado');

    const aumentosList = document.getElementById('spell-aumentos-list');
    const aumentos = [];
    aumentosList.querySelectorAll('div[data-nome]').forEach(el => {
        aumentos.push({
            nome: el.dataset.nome,
            valor: parseInt(el.dataset.valor, 10),
            tipo: 'fixo'
        });
    });
    const normalizedAumentos = normalizeFixedAumentos(aumentos);

    let existingData = null;
    if (currentEditingSpellId) {
        existingData = await getData('rpgEffects', currentEditingSpellId);
    }
    const allEffects = ((await getData('rpgEffects')) || []);
    const previousRelation = existingData ? resolveSpellRole(existingData, allEffects) : { role: 'base', baseCardId: '' };
    const previousEnhanceCardId = existingData?.enhanceCardId || '';
    const previousTrueCardId = existingData?.trueCardId || '';
    const cardVariant = normalizeCardRole(spellRoleSelect?.value);
    const baseCardId = cardVariant === 'base' ? '' : (spellBaseCardSelect?.value || relatedCreationContext?.baseSpellId || relatedCreationContext?.baseDraftId || '');
    const trueSchool = '';

    if (cardVariant !== 'base' && !baseCardId) {
        showCustomAlert('Escolha um card base para este card.');
        return { keepOpen: true, createdRelatedCardId: null };
    }

    const baseImageSource = relatedCreationContext?.useBaseImage
        ? getRelatedSpellBaseImage(relatedCreationContext.baseSnapshot)
        : null;
    const imageBuffer = spellImageFile
        ? await readFileAsArrayBufferUtil(spellImageFile)
        : (baseImageSource?.isFile
            ? await readFileAsArrayBufferUtil(baseImageSource.image)
            : (baseImageSource?.image || (existingData ? existingData.image : null)));
    const imageMimeType = spellImageFile
        ? spellImageFile.type
        : (baseImageSource?.mimeType || (existingData ? existingData.imageMimeType : null));

    let spellData;
    const spellId = currentEditingSpellId ? currentEditingSpellId : (relatedCreationContext ? createRecordId() : (spellBaseDraftId || createRecordId()));
    const inlineRelatedRoles = getSpellInlineRelatedRoles(cardVariant, relatedCreationContext);
    const inlineRelatedIds = inlineRelatedRoles.reduce((acc, role) => {
        acc[role] = createRecordId();
        return acc;
    }, {});
    const inlineRelatedPayloads = await collectSpellInlineRelatedPayloads(inlineRelatedRoles, type, spellId, inlineRelatedIds, imageBuffer, imageMimeType);
    if (!inlineRelatedPayloads) {
        return { keepOpen: true, createdRelatedCardId: null };
    }
    const finalEnhanceCardId = cardVariant === 'base'
        ? (inlineRelatedIds.enhance || spellEnhanceCardInput?.value || spellPendingRelatedDrafts.enhance?.id || '')
        : '';
    const finalTrueCardId = cardVariant === 'base'
        ? (inlineRelatedIds.true || spellTrueCardInput?.value || spellPendingRelatedDrafts.true?.id || '')
        : '';
    const hasEnhanceRelation = Boolean(finalEnhanceCardId);
    const hasTrueRelation = Boolean(finalTrueCardId);

    const baseData = {
        name: spellNameInput.value,
        circle: parseInt(spellCircleInput.value) || 0,
        execution: spellExecutionInput.value,
        manaCost: parseInt(spellManaCostInput.value) || 0,
        range: spellRangeInput.value,
        target: spellTargetInput.value,
        duration: spellDurationInput.value,
        resistencia: spellResistenciaInput.value,
        description: spellDescriptionInput.value,
        enhance: cardVariant === 'base' && !hasEnhanceRelation ? (spellEnhanceTextInput?.value || '') : '',
        true: cardVariant === 'base' && !hasTrueRelation ? (spellTrueTextInput?.value || '') : '',
        cardVariant,
        trueSchool,
        baseCardId,
        enhanceCardId: finalEnhanceCardId,
        trueCardId: finalTrueCardId,
        aumentos: normalizedAumentos,
        type: type,
        characterId: spellCharacterOwnerInput.value,
        categoryId: spellCategorySelect.value,
        image: imageBuffer,
        imageMimeType: imageMimeType,
        acerto: spellAcertoInput.value,
        dano: spellDamageInput.value,  
        // Novos campos salvos
        critico: spellcriticoInput ? spellcriticoInput.value : '',
        danoSemMana: spellDanoSemManaInput ? spellDanoSemManaInput.value : '',
        vidaDado: spellVidaDadoInput ? spellVidaDadoInput.value : '',
        manaDado: spellManaDadoInput ? spellManaDadoInput.value : ''
    };

    if (currentEditingSpellId) {
        spellData = existingData;
        Object.assign(spellData, baseData);
    } else {
        spellData = {
            id: spellId,
            ...baseData
        };
    }

    spellData.predominantColor = await calculateColorUtil(spellData.image, spellData.imageMimeType, spellData.type === 'ataque'
        ? { color30: 'rgba(248, 113, 113, 0.3)', color100: 'rgb(248, 113, 113)' }
        : { color30: 'rgba(13, 148, 136, 0.3)', color100: 'rgb(13, 148, 136)' });

    if (relatedCreationContext?.storeAsDraft) {
        spellPendingRelatedDrafts[cardVariant] = spellData;
        await restoreBaseSpellDraft(spellData.id);
        return { keepOpen: true, createdRelatedCardId: spellData.id };
    }

    await saveData('rpgEffects', spellData);
    let characterRelationChanged = await syncEffectOwnerToCharacter(spellData, cardVariant, baseCardId, allEffects);
    if (cardVariant === 'base') {
        await unlinkRemovedBaseEffectRelations(
            spellData.id,
            previousEnhanceCardId,
            previousTrueCardId,
            spellData.enhanceCardId || '',
            spellData.trueCardId || ''
        );
    }
    await syncBaseEffectRelation(spellData, cardVariant, baseCardId, previousRelation.baseCardId);

    if (cardVariant === 'base') {
        for (const role of RELATED_CARD_ROLES) {
            const relatedDraft = spellPendingRelatedDrafts[role];
            const selectedId = role === 'true' ? spellData.trueCardId : spellData.enhanceCardId;
            if (!relatedDraft || String(relatedDraft.id || '') !== String(selectedId || '')) continue;
            relatedDraft.baseCardId = spellData.id;
            relatedDraft.predominantColor = await calculateColorUtil(relatedDraft.image, relatedDraft.imageMimeType, relatedDraft.type === 'ataque'
                ? { color30: 'rgba(248, 113, 113, 0.3)', color100: 'rgb(248, 113, 113)' }
                : { color30: 'rgba(13, 148, 136, 0.3)', color100: 'rgb(13, 148, 136)' });
            await saveData('rpgEffects', relatedDraft);
            await syncBaseEffectRelation(relatedDraft, role, spellData.id);
            characterRelationChanged = await syncEffectOwnerToCharacter(relatedDraft, role, spellData.id, allEffects) || characterRelationChanged;
        }
    }

    for (const payload of inlineRelatedPayloads) {
        const relatedSpellData = payload.data;
        relatedSpellData.predominantColor = await calculateColorUtil(relatedSpellData.image, relatedSpellData.imageMimeType, relatedSpellData.type === 'ataque'
            ? { color30: 'rgba(248, 113, 113, 0.3)', color100: 'rgb(248, 113, 113)' }
            : { color30: 'rgba(13, 148, 136, 0.3)', color100: 'rgb(13, 148, 136)' });
        await saveData('rpgEffects', relatedSpellData);
        await syncBaseEffectRelation(relatedSpellData, payload.role, spellData.id);
        characterRelationChanged = await syncEffectOwnerToCharacter(relatedSpellData, payload.role, spellData.id, allEffects) || characterRelationChanged;
    }

    const eventType = type === 'habilidade' ? 'habilidades' : (type === 'ataque' ? 'ataques' : 'magias');
    document.dispatchEvent(new CustomEvent('dataChanged', { detail: { type: eventType } }));
    if (characterRelationChanged) {
        document.dispatchEvent(new CustomEvent('dataChanged', { detail: { type: 'personagem' } }));
    }

    if (relatedCreationContext) {
        await restoreBaseSpellDraft(spellData.id);
        return { keepOpen: true, createdRelatedCardId: spellData.id };
    }

    resetSpellFormState();
    return { keepOpen: false, createdRelatedCardId: null };
}

export async function editSpell(spellId) {
    const spellData = await getData('rpgEffects', spellId);
    if (!spellData) return;
    const allEffects = ((await getData('rpgEffects')) || []);
    const relationState = resolveSpellRole(spellData, allEffects);

    pendingRelatedSpellCreation = null;
    currentEditingSpellId = spellId;
    applySpellFormUi(spellData.type, 'edit');

    document.getElementById('spellName').value = spellData.name;
    document.getElementById('spellCircle').value = spellData.circle || '';
    document.getElementById('spellExecution').value = spellData.execution;
    document.getElementById('spellManaCost').value = spellData.manaCost || '';
    document.getElementById('spellRange').value = spellData.range;
    document.getElementById('spellTarget').value = spellData.target;
    document.getElementById('spellDuration').value = spellData.duration;
    document.getElementById('spellResistencia').value = spellData.resistencia;
    document.getElementById('spellDescription').value = spellData.description;
    const spellEnhanceText = document.getElementById('spellEnhanceText');
    const spellTrueText = document.getElementById('spellTrueText');
    if (spellEnhanceText) spellEnhanceText.value = spellData.enhance || '';
    if (spellTrueText) spellTrueText.value = spellData.true || '';
    const enhanceInput = document.getElementById('spellEnhanceCardId');
    const trueInput = document.getElementById('spellTrueCardId');
    
    document.getElementById('spellAcerto').value = spellData.acerto || '';
    document.getElementById('spellDamage').value = spellData.dano || '';
    
    // Novos campos preenchidos na edição
    const semManaAcerto = document.getElementById('spellcritico');
    const semManaDano = document.getElementById('spellDanoSemMana');
    if (semManaAcerto) semManaAcerto.value = spellData.critico || '';
    if (semManaDano) semManaDano.value = spellData.danoSemMana || '';
    const spellVidaDadoInput = document.getElementById('spellVidaDado');
    const spellManaDadoInput = document.getElementById('spellManaDado');
    if (spellVidaDadoInput) spellVidaDadoInput.value = spellData.vidaDado || '';
    if (spellManaDadoInput) spellManaDadoInput.value = spellData.manaDado || '';

    await populateCharacterSelect('spellCharacterOwner');
    document.getElementById('spellCharacterOwner').value = spellData.characterId || '';

    await populateCategorySelect('spell-category-select', spellData.type);
    document.getElementById('spell-category-select').value = spellData.categoryId || '';
    const roleSelect = document.getElementById('spell-card-role');
    if (roleSelect) roleSelect.value = relationState.role;
    const trueSchoolSelect = document.getElementById('spell-true-school-select');
    if (trueSchoolSelect) trueSchoolSelect.value = '';
    await populateSpellBaseCardSelect(relationState.baseCardId, spellId);
    const baseSelect = document.getElementById('spell-base-card-select');
    if (baseSelect) baseSelect.value = relationState.baseCardId || '';

    const aumentosList = document.getElementById('spell-aumentos-list');
    aumentosList.innerHTML = '';
    normalizeFixedAumentos(spellData.aumentos).forEach(aumento => renderAumentoNaLista(aumento));

    const spellImagePreview = document.getElementById('spellImagePreview');
    if (spellData.image) {
        const imageBlob = bufferToBlobUtil(spellData.image, spellData.imageMimeType);
        showImagePreview(spellImagePreview, URL.createObjectURL(imageBlob), true);
    } else {
        showImagePreview(spellImagePreview, null, true);
    }

    if (enhanceInput) enhanceInput.value = spellData.enhanceCardId || '';
    if (trueInput) trueInput.value = spellData.trueCardId || '';
    await updateSpellRelationLabels();
    updateSpellRoleUi();
    updateRelatedSpellCreationUi();
}

export async function removeSpell(spellId) {
    if (await showCustomConfirm('Tem certeza que deseja excluir este efeito?')) {
        await removeData('rpgEffects', spellId);
    }
}

export async function exportSpell(spellId) {
    const spellData = await getData('rpgEffects', spellId);
    if (spellData) {
        const dataToExport = { ...spellData };
        if (dataToExport.image) dataToExport.image = arrayBufferToBase64Util(dataToExport.image);
        if (dataToExport.enhanceImage) dataToExport.enhanceImage = arrayBufferToBase64Util(dataToExport.enhanceImage);
        if (dataToExport.trueImage) dataToExport.trueImage = arrayBufferToBase64Util(dataToExport.trueImage);

        const jsonString = JSON.stringify(dataToExport, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeName = (dataToExport.name || 'efeito').replace(/\s+/g, '_');
        const prefix = dataToExport.type === 'habilidade' ? 'habilidade' : (dataToExport.type === 'ataque' ? 'ataque' : 'magia');
        a.download = `${prefix}_${safeName}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

export async function importSpell(file, type) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const importedSpell = JSON.parse(e.target.result);
                if (isArenaModelTemplatePayload(importedSpell)) {
                    const templateType = type === 'habilidades' ? 'habilidade' : (type === 'ataques' ? 'ataque' : 'magia');
                    const templateCard = importedSpell.app === 'arena-card-model'
                        ? { arenaModel: importedSpell, type: templateType }
                        : { ...importedSpell, type: templateType };
                    saveArenaModelTemplateFromCard({ ...templateCard, _arenaStoreName: 'rpgEffects' });
                    resolve({ __arenaModelTemplateOnly: true });
                    return;
                }
                if (!importedSpell || importedSpell.id === undefined) {
                    throw new Error("Formato de arquivo inválido.");
                }

                const existingSpell = await getData('rpgEffects', importedSpell.id);
                importedSpell.id = existingSpell ? String(existingSpell.id) : Date.now().toString();
                if (importedSpell.arenaModel || importedSpell._arenaModel) {
                    importedSpell.disableArenaModel = false;
                    importedSpell._disableArenaModel = false;
                }
                if (type === 'habilidades') importedSpell.type = 'habilidade';
                else if (type === 'ataques') importedSpell.type = 'ataque';
                else importedSpell.type = 'magia';

                if (importedSpell.image) importedSpell.image = base64ToArrayBufferUtil(importedSpell.image);
                if (importedSpell.enhanceImage) importedSpell.enhanceImage = base64ToArrayBufferUtil(importedSpell.enhanceImage);
                if (importedSpell.trueImage) importedSpell.trueImage = base64ToArrayBufferUtil(importedSpell.trueImage);

                importedSpell.predominantColor = await calculateColorUtil(importedSpell.image, importedSpell.imageMimeType, importedSpell.type === 'ataque'
                    ? { color30: 'rgba(248, 113, 113, 0.3)', color100: 'rgb(248, 113, 113)' }
                    : { color30: 'rgba(13, 148, 136, 0.3)', color100: 'rgb(13, 148, 136)' });
                saveArenaModelTemplateFromCard(importedSpell);
                await saveData('rpgEffects', importedSpell);
                resolve(importedSpell);
            } catch (error) {
                console.error("Erro ao importar item:", error);
                reject(error);
            }
        };
        reader.onerror = (e) => reject(e.target.error);
        reader.readAsText(file);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    populateSpellAumentosSelect();
    document.addEventListener('periciasUpdated', populateSpellAumentosSelect);

    const addBtn = document.getElementById('add-spell-aumento-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const select = document.getElementById('spell-aumento-select');
            const valueInput = document.getElementById('spell-aumento-value');

            const nome = select.options[select.selectedIndex].text;
            const valor = parseInt(valueInput.value, 10) || 0;

            if (!nome || valor === 0) {
                showCustomAlert('Selecione um aumento e informe um valor diferente de zero.');
                return;
            }

            renderAumentoNaLista({ nome, valor, tipo: 'fixo' });
            valueInput.value = '0';
        });
    }

    setupSpellRelationsModal();

    const roleSelect = document.getElementById('spell-card-role');
    if (roleSelect) {
        roleSelect.addEventListener('change', async () => {
            const baseSelect = document.getElementById('spell-base-card-select');
            await populateSpellBaseCardSelect(baseSelect?.value || '', currentEditingSpellId);
            updateSpellRoleUi();
        });
    }

    RELATED_CARD_ROLES.forEach(role => {
        document.getElementById(`spell-create-${role}-card`)?.addEventListener('click', async () => {
            await startRelatedSpellCreation(role);
        });
    });

    const mainUpload = document.getElementById('spellImageUpload');
    if (mainUpload) {
        mainUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                if (pendingRelatedSpellCreation) {
                    pendingRelatedSpellCreation.useBaseImage = false;
                    const sameImageCheckbox = document.getElementById('related-spell-base-image-option');
                    if (sameImageCheckbox) sameImageCheckbox.checked = false;
                    mainUpload.disabled = false;
                }
                spellImageFile = file;
                showImagePreview(document.getElementById('spellImagePreview'), URL.createObjectURL(file), true);
                RELATED_CARD_ROLES.forEach(role => updateSpellInlineImagePreview(role));
            }
        });
    }

    const sameImageCheckbox = document.getElementById('related-spell-base-image-option');
    if (sameImageCheckbox) {
        sameImageCheckbox.addEventListener('change', (e) => {
            if (!pendingRelatedSpellCreation) {
                e.currentTarget.checked = false;
                return;
            }
            pendingRelatedSpellCreation.useBaseImage = e.currentTarget.checked;
            applyRelatedSpellBaseImageOption();
        });
    }

    updateRelatedSpellCreationUi();
    updateSpellInlineRelatedUi();
});

function setActiveSpellRelationType(type) {
    activeSpellRelationType = type;
    document.querySelectorAll('.spell-relation-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.relationType === type);
    });
}

async function setupSpellRelationsModal() {
    const modal = document.getElementById('spell-relations-modal');
    const closeBtn = document.getElementById('close-spell-relations-modal-btn');
    const list = document.getElementById('spell-relations-list');
    if (!modal || !closeBtn || !list) return;

    const closeModal = () => modal.classList.add('hidden');

    const renderList = async () => {
        const currentId = currentEditingSpellId;
        const currentType = getCurrentSpellFormType();
        const effects = (await getData('rpgEffects'))
            .filter(effect => effect.id !== currentId)
            .filter(effect => normalizeEffectType(effect.type) === currentType);

        const typeMeta = getEffectTypeMeta(currentType);

        if (effects.length === 0) {
            list.innerHTML = `<p class="text-gray-400 text-sm md:col-span-2">Nenhum card de ${typeMeta.label.toLowerCase()} disponivel para relacionar.</p>`;
            return;
        }

        const targetInputId = activeSpellRelationType === 'enhance' ? 'spellEnhanceCardId' : 'spellTrueCardId';
        const selectedId = document.getElementById(targetInputId)?.value || '';
        const noneActive = selectedId ? '' : ' active';
        list.innerHTML = `
            <button type="button" class="spell-relation-option${noneActive}" data-card-id="">
                <span class="flex items-center gap-2 font-semibold">
                    <i class="fas fa-times-circle text-gray-400"></i>
                    <span>Nenhum card</span>
                </span>
                <small>Remover relacao atual</small>
            </button>
            ${effects.map(effect => `
                <button type="button" class="spell-relation-option${effect.id === selectedId ? ' active' : ''}" data-card-id="${effect.id}">
                    <span class="flex items-center gap-2 font-semibold">
                        <i class="fas ${getEffectTypeMeta(effect.type).icon} ${getEffectTypeMeta(effect.type).tone}"></i>
                        <span>${effect.name || 'Sem nome'}</span>
                    </span>
                    <small>${effect.categoryId ? 'Card categorizado' : typeMeta.label}</small>
                </button>
            `).join('')}
        `;
    };

    openSpellRelationsModalForRole = async (role = 'enhance') => {
        setActiveSpellRelationType(role);
        await renderList();
        modal.classList.remove('hidden');
    };

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    modal.querySelectorAll('.spell-relation-tab').forEach(tab => {
        tab.addEventListener('click', async () => {
            setActiveSpellRelationType(tab.dataset.relationType);
            await renderList();
        });
    });

    list.addEventListener('click', async (e) => {
        const option = e.target.closest('.spell-relation-option');
        if (!option) return;

        const inputId = activeSpellRelationType === 'enhance' ? 'spellEnhanceCardId' : 'spellTrueCardId';
        const input = document.getElementById(inputId);
        if (input) input.value = option.dataset.cardId || '';
        spellPendingRelatedDrafts[activeSpellRelationType] = null;
        await updateSpellRelationLabels();
        updateSpellInlineRelatedUi();
        await renderList();
    });
}
