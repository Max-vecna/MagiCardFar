import { applyDarkModalBackdrop, shrinkExpandedCardSize } from './ui-utils.js';

const ARENA_MODEL_TEMPLATE_STORAGE_KEY = 'arenaModelTemplates.v1';
const ARENA_BASE_LAYOUT_MAGIC_URL = './data-arena-base-layout.json';
const cardImageUrlCache = new Map();
let arenaModelTemplatesCache = null;
let arenaBaseLayoutTemplatesCache = null;
let arenaBaseLayoutTemplatesPromise = null;

const ARENA_TEMPLATE_TYPE_ALIASES = {
    magia: 'magic',
    magic: 'magic',
    spell: 'magic',
    rpgspells: 'magic',
    item: 'item',
    itens: 'item',
    arma: 'item',
    armadura: 'item',
    rpgitems: 'item',
    habilidade: 'skill',
    skill: 'skill',
    efeito: 'skill',
    effect: 'skill',
    rpgeffects: 'skill',
    ataque: 'attack',
    attack: 'attack',
    rpgattacks: 'attack',
    personagem: 'character',
    character: 'character',
    ficha: 'character',
    rpgcards: 'character',
    criatura: 'creature',
    creature: 'creature',
    monstro: 'creature'
};

const ARENA_STORE_TEMPLATE_KEYS = {
    rpgeffects: 'skill',
    rpgitems: 'item',
    rpgcards: 'character',
    rpgspells: 'magic',
    rpgattacks: 'attack'
};

const ARENA_TEMPLATE_TYPE_LABELS = {
    magic: 'Magia',
    item: 'Item',
    skill: 'Habilidade',
    attack: 'Ataque',
    character: 'Personagem',
    creature: 'Criatura'
};

const ARENA_SHARED_LAYOUT_TEMPLATE_KEYS = ['magic', 'skill', 'attack'];

const ARENA_SHARED_LAYOUT_FALLBACKS = {
    magic: ['skill', 'attack'],
    skill: ['magic', 'attack'],
    attack: ['magic', 'skill']
};

const RECEIVER_ICON_CLASS_BY_TYPE = {
    'padrao/magia': 'ra-sun',
    'padrao/habilidade': 'ra-burst-blob',
    'padrao/item': 'ra-pawn',
    'padrao/ataque': 'ra-axe-swing',
    'padrao/atributos': 'ra-jigsaw-piece',
    'padrao/medicina': 'ra-bottle-vapors',
    'padrao/combate': 'ra-axe-swing',
    'padrao/texto': 'ra-quill-ink',
    'modificar/magia': 'ra-sun',
    'modificar/habilidade': 'ra-burst-blob',
    'modificar/item': 'ra-pawn',
    'modificar/ataque': 'ra-axe-swing',
    'modificar/atributos': 'ra-jigsaw-piece',
    'modificar/medicina': 'ra-bottle-vapors',
    'modificar/combate': 'ra-axe-swing',
    'modificar/texto': 'ra-quill-ink',
    padrao: 'ra-cog',
    default: 'ra-cog',
    cog: 'ra-cog',
    modificador: 'ra-wrench',
    modificar: 'ra-wrench',
    modifier: 'ra-wrench',
    wrench: 'ra-wrench',
    cura: 'ra-bottle-vapors',
    vida: 'ra-bottle-vapors',
    heal: 'ra-bottle-vapors',
    mana: 'ra-bottle-vapors',
    medicina: 'ra-bottle-vapors',
    medicine: 'ra-bottle-vapors',
    medical: 'ra-bottle-vapors',
    restaurar: 'ra-bottle-vapors',
    'restaurar-mana': 'ra-bottle-vapors',
    magia: 'ra-sun',
    magic: 'ra-sun',
    spell: 'ra-sun',
    habilidade: 'ra-burst-blob',
    skill: 'ra-burst-blob',
    item: 'ra-pawn',
    itens: 'ra-pawn',
    ataque: 'ra-axe-swing',
    attack: 'ra-axe-swing',
    combate: 'ra-axe-swing',
    combat: 'ra-axe-swing',
    atributos: 'ra-jigsaw-piece',
    atributo: 'ra-jigsaw-piece',
    attributes: 'ra-jigsaw-piece',
    texto: 'ra-quill-ink',
    text: 'ra-quill-ink',
    descricao: 'ra-quill-ink',
    description: 'ra-quill-ink'
};

const RECEIVER_ICON_CLASSES = new Set(Object.values(RECEIVER_ICON_CLASS_BY_TYPE));

const RECEIVER_ICON_CLASS_BY_MODE = {
    padrao: 'ra-cog',
    modificar: 'ra-wrench'
};

const RECEIVER_ICON_CLASS_BY_TARGET = {
    magia: 'ra-sun',
    habilidade: 'ra-burst-blob',
    item: 'ra-pawn',
    ataque: 'ra-axe-swing',
    atributos: 'ra-jigsaw-piece',
    medicina: 'ra-bottle-vapors',
    combate: 'ra-axe-swing',
    texto: 'ra-quill-ink',
    vida: 'ra-bottle-vapors',
    mana: 'ra-bottle-vapors'
};

const RECEIVER_ICON_ROLE_ALIASES = {
    padrao: 'padrao',
    default: 'padrao',
    base: 'padrao',
    modificar: 'modificar',
    modificador: 'modificar',
    modifier: 'modificar',
    mod: 'modificar'
};

