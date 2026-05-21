const ARENA_MODEL_TEMPLATE_STORAGE_KEY = 'arenaModelTemplates.v1';
const sanitizedModelCache = new WeakMap();
const cardImageUrlCache = new Map();
let arenaModelTemplatesCache = null;

function replaceBackgroundDataImageUrls(code, replacement) {
    return String(code || '').replace(
        /(background-image\s*:\s*)url\((['"]?)data:image\/[^,'")]+(?:;[^,'")]+)*,[^'")]+\2\)/gi,
        `$1${replacement}`
    );
}

function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cssString(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\A ');
}

function safeCssName(value) {
    return String(value || 'div').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'div';
}

function cssClassForElement(element) {
    return `clip-${safeCssName(element?.name)}-${safeCssName(element?.id)}`;
}

function normalizeHexColor(value, fallback = '#0d9488') {
    const raw = String(value || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
    if (/^#[0-9a-f]{3}$/i.test(raw)) {
        return `#${raw.slice(1).split('').map(char => char + char).join('')}`;
    }
    return fallback;
}

function replaceSpecificBackgroundImagesInCode(code, images, replacement) {
    let next = String(code || '');
    (images || []).forEach(image => {
        const value = String(image || '').trim();
        if (!value) return;
        const escaped = cssString(value);
        const variants = new Set([
            `url("${escaped}")`,
            `url('${escaped}')`,
            `url(${escaped})`,
            `url("${value}")`,
            `url('${value}')`,
            `url(${value})`
        ]);
        variants.forEach(variant => {
            next = next.replace(new RegExp(escapeRegExp(variant), 'g'), replacement);
        });
    });
    return next;
}

function shouldUseCardImageForElement(element, sourceRootId) {
    if (!element || typeof element !== 'object') return false;
    if (sourceRootId && element.id === sourceRootId) return true;
    if (!element.parentId && element.backgroundImage) return true;
    if (element.cardScaffoldRole === 'container') return true;
    if (element.autoCardScaffold && !element.parentId) return true;
    return false;
}

function replaceSolidChildColorRules(code, elements) {
    let next = String(code || '');
    (elements || [])
        .filter(element => element?.parentId && element.childFillMode === 'solid')
        .forEach(element => {
            const className = cssClassForElement(element);
            const fallback = normalizeHexColor(element.colorA, '#0d9488');
            const blockPattern = new RegExp(`(\\.clip-div\\.${escapeRegExp(className)}::before\\s*\\{[\\s\\S]*?\\n\\})`, 'g');
            next = next.replace(blockPattern, block => {
                let updated = block
                    .replace(/background-color:\s*[^;]+;/, `background-color: var(--arena-card-color, ${fallback});`)
                    .replace(/background-image:\s*[^;]+;/, 'background-image: none;');
                if (/opacity:\s*[^;]+;/.test(updated)) {
                    updated = updated.replace(/opacity:\s*[^;]+;/, 'opacity: 1;');
                } else {
                    updated = updated.replace(/\n\}/, '\n  opacity: 1;\n}');
                }
                return updated;
            });
        });
    return next;
}

function replaceGradientChildColorRules(code, elements) {
    let next = String(code || '');
    (elements || [])
        .filter(element => element?.parentId && element.childFillMode === 'gradient')
        .forEach(element => {
            const className = cssClassForElement(element);
            const fallbackA = normalizeHexColor(element.colorA, '#0d9488');
            const fallbackB = normalizeHexColor(element.colorB, fallbackA);
            const intensityA = clampNumber(element.colorImageIntensity ?? 62, 0, 100);
            const intensityB = formatNumber(intensityA);
            const blockPattern = new RegExp(`(\\.clip-div\\.${escapeRegExp(className)}::before\\s*\\{[\\s\\S]*?\\n\\})`, 'g');
            next = next.replace(blockPattern, block => {
                let updated = block
                    .replace(/background-color:\s*[^;]+;/, 'background-color: transparent;')
                    .replace(/background-image:\s*[^;]+;/, `background-image: linear-gradient(145deg, color-mix(in srgb, var(--arena-card-color, ${fallbackA}) ${intensityA}%, transparent), color-mix(in srgb, var(--arena-card-color-light, ${fallbackB}) ${intensityB}%, transparent));`);
                if (/opacity:\s*[^;]+;/.test(updated)) {
                    updated = updated.replace(/opacity:\s*[^;]+;/, 'opacity: 1;');
                } else {
                    updated = updated.replace(/\n\}/, '\n  opacity: 1;\n}');
                }
                return updated;
            });
        });
    return next;
}

function clampNumber(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, number));
}

function formatNumber(value) {
    return Number.parseFloat(Number(value || 0).toFixed(2));
}

