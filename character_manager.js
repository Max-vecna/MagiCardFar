import { saveData, getData } from './local_db.js';
import { renderInventoryForForm } from './item_manager.js';
import { openSelectionModal as openItemSelectionModal } from './navigation_manager.js';
import { renderFullCharacterSheet } from './card-renderer.js';
import { renderFullSpellSheet } from './magic_renderer.js';
import { renderFullAttackSheet } from './attack_renderer.js';
import { readFileAsArrayBuffer, bufferToBlob, arrayBufferToBase64, base64ToArrayBuffer, showImagePreview, calculateColor, showCustomConfirm } from './ui_utils.js';

const PERICIAS_DATA = {
    "AGILIDADE": { "Acrobacia": "...", "Iniciativa": "...", "Montaria": "...", "Furtividade": "...", "Pontaria": "...", "Ladinagem": "...", "Reflexos": "..." },
    "CARISMA": { "Adestramento": "...", "Enganação": "...", "Intimidação": "...", "Persuasão": "..." },
    "INTELIGÊNCIA": { "Arcanismo": "...", "História": "...", "Investigação": "...", "Ofício": "...", "Religião": "...", "Tecnologia": "..." },
    "FORÇA": { "Atletismo": "...", "Luta": "..." },
    "SABEDORIA": { "Intuição": "...", "Percepção": "...", "Medicina": "...", "Natureza": "...", "Sobrevivência": "...", "Vontade": "..." },
    "VIGOR": { "Fortitude": "..." }
};

const CLASS_FORMULAS = {
    mago: { hpBase: 12, hpGain: 3, mpBase: 6, mpGain: 4, mpAttr: 'sabedoria' },
    bardo: { hpBase: 12, hpGain: 4, mpBase: 2, mpGain: 2, mpAttr: 'carisma' },
    paladino: { hpBase: 20, hpGain: 4, mpBase: 4, mpGain: 2, mpAttr: 'sabedoria' }
};

let currentEditingCardId = null;
let characterImageFile = null;
let backgroundImageFile = null;
let currentCharacterItems = [];
let currentCharacterFormType = 'character';
let pendingRelatedCharacterCreation = null;

function toInt(value) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
}