const RECEIVER_ICON_TARGET_ALIASES = {
    magia: 'magia',
    magic: 'magia',
    spell: 'magia',
    vida: 'medicina',
    cura: 'medicina',
    heal: 'medicina',
    health: 'medicina',
    mana: 'medicina',
    restaurar: 'medicina',
    'restaurar-mana': 'medicina',
    medicina: 'medicina',
    medicine: 'medicina',
    medical: 'medicina',
    habilidade: 'habilidade',
    skill: 'habilidade',
    item: 'item',
    itens: 'item',
    ataque: 'ataque',
    attack: 'ataque',
    combate: 'combate',
    combat: 'combate',
    atributos: 'atributos',
    atributo: 'atributos',
    attributes: 'atributos',
    abilidade: 'habilidade',
    texto: 'texto',
    text: 'texto',
    descricao: 'texto',
    description: 'texto'
};

const RECEIVER_ICON_SLOT_ALIASES = {
    mode: 'mode',
    modo: 'mode',
    tipo: 'mode',
    role: 'mode',
    target: 'target',
    alvo: 'target',
    categoria: 'target',
    kind: 'target',
    free: 'free',
    livre: 'free',
    custom: 'free',
    personalizado: 'free'
};

const DESCRIPTION_HIGHLIGHT_PATTERN = /\b(aprimorar|descri[cç][aã]o|verdadeiro)\b/gi;

function normalizeArenaTemplateKey(value) {
    const key = String(value || '').trim().toLowerCase();
    return ARENA_TEMPLATE_TYPE_ALIASES[key] || '';
}

function uniqueArenaTemplateKeys(values) {
    const seen = new Set();
    const keys = [];
    (values || []).forEach(value => {
        const key = normalizeArenaTemplateKey(value);
        if (!key || seen.has(key)) return;
        seen.add(key);
        keys.push(key);
    });
    return keys;
}

function getDefaultCompatibleArenaTemplateKeys(key) {
    const normalized = normalizeArenaTemplateKey(key);
    if (!normalized) return [];
    if (ARENA_SHARED_LAYOUT_TEMPLATE_KEYS.includes(normalized)) {
        return [...ARENA_SHARED_LAYOUT_TEMPLATE_KEYS];
    }
    return [normalized];
}

function getCompatibleArenaTemplateKeys(model, key = '') {
    const allowedKeys = getDefaultCompatibleArenaTemplateKeys(key);
    if (allowedKeys.length <= 1) return allowedKeys;
    return uniqueArenaTemplateKeys([
        ...getDefaultCompatibleArenaTemplateKeys(key),
        ...(Array.isArray(model?.compatibleTemplateTypes) ? model.compatibleTemplateTypes : []),
        ...(Array.isArray(model?.templateTargets) ? model.templateTargets : []),
        ...(Array.isArray(model?._arenaTemplateTargets) ? model._arenaTemplateTargets : [])
    ]).filter(templateKey => allowedKeys.includes(templateKey));
}

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

function normalizeReceiverIconKey(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\\/g, '/')
        .replace(/\s*\/\s*/g, '/')
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function normalizeReceiverIconType(value) {
    const key = normalizeReceiverIconKey(value);
    if (!key || key.startsWith('ra-')) return '';

    if (key.includes('/')) {
        const [roleRaw, targetRaw] = key.split('/');
        const role = RECEIVER_ICON_ROLE_ALIASES[roleRaw] || '';
        const target = RECEIVER_ICON_TARGET_ALIASES[targetRaw] || '';
        return role && target ? `${role}/${target}` : '';
    }

    for (const [roleRaw, role] of Object.entries(RECEIVER_ICON_ROLE_ALIASES)) {
        const prefix = `${roleRaw}-`;
        if (!key.startsWith(prefix)) continue;
        const target = RECEIVER_ICON_TARGET_ALIASES[key.slice(prefix.length)] || '';
        if (target) return `${role}/${target}`;
    }

    return RECEIVER_ICON_ROLE_ALIASES[key] || RECEIVER_ICON_TARGET_ALIASES[key] || key;
}

function normalizeRpgIconClass(value) {
    const raw = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!raw || raw === 'none' || raw === 'sem icone') return '';
    const className = (raw.match(/(?:^|\s)(ra-[a-z0-9-]+)(?:\s|$)/)?.[1] || raw.replace(/^ra\s+/, ''));
    const icon = className.startsWith('ra-') ? className : `ra-${className}`;
    return /^ra-[a-z0-9-]+$/.test(icon) ? icon : '';
}

function normalizeReceiverIconClass(value) {
    const key = normalizeReceiverIconKey(value);
    if (!key) return '';
    const iconClass = key.startsWith('ra-') ? key : `ra-${key}`;
    if (key.startsWith('ra-') || RECEIVER_ICON_CLASSES.has(iconClass)) return iconClass;
    const receiverType = normalizeReceiverIconType(key);
    return RECEIVER_ICON_CLASS_BY_TYPE[receiverType] || RECEIVER_ICON_CLASS_BY_TYPE[key.replace(/^ra-/, '')] || '';
}

function getCardReceiverIconType(cardData) {
    return cardData?.receiverIconType
        || cardData?.receiverIcon
        || cardData?.iconReceiverType
        || cardData?.iconType;
}

function getCardReceiverIconClass(cardData) {
    return normalizeReceiverIconClass(getCardReceiverIconType(cardData));
}

