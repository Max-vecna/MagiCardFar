const RECEIVER_MODE_ALIASES = {
    padrao: 'padrao',
    padrão: 'padrao',
    default: 'padrao',
    base: 'padrao',
    modificar: 'modificar',
    modificador: 'modificar',
    modifier: 'modificar',
    mod: 'modificar'
};

const RECEIVER_TARGET_ALIASES = {
    vida: 'vida',
    cura: 'vida',
    health: 'vida',
    mana: 'mana',
    item: 'item',
    itens: 'item',
    ataque: 'ataque',
    attack: 'ataque',
    habilidade: 'habilidade',
    abilidade: 'habilidade',
    skill: 'habilidade',
    magia: 'magia',
    magic: 'magia',
    spell: 'magia',
    atributos: 'atributos',
    atributo: 'atributos',
    attributes: 'atributos'
};

const LEGACY_RECEIVER_VALUES = {
    'ra-cog': { mode: 'padrao', target: '' },
    cog: { mode: 'padrao', target: '' },
    padrao: { mode: 'padrao', target: '' },
    'ra-wrench': { mode: 'modificar', target: '' },
    wrench: { mode: 'modificar', target: '' },
    modificar: { mode: 'modificar', target: '' },
    modificador: { mode: 'modificar', target: '' },
    'ra-heart-bottle': { mode: '', target: 'vida' },
    cura: { mode: '', target: 'vida' },
    vida: { mode: '', target: 'vida' },
    'ra-bottle-vapors': { mode: '', target: 'mana' },
    mana: { mode: '', target: 'mana' }
};

function normalizeKey(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\\/g, '/')
        .replace(/\s*\/\s*/g, '/')
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

export function normalizeRpgIconClass(value) {
    const raw = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!raw || raw === 'none' || raw === 'sem icone') return '';
    const className = raw.match(/(?:^|\s)(ra-[a-z0-9-]+)(?:\s|$)/)?.[1] || raw.replace(/^ra\s+/, '');
    const icon = className.startsWith('ra-') ? className : `ra-${className}`;
    return /^ra-[a-z0-9-]+$/.test(icon) ? icon : '';
}

export function normalizeReceiverIconMode(value) {
    return RECEIVER_MODE_ALIASES[normalizeKey(value)] || '';
}

export function normalizeReceiverIconTarget(value) {
    return RECEIVER_TARGET_ALIASES[normalizeKey(value)] || '';
}

export function splitReceiverIconType(value) {
    const key = normalizeKey(value);
    if (!key) return { mode: '', target: '' };

    if (key.includes('/')) {
        const [modeRaw, targetRaw] = key.split('/');
        return {
            mode: normalizeReceiverIconMode(modeRaw),
            target: normalizeReceiverIconTarget(targetRaw)
        };
    }

    const legacy = LEGACY_RECEIVER_VALUES[key] || LEGACY_RECEIVER_VALUES[key.replace(/^ra-/, '')];
    if (legacy) return { ...legacy };

    for (const modeRaw of Object.keys(RECEIVER_MODE_ALIASES)) {
        const prefix = `${modeRaw}-`;
        if (!key.startsWith(prefix)) continue;
        return {
            mode: normalizeReceiverIconMode(modeRaw),
            target: normalizeReceiverIconTarget(key.slice(prefix.length))
        };
    }

    return {
        mode: normalizeReceiverIconMode(key),
        target: normalizeReceiverIconTarget(key)
    };
}

export function getReceiverIconSelection(data = {}) {
    const split = splitReceiverIconType(data.receiverIconType || data.receiverIcon || data.iconReceiverType || data.iconType || '');
    const mode = normalizeReceiverIconMode(data.receiverIconMode || data.iconReceiverMode) || split.mode || 'padrao';
    const target = normalizeReceiverIconTarget(data.receiverIconTarget || data.iconReceiverTarget) || split.target || 'magia';
    const free = normalizeRpgIconClass(data.receiverIconFree || data.receiverIconClass || data.iconReceiverFree || '');
    return {
        mode,
        target,
        free,
        type: mode && target ? `${mode}/${target}` : ''
    };
}

function getControls(prefix) {
    return {
        wrapper: document.querySelector(`[data-receiver-icon-controls="${prefix}"]`),
        mode: document.getElementById(`${prefix}ReceiverIconMode`),
        target: document.getElementById(`${prefix}ReceiverIconTarget`),
        free: document.getElementById(`${prefix}ReceiverIconFree`),
        legacy: document.getElementById(`${prefix}ReceiverIcon`)
    };
}

export function readReceiverIconControls(prefix) {
    const controls = getControls(prefix);
    const hidden = controls.wrapper?.classList.contains('hidden');
    if (hidden) return { mode: '', target: '', free: '', type: '' };

    const legacy = splitReceiverIconType(controls.legacy?.value || '');
    const mode = normalizeReceiverIconMode(controls.mode?.value) || legacy.mode || '';
    const target = normalizeReceiverIconTarget(controls.target?.value) || legacy.target || '';
    const free = normalizeRpgIconClass(controls.free?.value || '');
    return {
        mode,
        target,
        free,
        type: mode && target ? `${mode}/${target}` : ''
    };
}

export function writeReceiverIconControls(prefix, data = {}) {
    const controls = getControls(prefix);
    const selection = getReceiverIconSelection(data);
    if (controls.mode) controls.mode.value = selection.mode || 'padrao';
    if (controls.target) controls.target.value = selection.target || 'magia';
    if (controls.free) controls.free.value = selection.free || '';
    if (controls.legacy) controls.legacy.value = selection.type || data.receiverIconType || '';
}

export function applyReceiverIconSelection(target, selection) {
    if (!target || typeof target !== 'object') return target;
    const mode = normalizeReceiverIconMode(selection?.mode);
    const receiverTarget = normalizeReceiverIconTarget(selection?.target);
    const free = normalizeRpgIconClass(selection?.free || '');
    target.receiverIconMode = mode;
    target.receiverIconTarget = receiverTarget;
    target.receiverIconFree = free;
    target.receiverIconType = mode && receiverTarget ? `${mode}/${receiverTarget}` : '';
    return target;
}

export function setReceiverIconControlsVisible(prefix, visible) {
    const controls = getControls(prefix);
    controls.wrapper?.classList.toggle('hidden', !visible);
    if (controls.legacy) controls.legacy.closest('div')?.classList.add('hidden');
}