function calcMaxVidaMana({ classe, level, vigor, sabedoria, carisma }) {
    const cfg = CLASS_FORMULAS[classe];
    if (!cfg) return null;

    const L = Math.max(1, level ?? 1);
    const VIG = vigor ?? 0;

    const mpAttrValue = cfg.mpAttr === 'sabedoria' ? (sabedoria ?? 0) : (carisma ?? 0);

    const vidaMax = (cfg.hpBase + VIG) + (L - 1) * (cfg.hpGain + VIG);
    const manaMax = (cfg.mpBase + mpAttrValue) + (L - 1) * (cfg.mpGain + mpAttrValue);

    return { vidaMax: Math.max(0, vidaMax), manaMax: Math.max(0, manaMax) };
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function updateDerivedStatsInForm() {
    const classSelect = document.getElementById('cardClass');
    const levelInput = document.getElementById('cardLevel');
    const vigorInput = document.getElementById('vigor');
    const sabedoriaInput = document.getElementById('sabedoria');
    const carismaInput = document.getElementById('carisma');

    const vidaInput = document.getElementById('vida');
    const manaInput = document.getElementById('mana');
    const vidaAtualInput = document.getElementById('vidaAtual');
    const manaAtualInput = document.getElementById('manaAtual');

    if (!classSelect || !levelInput || !vigorInput || !sabedoriaInput || !carismaInput || !vidaInput || !manaInput) return;

    const classe = classSelect.value;
    const level = toInt(levelInput.value);
    const vigor = toInt(vigorInput.value);
    const sabedoria = toInt(sabedoriaInput.value);
    const carisma = toInt(carismaInput.value);

    if (!classe || level === null || vigor === null) return;

    const cfg = CLASS_FORMULAS[classe];
    if (!cfg) return;

    if (cfg.mpAttr === 'sabedoria' && sabedoria === null) return;
    if (cfg.mpAttr === 'carisma' && carisma === null) return;

    const result = calcMaxVidaMana({ classe, level, vigor, sabedoria, carisma });
    if (!result) return;

    vidaInput.value = result.vidaMax;
    manaInput.value = result.manaMax;

    if (vidaAtualInput) {
        const vNow = toInt(vidaAtualInput.value);
        if (vNow === null || vNow > result.vidaMax) vidaAtualInput.value = result.vidaMax;
    }
    if (manaAtualInput) {
        const mNow = toInt(manaAtualInput.value);
        if (mNow === null || mNow > result.manaMax) manaAtualInput.value = result.manaMax;
    }
}

function getSelectedIdsFromContainer(containerId) {
    return Array.from(document.querySelectorAll(`#${containerId} [data-id]`)).map(el => el.dataset.id);
}

function hasBaseCharacterImage(snapshot) {
    return Boolean(snapshot?.characterImageFile || snapshot?.characterImage);
}

function updateRelatedCreationUi() {
    const createRelatedBtn = document.getElementById('create-related-character-btn');
    const relatedPanel = document.getElementById('related-creation-panel');
    const baseNameEl = document.getElementById('related-base-card-name');
    const sameImageCheckbox = document.getElementById('related-base-image-option');
    const sameImageWrapper = document.getElementById('related-base-image-option-wrapper');
    const isEditingCharacter = Boolean(currentEditingCardId) && currentCharacterFormType !== 'creature' && !pendingRelatedCharacterCreation;

    if (createRelatedBtn) createRelatedBtn.classList.toggle('hidden', !isEditingCharacter);
    if (relatedPanel) relatedPanel.classList.toggle('hidden', !pendingRelatedCharacterCreation);

    if (!pendingRelatedCharacterCreation) {
        if (sameImageCheckbox) {
            sameImageCheckbox.checked = false;
            sameImageCheckbox.disabled = false;
        }
        if (sameImageWrapper) sameImageWrapper.classList.remove('hidden');
        return;
    }

    if (baseNameEl) baseNameEl.textContent = pendingRelatedCharacterCreation.baseTitle || 'card base';

    const canReuseImage = hasBaseCharacterImage(pendingRelatedCharacterCreation.baseSnapshot);
    if (sameImageCheckbox) {
        sameImageCheckbox.checked = canReuseImage && Boolean(pendingRelatedCharacterCreation.useBaseImage);
        sameImageCheckbox.disabled = !canReuseImage;
    }
    if (sameImageWrapper) sameImageWrapper.classList.toggle('hidden', !canReuseImage);
}

async function captureCharacterFormSnapshot() {
    const persistedData = currentEditingCardId ? await getData('rpgCards', currentEditingCardId) : null;

    return {
        currentEditingCardId,
        formType: currentCharacterFormType,
        title: document.getElementById('cardTitle')?.value || '',
        subTitle: document.getElementById('cardSubTitle')?.value || '',
        level: document.getElementById('cardLevel')?.value || '',
        dinheiro: document.getElementById('dinheiro')?.value || '',
        classe: document.getElementById('cardClass')?.value || '',
        vida: document.getElementById('vida')?.value || '',
        mana: document.getElementById('mana')?.value || '',
        vidaAtual: document.getElementById('vidaAtual')?.value || '',
        manaAtual: document.getElementById('manaAtual')?.value || '',
        armadura: document.getElementById('armadura')?.value || '',
        esquiva: document.getElementById('esquiva')?.value || '',
        bloqueio: document.getElementById('bloqueio')?.value || '',
        deslocamento: document.getElementById('deslocamento')?.value || '',
        agilidade: document.getElementById('agilidade')?.value || '',
        carisma: document.getElementById('carisma')?.value || '',
        forca: document.getElementById('forca')?.value || '',
        inteligencia: document.getElementById('inteligencia')?.value || '',
        sabedoria: document.getElementById('sabedoria')?.value || '',
        vigor: document.getElementById('vigor')?.value || '',
        acerto: document.getElementById('acerto')?.value || '',
        dano: document.getElementById('dano')?.value || '',
        critico: document.getElementById('critico')?.value || '',
        danoSemMana: document.getElementById('danoSemMana')?.value || '',
        historia: document.getElementById('historia')?.value || '',
        personalidade: document.getElementById('personalidade')?.value || '',
        motivacao: document.getElementById('motivacao')?.value || '',
        selectedPericias: getCurrentlySelectedPericias(),
        selectedMagicIds: getSelectedIdsFromContainer('selected-magics-container'),
        selectedSkillIds: getSelectedIdsFromContainer('selected-skills-container'),
        selectedAttackIds: getSelectedIdsFromContainer('selected-attacks-container'),
        selectedRelationshipIds: getSelectedIdsFromContainer('selected-relationships-container'),
        items: currentCharacterItems.slice(),
        characterImageFile,
        backgroundImageFile,
        characterImage: persistedData?.image || null,
        characterImageMimeType: persistedData?.imageMimeType || null,
        backgroundImage: persistedData?.backgroundImage || null,
        backgroundImageMimeType: persistedData?.backgroundMimeType || null
    };
}

async function restoreCharacterFormSnapshot(snapshot, options = {}) {
    if (!snapshot) return;
    const { asNew = false, titleOverride = '', submitOverride = '' } = options;

    resetCharacterFormState(true);
    currentCharacterFormType = snapshot.formType === 'creature' ? 'creature' : 'character';
    setCharacterFormType(currentCharacterFormType);
    currentEditingCardId = asNew ? null : (snapshot.currentEditingCardId || null);

    document.getElementById('cardTitle').value = snapshot.title || '';
    document.getElementById('cardSubTitle').value = snapshot.subTitle || '';
    document.getElementById('cardLevel').value = snapshot.level || '';
    document.getElementById('dinheiro').value = snapshot.dinheiro || '';
    document.getElementById('cardClass').value = snapshot.classe || '';

    document.getElementById('vida').value = snapshot.vida || '';
    document.getElementById('mana').value = snapshot.mana || '';
    document.getElementById('vidaAtual').value = snapshot.vidaAtual || '';
    document.getElementById('manaAtual').value = snapshot.manaAtual || '';
    document.getElementById('armadura').value = snapshot.armadura || '';
    document.getElementById('esquiva').value = snapshot.esquiva || '';
    document.getElementById('bloqueio').value = snapshot.bloqueio || '';
    document.getElementById('deslocamento').value = snapshot.deslocamento || '';
    document.getElementById('agilidade').value = snapshot.agilidade || '';
    document.getElementById('carisma').value = snapshot.carisma || '';
    document.getElementById('forca').value = snapshot.forca || '';
    document.getElementById('inteligencia').value = snapshot.inteligencia || '';
    document.getElementById('sabedoria').value = snapshot.sabedoria || '';
    document.getElementById('vigor').value = snapshot.vigor || '';
    document.getElementById('acerto').value = snapshot.acerto || '';
    document.getElementById('dano').value = snapshot.dano || '';
    document.getElementById('critico').value = snapshot.critico || '';
    document.getElementById('danoSemMana').value = snapshot.danoSemMana || '';

    document.getElementById('historia').value = snapshot.historia || '';
    document.getElementById('personalidade').value = snapshot.personalidade || '';
    document.getElementById('motivacao').value = snapshot.motivacao || '';

    populatePericiasCheckboxes(currentCharacterFormType === 'creature' ? [] : (snapshot.selectedPericias || []));

    for (const magicId of snapshot.selectedMagicIds || []) {
        const magicData = await getData('rpgEffects', magicId);
        if (magicData) createSelectedElement(magicData, magicData.type === 'habilidade' ? 'skill' : 'magic');
    }

    for (const skillId of snapshot.selectedSkillIds || []) {
        const skillData = await getData('rpgEffects', skillId);
        if (skillData) createSelectedElement(skillData, 'skill');
    }

    for (const attackId of snapshot.selectedAttackIds || []) {
        const attackData = await getData('rpgEffects', attackId);
        if (attackData) createSelectedElement(attackData, 'attack');
    }

    for (const relationshipId of snapshot.selectedRelationshipIds || []) {
        const relatedCharData = await getData('rpgCards', relationshipId);
        if (relatedCharData?.cardType === 'creature') createSelectedElement(relatedCharData, 'relationship');
    }

    currentCharacterItems = (snapshot.items || []).slice();
    document.getElementById('form-inventory-section').classList.toggle('hidden', currentCharacterFormType === 'creature');
    renderInventoryForForm(currentCharacterItems, parseInt(snapshot.forca, 10) || 0);

    characterImageFile = snapshot.characterImageFile || null;
    backgroundImageFile = snapshot.backgroundImageFile || null;

    if (characterImageFile) {
        showImagePreview(document.getElementById('characterImagePreview'), URL.createObjectURL(characterImageFile), true);
    } else if (snapshot.characterImage) {
        const imageBlob = bufferToBlob(snapshot.characterImage, snapshot.characterImageMimeType);
        showImagePreview(document.getElementById('characterImagePreview'), URL.createObjectURL(imageBlob), true);
    }

    if (backgroundImageFile) {
        showImagePreview(document.getElementById('backgroundImagePreview'), URL.createObjectURL(backgroundImageFile), false);
    } else if (snapshot.backgroundImage) {
        const backgroundBlob = bufferToBlob(snapshot.backgroundImage, snapshot.backgroundImageMimeType);
        showImagePreview(document.getElementById('backgroundImagePreview'), URL.createObjectURL(backgroundBlob), false);
    }

    if (titleOverride) {
        document.getElementById('form-title').textContent = titleOverride;
    } else if (currentEditingCardId) {
        document.getElementById('form-title').textContent = `${currentCharacterFormType === 'creature' ? 'Editando Criatura' : 'Editando'}: ${snapshot.title || ''}`;
    }
    if (submitOverride) {
        document.getElementById('submitButton').textContent = submitOverride;
    } else if (currentEditingCardId) {
        document.getElementById('submitButton').textContent = currentCharacterFormType === 'creature' ? 'Salvar Criatura' : 'Salvar Edicao';
    }

    updateRelatedCreationUi();
    updateDerivedStatsInForm();
}

async function restoreBaseCharacterDraft(additionalRelationshipId = null) {
    const snapshot = pendingRelatedCharacterCreation?.baseSnapshot;
    if (!snapshot) return false;

    if (additionalRelationshipId) {
        const relationshipIds = new Set(snapshot.selectedRelationshipIds || []);
        relationshipIds.add(additionalRelationshipId);
        snapshot.selectedRelationshipIds = Array.from(relationshipIds);
    }

    pendingRelatedCharacterCreation = null;
    await restoreCharacterFormSnapshot(snapshot);
    return true;
}

function getRelatedCreationBaseImage(snapshot) {
    if (!snapshot) return { image: null, mimeType: null, isFile: false };

    if (snapshot.characterImageFile) {
        return {
            image: snapshot.characterImageFile,
            mimeType: snapshot.characterImageFile.type || null,
            isFile: true
        };
    }

    return {
        image: snapshot.characterImage || null,
        mimeType: snapshot.characterImageMimeType || null,
        isFile: false
    };
}

function getRelatedCreationBaseBackground(snapshot) {
    if (!snapshot) return { image: null, mimeType: null, isFile: false };

    if (snapshot.backgroundImageFile) {
        return {
            image: snapshot.backgroundImageFile,
            mimeType: snapshot.backgroundImageFile.type || null,
            isFile: true
        };
    }

    return {
        image: snapshot.backgroundImage || null,
        mimeType: snapshot.backgroundImageMimeType || null,
        isFile: false
    };
}

export async function startRelatedCharacterCreation() {
    if (!currentEditingCardId || currentCharacterFormType === 'creature') return false;

    const snapshot = await captureCharacterFormSnapshot();
    pendingRelatedCharacterCreation = {
        baseCardId: snapshot.currentEditingCardId,
        baseTitle: snapshot.title || 'card base',
        baseSnapshot: snapshot,
        useBaseImage: true
    };

    await restoreCharacterFormSnapshot(snapshot, {
        asNew: true,
        titleOverride: `Nova criatura de: ${snapshot.title || 'card base'}`,
        submitOverride: 'Criar criatura'
    });
    setCharacterFormType('creature');
    document.getElementById('form-title').textContent = `Nova criatura de: ${snapshot.title || 'card base'}`;
    document.getElementById('submitButton').textContent = 'Criar criatura';
    return true;
}

export async function handleCharacterFormCloseRequest() {
    if (!pendingRelatedCharacterCreation) return false;
    await restoreBaseCharacterDraft();
    return true;
}

export function resetCharacterFormState(preserveRelatedCreation = false) {
    if (!preserveRelatedCreation) pendingRelatedCharacterCreation = null;
    currentEditingCardId = null;
    characterImageFile = null;
    backgroundImageFile = null;
    currentCharacterItems = [];
    currentCharacterFormType = 'character';

    const cardForm = document.getElementById('cardForm');
    if (cardForm) cardForm.reset();

    document.getElementById('selected-magics-container').innerHTML = '';
    document.getElementById('selected-skills-container').innerHTML = '';
    document.getElementById('selected-attacks-container').innerHTML = '';
    document.getElementById('selected-relationships-container').innerHTML = '';
    document.getElementById('form-inventory-section').classList.add('hidden');

    showImagePreview(document.getElementById('characterImagePreview'), null, true);
    showImagePreview(document.getElementById('backgroundImagePreview'), null, false);

    populatePericiasCheckboxes();
    renderInventoryForForm([], 0);

    updateRelatedCreationUi();
    updateDerivedStatsInForm();
}

export function setCharacterFormType(type = 'character') {
    currentCharacterFormType = type === 'creature' ? 'creature' : 'character';
    const isCreature = currentCharacterFormType === 'creature';

    ['character-lore-section', 'character-pericias-section', 'character-relations-section'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', isCreature);
    });

    const rollSection = document.getElementById('character-roll-section');
    if (rollSection) rollSection.classList.toggle('hidden', !isCreature);

    const inventorySection = document.getElementById('form-inventory-section');
    if (inventorySection) inventorySection.classList.toggle('hidden', isCreature);

    const titleEl = document.getElementById('form-title');
    const submitEl = document.getElementById('submitButton');
    if (!currentEditingCardId && titleEl) titleEl.textContent = isCreature ? 'Nova Criatura' : 'Novo Personagem';
    if (!currentEditingCardId && submitEl) submitEl.textContent = isCreature ? 'Criar Criatura' : 'Criar Cartão';
    updateRelatedCreationUi();
}