function getCardReceiverIconState(cardData) {
    const type = normalizeReceiverIconType(getCardReceiverIconType(cardData));
    const [typeMode, typeTarget] = type.includes('/') ? type.split('/') : ['', ''];
    const mode = RECEIVER_ICON_ROLE_ALIASES[normalizeReceiverIconKey(cardData?.receiverIconMode || cardData?.iconReceiverMode)] || typeMode || '';
    const target = RECEIVER_ICON_TARGET_ALIASES[normalizeReceiverIconKey(cardData?.receiverIconTarget || cardData?.iconReceiverTarget)] || typeTarget || '';
    const freeClass = normalizeRpgIconClass(cardData?.receiverIconFree || cardData?.receiverIconClass || cardData?.iconReceiverFree || '');

    return {
        mode,
        target,
        freeClass,
        type: mode && target ? `${mode}/${target}` : type
    };
}

function normalizeReceiverIconSlot(value) {
    return RECEIVER_ICON_SLOT_ALIASES[normalizeReceiverIconKey(value)] || '';
}

function getReceiverIconClassForSlot(slot, receiverState) {
    const normalizedSlot = normalizeReceiverIconSlot(slot);
    if (normalizedSlot === 'mode') return RECEIVER_ICON_CLASS_BY_MODE[receiverState?.mode] || '';
    if (normalizedSlot === 'target') return RECEIVER_ICON_CLASS_BY_TARGET[receiverState?.target] || '';
    if (normalizedSlot === 'free') return receiverState?.freeClass || '';
    return '';
}

function setRpgAwesomeIconClass(icon, iconClass) {
    if (!icon?.classList || !iconClass) return;
    Array.from(icon.classList).forEach(className => {
        if (/^ra-[a-z0-9-]+$/.test(className)) icon.classList.remove(className);
    });
    icon.classList.add('ra', iconClass);
}

function getReceiverOptionType(node) {
    if (!node?.getAttribute) return '';
    return normalizeReceiverIconType(
        node.getAttribute('data-icon-option-type')
        || node.querySelector?.('[data-icon-option-type]')?.getAttribute('data-icon-option-type')
        || ''
    );
}

function receiverOptionTypeMatches(optionType, receiverType) {
    const option = normalizeReceiverIconType(optionType);
    const target = normalizeReceiverIconType(receiverType);
    if (!option || !target) return false;
    if (option === target) return true;
    if (!option.includes('/') && target.includes('/')) {
        const [role, kind] = target.split('/');
        return option === role || option === kind;
    }
    return false;
}

function applyReceiverIconClass(root, iconClass, receiverType = '') {
    if (!root || !iconClass) return;
    const receiverNodes = Array.from(root.querySelectorAll('[data-icon-receiver="1"]'));
    const normalizedReceiverType = normalizeReceiverIconType(receiverType);
    const hasSpecificReceiverOptions = receiverNodes.some(node => getReceiverOptionType(node).includes('/'));
    const targetNodes = hasSpecificReceiverOptions && normalizedReceiverType
        ? receiverNodes.filter(node => receiverOptionTypeMatches(getReceiverOptionType(node), receiverType))
        : receiverNodes;

    targetNodes.forEach(node => {
        const icons = node.matches?.('i')
            ? [node]
            : Array.from(node.querySelectorAll('i.ra, .ra'));
        icons.forEach(icon => setRpgAwesomeIconClass(icon, iconClass));
    });
}

function applyReceiverIconClasses(root, cardData) {
    if (!root) return;
    const receiverState = getCardReceiverIconState(cardData);
    const legacyIconClass = getCardReceiverIconClass(cardData);

    Array.from(root.querySelectorAll('[data-icon-receiver="1"]')).forEach(node => {
        const slot = normalizeReceiverIconSlot(node.getAttribute('data-icon-receiver-slot') || '');
        const iconClass = slot
            ? getReceiverIconClassForSlot(slot, receiverState)
            : legacyIconClass;
        if (!iconClass) return;

        const icons = node.matches?.('i')
            ? [node]
            : Array.from(node.querySelectorAll('i.ra, .ra'));
        icons.forEach(icon => setRpgAwesomeIconClass(icon, iconClass));
    });
}

function isDescriptionHighlightField(key) {
    return ['description', 'effect'].includes(String(key || '').trim());
}

function appendDescriptionHighlightText(target, value) {
    if (!target || typeof document === 'undefined') return;
    const text = String(value ?? '');
    target.replaceChildren();
    let cursor = 0;
    text.replace(DESCRIPTION_HIGHLIGHT_PATTERN, (match, _word, offset) => {
        if (offset > cursor) target.appendChild(document.createTextNode(text.slice(cursor, offset)));
        const span = document.createElement('span');
        span.className = 'label-description-keyword';
        span.textContent = match;
        target.appendChild(span);
        cursor = offset + match.length;
        return match;
    });
    if (cursor < text.length) target.appendChild(document.createTextNode(text.slice(cursor)));
}

function cssClassForElement(element) {
    return `clip-${safeCssName(element?.name)}-${safeCssName(element?.id)}`;
}

function applyArenaModelElementBindings(root, model) {
    if (!root || !Array.isArray(model?.elements)) return;
    model.elements.forEach(element => {
        const fieldKey = String(element?.cardFieldKey || '').trim();
        if (!fieldKey) return;
        const className = cssClassForElement(element);
        const label = root.querySelector(`.clip-div.${className} > .clip-label`);
        if (!label) return;

        label.setAttribute('data-card-field', fieldKey);
        if (element.cardTitleMetaMode && !element.labelExtraHidden) {
            label.setAttribute('data-card-title-meta', String(element.cardTitleMetaMode));
        } else {
            label.removeAttribute('data-card-title-meta');
        }
    });
}

