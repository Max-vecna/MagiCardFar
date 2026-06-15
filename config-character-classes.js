export const CHARACTER_CLASSES = {
    mago: {
        label: 'Mago',
        vida: { base: 12, gain: 3, attr: 'vigor' },
        mana: { base: 6, gain: 4, attr: 'sabedoria' }
    },
    bardo: {
        label: 'Bardo',
        vida: { base: 12, gain: 4, attr: 'vigor' },
        mana: { base: 2, gain: 2, attr: 'carisma' }
    },
    paladino: {
        label: 'Paladino',
        vida: { base: 20, gain: 4, attr: 'vigor' },
        mana: { base: 4, gain: 2, attr: 'sabedoria' }
    },
    ladino: {
        label: 'Ladino',
        vida: { base: 12, gain: 4, attr: 'vigor' },
        mana: { base: 2, gain: 2, attr: 'inteligencia' }
    }
};

export const CHARACTER_CLASS_OPTIONS = Object.entries(CHARACTER_CLASSES).map(([value, config]) => ({
    value,
    label: config.label
}));

const CLASS_ALIASES = Object.entries(CHARACTER_CLASSES).reduce((aliases, [value, config]) => {
    (config.aliases || []).forEach(alias => {
        aliases[alias] = value;
    });
    return aliases;
}, {});

function toInt(value, fallback = 0) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
}

export function normalizeCharacterClassId(classe) {
    const raw = String(classe || '').trim().toLowerCase();
    return CLASS_ALIASES[raw] || raw;
}

export function getCharacterClassConfig(classe) {
    return CHARACTER_CLASSES[normalizeCharacterClassId(classe)] || null;
}

export function calculateCharacterClassResources({ classe, level, attributes = {} } = {}) {
    const config = getCharacterClassConfig(classe);
    if (!config) return null;

    const safeLevel = Math.max(1, toInt(level, 1));
    const vidaAttr = toInt(attributes[config.vida.attr], 0);
    const manaAttr = toInt(attributes[config.mana.attr], 0);

    const vidaMax = (config.vida.base + vidaAttr) + ((safeLevel - 1) * (config.vida.gain + vidaAttr));
    const manaMax = (config.mana.base + manaAttr) + ((safeLevel - 1) * (config.mana.gain + manaAttr));

    return {
        vidaMax: Math.max(0, vidaMax),
        manaMax: Math.max(0, manaMax)
    };
}