export function getCharacterItems() {
    return currentCharacterItems;
}

function getCustomPericias() {
    return JSON.parse(localStorage.getItem('customPericias')) || {};
}

function saveCustomPericia(attribute, periciaName, periciaDescription) {
    const customPericias = getCustomPericias();
    if (!customPericias[attribute]) customPericias[attribute] = {};
    customPericias[attribute][periciaName] = periciaDescription || `Descrição para ${periciaName}.`;
    localStorage.setItem('customPericias', JSON.stringify(customPericias));
}

function getMergedPericiasData() {
    const customPericias = getCustomPericias();
    const merged = JSON.parse(JSON.stringify(PERICIAS_DATA));
    for (const attr in customPericias) {
        if (!merged[attr]) merged[attr] = {};
        Object.assign(merged[attr], customPericias[attr]);
    }
    return merged;
}

export function getAumentosData() {
    const mergedPericias = getMergedPericiasData();
    const aumentosData = {
        "Status": ["Vida", "Mana", "Armadura", "Esquiva", "Bloqueio", "Deslocamento", "CD"],
        "Atributos": ["Agilidade", "Carisma", "Força", "Inteligência", "Sabedoria", "Vigor"],
        "Perícias": {}
    };

    for (const attr in mergedPericias) {
        const capitalizedAttr = attr.toUpperCase();
        if (!aumentosData.Perícias[capitalizedAttr]) aumentosData.Perícias[capitalizedAttr] = [];
        aumentosData.Perícias[capitalizedAttr].push(...Object.keys(mergedPericias[attr]));
    }
    return aumentosData;
}