function normalizeHexColor(value, fallback = '#0d9488') {
    const raw = String(value || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
    if (/^#[0-9a-f]{3}$/i.test(raw)) {
        return `#${raw.slice(1).split('').map(char => char + char).join('')}`;
    }
    return fallback;
}

function rgbToHex(r, g, b) {
    return `#${[r, g, b].map(value => clampNumber(Math.round(value), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

function lightenCssColor(value, amount = 0.38) {
    const rgb = parseCssRgb(value);
    if (!rgb) return normalizeHexColor(value, '');
    const weight = clampNumber(amount, 0, 1);
    return rgbToHex(
        rgb.r + (255 - rgb.r) * weight,
        rgb.g + (255 - rgb.g) * weight,
        rgb.b + (255 - rgb.b) * weight
    );
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

function getImageBackdropImageCss(element) {
    const image = String(element?.imageBgImage || '').trim();
    return image ? `url("${cssString(image)}")` : 'none';
}

function hasImageBackdropImage(element) {
    return Boolean(String(element?.imageBgImage || '').trim());
}

function getEffectiveChildFillMode(element) {
    if (!element?.parentId) return 'solid';
    if (['parent-content', 'parent-mask-cutout', 'transparent'].includes(element.childFillMode)) return 'transparent';
    if (element.childFillMode === 'gradient') return 'gradient';
    if (element.childFillMode === 'solid') return element.backgroundGradient !== false ? 'gradient' : 'solid';
    if (element.backgroundGradient !== false) return 'gradient';
    return 'solid';
}

function getBackdropBlur(element) {
    return clampNumber(element?.backdropBlur ?? 0, 0, 80);
}

function cardColorVar(fallback = '#0d9488') {
    return `var(--arena-card-color, ${normalizeHexColor(fallback, '#0d9488')})`;
}

function cardLightColorVar(fallback = '#5eead4') {
    const lightFallback = lightenCssColor(fallback, 0.38) || normalizeHexColor(fallback, '#5eead4');
    return `var(--arena-card-color-light, ${lightFallback})`;
}

function cardSoftColorVar(fallback, alpha, variableName) {
    return `var(${variableName}, ${hexToRgba(fallback, alpha)})`;
}

function replaceImageBackdropColorRules(code, elements, sourceRootId = '') {
    let next = String(code || '');
    (elements || [])
        .filter(element => shouldUseCardImageForElement(element, sourceRootId))
        .forEach(element => {
            const className = escapeRegExp(cssClassForElement(element));
            const fallback = normalizeHexColor(element.parentBgColor || element.colorA, '#0d9488');
            const dynamicColor = cardColorVar(fallback);

            next = replaceCssRuleBlock(next, `\\.clip-div\\.${className}\\s*>\\s*\\.clip-image-color-bg`, block => {
                let updated = setCssProperty(block, 'background-color', hasImageBackdropImage(element) ? 'transparent' : dynamicColor);
                updated = setCssProperty(updated, 'background-image', getImageBackdropImageCss(element));
                updated = setCssProperty(updated, 'background-size', 'cover');
                updated = setCssProperty(updated, 'background-position', 'center');
                return setCssProperty(updated, 'background-repeat', 'no-repeat');
            });
            next = replaceCssRuleBlock(next, `\\.clip-div\\.${className}\\s*>\\s*\\.clip-parent-bg`, block => (
                setCssProperty(block, 'background', dynamicColor)
            ));
        });
    return next;
}

function replaceSolidChildColorRules(code, elements) {
    let next = String(code || '');
    (elements || [])
        .filter(element => element?.parentId && getEffectiveChildFillMode(element) === 'solid')
        .forEach(element => {
            const className = cssClassForElement(element);
            const fallback = normalizeHexColor(element.colorA, '#0d9488');
            const dynamicColor = cardColorVar(fallback);
            const blockPattern = new RegExp(`(\\.clip-div\\.${escapeRegExp(className)}::before\\s*\\{[\\s\\S]*?\\n\\})`, 'g');
            next = next.replace(blockPattern, block => {
                let updated = block
                    .replace(/background-color:\s*[^;]+;/, `background-color: ${dynamicColor};`)
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
            const gradientImage = `linear-gradient(145deg, ${cardSoftColorVar(fallbackA, intensity, '--arena-card-color-soft')}, ${cardSoftColorVar(fallbackB, intensity, '--arena-card-color-light-soft')})`;
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
                    const hasBackdropBlur = getBackdropBlur(element) > 0;
                    let updated = block
                        .replace(/background-color:\s*[^;]+;/, 'background-color: transparent;')
                        .replace(/background-image:\s*[^;]+;/, 'background-image: none;');
                    if (/background:\s*[^;]+;/.test(updated)) {
                        updated = updated.replace(/background:\s*[^;]+;/, 'background: transparent;');
                    }
                    if (hasBackdropBlur) updated = setCssProperty(updated, 'background-color', 'rgba(255,255,255,0.01)');
                    return setCssProperty(updated, 'opacity', hasBackdropBlur ? '1' : '0');
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

function getLabelIconShadowColor(element) {
    return normalizeHexColor(element?.labelIconShadowColor, '#000000');
}

function getLabelIconShadowOpacity(element) {
    return clampNumber(element?.labelIconShadowOpacity ?? 75, 0, 100);
}

function getLabelIconShadowX(element) {
    return clampNumber(element?.labelIconShadowX ?? 2, -80, 80);
}

function getLabelIconShadowY(element) {
    return clampNumber(element?.labelIconShadowY ?? 4, -80, 80);
}

function getLabelIconShadowBlur(element) {
    return clampNumber(element?.labelIconShadowBlur ?? 6, 0, 120);
}

function getLabelIconGlowColor(element, fallback = '#ff7070') {
    return normalizeHexColor(element?.labelIconGlowColor, fallback);
}

function getLabelIconGlowSize(element) {
    return clampNumber(element?.labelIconGlowSize ?? 0, 0, 120);
}

function getLabelIconGlowOpacity(element) {
    return clampNumber(element?.labelIconGlowOpacity ?? 0, 0, 100);
}

function getLabelIconBrightness(element) {
    return clampNumber(element?.labelIconBrightness ?? 100, 40, 180);
}

function buildLabelIconFilter(element, glowFallback = '#ff7070') {
    const shadow = hexToRgba(getLabelIconShadowColor(element), getLabelIconShadowOpacity(element) / 100);
    const glow = hexToRgba(getLabelIconGlowColor(element, glowFallback), getLabelIconGlowOpacity(element) / 100);
    return [
        `drop-shadow(${formatNumber(getLabelIconShadowX(element))}px ${formatNumber(getLabelIconShadowY(element))}px ${formatNumber(getLabelIconShadowBlur(element))}px ${shadow})`,
        `drop-shadow(0 0 ${formatNumber(getLabelIconGlowSize(element))}px ${glow})`,
        `brightness(${formatNumber(getLabelIconBrightness(element) / 100)})`
    ].join(' ');
}

function getSolidBackgroundLabelIconFallbackColor(element) {
    if (!element) return '';
    const hasSolidFill = element.parentId
        ? getEffectiveChildFillMode(element) === 'solid'
        : element.backgroundGradient === false;
    return hasSolidFill ? normalizeHexColor(element.colorA, '') : '';
}

function hasCustomLabelIconColor(element) {
    return Boolean(element?.labelIconColorCustom);
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
        const solidIconFallback = getSolidBackgroundLabelIconFallbackColor(element);
        const iconFallback = normalizeHexColor(element.labelIconColor, labelColor);
        const iconColor = hasCustomLabelIconColor(element)
            ? iconFallback
            : (solidIconFallback ? cardLightColorVar(solidIconFallback) : cardLightColorVar(iconFallback));
        const iconSize = `${formatNumber(getLabelIconSize(element))}px`;
        const iconOpacity = formatNumber((solidIconFallback ? 100 : clampNumber(element.labelIconOpacity ?? 22, 0, 100)) / 100);
        const iconFilter = buildLabelIconFilter(element, iconFallback);
        const labelWeight = element.labelBold === false ? '500' : '800';
        const extraWeight = element.labelExtraBold ? '800' : '650';

        next = replaceCssRuleBlock(next, `${baseSelector}\\.clip-label-bg-icon`, block => {
            let updated = setCssProperty(block, 'color', iconColor);
            updated = setCssProperty(updated, 'font-size', iconSize);
            updated = setCssProperty(updated, 'opacity', iconOpacity);
            updated = setCssProperty(updated, 'filter', iconFilter);
            return setCssProperty(updated, 'z-index', '11');
        });
        next = replaceCssRuleBlock(next, `${baseSelector}\\.clip-label-custom-icon`, block => {
            let updated = setCssProperty(block, 'color', iconColor);
            updated = setCssProperty(updated, 'font-size', iconSize);
            updated = setCssProperty(updated, 'opacity', iconOpacity);
            updated = setCssProperty(updated, 'filter', iconFilter);
            return setCssProperty(updated, 'z-index', '11');
        });
        next = replaceCssRuleBlock(next, `${baseSelector}\\.clip-label`, block => {
            let updated = setCssProperty(block, 'color', labelColor);
            updated = setCssProperty(updated, 'font-size', labelSize);
            updated = setCssProperty(updated, 'font-family', '"Enchanted Land", serif');
            return setCssProperty(updated, 'z-index', '12');
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
        next = replaceCssRuleBlock(next, `${baseSelector}\\.clip-label\\s+\\.label-description-keyword`, block => {
            let updated = setCssProperty(block, 'color', iconColor);
            updated = setCssProperty(updated, 'font-size', '1.08em');
            return setCssProperty(updated, 'font-weight', '800');
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
                const hasBackdropBlur = getBackdropBlur(element) > 0;
                let updated = block
                    .replace(/\n\s*background-color:\s*[^;]+;/gi, '')
                    .replace(/\n\s*background-image:\s*[^;]+;/gi, '');
                updated = setCssProperty(updated, 'background', 'transparent');
                if (hasBackdropBlur) updated = setCssProperty(updated, 'background-color', 'rgba(255,255,255,0.01)');
                return setCssProperty(updated, 'opacity', hasBackdropBlur ? '1' : '0');
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

function extractArenaModelFromPayload(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const model = payload.arenaModel || payload._arenaModel || payload.model || payload;
    return model?.generatedCode || model?.html || model?.code ? model : null;
}

async function loadArenaBaseLayoutTemplates() {
    if (arenaBaseLayoutTemplatesCache) return arenaBaseLayoutTemplatesCache;
    if (arenaBaseLayoutTemplatesPromise) return arenaBaseLayoutTemplatesPromise;

    arenaBaseLayoutTemplatesPromise = (async () => {
        try {
            const response = await fetch(ARENA_BASE_LAYOUT_MAGIC_URL, { cache: 'no-store' });
            if (!response.ok) {
                arenaBaseLayoutTemplatesCache = {};
                return arenaBaseLayoutTemplatesCache;
            }

            const payload = await response.json();
            const model = extractArenaModelFromPayload(payload);
            if (!model) {
                arenaBaseLayoutTemplatesCache = {};
                return arenaBaseLayoutTemplatesCache;
            }

            arenaBaseLayoutTemplatesCache = {
                magic: tagArenaModelTemplateForKey(sanitizeArenaModelForTemplate(model), 'magic')
            };
            return arenaBaseLayoutTemplatesCache;
        } catch (error) {
            arenaBaseLayoutTemplatesCache = {};
            return arenaBaseLayoutTemplatesCache;
        }
    })();

    return arenaBaseLayoutTemplatesPromise;
}

export async function ensureArenaBaseLayoutTemplatesLoaded() {
    return loadArenaBaseLayoutTemplates();
}

export function clearArenaModelTemplates() {
    arenaModelTemplatesCache = {};
    try {
        localStorage.removeItem(ARENA_MODEL_TEMPLATE_STORAGE_KEY);
    } catch (error) {
        console.warn('Nao foi possivel limpar os templates do Arena:', error);
    }
}

export function hasArenaModelTemplates() {
    return Object.keys(readArenaModelTemplates()).length > 0;
}

export function isArenaModelTemplatePayload(cardData) {
    if (!cardData || typeof cardData !== 'object') return false;
    if (cardData._arenaModelTemplateOnly || cardData.arenaModelTemplateOnly) return true;
    if (cardData.app === 'arena-card-model' && (cardData.generatedCode || cardData.html || cardData.code)) return true;
    return false;
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
            copy[key] = replaceImageBackdropColorRules(copy[key], copy.elements, sourceRootId);
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
    const store = String(cardData?._arenaStoreName || '').toLowerCase();
    const type = normalizeArenaTemplateKey(cardData?.type || cardData?.category);
    const cardType = normalizeArenaTemplateKey(cardData?.cardType);

    if (store === 'rpgeffects' && (type === 'attack' || type === 'magic' || type === 'skill')) return type;
    if (store === 'rpgcards') return cardType === 'creature' ? 'creature' : 'character';
    if (store === 'rpgitems') return 'item';
    if (store === 'rpgspells') return 'magic';
    if (store === 'rpgattacks') return 'attack';
    if (type) return type;
    if (cardType) return cardType;

    const explicitType = normalizeArenaTemplateKey(
        cardData?._arenaTemplateType
        || cardData?.arenaModel?.templateType
        || cardData?._arenaModel?.templateType
        || cardData?.arenaModel?.kind
        || cardData?._arenaModel?.kind
    );
    if (explicitType) return explicitType;

    if (ARENA_STORE_TEMPLATE_KEYS[store]) return ARENA_STORE_TEMPLATE_KEYS[store];
    if (cardData?.attributes || cardData?.lore) return cardData?.cardType === 'creature' ? 'creature' : 'character';
    if (cardData?.charge || cardData?.prerequisite) return 'item';
    return '';
}

function templateSupportsArenaKey(template, key) {
    if (!template || !key) return false;
    const sourceKey = normalizeArenaTemplateKey(template?.sourceTemplateType || template?.templateType || template?.kind);
    const compatibleKeys = getCompatibleArenaTemplateKeys(template, sourceKey || key);
    return compatibleKeys.includes(key);
}

function findCompatibleArenaModelTemplate(templates, key) {
    const fallbackKeys = ARENA_SHARED_LAYOUT_FALLBACKS[key] || [];
    for (const fallbackKey of fallbackKeys) {
        const template = templates[fallbackKey];
        if (templateSupportsArenaKey(template, key)) return template;
    }
    for (const template of Object.values(templates || {})) {
        if (templateSupportsArenaKey(template, key)) return template;
    }
    return null;
}

function getArenaModelTemplate(cardData) {
    const key = getArenaTemplateKey(cardData);
    if (!key) return null;
    const baseTemplates = arenaBaseLayoutTemplatesCache || {};
    const templates = { ...baseTemplates, ...readArenaModelTemplates() };
    const ownTemplate = templates[key];
    const template = templateSupportsArenaKey(ownTemplate, key) ? ownTemplate : findCompatibleArenaModelTemplate(templates, key);
    return template ? sanitizeArenaModelForTemplate(template) : null;
}

function tagArenaModelTemplateForKey(model, key) {
    const normalizedKey = normalizeArenaTemplateKey(key);
    if (!model || !normalizedKey) return model;
    const copy = model && typeof model === 'object' ? { ...model } : model;
    const sourceType = normalizeArenaTemplateKey(copy.sourceTemplateType || copy.templateType || copy.kind) || normalizedKey;
    copy.sourceTemplateType = sourceType;
    copy.templateType = normalizedKey;
    copy.kind = ARENA_TEMPLATE_TYPE_LABELS[normalizedKey] || copy.kind || normalizedKey;
    copy.compatibleTemplateTypes = getCompatibleArenaTemplateKeys(copy, sourceType);
    return copy;
}

export function saveArenaModelTemplateFromCard(cardData, options = {}) {
    const model = cardData?.arenaModel || cardData?._arenaModel;
    if (!model?.generatedCode && !model?.html && !model?.code) return false;
    const key = normalizeArenaTemplateKey(options.templateType || options.targetTemplateType) || getArenaTemplateKey(cardData);
    if (!key) return false;
    const templates = readArenaModelTemplates();
    templates[key] = tagArenaModelTemplateForKey(sanitizeArenaModelForTemplate(model), key);
    writeArenaModelTemplates(templates);
    return true;
}

export async function seedArenaModelTemplatesFromLocalData() {
    try {
        const { getData } = await import('./db-local.js');
        const stores = ['rpgEffects', 'rpgItems', 'rpgCards', 'rpgSpells', 'rpgAttacks'];
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

function normalizeDisplayValue(value) {
    if (value === undefined || value === null) return '';
    if (Array.isArray(value)) {
        return value.map(item => normalizeDisplayValue(item)).filter(Boolean).join(', ');
    }
    if (typeof value === 'object') {
        const preferredKeys = ['label', 'name', 'nome', 'title', 'value', 'valor', 'text', 'description', 'effect'];
        for (const key of preferredKeys) {
            if (Object.prototype.hasOwnProperty.call(value, key)) {
                const nested = normalizeDisplayValue(value[key]);
                if (nested) return nested;
            }
        }
        return '';
    }
    return String(value).trim();
}

function valueHasText(value) {
    return normalizeDisplayValue(value) !== '';
}

function buildDescriptionText(cardData) {
    const sections = [
        { label: 'Descrição', value: getValueByPath(cardData, 'description') || getValueByPath(cardData, 'effect') },
        { label: 'Aprimorar', value: getValueByPath(cardData, 'enhance'), hidden: Boolean(cardData?.enhanceCardId) },
        { label: 'Verdadeiro', value: getValueByPath(cardData, 'true'), hidden: Boolean(cardData?.trueCardId) }
    ].filter(section => !section.hidden && valueHasText(section.value));

    return sections.map(section => `${section.label}\n${normalizeDisplayValue(section.value)}`).join('\n\n');
}

function formatAumentoValue(aumento) {
    if (!aumento || typeof aumento !== 'object') return normalizeDisplayValue(aumento);
    const raw = aumento.valor ?? aumento.value;
    const number = Number(raw);
    if (!Number.isFinite(number) || number === 0) return normalizeDisplayValue(raw);
    return `${number > 0 ? '+' : ''}${number}`;
}

function getCardFieldValue(cardData, key) {
    if (key === 'description' || key === 'effect') return buildDescriptionText(cardData);
    const aumentoMatch = String(key || '').match(/^aumentos\.(\d+)$/);
    if (aumentoMatch) return formatAumentoValue(cardData?.aumentos?.[Number(aumentoMatch[1])]);

    const aliases = {
        name: ['name', 'title'],
        title: ['title', 'name'],
        subTitle: ['subTitle', 'subtitle'],
        subtitle: ['subtitle', 'subTitle'],
        type: ['type', 'cardType', 'category'],
        cardType: ['cardType', 'type'],
        circle: ['circle', 'circulo'],
        manaCost: ['manaCost', 'mana_cost', 'cost', 'custoMana', 'custo'],
        execution: ['execution', 'execucao'],
        range: ['range', 'alcance'],
        target: ['target', 'alvo', 'area'],
        duration: ['duration', 'duracao'],
        resistencia: ['resistencia', 'resistance'],
        resistance: ['resistance', 'resistencia'],
        charge: ['charge', 'carga'],
        prerequisite: ['prerequisite', 'preRequisito', 'pre-requisito', 'requisito'],
        acerto: ['acerto', 'accuracy', 'attributes.acerto'],
        critico: ['critico', 'critical', 'attributes.critico'],
        dano: ['atk', 'attack', 'dano', 'damage', 'attributes.dano'],
        damage: ['damage', 'atk', 'attack', 'dano', 'attributes.dano'],
        danoSemMana: ['atkSemMana', 'attackSemMana', 'danoSemMana', 'damageNoMana', 'attributes.danoSemMana'],
        vidaDado: ['vidaDado', 'lifeDie', 'hitDie'],
        manaDado: ['manaDado', 'manaDie'],
        level: ['level', 'nivel'],
        dinheiro: ['dinheiro', 'money', 'gold'],
        classe: ['classe', 'class'],
        vida: ['attributes.vida', 'vida'],
        vidaAtual: ['attributes.vidaAtual', 'vidaAtual'],
        mana: ['attributes.mana', 'mana'],
        manaAtual: ['attributes.manaAtual', 'manaAtual'],
        description: ['description', 'effect'],
        effect: ['effect', 'description'],
        enhance: ['enhance'],
        true: ['true'],
        'lore.historia': ['lore.historia', 'historia'],
        'lore.personalidade': ['lore.personalidade', 'personalidade'],
        'lore.motivacao': ['lore.motivacao', 'motivacao']
    };
    const paths = aliases[key] || [key];
    for (const path of paths) {
        const value = getValueByPath(cardData, path);
        if (valueHasText(value)) return normalizeDisplayValue(value);
    }
    return '';
}

function normalizeCardTitleMetaValue(value) {
    return normalizeDisplayValue(value).replace(/\s+/g, ' ');
}

function formatManaTitleMetaValue(value) {
    const text = normalizeCardTitleMetaValue(value);
    if (!text) return '';
    const numericValue = Number(text.replace(',', '.'));
    if (Number.isFinite(numericValue) && numericValue <= 0) return '';
    if (/\b(mn|pm|mana)\b/i.test(text)) return text.replace(/\b(mn|pm|mana)\b/gi, 'PM');
    return `${text} PM`;
}

function formatCircleTitleMetaValue(value) {
    const text = normalizeCardTitleMetaValue(value);
    if (!text) return '';
    const numericValue = Number(text.replace(',', '.'));
    if (Number.isFinite(numericValue) && numericValue <= 0) return '';
    const circleMatch = text.match(/^(\d+(?:[,.]\d+)?)\s*(?:\u00ba|\u00b0)?\s*c[i\u00ed]rculo$/i);
    if (circleMatch) return `${circleMatch[1]}\u00ba Circulo`;
    if (/c[i\u00ed]rculo/i.test(text)) return text.replace(/c[i\u00ed]rculo/gi, 'Circulo');
    if (/^\d+(?:[,.]\d+)?$/.test(text)) return `${text}\u00ba Circulo`;
    if (/\u00ba|\u00b0/.test(text)) return `${text} Circulo`;
    return `${text} Circulo`;
}

function buildCardTitleMetaValue(cardData) {
    return [
        formatManaTitleMetaValue(getCardFieldValue(cardData, 'manaCost')),
        formatCircleTitleMetaValue(getCardFieldValue(cardData, 'circle'))
    ].filter(Boolean).join(' - ');
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
    const light = palette.colorLight || cardData?.colorLight || lightenCssColor(color, 0.38) || color;
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

function hydrateArenaModelCode(code, cardData, scopeId = '', model = null) {
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
    applyArenaModelElementBindings(template.content, model);
    template.content.querySelectorAll('[data-card-field]').forEach(node => {
        const key = node.getAttribute('data-card-field') || '';
        const value = getCardFieldValue(cardData, key);
        const displayValue = valueHasText(value) ? value : '-';
        const hasTitleMeta = node.getAttribute('data-card-title-meta') === 'mana-circle';
        let main = node.querySelector('.clip-label-main');
        let extra = node.querySelector('.clip-label-extra');
        if (!main && extra && hasTitleMeta) {
            main = document.createElement('span');
            main.className = 'clip-label-main';
            (node.querySelector('.clip-label-text-stack') || extra.parentElement || node).insertBefore(main, extra);
        }
        const target = main || (extra && !hasTitleMeta ? extra : (node.querySelector('.clip-label-text-stack') || node));
        if (target) {
            if (isDescriptionHighlightField(key)) appendDescriptionHighlightText(target, displayValue);
            else target.textContent = displayValue;
        }
        if (hasTitleMeta) {
            const metaValue = buildCardTitleMetaValue(cardData);
            extra = node.querySelector('.clip-label-extra');
            if (metaValue) {
                if (!extra) {
                    extra = document.createElement('span');
                    extra.className = 'clip-label-extra';
                    node.appendChild(extra);
                }
                extra.textContent = metaValue;
            } else if (extra) {
                extra.remove();
            }
        }
    });
    applyReceiverIconClasses(template.content, cardData);

    return template.innerHTML;
}

export function hasArenaModel(cardData) {
    const model = getArenaModel(cardData);
    return Boolean(model?.generatedCode || model?.html || model?.code);
}

function resolveArenaModelSize(model, options = {}) {
    const modelW = Number(model?.canvas?.width || model?.width || 810) || 810;
    const modelH = Number(model?.canvas?.height || model?.height || 1440) || 1440;
    const finalize = size => options.isModal ? { ...size, ...shrinkExpandedCardSize(size) } : size;

    if (!options.isModal && !options.isInPlay && !(Number(options.cardWidth) > 0 && Number(options.cardHeight) > 0)) {
        return { modelW, modelH, finalWidth: modelW, finalHeight: modelH };
    }

    if (Number(options.cardWidth) > 0 && Number(options.cardHeight) > 0) {
        return finalize({
            modelW,
            modelH,
            finalWidth: Number(options.cardWidth),
            finalHeight: Number(options.cardHeight)
        });
    }

    const aspectRatio = modelW / modelH;
    const windowWidth = window.innerWidth || modelW;
    const windowHeight = window.innerHeight || modelH;
    const isMobile = window.matchMedia?.('(max-width: 640px)').matches || windowWidth <= 640;

    if (isMobile) {
        const maxWidth = Math.max(240, windowWidth - 8);
        const maxHeight = Math.max(320, windowHeight - 68);
        if ((maxWidth / aspectRatio) > maxHeight) {
            return finalize({ modelW, modelH, finalWidth: maxHeight * aspectRatio, finalHeight: maxHeight });
        }
        return finalize({ modelW, modelH, finalWidth: maxWidth, finalHeight: maxWidth / aspectRatio });
    }

    if ((windowWidth / aspectRatio) > windowHeight) {
        const finalHeight = windowHeight * 0.9;
        return finalize({ modelW, modelH, finalWidth: finalHeight * aspectRatio, finalHeight });
    }

    const finalWidth = windowWidth * 0.9;
    return finalize({ modelW, modelH, finalWidth, finalHeight: finalWidth / aspectRatio });
}

function renderArenaModelHtml(cardData, options = {}) {
    const model = getArenaModel(cardData);
    const uniqueId = `arena-model-${safeDomId(cardData?.id || cardData?.name || cardData?.title)}-${Math.random().toString(36).slice(2, 7)}`;
    const code = hydrateArenaModelCode(model?.generatedCode || model?.html || model?.code || '', cardData, uniqueId, model);
    const { modelW, modelH, finalWidth, finalHeight } = resolveArenaModelSize(model, options);
    const scale = Math.min(finalWidth / modelW, finalHeight / modelH);
    const cardImageUrl = getCardImageUrl(cardData);
    const cardColors = getCardColorVars(cardData);
    const imageVar = cardImageUrl ? `--arena-card-image: ${cssUrl(cardImageUrl)};` : '--arena-card-image: none;';
    const colorVars = `--arena-card-color: ${cardColors.color}; --arena-card-color-light: ${cardColors.light}; --arena-card-color-soft: ${cardColors.soft}; --arena-card-color-light-soft: ${cardColors.lightSoft};`;

    return `
        <div id="${uniqueId}" class="arena-model-card w-full h-full relative text-white" data-arena-image="${cardImageUrl ? 'ready' : 'missing'}" data-arena-model-version="${model?.schemaVersion || model?.version || 1}" data-arena-model-width="${modelW}" data-arena-model-height="${modelH}" style="${imageVar} ${colorVars} transform-origin: top left; width: ${finalWidth}px; height: ${finalHeight}px; margin: 0 auto; background: transparent; overflow: visible;">
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
    applyDarkModalBackdrop(container);
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
