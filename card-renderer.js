import { getData, saveData } from './local_db.js';
import { renderFullItemSheet } from './item_renderer.js';
import { renderFullSpellSheet } from './magic_renderer.js';
import { renderFullAttackSheet } from './attack_renderer.js';
import { bufferToBlob, showCustomAlert } from './ui_utils.js'; // Importando de ui_utils

const PERICIAS_DATA = {
     "AGILIDADE": [ "Acrobacia", "Iniciativa", "Montaria", "Furtividade", "Pontaria", "Ladinagem", "Reflexos"],
     "CARISMA": ["Adestramento", "Enganação", "Intimidação", "Persuasão"],
     "INTELIGÊNCIA": ["Arcanismo", "História", "Investigação", "Ofício", "Religião", "Tecnologia"],
     "FORÇA": ["Atletismo", "Luta"],
     "SABEDORIA": ["Intuição", "Percepção", "Natureza", "Vontade", "Medicina", "Sobrevivência"],
     "VIGOR": ["Fortitude"]
};

const periciaToAttributeMap = {};
for (const attribute in PERICIAS_DATA) {
    PERICIAS_DATA[attribute].forEach(periciaName => {
        periciaToAttributeMap[periciaName] = attribute;
    });
}

const ATTRIBUTE_KEY_TO_GROUP = {
    agilidade: 'AGILIDADE',
    carisma: 'CARISMA',
    forca: 'FORÃ‡A',
    inteligencia: 'INTELIGÃŠNCIA',
    sabedoria: 'SABEDORIA',
    vigor: 'VIGOR'
};

const ATTRIBUTE_KEY_TO_SHORT = {
    agilidade: 'AGI',
    carisma: 'CAR',
    forca: 'FOR',
    inteligencia: 'INT',
    sabedoria: 'SAB',
    vigor: 'VIG'
};

