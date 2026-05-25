const ARENA_MODEL_TEMPLATE_STORAGE_KEY = 'arenaModelTemplates.v1';
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

function safeDomId(value) {
    return safeCssName(value || Date.now()).replace(/^[^a-z]+/, '') || 'card';
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
    if (element.usesArenaCardImage || element.cardImageSource === 'card') return true;
    if (element.cardScaffoldRole === 'container') return true;
    if (element.autoCardScaffold && !element.parentId) return true;
    return false;
}

function getEffectiveChildFillMode(element) {
    if (!element?.parentId) return 'solid';
    if (['parent-content', 'parent-mask-cutout', 'transparent'].includes(element.childFillMode)) return 'transparent';
    if (element.childFillMode === 'gradient') return 'gradient';
    if (element.childFillMode === 'solid') return element.backgroundGradient !== false ? 'gradient' : 'solid';
    if (element.backgroundGradient !== false) return 'gradient';
    return 'solid';
}

function replaceSolidChildColorRules(code, elements) {
    let next = String(code || '');
    (elements || [])
        .filter(element => element?.parentId && getEffectiveChildFillMode(element) === 'solid')
        .forEach(element => {
            const className = cssClassForElement(element);
            const fallback = normalizeHexColor(element.colorA, '#0d9488');
            const blockPattern = new RegExp(`(\\.clip-div\\.${escapeRegExp(className)}::before\\s*\\{[\\s\\S]*?\\n\\})`, 'g');
            next = next.replace(blockPattern, block => {
                let updated = block
                    .replace(/background-color:\s*[^;]+;/, `background-color: ${fallback};`)
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
        .filter(element => element?.parentId && getEffectiveChildFillMode(element) === 'gradient')
        .forEach(element => {
            const className = cssClassForElement(element);
            const parent = (elements || []).find(item => item?.id === element.parentId);
            const parentClassName = parent ? cssClassForElement(parent) : '';
            const parentUsesCardImage = parent ? shouldUseCardImageForElement(parent) : false;
            const fallbackA = normalizeHexColor(element.colorA, '#0d9488');
            const fallbackB = normalizeHexColor(element.colorB, fallbackA);
            const intensity = clampNumber(element.colorImageIntensity ?? 62, 0, 100) / 100;
            const gradientImage = `linear-gradient(145deg, ${hexToRgba(fallbackA, intensity)}, ${hexToRgba(fallbackB, intensity)})`;
            let replacedOverlay = false;

            if (parentClassName) {
                const overlayClassName = `clip-mask-child-color-${className}`;
                const overlayPattern = new RegExp(`(\\.clip-div\\.${escapeRegExp(parentClassName)}\\s*>\\s*\\.${escapeRegExp(overlayClassName)}\\s*\\{[\\s\\S]*?\\n\\})`, 'g');
                next = next.replace(overlayPattern, block => {
                    replacedOverlay = true;
                    return block
                        .replace(/background-color:\s*[^;]+;/, 'background-color: transparent;')
                        .replace(/background-image:\s*[^;]+;/, `background-image: ${gradientImage};`);
                });
            }

            if (replacedOverlay) return;

            const blockPattern = new RegExp(`(\\.clip-div\\.${escapeRegExp(className)}::before\\s*\\{[\\s\\S]*?\\n\\})`, 'g');
            if (parentUsesCardImage) {
                next = next.replace(blockPattern, block => {
                    let updated = block
                        .replace(/background-color:\s*[^;]+;/, 'background-color: transparent;')
                        .replace(/background-image:\s*[^;]+;/, 'background-image: none;');
                    if (/background:\s*[^;]+;/.test(updated)) {
                        updated = updated.replace(/background:\s*[^;]+;/, 'background: transparent;');
                    }
                    return setCssProperty(updated, 'opacity', '0');
                });
                return;
            }

            next = next.replace(blockPattern, block => {
                let updated = block
                    .replace(/background-color:\s*[^;]+;/, 'background-color: transparent;')
                    .replace(/background-image:\s*[^;]+;/, `background-image: ${gradientImage};`);
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

function hexToRgba(value, alpha = 1) {
    const hex = normalizeHexColor(value, '#0d9488').slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${formatNumber(clampNumber(alpha, 0, 1))})`;
}

function setCssProperty(block, property, value) {
    const pattern = new RegExp(`(${escapeRegExp(property)}\\s*:\\s*)[^;]+;`, 'i');
    if (pattern.test(block)) return block.replace(pattern, `$1${value};`);
    return block.replace(/\n\}/, `\n  ${property}: ${value};\n}`);
}

function replaceCssRuleBlock(code, selectorPattern, updater) {
    const pattern = new RegExp(`(${selectorPattern}\\s*\\{[\\s\\S]*?\\n\\})`, 'g');
    return String(code || '').replace(pattern, block => updater(block));
}

function getLabelIconSize(element) {
    const fallback = Math.max(64, clampNumber(element?.labelSize || 16, 10, 48) * 4);
    return clampNumber(element?.labelIconSize ?? fallback, 24, 260);
}

function restoreLabelStyleRules(code, elements) {
    let next = String(code || '');
    (elements || []).forEach(element => {
        if (!element || typeof element !== 'object') return;
        const className = escapeRegExp(cssClassForElement(element));
        const baseSelector = `\\.clip-div\\.${className}\\s*>\\s*`;
        const labelColor = normalizeHexColor(element.labelColor, '#f8fbff');
        const labelSize = `${formatNumber(clampNumber(element.labelSize || 16, 8, 96))}px`;
        const extraColor = normalizeHexColor(element.labelExtraColor, labelColor);
        const extraSize = `${formatNumber(clampNumber(element.labelExtraSize || 13, 8, 72))}px`;
        const iconColor = normalizeHexColor(element.labelIconColor, labelColor);
        const iconSize = `${formatNumber(getLabelIconSize(element))}px`;
        const iconOpacity = formatNumber(clampNumber(element.labelIconOpacity ?? 22, 0, 100) / 100);
        const labelWeight = element.labelBold === false ? '500' : '800';
        const extraWeight = element.labelExtraBold ? '800' : '650';

        next = replaceCssRuleBlock(next, `${baseSelector}\\.clip-label-bg-icon`, block => {
            let updated = setCssProperty(block, 'color', iconColor);
            updated = setCssProperty(updated, 'font-size', iconSize);
            return setCssProperty(updated, 'opacity', iconOpacity);
        });
        next = replaceCssRuleBlock(next, `${baseSelector}\\.clip-label`, block => {
            let updated = setCssProperty(block, 'color', labelColor);
            return setCssProperty(updated, 'font-size', labelSize);
        });
        next = replaceCssRuleBlock(next, `${baseSelector}\\.clip-label\\s*>\\s*\\.clip-label-main`, block => {
            let updated = setCssProperty(block, 'color', labelColor);
            updated = setCssProperty(updated, 'font-size', labelSize);
            return setCssProperty(updated, 'font-weight', labelWeight);
        });
        next = replaceCssRuleBlock(next, `${baseSelector}\\.clip-label\\s*>\\s*\\.clip-label-extra`, block => {
            let updated = setCssProperty(block, 'color', extraColor);
            updated = setCssProperty(updated, 'font-size', extraSize);
            return setCssProperty(updated, 'font-weight', extraWeight);
        });
    });
    return next;
}

function restoreChildLayeringRules(code, elements) {
    let next = String(code || '');
    (elements || [])
        .filter(element => element?.parentId)
        .forEach(element => {
            next = replaceCssRuleBlock(next, `\\.clip-div\\.${escapeRegExp(cssClassForElement(element))}`, block => (
                setCssProperty(block, 'z-index', '5')
            ));
        });
    return next;
}

function restoreTransparentChildRules(code, elements) {
    let next = String(code || '');
    (elements || [])
        .filter(element => element?.parentId && getEffectiveChildFillMode(element) === 'transparent')
        .forEach(element => {
            const className = cssClassForElement(element);
            const escapedClassName = escapeRegExp(className);
            const parent = (elements || []).find(item => item?.id === element.parentId);
            const parentClassName = parent ? cssClassForElement(parent) : '';

            next = replaceCssRuleBlock(next, `\\.clip-div\\.${escapedClassName}::before`, block => {
                let updated = block
                    .replace(/\n\s*background-color:\s*[^;]+;/gi, '')
                    .replace(/\n\s*background-image:\s*[^;]+;/gi, '');
                updated = setCssProperty(updated, 'background', 'transparent');
                return setCssProperty(updated, 'opacity', '0');
            });

            if (!parentClassName) return;
            const overlayClassName = `clip-mask-child-color-${className}`;
            next = replaceCssRuleBlock(next, `\\.clip-div\\.${escapeRegExp(parentClassName)}\\s*>\\s*\\.${escapeRegExp(overlayClassName)}`, block => {
                let updated = setCssProperty(block, 'display', 'none');
                updated = setCssProperty(updated, 'background-color', 'transparent');
                updated = setCssProperty(updated, 'background-image', 'none');
                return setCssProperty(updated, 'opacity', '0');
            });
        });
    return next;
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
    const copy = typeof structuredClone === 'function'
        ? structuredClone(model)
        : JSON.parse(JSON.stringify(model));
    copy.app = copy.app || 'arena-card-model';
    copy.version = Math.max(2, Number(copy.version || 1));
    copy.schemaVersion = Math.max(2, Number(copy.schemaVersion || copy.version || 1));
    copy.renderHints = {
        dynamicCardImage: true,
        cardImageVariable: '--arena-card-image',
        childImageMasks: true,
        scopedCssInSheet: true,
        ...(copy.renderHints && typeof copy.renderHints === 'object' ? copy.renderHints : {})
    };

    const cardImageBackgrounds = new Set();
    const sourceRootId = copy.sourceRootId || '';
    if (Array.isArray(copy.elements)) {
        copy.elements.forEach(element => {
            if (!element || typeof element !== 'object') return;
            if (shouldUseCardImageForElement(element, sourceRootId)) {
                element.usesArenaCardImage = true;
                element.cardImageSource = 'card';
                if (element.backgroundImage) cardImageBackgrounds.add(element.backgroundImage);
                element.backgroundImage = '';
                element.backgroundImageName = '';
            }
        });
    }

    ['generatedCode', 'html', 'code'].forEach(key => {
        if (typeof copy[key] === 'string') {
            copy[key] = replaceSpecificBackgroundImagesInCode(copy[key], cardImageBackgrounds, 'var(--arena-card-image, none)');
            copy[key] = replaceSolidChildColorRules(copy[key], copy.elements);
            copy[key] = replaceGradientChildColorRules(copy[key], copy.elements);
            copy[key] = restoreTransparentChildRules(copy[key], copy.elements);
            copy[key] = restoreChildLayeringRules(copy[key], copy.elements);
            copy[key] = restoreLabelStyleRules(copy[key], copy.elements);
        }
    });

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

function rawImageToUrl(raw, mimeType = 'image/png') {
    if (!raw) return '';
    if (typeof raw === 'string') {
        const value = raw.trim();
        if (!value) return '';
        if (value.startsWith('data:') || value.startsWith('blob:') || /^https?:\/\//i.test(value)) return value;
        if (/^[a-z0-9+/=\s]+$/i.test(value) && value.length > 32) {
            return `data:${mimeType || 'image/png'};base64,${value.replace(/\s+/g, '')}`;
        }
        return '';
    }
    if (typeof Blob !== 'undefined' && raw instanceof Blob) {
        try { return URL.createObjectURL(raw); } catch (error) { return ''; }
    }
    if (raw && typeof raw === 'object' && !(raw instanceof ArrayBuffer) && !ArrayBuffer.isView(raw)) {
        const nestedMime = raw.mimeType || raw.type || raw.contentType || mimeType;
        const nested = raw.dataUrl || raw.dataURL || raw.src || raw.url || raw.base64 || raw.data || raw.buffer || raw.value;
        if (nested && nested !== raw) return rawImageToUrl(nested, nestedMime);
    }
    const base64 = arrayBufferToBase64(raw);
    return base64 ? `data:${mimeType || 'image/png'};base64,${base64}` : '';
}

function getCardImageUrl(cardData) {
    if (!cardData) return '';
    const entries = [
        ['image', cardData.imageMimeType || cardData.mimeType || cardData.type],
        ['imageData', cardData.imageDataMimeType || cardData.imageMimeType],
        ['imageBase64', cardData.imageMimeType],
        ['imageUrl', cardData.imageMimeType],
        ['imageSrc', cardData.imageMimeType],
        ['cardImage', cardData.cardImageMimeType || cardData.imageMimeType],
        ['cardImageData', cardData.cardImageMimeType || cardData.imageMimeType],
        ['coverImage', cardData.coverImageMimeType || cardData.imageMimeType],
        ['thumbnail', cardData.thumbnailMimeType || cardData.imageMimeType],
        ['thumb', cardData.thumbnailMimeType || cardData.imageMimeType],
        ['backgroundImage', cardData.backgroundMimeType || cardData.backgroundImageMimeType],
        ['backgroundImageData', cardData.backgroundMimeType || cardData.backgroundImageMimeType],
        ['enhanceImage', cardData.enhanceImageMimeType],
        ['trueImage', cardData.trueImageMimeType]
    ];
    for (const [key, mimeType] of entries) {
        const raw = cardData[key];
        if (!raw) continue;
        const bytes = raw instanceof ArrayBuffer
            ? new Uint8Array(raw)
            : ArrayBuffer.isView(raw)
                ? new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
                : null;
        if (bytes && typeof Blob !== 'undefined') {
            const type = mimeType || 'image/png';
            const cacheKey = `${cardData?.id || 'card'}:${key}:${type}:${bytes.byteLength}`;
            if (cardImageUrlCache.has(cacheKey)) return cardImageUrlCache.get(cacheKey);
            const url = URL.createObjectURL(new Blob([bytes], { type }));
            cardImageUrlCache.set(cacheKey, url);
            return url;
        }
        const url = rawImageToUrl(raw, mimeType || 'image/png');
        if (url) return url;
    }
    return '';
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

function scopeCssSelectorList(selectorText, scopeSelector) {
    return String(selectorText || '')
        .split(',')
        .map(selector => {
            const trimmed = selector.trim();
            if (!trimmed) return '';
            if (trimmed.startsWith(scopeSelector)) return trimmed;
            if (/^(from|to|\d+(?:\.\d+)?%)$/i.test(trimmed)) return trimmed;
            return `${scopeSelector} ${trimmed}`;
        })
        .filter(Boolean)
        .join(', ');
}

function scopeArenaModelCss(css, scopeSelector) {
    return String(css || '').replace(/(^|})\s*([^{}@][^{}]*)\{/g, (match, close, selectors) => {
        const selectorText = String(selectors || '').trim();
        if (!selectorText) return match;
        return `${close}\n${scopeCssSelectorList(selectorText, scopeSelector)} {`;
    });
}

function hydrateArenaModelCode(code, cardData, scopeId = '') {
    if (!code || typeof document === 'undefined') return code || '';

    const template = document.createElement('template');
    template.innerHTML = code;
    const scopeSelector = scopeId ? `#${scopeId}` : '';
    if (scopeSelector) {
        template.content.querySelectorAll('style').forEach(style => {
            style.textContent = scopeArenaModelCss(style.textContent || '', scopeSelector);
        });
        template.content.querySelectorAll('.clip-stage').forEach(stage => {
            stage.setAttribute('data-arena-model-scope', scopeId);
        });
    }
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
    const uniqueId = `arena-model-${safeDomId(cardData?.id || cardData?.name || cardData?.title)}-${Math.random().toString(36).slice(2, 7)}`;
    const code = hydrateArenaModelCode(model?.generatedCode || model?.html || model?.code || '', cardData, uniqueId);
    const { modelW, modelH, finalWidth, finalHeight } = resolveArenaModelSize(model, options);
    const scale = Math.min(finalWidth / modelW, finalHeight / modelH);
    const cardImageUrl = getCardImageUrl(cardData);
    const cardColors = getCardColorVars(cardData);
    const imageVar = cardImageUrl ? `--arena-card-image: ${cssUrl(cardImageUrl)};` : '--arena-card-image: none;';
    const colorVars = `--arena-card-color: ${cardColors.color}; --arena-card-color-light: ${cardColors.light}; --arena-card-color-soft: ${cardColors.soft}; --arena-card-color-light-soft: ${cardColors.lightSoft};`;

    return `
        <div id="${uniqueId}" class="arena-model-card w-full h-full relative text-white" data-arena-image="${cardImageUrl ? 'ready' : 'missing'}" data-arena-model-version="${model?.schemaVersion || model?.version || 1}" style="${imageVar} ${colorVars} transform-origin: top left; width: ${finalWidth}px; height: ${finalHeight}px; margin: 0 auto; background: transparent; overflow: visible;">
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
