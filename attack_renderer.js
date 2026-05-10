import { renderFullSpellSheet } from './magic_renderer.js';

export async function renderFullAttackSheet(attackData, isModal) {
    if (!attackData) return '';
    return renderFullSpellSheet({ ...attackData, type: 'ataque' }, isModal);
}