function readArenaModelTemplates() {
    if (arenaModelTemplatesCache) return arenaModelTemplatesCache;
    try {
        const data = JSON.parse(localStorage.getItem(ARENA_MODEL_TEMPLATE_STORAGE_KEY)) || {};
        arenaModelTemplatesCache = data && typeof data === 'object' ? data : {};
        return arenaModelTemplatesCache;
    } catch (error) {
        arenaModelTemplatesCache = {};
        return {};
    }
}

function writeArenaModelTemplates(templates) {
    arenaModelTemplatesCache = templates || {};
    localStorage.setItem(ARENA_MODEL_TEMPLATE_STORAGE_KEY, JSON.stringify(templates || {}));
}

function sanitizeArenaModelForTemplate(model) {
    if (!model || typeof model !== 'object') return model;
    if (sanitizedModelCache.has(model)) return sanitizedModelCache.get(model);
    const copy = typeof structuredClone === 'function'
        ? structuredClone(model)
        : JSON.parse(JSON.stringify(model));

    const modelColors = new Set();
    const cardImageBackgrounds = new Set();
    const sourceRootId = copy.sourceRootId || '';
    if (Array.isArray(copy.elements)) {
        copy.elements.forEach(element => {
            if (!element || typeof element !== 'object') return;
            ['colorA', 'colorB', 'parentBgColor', 'effectColor'].forEach(key => {
                const value = String(element[key] || '').trim();
                if (/^#[0-9a-f]{3,8}$/i.test(value)) modelColors.add(value);
            });
            if (shouldUseCardImageForElement(element, sourceRootId)) {
                if (element.backgroundImage) cardImageBackgrounds.add(element.backgroundImage);
                element.backgroundImage = '';
                element.backgroundImageName = '';
            }
        });
    }

    ['generatedCode', 'html', 'code'].forEach(key => {
        if (typeof copy[key] === 'string') {
            copy[key] = replaceSpecificBackgroundImagesInCode(copy[key], cardImageBackgrounds, 'var(--arena-card-image, none)');
            modelColors.forEach(color => {
                copy[key] = copy[key].replace(new RegExp(color.replace('#', '\\#'), 'gi'), 'var(--arena-card-color, #0d9488)');
            });
            copy[key] = replaceSolidChildColorRules(copy[key], copy.elements);
            copy[key] = replaceGradientChildColorRules(copy[key], copy.elements);
        }
    });

    sanitizedModelCache.set(model, copy);
    return copy;
}

function getArenaModel(cardData) {
    if (cardData?.disableArenaModel || cardData?._disableArenaModel) return null;
    const ownModel = cardData?.arenaModel || cardData?._arenaModel || null;
    if (ownModel?.generatedCode || ownModel?.html || ownModel?.code) {
        return sanitizeArenaModelForTemplate(ownModel);
    }
    return getArenaModelTemplate(cardData) || null;
}

function getArenaTemplateKey(cardData) {
    const explicitType = String(cardData?._arenaTemplateType || '').toLowerCase();
    if (explicitType) return explicitType;

    const store = String(cardData?._arenaStoreName || '').toLowerCase();
    const type = String(cardData?.type || cardData?.cardType || '').toLowerCase();

    if (store === 'rpgitems' || type === 'item' || type === 'arma' || type === 'armadura') return 'item';
    if (store === 'rpgcards') return cardData?.cardType === 'creature' ? 'creature' : 'character';
    if (type === 'habilidade') return 'skill';
    if (type === 'ataque') return 'attack';
    if (type === 'magia') return 'magic';
    if (cardData?.cardType === 'creature') return 'creature';
    if (cardData?.cardType || cardData?.attributes) return 'character';
    return '';
}

function getArenaModelTemplate(cardData) {
    const key = getArenaTemplateKey(cardData);
    if (!key) return null;
    const template = readArenaModelTemplates()[key] || null;
    return template ? sanitizeArenaModelForTemplate(template) : null;
}

export function saveArenaModelTemplateFromCard(cardData) {
    const model = cardData?.arenaModel || cardData?._arenaModel;
    if (!model?.generatedCode && !model?.html && !model?.code) return false;
    const key = getArenaTemplateKey(cardData);
    if (!key) return false;
    const templates = readArenaModelTemplates();
    templates[key] = sanitizeArenaModelForTemplate(model);
    writeArenaModelTemplates(templates);
    return true;
}

export async function seedArenaModelTemplatesFromLocalData() {
    try {
        const { getData } = await import('./local_db.js');
        const stores = ['rpgEffects', 'rpgItems', 'rpgCards'];
        let saved = 0;
        for (const store of stores) {
            const records = await getData(store);
            (records || []).forEach(record => {
                if (saveArenaModelTemplateFromCard({ ...record, _arenaStoreName: record?._arenaStoreName || store })) saved++;
            });
        }
        return saved;
    } catch (error) {
        console.warn('Nao foi possivel carregar templates do Arena salvos localmente:', error);
        return 0;
    }
}

function getValueByPath(source, path) {
    if (!source || !path) return '';
    return String(path).split('.').reduce((value, key) => {
        if (value === null || value === undefined) return undefined;
        return value[key];
    }, source);
}

function valueHasText(value) {
    return value !== undefined && value !== null && String(value).trim() !== '';
}

function buildDescriptionText(cardData) {
    const sections = [
        { label: 'Descrição', value: getValueByPath(cardData, 'description') || getValueByPath(cardData, 'effect') },
        { label: 'Aprimorar', value: getValueByPath(cardData, 'enhance'), hidden: Boolean(cardData?.enhanceCardId) },
        { label: 'Verdadeiro', value: getValueByPath(cardData, 'true'), hidden: Boolean(cardData?.trueCardId) }
    ].filter(section => !section.hidden && valueHasText(section.value));

    return sections.map(section => `${section.label}\n${String(section.value).trim()}`).join('\n\n');
}

function getCardFieldValue(cardData, key) {
    if (key === 'description' || key === 'effect') return buildDescriptionText(cardData);

    const aliases = {
        name: ['name', 'title'],
        title: ['title', 'name'],
        subTitle: ['subTitle', 'subtitle'],
        type: ['type', 'cardType'],
        vida: ['attributes.vida', 'vida'],
        vidaAtual: ['attributes.vidaAtual', 'vidaAtual'],
        mana: ['attributes.mana', 'mana'],
        manaAtual: ['attributes.manaAtual', 'manaAtual'],
        description: ['description', 'effect']
    };
    const paths = aliases[key] || [key];
    for (const path of paths) {
        const value = getValueByPath(cardData, path);
        if (valueHasText(value)) return value;
    }
    return '';
}

function arrayBufferToBase64(buffer) {
    const bytes = buffer instanceof ArrayBuffer
        ? new Uint8Array(buffer)
        : ArrayBuffer.isView(buffer)
            ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
            : null;
    if (!bytes) return '';
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

function getCardImageUrl(cardData) {
    const image = cardData?.image || cardData?.backgroundImage;
    const mimeType = cardData?.imageMimeType || cardData?.backgroundMimeType || 'image/png';
    if (!image) return '';
    if (typeof image === 'string') {
        if (image.startsWith('data:') || image.startsWith('blob:') || image.startsWith('http')) return image;
        return `data:${mimeType};base64,${image}`;
    }

    const bytes = image instanceof ArrayBuffer
        ? new Uint8Array(image)
        : ArrayBuffer.isView(image)
            ? new Uint8Array(image.buffer, image.byteOffset, image.byteLength)
            : null;
    if (!bytes) return '';

    const cacheKey = `${cardData?.id || 'card'}:${mimeType}:${bytes.byteLength}`;
    if (cardImageUrlCache.has(cacheKey)) return cardImageUrlCache.get(cacheKey);
    const blob = new Blob([bytes], { type: mimeType });
    const url = URL.createObjectURL(blob);
    cardImageUrlCache.set(cacheKey, url);
    return url;
}

function getCardColorVars(cardData) {
    const palette = cardData?.predominantColor || {};
    const color = palette.color100
        || palette.colorLight
        || palette.color
        || palette.hex
        || palette.value
        || cardData?.predominantColorHex
        || cardData?.accentColor
        || cardData?.backgroundColor
        || cardData?.color100
        || cardData?.colorLight
        || '#0d9488';
    const light = palette.colorLight || cardData?.colorLight || color;
    const soft = palette.color30 || toRgba(color, 0.3) || 'rgba(13, 148, 136, 0.3)';
    return {
        color,
        light,
        soft,
        lightSoft: toRgba(light, 0.42) || soft
    };
}

function parseCssRgb(value) {
    const raw = String(value || '').trim();
    let match = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (match) {
        const hex = match[1].length === 3
            ? match[1].split('').map(char => char + char).join('')
            : match[1];
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16)
        };
    }
    match = raw.match(/^rgba?\(([^)]+)\)$/i);
    if (!match) return null;
    const parts = match[1].split(/[,\s/]+/).filter(Boolean).slice(0, 3).map(Number);
    if (parts.length < 3 || parts.some(part => !Number.isFinite(part))) return null;
    return { r: parts[0], g: parts[1], b: parts[2] };
}