export async function populateCharacterSelect(selectId, includeNoneOption = true, noneOptionText = 'Nenhum') {
    const selectElement = document.getElementById(selectId);
    if (!selectElement) return;

    selectElement.innerHTML = '';

    if (includeNoneOption) {
        const noneOption = document.createElement('option');
        noneOption.value = '';
        noneOption.textContent = noneOptionText;
        selectElement.appendChild(noneOption);
    }

    const characters = (await getData('rpgCards')).filter(char => char.cardType !== 'creature');
    if (characters) {
        characters.sort((a, b) => a.title.localeCompare(b.title)).forEach(char => {
            const option = document.createElement('option');
            option.value = char.id;
            option.textContent = char.title;
            selectElement.appendChild(option);
        });
    }
}

function updateRelationshipFanLayout() {
    const container = document.getElementById('selected-relationships-container');
    if (!container) return;

    const cards = Array.from(container.querySelectorAll('.character-form-mini-card.related-character-grid-item'));
    const centerIndex = (cards.length - 1) / 2;

    cards.forEach((card, index) => {
        const distanceFromCenter = index - centerIndex;
        const rotation = distanceFromCenter * 5.5;
        const offsetY = Math.abs(distanceFromCenter) * 8;
        const layer = Math.max(1, Math.round((cards.length - Math.abs(distanceFromCenter)) * 10));

        card.style.setProperty('--fan-rotate', `${rotation}deg`);
        card.style.setProperty('--fan-offset-y', `${offsetY}px`);
        card.style.setProperty('--fan-z', String(layer));
    });
}

async function createSelectedElement(data, type) {
    let containerId;
    let iconClass;
    let isImageRound = false;
    let gridItemClass = '';
    let miniSheetHtml = '';

    if (type === 'magic') {
        containerId = 'selected-magics-container';
        iconClass = 'fa-magic';
        isImageRound = true;
        gridItemClass = 'related-spell-grid-item';
        miniSheetHtml = await renderFullSpellSheet(data, false);
    } else if (type === 'skill') {
        containerId = 'selected-skills-container';
        iconClass = 'fa-fist-raised';
        isImageRound = true;
        gridItemClass = 'related-skill-grid-item';
        miniSheetHtml = await renderFullSpellSheet(data, false);
    } else if (type === 'attack') {
        containerId = 'selected-attacks-container';
        iconClass = 'fa-khanda';
        isImageRound = true;
        gridItemClass = 'related-attack-grid-item';
        miniSheetHtml = await renderFullAttackSheet(data, false);
    } else if (type === 'relationship') {
        containerId = 'selected-relationships-container';
        iconClass = 'fa-dragon';
        isImageRound = true;
        gridItemClass = 'related-character-grid-item';
    } else if (type === 'item') {
        containerId = 'selected-items-container';
        iconClass = 'fa-box';
    } else {
        return;
    }

    const container = document.getElementById(containerId);
    if (!container || container.querySelector(`[data-id="${data.id}"]`)) return;

    const itemElement = document.createElement('div');
    itemElement.dataset.id = data.id;

    if (type === 'relationship') {
        miniSheetHtml = await renderFullCharacterSheet(data, false, false, null, { staticHtmlOnly: true });
    }

    if (type === 'relationship' || type === 'magic' || type === 'skill' || type === 'attack') {
        const showMiniCardCaption = type === 'magic';
        const miniCardCaption = escapeHtml(data.name || data.title || 'Magia');
        itemElement.className = `character-form-mini-card ${gridItemClass}${showMiniCardCaption ? ' has-mini-card-caption' : ''}`;
        itemElement.innerHTML = `
            ${miniSheetHtml}
            ${showMiniCardCaption ? `<div class="character-form-mini-card__caption" title="${miniCardCaption}">${miniCardCaption}</div>` : ''}
            <button type="button" class="text-red-500 hover:text-red-400 remove-selection-btn text-xl leading-none" aria-label="Remover card relacionado">&times;</button>
        `;
        itemElement.querySelector('.remove-selection-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!await showCustomConfirm('Remover este card do personagem?')) return;
            itemElement.remove();
            if (type === 'relationship') updateRelationshipFanLayout();
        });
        container.appendChild(itemElement);
        if (type === 'relationship') updateRelationshipFanLayout();
        return;
    }

    itemElement.className = 'flex items-center justify-between bg-gray-800 p-2 rounded mt-1 mb-1';

    let iconHtml = '';
    if (data.image) {
        const imageUrl = URL.createObjectURL(bufferToBlob(data.image, data.imageMimeType));
        iconHtml = `<img src="${imageUrl}" class="w-6 h-6 ${isImageRound ? 'rounded-full' : 'rounded'} mr-2 object-cover" style="image-rendering: pixelated;">`;
    } else {
        iconHtml = `<i class="fas ${iconClass} w-6 text-center mr-2"></i>`;
    }

    const displayText = data.name || data.title;

    itemElement.innerHTML = `
        <div class="flex items-center">
            ${iconHtml}
            <span class="text-sm truncate max-w-[150px]">${displayText}</span>
        </div>
        <button type="button" class="text-red-500 hover:text-red-400 remove-selection-btn text-xl leading-none">&times;</button>
    `;

    itemElement.querySelector('.remove-selection-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!await showCustomConfirm('Remover este card do personagem?')) return;
        itemElement.remove();
    });
    container.appendChild(itemElement);
}