function normalizeKey(name) {
    return (name || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Converte valores como "4+1" em número (5) e sinaliza que havia bônus.
// Se não for um formato simples, retorna null.
function parseAdditiveString(value) {
    if (value === null || value === undefined) return { total: null, hasBonus: false };
    const s = String(value).replace(/\s+/g, '');
    const m = s.match(/^(-?\d+)(?:\+(-?\d+))$/);
    if (!m) return { total: null, hasBonus: false };
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return { total: null, hasBonus: false };
    return { total: a + b, hasBonus: b !== 0 };
}

// Formata um número total e aplica cor quando houve bônus.
function formatTotal(total, hasBonus, suffix = '') {
    if (total === null || total === undefined) return '-';
    const txt = `${total}${suffix}`;
    return hasBonus ? `<span class="text-yellow-400 font-bold">${txt}</span>` : txt;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getCollectionBaseCards(cards) {
    const enhanceIds = new Set();
    const trueIds = new Set();

    cards.forEach(card => {
        if (card?.enhanceCardId) enhanceIds.add(card.enhanceCardId);
        if (card?.trueCardId) trueIds.add(card.trueCardId);
    });

    const existingIds = new Set(cards.map(card => card?.id).filter(Boolean));

    return cards.filter(card => {
        if (!card?.id) return false;
        if (enhanceIds.has(card.id) || trueIds.has(card.id)) return false;
        if ((card.cardVariant === 'enhance' || card.cardVariant === 'true') && card.baseCardId && existingIds.has(card.baseCardId)) {
            return false;
        }
        return true;
    });
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function interpolateColor(start, end, ratio) {
    return {
        r: start.r + ((end.r - start.r) * ratio),
        g: start.g + ((end.g - start.g) * ratio),
        b: start.b + ((end.b - start.b) * ratio)
    };
}

function rgbToCss(color) {
    return `rgb(${Math.round(color.r)} ${Math.round(color.g)} ${Math.round(color.b)})`;
}

function getSafeStatRatio(currentValue, maxValue) {
    const safeMax = Math.max(parseInt(maxValue, 10) || 0, 1);
    const safeCurrent = clamp(parseInt(currentValue, 10) || 0, 0, safeMax);
    return safeCurrent / safeMax;
}

function getHeartVisualVariables(currentValue, maxValue) {
    const ratio = getSafeStatRatio(currentValue, maxValue);
    const fillColor = rgbToCss(interpolateColor(
        { r: 92, g: 11, b: 11 },
        { r: 231, g: 46, b: 46 },
        Math.pow(ratio, 0.9)
    ));
    const glowColor = rgbToCss(interpolateColor(
        { r: 110, g: 20, b: 20 },
        { r: 255, g: 112, b: 112 },
        ratio
    ));

    return {
        '--heart-fill': fillColor,
        '--heart-glow-color': glowColor,
        '--heart-beat-duration': `${(1.85 - (ratio * 0.9)).toFixed(2)}s`,
        '--heart-scale-strong': (1.06 + (ratio * 0.12)).toFixed(3),
        '--heart-scale-soft': (1.03 + (ratio * 0.07)).toFixed(3),
        '--heart-brightness-idle': (0.48 + (ratio * 0.44)).toFixed(2),
        '--heart-brightness-peak': (0.72 + (ratio * 0.68)).toFixed(2),
        '--heart-glow-size-idle': `${(2 + (ratio * 7)).toFixed(1)}px`,
        '--heart-glow-size-peak': `${(8 + (ratio * 20)).toFixed(1)}px`
    };
}

function getManaVisualVariables(currentValue, maxValue) {
    const ratio = getSafeStatRatio(currentValue, maxValue);
    const fillColor = rgbToCss(interpolateColor(
        { r: 18, g: 39, b: 82 },
        { r: 46, g: 110, b: 231 },
        ratio
    ));
    const sparkColor = rgbToCss(interpolateColor(
        { r: 123, g: 152, b: 207 },
        { r: 226, g: 244, b: 255 },
        ratio
    ));

    return {
        '--mana-fill': fillColor,
        '--mana-spark': sparkColor,
        '--mana-glow-size': `${(3 + (ratio * 15)).toFixed(1)}px`,
        '--mana-brightness-low': (0.55 + (ratio * 0.45)).toFixed(2),
        '--mana-brightness-high': (0.72 + (ratio * 0.75)).toFixed(2),
        '--mana-opacity-low': (0.38 + (ratio * 0.32)).toFixed(2),
        '--mana-opacity-high': (0.56 + (ratio * 0.44)).toFixed(2),
        '--mana-spark-opacity': (0.18 + (ratio * 0.82)).toFixed(2),
        '--mana-spark-travel': `${(12 + (ratio * 16)).toFixed(1)}px`
    };
}

function serializeCssVariables(variables) {
    return Object.entries(variables)
        .map(([name, value]) => `${name}: ${value}`)
        .join('; ');
}

function applyStatIconVisualState(sheetContainer, statType, currentValue, maxValue) {
    const variables = statType === 'vida'
        ? getHeartVisualVariables(currentValue, maxValue)
        : getManaVisualVariables(currentValue, maxValue);

    const targets = sheetContainer?.querySelectorAll(`[data-stat-icon="${statType}"], [data-stat-sparks="${statType}"]`);
    if (!targets?.length) return;

    targets.forEach(target => {
        Object.entries(variables).forEach(([name, value]) => {
            target.style.setProperty(name, value);
        });
    });
}

function getCollectionItemLabel(item) {
    return item?.title || item?.name || 'Sem nome';
}

function getBonusSourceTypeLabel(source, sourceKind) {
    if (sourceKind === 'item') return 'Item';
    if (source?.type === 'habilidade') return 'Habilidade';
    if (source?.type === 'ataque') return 'Ataque';
    return 'Magia';
}

function calculateBonuses(characterData, inventoryItems, magicItems) {
    const totalFixedBonuses = {
        vida: 0, mana: 0, armadura: 0, esquiva: 0, bloqueio: 0, deslocamento: 0,
        cd: 0,
        agilidade: 0, carisma: 0, forca: 0, inteligencia: 0, sabedoria: 0, vigor: 0,
        pericias: {}
    };
    const bonusSources = {
        vida: [], mana: [], armadura: [], esquiva: [], bloqueio: [], deslocamento: [],
        cd: [],
        agilidade: [], carisma: [], forca: [], inteligencia: [], sabedoria: [], vigor: [],
        pericias: {}
    };

    const applySourceBonuses = (source, sourceKind) => {
        if (!source) return;
        if (Array.isArray(source.aumentos)) {
            source.aumentos.forEach(aumento => {
                if (aumento.tipo === 'fixo') {
                    const statName = normalizeKey(aumento.nome);
                    const sourceEntry = {
                        sourceId: source.id,
                        sourceName: getCollectionItemLabel(source),
                        sourceType: getBonusSourceTypeLabel(source, sourceKind),
                        bonusName: aumento.nome,
                        amount: aumento.valor || 0
                    };

                    if (totalFixedBonuses.hasOwnProperty(statName)) {
                        totalFixedBonuses[statName] += (aumento.valor || 0);
                        bonusSources[statName].push(sourceEntry);
                    } else {
                        totalFixedBonuses.pericias[aumento.nome] = (totalFixedBonuses.pericias[aumento.nome] || 0) + (aumento.valor || 0);
                        if (!bonusSources.pericias[aumento.nome]) bonusSources.pericias[aumento.nome] = [];
                        bonusSources.pericias[aumento.nome].push(sourceEntry);
                    }
                }
            });
        }
    };

    inventoryItems.filter(Boolean).forEach(source => applySourceBonuses(source, 'item'));
    magicItems.filter(Boolean).forEach(source => applySourceBonuses(source, 'effect'));

    return { totalFixedBonuses, bonusSources };
}

export async function updateStatDisplay(sheetContainer, characterData) {
    if (!sheetContainer || !characterData) return;

    const inventoryItems = characterData.items ? (await Promise.all(characterData.items.map(id => getData('rpgItems', id)))).filter(Boolean) : [];
    const magicItems = characterData.spells ? (await Promise.all(characterData.spells.map(id => getData('rpgEffects', id)))).filter(Boolean) : [];
    const { totalFixedBonuses, bonusSources } = calculateBonuses(characterData, inventoryItems, magicItems);

    const { vidaBase, manaBase } = calculateClassStats(characterData);

    const permanentMaxVida = vidaBase + (totalFixedBonuses.vida || 0);
    const permanentMaxMana = manaBase + (totalFixedBonuses.mana || 0);
    const keepResourcesVisible = sheetContainer.dataset.inPlay === 'true' || sheetContainer.classList.contains('in-play-animation');
    const hasVida = keepResourcesVisible || (characterData.attributes?.vidaAtual || 0) > 0;
    const hasMana = keepResourcesVisible || (characterData.attributes?.manaAtual || 0) > 0;
    const hasMoney = keepResourcesVisible || (characterData.dinheiro || 0) > 0;

    const updateResourceVisibility = (statType, isVisible) => {
        const statContainer = sheetContainer.querySelector(`[data-stat-type="${statType}"]`);
        if (statContainer) statContainer.style.display = isVisible ? '' : 'none';
    };

    const vidaEl = sheetContainer.querySelector('[data-stat-current="vida"]');
    if (vidaEl) vidaEl.textContent = characterData.attributes.vidaAtual || 0;
    
    const vidaMaxContainer = sheetContainer.querySelector('[data-stat-type="vida"]');
    if (vidaMaxContainer) {
        vidaMaxContainer.dataset.statMax = permanentMaxVida;
        const vidaMaxEl = vidaMaxContainer.querySelector('[data-stat-max-display="vida"]');
        if (vidaMaxEl) vidaMaxEl.textContent = permanentMaxVida;
    }
    updateResourceVisibility('vida', hasVida);
    applyStatIconVisualState(sheetContainer, 'vida', characterData.attributes.vidaAtual, permanentMaxVida);

    const manaEl = sheetContainer.querySelector('[data-stat-current="mana"]');
    if (manaEl) manaEl.textContent = characterData.attributes.manaAtual || 0;

    const manaMaxContainer = sheetContainer.querySelector('[data-stat-type="mana"]');
    if (manaMaxContainer) {
        manaMaxContainer.dataset.statMax = permanentMaxMana;
        const manaMaxEl = manaMaxContainer.querySelector('[data-stat-max-display="mana"]');
        if (manaMaxEl) manaMaxEl.textContent = permanentMaxMana;
    }
    updateResourceVisibility('mana', hasMana);
    applyStatIconVisualState(sheetContainer, 'mana', characterData.attributes.manaAtual, permanentMaxMana);

    const dinheiroEl = sheetContainer.querySelector('[data-stat-current="dinheiro"]');
    if (dinheiroEl) dinheiroEl.textContent = characterData.dinheiro || 0;
    updateResourceVisibility('dinheiro', hasMoney);
    
    // --- ATUALIZADO: Separação de Stats ---
    // Definição das duas listas de stats para busca
    const attackStats = { acerto: 'ATK', dano: 'DMG', critico: 'ATK s/Mana', danoSemMana: 'DMG s/Mana' };
    const defenseStats = { armadura: 'CA', esquiva: 'ES', bloqueio: 'BL', deslocamento: 'DL' };
    
    // Busca elementos em AMBOS os containers (novo div-attack-stats e div-combat-stats existente)
    const statElements = sheetContainer.querySelectorAll('.div-combat-stats .text-center, .div-attack-stats .text-center');

    if (statElements.length > 0) {
        // Combina as listas para iterar e atualizar tudo de uma vez
        const allStats = { ...attackStats, ...defenseStats };

        Object.entries(allStats).forEach(([stat, label]) => {
            const el = Array.from(statElements).find(e => e.textContent.includes(label));
            if (el) {
                let baseValue = characterData.attributes[stat] || 0;
                
                let content = baseValue;
                let fixedBonusHtml = '';

                // Bonus fixos apenas para stats numéricos de defesa/movimento
                if (['armadura', 'esquiva', 'bloqueio', 'deslocamento'].includes(stat)) {
                    const numVal = parseInt(baseValue) || 0;
                    const fixedBonus = totalFixedBonuses[stat] || 0;
                    const suffix = stat === 'deslocamento' ? 'm' : '';
                    const total = numVal + fixedBonus;
                    content = formatTotal(total, fixedBonus !== 0, suffix);
                } else {
                    // Para Acerto e Dano (strings), se vier no formato "4+1" somamos e destacamos.
                    const { total, hasBonus } = parseAdditiveString(baseValue);
                    content = (total !== null) ? formatTotal(total, hasBonus) : (baseValue || '-');
                }

                // Preserva a cor específica para ATK e DMG
                const colorStyle = stat === 'acerto' ? 'color: #facc15;' : (stat === 'dano' ? 'color: #f87171;' : '');

                // Se houver estilo de cor, aplicamos no span do label, senão herda
                const labelHtml = colorStyle ? `<span style="${colorStyle}">${label}</span>` : label;

                el.innerHTML = `${labelHtml}<br>${content}${fixedBonusHtml}`;
            }
        });
        
        // Atualiza CD (Classe de Dificuldade)
        const sabTotal = (parseInt(characterData.attributes.sabedoria) || 0) + (totalFixedBonuses.sabedoria || 0);
        const cdFixed = (totalFixedBonuses.cd || 0);
        const cdValue = 10 + (parseInt(characterData.level) || 0) + sabTotal + cdFixed;
        const cdBonusHtml = cdFixed !== 0 ? ` <span class="text-green-400 font-semibold">${cdFixed > 0 ? '+' : ''}${cdFixed}</span>` : '';
        const cdEl = Array.from(statElements).find(e => e.textContent.includes('CD'));
        if(cdEl) cdEl.innerHTML = `CD<br>${formatTotal(cdValue, cdFixed !== 0)}`;
    }

    const mainAttributes = ['agilidade', 'carisma', 'forca', 'inteligencia', 'sabedoria', 'vigor'];
    const attributeContainers = sheetContainer.querySelectorAll('.mt-2.flex.items-center.space-x-2.text-xs');
    
    const currentAttributeValues = mainAttributes.map(attr => (parseInt(characterData.attributes[attr]) || 0) + (totalFixedBonuses[attr] || 0));
    const maxAttributeValue = Math.max(...currentAttributeValues, 1);

    attributeContainers.forEach(attrContainer => {
        const attrLabelElement = attrContainer.querySelector('span.font-bold.w-8');
        if (!attrLabelElement) return;

        const key = attrLabelElement.getAttribute('title');
        if (!mainAttributes.includes(key)) return;

        const baseValue = parseInt(characterData.attributes[key]) || 0;
        const fixedBonus = totalFixedBonuses[key] || 0;
        const fixedBonusHtml = fixedBonus !== 0 ? ` <span class="text-green-400 font-semibold">${fixedBonus > 0 ? '+ ' : ''}${fixedBonus}</span>` : '';
        const totalValue = baseValue + fixedBonus;
        const percentage = maxAttributeValue > 0 ? (totalValue * 100) / maxAttributeValue : 0;
        
        const barEl = attrContainer.querySelector('.stat-fill');
        if (barEl) barEl.style.width = `${percentage}%`;
        
        const valueEl = attrContainer.querySelector('.text-xs.font-bold.ml-auto');
        if(valueEl) valueEl.innerHTML = formatTotal(totalValue, fixedBonus !== 0);
    });
}

// Substitua a função setupStatEditor inteira por esta:
// Substitua a função setupStatEditor inteira por esta versão robusta:

function setupStatEditor(characterData, container) {
    const sheetContainer = container || document.querySelector('#nested-sheet-container.visible') || document.querySelector('#character-sheet-container.visible');
    const modal = document.getElementById('stat-editor-modal');
    if (!sheetContainer || !modal) return;

    // Elementos do DOM do Modal Global
    const modalContent = modal.querySelector('#stat-editor-content');
    const titleTextEl = modal.querySelector('#stat-editor-title-text');
    const iconEl = modal.querySelector('#stat-editor-icon');
    const inputEl = modal.querySelector('#stat-editor-value');
    
    // Variáveis de estado locais para esta instância da ficha
    let currentStat = null;
    let statMax = Infinity;

    const STAT_CONFIG = {
        vida: { title: 'Vida', icon: 'fa-heart', color: 'text-red-400', border: 'border-red-500' },
        mana: { title: 'Mana', icon: 'fa-fire', color: 'text-blue-400', border: 'border-blue-500' },
        dinheiro: { title: 'Dinheiro', icon: 'fa-coins', color: 'text-amber-400', border: 'border-amber-500' }
    };

    const closeModal = () => {
        modal.classList.remove('visible');
        setTimeout(() => modal.classList.add('hidden'), 300);
    };

    // Função que configura os botões do modal para ESTE personagem especificamente
    // Ela é chamada toda vez que abrimos o modal, para garantir que o modal "pertença" a esta ficha
    const configureModalButtons = () => {
        const addBtn = modal.querySelector('#stat-editor-add-btn');
        const subtractBtn = modal.querySelector('#stat-editor-subtract-btn');
        const closeBtn = modal.querySelector('#stat-editor-close-btn');

        // Clona para remover listeners antigos (de outros personagens ou instancias anteriores)
        const newAddBtn = addBtn.cloneNode(true);
        const newSubtractBtn = subtractBtn.cloneNode(true);
        const newCloseBtn = closeBtn.cloneNode(true);

        addBtn.parentNode.replaceChild(newAddBtn, addBtn);
        subtractBtn.parentNode.replaceChild(newSubtractBtn, subtractBtn);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

        // Lógica de Atualização (Closure capturando o characterData correto)
        const updateStat = (amount) => {
            if (!currentStat || isNaN(amount) || amount === 0) {
                if (amount === 0) closeModal();
                return;
            }

            if (currentStat === 'vida' || currentStat === 'mana') {
                let statCurrent = currentStat === 'vida' ? 'vidaAtual' : 'manaAtual';
                let currentValue = characterData.attributes[statCurrent];

                if (amount < 0) {
                    let remainingDamage = Math.abs(amount);
                    currentValue = Math.max(0, currentValue - remainingDamage);
                    characterData.attributes[statCurrent] = currentValue;
                } else {
                    let newValue = Math.min(statMax, currentValue + amount);
                    characterData.attributes[statCurrent] = newValue;
                }

            } else if (currentStat === 'dinheiro') {
                let currentValue = characterData.dinheiro || 0;
                characterData.dinheiro = Math.max(0, currentValue + amount);
            }

            saveData('rpgCards', characterData).then(async () => {
                await updateStatDisplay(sheetContainer, characterData);
                closeModal();
            }).catch(err => {
                console.error("Failed to save character data:", err);
                closeModal();
            });
        };

        // Adiciona os eventos nos botões recém-limpos
        newAddBtn.addEventListener('click', () => updateStat(Math.abs(parseInt(inputEl.value, 10) || 0)));
        newSubtractBtn.addEventListener('click', () => updateStat(-Math.abs(parseInt(inputEl.value, 10) || 0)));
        newCloseBtn.addEventListener('click', closeModal);
    };

    const openModal = async (type, max) => {
        currentStat = type;
        statMax = max;
        
        // Garante dados frescos
        const freshCharacterData = await getData('rpgCards', characterData.id);
        if (freshCharacterData) Object.assign(characterData, freshCharacterData);

        const config = STAT_CONFIG[type] || { title: type, icon: 'fa-edit', color: 'text-gray-400', border: 'border-gray-500' };

        Object.values(STAT_CONFIG).forEach(c => {
            modalContent.classList.remove(c.border);
            titleTextEl.parentElement.classList.remove(c.color);
        });

        modalContent.classList.add(config.border);
        titleTextEl.parentElement.classList.add(config.color);
        iconEl.className = `fas ${config.icon}`;
        titleTextEl.textContent = `Editar ${config.title}`;
        inputEl.value = '';
        inputEl.focus();

        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.add('visible'), 10);
    };

    // Configuração dos gatilhos na ficha (Ícones de Vida/Mana/Dinheiro)
    sheetContainer.querySelectorAll('[data-action="edit-stat"]').forEach(el => {
        // Limpa listeners antigos do ícone
        const newEl = el.cloneNode(true);
        el.parentNode.replaceChild(newEl, el);
        
        newEl.addEventListener('click', async (e) => {
            e.stopPropagation();
            const type = newEl.dataset.statType;
            const max = newEl.dataset.statMax ? parseInt(newEl.dataset.statMax, 10) : Infinity;
            
            // --- PASSO CRÍTICO: Reconfigura os botões do modal AGORA ---
            // Isso garante que os botões "Add/Subtract" obedeçam a ESTA ficha, 
            // não importa quantos minicards foram abertos antes.
            configureModalButtons(); 
            // -----------------------------------------------------------

            await openModal(type, max);
        });
    });

    // Listeners globais do modal (Fundo e ESC)
    // Apenas definimos o onclick direto para evitar acúmulo de listeners globais
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };
    modal.onkeydown = (e) => {
        if (e.key === 'Escape') closeModal();
    };
}

// Renderiza o inventário na ficha
async function populateInventory(container, characterData, uniqueId) {
    const scrollArea = container.querySelector(`#inventory-magic-scroll-area-${uniqueId}`);
    if (!scrollArea) return;

    scrollArea.innerHTML = '<div class="p-4 text-center"><i class="fas fa-spinner fa-spin text-gray-400"></i></div>';

    let inventoryHtml = `<div><h4 class="font-bold text-amber-300 border-b border-amber-300/30 pb-1 mb-2 px-2">Inventário</h4>`;
    if (characterData.items && characterData.items.length > 0) {
        const itemPromises = characterData.items.map(id => getData('rpgItems', id));
        const items = getCollectionBaseCards((await Promise.all(itemPromises)).filter(Boolean));
        if (items.length > 0) {
            inventoryHtml += '<div class="grid grid-cols-2 gap-x-4 gap-y-1 px-2">';
            items.forEach(item => {
                let iconHtml = '';
                if (item.image) {
                    const imageUrl = URL.createObjectURL(bufferToBlob(item.image, item.imageMimeType));
                    iconHtml = `<img src="${imageUrl}" class="w-5 h-5 rounded-full object-cover flex-shrink-0" style="image-rendering: pixelated;">`;
                } else {
                    iconHtml = `<i class="fas fa-box w-5 text-center text-gray-400"></i>`;
                }
                inventoryHtml += `
                    <div class="text-xs p-1 rounded hover:bg-white/10 cursor-pointer flex items-center gap-2 truncate" data-id="${item.id}" data-type="item" title="${item.name}">
                        ${iconHtml}
                        <span class="truncate">${item.name}</span>
                    </div>`;
            });
            inventoryHtml += '</div>';
        } else {
             inventoryHtml += '<p class="text-xs text-gray-400 italic px-2">Vazio</p>';
        }
    } else {
        inventoryHtml += '<p class="text-xs text-gray-400 italic px-2">Vazio</p>';
    }
    inventoryHtml += '</div>';

    let magicsHtml = '';
    let skillsHtml = '';

    if (characterData.spells && characterData.spells.length > 0) {
        const magicPromises = characterData.spells.map(id => getData('rpgEffects', id));
        const magicsAndSkills = getCollectionBaseCards((await Promise.all(magicPromises)).filter(Boolean));

        const spells = magicsAndSkills.filter(ms => ms.type === 'magia' || !ms.type);
        const skills = magicsAndSkills.filter(ms => ms.type === 'habilidade');

        magicsHtml = `<div><h4 class="font-bold text-teal-300 border-b border-teal-300/30 pb-1 mb-2 px-2">Magias</h4>`;
        if (spells.length > 0) {
            magicsHtml += '<div class="grid grid-cols-2 gap-x-4 gap-y-1 px-2">';
            spells.forEach(magic => {
                let iconHtml = '';
                if (magic.image) {
                    const imageUrl = URL.createObjectURL(bufferToBlob(magic.image, magic.imageMimeType));
                    iconHtml = `<img src="${imageUrl}" class="w-5 h-5 rounded-full object-cover flex-shrink-0" style="image-rendering: pixelated;">`;
                } else {
                    iconHtml = `<i class="fas fa-magic w-5 text-center text-gray-400"></i>`;
                }
                magicsHtml += `
                    <div class="text-xs p-1 rounded hover:bg-white/10 cursor-pointer flex items-center gap-2 truncate" data-id="${magic.id}" data-type="spell" title="${magic.name}">
                        ${iconHtml}
                        <span class="truncate">${magic.name}</span>
                    </div>`;
            });
            magicsHtml += '</div>';
        } else {
            magicsHtml += '<p class="text-xs text-gray-400 italic px-2">Nenhuma</p>';
        }
        magicsHtml += '</div>';

        skillsHtml = `<div><h4 class="font-bold text-cyan-300 border-b border-cyan-300/30 pb-1 mb-2 px-2">Habilidades</h4>`;
        if (skills.length > 0) {
            skillsHtml += '<div class="grid grid-cols-2 gap-x-4 gap-y-1 px-2">';
            skills.forEach(skill => {
                let iconHtml = '';
                if (skill.image) {
                    const imageUrl = URL.createObjectURL(bufferToBlob(skill.image, skill.imageMimeType));
                    iconHtml = `<img src="${imageUrl}" class="w-5 h-5 rounded-full object-cover flex-shrink-0" style="image-rendering: pixelated;">`;
                } else {
                    iconHtml = `<i class="fas fa-fist-raised w-5 text-center text-gray-400"></i>`;
                }
                skillsHtml += `
                    <div class="text-xs p-1 rounded hover:bg-white/10 cursor-pointer flex items-center gap-2 truncate" data-id="${skill.id}" data-type="spell" title="${skill.name}">
                        ${iconHtml}
                        <span class="truncate">${skill.name}</span>
                    </div>`;
            });
            skillsHtml += '</div>';
        } else {
            skillsHtml += '<p class="text-xs text-gray-400 italic px-2">Nenhuma</p>';
        }
        skillsHtml += '</div>';

    } else {
        magicsHtml = `<div><h4 class="font-bold text-teal-300 border-b border-teal-300/30 pb-1 mb-2 px-2">Magias</h4><p class="text-xs text-gray-400 italic px-2">Nenhuma</p></div>`;
        skillsHtml = `<div><h4 class="font-bold text-cyan-300 border-b border-cyan-300/30 pb-1 mb-2 px-2">Habilidades</h4><p class="text-xs text-gray-400 italic px-2">Nenhuma</p></div>`;
    }

    let attacksHtml = '';
    if (characterData.attacks && characterData.attacks.length > 0) {
        const attackPromises = characterData.attacks.map(id => getData('rpgEffects', id));
        const attacks = getCollectionBaseCards((await Promise.all(attackPromises)).filter(Boolean));

        attacksHtml = `<div><h4 class="font-bold text-red-400 border-b border-red-400/30 pb-1 mb-2 px-2">Ataques</h4>`;
        if (attacks.length > 0) {
            attacksHtml += '<div class="grid grid-cols-2 gap-x-4 gap-y-1 px-2">';
            attacks.forEach(attack => {
                let iconHtml = '';
                if (attack.image) {
                    const imageUrl = URL.createObjectURL(bufferToBlob(attack.image, attack.imageMimeType));
                    iconHtml = `<img src="${imageUrl}" class="w-5 h-5 rounded-full object-cover flex-shrink-0" style="image-rendering: pixelated;">`;
                } else {
                    iconHtml = `<i class="fas fa-khanda w-5 text-center text-gray-400"></i>`;
                }
                attacksHtml += `
                    <div class="text-xs p-1 rounded hover:bg-white/10 cursor-pointer flex items-center gap-2 truncate" data-id="${attack.id}" data-type="attack" title="${attack.name}">
                        ${iconHtml}
                        <span class="truncate">${attack.name}</span>
                    </div>`;
            });
            attacksHtml += '</div>';
        } else {
            attacksHtml += '<p class="text-xs text-gray-400 italic px-2">Nenhum</p>';
        }
        attacksHtml += '</div>';
    } else {
         attacksHtml = `<div><h4 class="font-bold text-red-400 border-b border-red-400/30 pb-1 mb-2 px-2">Ataques</h4><p class="text-xs text-gray-400 italic px-2">Nenhum</p></div>`;
    }

    scrollArea.innerHTML =  magicsHtml + skillsHtml + attacksHtml + inventoryHtml;

    scrollArea.addEventListener('click', async (e) => {
        const target = e.target.closest('[data-id][data-type]');
        if (!target) return;

        const { id, type } = target.dataset;
        if (type === 'item') {
            const itemData = await getData('rpgItems', id);
            if (itemData) await renderFullItemSheet(itemData, true);
        } else if (type === 'spell') {
            const spellData = await getData('rpgEffects', id);
            if (spellData) await renderFullSpellSheet(spellData, true);
        } else if (type === 'attack') {
            const attackData = await getData('rpgEffects', id);
            if (attackData) await renderFullSpellSheet(attackData, true);
        }
    });
}


export async function renderFullCharacterSheet(characterData, isModal, isInPlay, targetContainer, renderOptions = {}) {
    const { staticHtmlOnly = false, previewFull = false } = renderOptions;
    const isCreature = characterData.cardType === 'creature';
    const sheetContainer = staticHtmlOnly ? targetContainer : (targetContainer || document.getElementById('character-sheet-container'));
    if (!sheetContainer && !staticHtmlOnly && (isModal || isInPlay)) return '';

    if (isModal) {
        const index = document.getElementsByClassName('visible').length;
        sheetContainer.style.zIndex = 1000 + index;
        sheetContainer.classList.remove('hidden');
    }

    const inventoryItems = !isCreature && characterData.items ? (await Promise.all(characterData.items.map(id => getData('rpgItems', id)))).filter(Boolean) : [];
    const magicItems = !isCreature && characterData.spells ? (await Promise.all(characterData.spells.map(id => getData('rpgEffects', id)))).filter(Boolean) : [];
    const attackItems = !isCreature && characterData.attacks ? (await Promise.all(characterData.attacks.map(id => getData('rpgEffects', id)))).filter(Boolean) : [];
    const collectionInventoryItems = getCollectionBaseCards(inventoryItems);
    const collectionMagicItems = getCollectionBaseCards(magicItems);
    const collectionAttackItems = getCollectionBaseCards(attackItems);
    
    const { totalFixedBonuses, bonusSources } = calculateBonuses(characterData, inventoryItems, magicItems);

    let aspectRatio =  9 / 16;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    let finalWidth, finalHeight;

    if ((windowWidth / aspectRatio) > windowHeight) {
        finalHeight = windowHeight * 0.9;
        finalWidth = finalHeight * aspectRatio;
    } else {
        finalWidth = windowWidth * 0.9;
        finalHeight = finalWidth / aspectRatio;
    }

    const imageUrl = characterData.image ? URL.createObjectURL(bufferToBlob(characterData.image, characterData.imageMimeType)) : `https://placehold.co/800x600/4a5568/a0aec0?text=${isCreature ? 'Criatura' : 'Personagem'}`;
    const imageBack = characterData.backgroundImage ? URL.createObjectURL(bufferToBlob(characterData.backgroundImage, characterData.backgroundMimeType)) : imageUrl;

    const uniqueId = `char-${characterData.id}-${Date.now()}`;
    const predominantColor = characterData.predominantColor || { color100: '#4a5568' };

    const mainAttributes = ['agilidade', 'carisma', 'forca', 'inteligencia', 'sabedoria', 'vigor'];
    characterData.attributes = characterData.attributes || {};

    const currentAttributeValues = mainAttributes.map(attr => (parseInt(characterData.attributes[attr]) || 0) + (totalFixedBonuses[attr] || 0));
    const maxAttributeValue = Math.max(...currentAttributeValues, 1);

    const sabTotal = (parseInt(characterData.attributes.sabedoria) || 0) + (totalFixedBonuses.sabedoria || 0);
    const cdFixed = (totalFixedBonuses.cd || 0);
    const cdValue = 10 + (parseInt(characterData.level) || 0) + sabTotal + cdFixed;
    const palette = { borderColor: predominantColor.colorLight };
    const collectionAccentColor = predominantColor.colorLight || predominantColor.color100 || '#cbd5e1';

    const origin = isModal || isInPlay ? "" : "transform-origin: top left";
    const transformProp = (isModal || isInPlay) ? 'transform: scale(0.9);' : '';

    let periciasHtml = '<p class="text-xs text-gray-400 italic px-2">Nenhuma perícia selecionada.</p>';
    const allPericias = {};
    if (characterData.attributes.pericias) {
        characterData.attributes.pericias.forEach(p => {
            allPericias[p.name] = { base: p.value, bonus: 0 };
        });
    }

    for (const pName in totalFixedBonuses.pericias) {
        if (!allPericias[pName]) allPericias[pName] = { base: 0, bonus: 0 };
        allPericias[pName].bonus += totalFixedBonuses.pericias[pName];
    }

    const periciasForGrouping = Object.entries(allPericias).map(([name, values]) => ({ name, ...values }));
    let groupedPericias = {};

    if (periciasForGrouping.length > 0) {
        groupedPericias = periciasForGrouping.reduce((acc, pericia) => {
            const attribute = periciaToAttributeMap[pericia.name] || 'OUTRAS';
            if (!acc[attribute]) acc[attribute] = [];
            acc[attribute].push(pericia);
            return acc;
        }, {});

        const sortedAttributes = Object.keys(groupedPericias).sort();
        periciasHtml = sortedAttributes.map(attribute => {
            const periciasList = groupedPericias[attribute].sort((a,b) => a.name.localeCompare(b.name)).map(p => {
                const total = (parseInt(p.base) || 0) + (parseInt(p.bonus) || 0);
                const valHtml = formatTotal(total, (parseInt(p.bonus) || 0) !== 0);
                return `<span class="text-xs text-gray-300">${p.name} ${valHtml};</span>`;
            }).join(' ');
            return `<div class="text-left mt-1"><p class="text-xs font-bold text-gray-200 uppercase" style="font-size: 11px;">${attribute}</p><div class="flex flex-wrap gap-x-2 gap-y-1 mb-1">${periciasList}</div></div>`;
        }).join('');
    }

    const renderBonusSourceList = (sources = []) => {
        if (!sources.length) {
            return `<p class="text-sm text-gray-400 italic">Nenhum aumento fixo ativo neste campo.</p>`;
        }

        return sources.map(source => `
            <div class="bonus-source-card">
                <div class="bonus-source-card__top">
                    <h4>${escapeHtml(source.sourceName || 'Sem nome')}</h4>
                    <span>${source.amount > 0 ? '+' : ''}${source.amount}</span>
                </div>
                <p class="bonus-source-card__meta">${escapeHtml(source.sourceType || 'Card')} · ${escapeHtml(source.bonusName || 'Aumento fixo')}</p>
            </div>
        `).join('');
    };

    // --- SEPARAÇÃO DOS STATS EM DOIS GRUPOS ---
    const attackStats = { acerto: 'ATK', critico: 'ATK s/Mana', dano: 'DMG', danoSemMana: 'DMG s/Mana'};
    const defenseStats = { armadura: 'CA', esquiva: 'ES', bloqueio: 'BL', deslocamento: 'DL' };

    const hasAcerto = characterData.attributes.acerto && String(characterData.attributes.acerto).trim() !== '';
    const hasDano = characterData.attributes.dano && String(characterData.attributes.dano).trim() !== '';
    const showAttackStats = hasAcerto || hasDano;
    const hasAcertoSem = characterData.attributes.critico && String(characterData.attributes.critico).trim() !== '';
    const hasDanoSem = characterData.attributes.danoSemMana && String(characterData.attributes.danoSemMana).trim() !== '';
    const showAttackStatsSem = hasAcertoSem || hasDanoSem;
   

    // Gera HTML para Acerto e Dano (Novo Card)
    const attackStatsHtml = isCreature ? Object.entries(attackStats).map(([stat, label]) => 
    {
        const baseValue = characterData.attributes[stat] || 0;
        const content = baseValue || '-';
        const colorStyle =  predominantColor.colorLight ; //dano em criatura sem mana


        const icon = stat === 'acerto' ? 'fa-dice-d20' :
                     stat === 'dano' ? 'fa-fire' :
                     stat === 'critico' ? 'fa-crosshairs' :
                     stat === 'danoSemMana' ? 'fa-skull' : "";

        const parsed = parseAdditiveString(baseValue);
        const showValue = (parsed.total !== null)
            ? formatTotal(parsed.total, parsed.hasBonus)
            : (content || '-');

        return `
            <div style="position: relative; transform: scale(.8); display: ${content === "-" ? 'none' : 'block'}" class="mt-4 flex flex-col items-center">
                <i class="fas ${icon} text-5xl" style="background: ${colorStyle}; -webkit-background-clip: text; -webkit-text-fill-color: transparent; filter: drop-shadow(2px 4px 6px black);"></i>
                <div class="absolute inset-0 flex flex-col items-center justify-center text-white text-xs pointer-events-none" style="margin: auto;">
                    <div class="text-center text-sm font-bold">
                        ${showValue}
                    </div>
                </div>
            </div> `;
    }).join('') : '';


    // Gera HTML para Defesa (Card Existente)
    const defenseStatsHtml = Object.entries(defenseStats).map(([stat, label]) => {
        const baseValue = characterData.attributes[stat] || 0;

        if (['armadura', 'esquiva', 'bloqueio', 'deslocamento'].includes(stat)) {
            const numVal = parseInt(baseValue) || 0;
            const fixedBonus = totalFixedBonuses[stat] || 0;
            const suffix = stat === 'deslocamento' ? 'm' : '';
            const total = numVal + fixedBonus;
            const content = formatTotal(total, fixedBonus !== 0, suffix);
            const isClickable = fixedBonus !== 0;
            const contentHtml = `<span>${label}</span><br>${content}`;
            if (isClickable) {
                return `<button type="button" class="text-center stat-bonus-trigger" data-action="open-bonus-sources" data-bonus-key="${stat}" data-bonus-label="${label}">${contentHtml}</button>`;
            }
            return `<div class="text-center">${contentHtml}</div>`;
        }

        // Fallback (não esperado aqui)
        const { total, hasBonus } = parseAdditiveString(baseValue);
        const content = (total !== null) ? formatTotal(total, hasBonus) : (baseValue || '-');
        return `<div class="text-center"><span>${label}</span><br>${content}</div>`;
    }).join('');

     // Separate spells and skills
    const spellsOnly = collectionMagicItems.filter(item => item.type === 'magia' || !item.type);
    const skillsOnly = collectionMagicItems.filter(item => item.type === 'habilidade');
    const relatedCharsData = !isCreature && characterData.relationships
        ? (await Promise.all(characterData.relationships.map(id => getData('rpgCards', id)))).filter(card => card?.cardType === 'creature')
        : [];

    const collectionConfigs = [
        {
            key: 'relationships',
            label: 'Criaturas',
            icon: 'fa-dragon',
            type: 'character',
            items: relatedCharsData
        },
        {
            key: 'spells',
            label: 'Magias',
            icon: 'fa-magic',
            type: 'spell',
            items: spellsOnly
        },
        {
            key: 'skills',
            label: 'Habilidades',
            icon: 'fa-fist-raised',
            type: 'skill',
            items: skillsOnly
        },
        {
            key: 'attacks',
            label: 'Ataques',
            icon: 'fa-khanda',
            type: 'attack',
            items: collectionAttackItems
        },
        {
            key: 'items',
            label: 'Itens',
            icon: 'fa-box',
            type: 'item',
            items: collectionInventoryItems
        }
    ].filter(config => config.items.length > 0);

    const shouldRenderCollectionControls = !isCreature && (isModal || isInPlay || previewFull) && collectionConfigs.length > 0;

    const collectionButtonsHtml = shouldRenderCollectionControls
        ? `
            <div class="character-collection-grid">
                ${collectionConfigs.map(config => {
                    const buttonLabel = `${config.label} (${config.items.length})`;

                    return `
                        <button
                            type="button"
                            class="character-collection-trigger"
                            data-collection-tone="${config.key}"
                            data-collection-key="${config.key}"
                            style="--collection-accent: ${escapeHtml(collectionAccentColor)};"
                            title="${escapeHtml(buttonLabel)}"
                            aria-label="${escapeHtml(buttonLabel)}">
                            <span class="character-collection-trigger__glyph" aria-hidden="true">
                                <i class="fas ${config.icon}  text-2xl"></i>
                            </span>
                            <span class="character-collection-trigger__value" aria-hidden="true">${config.items.length}</span>
                        </button>
                    `;
                }).join('')}
            </div>
        `
        : '';

    const collectionModalHtml = shouldRenderCollectionControls
        ? `
            <div id="character-collection-modal-${uniqueId}" class="character-collection-modal hidden" aria-hidden="true">
                <div class="character-collection-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="character-collection-title-${uniqueId}">
                    <div class="character-collection-modal__header">
                        <div>
                            <p id="character-collection-count-${uniqueId}" class="character-collection-modal__eyebrow"></p>
                            <h4 id="character-collection-title-${uniqueId}" class="character-collection-modal__title">Colecoes</h4>
                            <p class="character-collection-modal__subtitle">Escolha um card para abrir a ficha completa.</p>
                        </div>
                        <button type="button" id="character-collection-close-${uniqueId}" class="character-collection-modal__close" aria-label="Fechar colecoes">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                    <div class="character-collection-tabs">
                        ${collectionConfigs.map(config => `
                            <button
                                type="button"
                                class="character-collection-tab"
                                data-collection-tone="${config.key}"
                                data-collection-key="${config.key}">
                                <i class="fas ${config.icon}"></i>
                                <span>${config.label}</span>
                            </button>
                        `).join('')}
                    </div>
                    <div class="character-collection-modal__body">
                        ${collectionConfigs.map(config => `
                            <div class="character-collection-panel hidden" data-collection-panel="${config.key}" data-rendered="false">
                                <div class="character-collection-panel__status" data-collection-status="${config.key}">
                                    Carregando mini cards...
                                </div>
                                <div class="character-collection-modal-grid hidden" data-collection-grid="${config.key}"></div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `
        : '';

    const permanentMaxVida = (characterData.attributes.vida || 0) + (totalFixedBonuses.vida || 0);
    const permanentMaxMana = (characterData.attributes.mana || 0) + (totalFixedBonuses.mana || 0);
    const heartIconStyle = serializeCssVariables(getHeartVisualVariables(characterData.attributes.vidaAtual, permanentMaxVida));
    const manaIconStyle = serializeCssVariables(getManaVisualVariables(characterData.attributes.manaAtual, permanentMaxMana));

    const hasLore = !isCreature && characterData.lore && (characterData.lore.historia || characterData.lore.personalidade || characterData.lore.motivacao);
    
    const loreHistoriaHtml = characterData.lore?.historia ? `<h4>História</h4><p class="mb-4">${characterData.lore.historia}</p>` : '';
    const lorePersonalidadeHtml = characterData.lore?.personalidade ? `<h4>Personalidade</h4><p class="mb-4">${characterData.lore.personalidade}</p>` : '';
    const loreMotivacaoHtml = characterData.lore?.motivacao ? `<h4>Motivação</h4><p>${characterData.lore.motivacao}</p>` : '';

    const loreModalHtml = hasLore
        ? `
            <div id="lore-modal-${uniqueId}" class="hidden absolute inset-0 z-[140] bg-black/80 backdrop-blur-sm p-4" tabindex="-1">
                <div class="w-full h-full flex items-center justify-center">
                    <div class="w-full max-w-lg max-h-[85%] overflow-hidden rounded-3xl border border-white/10 bg-slate-950/95 text-white shadow-2xl">
                        <div class="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
                            <div>
                                <p class="text-[11px] uppercase tracking-[0.18em] text-gray-400">Lore</p>
                                <h3 class="text-xl font-bold text-white">${escapeHtml(characterData.title || 'Personagem')}</h3>
                            </div>
                            <button type="button" id="close-lore-modal-btn-${uniqueId}" class="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white" aria-label="Fechar lore">
                                <i class="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                        <div class="max-h-[65vh] overflow-y-auto px-5 py-4 text-sm leading-relaxed text-gray-200 space-y-4">
                            ${loreHistoriaHtml}
                            ${lorePersonalidadeHtml}
                            ${loreMotivacaoHtml}
                            <br>
                        </div>
                    </div>
                </div>
            </div>
        `
        : '';

    const periciaModalHtml = `
        <div id="pericia-modal-${uniqueId}" class="hidden absolute inset-0 z-[141] bg-black/80 backdrop-blur-sm p-4" tabindex="-1">
            <div class="w-full h-full flex items-center justify-center">
                <div class="w-full max-w-md max-h-[85%] overflow-hidden rounded-3xl border border-white/10 bg-slate-950/95 text-white shadow-2xl">
                    <div class="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
                        <div>
                            <p class="text-[11px] uppercase tracking-[0.18em] text-gray-400">Pericias</p>
                            <h3 id="pericia-modal-title-${uniqueId}" class="text-xl font-bold text-white">AGI</h3>
                        </div>
                        <button type="button" id="close-pericia-modal-btn-${uniqueId}" class="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white" aria-label="Fechar pericias">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                    <div id="pericia-modal-body-${uniqueId}" class="max-h-[65vh] overflow-y-auto px-5 py-4 text-sm leading-relaxed text-gray-200 space-y-3"></div>
                </div>
            </div>
        </div>
    `;

    const bonusSourceModalHtml = `
        <div id="bonus-source-modal-${uniqueId}" class="hidden absolute inset-0 z-[142] bg-black/80 backdrop-blur-sm p-4" tabindex="-1">
            <div class="w-full h-full flex items-center justify-center">
                <div class="w-full max-w-md max-h-[85%] overflow-hidden rounded-3xl border border-white/10 bg-slate-950/95 text-white shadow-2xl">
                    <div class="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
                        <div>
                            <p class="text-[11px] uppercase tracking-[0.18em] text-gray-400">Origem do bonus</p>
                            <h3 id="bonus-source-modal-title-${uniqueId}" class="text-xl font-bold text-white">Campo</h3>
                        </div>
                        <button type="button" id="close-bonus-source-modal-btn-${uniqueId}" class="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white" aria-label="Fechar bonus">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                    <div id="bonus-source-modal-body-${uniqueId}" class="max-h-[65vh] overflow-y-auto px-5 py-4 text-sm leading-relaxed text-gray-200 space-y-3"></div>
                </div>
            </div>
        </div>
    `;

    const hasVida = isInPlay || (characterData.attributes?.vidaAtual || 0) > 0;
    const hasMana = isInPlay || (characterData.attributes?.manaAtual || 0) > 0;
    const hasMoney = isInPlay || (characterData.dinheiro || 0) > 0;
    const creatureDataDockHtml = isCreature && attackStatsHtml
        ? `
            <div class="character-collection-dock creature-data-dock rounded-3xl" style="--collection-dock-accent: ${palette.borderColor};">
                <div class="character-collection-grid creature-data-grid">
                    ${attackStatsHtml}
                </div>
            </div>
        `
        : '';
    const finalRelationshipsBar = collectionButtonsHtml || creatureDataDockHtml;
    const hasCollectionDock = Boolean(finalRelationshipsBar);

    const sheetHtml = `
        <div class="absolute top-6 right-6 z-20 flex flex-col gap-2">            
            <button id="close-sheet-btn-${uniqueId}" class="bg-red-600 hover:text-white thumb-btn" style="display: ${isModal ? 'flex' : 'none'}"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div id="character-sheet-${uniqueId}" class="w-full h-full rounded-lg shadow-2xl overflow-hidden relative text-white" style="${origin}; background-image: url('${imageUrl}'); background-size: cover; background-position: center; box-shadow: 0 0 20px ${predominantColor.colorLight}; width: ${finalWidth}px; height: ${finalHeight}px; ${transformProp} margin: 0 auto;">
            <div class="w-full h-full" style="background: linear-gradient(to bottom, #000000a4, transparent, transparent, #0000008f, #0000008f, #000000a4); box-shadow: inset 0px 0px 5px black;">
                <div class="rounded-lg absolute inset-0" style="width: 94%; height: 96%; border: 3px solid ${predominantColor.colorLight}; margin: auto; box-shadow: inset 0px 0px 5px black, 0px 0px 5px black;">
                    <div class="h-full w-12 left-2 top-2 pb-4 absolute top-0 bottom-0 flex flex-col items-center justify-content" style="justify-content: space-between;">
                        <div class="div-combat-stats grid grid-row-6 gap-y-2 text-xs w-12" style="border-radius: 28px 5px 28px 5px; background: ${predominantColor.colorLight}; padding: 15px 10px; justify-content: space-evenly; box-shadow: 0 0 10px black;">
                            <div class="text-center font-bold" style="color: rgb(0 247 85);">LV<br>${characterData.level || 0}</div>
                                ${defenseStatsHtml}
                                ${cdFixed !== 0
                                    ? `<button type="button" class="text-center stat-bonus-trigger" data-action="open-bonus-sources" data-bonus-key="cd" data-bonus-label="CD">CD<br>${formatTotal(cdValue, true)}</button>`
                                    : `<div class="text-center">CD<br>${formatTotal(cdValue, false)}</div>`}                           
                            </div>
                            ${finalRelationshipsBar}              
                        </div>

                    <div class="h-full w-12 right-2 top-2 pb-4 absolute top-0 bottom-0 flex flex-col items-center justify-content" style="justify-content: space-between;">
                        <div class="mt-2 flex flex-col items-center">
                            <div style="position: relative; display: ${hasVida ? 'block' : 'none'};" data-action="edit-stat" data-stat-type="vida" data-stat-max="${permanentMaxVida}">
                                <i class="fa-solid fa-heart text-5xl status-resource-icon status-heart-icon" data-stat-icon="vida" style="${heartIconStyle}"></i>
                                <div class="absolute inset-0 flex flex-col items-center justify-center font-bold text-white text-xs pointer-events-none" style="margin: auto; z-index: 2;">
                                    <span data-stat-current="vida">
                                        ${characterData.attributes.vidaAtual || 0}
                                    </span>
                                    <hr style="width: 15px;">
                                    <span data-stat-max-display="vida" style="bottom: 12px;">
                                        ${permanentMaxVida}
                                    </span>
                                </div>
                            </div>
                            
                            <div style="position: relative; display: ${hasMana ? 'flex' : 'none'};" data-action="edit-stat" data-stat-type="mana" data-stat-max="${permanentMaxMana}" class="mt-4 flex flex-col items-center">
                                 <div class="absolute inset-0 flex flex-col items-center justify-center font-bold text-white text-xs pointer-events-none pt-2" style="margin: auto; z-index: 2;">
                                    <span data-stat-current="mana">
                                        ${characterData.attributes.manaAtual || 0}
                                    </span>
                                    <hr style="width: 15px;">
                                    <span data-stat-max-display="mana" style="bottom: 12px;">
                                        ${permanentMaxMana}
                                    </span>
                                </div><span class="status-fire-sparks" data-stat-sparks="mana" style="${manaIconStyle}" aria-hidden="true"></span>
                                <i class="fas fa-fire text-5xl status-resource-icon status-fire-icon" data-stat-icon="mana" style="${manaIconStyle}"></i>                               
                            </div> 

                            <div style="position: relative; display: ${hasMoney ? 'flex' : 'none'};" data-action="edit-stat" data-stat-type="dinheiro" data-stat-max="${characterData.dinheiro || 0}" class="mt-4 flex flex-col items-center">
                                <span class="status-coins-stack text-4xl" aria-hidden="true">
                                    <i class="fas fa-coins status-coins-base"></i>
                                    <span class="status-coins-shine">
                                        <i class="fas fa-coins"></i>
                                    </span>
                                </span>
                                <div class="absolute inset-0 flex flex-col items-center justify-center font-bold text-white text-xs pointer-events-none pt-2" style="margin: auto; z-index: 2;">
                                    <span data-stat-current="dinheiro" style="bottom: 12px;">
                                        ${characterData.dinheiro || 0}
                                    </span>
                                </div>
                            </div> 
                            <div style="position: relative;" class="mt-8 flex flex-col items-center">
                                <button id="open-lore-modal-btn-${uniqueId}" class="thumb-btn" style="display: ${hasLore ? 'flex' : 'none'}" type="button" title="Abrir lore" aria-label="Abrir lore do personagem">
                                    <span class="status-lore-stack text-3xl" aria-hidden="true">
                                        <i class="fas fa-book-open status-lore-base"></i>
                                        <span class="status-lore-shine">
                                            <i class="fas fa-book-open"></i>
                                        </span>
                                    </span>
                                </button>
                            </div>                            
                        </div>  
                        <div class="mb-2 flex flex-col items-center" style="display: ${isCreature ? 'none' : 'flex'};">
                            ${attackStatsHtml}
                        </div>
                        <div class="grid grid-row-6 gap-y-3 text-xs div-Stats w-12 py-4" style="border-radius: 28px 5px 28px 5px; background: ${predominantColor.colorLight}; padding: 15px 10px; box-shadow: 0 0 10px black; ">
                            ${mainAttributes.map(key => {
                            const baseValue = parseInt(characterData.attributes[key]) || 0;
                            const fixedBonus = totalFixedBonuses[key] || 0;
                            return `
                                <button type="button" class="text-center attribute-stat-trigger${fixedBonus !== 0 ? ' has-fixed-bonus' : ''}" data-action="open-pericias" data-attribute-key="${key}" title="${ATTRIBUTE_KEY_TO_GROUP[key] || key}">
                                  ${ATTRIBUTE_KEY_TO_SHORT[key] || key.slice(0, 3).toUpperCase()}  <br>${formatTotal(baseValue + fixedBonus, fixedBonus !== 0)}
                                </button>
                            `;
                            }).join('')}
                        </div> 
                    </div>

                    <div class="absolute bottom-[-3px] w-full" style="display: ${(isModal || isInPlay || previewFull) ? 'flex' : 'none'}">
                        <div class="scrollable-content text-sm text-left ml-2 div-miniCards${hasCollectionDock ? ' has-collection-dock' : ''}" style="display: flex; flex-direction: row; overflow-y: scroll;gap: 12px; scroll-snap-type: x mandatory; margin-left: 55px;">
                            <div class="pb-4 rounded-3xl w-full character-scroll-panel" style="scroll-snap-align: start;flex-shrink: 0;min-width: 100%; border-color: ${palette.borderColor}; position: relative; z-index: 1; overflow-y: visible; display: flex; flex-direction: column; justify-content: flex-end;">
                                <div class="pericias-scroll-area flex flex-col gap-2 px-2 h-full" style="overflow-y: auto;"></div>
                            </div>
                        </div>                        
                    </div>
                </div>
                <div id="lore-icon-${uniqueId}" class="absolute top-8 left-1/2 -translate-x-1/2 text-center z-10"  data-action="toggle-lore">
                    <h3 class="text-2xl font-bold">${characterData.title}</h3>
                    <p class="text-md italic text-gray-300">${characterData.subTitle}</p>
                </div>
                ${loreModalHtml}
                ${periciaModalHtml}
                ${bonusSourceModalHtml}
                ${collectionModalHtml}
            </div> 
        </div>
    `;

    const finalHtml = sheetHtml;

    if (staticHtmlOnly) {
        return finalHtml;
    }

    sheetContainer.style.background = `url('${imageBack}')`;
    sheetContainer.style.backgroundSize = 'cover';
    sheetContainer.style.backgroundPosition = 'center';
    sheetContainer.style.boxShadow = 'inset 0px 0px 10px 0px black';
    sheetContainer.dataset.inPlay = isInPlay ? 'true' : 'false';
    sheetContainer.innerHTML = finalHtml;
    applyStatIconVisualState(sheetContainer, 'vida', characterData.attributes.vidaAtual, permanentMaxVida);
    applyStatIconVisualState(sheetContainer, 'mana', characterData.attributes.manaAtual, permanentMaxMana);

    if (isInPlay) {
        sheetContainer.classList.add('in-play-animation');
    }

 

    const collectionConfigMap = new Map(collectionConfigs.map(config => [config.key, config]));
    const collectionModal = sheetContainer.querySelector(`#character-collection-modal-${uniqueId}`);
    const collectionTitle = sheetContainer.querySelector(`#character-collection-title-${uniqueId}`);
    const collectionCount = sheetContainer.querySelector(`#character-collection-count-${uniqueId}`);
    const collectionCloseBtn = sheetContainer.querySelector(`#character-collection-close-${uniqueId}`);
    const collectionPanels = Array.from(sheetContainer.querySelectorAll('[data-collection-panel]'));
    const collectionGrids = Array.from(sheetContainer.querySelectorAll('[data-collection-grid]'));
    const collectionTabs = Array.from(sheetContainer.querySelectorAll('.character-collection-tab'));
    const collectionTriggers = Array.from(sheetContainer.querySelectorAll('.character-collection-trigger'));

    const renderCollectionMiniCard = async (config, item, index, totalItems) => {
        let miniSheetHtml = '';
        let wrapperClass = 'related-spell-grid-item';
        let fanStyle = '';
        let relatedStackHtml = '';
        let hasRelatedStack = false;
        const showMiniCardCaption = config.key === 'spells';
        const miniCardCaption = escapeHtml(item.name || item.title || 'Magia');

        if (config.type === 'character') {
            wrapperClass = 'related-character-grid-item';
            miniSheetHtml = await renderFullCharacterSheet(item, false, false, null, { staticHtmlOnly: true });
        } else if (config.type === 'item') {
            wrapperClass = 'related-item-grid-item';
            miniSheetHtml = await renderFullItemSheet(item, false);
        } else if (config.type === 'attack') {
            wrapperClass = 'related-attack-grid-item';
            miniSheetHtml = await renderFullAttackSheet(item, false);
        } else if (config.type === 'skill') {
            wrapperClass = 'related-skill-grid-item';
            miniSheetHtml = await renderFullSpellSheet(item, false);
        } else {
            miniSheetHtml = await renderFullSpellSheet(item, false);
        }

        if (config.key === 'relationships') {
            const centerIndex = (totalItems - 1) / 2;
            const distanceFromCenter = index - centerIndex;
            const fanRotation = (distanceFromCenter * 5.5).toFixed(2);
            const fanOffsetY = (Math.abs(distanceFromCenter) * 8).toFixed(2);
            const fanLayer = Math.max(1, Math.round((totalItems - Math.abs(distanceFromCenter)) * 10));
            fanStyle = ` style="--fan-rotate: ${fanRotation}deg; --fan-offset-y: ${fanOffsetY}px; --fan-z: ${fanLayer};"`;
        } else if (['spells', 'skills', 'attacks', 'items'].includes(config.key)) {
            const relatedStoreName = config.key === 'items' ? 'rpgItems' : 'rpgEffects';
            const relatedIds = [item.enhanceCardId, item.trueCardId].filter(Boolean);
            const relatedCards = (await Promise.all(relatedIds.map(id => getData(relatedStoreName, id)))).filter(Boolean);

            if (relatedCards.length > 0) {
                hasRelatedStack = true;
                miniSheetHtml = `<div class="related-card-stack-layer related-card-stack-layer-base">${miniSheetHtml}</div>`;
                relatedStackHtml = (await Promise.all(relatedCards.map(async (related, relatedIndex) => {
                    let relatedHtml = '';

                    if (config.type === 'item') {
                        relatedHtml = await renderFullItemSheet(related, false);
                    } else if (config.type === 'attack') {
                        relatedHtml = await renderFullAttackSheet(related, false);
                    } else {
                        relatedHtml = await renderFullSpellSheet(related, false);
                    }

                    return `<div class="related-card-stack-layer related-card-stack-layer-${relatedIndex + 1}">${relatedHtml}</div>`;
                }))).join('');
            }
        }

        return `
            <div
                class="character-collection-mini-card ${wrapperClass}${hasRelatedStack ? ' has-related-stack' : ''}${showMiniCardCaption ? ' has-mini-card-caption' : ''}"
                data-collection-key="${config.key}"
                data-item-id="${item.id}"${fanStyle}>
                ${miniSheetHtml}
                ${relatedStackHtml}
                ${showMiniCardCaption ? `<div class="character-collection-mini-card__caption" title="${miniCardCaption}">${miniCardCaption}</div>` : ''}
            </div>
        `;
    };

    const scaleCollectionGridCards = (grid) => {
        if (!grid) return;

        const scaleGroup = (selector, sheetIdPrefix) => {
            grid.querySelectorAll(selector).forEach(item => {
                const sheet = item.querySelector(`[id^="${sheetIdPrefix}"]`);
                if (!sheet) return;

                const sheetWidth = sheet.clientWidth;
                const sheetHeight = sheet.clientHeight;
                const targetWidth = item.clientWidth;
                if (sheetWidth > 0 && sheetHeight > 0 && targetWidth > 0) {
                    const scale = targetWidth / sheetWidth;
                    const scaledHeight = sheetHeight * scale;
                    const caption = item.querySelector('.character-collection-mini-card__caption');
                    const captionHeight = caption ? caption.offsetHeight + 8 : 0;
                    item.style.setProperty('--collection-card-scaled-height', `${scaledHeight}px`);
                    item.style.height = `${scaledHeight + captionHeight}px`;
                    item.style.position = 'relative';

                    const stackedSheets = item.querySelectorAll('.related-card-stack-layer > div');
                    if (stackedSheets.length > 0) {
                        stackedSheets.forEach(stackedSheet => {
                            stackedSheet.style.transform = `scale(${scale})`;
                            stackedSheet.style.transformOrigin = 'top left';
                        });
                    } else {
                        sheet.style.transform = `scale(${scale})`;
                        sheet.style.transformOrigin = 'top left';
                    }
                }
            });
        };

        scaleGroup('.related-character-grid-item', 'character-sheet-');
        scaleGroup('.related-spell-grid-item, .related-skill-grid-item, .related-attack-grid-item', 'spell-sheet-');
        scaleGroup('.related-item-grid-item', 'item-sheet-');
    };

    const ensureCollectionPanelRendered = async (collectionKey) => {
        const config = collectionConfigMap.get(collectionKey);
        const panel = collectionPanels.find(item => item.dataset.collectionPanel === collectionKey);
        const grid = collectionGrids.find(item => item.dataset.collectionGrid === collectionKey);
        const status = panel?.querySelector(`[data-collection-status="${collectionKey}"]`);

        if (!config || !panel || !grid) return;
        if (panel.dataset.rendered === 'true') return;

        panel.dataset.rendered = 'loading';
        if (status) {
            status.textContent = 'Carregando mini cards...';
            status.classList.remove('hidden');
        }

        try {
            const cardsHtml = await Promise.all(config.items.map((item, index) => renderCollectionMiniCard(config, item, index, config.items.length)));
            grid.innerHTML = cardsHtml.join('');
            grid.classList.remove('hidden');
            panel.dataset.rendered = 'true';
            if (status) {
                status.classList.add('hidden');
            }

            if (!grid._collectionResizeObserver) {
                const resizeObserver = new ResizeObserver(() => {
                    scaleCollectionGridCards(grid);
                });
                resizeObserver.observe(grid);
                grid._collectionResizeObserver = resizeObserver;
            }

            requestAnimationFrame(() => {
                scaleCollectionGridCards(grid);
            });
        } catch (error) {
            console.error('Erro ao renderizar mini cards da colecao:', error);
            panel.dataset.rendered = 'error';
            if (status) {
                status.textContent = 'Nao foi possivel carregar estes mini cards.';
                status.classList.remove('hidden');
            }
        }
    };

    const setActiveCollection = (collectionKey) => {
        const config = collectionConfigMap.get(collectionKey);
        if (!config || !collectionModal) return;

        if (collectionTitle) collectionTitle.textContent = config.label;
        if (collectionCount) {
            const suffix = config.items.length === 1 ? 'card disponivel' : 'cards disponiveis';
            collectionCount.textContent = `${config.items.length} ${suffix}`;
        }

        collectionTabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.collectionKey === collectionKey);
        });

        collectionPanels.forEach(panel => {
            panel.classList.toggle('hidden', panel.dataset.collectionPanel !== collectionKey);
        });
    };

    const openCollectionModal = async (collectionKey) => {
        if (!collectionModal) return;
        setActiveCollection(collectionKey);
        collectionModal.setAttribute('aria-hidden', 'false');
        collectionModal.classList.remove('hidden');
        requestAnimationFrame(() => collectionModal.classList.add('visible'));
        await ensureCollectionPanelRendered(collectionKey);
    };

    const closeCollectionModal = () => {
        if (!collectionModal || collectionModal.classList.contains('hidden')) return;
        collectionModal.setAttribute('aria-hidden', 'true');
        collectionModal.classList.remove('visible');
        setTimeout(() => {
            if (!collectionModal.classList.contains('visible')) {
                collectionModal.classList.add('hidden');
            }
        }, 180);
    };

    const openCollectionEntry = async (collectionKey, itemId) => {
        const config = collectionConfigMap.get(collectionKey);
        if (!config) return;

        try {
            if (config.type === 'character') {
                const data = await getData('rpgCards', itemId);
                if (data) {
                    await renderFullCharacterSheet(data, true, false, document.getElementById('nested-sheet-container'));
                }
                return;
            }

            if (config.type === 'item') {
                const data = await getData('rpgItems', itemId);
                if (data) {
                    await renderFullItemSheet(data, true);
                }
                return;
            }

            if (config.type === 'attack') {
                const data = await getData('rpgEffects', itemId);
                if (data) {
                    await renderFullAttackSheet(data, true);
                }
                return;
            }

            const data = await getData('rpgEffects', itemId);
            if (data) {
                await renderFullSpellSheet(data, true);
            }
        } catch (error) {
            console.error('Erro ao abrir card relacionado:', error);
            showCustomAlert('Nao foi possivel abrir este card agora.');
        }
    };

    collectionTabs.forEach(tab => {
        tab.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            setActiveCollection(tab.dataset.collectionKey);
            await ensureCollectionPanelRendered(tab.dataset.collectionKey);
        });
    });

    if (collectionCloseBtn) {
        collectionCloseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeCollectionModal();
        });
    }

    if (collectionModal) {
        collectionModal.addEventListener('click', async (e) => {
            const miniCard = e.target.closest('.character-collection-mini-card');
            if (miniCard) {
                e.preventDefault();
                e.stopPropagation();
                await openCollectionEntry(miniCard.dataset.collectionKey, miniCard.dataset.itemId);
                return;
            }

            if (e.target === collectionModal) {
                closeCollectionModal();
            }
        });
    }

    sheetContainer.addEventListener('click', async (e) => {
        const collectionTrigger = e.target.closest('.character-collection-trigger');
        if (collectionTrigger && sheetContainer.contains(collectionTrigger)) {
            e.preventDefault();
            e.stopPropagation();
            await openCollectionModal(collectionTrigger.dataset.collectionKey);
        }
    });

   setTimeout(() => {
     // --- LÓGICA DE AJUSTE DE ALTURA ---
    const miniCardsDiv = sheetContainer.querySelector('.div-miniCards');
    const statsDiv = sheetContainer.querySelector('.div-Stats');
    const collectionDock = sheetContainer.querySelector('.character-collection-dock');
    const collectionGrid = sheetContainer.querySelector('.character-collection-grid');

    if (miniCardsDiv && statsDiv) {
        const adjustStatsHeight = () => {
            const miniCardsHeight = miniCardsDiv.offsetHeight;
            // Define a altura mínima do statsDiv igual à do miniCardsDiv.
            // Se miniCards for maior, statsDiv cresce.
            // Se miniCards for menor, o min-height será pequeno e o statsDiv manterá seu tamanho natural (comportamento "não fazer nada").
            statsDiv.style.minHeight = `${miniCardsHeight - 10}px`;
            // Opcional: Ajustar o alinhamento do conteúdo para ficar centralizado ou distribuído se esticar muito
            statsDiv.style.display = 'flex';
            statsDiv.style.flexDirection = 'column';
            statsDiv.style.justifyContent = 'space-evenly'; 

            if (collectionDock && collectionGrid) {
                const collectionDockWrapper = collectionDock.parentElement;
                const statsRect = statsDiv.getBoundingClientRect();
                const wrapperRect = collectionDockWrapper?.getBoundingClientRect();
                const statsHeight = Math.max(
                    Math.round(statsRect.height || 0),
                    statsDiv.offsetHeight || 0
                );

                if (wrapperRect && statsHeight > 0 && wrapperRect.height > 0) {
                    const statsCenterY = (statsRect.top - wrapperRect.top) + (statsRect.height / 2);

                    collectionDock.style.bottom = 'auto';
                    collectionGrid.style.height = '100%';
                    collectionGrid.style.justifyContent = 'center';
                }
            }
        };

        // Executa imediatamente
        adjustStatsHeight();

        // Cria um observador para ajustar caso o inventário carregue depois e mude o tamanho
        const resizeObserver = new ResizeObserver(() => {
            adjustStatsHeight();
        });
        resizeObserver.observe(miniCardsDiv);
        
        // Salva a referência no container para limpar depois
        sheetContainer._statsResizeObserver = resizeObserver;
    }
    // -----------------------------------

}, 100); 

    const enhancedMiniCardsDiv = sheetContainer.querySelector('.div-miniCards');
    const enhancedStatsDiv = sheetContainer.querySelector('.div-Stats');
    const enhancedCollectionDock = sheetContainer.querySelector('.character-collection-dock');
    const enhancedCollectionGrid = sheetContainer.querySelector('.character-collection-grid');
    const enhancedCharacterSheetEl = sheetContainer.querySelector(`#character-sheet-${uniqueId}`);
    const enhancedCollectionDockWrapper = enhancedCollectionDock?.parentElement;

    if (enhancedMiniCardsDiv && enhancedStatsDiv) {
        let enhancedAlignmentFrame = null;

        const adjustCollectionDockAlignment = () => {
            enhancedAlignmentFrame = null;

            const miniCardsHeight = Math.max(
                enhancedMiniCardsDiv.offsetHeight || 0,
                Math.round(enhancedMiniCardsDiv.getBoundingClientRect().height || 0)
            );

            if (miniCardsHeight > 0) {
                enhancedStatsDiv.style.minHeight = `${Math.max(miniCardsHeight - 10, 0)}px`;
            }

            enhancedStatsDiv.style.display = 'flex';
            enhancedStatsDiv.style.flexDirection = 'column';
            enhancedStatsDiv.style.justifyContent = 'space-evenly';

            if (enhancedCollectionDock && enhancedCollectionGrid && enhancedCollectionDockWrapper) {
                const statsRect = enhancedStatsDiv.getBoundingClientRect();
                const wrapperRect = enhancedCollectionDockWrapper.getBoundingClientRect();
                const statsHeight = Math.max(
                    Math.round(statsRect.height || 0),
                    enhancedStatsDiv.offsetHeight || 0
                );

                if (statsHeight > 0 && wrapperRect.height > 0) {
                    const statsCenterY = (statsRect.top - wrapperRect.top) + (statsRect.height / 2);

                    enhancedCollectionDock.style.top = `${statsCenterY}px`;
                    enhancedCollectionDock.style.bottom = 'auto';
                    enhancedCollectionGrid.style.height = '100%';
                    enhancedCollectionGrid.style.justifyContent = 'center';
                }
            }
        };

        const scheduleCollectionDockAlignment = () => {
            if (enhancedAlignmentFrame !== null) {
                cancelAnimationFrame(enhancedAlignmentFrame);
            }

            enhancedAlignmentFrame = requestAnimationFrame(() => {
                adjustCollectionDockAlignment();
            });
        };

        const runAlignmentPasses = (remainingPasses = 6) => {
            scheduleCollectionDockAlignment();
            if (remainingPasses <= 0) return;

            requestAnimationFrame(() => {
                runAlignmentPasses(remainingPasses - 1);
            });
        };

        const handleCollectionDockViewportChange = () => {
            scheduleCollectionDockAlignment();
        };

        runAlignmentPasses();
        setTimeout(() => scheduleCollectionDockAlignment(), 120);
        setTimeout(() => scheduleCollectionDockAlignment(), 260);

        const dockResizeObserver = new ResizeObserver(() => {
            scheduleCollectionDockAlignment();
        });

        dockResizeObserver.observe(enhancedMiniCardsDiv);
        dockResizeObserver.observe(enhancedStatsDiv);

        if (enhancedCharacterSheetEl) {
            dockResizeObserver.observe(enhancedCharacterSheetEl);
            enhancedCharacterSheetEl.addEventListener('transitionend', handleCollectionDockViewportChange);
        }

        if (enhancedCollectionDockWrapper) {
            dockResizeObserver.observe(enhancedCollectionDockWrapper);
        }

        window.addEventListener('resize', handleCollectionDockViewportChange);
        window.addEventListener('orientationchange', handleCollectionDockViewportChange);

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', handleCollectionDockViewportChange);
        }

        sheetContainer._scheduleStatsAndCollectionDockAlignment = scheduleCollectionDockAlignment;
        sheetContainer._collectionDockResizeObserver = dockResizeObserver;
        sheetContainer._collectionDockAlignmentCleanup = () => {
            if (enhancedAlignmentFrame !== null) {
                cancelAnimationFrame(enhancedAlignmentFrame);
            }

            window.removeEventListener('resize', handleCollectionDockViewportChange);
            window.removeEventListener('orientationchange', handleCollectionDockViewportChange);

            if (window.visualViewport) {
                window.visualViewport.removeEventListener('resize', handleCollectionDockViewportChange);
            }

            if (enhancedCharacterSheetEl) {
                enhancedCharacterSheetEl.removeEventListener('transitionend', handleCollectionDockViewportChange);
            }
        };
    }

    populateInventory(sheetContainer, characterData, uniqueId).finally(() => {
        if (typeof sheetContainer._scheduleStatsAndCollectionDockAlignment === 'function') {
            requestAnimationFrame(() => {
                sheetContainer._scheduleStatsAndCollectionDockAlignment();
            });
        }
    });

    if (isModal || isInPlay) {
        setTimeout(() => sheetContainer.classList.add('visible'), 10);
    }

    const loreIcon = sheetContainer.querySelector(`#lore-icon-${uniqueId}`);
    const openLoreModalBtn = sheetContainer.querySelector(`#open-lore-modal-btn-${uniqueId}`);
    const loreModal = sheetContainer.querySelector(`#lore-modal-${uniqueId}`);
    const closeLoreModalBtn = sheetContainer.querySelector(`#close-lore-modal-btn-${uniqueId}`);
    const periciaModal = sheetContainer.querySelector(`#pericia-modal-${uniqueId}`);
    const periciaModalTitle = sheetContainer.querySelector(`#pericia-modal-title-${uniqueId}`);
    const periciaModalBody = sheetContainer.querySelector(`#pericia-modal-body-${uniqueId}`);
    const closePericiaModalBtn = sheetContainer.querySelector(`#close-pericia-modal-btn-${uniqueId}`);
    const bonusSourceModal = sheetContainer.querySelector(`#bonus-source-modal-${uniqueId}`);
    const bonusSourceModalTitle = sheetContainer.querySelector(`#bonus-source-modal-title-${uniqueId}`);
    const bonusSourceModalBody = sheetContainer.querySelector(`#bonus-source-modal-body-${uniqueId}`);
    const closeBonusSourceModalBtn = sheetContainer.querySelector(`#close-bonus-source-modal-btn-${uniqueId}`);
    const closeSheetBtn = sheetContainer.querySelector(`#close-sheet-btn-${uniqueId}`);

    const getBonusSourcesForKey = (bonusKey) => {
        if (!bonusKey) return [];
        if (bonusKey.startsWith('pericia::')) {
            const periciaName = decodeURIComponent(bonusKey.slice('pericia::'.length));
            return bonusSources.pericias[periciaName] || [];
        }
        return bonusSources[bonusKey] || [];
    };

    const renderBonusSourceModalContent = (bonusKey, bonusLabel) => {
        if (bonusSourceModalTitle) {
            bonusSourceModalTitle.textContent = bonusLabel || bonusKey || 'Bonus';
        }
        if (bonusSourceModalBody) {
            bonusSourceModalBody.innerHTML = renderBonusSourceList(getBonusSourcesForKey(bonusKey));
        }
    };

    const renderPericiaModalContent = (attributeKey) => {
        const attributeGroup = ATTRIBUTE_KEY_TO_GROUP[attributeKey] || attributeKey.toUpperCase();
        const pericias = (groupedPericias[attributeGroup] || []).slice().sort((a, b) => a.name.localeCompare(b.name));
        const attributeBonusSources = bonusSources[attributeKey] || [];
        const attributeBonusTotal = totalFixedBonuses[attributeKey] || 0;

        if (periciaModalTitle) {
            periciaModalTitle.textContent = ATTRIBUTE_KEY_TO_SHORT[attributeKey] || attributeGroup;
        }

        if (!periciaModalBody) return;

        if (pericias.length === 0) {
            periciaModalBody.innerHTML = `
                ${attributeBonusTotal !== 0 ? `
                    <div class="bonus-source-section">
                        <p class="bonus-source-section__title">Origem do bonus fixo ${attributeBonusTotal > 0 ? '+' : ''}${attributeBonusTotal}</p>
                        ${renderBonusSourceList(attributeBonusSources)}
                    </div>
                ` : ''}
                <p class="text-sm text-gray-400 italic">Nenhuma pericia relacionada a ${attributeGroup}.</p>
            `;
            return;
        }

        periciaModalBody.innerHTML = `
            ${attributeBonusTotal !== 0 ? `
                <div class="bonus-source-section">
                    <p class="bonus-source-section__title">Origem do bonus fixo ${attributeBonusTotal > 0 ? '+' : ''}${attributeBonusTotal}</p>
                    ${renderBonusSourceList(attributeBonusSources)}
                </div>
            ` : ''}
            ${pericias.map(pericia => {
            const total = (parseInt(pericia.base) || 0) + (parseInt(pericia.bonus) || 0);
            const hasPericiaBonus = (parseInt(pericia.bonus) || 0) !== 0;
            const valueHtml = formatTotal(total, hasPericiaBonus);
            const contentHtml = `
                    <div class="attribute-pericia-card__top">
                        <h4>${pericia.name}</h4>
                        <span>${valueHtml}</span>
                    </div>
            `;
            if (hasPericiaBonus) {
                return `
                    <button type="button" class="attribute-pericia-card stat-bonus-trigger" data-action="open-bonus-sources" data-bonus-key="pericia::${encodeURIComponent(pericia.name)}" data-bonus-label="${escapeHtml(pericia.name)}">
                        ${contentHtml}
                    </button>
                `;
            }
            return `<div class="attribute-pericia-card">${contentHtml}</div>`;
        }).join('')}
        `;
    };

    const closeSheet = () => {
         // Limpa o observador se existir
        if (sheetContainer._statsResizeObserver) {
            sheetContainer._statsResizeObserver.disconnect();
            delete sheetContainer._statsResizeObserver;
        }

        if (sheetContainer._collectionDockResizeObserver) {
            sheetContainer._collectionDockResizeObserver.disconnect();
            delete sheetContainer._collectionDockResizeObserver;
        }

        if (sheetContainer._collectionDockAlignmentCleanup) {
            sheetContainer._collectionDockAlignmentCleanup();
            delete sheetContainer._collectionDockAlignmentCleanup;
        }

        if (sheetContainer._scheduleStatsAndCollectionDockAlignment) {
            delete sheetContainer._scheduleStatsAndCollectionDockAlignment;
        }

        collectionGrids.forEach(grid => {
            if (grid._collectionResizeObserver) {
                grid._collectionResizeObserver.disconnect();
                delete grid._collectionResizeObserver;
            }
        });

        sheetContainer.classList.remove('visible');
        const handler = () => {
            sheetContainer.classList.add('hidden');
            sheetContainer.innerHTML = '';
            if (imageUrl && imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
            if (imageBack && imageBack.startsWith('blob:')) URL.revokeObjectURL(imageBack);
            sheetContainer.removeEventListener('transitionend', handler);
        };
        sheetContainer.addEventListener('transitionend', handler);
    };

    if (loreModal && closeLoreModalBtn) {
        if (hasLore) {
            if (openLoreModalBtn) {
                openLoreModalBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    loreModal.classList.remove('hidden');
                    loreModal.focus();
                });
            }

            if (loreIcon) {
                loreIcon.addEventListener('click', () => {
                    loreModal.classList.remove('hidden');
                    loreModal.focus();
                });
            }
        }
        
        closeLoreModalBtn.addEventListener('click', () => loreModal.classList.add('hidden'));
         loreModal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') loreModal.classList.add('hidden');
        });
         loreModal.addEventListener('click', (e) => {
             if (e.target === loreModal) loreModal.classList.add('hidden');
         });
    }

    if (periciaModal && closePericiaModalBtn) {
        sheetContainer.querySelectorAll('[data-action="open-pericias"]').forEach(trigger => {
            trigger.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                renderPericiaModalContent(trigger.dataset.attributeKey);
                periciaModal.classList.remove('hidden');
                periciaModal.focus();
            });
        });

        closePericiaModalBtn.addEventListener('click', () => periciaModal.classList.add('hidden'));
        periciaModal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') periciaModal.classList.add('hidden');
        });
        periciaModal.addEventListener('click', (e) => {
            if (e.target === periciaModal) periciaModal.classList.add('hidden');
        });
    }

    if (bonusSourceModal && closeBonusSourceModalBtn) {
        closeBonusSourceModalBtn.addEventListener('click', () => bonusSourceModal.classList.add('hidden'));
        bonusSourceModal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') bonusSourceModal.classList.add('hidden');
        });
        bonusSourceModal.addEventListener('click', (e) => {
            if (e.target === bonusSourceModal) bonusSourceModal.classList.add('hidden');
        });
    }

    if (closeSheetBtn) {
         const newCloseBtn = closeSheetBtn.cloneNode(true);
         closeSheetBtn.parentNode.replaceChild(newCloseBtn, closeSheetBtn);
        if (isInPlay) {
            newCloseBtn.addEventListener('click', () => {
                document.dispatchEvent(new CustomEvent('navigateHome'));
            });
        } else {
            newCloseBtn.addEventListener('click', closeSheet);
        }
    }

     sheetContainer.addEventListener('click', (e) => {
        const bonusTrigger = e.target.closest('[data-action="open-bonus-sources"]');
        if (bonusTrigger && bonusSourceModal) {
            e.preventDefault();
            e.stopPropagation();
            renderBonusSourceModalContent(bonusTrigger.dataset.bonusKey, bonusTrigger.dataset.bonusLabel);
            bonusSourceModal.classList.remove('hidden');
            bonusSourceModal.focus();
            return;
        }
        if (e.target === sheetContainer && sheetContainer.id === 'character-sheet-container') {
            closeSheet();
        }
    });
     document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const hasExpandedRelatedSheet = ['spell-sheet-container', 'item-sheet-container', 'attack-sheet-container', 'nested-sheet-container']
            .some(id => {
                const modal = document.getElementById(id);
                return modal && modal.classList.contains('visible');
            });
        if (hasExpandedRelatedSheet) return;
        if (bonusSourceModal && !bonusSourceModal.classList.contains('hidden')) {
            bonusSourceModal.classList.add('hidden');
            return;
        }
        if (periciaModal && !periciaModal.classList.contains('hidden')) {
            periciaModal.classList.add('hidden');
            return;
        }
        if (collectionModal && !collectionModal.classList.contains('hidden')) {
            closeCollectionModal();
            return;
        }
        if (sheetContainer.id === 'character-sheet-container' && sheetContainer.classList.contains('visible')) {
            closeSheet();
        }
     });

    if (isModal || isInPlay) {
        setupStatEditor(characterData, sheetContainer);
    }
    return finalHtml;
}

function calculateClassStats(characterData) {
    const level = parseInt(characterData.level) || 1;
    const vig = parseInt(characterData.attributes.vigor) || 0;
    const sab = parseInt(characterData.attributes.sabedoria) || 0;
    const car = parseInt(characterData.attributes.carisma) || 0;

    const classe = characterData.classe || 'mago';

    let vidaBase = 0;
    let manaBase = 0;

    switch (classe) {
        case 'mago':
            vidaBase = 12 + vig + ((level - 1) * (3 + vig));
            manaBase = 6 + sab + ((level - 1) * (4 + sab));
            break;

        case 'bardo':
            vidaBase = 12 + vig + ((level - 1) * (4 + vig));
            manaBase = 2 + car + ((level - 1) * (2 + car));
            break;

        case 'paladino':
            vidaBase = 20 + vig + ((level - 1) * (4 + vig));
            manaBase = 4 + sab + ((level - 1) * (2 + sab));
            break;

        default:
            vidaBase = 10 + vig;
            manaBase = 5 + sab;
    }

    return { vidaBase, manaBase };
}
