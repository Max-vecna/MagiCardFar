import { bufferToBlob } from './ui_utils.js';
import { hasArenaModel, renderArenaModelSheet } from './arena_model_renderer.js';
import {
    buildRelatedCardCarousel,
    getRelatedCardGroup,
    setupRelatedCardCarousel
} from './related_card_carousel.js';

function resolveItemCardSize(aspectRatio, options = {}) {
    if (Number(options.cardWidth) > 0 && Number(options.cardHeight) > 0) {
        return {
            finalWidth: Number(options.cardWidth),
            finalHeight: Number(options.cardHeight)
        };
    }

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    if ((windowWidth / aspectRatio) > windowHeight) {
        const finalHeight = windowHeight * 0.9;
        return {
            finalWidth: finalHeight * aspectRatio,
            finalHeight
        };
    }

    const finalWidth = windowWidth * 0.9;
    return {
        finalWidth,
        finalHeight: finalWidth / aspectRatio
    };
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getDiceValueParts(value) {
    const text = String(value ?? '').trim();
    if (!text) return null;

    const plusIndex = text.indexOf('+');
    if (plusIndex < 0) {
        return { main: text, bonus: '' };
    }

    return {
        main: text.slice(0, plusIndex).trim() || text,
        bonus: `+${text.slice(plusIndex + 1).trim()}`
    };
}

const INFO_STAT_ICON_BY_KEY = {
    type: 'fa-tag',
    execution: 'fa-bolt',
    range: 'fa-ruler-combined',
    target: 'fa-crosshairs',
    duration: 'fa-hourglass-half',
    resistencia: 'fa-shield-halved',
    charge: 'fa-weight-hanging',
    prerequisite: 'fa-key',
    bonus: 'fa-circle-plus'
};

const INFO_STAT_ICON_BY_LABEL = {
    ex: 'fa-bolt',
    al: 'fa-ruler-combined',
    av: 'fa-crosshairs',
    cd: 'fa-shield-halved',
    du: 'fa-hourglass-half',
    tipo: 'fa-tag',
    carga: 'fa-weight-hanging',
    pre: 'fa-key',
    prerequisito: 'fa-key',
    bonus: 'fa-circle-plus',
    bonusfixo: 'fa-circle-plus'
};

function normalizeInfoStatName(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

function getInfoStatIcon(stat) {
    const key = normalizeInfoStatName(stat.key);
    const label = normalizeInfoStatName(stat.label);
    return stat.icon || INFO_STAT_ICON_BY_KEY[key] || INFO_STAT_ICON_BY_LABEL[label] || 'fa-gem';
}

function getSheetIconAccentColor(predominantColor) {
    return predominantColor?.colorLight || predominantColor?.color100 || '#ffffff';
}

function renderSideDiceRail(stats, predominantColor) {
    const items = stats
        .map(stat => ({ ...stat, valueParts: getDiceValueParts(stat.value) }))
        .filter(stat => stat.valueParts);

    if (items.length === 0) return '';

    return `
        <div class="sheet-side-rail sheet-side-rail--left sheet-dice-rail" style="--sheet-accent: ${predominantColor.color100}; --sheet-icon-accent: ${getSheetIconAccentColor(predominantColor)}; --sheet-panel-bg: ${predominantColor.color30};">
            ${items.map(stat => `
                <div class="sheet-dice-stat" title="${escapeHtml(stat.label)}">
                    <div class="sheet-dice-stat__icon">
                        <i class="fas ${stat.icon}"></i>
                        <span class="sheet-dice-stat__value">
                            <span>${escapeHtml(stat.valueParts.main)}</span>
                            ${stat.valueParts.bonus ? `<span>${escapeHtml(stat.valueParts.bonus)}</span>` : ''}
                        </span>
                    </div>
                    <span class="sheet-dice-stat__label">${escapeHtml(stat.label)}</span>
                </div>
            `).join('')}
        </div>
    `;
}

function renderSideInfoRail(stats, predominantColor) {
    const items = stats.filter(stat => stat.value !== null && stat.value !== undefined && String(stat.value).trim() !== '');
    if (items.length === 0) return '';

    return `
        <div class="sheet-side-rail sheet-side-rail--right sheet-info-rail" style="--sheet-accent: ${predominantColor.color100}; --sheet-icon-accent: ${getSheetIconAccentColor(predominantColor)}; --sheet-panel-bg: ${predominantColor.color30};">
            ${items.map(stat => `
                <div class="sheet-info-stat" title="${escapeHtml(`${stat.label}: ${stat.value}`)}">
                    <div class="sheet-info-stat__icon">
                        <i class="fas ${getInfoStatIcon(stat)}" aria-hidden="true"></i>
                        <span class="sheet-info-stat__value">${escapeHtml(stat.value)}</span>
                    </div>
                    <span class="sheet-info-stat__label">${escapeHtml(stat.label)}</span>
                </div>
            `).join('')}
        </div>
    `;
}

export async function renderFullItemSheet(itemData, isModal, options = {}) {
    const sheetContainer = document.getElementById('item-sheet-container');
    if (!sheetContainer) return '';

    const aspectRatio = 9 / 16;
    const { finalWidth, finalHeight } = resolveItemCardSize(aspectRatio, options);
    const uniqueId = `item-${itemData.id}-${Date.now()}`;

    if (hasArenaModel(itemData)) {
        if (!isModal) {
            return renderArenaModelSheet(itemData, false, {
                ...options,
                containerId: 'item-sheet-container'
            });
        }

        const { cards: relatedCards, activeIndex } = await getRelatedCardGroup(itemData, 'rpgItems');
        if (relatedCards.length > 1) {
            const index = document.getElementsByClassName('visible').length;
            sheetContainer.style.zIndex = 100000000 + index;
            sheetContainer.innerHTML = await buildRelatedCardCarousel({
                relatedCards,
                activeIndex,
                width: finalWidth,
                height: finalHeight,
                closeButtonHtml: `
                    <button id="close-item-sheet-btn-${uniqueId}" class="absolute top-4 right-4 bg-red-600 hover:text-white z-50 thumb-btn" style="display:block;">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                `,
                renderCard: card => renderFullItemSheet(card, false, {
                    cardWidth: finalWidth,
                    cardHeight: finalHeight
                })
            });

            sheetContainer.style.backgroundImage = `url(icons/fundo.svg)`;
            sheetContainer.style.backgroundSize = 'cover';
            sheetContainer.style.backgroundPosition = 'center';
            sheetContainer.classList.remove('hidden');
            setTimeout(() => sheetContainer.classList.add('visible'), 10);
            setupRelatedCardCarousel(sheetContainer);

            const closeSheet = () => {
                sheetContainer.classList.remove('visible');
                const handler = () => {
                    sheetContainer.classList.add('hidden');
                    sheetContainer.innerHTML = '';
                    sheetContainer.removeEventListener('transitionend', handler);
                };
                sheetContainer.addEventListener('transitionend', handler);
            };

            sheetContainer.querySelector(`#close-item-sheet-btn-${uniqueId}`)?.addEventListener('click', closeSheet);
            const overlayHandler = (event) => {
                if (event.target === sheetContainer) {
                    closeSheet();
                    sheetContainer.removeEventListener('click', overlayHandler);
                }
            };
            sheetContainer.addEventListener('click', overlayHandler);
            return;
        }

        return renderArenaModelSheet(itemData, isModal, {
            ...options,
            containerId: 'item-sheet-container'
        });
    }

    if(isModal) {  
        const index = document.getElementsByClassName('visible').length;
        sheetContainer.style.zIndex = 100000000 + index;
    }

    let createdObjectUrl = null;
    const objectUrlCollector = Array.isArray(options.objectUrls) ? options.objectUrls : null;
    let imageUrl = 'https://placehold.co/400x400/a0522d/ffffff?text=Item';
    if (itemData.image) {
        createdObjectUrl = URL.createObjectURL(bufferToBlob(itemData.image, itemData.imageMimeType));
        if (objectUrlCollector) objectUrlCollector.push(createdObjectUrl);
        imageUrl = createdObjectUrl;
    }
    
    const predominantColor = itemData.predominantColor || { color30: 'rgba(217, 119, 6, 0.3)', color100: 'rgb(217, 119, 6)' };
    const origin = isModal ? "" : "transform-origin: top left";
    const transformProp = isModal ? 'transform: scale(.9);' : '';
    itemData.aumentos = Array.isArray(itemData.aumentos)
        ? itemData.aumentos.filter(a => (a?.tipo || 'fixo') === 'fixo')
        : [];

    const diceStatsHtml = renderSideDiceRail([
        { key: 'acerto', label: 'Acerto', icon: 'fa-dice-d20', value: itemData.acerto },
        { key: 'critico', label: 'Acerto Critico', icon: 'fa-crosshairs', value: itemData.critico },
        { key: 'damage', label: 'ATK', icon: 'fa-fire', value: itemData.damage || itemData.dano },
        { key: 'danoSemMana', label: 'ATK s/Mana', icon: 'fa-skull', value: itemData.danoSemMana },
        { key: 'vidaDado', label: 'PV', icon: 'fa-heart', value: itemData.vidaDado },
        { key: 'manaDado', label: 'PM', icon: 'fa-fire', value: itemData.manaDado }
    ], predominantColor);
    const fixedBonusInfo = itemData.aumentos.map(aumento => ({
        key: 'bonus',
        label: aumento.nome || 'Bonus',
        value: `${Number(aumento.valor) > 0 ? '+' : ''}${aumento.valor}`
    }));
    const sideInfoHtml = renderSideInfoRail([
        { key: 'type', label: 'Tipo', value: itemData.type },
        { key: 'charge', label: 'Carga', value: itemData.charge },
        { key: 'prerequisite', label: 'Pre', value: itemData.prerequisite },
        ...fixedBonusInfo
    ], predominantColor);

    const sheetHtml = `
        <button id="close-item-sheet-btn-${uniqueId}" class="absolute top-4 right-4 bg-red-600 hover:text-white z-20 thumb-btn" style="display:${isModal? "block": "none"};"><i class="fa-solid fa-xmark"></i></button>
        <div id="item-sheet-${uniqueId}" class="w-full h-full rounded-lg shadow-2xl overflow-hidden relative text-white" style="${origin}; background-image: url('${imageUrl}'); background-size: cover; background-position: center; box-shadow: 0 0 20px ${predominantColor.color100}; width: ${finalWidth}px; height: ${finalHeight}px; ${transformProp} margin: 0 auto;">        
            <div class="w-full h-full" style="background: linear-gradient(-180deg, #000000a4, transparent, transparent, #0000008f, #0000008f, #000000a4); display: flex; align-items: center; justify-content: center;">
                <div class="rounded-lg" style="width: 100%; height: calc(100% - 20px); border: 3px solid ${predominantColor.color100}; margin: 10px;"></div>
            </div>
            
            <div class="w-full text-left absolute top-0 line-top" style="background-color: ${predominantColor.color30}; padding-top: 20px; padding-bottom: 10px; text-align: center; --minha-cor: ${predominantColor.color100};">
                <h3 class="font-bold tracking-tight text-white" style="font-size: 1.3rem">${escapeHtml(itemData.name || '')}</h3>
            </div>

            ${diceStatsHtml}
            ${sideInfoHtml}
            
            <div class="mt-auto p-6 pt-3 md:p-6 w-full text-left absolute bottom-0 line-bottom sheet-description-zone" style="--sheet-description-bg: ${predominantColor.color30}; --minha-cor: ${predominantColor.color100};">                
                <div class="sheet-card-text-panel sheet-description-panel">                      
                  <div class="sheet-description-scroll space-y-3 overflow-y-auto pr-2">
                        ${[
                            { label: 'Descrição', value: itemData.effect },
                            { label: 'Aprimorar', value: itemData.enhance, hidden: Boolean(itemData.enhanceCardId) },
                            { label: 'Verdadeiro', value: itemData.true, hidden: Boolean(itemData.trueCardId) }
                        ].filter(section => section.value && !section.hidden).map(section => `
                            <div class="pt-2">
                                <h3 class="text-sm font-semibold flex items-center gap-2">${escapeHtml(section.label)}</h3>
                                <p class="text-gray-300 text-xs leading-relaxed mt-1 pl-6" style="white-space:pre-line;">${escapeHtml(section.value)}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>            
        </div>       
    `;

    if (!isModal) return sheetHtml;

    const { cards: relatedCards, activeIndex } = await getRelatedCardGroup(itemData, 'rpgItems');
    const carouselObjectUrls = [];
    if (relatedCards.length > 1) {
        sheetContainer.innerHTML = await buildRelatedCardCarousel({
            relatedCards,
            activeIndex,
            width: finalWidth,
            height: finalHeight,
            closeButtonHtml: `
                <button id="close-item-sheet-btn-${uniqueId}" class="absolute top-4 right-4 bg-red-600 hover:text-white z-50 thumb-btn" style="display:block;">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            `,
            renderCard: card => renderFullItemSheet(card, false, {
                cardWidth: finalWidth,
                cardHeight: finalHeight,
                objectUrls: carouselObjectUrls
            })
        });
    } else {
        sheetContainer.innerHTML = sheetHtml;
    }

    sheetContainer.style.backgroundImage = `url(icons/fundo.svg)`;
    sheetContainer.style.backgroundSize = 'cover';
    sheetContainer.style.backgroundPosition = 'center';
    sheetContainer.classList.remove('hidden');
    setTimeout(() => sheetContainer.classList.add('visible'), 10);

    const closeSheet = () => {
        sheetContainer.classList.remove('visible');
        const handler = () => {
            sheetContainer.classList.add('hidden');
            sheetContainer.innerHTML = '';
            if (createdObjectUrl && !objectUrlCollector) URL.revokeObjectURL(createdObjectUrl);
            carouselObjectUrls.forEach(url => URL.revokeObjectURL(url));
            sheetContainer.removeEventListener('transitionend', handler);
        };
        sheetContainer.addEventListener('transitionend', handler);
    };

    const closeBtn = sheetContainer.querySelector(`#close-item-sheet-btn-${uniqueId}`);
    if (closeBtn) {
        const newBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newBtn, closeBtn);
        newBtn.addEventListener('click', closeSheet);
    }

    setupRelatedCardCarousel(sheetContainer);
    
    const overlayHandler = (e) => {
        if (e.target === sheetContainer) {
            closeSheet();
            sheetContainer.removeEventListener('click', overlayHandler);
        }
    };
    sheetContainer.addEventListener('click', overlayHandler);
}