export function populatePericiasCheckboxes(selectedPericias = []) {
    const container = document.getElementById('pericias-checkboxes-container');
    if (!container) return;
    container.innerHTML = '';

    const ALL_PERICIAS = getMergedPericiasData();
    const periciaDescriptionDisplay = document.getElementById('pericia-description-display');
    const periciaDescriptionTitle = document.getElementById('periciaDescriptionTitle');
    const periciaDescriptionText = document.getElementById('periciaDescriptionText');

    for (const attribute in ALL_PERICIAS) {
        const details = document.createElement('details');
        details.className = 'bg-gray-700 rounded-lg p-2 transition-all duration-300';
        details.innerHTML = `
            <summary class="flex items-center justify-between cursor-pointer font-semibold text-indigo-200">
                <span>${attribute}</span>
                <svg class="w-4 h-4 transform transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
            </summary>
            <div class="mt-2 space-y-2 pl-4 border-l border-gray-600 pericias-list"></div>
        `;

        const periciasList = details.querySelector('.pericias-list');
        details.querySelector('summary').addEventListener('click', () => {
            setTimeout(() => {
                details.querySelector('svg').style.transform = details.open ? 'rotate(90deg)' : 'rotate(0deg)';
            }, 300);
        });

        for (const periciaName in ALL_PERICIAS[attribute]) {
            const periciaItem = document.createElement('div');
            periciaItem.className = 'flex items-center justify-between pericia-item rounded-md p-1';
            const periciaId = `pericia-${periciaName.replace(/\s+/g, '-')}`;

            const selectedPericia = selectedPericias.find(p => p.name === periciaName);
            const isChecked = selectedPericia ? 'checked' : '';
            const value = selectedPericia ? selectedPericia.value : '';

            periciaItem.innerHTML = `
                <div class="flex items-center">
                    <input type="checkbox" id="${periciaId}" name="pericia" value="${periciaName}" class="form-checkbox h-4 w-4 text-indigo-500 rounded border-gray-600 focus:ring-indigo-500" ${isChecked}>
                    <label for="${periciaId}" class="ml-2 text-sm text-gray-200 cursor-pointer">${periciaName}</label>
                </div>
                <input type="number" id="${periciaId}-value" placeholder="0" value="${value}" class="w-16 px-2 py-1 bg-gray-800 text-white text-sm rounded-md border border-gray-600 focus:border-indigo-500">
            `;
            periciasList.appendChild(periciaItem);

            periciaItem.querySelector('label').addEventListener('mouseenter', () => {
                periciaDescriptionTitle.textContent = periciaName;
                periciaDescriptionText.textContent = ALL_PERICIAS[attribute][periciaName];
                periciaDescriptionDisplay.classList.remove('hidden');
            });

            periciaItem.querySelector('label').addEventListener('mouseleave', () => {
                periciaDescriptionDisplay.classList.add('hidden');
            });
        }
        container.appendChild(details);
    }
}

