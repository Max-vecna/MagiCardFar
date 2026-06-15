import { applyDarkModalBackdrop, bufferToBlob, shrinkExpandedCardSize } from './ui-utils.js';
import { ensureArenaBaseLayoutTemplatesLoaded, hasArenaModel, renderArenaModelSheet } from './renderer-arena-model.js';
import {
    buildRelatedCardCarousel,
    getRelatedCardGroup,
    setupRelatedCardCarousel
} from './ui-related-card-carousel.js';

function resolveSpellCardSize(aspectRatio, options = {}, shrinkExpanded = false) {
    const finalize = size => shrinkExpanded ? shrinkExpandedCardSize(size) : size;

    if (Number(options.cardWidth) > 0 && Number(options.cardHeight) > 0) {
        return finalize({
            finalWidth: Number(options.cardWidth),
            finalHeight: Number(options.cardHeight)
        });
    }

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const isMobile = window.matchMedia?.('(max-width: 640px)').matches || windowWidth <= 640;

    if (isMobile) {
        const maxWidth = Math.max(240, windowWidth - 8);
        const maxHeight = Math.max(320, windowHeight - 68);
        const finalHeight = Math.min(maxHeight, maxWidth / aspectRatio);
        return finalize({
            finalWidth: finalHeight * aspectRatio,
            finalHeight
        });
    }

    if ((windowWidth / aspectRatio) > windowHeight) {
        const finalHeight = windowHeight * 0.9;
        return finalize({
            finalWidth: finalHeight * aspectRatio,
            finalHeight
        });
    }

    const finalWidth = windowWidth * 0.9;
    return finalize({
        finalWidth,
        finalHeight: finalWidth / aspectRatio
    });
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
                <div class="sheet-info-stat" title="${escapeHtml(`${stat.label}: ${stat.value}`)}" style="--sheet-accent: ${predominantColor.color100}; --sheet-icon-accent: ${getSheetIconAccentColor(predominantColor)}; --sheet-panel-bg: ${predominantColor.color30};">
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

export async function renderFullSpellSheet(spellData, isModal, options = {}) {
    const sheetContainer = document.getElementById('spell-sheet-container');
    if (!sheetContainer) return;
    await ensureArenaBaseLayoutTemplatesLoaded();

    const aspectRatio = 9 / 16;
    const { finalWidth, finalHeight } = resolveSpellCardSize(aspectRatio, options, isModal);
    const uniqueId = `spell-${spellData.id}-${Date.now()}`;

    if (hasArenaModel(spellData)) {
        if (!isModal) {
            return renderArenaModelSheet(spellData, false, {
                ...options,
                containerId: 'spell-sheet-container'
            });
        }

        const { cards: relatedCards, activeIndex } = await getRelatedCardGroup(spellData, 'rpgEffects');
        if (relatedCards.length > 1) {
            const index = document.getElementsByClassName('visible').length;
            sheetContainer.style.zIndex = 100000000 + index;
            sheetContainer.innerHTML = await buildRelatedCardCarousel({
                relatedCards,
                activeIndex,
                width: finalWidth,
                height: finalHeight,
                closeButtonHtml: `
                    <button id="close-spell-sheet-btn-${uniqueId}" class="spell-carousel-close absolute top-4 right-4 bg-red-600 hover:text-white z-50 thumb-btn" style="display:block;">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                `,
                renderCard: card => renderFullSpellSheet(card, false, {
                    cardWidth: finalWidth,
                    cardHeight: finalHeight
                })
            });

            applyDarkModalBackdrop(sheetContainer);
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

            sheetContainer.querySelector(`#close-spell-sheet-btn-${uniqueId}`)?.addEventListener('click', closeSheet);
            const overlayHandler = (event) => {
                if (event.target === sheetContainer || event.target?.classList?.contains('spell-carousel-modal-layout')) {
                    closeSheet();
                    sheetContainer.removeEventListener('click', overlayHandler);
                }
            };
            sheetContainer.addEventListener('click', overlayHandler);
            return;
        }

        return renderArenaModelSheet(spellData, isModal, {
            ...options,
            containerId: 'spell-sheet-container'
        });
    }

    if(isModal) {
        const index = document.getElementsByClassName('visible').length;
        sheetContainer.style.zIndex = 100000000 + index;
    }

    let mainImageUrl;
    let createdMainObjectUrl = null;
    const objectUrlCollector = Array.isArray(options.objectUrls) ? options.objectUrls : null;
    const typeLabel = spellData.type === 'ataque' ? 'Ataque' : (spellData.type === 'habilidade' ? 'Habilidade' : 'Magia');

    if (spellData.image) {
        createdMainObjectUrl = URL.createObjectURL(bufferToBlob(spellData.image, spellData.imageMimeType));
        if (objectUrlCollector) objectUrlCollector.push(createdMainObjectUrl);
        mainImageUrl = createdMainObjectUrl;
    } else {
        mainImageUrl = `https://placehold.co/400x400/00796B/B2DFDB?text=${encodeURIComponent(typeLabel)}`;
    }

    const defaultColor = spellData.type === 'ataque'
        ? { color30: 'rgba(248, 113, 113, 0.3)', color100: 'rgb(248, 113, 113)' }
        : { color30: 'rgba(13, 148, 136, 0.3)', color100: 'rgb(13, 148, 136)' };
    const predominantColor = spellData.predominantColor || defaultColor;
    const origin = isModal ?  "" : "transform-origin: top left";
    const transformProp = isModal ? 'transform: scale(0.9);' : '';
    spellData.aumentos = Array.isArray(spellData.aumentos)
        ? spellData.aumentos.filter(a => (a?.tipo || 'fixo') === 'fixo')
        : [];
    const fixedBonusInfo = spellData.aumentos.map(aumento => ({
        key: 'bonus',
        label: aumento.nome || 'Bonus',
        value: `${Number(aumento.valor) > 0 ? '+' : ''}${aumento.valor}`
    }));
    const sideInfoHtml = renderSideInfoRail([
        { key: 'execution', label: 'EX', value: spellData.execution },
        { key: 'range', label: 'AL', value: spellData.range },
        { key: 'target', label: 'AV', value: spellData.target },
        { key: 'duration', label: 'DU', value: spellData.duration },
        { key: 'resistencia', label: 'CD', value: spellData.resistencia },
        ...fixedBonusInfo
    ], predominantColor);

    const topBarParts = [];
    if (spellData.circle > 0 || spellData.manaCost > 0) {
        topBarParts.push(`${spellData.circle > 0 ? `${spellData.circle}º Círculo` : ''}${spellData.circle > 0 && spellData.manaCost > 0 ? ' - ' : ''}${spellData.manaCost > 0 ? `${spellData.manaCost} PM` : ''}`);
    }
    const topBarHtml = topBarParts.length > 0
        ? `<p style="font-size: 10px;">${topBarParts.join(' - ')}</p>`
        : '';

    const attackStatsHtml = renderSideDiceRail([
        { key: 'acerto', label: 'Acerto', icon: 'fa-dice-d20', value: spellData.acerto },
        { key: 'critico', label: 'Acerto Critico', icon: 'fa-crosshairs', value: spellData.critico },
        { key: 'dano', label: 'ATK', icon: 'fa-fire', value: spellData.dano },
        { key: 'danoSemMana', label: 'ATK s/Mana', icon: 'fa-skull', value: spellData.danoSemMana },
        { key: 'vidaDado', label: 'PV', icon: 'fa-heart', value: spellData.vidaDado },
        { key: 'manaDado', label: 'PM', icon: 'fa-fire', value: spellData.manaDado }
    ], predominantColor);

    const textSections = [
        { label: 'Descrição', value: spellData.description },
        { label: 'Aprimorar', value: spellData.enhance, hidden: Boolean(spellData.enhanceCardId) },
        { label: 'Verdadeiro', value: spellData.true, hidden: Boolean(spellData.trueCardId) }
    ];
    const textLabelHtml = textSections.map(({ label, value, hidden }) =>
    {
        const content = hidden ? '-' : (value || '-');

        return `
            <div class="scroll-section" data-bg-type="main" style="${content === '-' ? 'display: none;' : ''}">
                <h3 class="text-sm font-semibold flex items-center gap-2">${escapeHtml(label)}</h3>
                <p class="text-gray-300 text-xs leading-relaxed mt-1" style="white-space: break-spaces;text-align: justify;">${escapeHtml(content)}</p>
            </div>`;
    }).join('');

    const sheetHtml = `
        <button id="close-spell-sheet-btn-${uniqueId}" class="absolute top-4 right-4 bg-red-600 hover:text-white z-50 thumb-btn" style="display:${isModal? "block": "none"};">
            <i class="fa-solid fa-xmark"></i>
        </button>
        <div id="spell-sheet-${uniqueId}" class="w-full h-full rounded-lg shadow-2xl overflow-hidden relative text-white" style="${origin}; width: ${finalWidth}px; height: ${finalHeight}px; ${transformProp} margin: 0 auto; box-shadow: 0 0 20px ${predominantColor.color100}; background-color: #1a1a1a;">

            <div id="spell-bg-1-${uniqueId}" class="absolute inset-0 w-full h-full bg-cover bg-center" style="background-image: url('${mainImageUrl}'); z-index: 0; opacity: 1;"></div>
            <div id="spell-bg-2-${uniqueId}" class="absolute inset-0 w-full h-full bg-cover bg-center" style="background-image: url('${mainImageUrl}'); z-index: 0; opacity: 0;"></div>

            <div class="absolute inset-0 w-full h-full z-10" style="background: linear-gradient(-180deg, #000000a4, transparent, transparent, #0000008f, #0000008f, #000000a4); display: flex; align-items: center; justify-content: center; pointer-events: none;box-shadow: inset 0px 0px 5px black; ">
                <div class="rounded-lg" style="width: 100%; height: calc(100% - 20px); border: 3px solid ${predominantColor.color100}; margin: 10px;box-shadow: inset 0px 0px 33px black, inset 0px 0px 16px black; overflow: hidden;">

                    <div style="filter: drop-shadow(0 10px 15px rgba(0, 0, 0, 0.8));">

                        <div style="clip-path: polygon(0 0, 100% 0, 85% 100%, 15% 100%); margin-top: -1px; background-color: ${predominantColor.color100};; display: flex; align-items: center; justify-content: center; color: white;">
                            <h3>${escapeHtml(spellData.name || '')}</h3>
                        </div>
                    </div>

                </div>
            </div>

            ${attackStatsHtml}
            ${sideInfoHtml}

            <div class="mt-auto w-full text-left absolute bottom-0 z-20 sheet-description-zone" style="--sheet-description-bg: ${predominantColor.color30}; --minha-cor: ${predominantColor.color100};">
                <div class="p-6 pt-3 md:p-6 sheet-card-text-panel sheet-description-panel line-bottom">
                    <div id="spell-scroll-container-${uniqueId}" class="sheet-description-scroll space-y-3 overflow-y-auto custom-scrollbar">
                        ${topBarHtml}
                        ${textLabelHtml}
                    </div>
                </div>
            </div>
        </div>
    `;

    if (!isModal) return sheetHtml;

    const { cards: relatedCards, activeIndex } = await getRelatedCardGroup(spellData, 'rpgEffects');
    const carouselObjectUrls = [];
    if (relatedCards.length > 1) {
        sheetContainer.innerHTML = await buildRelatedCardCarousel({
            relatedCards,
            activeIndex,
            width: finalWidth,
            height: finalHeight,
            closeButtonHtml: `
                <button id="close-spell-sheet-btn-${uniqueId}" class="spell-carousel-close absolute top-4 right-4 bg-red-600 hover:text-white z-50 thumb-btn" style="display:block;">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            `,
            renderCard: card => renderFullSpellSheet(card, false, {
                cardWidth: finalWidth,
                cardHeight: finalHeight,
                objectUrls: carouselObjectUrls
            })
        });
    } else {
        sheetContainer.innerHTML = sheetHtml;
    }
    applyDarkModalBackdrop(sheetContainer);

    sheetContainer.style.transition = 'opacity 0.4s ease-out';
    sheetContainer.style.opacity = '0';
    sheetContainer.classList.remove('hidden');

    setTimeout(() => {
        sheetContainer.classList.add('visible');
        sheetContainer.style.opacity = '1';
    }, 10);

    setupRelatedCardCarousel(sheetContainer);

    const closeSheet = () => {
        sheetContainer.classList.remove('visible');
        sheetContainer.style.opacity = '0';
        const handler = () => {
            sheetContainer.classList.add('hidden');
            sheetContainer.innerHTML = '';
            if (createdMainObjectUrl && !objectUrlCollector) URL.revokeObjectURL(createdMainObjectUrl);
            carouselObjectUrls.forEach(url => URL.revokeObjectURL(url));
            sheetContainer.removeEventListener('transitionend', handler);
        };
        sheetContainer.addEventListener('transitionend', handler);
    };

    const closeSheetBtn = sheetContainer.querySelector(`#close-spell-sheet-btn-${uniqueId}`);
    if (closeSheetBtn) {
        const btn = closeSheetBtn.cloneNode(true);
        closeSheetBtn.parentNode.replaceChild(btn, closeSheetBtn);
        btn.addEventListener('click', closeSheet);
    }

    const overlayHandler = (e) => {
        if (e.target === sheetContainer || e.target?.classList?.contains('spell-carousel-modal-layout')) {
            closeSheet();
            sheetContainer.removeEventListener('click', overlayHandler);
        }
    };
    sheetContainer.addEventListener('click', overlayHandler);
}

export async function renderFullAttackSheet(attackData, isModal, options = {}) {
    if (!attackData) return '';
    return renderFullSpellSheet({ ...attackData, type: 'ataque' }, isModal, options);
}
