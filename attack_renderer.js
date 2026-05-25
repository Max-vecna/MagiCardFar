import { renderFullSpellSheet } from './magic_renderer.js';

export async function renderFullAttackSheet(attackData, isModal, options = {}) {
    if (!attackData) return '';
    return renderFullSpellSheet({ ...attackData, type: 'ataque' }, isModal, options);
}