export async function saveCharacterCard(cardForm) {
    const isCreature = currentCharacterFormType === 'creature';
    const relatedCreationContext = pendingRelatedCharacterCreation;
    const cardTitleInput = document.getElementById('cardTitle');
    const cardSubTitleInput = document.getElementById('cardSubTitle');
    const cardLevelInput = document.getElementById('cardLevel');
    const dinheiroInput = document.getElementById('dinheiro');
    const vidaInput = document.getElementById('vida');
    const manaInput = document.getElementById('mana');
    const vidaAtualInput = document.getElementById('vidaAtual');
    const manaAtualInput = document.getElementById('manaAtual');
    const armaduraInput = document.getElementById('armadura');
    const esquivaInput = document.getElementById('esquiva');
    const bloqueioInput = document.getElementById('bloqueio');
    const deslocamentoInput = document.getElementById('deslocamento');
    const agilidadeInput = document.getElementById('agilidade');
    const carismaInput = document.getElementById('carisma');
    const forcaInput = document.getElementById('forca');
    const inteligenciaInput = document.getElementById('inteligencia');
    const sabedoriaInput = document.getElementById('sabedoria');
    const vigorInput = document.getElementById('vigor');
    const historiaInput = document.getElementById('historia');
    const personalidadeInput = document.getElementById('personalidade');
    const motivacaoInput = document.getElementById('motivacao');
    const cardClassSelect = document.getElementById('cardClass');

    const acertoInput = document.getElementById('acerto');
    const danoInput = document.getElementById('dano');
    const acertoInputSemMana = document.getElementById('critico');
    const danoInputSemMana = document.getElementById('danoSemMana');

    updateDerivedStatsInForm();

    const selectedPericias = [];
    if (!isCreature) {
        document.querySelectorAll('#pericias-checkboxes-container input[type="checkbox"]:checked').forEach(cb => {
            const periciaName = cb.value;
            const periciaId = `pericia-${periciaName.replace(/\s+/g, '-')}`;
            const valueInput = document.getElementById(`${periciaId}-value`);
            selectedPericias.push({
                name: periciaName,
                value: parseInt(valueInput.value) || 0
            });
        });
    }

    const attributes = {
        vida: parseInt(vidaInput.value) || 0,
        mana: parseInt(manaInput.value) || 0,
        vidaAtual: parseInt(vidaAtualInput.value) || 0,
        manaAtual: parseInt(manaAtualInput.value) || 0,
        armadura: parseInt(armaduraInput.value) || 0,
        esquiva: parseInt(esquivaInput.value) || 0,
        bloqueio: parseInt(bloqueioInput.value) || 0,
        deslocamento: parseInt(deslocamentoInput.value) || 0,
        agilidade: parseInt(agilidadeInput.value) || 0,
        carisma: parseInt(carismaInput.value) || 0,
        forca: parseInt(forcaInput.value) || 0,
        inteligencia: parseInt(inteligenciaInput.value) || 0,
        sabedoria: parseInt(sabedoriaInput.value) || 0,
        vigor: parseInt(vigorInput.value) || 0,
        pericias: selectedPericias,
        acerto: isCreature ? acertoInput.value : '',
        dano: isCreature ? danoInput.value : '',
        critico: isCreature ? acertoInputSemMana.value : '',
        danoSemMana: isCreature ? danoInputSemMana.value : ''
    };

    const lore = {
        historia: isCreature ? '' : historiaInput.value,
        personalidade: isCreature ? '' : personalidadeInput.value,
        motivacao: isCreature ? '' : motivacaoInput.value,
    };

    let existingData = null;
    if (currentEditingCardId) {
        existingData = await getData('rpgCards', currentEditingCardId);
    }

    const baseImageSource = relatedCreationContext?.useBaseImage
        ? getRelatedCreationBaseImage(relatedCreationContext.baseSnapshot)
        : null;
    const imageBuffer = characterImageFile
        ? await readFileAsArrayBuffer(characterImageFile)
        : (baseImageSource?.isFile
            ? await readFileAsArrayBuffer(baseImageSource.image)
            : (baseImageSource?.image || (existingData ? existingData.image : null)));
    const imageMimeType = characterImageFile
        ? characterImageFile.type
        : (baseImageSource?.mimeType || (existingData ? existingData.imageMimeType : null));

    const baseBackgroundSource = relatedCreationContext?.baseSnapshot
        ? getRelatedCreationBaseBackground(relatedCreationContext.baseSnapshot)
        : null;
    const backgroundBuffer = backgroundImageFile
        ? await readFileAsArrayBuffer(backgroundImageFile)
        : (baseBackgroundSource?.isFile
            ? await readFileAsArrayBuffer(baseBackgroundSource.image)
            : (baseBackgroundSource?.image || (existingData ? existingData.backgroundImage : null)));
    const backgroundMimeType = backgroundImageFile
        ? backgroundImageFile.type
        : (baseBackgroundSource?.mimeType || (existingData ? existingData.backgroundMimeType : null));

    const itemIds = isCreature ? [] : currentCharacterItems.map(item => item.id);

    const magicIds = isCreature ? [] : [
        ...Array.from(document.querySelectorAll('#selected-magics-container [data-id]')),
        ...Array.from(document.querySelectorAll('#selected-skills-container [data-id]'))
    ].map(el => el.dataset.id);

    const attackIds = isCreature ? [] : Array.from(document.querySelectorAll('#selected-attacks-container [data-id]')).map(el => el.dataset.id);
    const relationshipIds = isCreature
        ? []
        : Array.from(new Set([
            ...Array.from(document.querySelectorAll('#selected-relationships-container [data-id]')).map(el => el.dataset.id),
            ...(relatedCreationContext?.baseCardId ? [relatedCreationContext.baseCardId] : [])
        ]));

    const classe = cardClassSelect ? cardClassSelect.value : '';

    let cardData;
    if (currentEditingCardId) {
        cardData = existingData;
        Object.assign(cardData, {
            title: cardTitleInput.value,
            subTitle: cardSubTitleInput.value,
            cardType: currentCharacterFormType,
            level: parseInt(cardLevelInput.value) || 1,
            dinheiro: parseInt(dinheiroInput.value) || 0,
            classe,
            attributes,
            lore,
            items: itemIds,
            spells: magicIds,
            attacks: attackIds,
            relationships: relationshipIds,
            image: imageBuffer,
            backgroundImage: backgroundBuffer,
            imageMimeType: imageMimeType,
            backgroundMimeType: backgroundMimeType,
        });
    } else {
        cardData = {
            id: Date.now().toString(),
            title: cardTitleInput.value,
            subTitle: cardSubTitleInput.value,
            cardType: currentCharacterFormType,
            level: parseInt(cardLevelInput.value) || 1,
            dinheiro: parseInt(dinheiroInput.value) || 0,
            classe,
            attributes,
            lore,
            items: itemIds,
            spells: magicIds,
            attacks: attackIds,
            relationships: relationshipIds,
            image: imageBuffer,
            backgroundImage: backgroundBuffer,
            imageMimeType: imageMimeType,
            backgroundMimeType: backgroundMimeType,
            inPlay: false
        };
    }

    cardData.predominantColor = await calculateColor(cardData.image, cardData.imageMimeType);

    await saveData('rpgCards', cardData);
    if (relatedCreationContext?.baseCardId) {
        const baseCardData = await getData('rpgCards', relatedCreationContext.baseCardId);
        if (baseCardData && baseCardData.cardType !== 'creature' && cardData.cardType === 'creature') {
            const baseRelationships = Array.isArray(baseCardData.relationships) ? baseCardData.relationships : [];
            if (!baseRelationships.includes(cardData.id)) {
                baseCardData.relationships = [...baseRelationships, cardData.id];
                await saveData('rpgCards', baseCardData);
            }
        }
    }
    document.dispatchEvent(new CustomEvent('dataChanged', { detail: { type: isCreature ? 'criaturas' : 'personagem' } }));

    if (relatedCreationContext) {
        await restoreBaseCharacterDraft(cardData.id);
        return { keepOpen: true, createdRelatedCardId: cardData.id };
    }

    resetCharacterFormState();
    return { keepOpen: false, createdRelatedCardId: null };
}