function toRgba(value, alpha) {
    const rgb = parseCssRgb(value);
    if (!rgb) return '';
    return `rgba(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}, ${alpha})`;
}

function cssUrl(value) {
    const safeValue = String(value).replace(/[)\s"']/g, encodeURIComponent);
    return `url(${safeValue})`;
}

function hydrateArenaModelCode(code, cardData) {
    if (!code || typeof document === 'undefined') return code || '';
    const cardImageUrl = getCardImageUrl(cardData);

    const template = document.createElement('template');
    template.innerHTML = code;
    template.content.querySelectorAll('[data-card-field]').forEach(node => {
        const key = node.getAttribute('data-card-field') || '';
        const value = getCardFieldValue(cardData, key);
        if (value === '') return;
        const main = node.querySelector('.clip-label-main');
        if (main) main.textContent = value;
        else node.textContent = value;
    });

    return template.innerHTML;
}

export function hasArenaModel(cardData) {
    const model = getArenaModel(cardData);
    return Boolean(model?.generatedCode || model?.html || model?.code);
}

function resolveArenaModelSize(model, options = {}) {
    const modelW = Number(model?.canvas?.width || model?.width || 810) || 810;
    const modelH = Number(model?.canvas?.height || model?.height || 1440) || 1440;

    if (!options.isModal && !(Number(options.cardWidth) > 0 && Number(options.cardHeight) > 0)) {
        return { modelW, modelH, finalWidth: modelW, finalHeight: modelH };
    }

    if (Number(options.cardWidth) > 0 && Number(options.cardHeight) > 0) {
        return {
            modelW,
            modelH,
            finalWidth: Number(options.cardWidth),
            finalHeight: Number(options.cardHeight)
        };
    }

    const aspectRatio = modelW / modelH;
    const windowWidth = window.innerWidth || modelW;
    const windowHeight = window.innerHeight || modelH;
    if ((windowWidth / aspectRatio) > windowHeight) {
        const finalHeight = windowHeight * 0.9;
        return { modelW, modelH, finalWidth: finalHeight * aspectRatio, finalHeight };
    }

    const finalWidth = windowWidth * 0.9;
    return { modelW, modelH, finalWidth, finalHeight: finalWidth / aspectRatio };
}

function renderArenaModelHtml(cardData, options = {}) {
    const model = getArenaModel(cardData);
    const code = hydrateArenaModelCode(model?.generatedCode || model?.html || model?.code || '', cardData);
    const { modelW, modelH, finalWidth, finalHeight } = resolveArenaModelSize(model, options);
    const scale = Math.min(finalWidth / modelW, finalHeight / modelH);
    const uniqueId = `arena-model-${cardData?.id || Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const cardImageUrl = getCardImageUrl(cardData);
    const cardColors = getCardColorVars(cardData);
    const imageVar = cardImageUrl ? `--arena-card-image: ${cssUrl(cardImageUrl)};` : '--arena-card-image: none;';
    const colorVars = `--arena-card-color: ${cardColors.color}; --arena-card-color-light: ${cardColors.light}; --arena-card-color-soft: ${cardColors.soft}; --arena-card-color-light-soft: ${cardColors.lightSoft};`;

    return `
        <div id="${uniqueId}" class="arena-model-card w-full h-full relative text-white" style="${imageVar} ${colorVars} transform-origin: top left; width: ${finalWidth}px; height: ${finalHeight}px; margin: 0 auto; background: transparent; overflow: visible;">
            <div class="arena-model-card__scale" style="width:${modelW}px; height:${modelH}px; transform: scale(${scale}); transform-origin: top left;">
                ${code}
            </div>
        </div>
    `;
}

export function renderArenaModelSheet(cardData, isModal, options = {}) {
    const container = options.container || document.getElementById(options.containerId);
    const html = renderArenaModelHtml(cardData, { ...options, isModal });
    if (!isModal) return html;
    if (!container) return html;
    const index = document.getElementsByClassName('visible').length;
    container.style.zIndex = 100000000 + index;

    const closeId = `close-arena-model-${cardData?.id || Date.now()}`;
    container.innerHTML = `
        <button id="${closeId}" class="absolute top-4 right-4 bg-red-600 hover:text-white z-50 thumb-btn">
            <i class="fa-solid fa-xmark"></i>
        </button>
        ${html}
    `;
    container.style.backgroundImage = 'url(icons/fundo.svg)';
    container.style.backgroundSize = 'cover';
    container.style.backgroundPosition = 'center';
    container.classList.remove('hidden');
    setTimeout(() => container.classList.add('visible'), 10);

    const closeSheet = () => {
        container.classList.remove('visible');
        const handler = () => {
            container.classList.add('hidden');
            container.innerHTML = '';
            container.removeEventListener('transitionend', handler);
        };
        container.addEventListener('transitionend', handler);
    };

    container.querySelector(`#${closeId}`)?.addEventListener('click', closeSheet);
    return html;
}
