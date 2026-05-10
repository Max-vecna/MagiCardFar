import { saveData, getData, removeData } from './local_db.js';
import { getAumentosData, populateCharacterSelect } from './character_manager.js';
import { populateCategorySelect } from './category_manager.js';
import {
    showImagePreview,
    readFileAsArrayBuffer as readFileAsArrayBufferUtil,
    bufferToBlob as bufferToBlobUtil,
    arrayBufferToBase64 as arrayBufferToBase64Util,
    base64ToArrayBuffer as base64ToArrayBufferUtil,
    calculateColor as calculateColorUtil,
    showCustomAlert
} from './ui_utils.js';

let currentEditingItemId = null;
let itemImageFile = null;
let itemInlineRelatedImageFiles = { enhance: null, true: null };
let pendingRelatedItemCreation = null;
let itemBaseDraftId = null;
const itemPendingRelatedDrafts = { enhance: null, true: null };
let activeItemRelationType = 'enhance';
let openItemRelationsModalForRole = null;

const RELATED_ITEM_ROLES = ['enhance', 'true'];
const RELATED_ITEM_ROLE_LABELS = {
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

function normalizeItemRole(role) {
    return role === 'enhance' || role === 'true' ? role : 'base';
}

function getItemDisplayName(item) {
    return item?.name || item?.title || 'Item sem nome';
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

function getReferencedItemRole(items, itemId) {
    const parent = items.find(item => item?.enhanceCardId === itemId || item?.trueCardId === itemId);
    if (!parent) return { role: 'base', baseCardId: '' };
    return {
        role: parent.trueCardId === itemId ? 'true' : 'enhance',
        baseCardId: parent.id
    };
}

function resolveItemRole(itemData, items) {
    const referenced = getReferencedItemRole(items, itemData?.id);
    const explicitRole = normalizeItemRole(itemData?.cardVariant);
    if (explicitRole !== 'base') {
        return { role: explicitRole, baseCardId: itemData?.baseCardId || referenced.baseCardId || '' };
    }
    if (referenced.role !== 'base') return referenced;
    return { role: 'base', baseCardId: itemData?.baseCardId || '' };
}

async function populateItemBaseCardSelect(selectedBaseId = '', currentId = '') {
    const select = document.getElementById('item-base-card-select');
    if (!select) return;

    const allItems = ((await getData('rpgItems')) || []);
    const relatedIds = new Set();
    allItems.forEach(item => {
        if (item?.enhanceCardId) relatedIds.add(item.enhanceCardId);
        if (item?.trueCardId) relatedIds.add(item.trueCardId);
    });

    const items = allItems
        .filter(item => item?.id !== currentId)
        .filter(item => normalizeItemRole(item.cardVariant) === 'base')
        .filter(item => !relatedIds.has(item.id) || item.id === selectedBaseId);

    select.innerHTML = `
        <option value="">Selecione um card base</option>
        ${items.map(item => `<option value="${item.id}">${getItemDisplayName(item)}</option>`).join('')}
    `;
    select.value = selectedBaseId || '';
}

function updateItemRoleUi() {
    const roleSelect = document.getElementById('item-card-role');
    const roleControl = roleSelect?.closest('div');
    const baseWrapper = document.getElementById('item-base-card-wrapper');
    const baseSelect = document.getElementById('item-base-card-select');
    const role = normalizeItemRole(roleSelect?.value);
    const isBase = role === 'base';
    const isRelatedCreation = Boolean(pendingRelatedItemCreation);

    if (roleControl) roleControl.classList.toggle('hidden', isRelatedCreation);
    if (baseWrapper) baseWrapper.classList.toggle('hidden', isBase || isRelatedCreation);
    if (baseSelect) baseSelect.required = !isBase && !isRelatedCreation;
    const trueSchoolWrapper = document.getElementById('item-true-school-wrapper');
    const trueSchoolSelect = document.getElementById('item-true-school-select');
    if (trueSchoolWrapper) trueSchoolWrapper.classList.add('hidden');
    if (trueSchoolSelect) {
        trueSchoolSelect.required = false;
        trueSchoolSelect.value = '';
    }
    updateItemInlineRelatedUi();
}

async function syncBaseItemRelation(itemData, role, baseCardId, previousBaseCardId = '') {
    const normalizedRole = normalizeItemRole(role);
    const oldBaseId = previousBaseCardId && (previousBaseCardId !== baseCardId || normalizedRole === 'base') ? previousBaseCardId : '';

    if (oldBaseId) {
        const oldBase = await getData('rpgItems', oldBaseId);
        if (oldBase) {
            if (oldBase.enhanceCardId === itemData.id) oldBase.enhanceCardId = '';
            if (oldBase.trueCardId === itemData.id) oldBase.trueCardId = '';
            await saveData('rpgItems', oldBase);
        }
    }

    if (normalizedRole === 'base' || !baseCardId) return;

    const baseItem = await getData('rpgItems', baseCardId);
    if (!baseItem) return;

    if (baseItem.enhanceCardId === itemData.id && normalizedRole !== 'enhance') baseItem.enhanceCardId = '';
    if (baseItem.trueCardId === itemData.id && normalizedRole !== 'true') baseItem.trueCardId = '';
    if (normalizedRole === 'true') baseItem.trueCardId = itemData.id;
    else baseItem.enhanceCardId = itemData.id;
    await saveData('rpgItems', baseItem);
}

async function unlinkRemovedBaseItemRelations(baseItemId, previousEnhanceId = '', previousTrueId = '', nextEnhanceId = '', nextTrueId = '') {
    if (!baseItemId) return;

    const removedRelations = [
        { role: 'enhance', id: previousEnhanceId, nextId: nextEnhanceId },
        { role: 'true', id: previousTrueId, nextId: nextTrueId }
    ].filter(relation => relation.id && relation.id !== relation.nextId);

    for (const relation of removedRelations) {
        const relatedItem = await getData('rpgItems', relation.id);
        if (!relatedItem || String(relatedItem.baseCardId || '') !== String(baseItemId || '')) continue;

        relatedItem.baseCardId = '';
        relatedItem.cardVariant = 'base';
        if (relation.role === 'true') relatedItem.trueSchool = '';
        await saveData('rpgItems', relatedItem);
    }
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


export function populateItemAumentosSelect() {
    const select = document.getElementById('item-aumento-select');
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
    const list = document.getElementById('item-aumentos-list');
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
            <span class="font-semibold text-amber-300">${normalizedAumento.nome}</span>
            <span class="text-white ml-2">${normalizedAumento.valor > 0 ? '+' : ''}${normalizedAumento.valor}</span>
        </div>
        <button type="button" class="text-red-500 hover:text-red-400 remove-aumento-btn text-xl leading-none">&times;</button>
    `;

    div.querySelector('.remove-aumento-btn').addEventListener('click', () => {
        div.remove();
    });

    list.appendChild(div);
}

function getItemInlinePrefix(role) {
    return `item-inline-${role}`;
}

function cloneSelectOptions(sourceId, fallback = '<option value="">Nenhum</option>') {
    const source = document.getElementById(sourceId);
    return source?.innerHTML || fallback;
}

function resetItemPendingRelatedDrafts() {
    RELATED_ITEM_ROLES.forEach(role => {
        itemPendingRelatedDrafts[role] = null;
    });
}

function copyItemPendingRelatedDrafts() {
    return RELATED_ITEM_ROLES.reduce((acc, role) => {
        acc[role] = itemPendingRelatedDrafts[role] ? { ...itemPendingRelatedDrafts[role] } : null;
        return acc;
    }, {});
}

function restoreItemPendingRelatedDrafts(drafts = {}) {
    RELATED_ITEM_ROLES.forEach(role => {
        itemPendingRelatedDrafts[role] = drafts?.[role] ? { ...drafts[role] } : null;
    });
}

function renderItemRelatedDraftStatus() {
    const container = document.getElementById('item-inline-related-sections');
    if (!container) return;

    const rows = RELATED_ITEM_ROLES.map(role => {
        const inputId = role === 'true' ? 'itemTrueCardId' : 'itemEnhanceCardId';
        const id = document.getElementById(inputId)?.value || '';
        const draft = itemPendingRelatedDrafts[role];
        const label = RELATED_ITEM_ROLE_LABELS[role] || 'Relacionado';
        const name = draft?.name || (id ? 'Card selecionado' : 'Nenhum card criado');
        return `
            <div class="related-page-status related-page-status--action" data-open-item-related-action="${role}" role="button" tabindex="0">
                <div>
                    <span>${label}</span>
                    <strong>${name}</strong>
                </div>
                ${id ? `<button type="button" data-remove-item-related="${role}" aria-label="Remover ${label}">&times;</button>` : ''}
            </div>
        `;
    }).join('');

    container.innerHTML = `<div class="related-page-status-grid">${rows}</div>`;
    container.querySelectorAll('[data-open-item-related-action]').forEach(card => {
        const open = () => openItemRelatedActionModal(card.dataset.openItemRelatedAction);
        card.addEventListener('click', (e) => {
            if (e.target.closest('[data-remove-item-related]')) return;
            open();
        });
        card.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            open();
        });
    });
    container.querySelectorAll('[data-remove-item-related]').forEach(button => {
        button.addEventListener('click', () => {
            const role = button.dataset.removeItemRelated;
            const input = document.getElementById(role === 'true' ? 'itemTrueCardId' : 'itemEnhanceCardId');
            if (input) input.value = '';
            itemPendingRelatedDrafts[role] = null;
            updateItemInlineRelatedUi();
        });
    });
}

function getItemRelatedSlotId(role) {
    const inputId = role === 'true' ? 'itemTrueCardId' : 'itemEnhanceCardId';
    return document.getElementById(inputId)?.value || itemPendingRelatedDrafts[role]?.id || '';
}

function updateItemBaseTextFieldsUi() {
    const roleSelect = document.getElementById('item-card-role');
    const isBase = normalizeItemRole(roleSelect?.value) === 'base';
    const isRelatedCreation = Boolean(pendingRelatedItemCreation);
    const container = document.getElementById('item-base-text-fields');
    if (!container) return;

    const shouldShowContainer = isBase && !isRelatedCreation;
    container.classList.toggle('hidden', !shouldShowContainer);
    if (!shouldShowContainer) return;

    let visibleTextFields = 0;
    RELATED_ITEM_ROLES.forEach(role => {
        const wrapper = document.getElementById(role === 'true' ? 'item-true-text-wrapper' : 'item-enhance-text-wrapper');
        const hasRelatedCard = Boolean(getItemRelatedSlotId(role));
        if (wrapper) wrapper.classList.toggle('hidden', hasRelatedCard);
        if (!hasRelatedCard) visibleTextFields += 1;
    });
    container.classList.toggle('hidden', visibleTextFields === 0);
}

function openItemRelatedActionModal(role) {
    const normalizedRole = role === 'true' ? 'true' : 'enhance';
    const label = RELATED_ITEM_ROLE_LABELS[normalizedRole] || 'Relacionado';
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
        await startRelatedItemCreation(normalizedRole);
    };
    linkBtn.onclick = async () => {
        closeModal();
        if (typeof openItemRelationsModalForRole === 'function') {
            await openItemRelationsModalForRole(normalizedRole);
        }
    };
    closeBtn.onclick = closeModal;
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };
    modal.classList.remove('hidden');
}

function getItemInlineAumentos(role) {
    const aumentos = [];
    document.querySelectorAll(`#${getItemInlinePrefix(role)}-aumentos-list div[data-nome]`).forEach(el => {
        aumentos.push({
            nome: el.dataset.nome,
            valor: parseInt(el.dataset.valor, 10) || 0,
            tipo: el.dataset.tipo || 'fixo'
        });
    });
    return normalizeFixedAumentos(aumentos);
}

function renderItemInlineAumento(role, aumento) {
    const list = document.getElementById(`${getItemInlinePrefix(role)}-aumentos-list`);
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
            <span class="font-semibold text-amber-300">${normalizedAumento.nome}</span>
            <span class="text-white ml-2">${normalizedAumento.valor > 0 ? '+' : ''}${normalizedAumento.valor}</span>
        </div>
        <button type="button" class="text-red-500 hover:text-red-400 remove-aumento-btn text-xl leading-none">&times;</button>
    `;
    div.querySelector('.remove-aumento-btn').addEventListener('click', () => div.remove());
    list.appendChild(div);
}

function syncItemInlineSelectOptions(role) {
    const prefix = getItemInlinePrefix(role);
    const ownerSelect = document.getElementById(`${prefix}-character-owner`);
    const categorySelect = document.getElementById(`${prefix}-category-select`);
    const aumentoSelect = document.getElementById(`${prefix}-aumento-select`);

    if (ownerSelect) ownerSelect.innerHTML = cloneSelectOptions('itemCharacterOwner');
    if (categorySelect) categorySelect.innerHTML = cloneSelectOptions('item-category-select');
    if (aumentoSelect) aumentoSelect.innerHTML = cloneSelectOptions('item-aumento-select');
}

function updateItemInlineImagePreview(role) {
    const prefix = getItemInlinePrefix(role);
    const useBaseCheckbox = document.getElementById(`${prefix}-use-base-image`);
    const upload = document.getElementById(`${prefix}-image-upload`);
    const preview = document.getElementById(`${prefix}-image-preview`);
    const placeholder = document.getElementById(`${prefix}-image-placeholder`);
    if (!preview) return;

    const useBaseImage = useBaseCheckbox ? useBaseCheckbox.checked : true;
    if (upload) upload.disabled = useBaseImage;
    const applyPreview = (url) => {
        showImagePreview(preview, url || null);
        if (placeholder) placeholder.classList.toggle('hidden', Boolean(url));
    };

    if (useBaseImage) {
        const basePreview = document.getElementById('itemImagePreview');
        const baseUrl = basePreview && !basePreview.classList.contains('hidden') ? basePreview.src : '';
        applyPreview(baseUrl);
        return;
    }

    const file = itemInlineRelatedImageFiles[role];
    applyPreview(file ? URL.createObjectURL(file) : null);
}

function renderItemInlineRelatedSection(role) {
    const container = document.getElementById('item-inline-related-sections');
    if (!container || document.getElementById(`${getItemInlinePrefix(role)}-section`)) return;

    const prefix = getItemInlinePrefix(role);
    const label = RELATED_ITEM_ROLE_LABELS[role] || 'Relacionado';

    container.insertAdjacentHTML('beforeend', `
        <div id="${prefix}-section" class="bg-gray-900/50 border border-amber-500/30 rounded-lg p-3" data-inline-related-role="${role}">
            <div class="flex items-center justify-between gap-3 mb-3">
                <h4 class="text-sm font-bold text-amber-200">${label}</h4>
                <label for="${prefix}-use-base-image" class="flex items-center gap-2 text-xs text-gray-300">
                    <input type="checkbox" id="${prefix}-use-base-image" class="rounded border-gray-600 bg-gray-800 text-amber-500 focus:ring-amber-500" checked>
                    <span>Usar imagem da base</span>
                </label>
            </div>
            <div class="flex flex-col md:flex-row gap-4">
                <div class="w-full md:w-1/5 flex flex-col items-center gap-2 bg-gray-950/40 p-3 rounded-lg border border-gray-700 h-fit">
                    <label for="${prefix}-image-upload" class="block text-xs font-bold text-amber-300 uppercase cursor-pointer hover:text-white">Icone</label>
                    <div class="relative group cursor-pointer w-24 h-24" data-inline-item-image-picker="${role}">
                        <input type="file" id="${prefix}-image-upload" accept="image/*" class="hidden">
                        <img id="${prefix}-image-preview" class="w-full h-full object-cover rounded-full border-4 border-amber-900/50 group-hover:border-amber-500 transition-colors hidden">
                        <div id="${prefix}-image-placeholder" class="w-full h-full rounded-full border-2 border-dashed border-gray-600 flex items-center justify-center text-gray-500 group-hover:border-amber-500 group-hover:text-amber-400 transition-colors">
                            <i class="fas fa-layer-group text-3xl"></i>
                        </div>
                    </div>
                </div>
                <div class="w-full md:w-4/5 space-y-3">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div class="md:col-span-2">
                            <label for="${prefix}-name" class="block text-xs font-semibold text-gray-400 mb-1">Nome</label>
                            <input type="text" id="${prefix}-name" required class="w-full px-3 py-1.5 bg-gray-700 text-white text-sm rounded border border-gray-600 focus:border-amber-500 focus:outline-none">
                        </div>
                        <div>
                            <label for="${prefix}-category-select" class="block text-xs font-semibold text-gray-400 mb-1">Categoria</label>
                            <select id="${prefix}-category-select" class="w-full px-3 py-1.5 bg-gray-700 text-white text-sm rounded border border-gray-600 focus:border-amber-500 focus:outline-none"></select>
                        </div>
                    </div>
                    <div>
                        <label for="${prefix}-character-owner" class="block text-xs font-semibold text-gray-400 mb-1">Dono (Opcional)</label>
                        <select id="${prefix}-character-owner" class="w-full px-3 py-1.5 bg-gray-700 text-white text-sm rounded border border-gray-600 focus:border-amber-500 focus:outline-none"></select>
                    </div>
                    <div class="bg-gray-800/50 p-2 rounded border border-gray-700/50 grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                            <label for="${prefix}-type" class="block text-[10px] text-gray-500 uppercase mb-1">Tipo</label>
                            <input type="text" id="${prefix}-type" class="w-full px-2 py-1 bg-gray-700 text-white text-sm rounded border border-gray-600">
                        </div>
                        <div>
                            <label for="${prefix}-charge" class="block text-[10px] text-gray-500 uppercase mb-1">Carga</label>
                            <input type="number" id="${prefix}-charge" class="w-full px-2 py-1 bg-gray-700 text-white text-sm rounded border border-gray-600">
                        </div>
                        <div>
                            <label for="${prefix}-prerequisite" class="block text-[10px] text-gray-500 uppercase mb-1">Pre-req.</label>
                            <input type="text" id="${prefix}-prerequisite" class="w-full px-2 py-1 bg-gray-700 text-white text-sm rounded border border-gray-600">
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
                        <textarea id="${prefix}-description" rows="3" class="w-full h-48 px-3 py-1.5 bg-gray-700 text-white rounded border border-gray-600 text-sm focus:border-amber-500 focus:outline-none"></textarea>
                    </div>
                    <div class="bg-gray-800/30 p-2 rounded border border-gray-700/50">
                        <h5 class="text-xs font-bold text-amber-300 uppercase mb-2">Aumentos Fixos</h5>
                        <div class="flex flex-wrap gap-2 items-end mb-2" style="justify-content: space-between;">
                            <div class="flex-grow min-w-[120px]">
                                <select id="${prefix}-aumento-select" class="w-full px-2 py-1 bg-gray-800 text-white text-sm rounded border border-gray-600"></select>
                            </div>
                            <div class="w-20">
                                <input type="number" id="${prefix}-aumento-value" placeholder="Valor" class="w-full px-2 py-1 bg-gray-800 text-white text-sm rounded border border-gray-600">
                            </div>
                            <button type="button" id="${prefix}-add-aumento-btn" class="bg-amber-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-amber-500">Add</button>
                        </div>
                        <div id="${prefix}-aumentos-list" class="flex flex-wrap gap-2"></div>
                    </div>
                </div>
            </div>
        </div>
    `);

    syncItemInlineSelectOptions(role);
    document.getElementById(`${prefix}-image-upload`)?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        itemInlineRelatedImageFiles[role] = file || null;
        if (file) {
            const useBaseCheckbox = document.getElementById(`${prefix}-use-base-image`);
            if (useBaseCheckbox) useBaseCheckbox.checked = false;
        }
        updateItemInlineImagePreview(role);
    });
    document.querySelector(`[data-inline-item-image-picker="${role}"]`)?.addEventListener('click', () => {
        const useBaseCheckbox = document.getElementById(`${prefix}-use-base-image`);
        if (useBaseCheckbox?.checked) return;
        document.getElementById(`${prefix}-image-upload`)?.click();
    });
    document.getElementById(`${prefix}-use-base-image`)?.addEventListener('change', () => updateItemInlineImagePreview(role));
    document.getElementById(`${prefix}-add-aumento-btn`)?.addEventListener('click', () => {
        const select = document.getElementById(`${prefix}-aumento-select`);
        const valueInput = document.getElementById(`${prefix}-aumento-value`);
        const nome = select?.options[select.selectedIndex]?.text || '';
        const valor = parseInt(valueInput?.value, 10) || 0;

        if (!nome || valor === 0) {
            showCustomAlert('Selecione um aumento e informe um valor diferente de zero.');
            return;
        }

        renderItemInlineAumento(role, { nome, valor, tipo: 'fixo' });
        if (valueInput) valueInput.value = '0';
    });
    updateItemInlineImagePreview(role);
}

function renderItemInlineRelatedSections() {
    const container = document.getElementById('item-inline-related-sections');
    if (!container) return;

    RELATED_ITEM_ROLES.forEach(role => {
        const checkbox = document.getElementById(`item-create-${role}-card`);
        const section = document.getElementById(`${getItemInlinePrefix(role)}-section`);

        if (checkbox?.checked) {
            renderItemInlineRelatedSection(role);
            syncItemInlineSelectOptions(role);
            updateItemInlineImagePreview(role);
        } else if (section) {
            section.remove();
            itemInlineRelatedImageFiles[role] = null;
        }
    });
}

function clearItemInlineRelatedSections() {
    RELATED_ITEM_ROLES.forEach(role => {
        const checkbox = document.getElementById(`item-create-${role}-card`);
        if (checkbox) checkbox.checked = false;
        itemInlineRelatedImageFiles[role] = null;
    });

    const container = document.getElementById('item-inline-related-sections');
    if (container) container.innerHTML = '';
}

function updateItemInlineRelatedUi() {
    const wrapper = document.getElementById('item-inline-related-options');
    if (!wrapper) return;

    const roleSelect = document.getElementById('item-card-role');
    const isRelatedCreation = Boolean(pendingRelatedItemCreation);
    const canCreateInlineRelated = normalizeItemRole(roleSelect?.value) === 'base' && !isRelatedCreation;
    wrapper.classList.toggle('hidden', !canCreateInlineRelated && !isRelatedCreation);
    wrapper.classList.toggle('related-form-only', isRelatedCreation);
    RELATED_ITEM_ROLES.forEach(role => {
        document.getElementById(`item-create-${role}-card`)?.classList.toggle('hidden', isRelatedCreation);
    });

    if (isRelatedCreation) {
        const container = document.getElementById('item-inline-related-sections');
        if (container) container.innerHTML = '';
        updateItemBaseTextFieldsUi();
        return;
    }

    if (!canCreateInlineRelated) {
        clearItemInlineRelatedSections();
        updateItemBaseTextFieldsUi();
        return;
    }

    renderItemRelatedDraftStatus();
    updateItemBaseTextFieldsUi();
}

function getItemInlineRelatedRoles(cardVariant) {
    return [];
}

async function collectItemInlineRelatedPayloads(roles, baseItemId, roleIds, baseImageBuffer, baseImageMimeType) {
    const payloads = [];

    for (const role of roles) {
        const prefix = getItemInlinePrefix(role);
        const label = RELATED_ITEM_ROLE_LABELS[role] || 'Relacionado';
        const name = document.getElementById(`${prefix}-name`)?.value?.trim() || '';
        if (!name) {
            showCustomAlert(`Informe o nome do item ${label}.`);
            return null;
        }

        const useBaseImage = document.getElementById(`${prefix}-use-base-image`)?.checked ?? true;
        const imageFile = itemInlineRelatedImageFiles[role];
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
                effect: document.getElementById(`${prefix}-description`)?.value || '',
                type: document.getElementById(`${prefix}-type`)?.value || '',
                damage: document.getElementById(`${prefix}-damage`)?.value || '',
                charge: document.getElementById(`${prefix}-charge`)?.value || '',
                prerequisite: document.getElementById(`${prefix}-prerequisite`)?.value || '',
                characterId: document.getElementById(`${prefix}-character-owner`)?.value || '',
                categoryId: document.getElementById(`${prefix}-category-select`)?.value || '',
                cardVariant: role,
                trueSchool: '',
                baseCardId: baseItemId,
                enhanceCardId: '',
                trueCardId: '',
                acerto: document.getElementById(`${prefix}-acerto`)?.value || '',
                critico: document.getElementById(`${prefix}-critico`)?.value || '',
                damage: document.getElementById(`${prefix}-damage`)?.value || '',
                danoSemMana: document.getElementById(`${prefix}-dano-sem-mana`)?.value || '',
                vidaDado: document.getElementById(`${prefix}-vida-dado`)?.value || '',
                manaDado: document.getElementById(`${prefix}-mana-dado`)?.value || '',
                aumentos: getItemInlineAumentos(role),
                image: imageBuffer,
                imageMimeType
            }
        });
    }

    return payloads;
}

async function captureItemFormSnapshot() {
    const persistedData = currentEditingItemId ? await getData('rpgItems', currentEditingItemId) : null;
    const aumentos = [];
    document.querySelectorAll('#item-aumentos-list div[data-nome]').forEach(el => {
        aumentos.push({
            nome: el.dataset.nome,
            valor: parseInt(el.dataset.valor, 10) || 0,
            tipo: el.dataset.tipo || 'fixo'
        });
    });

    return {
        currentEditingItemId,
        name: document.getElementById('itemName')?.value || '',
        effect: document.getElementById('itemDescription')?.value || '',
        enhance: document.getElementById('itemEnhanceText')?.value || '',
        true: document.getElementById('itemTrueText')?.value || '',
        type: document.getElementById('itemType')?.value || '',
        damage: document.getElementById('itemDamage')?.value || '',
        charge: document.getElementById('itemCharge')?.value || '',
        prerequisite: document.getElementById('itemPrerequisite')?.value || '',
        characterId: document.getElementById('itemCharacterOwner')?.value || '',
        categoryId: document.getElementById('item-category-select')?.value || '',
        cardVariant: normalizeItemRole(document.getElementById('item-card-role')?.value),
        trueSchool: '',
        baseCardId: document.getElementById('item-base-card-select')?.value || '',
        enhanceCardId: document.getElementById('itemEnhanceCardId')?.value || '',
        trueCardId: document.getElementById('itemTrueCardId')?.value || '',
        acerto: document.getElementById('itemAcerto')?.value || '',
        critico: document.getElementById('itemcritico')?.value || '',
        danoSemMana: document.getElementById('itemDanoSemMana')?.value || '',
        vidaDado: document.getElementById('itemVidaDado')?.value || '',
        manaDado: document.getElementById('itemManaDado')?.value || '',
        aumentos,
        itemImageFile,
        itemImage: persistedData?.image || null,
        itemImageMimeType: persistedData?.imageMimeType || null,
        draftBaseId: itemBaseDraftId,
        pendingRelatedDrafts: copyItemPendingRelatedDrafts()
    };
}

async function restoreItemFormSnapshot(snapshot) {
    if (!snapshot) return;

    resetItemFormState(true);
    currentEditingItemId = snapshot.currentEditingItemId || null;
    itemBaseDraftId = snapshot.draftBaseId || null;
    restoreItemPendingRelatedDrafts(snapshot.pendingRelatedDrafts);
    const titleEl = document.getElementById('item-form-title');
    const submitEl = document.getElementById('itemSubmitButton');
    if (titleEl) titleEl.textContent = currentEditingItemId ? 'Editando Item' : 'Novo Item';
    if (submitEl) submitEl.textContent = currentEditingItemId ? 'Salvar Item' : 'Criar Item';

    document.getElementById('itemName').value = snapshot.name || '';
    document.getElementById('itemDescription').value = snapshot.effect || '';
    const itemEnhanceText = document.getElementById('itemEnhanceText');
    const itemTrueText = document.getElementById('itemTrueText');
    if (itemEnhanceText) itemEnhanceText.value = snapshot.enhance || '';
    if (itemTrueText) itemTrueText.value = snapshot.true || '';
    document.getElementById('itemType').value = snapshot.type || '';
    document.getElementById('itemDamage').value = snapshot.damage || '';
    document.getElementById('itemCharge').value = snapshot.charge || '';
    document.getElementById('itemPrerequisite').value = snapshot.prerequisite || '';
    document.getElementById('itemAcerto').value = snapshot.acerto || '';
    const criticoInput = document.getElementById('itemcritico');
    const danoSemManaInput = document.getElementById('itemDanoSemMana');
    const vidaDadoInput = document.getElementById('itemVidaDado');
    const manaDadoInput = document.getElementById('itemManaDado');
    if (criticoInput) criticoInput.value = snapshot.critico || '';
    if (danoSemManaInput) danoSemManaInput.value = snapshot.danoSemMana || '';
    if (vidaDadoInput) vidaDadoInput.value = snapshot.vidaDado || '';
    if (manaDadoInput) manaDadoInput.value = snapshot.manaDado || '';

    await populateCharacterSelect('itemCharacterOwner');
    document.getElementById('itemCharacterOwner').value = snapshot.characterId || '';
    await populateCategorySelect('item-category-select', 'item');
    document.getElementById('item-category-select').value = snapshot.categoryId || '';

    const roleSelect = document.getElementById('item-card-role');
    if (roleSelect) roleSelect.value = normalizeItemRole(snapshot.cardVariant);
    const trueSchoolSelect = document.getElementById('item-true-school-select');
    if (trueSchoolSelect) trueSchoolSelect.value = '';
    await populateItemBaseCardSelect(snapshot.baseCardId || '', currentEditingItemId);
    const baseSelect = document.getElementById('item-base-card-select');
    if (baseSelect) baseSelect.value = snapshot.baseCardId || '';
    const enhanceInput = document.getElementById('itemEnhanceCardId');
    const trueInput = document.getElementById('itemTrueCardId');
    if (enhanceInput) enhanceInput.value = snapshot.enhanceCardId || '';
    if (trueInput) trueInput.value = snapshot.trueCardId || '';

    const aumentosList = document.getElementById('item-aumentos-list');
    if (aumentosList) {
        aumentosList.innerHTML = '';
        normalizeFixedAumentos(snapshot.aumentos).forEach(aumento => renderAumentoNaLista(aumento));
    }

    itemImageFile = snapshot.itemImageFile || null;
    if (itemImageFile) {
        showImagePreview(document.getElementById('itemImagePreview'), URL.createObjectURL(itemImageFile));
    } else if (snapshot.itemImage) {
        const imageBlob = bufferToBlobUtil(snapshot.itemImage, snapshot.itemImageMimeType);
        showImagePreview(document.getElementById('itemImagePreview'), URL.createObjectURL(imageBlob));
    } else {
        showImagePreview(document.getElementById('itemImagePreview'), null);
    }

    pendingRelatedItemCreation = null;
    updateItemRoleUi();
    updateRelatedItemCreationUi();
    updateItemInlineRelatedUi();
}

async function restoreBaseItemDraft(newRelatedId = '') {
    const snapshot = pendingRelatedItemCreation?.baseSnapshot;
    if (!snapshot) return false;

    if (newRelatedId) {
        if (pendingRelatedItemCreation.targetRelationType === 'true') snapshot.trueCardId = newRelatedId;
        else snapshot.enhanceCardId = newRelatedId;
    }

    snapshot.draftBaseId = itemBaseDraftId || snapshot.draftBaseId || pendingRelatedItemCreation?.baseDraftId || null;
    snapshot.pendingRelatedDrafts = copyItemPendingRelatedDrafts();
    await restoreItemFormSnapshot(snapshot);
    return true;
}

function hasBaseItemImage(snapshot) {
    return Boolean(snapshot?.itemImageFile || snapshot?.itemImage);
}

function getRelatedItemBaseImage(snapshot) {
    if (!snapshot) return { image: null, mimeType: null, isFile: false };
    if (snapshot.itemImageFile) {
        return { image: snapshot.itemImageFile, mimeType: snapshot.itemImageFile.type || null, isFile: true };
    }
    return { image: snapshot.itemImage || null, mimeType: snapshot.itemImageMimeType || null, isFile: false };
}

function applyRelatedItemBaseImageOption() {
    if (!pendingRelatedItemCreation) return;

    const baseSnapshot = pendingRelatedItemCreation.baseSnapshot;
    const upload = document.getElementById('itemImageUpload');
    const canReuseImage = hasBaseItemImage(baseSnapshot);
    if (!canReuseImage) pendingRelatedItemCreation.useBaseImage = false;
    if (upload) upload.disabled = canReuseImage && Boolean(pendingRelatedItemCreation.useBaseImage);

    if (!pendingRelatedItemCreation.useBaseImage) {
        itemImageFile = null;
        showImagePreview(document.getElementById('itemImagePreview'), null);
        return;
    }

    if (baseSnapshot?.itemImageFile) {
        itemImageFile = baseSnapshot.itemImageFile;
        showImagePreview(document.getElementById('itemImagePreview'), URL.createObjectURL(baseSnapshot.itemImageFile));
    } else if (baseSnapshot?.itemImage) {
        itemImageFile = null;
        const imageBlob = bufferToBlobUtil(baseSnapshot.itemImage, baseSnapshot.itemImageMimeType);
        showImagePreview(document.getElementById('itemImagePreview'), URL.createObjectURL(imageBlob));
    } else {
        itemImageFile = null;
        showImagePreview(document.getElementById('itemImagePreview'), null);
    }
}

function updateRelatedItemCreationUi() {
    const panel = document.getElementById('related-item-creation-panel');
    const baseNameEl = document.getElementById('related-item-base-name');
    const targetSlotEl = document.getElementById('related-item-target-slot');
    const sameImageCheckbox = document.getElementById('related-item-base-image-option');
    const sameImageWrapper = document.getElementById('related-item-base-image-option-wrapper');
    const mainUpload = document.getElementById('itemImageUpload');

    if (panel) panel.classList.toggle('hidden', !pendingRelatedItemCreation);
    if (!pendingRelatedItemCreation) {
        if (sameImageCheckbox) {
            sameImageCheckbox.checked = false;
            sameImageCheckbox.disabled = false;
        }
        if (sameImageWrapper) sameImageWrapper.classList.add('hidden');
        if (mainUpload) mainUpload.disabled = false;
        return;
    }

    if (baseNameEl) baseNameEl.textContent = pendingRelatedItemCreation.baseName || 'card base';
    if (targetSlotEl) targetSlotEl.textContent = pendingRelatedItemCreation.targetRelationType === 'true' ? 'Verdadeiro' : 'Aprimorar';
    const canReuseImage = hasBaseItemImage(pendingRelatedItemCreation.baseSnapshot);
    if (!canReuseImage) pendingRelatedItemCreation.useBaseImage = false;
    if (sameImageCheckbox) {
        sameImageCheckbox.checked = canReuseImage && Boolean(pendingRelatedItemCreation.useBaseImage);
        sameImageCheckbox.disabled = !canReuseImage;
    }
    if (sameImageWrapper) sameImageWrapper.classList.toggle('hidden', !canReuseImage);
    if (mainUpload) mainUpload.disabled = canReuseImage && Boolean(pendingRelatedItemCreation.useBaseImage);
}

function setActiveItemRelationType(type) {
    activeItemRelationType = type === 'true' ? 'true' : 'enhance';
    document.querySelectorAll('#item-relations-modal .spell-relation-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.relationType === activeItemRelationType);
    });
}

async function setupItemRelationsModal() {
    const modal = document.getElementById('item-relations-modal');
    const closeBtn = document.getElementById('close-item-relations-modal-btn');
    const list = document.getElementById('item-relations-list');
    if (!modal || !closeBtn || !list) return;

    const closeModal = () => modal.classList.add('hidden');
    const renderList = async () => {
        const items = ((await getData('rpgItems')) || [])
            .filter(item => item.id !== currentEditingItemId);

        if (items.length === 0) {
            list.innerHTML = '<p class="text-gray-400 text-sm md:col-span-2">Nenhum item disponivel para relacionar.</p>';
            return;
        }

        const targetInputId = activeItemRelationType === 'enhance' ? 'itemEnhanceCardId' : 'itemTrueCardId';
        const selectedId = document.getElementById(targetInputId)?.value || '';
        const noneActive = selectedId ? '' : ' active';
        list.innerHTML = `
            <button type="button" class="spell-relation-option${noneActive}" data-card-id="">
                <span class="flex items-center gap-2 font-semibold">
                    <i class="fas fa-times-circle text-gray-400"></i>
                    <span>Nenhum item</span>
                </span>
                <small>Remover relacao atual</small>
            </button>
            ${items.map(item => `
                <button type="button" class="spell-relation-option${String(item.id) === String(selectedId) ? ' active' : ''}" data-card-id="${item.id}">
                    <span class="flex items-center gap-2 font-semibold">
                        <i class="fas fa-box text-amber-300"></i>
                        <span>${item.name || 'Sem nome'}</span>
                    </span>
                    <small>${item.categoryId ? 'Item categorizado' : 'Item'}</small>
                </button>
            `).join('')}
        `;
    };

    openItemRelationsModalForRole = async (role = 'enhance') => {
        setActiveItemRelationType(role);
        await renderList();
        modal.classList.remove('hidden');
    };

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    modal.querySelectorAll('.spell-relation-tab').forEach(tab => {
        tab.addEventListener('click', async () => {
            setActiveItemRelationType(tab.dataset.relationType);
            await renderList();
        });
    });
    list.addEventListener('click', async (e) => {
        const option = e.target.closest('.spell-relation-option');
        if (!option) return;

        const inputId = activeItemRelationType === 'enhance' ? 'itemEnhanceCardId' : 'itemTrueCardId';
        const input = document.getElementById(inputId);
        if (input) input.value = option.dataset.cardId || '';
        itemPendingRelatedDrafts[activeItemRelationType] = null;
        updateItemInlineRelatedUi();
        await renderList();
    });
}

async function openBlankRelatedItemForm(snapshot, role) {
    resetItemFormState(true);
    currentEditingItemId = null;
    itemImageFile = null;

    const titleEl = document.getElementById('item-form-title');
    const submitEl = document.getElementById('itemSubmitButton');
    if (titleEl) titleEl.textContent = `Novo Item relacionado: ${snapshot.name || 'card base'}`;
    if (submitEl) submitEl.textContent = 'Criar relacionado';

    const roleSelect = document.getElementById('item-card-role');
    if (roleSelect) roleSelect.value = role;
    await populateItemBaseCardSelect(snapshot.currentEditingItemId || '', null);
    const baseSelect = document.getElementById('item-base-card-select');
    if (baseSelect) baseSelect.value = snapshot.currentEditingItemId || '';
    await populateCharacterSelect('itemCharacterOwner');
    await populateCategorySelect('item-category-select', 'item');

    const aumentosList = document.getElementById('item-aumentos-list');
    if (aumentosList) aumentosList.innerHTML = '';
    updateItemRoleUi();
    updateRelatedItemCreationUi();
    applyRelatedItemBaseImageOption();
}

export async function startRelatedItemCreation(preferredRole = '') {
    const targetRelationType = preferredRole === 'true' ? 'true' : 'enhance';
    const existingId = document.getElementById(targetRelationType === 'true' ? 'itemTrueCardId' : 'itemEnhanceCardId')?.value || '';
    if (existingId) {
        showCustomAlert(`O slot ${RELATED_ITEM_ROLE_LABELS[targetRelationType]} ja possui um card. Remova o relacionado atual antes de criar outro.`);
        return false;
    }

    const snapshot = await captureItemFormSnapshot();
    if (!snapshot.currentEditingItemId && !itemBaseDraftId) {
        itemBaseDraftId = createRecordId();
        snapshot.draftBaseId = itemBaseDraftId;
    }

    pendingRelatedItemCreation = {
        baseItemId: snapshot.currentEditingItemId || '',
        baseDraftId: itemBaseDraftId || snapshot.draftBaseId || '',
        baseName: snapshot.name || 'card base',
        baseSnapshot: snapshot,
        targetRelationType,
        useBaseImage: true,
        storeAsDraft: !snapshot.currentEditingItemId
    };

    await openBlankRelatedItemForm(snapshot, targetRelationType);
    return true;
}

export async function handleItemFormCloseRequest() {
    if (!pendingRelatedItemCreation) return false;
    await restoreBaseItemDraft();
    return true;
}

export function resetItemFormState(preserveRelatedCreation = false) {
    if (!preserveRelatedCreation) {
        pendingRelatedItemCreation = null;
        itemBaseDraftId = null;
        resetItemPendingRelatedDrafts();
    }
    currentEditingItemId = null;
    itemImageFile = null;
    clearItemInlineRelatedSections();

    const itemForm = document.getElementById('itemForm');
    if (itemForm) itemForm.reset();

    const aumentosList = document.getElementById('item-aumentos-list');
    if (aumentosList) aumentosList.innerHTML = '';

    const roleSelect = document.getElementById('item-card-role');
    const baseSelect = document.getElementById('item-base-card-select');
    const trueSchoolSelect = document.getElementById('item-true-school-select');
    const enhanceInput = document.getElementById('itemEnhanceCardId');
    const trueInput = document.getElementById('itemTrueCardId');
    const enhanceText = document.getElementById('itemEnhanceText');
    const trueText = document.getElementById('itemTrueText');
    if (roleSelect) roleSelect.value = 'base';
    if (baseSelect) baseSelect.innerHTML = '<option value="">Selecione um card base</option>';
    if (trueSchoolSelect) trueSchoolSelect.value = '';
    if (enhanceInput) enhanceInput.value = '';
    if (trueInput) trueInput.value = '';
    if (enhanceText) enhanceText.value = '';
    if (trueText) trueText.value = '';

    showImagePreview(document.getElementById('itemImagePreview'), null);
    updateItemRoleUi();
    updateRelatedItemCreationUi();
}

export async function saveItemCard(itemForm) {
    const relatedCreationContext = pendingRelatedItemCreation;
    const itemNameInput = document.getElementById('itemName');
    const itemDescriptionInput = document.getElementById('itemDescription');
    const itemEnhanceTextInput = document.getElementById('itemEnhanceText');
    const itemTrueTextInput = document.getElementById('itemTrueText');
    const itemTypeInput = document.getElementById('itemType');
    const itemDamageInput = document.getElementById('itemDamage');
    const itemChargeInput = document.getElementById('itemCharge');
    const itemPrerequisiteInput = document.getElementById('itemPrerequisite');
    const itemCharacterOwnerInput = document.getElementById('itemCharacterOwner');
    const itemCategorySelect = document.getElementById('item-category-select');
    const itemRoleSelect = document.getElementById('item-card-role');
    const itemBaseCardSelect = document.getElementById('item-base-card-select');
    const itemEnhanceCardInput = document.getElementById('itemEnhanceCardId');
    const itemTrueCardInput = document.getElementById('itemTrueCardId');
    // Novo campo
    const itemAcertoInput = document.getElementById('itemAcerto');
    const itemCriticoInput = document.getElementById('itemcritico');
    const itemDanoSemManaInput = document.getElementById('itemDanoSemMana');
    const itemVidaDadoInput = document.getElementById('itemVidaDado');
    const itemManaDadoInput = document.getElementById('itemManaDado');
    
    const aumentosList = document.getElementById('item-aumentos-list');
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
    if (currentEditingItemId) {
        existingData = await getData('rpgItems', currentEditingItemId);
    }
    const allItems = ((await getData('rpgItems')) || []);
    const previousRelation = existingData ? resolveItemRole(existingData, allItems) : { role: 'base', baseCardId: '' };
    const previousEnhanceCardId = existingData?.enhanceCardId || '';
    const previousTrueCardId = existingData?.trueCardId || '';
    const cardVariant = normalizeItemRole(itemRoleSelect?.value);
    const baseCardId = cardVariant === 'base' ? '' : (itemBaseCardSelect?.value || relatedCreationContext?.baseItemId || relatedCreationContext?.baseDraftId || '');
    const trueSchool = '';

    if (cardVariant !== 'base' && !baseCardId) {
        showCustomAlert('Escolha um card base para este item.');
        return { keepOpen: true };
    }

    const baseImageSource = relatedCreationContext?.useBaseImage
        ? getRelatedItemBaseImage(relatedCreationContext.baseSnapshot)
        : null;
    const imageBuffer = itemImageFile
        ? await readFileAsArrayBufferUtil(itemImageFile)
        : (baseImageSource?.isFile
            ? await readFileAsArrayBufferUtil(baseImageSource.image)
            : (baseImageSource?.image || (existingData ? existingData.image : null)));
    const imageMimeType = itemImageFile
        ? itemImageFile.type
        : (baseImageSource?.mimeType || (existingData ? existingData.imageMimeType : null));
    
    let itemData;
    const itemId = currentEditingItemId ? currentEditingItemId : (relatedCreationContext ? createRecordId() : (itemBaseDraftId || createRecordId()));
    const inlineRelatedRoles = getItemInlineRelatedRoles(cardVariant);
    const inlineRelatedIds = inlineRelatedRoles.reduce((acc, role) => {
        acc[role] = createRecordId();
        return acc;
    }, {});
    const inlineRelatedPayloads = await collectItemInlineRelatedPayloads(inlineRelatedRoles, itemId, inlineRelatedIds, imageBuffer, imageMimeType);
    if (!inlineRelatedPayloads) {
        return { keepOpen: true };
    }
    const finalEnhanceCardId = cardVariant === 'base'
        ? (inlineRelatedIds.enhance || itemEnhanceCardInput?.value || itemPendingRelatedDrafts.enhance?.id || '')
        : '';
    const finalTrueCardId = cardVariant === 'base'
        ? (inlineRelatedIds.true || itemTrueCardInput?.value || itemPendingRelatedDrafts.true?.id || '')
        : '';
    const hasEnhanceRelation = Boolean(finalEnhanceCardId);
    const hasTrueRelation = Boolean(finalTrueCardId);

    const baseData = {
        name: itemNameInput.value,
        effect: itemDescriptionInput.value,
        enhance: cardVariant === 'base' && !hasEnhanceRelation ? (itemEnhanceTextInput?.value || '') : '',
        true: cardVariant === 'base' && !hasTrueRelation ? (itemTrueTextInput?.value || '') : '',
        type: itemTypeInput.value,
        damage: itemDamageInput.value,
        charge: itemChargeInput.value,
        prerequisite: itemPrerequisiteInput.value,
        characterId: itemCharacterOwnerInput.value,
        categoryId: itemCategorySelect.value,
        cardVariant,
        trueSchool,
        baseCardId,
        enhanceCardId: finalEnhanceCardId,
        trueCardId: finalTrueCardId,
        acerto: itemAcertoInput.value, // Salvando acerto
        critico: itemCriticoInput ? itemCriticoInput.value : '',
        danoSemMana: itemDanoSemManaInput ? itemDanoSemManaInput.value : '',
        vidaDado: itemVidaDadoInput ? itemVidaDadoInput.value : '',
        manaDado: itemManaDadoInput ? itemManaDadoInput.value : '',
        aumentos: normalizedAumentos,
        image: imageBuffer,
        imageMimeType: imageMimeType,
    };

    if (currentEditingItemId) {
        itemData = existingData;
        Object.assign(itemData, baseData);
    } else {
        itemData = {
            id: itemId,
            ...baseData
        };
    }

    itemData.predominantColor = await calculateColorUtil(itemData.image, itemData.imageMimeType, { color30: 'rgba(217, 119, 6, 0.3)', color100: 'rgb(217, 119, 6)' });

    if (relatedCreationContext?.storeAsDraft) {
        itemPendingRelatedDrafts[cardVariant] = itemData;
        await restoreBaseItemDraft(itemData.id);
        return { keepOpen: true };
    }

    await saveData('rpgItems', itemData);
    if (cardVariant === 'base') {
        await unlinkRemovedBaseItemRelations(
            itemData.id,
            previousEnhanceCardId,
            previousTrueCardId,
            itemData.enhanceCardId || '',
            itemData.trueCardId || ''
        );
    }
    await syncBaseItemRelation(itemData, cardVariant, baseCardId, previousRelation.baseCardId);

    if (cardVariant === 'base') {
        for (const role of RELATED_ITEM_ROLES) {
            const relatedDraft = itemPendingRelatedDrafts[role];
            const selectedId = role === 'true' ? itemData.trueCardId : itemData.enhanceCardId;
            if (!relatedDraft || String(relatedDraft.id || '') !== String(selectedId || '')) continue;
            relatedDraft.baseCardId = itemData.id;
            relatedDraft.predominantColor = await calculateColorUtil(relatedDraft.image, relatedDraft.imageMimeType, { color30: 'rgba(217, 119, 6, 0.3)', color100: 'rgb(217, 119, 6)' });
            await saveData('rpgItems', relatedDraft);
            await syncBaseItemRelation(relatedDraft, role, itemData.id);
        }
    }

    for (const payload of inlineRelatedPayloads) {
        const relatedItemData = payload.data;
        relatedItemData.predominantColor = await calculateColorUtil(relatedItemData.image, relatedItemData.imageMimeType, { color30: 'rgba(217, 119, 6, 0.3)', color100: 'rgb(217, 119, 6)' });
        await saveData('rpgItems', relatedItemData);
        await syncBaseItemRelation(relatedItemData, payload.role, itemData.id);
    }

    document.dispatchEvent(new CustomEvent('dataChanged', { detail: { type: 'itens' } }));

    resetItemFormState();
    return { keepOpen: false };
}

export async function editItem(itemId) {
    const itemData = await getData('rpgItems', itemId);
    if (!itemData) return;
    const allItems = ((await getData('rpgItems')) || []);
    const relationState = resolveItemRole(itemData, allItems);

    currentEditingItemId = itemId;
    document.getElementById('itemName').value = itemData.name;
    document.getElementById('itemDescription').value = itemData.effect;
    const itemEnhanceText = document.getElementById('itemEnhanceText');
    const itemTrueText = document.getElementById('itemTrueText');
    if (itemEnhanceText) itemEnhanceText.value = itemData.enhance || '';
    if (itemTrueText) itemTrueText.value = itemData.true || '';
    document.getElementById('itemType').value = itemData.type || '';
    document.getElementById('itemDamage').value = itemData.damage || '';
    document.getElementById('itemCharge').value = itemData.charge || '';
    document.getElementById('itemPrerequisite').value = itemData.prerequisite || '';
    // Carregar acerto
    document.getElementById('itemAcerto').value = itemData.acerto || '';
    const itemCriticoInput = document.getElementById('itemcritico');
    const itemDanoSemManaInput = document.getElementById('itemDanoSemMana');
    const itemVidaDadoInput = document.getElementById('itemVidaDado');
    const itemManaDadoInput = document.getElementById('itemManaDado');
    if (itemCriticoInput) itemCriticoInput.value = itemData.critico || '';
    if (itemDanoSemManaInput) itemDanoSemManaInput.value = itemData.danoSemMana || '';
    if (itemVidaDadoInput) itemVidaDadoInput.value = itemData.vidaDado || '';
    if (itemManaDadoInput) itemManaDadoInput.value = itemData.manaDado || '';
    
    await populateCharacterSelect('itemCharacterOwner');
    document.getElementById('itemCharacterOwner').value = itemData.characterId || '';

    await populateCategorySelect('item-category-select', 'item');
    document.getElementById('item-category-select').value = itemData.categoryId || '';
    const roleSelect = document.getElementById('item-card-role');
    if (roleSelect) roleSelect.value = relationState.role;
    const trueSchoolSelect = document.getElementById('item-true-school-select');
    if (trueSchoolSelect) trueSchoolSelect.value = '';
    await populateItemBaseCardSelect(relationState.baseCardId, itemId);
    const baseSelect = document.getElementById('item-base-card-select');
    if (baseSelect) baseSelect.value = relationState.baseCardId || '';
    const enhanceInput = document.getElementById('itemEnhanceCardId');
    const trueInput = document.getElementById('itemTrueCardId');
    if (enhanceInput) enhanceInput.value = itemData.enhanceCardId || '';
    if (trueInput) trueInput.value = itemData.trueCardId || '';
    updateItemRoleUi();

    const aumentosList = document.getElementById('item-aumentos-list');
    aumentosList.innerHTML = '';
    normalizeFixedAumentos(itemData.aumentos).forEach(aumento => renderAumentoNaLista(aumento));

    const itemImagePreview = document.getElementById('itemImagePreview');
    if (itemData.image) {
        const imageBlob = bufferToBlobUtil(itemData.image, itemData.imageMimeType);
        showImagePreview(itemImagePreview, URL.createObjectURL(imageBlob));
    } else {
        showImagePreview(itemImagePreview, null);
    }
}

export async function removeItem(itemId) {
    await removeData('rpgItems', itemId);
}

export async function exportItem(itemId) {
    const itemData = await getData('rpgItems', itemId);
    if (itemData) {
        const dataToExport = { ...itemData };
        if (dataToExport.image) dataToExport.image = arrayBufferToBase64Util(dataToExport.image);
        const jsonString = JSON.stringify(dataToExport, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(dataToExport.name || 'item').replace(/\s+/g, '_')}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

export async function importItem(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const importedItem = JSON.parse(e.target.result);
                importedItem.id = Date.now().toString(); 
                if (importedItem.image) {
                    importedItem.image = base64ToArrayBufferUtil(importedItem.image);
                }
                importedItem.predominantColor = await calculateColorUtil(importedItem.image, importedItem.imageMimeType, { color30: 'rgba(217, 119, 6, 0.3)', color100: 'rgb(217, 119, 6)' });
                await saveData('rpgItems', importedItem);
                resolve(importedItem);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    populateItemAumentosSelect();
    setupItemRelationsModal();
    
    document.addEventListener('periciasUpdated', populateItemAumentosSelect);

    const roleSelect = document.getElementById('item-card-role');
    if (roleSelect) {
        roleSelect.addEventListener('change', async () => {
            const baseSelect = document.getElementById('item-base-card-select');
            await populateItemBaseCardSelect(baseSelect?.value || '', currentEditingItemId);
            updateItemRoleUi();
        });
    }

    RELATED_ITEM_ROLES.forEach(role => {
        document.getElementById(`item-create-${role}-card`)?.addEventListener('click', async () => {
            await startRelatedItemCreation(role);
        });
    });

    const sameImageCheckbox = document.getElementById('related-item-base-image-option');
    if (sameImageCheckbox) {
        sameImageCheckbox.addEventListener('change', (e) => {
            if (!pendingRelatedItemCreation) {
                e.currentTarget.checked = false;
                return;
            }
            pendingRelatedItemCreation.useBaseImage = e.currentTarget.checked;
            applyRelatedItemBaseImageOption();
        });
    }

    const addBtn = document.getElementById('add-item-aumento-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const select = document.getElementById('item-aumento-select');
            const valueInput = document.getElementById('item-aumento-value');
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

    updateItemInlineRelatedUi();
    updateRelatedItemCreationUi();
});

const itemImageUpload = document.getElementById('itemImageUpload');
if (itemImageUpload) {
    itemImageUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            if (pendingRelatedItemCreation) {
                pendingRelatedItemCreation.useBaseImage = false;
                const sameImageCheckbox = document.getElementById('related-item-base-image-option');
                if (sameImageCheckbox) sameImageCheckbox.checked = false;
                itemImageUpload.disabled = false;
            }
            itemImageFile = file;
            showImagePreview(document.getElementById('itemImagePreview'), URL.createObjectURL(file));
            RELATED_ITEM_ROLES.forEach(role => updateItemInlineImagePreview(role));
        }
    });
}

export function renderInventoryForForm(characterItems, strengthValue) {
    const strength = strengthValue || 0;
    const charItemsWithOriginalIndex = characterItems.map((item, index) => ({ ...item, originalIndex: index }));

    const slotAddingItems = charItemsWithOriginalIndex.filter(item => parseInt(item.charge) < 0);
    const zeroChargeItems = charItemsWithOriginalIndex.filter(item => parseInt(item.charge) == 0);
    const regularItems = charItemsWithOriginalIndex.filter(item => parseInt(item.charge) > 0);
    
    const extraSlots = slotAddingItems.reduce((acc, item) => acc + Math.abs(parseInt(item.charge)), 0);
    const totalSlots = (strength * 2) + 5 + extraSlots;
    const totalCharge = regularItems.reduce((acc, item) => acc + parseInt(item.charge), 0);
    
    document.getElementById('slots-info').textContent = `Força: ${strength} | Carga: ${totalCharge}/${totalSlots}`;

    const specialContainer = document.getElementById('special-equipment-container');
    const slotsContainer = document.getElementById('item-slots-container');
    const zeroChargeContainer = document.getElementById('zero-charge-items-container');
    
    specialContainer.innerHTML = '';
    slotsContainer.innerHTML = '';
    zeroChargeContainer.innerHTML = '';

    if (slotAddingItems.length > 0) {
        slotAddingItems.forEach(item => {
            const slot = document.createElement('div');
            slot.className = 'slot slot-occupied';
            slot.title = `Clique para remover "${item.name}"`;
            let imageURL = 'https://placehold.co/60x60/d2a679/422006?text=B';
            if (item.image) imageURL = URL.createObjectURL(bufferToBlobUtil(item.image, item.imageMimeType));
            slot.innerHTML = `<img src="${imageURL}" alt="${item.name}"><span class="slot-item-name">${item.name} (${item.charge})</span>`;
            slot.addEventListener('click', () => document.dispatchEvent(new CustomEvent('requestItemRemoval', { detail: { itemIndex: item.originalIndex } })));
            specialContainer.appendChild(slot);
        });
    } else {
        specialContainer.innerHTML = '<p class="col-span-full text-center text-xs text-gray-500">Nenhum equipamento especial.</p>';
    }

    if (zeroChargeItems.length > 0) {
        zeroChargeItems.forEach(item => {
            const slot = document.createElement('div');
            slot.className = 'slot slot-occupied';
            slot.title = `Clique para remover "${item.name}"`;
            let imageURL = 'https://placehold.co/60x60/9ca3af/1f2937?text=0';
            if (item.image) imageURL = URL.createObjectURL(bufferToBlobUtil(item.image, item.imageMimeType));
            slot.innerHTML = `<img src="${imageURL}" alt="${item.name}"><span class="slot-item-name">${item.name}</span>`;
            slot.addEventListener('click', () => document.dispatchEvent(new CustomEvent('requestItemRemoval', { detail: { itemIndex: item.originalIndex } })));
            zeroChargeContainer.appendChild(slot);
        });
    } else {
        zeroChargeContainer.innerHTML = '<p class="col-span-full text-center text-xs text-gray-500">Nenhum item de carga zero.</p>';
    }

    for (let i = 0; i < totalSlots; i++) {
        const slotEl = document.createElement('div');
        slotEl.className = 'slot slot-available';
        slotsContainer.appendChild(slotEl);
    }
    
    const totalBlockedSlots = regularItems.reduce((acc, item) => {
        const itemCharge = Math.max(1, parseInt(item.charge, 10) || 1);
        return acc + Math.max(0, itemCharge - 1);
    }, 0);
    const visibleItemSlots = Math.min(regularItems.length, totalSlots);
    const blockedSlotsToRender = Math.min(totalBlockedSlots, Math.max(0, totalSlots - visibleItemSlots));
    const itemAreaLimit = totalSlots - blockedSlotsToRender;

    let currentSlot = 0;
    regularItems.forEach(item => {
        if(currentSlot >= itemAreaLimit) return;

        const occupiedSlot = slotsContainer.children[currentSlot];
        if (occupiedSlot) {
            let imageURL = 'https://placehold.co/60x60/f59e0b/422006?text=I';
            if (item.image) imageURL = URL.createObjectURL(bufferToBlobUtil(item.image, item.imageMimeType));
            occupiedSlot.className = 'slot slot-occupied';
            occupiedSlot.innerHTML = `<img src="${imageURL}" alt="${item.name}"><span class="slot-item-name">${item.name} (${item.charge})</span>`;
            occupiedSlot.title = `Clique para remover "${item.name}"`;
            
            occupiedSlot.addEventListener('click', () => document.dispatchEvent(new CustomEvent('requestItemRemoval', { detail: { itemIndex: item.originalIndex } })));
            currentSlot += 1;
        }
    });

    for (let i = 0; i < blockedSlotsToRender; i++) {
        const blockedSlot = slotsContainer.children[totalSlots - 1 - i];
        if (blockedSlot) {
            blockedSlot.className = 'slot slot-blocked';
            blockedSlot.innerHTML = '';
            blockedSlot.title = 'Slot bloqueado por carga de item';
        }
    }
}