export async function editCard(cardId) {
    const cardData = await getData('rpgCards', cardId);
    if (!cardData) return;

    resetCharacterFormState();
    currentCharacterFormType = cardData.cardType === 'creature' ? 'creature' : 'character';
    setCharacterFormType(currentCharacterFormType);

    document.getElementById('form-title').textContent = `${currentCharacterFormType === 'creature' ? 'Editando Criatura' : 'Editando'}: ${cardData.title}`;
    document.getElementById('submitButton').textContent = currentCharacterFormType === 'creature' ? 'Salvar Criatura' : 'Salvar Edicao';
    currentEditingCardId = cardId;
    pendingRelatedCharacterCreation = null;

    document.getElementById('cardTitle').value = cardData.title;
    document.getElementById('cardSubTitle').value = cardData.subTitle;
    document.getElementById('cardLevel').value = cardData.level;
    document.getElementById('dinheiro').value = cardData.dinheiro || 0;

    const classSelect = document.getElementById('cardClass');
    if (classSelect) classSelect.value = cardData.classe || '';

    const attrs = cardData.attributes;
    document.getElementById('vida').value = attrs.vida;
    document.getElementById('mana').value = attrs.mana;
    document.getElementById('vidaAtual').value = attrs.vidaAtual;
    document.getElementById('manaAtual').value = attrs.manaAtual;
    document.getElementById('armadura').value = attrs.armadura;
    document.getElementById('esquiva').value = attrs.esquiva;
    document.getElementById('bloqueio').value = attrs.bloqueio;
    document.getElementById('deslocamento').value = attrs.deslocamento;
    document.getElementById('agilidade').value = attrs.agilidade;
    document.getElementById('carisma').value = attrs.carisma;
    document.getElementById('forca').value = attrs.forca;
    document.getElementById('inteligencia').value = attrs.inteligencia;
    document.getElementById('sabedoria').value = attrs.sabedoria;
    document.getElementById('vigor').value = attrs.vigor;

    document.getElementById('acerto').value = attrs.acerto || '';
    document.getElementById('dano').value = attrs.dano || '';
    document.getElementById('critico').value = attrs.critico || '';
    document.getElementById('danoSemMana').value = attrs.danoSemMana || '';

    document.getElementById('historia').value = cardData.lore?.historia || '';
    document.getElementById('personalidade').value = cardData.lore?.personalidade || '';
    document.getElementById('motivacao').value = cardData.lore?.motivacao || '';

    populatePericiasCheckboxes(currentCharacterFormType === 'creature' ? [] : attrs.pericias);

    if (currentCharacterFormType !== 'creature' && cardData.spells) {
        for (const magicId of cardData.spells) {
            const magicData = await getData('rpgEffects', magicId);
            if (magicData) {
                const renderType = magicData.type === 'habilidade' ? 'skill' : 'magic';
                createSelectedElement(magicData, renderType);
            }
        }
    }

    if (currentCharacterFormType !== 'creature' && cardData.attacks) {
        for (const attackId of cardData.attacks) {
            const attackData = await getData('rpgEffects', attackId);
            if (attackData) createSelectedElement(attackData, 'attack');
        }
    }

    if (currentCharacterFormType !== 'creature' && cardData.relationships) {
        for (const charId of cardData.relationships) {
            const relatedCharData = await getData('rpgCards', charId);
            if (relatedCharData?.cardType === 'creature') createSelectedElement(relatedCharData, 'relationship');
        }
    }

    if (cardData.image) {
        const imageBlob = bufferToBlob(cardData.image, cardData.imageMimeType);
        showImagePreview(document.getElementById('characterImagePreview'), URL.createObjectURL(imageBlob), true);
    }
    if (cardData.backgroundImage) {
        const backgroundBlob = bufferToBlob(cardData.backgroundImage, cardData.backgroundMimeType);
        showImagePreview(document.getElementById('backgroundImagePreview'), URL.createObjectURL(backgroundBlob), false);
    }

    const items = cardData.items ? (await Promise.all(cardData.items.map(id => getData('rpgItems', id)))).filter(Boolean) : [];
    currentCharacterItems = items;
    document.getElementById('form-inventory-section').classList.toggle('hidden', currentCharacterFormType === 'creature');
    renderInventoryForForm(currentCharacterItems, attrs.forca || 0);

    updateRelatedCreationUi();
    updateDerivedStatsInForm();
}

