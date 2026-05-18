import { bufferToBlob } from './ui_utils.js';

async function getRelatedSpellCards(spellData) {
    const { getData } = await import('./local_db.js');
    const relationIds = [
        { role: 'base', label: 'Base', id: spellData.id },
        { role: 'enhance', label: 'Aprimorar', id: spellData.enhanceCardId },
        { role: 'true', label: 'Verdadeiro', id: spellData.trueCardId }
    ];

    const cards = await Promise.all(relationIds.map(async relation => {
        if (relation.role === 'base') return { ...relation, card: spellData };
        if (!relation.id) return null;
        const card = await getData('rpgEffects', relation.id);
        return card ? { ...relation, card } : null;
    }));

    return cards.filter(Boolean);
}

function resolveSpellCardSize(aspectRatio, options = {}) {
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

function getInlineRelatedLayout(cardCount, aspectRatio) {
    if (cardCount <= 1 || window.innerWidth < 900) return null;

    const gap = 18;
    const maxWidth = window.innerWidth * 0.94;
    const maxHeight = window.innerHeight * 0.86;
    let cardWidth = (maxWidth - (gap * (cardCount - 1))) / cardCount;
    let cardHeight = cardWidth / aspectRatio;

    if (cardHeight > maxHeight) {
        cardHeight = maxHeight;
        cardWidth = cardHeight * aspectRatio;
    }

    if (cardWidth < 300) return null;

    return {
        cardWidth: Math.floor(cardWidth),
        cardHeight: Math.floor(cardHeight),
        gap
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

function renderSideDiceRail(stats, predominantColor) {
    const items = stats
        .map(stat => ({ ...stat, valueParts: getDiceValueParts(stat.value) }))
        .filter(stat => stat.valueParts);

    if (items.length === 0) return '';

    return `
        <div class="sheet-side-rail sheet-side-rail--left sheet-dice-rail" style="--sheet-accent: ${predominantColor.color100}; --sheet-panel-bg: ${predominantColor.color30};">
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
        <div class="sheet-side-rail sheet-side-rail--right sheet-info-rail" style="--sheet-accent: ${predominantColor.color100}; --sheet-panel-bg: ${predominantColor.color30};">
            ${items.map(stat => `
                <div class="sheet-info-stat" title="${escapeHtml(`${stat.label}: ${stat.value}`)}" style="--sheet-accent: ${predominantColor.color100}; --sheet-panel-bg: ${predominantColor.color30};">
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

    if(isModal) {  
        const index = document.getElementsByClassName('visible').length;
        sheetContainer.style.zIndex = 100000000 + index;
    }

    const aspectRatio = 9 / 16;
    const { finalWidth, finalHeight } = resolveSpellCardSize(aspectRatio, options);

    let mainImageUrl;
    let createdMainObjectUrl = null;
    const typeLabel = spellData.type === 'ataque' ? 'Ataque' : (spellData.type === 'habilidade' ? 'Habilidade' : 'Magia');

    if (spellData.image) {
        createdMainObjectUrl = URL.createObjectURL(bufferToBlob(spellData.image, spellData.imageMimeType));
        mainImageUrl = createdMainObjectUrl;
    } else {
        mainImageUrl = `https://placehold.co/400x400/00796B/B2DFDB?text=${encodeURIComponent(typeLabel)}`;
    }

    let enhanceImageUrl = null;
    let createdEnhanceObjectUrl = null;
    if (spellData.enhanceImage) {
        createdEnhanceObjectUrl = URL.createObjectURL(bufferToBlob(spellData.enhanceImage, spellData.enhanceImageMimeType));
        enhanceImageUrl = createdEnhanceObjectUrl;
    }

    let trueImageUrl = null;
    let createdTrueObjectUrl = null;
    if (spellData.trueImage) {
        createdTrueObjectUrl = URL.createObjectURL(bufferToBlob(spellData.trueImage, spellData.trueImageMimeType));
        trueImageUrl = createdTrueObjectUrl;
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
    
    let aumentosHtml = '';
    if (spellData.aumentos && spellData.aumentos.length > 0) {
        const aumentosFixos = spellData.aumentos.filter(a => (a?.tipo || 'fixo') === 'fixo');
        const createList = (list, title, color) => {
            if (list.length === 0) return '';
            const items = list.map(a => `<li><span class="font-semibold">${escapeHtml(a.nome)}:</span> ${a.valor > 0 ? '+' : ''}${escapeHtml(a.valor)}</li>`).join('');
            return `<div class="mb-2"><h5 class="font-bold text-sm ${color}">${escapeHtml(title)}</h5><ul class="list-disc list-inside text-xs">${items}</ul></div>`;
        };
        
        aumentosHtml = `
            <div class="pt-2 scroll-section" data-bg-type="main">
                <h3 class="text-sm font-semibold flex items-center gap-2">Aumentos</h3>
                <div class="text-gray-300 text-xs leading-relaxed mt-1 space-y-1">
                    ${createList(aumentosFixos, 'Bônus Fixos', 'text-green-300')}
                    ${''}
                </div>
            </div>
        `;
    }

    const uniqueId = `spell-${spellData.id}-${Date.now()}`;
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
        { key: 'acerto', label: 'ATK', icon: 'fa-dice-d20', value: spellData.acerto },
        { key: 'critico', label: 'ATK s/Mana', icon: 'fa-crosshairs', value: spellData.critico },
        { key: 'dano', label: 'DMG', icon: 'fa-fire', value: spellData.dano },
        { key: 'danoSemMana', label: 'DMG s/Mana', icon: 'fa-skull', value: spellData.danoSemMana },
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
                        <!-- Div Principal com o recorte de trapézio -->
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

    const relatedCards = await getRelatedSpellCards(spellData);
    if (relatedCards.length > 1) {
        const inlineLayout = getInlineRelatedLayout(relatedCards.length, aspectRatio);
        const relatedCardWidth = inlineLayout?.cardWidth || finalWidth;
        const relatedCardHeight = inlineLayout?.cardHeight || finalHeight;
        const carouselClass = `spell-carousel-shell${inlineLayout ? ' spell-carousel-shell--inline' : ''}`;
        const carouselStyle = inlineLayout
            ? `width: ${relatedCardWidth * relatedCards.length + inlineLayout.gap * (relatedCards.length - 1)}px; height: ${relatedCardHeight}px; --spell-carousel-gap: ${inlineLayout.gap}px; --spell-related-card-width: ${relatedCardWidth}px;`
            : `width: ${finalWidth}px; height: ${finalHeight}px;`;

        const slidesHtml = (await Promise.all(relatedCards.map(async (relation, index) => {
            const cardHtml = await renderFullSpellSheet(relation.card, false, {
                cardWidth: relatedCardWidth,
                cardHeight: relatedCardHeight
            });
            return `
                <div class="spell-carousel-slide${index === 0 ? ' active' : ''}" data-slide-index="${index}">
                    <div class="spell-carousel-label">${escapeHtml(relation.label)}</div>
                    ${cardHtml}
                </div>
            `;
        }))).join('');

        sheetContainer.innerHTML = `
            <button id="close-spell-sheet-btn-${uniqueId}" class="absolute top-4 right-4 bg-red-600 hover:text-white z-50 thumb-btn" style="display:block;">
                <i class="fa-solid fa-xmark"></i>
            </button>
            <div class="${carouselClass}" style="${carouselStyle}">
                ${inlineLayout ? '' : '<button type="button" class="spell-carousel-nav prev" aria-label="Card anterior"><i class="fas fa-chevron-left"></i></button>'}
                <div class="spell-carousel-track">
                    ${slidesHtml}
                </div>
                ${inlineLayout ? '' : '<button type="button" class="spell-carousel-nav next" aria-label="Proximo card"><i class="fas fa-chevron-right"></i></button>'}
                ${inlineLayout ? '' : `<div class="spell-carousel-dots">
                    ${relatedCards.map((relation, index) => `<button type="button" class="spell-carousel-dot${index === 0 ? ' active' : ''}" data-slide-index="${index}" aria-label="${escapeHtml(relation.label)}"></button>`).join('')}
                </div>`}
            </div>
        `;
    } else {
        sheetContainer.innerHTML = sheetHtml;
    }
    sheetContainer.style.backgroundImage = `url(icons/fundo.svg)`;
    sheetContainer.style.backgroundSize = 'cover';
    sheetContainer.style.backgroundPosition = 'center';
    
    sheetContainer.style.transition = 'opacity 0.4s ease-out';
    sheetContainer.style.opacity = '0';
    sheetContainer.classList.remove('hidden');
    
    setTimeout(() => {
        sheetContainer.classList.add('visible');
        sheetContainer.style.opacity = '1';
    }, 10);

    setTimeout(() => {
        const scrollContainer = document.getElementById(`spell-scroll-container-${uniqueId}`);
        const bg1 = document.getElementById(`spell-bg-1-${uniqueId}`);
        const bg2 = document.getElementById(`spell-bg-2-${uniqueId}`);
        
        let currentBgUrl = mainImageUrl;
        let activeLayer = 1;

        if (scrollContainer && bg1 && bg2) {
            scrollContainer.addEventListener('scroll', () => {
                const sections = scrollContainer.querySelectorAll('.scroll-section');
                const containerRect = scrollContainer.getBoundingClientRect();
                const triggerPoint = containerRect.top + (containerRect.height / 3);

                let activeSection = null;
                sections.forEach(section => {
                    const rect = section.getBoundingClientRect();
                    if (rect.top <= triggerPoint && rect.bottom >= triggerPoint) {
                        activeSection = section;
                    }
                });

                if (activeSection) {
                    const bgType = activeSection.dataset.bgType;
                    const sectionImage = activeSection.dataset.bgImage;
                    
                    let targetImage = mainImageUrl;
                    if ((bgType === 'enhance' || bgType === 'true') && sectionImage) {
                        targetImage = sectionImage;
                    }

                    if (targetImage !== currentBgUrl) {
                        currentBgUrl = targetImage;
                        if (activeLayer === 1) {
                            bg2.style.backgroundImage = `url('${targetImage}')`;
                            bg2.style.opacity = '1';
                            bg1.style.opacity = '0';
                            activeLayer = 2;
                        } else {
                            bg1.style.backgroundImage = `url('${targetImage}')`;
                            bg1.style.opacity = '1';
                            bg2.style.opacity = '0';
                            activeLayer = 1;
                        }
                    }
                }
            });
        }
    }, 200);

    const carousel = sheetContainer.querySelector('.spell-carousel-shell');
    if (carousel) {
        let activeIndex = 0;
        const slides = Array.from(carousel.querySelectorAll('.spell-carousel-slide'));
        const dots = Array.from(carousel.querySelectorAll('.spell-carousel-dot'));
        const showSlide = (nextIndex) => {
            activeIndex = (nextIndex + slides.length) % slides.length;
            slides.forEach((slide, index) => slide.classList.toggle('active', index === activeIndex));
            dots.forEach((dot, index) => dot.classList.toggle('active', index === activeIndex));
        };

        carousel.querySelector('.spell-carousel-nav.prev')?.addEventListener('click', (e) => {
            e.stopPropagation();
            showSlide(activeIndex - 1);
        });
        carousel.querySelector('.spell-carousel-nav.next')?.addEventListener('click', (e) => {
            e.stopPropagation();
            showSlide(activeIndex + 1);
        });
        dots.forEach(dot => {
            dot.addEventListener('click', (e) => {
                e.stopPropagation();
                showSlide(parseInt(dot.dataset.slideIndex, 10) || 0);
            });
        });
    }

    const closeSheet = () => {
        sheetContainer.classList.remove('visible');
        sheetContainer.style.opacity = '0'; 
        const handler = () => {
            sheetContainer.classList.add('hidden');
            sheetContainer.innerHTML = '';
            if (createdMainObjectUrl) URL.revokeObjectURL(createdMainObjectUrl);
            if (createdEnhanceObjectUrl) URL.revokeObjectURL(createdEnhanceObjectUrl);
            if (createdTrueObjectUrl) URL.revokeObjectURL(createdTrueObjectUrl);
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
        if (e.target === sheetContainer) {
            closeSheet();
            sheetContainer.removeEventListener('click', overlayHandler);
        }
    };
    sheetContainer.addEventListener('click', overlayHandler);
}
