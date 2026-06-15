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
    vida: 'medicina',
    cura: 'medicina',
    health: 'medicina',
    mana: 'medicina',
    restaurar: 'medicina',
    'restaurar-mana': 'medicina',
    medicina: 'medicina',
    medicine: 'medicina',
    medical: 'medicina',
    item: 'item',
    itens: 'item',
    ataque: 'ataque',
    attack: 'ataque',
    combate: 'combate',
    combat: 'combate',
    habilidade: 'habilidade',
    abilidade: 'habilidade',
    skill: 'habilidade',
    magia: 'magia',
    magic: 'magia',
    spell: 'magia',
    atributos: 'atributos',
    atributo: 'atributos',
    attributes: 'atributos',
    texto: 'texto',
    text: 'texto',
    descricao: 'texto',
    description: 'texto'
};

const LEGACY_RECEIVER_VALUES = {
    'ra-cog': { mode: 'padrao', target: '' },
    cog: { mode: 'padrao', target: '' },
    padrao: { mode: 'padrao', target: '' },
    'ra-wrench': { mode: 'modificar', target: '' },
    wrench: { mode: 'modificar', target: '' },
    modificar: { mode: 'modificar', target: '' },
    modificador: { mode: 'modificar', target: '' },
    'ra-heart-bottle': { mode: '', target: 'medicina' },
    cura: { mode: '', target: 'medicina' },
    vida: { mode: '', target: 'medicina' },
    'ra-bottle-vapors': { mode: '', target: 'medicina' },
    mana: { mode: '', target: 'medicina' },
    medicina: { mode: '', target: 'medicina' },
    'ra-sun': { mode: '', target: 'magia' },
    sun: { mode: '', target: 'magia' },
    'ra-burst-blob': { mode: '', target: 'habilidade' },
    'burst-blob': { mode: '', target: 'habilidade' },
    'ra-pawn': { mode: '', target: 'item' },
    pawn: { mode: '', target: 'item' },
    'ra-axe-swing': { mode: '', target: 'ataque' },
    'axe-swing': { mode: '', target: 'ataque' },
    combate: { mode: '', target: 'combate' },
    'ra-jigsaw-piece': { mode: '', target: 'atributos' },
    'jigsaw-piece': { mode: '', target: 'atributos' },
    'ra-quill-ink': { mode: '', target: 'texto' },
    'quill-ink': { mode: '', target: 'texto' },
    texto: { mode: '', target: 'texto' }
};

const RECEIVER_ICON_MODE_OPTIONS = [
    { value: 'padrao', label: 'Padrao', icon: 'ra-cog' },
    { value: 'modificar', label: 'Modificador', icon: 'ra-wrench' }
];

const RECEIVER_ICON_TARGET_OPTIONS = [
    { value: 'magia', label: 'Magia', icon: 'ra-sun' },
    { value: 'habilidade', label: 'Habilidade', icon: 'ra-burst-blob' },
    { value: 'item', label: 'Item', icon: 'ra-pawn' },
    { value: 'ataque', label: 'Ataque', icon: 'ra-axe-swing' },
    { value: 'atributos', label: 'Atributos', icon: 'ra-jigsaw-piece' },
    { value: 'medicina', label: 'Medicina', icon: 'ra-bottle-vapors' },
    { value: 'combate', label: 'Combate', icon: 'ra-axe-swing' },
    { value: 'texto', label: 'Texto', icon: 'ra-quill-ink' }
];

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

function getControlValue(control) {
    if (!control) return '';
    return control.tagName === 'INPUT'
        ? normalizeRpgIconClass(control.value || '')
        : String(control.value || '');
}

function setControlValue(control, value) {
    if (!control) return;
    if (control.tagName === 'INPUT') {
        control.value = normalizeRpgIconClass(value || '');
        control.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
        control.value = value;
    }
    control.dispatchEvent(new Event('change', { bubbles: true }));
}

function syncIconPicker(control, options) {
    const picker = control?.parentElement?.querySelector?.(`[data-receiver-icon-picker-for="${control.id}"]`);
    if (!picker) return;
    const currentValue = getControlValue(control);
    Array.from(picker.querySelectorAll('[data-receiver-icon-value]')).forEach(button => {
        button.classList.toggle('is-active', button.dataset.receiverIconValue === currentValue);
    });
}

function ensureIconPicker(control, options) {
    if (!control || !control.id || !control.parentElement) return;
    let picker = control.parentElement.querySelector(`[data-receiver-icon-picker-for="${control.id}"]`);
    if (!picker) {
        picker = document.createElement('div');
        picker.className = 'receiver-icon-picker';
        picker.setAttribute('data-receiver-icon-picker-for', control.id);

        options.forEach(option => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'receiver-icon-choice';
            button.title = option.label;
            button.setAttribute('aria-label', option.label);
            button.dataset.receiverIconValue = option.value;

            const icon = document.createElement('i');
            icon.className = `ra ${option.icon}`;
            icon.setAttribute('aria-hidden', 'true');

            const label = document.createElement('span');
            label.className = 'receiver-icon-choice-label';
            label.textContent = option.label;
            button.append(icon, label);

            button.addEventListener('click', () => {
                setControlValue(control, option.value);
                syncIconPicker(control, options);
            });
            picker.append(button);
        });

        control.insertAdjacentElement('afterend', picker);
        control.addEventListener('change', () => syncIconPicker(control, options));
        control.addEventListener('input', () => syncIconPicker(control, options));
    }

    control.classList.add('receiver-icon-source');
    control.tabIndex = -1;
    syncIconPicker(control, options);
}

function syncReceiverIconPickers(prefix) {
    const controls = getControls(prefix);
    ensureIconPicker(controls.mode, RECEIVER_ICON_MODE_OPTIONS);
    ensureIconPicker(controls.target, RECEIVER_ICON_TARGET_OPTIONS);
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
    syncReceiverIconPickers(prefix);
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
    if (visible) syncReceiverIconPickers(prefix);
}