export async function exportCard(cardId) {
    const cardData = await getData('rpgCards', cardId);
    if (cardData) {
        const dataToExport = { ...cardData };
        if (dataToExport.image) dataToExport.image = arrayBufferToBase64(dataToExport.image);
        if (dataToExport.backgroundImage) dataToExport.backgroundImage = arrayBufferToBase64(dataToExport.backgroundImage);
        const jsonString = JSON.stringify(dataToExport, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(dataToExport.title || 'card').replace(/\s+/g, '_')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

export async function importCard(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const importedCard = JSON.parse(e.target.result);
                if (!importedCard || importedCard.id === undefined) throw new Error("Formato inválido.");

                importedCard.id = Date.now().toString();
                importedCard.inPlay = false;

                if (importedCard.image) importedCard.image = base64ToArrayBuffer(importedCard.image);
                if (importedCard.backgroundImage) importedCard.backgroundImage = base64ToArrayBuffer(importedCard.backgroundImage);

                importedCard.predominantColor = await calculateColor(importedCard.backgroundImage, importedCard.backgroundMimeType);

                await saveData('rpgCards', importedCard);
                resolve(importedCard);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = (e) => reject(e.target.error);
        reader.readAsText(file);
    });
}

export function getCurrentEditingCardId() {
    return currentEditingCardId;
}

function getCurrentlySelectedPericias() {
    const selectedPericias = [];
    document.querySelectorAll('#pericias-checkboxes-container input[type="checkbox"]:checked').forEach(cb => {
        const periciaName = cb.value;
        const periciaId = `pericia-${periciaName.replace(/\s+/g, '-')}`;
        const valueInput = document.getElementById(`${periciaId}-value`);
        selectedPericias.push({
            name: periciaName,
            value: parseInt(valueInput.value) || 0
        });
    });
    return selectedPericias;
}

document.addEventListener('DOMContentLoaded', () => {
    const characterImageUpload = document.getElementById('characterImageUpload');
    if (characterImageUpload) {
        characterImageUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                characterImageFile = file;
                showImagePreview(document.getElementById('characterImagePreview'), URL.createObjectURL(file), true);
            }
        });
    }

    const backgroundImageUpload = document.getElementById('backgroundImageUpload');
    if (backgroundImageUpload) {
        backgroundImageUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                backgroundImageFile = file;
                showImagePreview(document.getElementById('backgroundImagePreview'), URL.createObjectURL(file), false);
            }
        });
    }

    document.addEventListener('addItemToCharacter', (e) => {
        const { data, type } = e.detail;

        if (type === 'magic') {
            const finalType = data.type === 'habilidade' ? 'skill' : 'magic';
            createSelectedElement(data, finalType);
        } else if (type === 'item') {
            currentCharacterItems.push(data);
            renderInventoryForForm(currentCharacterItems, parseInt(document.getElementById('forca').value) || 0);
        } else if (type === 'attack') {
            createSelectedElement(data, 'attack');
        }
    });

    document.addEventListener('addRelationshipToCharacter', (e) => createSelectedElement(e.detail.data, 'relationship'));

    const createRelatedBtn = document.getElementById('create-related-character-btn');
    if (createRelatedBtn) {
        createRelatedBtn.addEventListener('click', async () => {
            await startRelatedCharacterCreation();
        });
    }

    const sameImageCheckbox = document.getElementById('related-base-image-option');
    if (sameImageCheckbox) {
        sameImageCheckbox.addEventListener('change', (e) => {
            if (!pendingRelatedCharacterCreation) {
                e.currentTarget.checked = false;
                return;
            }
            pendingRelatedCharacterCreation.useBaseImage = e.currentTarget.checked;
            const baseSnapshot = pendingRelatedCharacterCreation.baseSnapshot;
            const isBaseFile = characterImageFile && characterImageFile === baseSnapshot?.characterImageFile;

            if (!e.currentTarget.checked && isBaseFile) {
                characterImageFile = null;
                showImagePreview(document.getElementById('characterImagePreview'), null, true);
            } else if (!e.currentTarget.checked && !characterImageFile) {
                showImagePreview(document.getElementById('characterImagePreview'), null, true);
            } else if (e.currentTarget.checked && !characterImageFile) {
                if (baseSnapshot?.characterImageFile) {
                    characterImageFile = baseSnapshot.characterImageFile;
                    showImagePreview(document.getElementById('characterImagePreview'), URL.createObjectURL(baseSnapshot.characterImageFile), true);
                } else if (baseSnapshot?.characterImage) {
                    const imageBlob = bufferToBlob(baseSnapshot.characterImage, baseSnapshot.characterImageMimeType);
                    showImagePreview(document.getElementById('characterImagePreview'), URL.createObjectURL(imageBlob), true);
                }
            }
        });
    }

    document.addEventListener('requestItemRemoval', async (e) => {
        const { itemIndex } = e.detail;
        if (itemIndex > -1 && itemIndex < currentCharacterItems.length) {
            if (!await showCustomConfirm('Remover este item do inventario?')) return;
            currentCharacterItems.splice(itemIndex, 1);
            renderInventoryForForm(currentCharacterItems, parseInt(document.getElementById('forca').value) || 0);
        }
    });

    const forcaEl = document.getElementById('forca');
    if (forcaEl) {
        forcaEl.addEventListener('input', (e) => {
            renderInventoryForForm(currentCharacterItems, parseInt(e.target.value) || 0);
        });
    }

    const addItemBtn = document.getElementById('add-item-to-inventory-btn');
    if (addItemBtn) addItemBtn.addEventListener('click', () => openItemSelectionModal('item'));

    const addSkillBtn = document.getElementById('add-skill-to-char-btn');
    if (addSkillBtn) addSkillBtn.addEventListener('click', () => openItemSelectionModal('magic'));

    const showBtn = document.getElementById('show-add-pericia-form-btn');
    const addForm = document.getElementById('add-pericia-form');
    const addBtn = document.getElementById('add-new-pericia-btn');
    const cancelBtn = document.getElementById('cancel-add-pericia-btn');

    if (showBtn && addForm) showBtn.addEventListener('click', () => addForm.classList.toggle('hidden'));
    if (cancelBtn && addForm) cancelBtn.addEventListener('click', () => addForm.classList.add('hidden'));

    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const name = document.getElementById('new-pericia-name').value.trim();
            const attribute = document.getElementById('new-pericia-attribute').value;
            const description = document.getElementById('new-pericia-description').value.trim();

            if (name && attribute) {
                saveCustomPericia(attribute, name, description);
                populatePericiasCheckboxes(getCurrentlySelectedPericias());
                addForm.classList.add('hidden');
                document.getElementById('new-pericia-name').value = '';
                document.getElementById('new-pericia-description').value = '';
                document.dispatchEvent(new CustomEvent('periciasUpdated'));
            } else {
                alert('Por favor, preencha o nome da perícia e selecione um atributo.');
            }
        });
    }

    const watchIds = ['cardClass', 'cardLevel', 'vigor', 'sabedoria', 'carisma'];
    watchIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', updateDerivedStatsInForm);
        el.addEventListener('change', updateDerivedStatsInForm);
    });

    updateRelatedCreationUi();
    updateDerivedStatsInForm();
});
