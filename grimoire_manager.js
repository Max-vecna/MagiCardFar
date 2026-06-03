import { saveData, getData, removeData } from './local_db.js';
import { populateCharacterSelect } from './character_manager.js';
import { showCustomAlert, showCustomConfirm } from './ui_utils.js';

let currentChapterIndex = 0;
let currentGrimoireData = null;
let entryImageFile = null;
let entryImageRemovalRequested = false;

function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        if (!file) return resolve(null);
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}

function bufferToBlob(buffer, mimeType) {
    return new Blob([buffer], { type: mimeType });
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatTextForHtml(text) {
    return escapeHtml(text || '').replace(/\n/g, '<br>');
}

function sanitizeFilenamePart(value, fallback = 'grimorio') {
    const sanitized = String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
    return sanitized || fallback;
}

function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

async function getOwnerName(characterId) {
    if (!characterId) return 'Desconhecido';
    const character = await getData('rpgCards', characterId);
    return character ? character.title : 'Desconhecido';
}

function buildSingleVolumeText(grimoire, ownerName) {
    const separator = '==================================================\n';
    const chapterSeparator = '--------------------------------------------------\n';
    let content = '';

    content += separator;
    content += `TITULO: ${grimoire.title}\n`;
    content += `PROPRIEDADE DE: ${ownerName}\n`;
    content += separator + '\n';

    if (Array.isArray(grimoire.entries) && grimoire.entries.length > 0) {
        grimoire.entries.forEach((entry, index) => {
            content += `CAPITULO ${index + 1}: ${entry.subtitle || 'Sem titulo'}\n`;
            content += chapterSeparator;
            content += `${entry.content || '(Capitulo em branco)'}\n`;
            if (entry.image) {
                content += '\n[NOTA: Este capitulo contem uma imagem anexada no sistema]\n';
            }
            content += '\n\n';
        });
    } else {
        content += '(Este grimorio nao possui capitulos escritos.)\n';
    }

    content += separator;
    content += 'Gerado por Farland RPG Manager';
    return content;
}

function buildCollectionText(title, volumesWithOwner) {
    const separator = '============================================================\n';
    let content = '';

    content += separator;
    content += `COLECAO COMPLETA: ${title}\n`;
    content += `TOTAL DE VOLUMES: ${volumesWithOwner.length}\n`;
    content += separator + '\n\n';

    volumesWithOwner.forEach(({ grimoire, ownerName }) => {
        content += buildSingleVolumeText(grimoire, ownerName) + '\n\n';
    });

    return content;
}

function buildGrimoireDocumentHtml(documentTitle, volumesWithOwner) {
    const sectionsHtml = volumesWithOwner.map(({ grimoire, ownerName }) => {
        const chaptersHtml = Array.isArray(grimoire.entries) && grimoire.entries.length > 0
            ? grimoire.entries.map((entry, index) => {
                const imageHtml = entry.image && entry.imageMimeType
                    ? `
                        <div class="chapter-image">
                            <img src="data:${entry.imageMimeType};base64,${arrayBufferToBase64(entry.image)}" alt="${escapeHtml(entry.subtitle || `Capitulo ${index + 1}`)}">
                        </div>
                    `
                    : '';

                return `
                    <section class="chapter">
                        <h3>Capitulo ${index + 1}: ${escapeHtml(entry.subtitle || 'Sem titulo')}</h3>
                        <div class="chapter-text">${formatTextForHtml(entry.content || 'Capitulo em branco.')}</div>
                        ${imageHtml}
                    </section>
                `;
            }).join('')
            : '<p class="empty-state">Este grimorio nao possui capitulos escritos.</p>';

        return `
            <article class="volume">
                <header class="volume-header">
                    <h2>${escapeHtml(grimoire.title)}</h2>
                    <p><strong>Propriedade de:</strong> ${escapeHtml(ownerName)}</p>
                </header>
                ${chaptersHtml}
            </article>
        `;
    }).join('');

    return `
        <html xmlns:o="urn:schemas-microsoft-com:office:office"
              xmlns:w="urn:schemas-microsoft-com:office:word"
              xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta charset="utf-8">
                <title>${escapeHtml(documentTitle)}</title>
                <style>
                    body {
                        font-family: Georgia, "Times New Roman", serif;
                        color: #222;
                        margin: 24px;
                        line-height: 1.6;
                    }
                    h1, h2, h3 {
                        margin: 0 0 12px;
                        color: #111827;
                    }
                    .volume {
                        page-break-after: always;
                        margin-bottom: 32px;
                    }
                    .volume:last-child {
                        page-break-after: auto;
                    }
                    .volume-header {
                        border-bottom: 2px solid #d1d5db;
                        margin-bottom: 20px;
                        padding-bottom: 12px;
                    }
                    .chapter {
                        margin-bottom: 24px;
                    }
                    .chapter-text {
                        white-space: normal;
                    }
                    .chapter-image {
                        margin-top: 12px;
                    }
                    .chapter-image img {
                        max-width: 100%;
                        height: auto;
                        border: 1px solid #d1d5db;
                    }
                    .empty-state {
                        color: #6b7280;
                        font-style: italic;
                    }
                </style>
            </head>
            <body>
                <h1>${escapeHtml(documentTitle)}</h1>
                ${sectionsHtml}
            </body>
        </html>
    `;
}

async function exportGrimoireToTxt(id) {
    const grimoire = await getData('rpgGrimoires', id);
    if (!grimoire) {
        showCustomAlert('Erro ao exportar: grimorio nao encontrado.');
        return;
    }

    const ownerName = await getOwnerName(grimoire.characterId);
    const content = buildSingleVolumeText(grimoire, ownerName);
    const fileName = `${sanitizeFilenamePart(grimoire.title)}.txt`;
    downloadBlob(new Blob([content], { type: 'text/plain;charset=utf-8' }), fileName);
}

async function exportGrimoireToDoc(id) {
    const grimoire = await getData('rpgGrimoires', id);
    if (!grimoire) {
        showCustomAlert('Erro ao exportar: grimorio nao encontrado.');
        return;
    }

    const ownerName = await getOwnerName(grimoire.characterId);
    const html = buildGrimoireDocumentHtml(grimoire.title, [
        { grimoire, ownerName }
    ]);
    const fileName = `${sanitizeFilenamePart(grimoire.title)}.doc`;
    downloadBlob(new Blob(['\ufeff', html], { type: 'application/msword' }), fileName);
}

export async function renderGrimoireScreen(container) {
    if (!container) {
        container = document.getElementById('content-display');
    }
    if (!container) return;

    container.innerHTML = `
        <div class="p-6 w-full max-w-6xl mx-auto">
            <div class="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6 border-b-2 border-gray-700 pb-3">
                <div>
                    <h2 class="text-3xl font-bold text-yellow-300">Grimorios e Diarios</h2>
                    <p class="text-sm text-gray-400 mt-1">Cada grimorio agora funciona como um livro separado, com seus proprios capitulos.</p>
                </div>
                <button id="delete-all-grimoires-btn" class="px-4 py-2 rounded-lg font-bold text-white bg-red-700 hover:bg-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    Apagar Todos os Grimorios
                </button>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="bg-gray-900/50 p-6 rounded-xl border border-gray-700 h-fit">
                    <h3 class="text-xl font-semibold text-white mb-4">Novo Livro</h3>
                    <form id="grimoire-form">
                        <div class="space-y-4">
                            <div>
                                <label for="grimoire-title" class="block text-sm font-semibold mb-1">Titulo</label>
                                <input type="text" id="grimoire-title" placeholder="Ex: Diario de Bordo" required class="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600">
                            </div>
                            <div>
                                <label for="grimoire-character" class="block text-sm font-semibold mb-1">Personagem Associado</label>
                                <select id="grimoire-character" required class="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600"></select>
                            </div>
                            <button type="submit" class="w-full py-2 px-6 rounded-lg font-bold text-white bg-yellow-600 hover:bg-yellow-700 transition-colors">Criar Livro</button>
                        </div>
                    </form>
                </div>

                <div id="grimoire-list-container" class="md:col-span-2 flex flex-col gap-4 h-fit"></div>
            </div>

            <div id="edit-metadata-modal" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[300]">
                <div class="bg-gray-900 border-2 border-yellow-800/50 text-white rounded-2xl shadow-2xl w-full max-w-md">
                    <div class="p-6">
                        <h3 class="text-xl font-bold text-yellow-300 mb-4">Editar Detalhes do Grimorio</h3>
                        <form id="edit-grimoire-metadata-form">
                            <input type="hidden" id="edit-grimoire-id">
                            <div class="space-y-4">
                                <div>
                                    <label for="edit-grimoire-title" class="block text-sm font-semibold mb-1">Titulo</label>
                                    <input type="text" id="edit-grimoire-title" required class="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600">
                                </div>
                                <div>
                                    <label for="edit-grimoire-character" class="block text-sm font-semibold mb-1">Personagem Associado</label>
                                    <select id="edit-grimoire-character" required class="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600"></select>
                                </div>
                                <div class="flex justify-end gap-3 pt-2">
                                    <button type="button" id="cancel-edit-btn" class="py-2 px-6 rounded-lg font-bold text-white bg-gray-600 hover:bg-gray-700 transition-colors">Cancelar</button>
                                    <button type="submit" class="py-2 px-6 rounded-lg font-bold text-white bg-green-600 hover:bg-green-700 transition-colors">Salvar Alteracoes</button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    `;

    await populateCharacterSelect('grimoire-character', false);
    await populateCharacterSelect('edit-grimoire-character', false);
    setupMetadataModalEventListeners();
    await loadAndDisplayGrimoires();

    const form = document.getElementById('grimoire-form');
    const deleteAllBtn = document.getElementById('delete-all-grimoires-btn');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const title = document.getElementById('grimoire-title').value.trim();
        const characterId = document.getElementById('grimoire-character').value;

        if (!title || !characterId) {
            showCustomAlert('Preencha todos os campos do grimorio.');
            return;
        }

        const grimoireData = {
            id: Date.now().toString(),
            title,
            characterId,
            entries: []
        };

        await saveData('rpgGrimoires', grimoireData);
        form.reset();
        await loadAndDisplayGrimoires();
    });

    if (deleteAllBtn) {
        deleteAllBtn.addEventListener('click', async () => {
            const allGrimoires = await getData('rpgGrimoires') || [];
            if (allGrimoires.length === 0) {
                showCustomAlert('Nao ha grimorios para apagar.');
                return;
            }

            const confirmed = await showCustomConfirm('Tem certeza que deseja apagar todos os grimorios?');
            if (!confirmed) return;

            for (const grimoire of allGrimoires) {
                await removeData('rpgGrimoires', grimoire.id);
            }

            const viewerContainer = document.getElementById('grimoire-editor-container');
            if (viewerContainer && !viewerContainer.classList.contains('hidden')) {
                closeGrimoireViewer(viewerContainer);
            }

            currentGrimoireData = null;
            currentChapterIndex = 0;
            await loadAndDisplayGrimoires();
            showCustomAlert('Todos os grimorios foram apagados.');
        });
    }
}

function setupMetadataModalEventListeners() {
    const modal = document.getElementById('edit-metadata-modal');
    const form = document.getElementById('edit-grimoire-metadata-form');
    const cancelBtn = document.getElementById('cancel-edit-btn');
    if (!modal || !form || !cancelBtn) return;

    cancelBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const grimoireId = document.getElementById('edit-grimoire-id').value;
        const title = document.getElementById('edit-grimoire-title').value.trim();
        const characterId = document.getElementById('edit-grimoire-character').value;

        if (!grimoireId || !title || !characterId) {
            showCustomAlert('Preencha todos os campos do grimorio.');
            return;
        }

        const grimoire = await getData('rpgGrimoires', grimoireId);
        if (!grimoire) {
            showCustomAlert('Grimorio nao encontrado.');
            return;
        }

        grimoire.title = title;
        delete grimoire.vol;
        grimoire.characterId = characterId;
        await saveData('rpgGrimoires', grimoire);

        if (currentGrimoireData && currentGrimoireData.id === grimoire.id) {
            currentGrimoireData = grimoire;
            updateOpenGrimoireHeader();
        }

        modal.classList.add('hidden');
        showCustomAlert('Detalhes do grimorio atualizados com sucesso.');
        await loadAndDisplayGrimoires();
    });
}

async function editGrimoireMetadata(grimoireId) {
    const grimoire = await getData('rpgGrimoires', grimoireId);
    if (!grimoire) {
        showCustomAlert('Grimorio nao encontrado.');
        return;
    }

    document.getElementById('edit-grimoire-id').value = grimoire.id;
    document.getElementById('edit-grimoire-title').value = grimoire.title;
    document.getElementById('edit-grimoire-character').value = grimoire.characterId;
    document.getElementById('edit-metadata-modal').classList.remove('hidden');
}

async function loadAndDisplayGrimoires() {
    const listContainer = document.getElementById('grimoire-list-container');
    if (!listContainer) return;

    const allGrimoires = await getData('rpgGrimoires') || [];
    const allCharacters = await getData('rpgCards') || [];
    const deleteAllBtn = document.getElementById('delete-all-grimoires-btn');
    const charactersById = allCharacters.reduce((acc, character) => {
        acc[character.id] = character;
        return acc;
    }, {});

    if (deleteAllBtn) {
        deleteAllBtn.disabled = allGrimoires.length === 0;
    }

    if (allGrimoires.length === 0) {
        listContainer.className = 'md:col-span-2';
        listContainer.innerHTML = '<p class="text-gray-500 italic">Nenhum grimorio criado ainda.</p>';
        return;
    }

    const sortedGrimoires = [...allGrimoires].sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }));
    listContainer.className = 'md:col-span-2 flex flex-col gap-4 h-fit';

    listContainer.innerHTML = sortedGrimoires.map((grimoire) => {
        const ownerName = charactersById[grimoire.characterId]?.title || 'Desconhecido';
        const chapterCount = grimoire.entries?.length || 0;
        const lastChapter = chapterCount > 0 ? grimoire.entries[chapterCount - 1] : null;
        return `
            <div class="bg-gray-800/50 rounded-lg border border-yellow-800/30 transition-all duration-300 hover:border-yellow-600/50 hover:shadow-xl hover:shadow-yellow-900/20 p-5">
                <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div class="flex items-start gap-4 min-w-0">
                        <i class="fas fa-book-open text-3xl text-yellow-400/70 mt-1 flex-shrink-0"></i>
                        <div class="min-w-0">
                            <h4 class="font-bold text-lg text-yellow-200 truncate">${escapeHtml(grimoire.title)}</h4>
                            <p class="text-xs text-gray-400">Propriedade de: ${escapeHtml(ownerName)}</p>
                            <p class="text-xs text-gray-400">${chapterCount} ${chapterCount === 1 ? 'capitulo' : 'capitulos'}</p>
                            <p class="text-xs text-gray-500 mt-2">${lastChapter ? `Ultimo capitulo: ${escapeHtml(lastChapter.subtitle || 'Sem titulo')}` : 'Livro vazio por enquanto.'}</p>
                        </div>
                    </div>
                    <div class="flex-shrink-0 flex items-center gap-2 flex-wrap md:justify-end">
                        <button class="w-10 h-10 text-sm rounded-md bg-indigo-600 hover:bg-indigo-700 flex items-center justify-center" data-action="view" data-id="${grimoire.id}" title="Abrir livro">
                            <i class="fas fa-book-reader"></i>
                        </button>
                        <button class="w-10 h-10 text-sm rounded-md bg-green-600 hover:bg-green-700 flex items-center justify-center" data-action="edit-content" data-id="${grimoire.id}" title="Editar capitulos">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="w-10 h-10 text-sm rounded-md bg-blue-600 hover:bg-blue-700 flex items-center justify-center" data-action="export-txt" data-id="${grimoire.id}" title="Baixar .txt">
                            <i class="fas fa-file-alt"></i>
                        </button>
                        <button class="w-10 h-10 text-sm rounded-md bg-sky-700 hover:bg-sky-800 flex items-center justify-center" data-action="export-doc" data-id="${grimoire.id}" title="Baixar .doc para Word">
                            <i class="fas fa-book-open"></i>
                        </button>
                        <button class="w-10 h-10 text-sm rounded-md bg-red-700 hover:bg-red-800 flex items-center justify-center" data-action="delete" data-id="${grimoire.id}" title="Excluir livro">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (listContainer._grimoireActionHandler) {
        listContainer.removeEventListener('click', listContainer._grimoireActionHandler);
    }

    const handleGrimoireActionClick = async (e) => {
        const button = e.target.closest('button[data-action]');
        if (!button || !listContainer.contains(button)) return;

        e.preventDefault();
        e.stopPropagation();

        const action = button.dataset.action;
        const id = button.dataset.id;

        if (action === 'delete') {
            if (await showCustomConfirm('Tem certeza que deseja excluir este grimorio?')) {
                await removeData('rpgGrimoires', id);
                if (currentGrimoireData?.id === id) {
                    const viewerContainer = document.getElementById('grimoire-editor-container');
                    if (viewerContainer && !viewerContainer.classList.contains('hidden')) {
                        closeGrimoireViewer(viewerContainer);
                    }
                    currentGrimoireData = null;
                    currentChapterIndex = 0;
                }
                await loadAndDisplayGrimoires();
            }
            return;
        }

        if (action === 'view' || action === 'edit-content') {
            const grimoireData = await getData('rpgGrimoires', id);
            if (!grimoireData) {
                showCustomAlert('Grimorio nao encontrado.');
                return;
            }

            await openGrimoireViewer(grimoireData, {
                readOnly: action === 'view',
                initialChapterIndex: 0
            });
            return;
        }

        if (action === 'export-txt') {
            await exportGrimoireToTxt(id);
            return;
        }

        if (action === 'export-doc') {
            await exportGrimoireToDoc(id);
            return;
        }
    };

    listContainer.addEventListener('click', handleGrimoireActionClick);
    listContainer._grimoireActionHandler = handleGrimoireActionClick;
}

async function openGrimoireViewer(grimoireData, options = {}) {
    const {
        readOnly = false,
        initialChapterIndex = 0
    } = options;

    currentGrimoireData = {
        ...grimoireData,
        entries: Array.isArray(grimoireData.entries) ? grimoireData.entries : []
    };
    currentChapterIndex = Math.max(0, Math.min(initialChapterIndex, Math.max(currentGrimoireData.entries.length - 1, 0)));
    entryImageFile = null;
    entryImageRemovalRequested = false;

    let container = document.getElementById('grimoire-editor-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'grimoire-editor-container';
    }

    if (container._keydownHandler) {
        document.removeEventListener('keydown', container._keydownHandler);
        delete container._keydownHandler;
    }

    container.dataset.readOnly = String(readOnly);
    document.body.appendChild(container);
    container.classList.remove('hidden');
    container.style.position = 'fixed';
    container.style.inset = '0';
    container.style.zIndex = '100000001';
    document.body.classList.add('overflow-hidden');

    const sidePanelHtml = readOnly
        ? `
            <aside class="w-full md:w-80 min-h-0 flex-shrink-0 flex flex-col gap-4">
                <div class="bg-black/20 rounded-xl p-4 flex flex-col h-full min-h-0 border border-gray-800/80">
                    <div class="flex items-center justify-between gap-3 mb-3">
                        <h3 class="text-lg font-bold text-yellow-200">Capitulos</h3>
                        <button id="open-editor-mode-btn" class="w-10 h-10 rounded-lg bg-green-600 hover:bg-green-700 flex items-center justify-center" title="Editar capitulos">
                            <i class="fas fa-pen"></i>
                        </button>
                    </div>
                    <div id="chapter-list" class="overflow-y-auto flex-grow min-h-0 pr-1 space-y-2"></div>
                </div>
            </aside>
        `
        : `
            <button id="toggle-editor-btn" class="md:hidden absolute bottom-4 right-4 z-20 w-12 h-12 bg-yellow-600 rounded-full flex items-center justify-center text-white shadow-lg">
                <i class="fas fa-pen"></i>
            </button>
            <aside id="editor-panel" class="absolute md:relative z-10 inset-0 md:inset-auto w-full h-full md:h-auto bg-gray-900 md:bg-transparent transform translate-x-full md:transform-none transition-transform duration-300 ease-in-out md:w-96 flex-shrink-0 flex flex-col gap-4 overflow-y-auto md:overflow-visible p-4 md:p-0 pb-24 md:pb-0">
                <div class="flex justify-between items-center md:hidden">
                    <h3 class="text-lg font-bold text-yellow-200">Editor de Capitulo</h3>
                    <button id="close-editor-panel-btn" class="w-8 h-8 text-gray-400 hover:text-white">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="bg-black/20 rounded-xl p-3 border border-gray-800/80 flex items-start justify-between gap-3">
                    <h3 class="font-bold text-yellow-200">Capitulos</h3>
                    <div class="flex items-center gap-2">
                        <button id="create-new-chapter-btn" class="w-10 h-10 rounded-lg bg-green-600 hover:bg-green-700 flex items-center justify-center" title="Novo capitulo">
                            <i class="fas fa-expand-arrows-alt"></i>
                        </button>
                        <button id="edit-grimoire-details-btn" class="w-10 h-10 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center" title="Editar detalhes do livro">
                            <i class="fas fa-undo"></i>
                        </button>
                    </div>
                </div>
                <div id="chapter-list" class="bg-black/20 rounded-xl p-2 overflow-y-auto min-h-[12rem] max-h-[16rem] md:h-56 md:max-h-none flex-shrink-0 border border-gray-800/80 space-y-2"></div>
                <form id="chapter-entry-form" class="bg-black/20 rounded-xl p-4 space-y-4 flex flex-col md:flex-grow border border-gray-800/80 flex-shrink-0">
                    <div>
                        <h4 id="form-mode-title" class="font-semibold text-lg text-yellow-100">Novo Capitulo</h4>
                        <p id="chapter-editor-subtitle" class="text-xs text-gray-400">Escreva um capitulo e salve no livro.</p>
                    </div>
                    <input type="hidden" id="editing-chapter-index" value="-1">
                    <div>
                        <label for="entry-subtitle" class="text-sm font-medium">Titulo do capitulo</label>
                        <input type="text" id="entry-subtitle" class="w-full mt-1 px-3 py-2 bg-gray-700 rounded-lg text-sm border border-gray-600">
                    </div>
                    <div class="flex flex-col md:flex-grow md:min-h-0">
                        <label for="entry-content" class="text-sm font-medium mb-1">Texto</label>
                        <textarea id="entry-content" class="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm resize-none border border-gray-600 min-h-[220px] h-60 md:h-auto md:flex-grow"></textarea>
                    </div>
                    <div class="rounded-xl border border-gray-800/80 bg-black/10 p-3 space-y-3">
                        <div class="flex items-start justify-between gap-3">
                            <div>
                                <label for="entry-image" class="text-sm font-medium">Imagem do capitulo</label>
                                <p id="entry-image-status" class="text-xs text-gray-400 mt-1">Sem imagem anexada.</p>
                            </div>
                            <button type="button" id="toggle-entry-image-btn" class="hidden px-3 py-1.5 rounded-lg border border-red-400/20 bg-red-500/15 text-red-200 hover:bg-red-500/25 text-xs font-semibold">
                                Remover imagem
                            </button>
                        </div>
                        <input type="file" id="entry-image" accept="image/*" class="w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-yellow-600 file:text-white hover:file:bg-yellow-700">
                        <img id="entry-image-preview" class="w-full h-32 object-contain hidden rounded-lg bg-black/20 border border-gray-800/80">
                    </div>
                    <div class="flex gap-2">
                        <button type="submit" id="save-entry-btn" class="flex-1 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 font-bold text-sm">Adicionar capitulo</button>
                        <button type="button" id="clear-form-btn" class="py-2.5 px-4 rounded-lg bg-gray-600 hover:bg-gray-500 font-bold text-sm">
                            Limpar
                        </button>
                    </div>
                </form>
            </aside>
        `;

    container.innerHTML = `
        <div id="grimoire-overlay" class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center" style="z-index: 100000001;">
            <div id="grimoire-modal-content" class="bg-gray-900 text-white shadow-2xl w-full h-full flex flex-col relative overflow-hidden">
                <div class="flex justify-between items-center p-4 border-b border-gray-700 flex-shrink-0 gap-4">
                    <div class="min-w-0">
                        <h2 id="grimoire-viewer-title" class="text-2xl font-bold text-yellow-300 truncate">${escapeHtml(currentGrimoireData.title)}</h2>
                        <p id="grimoire-viewer-meta" class="text-xs text-gray-400"></p>
                    </div>
                    <div class="flex items-center gap-2">
                        <button id="export-grimoire-txt-btn" class="w-10 h-10 rounded-md bg-blue-600 hover:bg-blue-700 flex items-center justify-center" title="Baixar .txt">
                            <i class="fas fa-scroll"></i>
                        </button>
                        <button id="export-grimoire-doc-btn" class="w-10 h-10 rounded-md bg-sky-700 hover:bg-sky-800 flex items-center justify-center" title="Baixar .doc para Word">
                            <i class="fas fa-book-open"></i>
                        </button>
                        <button id="close-grimoire-btn" class="text-gray-400 hover:text-white text-2xl w-8 h-8 rounded-full hover:bg-gray-700">&times;</button>
                    </div>
                </div>
                <div class="relative flex-grow min-h-0 flex flex-col md:flex-row p-2 md:p-4 gap-4 overflow-hidden">
                    <section id="chapter-viewer" class="w-full flex-1 min-h-0 flex flex-col bg-black/20 rounded-xl p-4 overflow-y-auto border border-gray-800/80"></section>
                    ${sidePanelHtml}
                </div>
            </div>
        </div>
    `;

    renderCurrentChapter(container);
    renderChapterList(container);
    updateOpenGrimoireHeader();
    setupGrimoireEventListeners(container);

    if (!readOnly) {
        if (currentGrimoireData.entries[currentChapterIndex]) {
            loadChapterIntoForm(container, currentChapterIndex);
        } else {
            clearChapterForm(container);
        }
    }
}

function updateOpenGrimoireHeader() {
    const container = document.getElementById('grimoire-editor-container');
    if (!container || container.classList.contains('hidden') || !currentGrimoireData) return;

    const titleEl = container.querySelector('#grimoire-viewer-title');
    const metaEl = container.querySelector('#grimoire-viewer-meta');
    const chapterCount = currentGrimoireData.entries.length;
    const modeLabel = container.dataset.readOnly === 'true' ? 'Modo leitura' : 'Modo edicao';

    if (titleEl) {
        titleEl.textContent = currentGrimoireData.title;
    }

    if (metaEl) {
        metaEl.textContent = `${modeLabel} . ${chapterCount} ${chapterCount === 1 ? 'capitulo' : 'capitulos'}`;
    }
}

function countWords(text) {
    const normalized = String(text || '').trim();
    if (!normalized) return 0;
    return normalized.split(/\s+/).filter(Boolean).length;
}

function buildChapterExcerpt(text) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return 'Capitulo em branco.';
    return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function hasChapterImage(chapter) {
    return Boolean(chapter?.image && chapter?.imageMimeType);
}

function cloneGrimoireEntry(entry) {
    return {
        subtitle: entry?.subtitle || '',
        content: entry?.content || '',
        image: entry?.image instanceof ArrayBuffer ? entry.image.slice(0) : (entry?.image || null),
        imageMimeType: entry?.imageMimeType || null
    };
}

function normalizeCurrentChapterIndex() {
    const totalEntries = currentGrimoireData?.entries?.length || 0;
    currentChapterIndex = Math.max(0, Math.min(currentChapterIndex, Math.max(totalEntries - 1, 0)));
}

function getEditingChapterIndex(container) {
    const value = container?.querySelector('#editing-chapter-index')?.value;
    const parsed = Number.parseInt(value ?? '-1', 10);
    return Number.isNaN(parsed) ? -1 : parsed;
}

function getEditingChapter(container) {
    const editingIndex = getEditingChapterIndex(container);
    return editingIndex > -1 ? currentGrimoireData.entries[editingIndex] : null;
}

function openEditorPanel(container) {
    container?.querySelector('#editor-panel')?.classList.remove('translate-x-full');
}

function closeEditorPanel(container) {
    container?.querySelector('#editor-panel')?.classList.add('translate-x-full');
}

function openFullscreenEditor(container) {
    const modal = container?.querySelector('#fullscreen-editor-modal');
    const smallTextarea = container?.querySelector('#entry-content');
    const largeTextarea = container?.querySelector('#fullscreen-textarea');
    if (!modal || !smallTextarea || !largeTextarea) return;

    container._fullscreenOriginalContent = smallTextarea.value;
    largeTextarea.value = smallTextarea.value;
    modal.classList.remove('hidden');
    largeTextarea.focus();
}

function closeFullscreenEditor(container, options = {}) {
    const { restoreOriginal = false } = options;
    const modal = container?.querySelector('#fullscreen-editor-modal');
    const smallTextarea = container?.querySelector('#entry-content');
    const largeTextarea = container?.querySelector('#fullscreen-textarea');
    if (!modal || !smallTextarea || !largeTextarea) return;

    if (restoreOriginal && typeof container._fullscreenOriginalContent === 'string') {
        smallTextarea.value = container._fullscreenOriginalContent;
        largeTextarea.value = container._fullscreenOriginalContent;
    }

    modal.classList.add('hidden');
    delete container._fullscreenOriginalContent;
}

function clearEntryImagePreview(container) {
    const imagePreview = container?.querySelector('#entry-image-preview');
    if (!imagePreview) return;

    if (container._entryPreviewUrl) {
        URL.revokeObjectURL(container._entryPreviewUrl);
        delete container._entryPreviewUrl;
    }

    imagePreview.classList.add('hidden');
    imagePreview.removeAttribute('src');
}

function setEntryImagePreview(container, objectUrl) {
    const imagePreview = container?.querySelector('#entry-image-preview');
    if (!imagePreview) return;

    clearEntryImagePreview(container);
    container._entryPreviewUrl = objectUrl;
    imagePreview.src = objectUrl;
    imagePreview.classList.remove('hidden');
}

function restoreEditingChapterImagePreview(container) {
    const chapter = getEditingChapter(container);
    if (!hasChapterImage(chapter) || entryImageRemovalRequested) {
        clearEntryImagePreview(container);
        return;
    }

    setEntryImagePreview(container, URL.createObjectURL(bufferToBlob(chapter.image, chapter.imageMimeType)));
}

function updateEntryImageUi(container) {
    const statusEl = container?.querySelector('#entry-image-status');
    const countEl = container?.querySelector('#entry-image-count');
    const toggleBtn = container?.querySelector('#toggle-entry-image-btn');
    if (!statusEl || !toggleBtn) return;

    const editingChapter = getEditingChapter(container);
    const hasExistingImage = hasChapterImage(editingChapter);

    toggleBtn.classList.remove('hidden', 'bg-emerald-500/15', 'text-emerald-200', 'hover:bg-emerald-500/25', 'bg-red-500/15', 'text-red-200', 'hover:bg-red-500/25');

    if (entryImageFile) {
        statusEl.textContent = 'Nova imagem pronta para salvar.';
        if (countEl) countEl.textContent = 'Nova';
        toggleBtn.textContent = 'Descartar troca';
        toggleBtn.classList.add('bg-red-500/15', 'text-red-200', 'hover:bg-red-500/25');
        return;
    }

    if (hasExistingImage && entryImageRemovalRequested) {
        statusEl.textContent = 'A imagem atual sera removida quando voce salvar.';
        if (countEl) countEl.textContent = 'Remover';
        toggleBtn.textContent = 'Restaurar imagem';
        toggleBtn.classList.add('bg-emerald-500/15', 'text-emerald-200', 'hover:bg-emerald-500/25');
        return;
    }

    if (hasExistingImage) {
        statusEl.textContent = 'A imagem atual sera mantida ate voce trocar ou remover.';
        if (countEl) countEl.textContent = '1 anexo';
        toggleBtn.textContent = 'Remover imagem';
        toggleBtn.classList.add('bg-red-500/15', 'text-red-200', 'hover:bg-red-500/25');
        return;
    }

    statusEl.textContent = 'Sem imagem anexada.';
    if (countEl) countEl.textContent = 'Nenhuma';
    toggleBtn.classList.add('hidden', 'bg-red-500/15', 'text-red-200', 'hover:bg-red-500/25');
}

function getCurrentChapterDraft(container) {
    if (!container || container.dataset.readOnly === 'true') return null;

    return {
        editingIndex: getEditingChapterIndex(container),
        subtitle: container.querySelector('#entry-subtitle')?.value || '',
        content: container.querySelector('#entry-content')?.value || '',
        hasNewImage: Boolean(entryImageFile),
        removeImage: entryImageRemovalRequested
    };
}

function getDraftBaseline(container) {
    const chapter = getEditingChapter(container);
    if (!chapter) {
        return {
            subtitle: '',
            content: '',
            hasNewImage: false,
            removeImage: false
        };
    }

    return {
        subtitle: chapter.subtitle || '',
        content: chapter.content || '',
        hasNewImage: false,
        removeImage: false
    };
}

function hasUnsavedChapterChanges(container) {
    const draft = getCurrentChapterDraft(container);
    if (!draft) return false;

    const baseline = getDraftBaseline(container);
    return draft.subtitle !== baseline.subtitle
        || draft.content !== baseline.content
        || draft.hasNewImage !== baseline.hasNewImage
        || draft.removeImage !== baseline.removeImage;
}

function updateChapterFormMeta(container) {
    const draft = getCurrentChapterDraft(container);
    if (!draft) return;

    const formModeTitle = container.querySelector('#form-mode-title');
    const subtitleEl = container.querySelector('#chapter-editor-subtitle');
    const wordCountEl = container.querySelector('#entry-word-count');
    const charCountEl = container.querySelector('#entry-char-count');
    const dirtyBadge = container.querySelector('#chapter-dirty-badge');
    const saveBtn = container.querySelector('#save-entry-btn');
    const isDirty = hasUnsavedChapterChanges(container);

    if (formModeTitle) {
        formModeTitle.textContent = draft.editingIndex > -1 ? `Editando Capitulo ${draft.editingIndex + 1}` : 'Novo Capitulo';
    }

    if (subtitleEl) {
        subtitleEl.textContent = draft.editingIndex > -1
            ? 'Revise o texto, a imagem e salve para atualizar o capitulo selecionado.'
            : 'Escreva um novo capitulo e salve no livro.';
    }

    if (wordCountEl) {
        wordCountEl.textContent = String(countWords(draft.content));
    }

    if (charCountEl) {
        charCountEl.textContent = String(draft.content.length);
    }

    if (dirtyBadge) {
        dirtyBadge.classList.toggle('hidden', !isDirty);
    }

    if (saveBtn) {
        saveBtn.textContent = draft.editingIndex > -1 ? 'Salvar alteracoes' : 'Adicionar capitulo';
    }
}

function refreshChapterFormState(container) {
    updateEntryImageUi(container);
    updateChapterFormMeta(container);
}

async function confirmDiscardDraft(container, actionDescription) {
    if (!container || container.dataset.readOnly === 'true' || !hasUnsavedChapterChanges(container)) {
        return true;
    }

    return showCustomConfirm(`Existem alteracoes nao salvas neste capitulo. Deseja descartalas para ${actionDescription}?`);
}

async function requestCloseGrimoireViewer(container) {
    if (!(await confirmDiscardDraft(container, 'fechar o grimorio'))) {
        return;
    }

    closeGrimoireViewer(container);
}

async function selectChapter(container, chapterIndex, options = {}) {
    const {
        loadForm = container?.dataset.readOnly !== 'true',
        focusEditor = false
    } = options;

    if (!currentGrimoireData?.entries?.[chapterIndex]) {
        return false;
    }

    const editingIndex = getEditingChapterIndex(container);
    const changingDraftTarget = loadForm && editingIndex !== chapterIndex;
    if (changingDraftTarget && !(await confirmDiscardDraft(container, 'abrir outro capitulo'))) {
        return false;
    }

    currentChapterIndex = chapterIndex;
    renderCurrentChapter(container);

    if (loadForm) {
        loadChapterIntoForm(container, chapterIndex);
        if (focusEditor) {
            openEditorPanel(container);
            container.querySelector('#entry-subtitle')?.focus();
        }
    } else {
        renderChapterList(container);
    }

    return true;
}

function clearChapterForm(container) {
    const form = container?.querySelector('#chapter-entry-form');
    if (form) form.reset();

    closeFullscreenEditor(container);

    const editingIndexInput = container?.querySelector('#editing-chapter-index');
    if (editingIndexInput) editingIndexInput.value = '-1';

    const fullscreenTextarea = container?.querySelector('#fullscreen-textarea');
    if (fullscreenTextarea) fullscreenTextarea.value = '';

    entryImageFile = null;
    entryImageRemovalRequested = false;
    clearEntryImagePreview(container);

    renderChapterList(container);
    refreshChapterFormState(container);
}

function loadChapterIntoForm(container, chapterIndex) {
    const chapter = currentGrimoireData.entries[chapterIndex];
    if (!chapter) return;

    closeFullscreenEditor(container);

    container.querySelector('#editing-chapter-index').value = String(chapterIndex);
    container.querySelector('#entry-subtitle').value = chapter.subtitle || '';
    container.querySelector('#entry-content').value = chapter.content || '';

    const fullscreenTextarea = container.querySelector('#fullscreen-textarea');
    if (fullscreenTextarea) {
        fullscreenTextarea.value = chapter.content || '';
    }

    entryImageFile = null;
    entryImageRemovalRequested = false;

    const imageInput = container.querySelector('#entry-image');
    if (imageInput) imageInput.value = '';

    if (hasChapterImage(chapter)) {
        setEntryImagePreview(container, URL.createObjectURL(bufferToBlob(chapter.image, chapter.imageMimeType)));
    } else {
        clearEntryImagePreview(container);
    }

    renderChapterList(container);
    refreshChapterFormState(container);
}

async function saveChapterForm(container) {
    const subtitle = container.querySelector('#entry-subtitle').value.trim();
    const content = container.querySelector('#entry-content').value;
    const editingIndex = getEditingChapterIndex(container);
    const isNewChapter = editingIndex < 0;

    if (isNewChapter && !subtitle && !content.trim() && !entryImageFile) {
        showCustomAlert('Escreva algo ou anexe uma imagem antes de salvar um novo capitulo.');
        return;
    }

    closeFullscreenEditor(container);

    const imageBuffer = entryImageFile ? await readFileAsArrayBuffer(entryImageFile) : null;
    const imageMimeType = entryImageFile ? entryImageFile.type : null;

    if (isNewChapter) {
        currentGrimoireData.entries.push({
            subtitle,
            content,
            image: imageBuffer,
            imageMimeType
        });
        currentChapterIndex = currentGrimoireData.entries.length - 1;
    } else {
        const chapter = currentGrimoireData.entries[editingIndex];
        if (!chapter) {
            showCustomAlert('Capitulo nao encontrado.');
            return;
        }

        chapter.subtitle = subtitle;
        chapter.content = content;

        if (entryImageFile) {
            chapter.image = imageBuffer;
            chapter.imageMimeType = imageMimeType;
        } else if (entryImageRemovalRequested) {
            chapter.image = null;
            chapter.imageMimeType = null;
        }

        currentChapterIndex = editingIndex;
    }

    await saveData('rpgGrimoires', currentGrimoireData);

    entryImageFile = null;
    entryImageRemovalRequested = false;

    renderCurrentChapter(container);
    updateOpenGrimoireHeader();
    loadChapterIntoForm(container, currentChapterIndex);
    await loadAndDisplayGrimoires();
}

async function moveChapter(container, chapterIndex, direction) {
    const targetIndex = chapterIndex + direction;
    if (targetIndex < 0 || targetIndex >= currentGrimoireData.entries.length) return;

    if (!(await confirmDiscardDraft(container, 'reorganizar os capitulos'))) {
        return;
    }

    const [chapter] = currentGrimoireData.entries.splice(chapterIndex, 1);
    currentGrimoireData.entries.splice(targetIndex, 0, chapter);
    currentChapterIndex = targetIndex;

    await saveData('rpgGrimoires', currentGrimoireData);

    renderCurrentChapter(container);
    updateOpenGrimoireHeader();
    loadChapterIntoForm(container, targetIndex);
    await loadAndDisplayGrimoires();
}

async function duplicateChapter(container, chapterIndex) {
    const chapter = currentGrimoireData.entries[chapterIndex];
    if (!chapter) return;

    if (!(await confirmDiscardDraft(container, 'duplicar um capitulo'))) {
        return;
    }

    const duplicatedEntry = cloneGrimoireEntry(chapter);
    duplicatedEntry.subtitle = duplicatedEntry.subtitle
        ? `${duplicatedEntry.subtitle} (Copia)`
        : `Capitulo ${chapterIndex + 2}`;

    currentGrimoireData.entries.splice(chapterIndex + 1, 0, duplicatedEntry);
    currentChapterIndex = chapterIndex + 1;

    await saveData('rpgGrimoires', currentGrimoireData);

    renderCurrentChapter(container);
    updateOpenGrimoireHeader();
    loadChapterIntoForm(container, currentChapterIndex);
    openEditorPanel(container);
    await loadAndDisplayGrimoires();
}

async function deleteChapter(container, chapterIndex) {
    const chapter = currentGrimoireData.entries[chapterIndex];
    if (!chapter) return;

    if (!(await confirmDiscardDraft(container, 'excluir um capitulo'))) {
        return;
    }

    const confirmed = await showCustomConfirm(`Deseja excluir o capitulo ${chapterIndex + 1}?`);
    if (!confirmed) return;

    currentGrimoireData.entries.splice(chapterIndex, 1);
    normalizeCurrentChapterIndex();

    await saveData('rpgGrimoires', currentGrimoireData);

    renderCurrentChapter(container);
    updateOpenGrimoireHeader();

    if (currentGrimoireData.entries[currentChapterIndex]) {
        loadChapterIntoForm(container, currentChapterIndex);
    } else {
        clearChapterForm(container);
    }

    await loadAndDisplayGrimoires();
}

function closeGrimoireViewer(container) {
    if (!container) return;

    if (container._currentImageUrl) {
        URL.revokeObjectURL(container._currentImageUrl);
        delete container._currentImageUrl;
    }

    clearEntryImagePreview(container);
    closeFullscreenEditor(container);

    if (container._keydownHandler) {
        document.removeEventListener('keydown', container._keydownHandler);
        delete container._keydownHandler;
    }

    entryImageFile = null;
    entryImageRemovalRequested = false;

    container.innerHTML = '';
    container.classList.add('hidden');
    container.removeAttribute('style');
    delete container.dataset.readOnly;
    document.body.classList.remove('overflow-hidden');
}

function renderCurrentChapter(container) {
    const viewer = container.querySelector('#chapter-viewer');
    if (!viewer) return;

    if (container._currentImageUrl) {
        URL.revokeObjectURL(container._currentImageUrl);
        delete container._currentImageUrl;
    }

    normalizeCurrentChapterIndex();
    const chapter = currentGrimoireData.entries[currentChapterIndex];
    if (!chapter) {
        const emptyMessage = container.dataset.readOnly === 'true'
            ? 'Este grimorio ainda nao possui capitulos.'
            : 'Este grimorio ainda nao possui capitulos. Use o editor ao lado para criar o primeiro.';

        viewer.innerHTML = `
            <div class="m-auto text-center text-gray-500 max-w-sm">
                <i class="fas fa-book-dead text-4xl mb-3 text-gray-600"></i>
                <p class="text-sm leading-relaxed">${emptyMessage}</p>
            </div>
        `;
        return;
    }

    const wordCount = countWords(chapter.content);
    const chapterHasImage = hasChapterImage(chapter);

    let imageHtml = '';
    if (chapterHasImage) {
        const imageUrl = URL.createObjectURL(bufferToBlob(chapter.image, chapter.imageMimeType));
        container._currentImageUrl = imageUrl;
        imageHtml = `
            <div class="mt-5">
                <img src="${imageUrl}" class="w-full max-h-[360px] object-contain rounded-xl shadow-lg border border-gray-700 bg-black/20" alt="${escapeHtml(chapter.subtitle || `Capitulo ${currentChapterIndex + 1}`)}">
            </div>
        `;
    }

    viewer.innerHTML = `
        <div class="flex justify-between items-start mb-5 gap-4 flex-shrink-0">
            <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap mb-2">
                    <span class="rounded-full bg-yellow-500/10 border border-yellow-400/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-yellow-100">Capitulo ${currentChapterIndex + 1}</span>
                    <span class="rounded-full bg-slate-800 px-3 py-1 text-[11px] font-semibold text-gray-300">${wordCount} ${wordCount === 1 ? 'palavra' : 'palavras'}</span>
                    ${chapterHasImage ? '<span class="rounded-full bg-sky-500/10 border border-sky-400/15 px-3 py-1 text-[11px] font-semibold text-sky-200">Imagem anexada</span>' : ''}
                </div>
                <h3 class="text-2xl font-bold text-yellow-100 break-words">${escapeHtml(chapter.subtitle || 'Sem titulo')}</h3>
            </div>
            <span class="text-sm text-gray-400 flex-shrink-0">${currentChapterIndex + 1} de ${currentGrimoireData.entries.length}</span>
        </div>
        <div class="flex-grow overflow-y-auto pr-2">
            <div class="prose prose-invert prose-sm max-w-none text-gray-300 leading-relaxed" style="text-align: justify;">
                ${formatTextForHtml(chapter.content || 'Este capitulo esta em branco.')}
            </div>
            ${imageHtml}
        </div>
        <div class="flex justify-center items-center gap-4 mt-4 pt-4 border-t border-gray-700 flex-shrink-0">
            <button id="prev-chapter-btn" class="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50" ${currentChapterIndex === 0 ? 'disabled' : ''}>Anterior</button>
            <button id="next-chapter-btn" class="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50" ${currentChapterIndex >= currentGrimoireData.entries.length - 1 ? 'disabled' : ''}>Proximo</button>
        </div>
    `;
}

function renderChapterList(container) {
    const listEl = container.querySelector('#chapter-list');
    if (!listEl) return;

    const isReadOnly = container.dataset.readOnly === 'true';
    const editingIndex = getEditingChapterIndex(container);

    if (currentGrimoireData.entries.length === 0) {
        listEl.innerHTML = '<p class="text-center text-xs text-gray-500 p-4">Nenhum capitulo ainda.</p>';
        return;
    }

    listEl.innerHTML = currentGrimoireData.entries.map((entry, index) => {
        const isActive = index === currentChapterIndex;
        const isEditing = index === editingIndex;

        return `
            <div class="rounded-lg border ${isActive ? 'border-indigo-500/60 bg-indigo-600/15' : 'border-gray-800/80 bg-black/10 hover:border-gray-700 hover:bg-gray-800/30'} p-3 transition-colors">
                <div class="flex items-center justify-between gap-2">
                    <button type="button" class="min-w-0 flex-1 text-left" data-action="select-chapter" data-chapter-index="${index}">
                        <p class="text-[10px] uppercase tracking-[0.18em] text-gray-400">Capitulo ${index + 1}</p>
                        <p class="mt-1 text-sm font-semibold text-white truncate">${escapeHtml(entry.subtitle || 'Sem titulo')}</p>
                        ${isEditing ? '<p class="text-[11px] text-amber-200 mt-1">Em edicao</p>' : ''}
                    </button>
                    ${isReadOnly ? '' : `
                        <div class="flex items-center gap-1 flex-shrink-0">
                            <button type="button" class="w-8 h-8 rounded-md bg-green-700/70 hover:bg-green-700 text-xs" data-action="edit-chapter" data-chapter-index="${index}" title="Editar capitulo">
                                <i class="fas fa-pen"></i>
                            </button>
                            <button type="button" class="w-8 h-8 rounded-md bg-red-700/70 hover:bg-red-700 text-xs" data-action="delete-chapter" data-chapter-index="${index}" title="Excluir capitulo">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    `}
                </div>
            </div>
        `;
    }).join('');
}

function setupGrimoireEventListeners(container) {
    if (!container) return;

    const isReadOnly = container.dataset.readOnly === 'true';
    const closeBtn = container.querySelector('#close-grimoire-btn');
    const overlay = container.querySelector('#grimoire-overlay');
    const viewer = container.querySelector('#chapter-viewer');
    const chapterList = container.querySelector('#chapter-list');
    const exportTxtBtn = container.querySelector('#export-grimoire-txt-btn');
    const exportDocBtn = container.querySelector('#export-grimoire-doc-btn');

    if (closeBtn) {
        closeBtn.addEventListener('click', async () => {
            await requestCloseGrimoireViewer(container);
        });
    }

    if (exportTxtBtn) {
        exportTxtBtn.addEventListener('click', async () => {
            await exportGrimoireToTxt(currentGrimoireData.id);
        });
    }

    if (exportDocBtn) {
        exportDocBtn.addEventListener('click', async () => {
            await exportGrimoireToDoc(currentGrimoireData.id);
        });
    }

    if (overlay) {
        overlay.addEventListener('click', async (e) => {
            if (e.target === overlay) {
                await requestCloseGrimoireViewer(container);
            }
        });
    }

    container._keydownHandler = async (e) => {
        if (e.key === 'Escape') {
            const fullscreenModal = container.querySelector('#fullscreen-editor-modal');
            const isFullscreenOpen = Boolean(fullscreenModal && !fullscreenModal.classList.contains('hidden'));

            if (isFullscreenOpen) {
                e.preventDefault();
                closeFullscreenEditor(container, { restoreOriginal: true });
                refreshChapterFormState(container);
                return;
            }

            e.preventDefault();
            await requestCloseGrimoireViewer(container);
            return;
        }

        if (!isReadOnly && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            container.querySelector('#chapter-entry-form')?.requestSubmit();
        }
    };
    document.addEventListener('keydown', container._keydownHandler);

    if (viewer) {
        viewer.addEventListener('click', async (e) => {
            const prevBtn = e.target.closest('#prev-chapter-btn');
            const nextBtn = e.target.closest('#next-chapter-btn');

            if (prevBtn && currentChapterIndex > 0) {
                await selectChapter(container, currentChapterIndex - 1, {
                    loadForm: !isReadOnly
                });
            }

            if (nextBtn && currentChapterIndex < currentGrimoireData.entries.length - 1) {
                await selectChapter(container, currentChapterIndex + 1, {
                    loadForm: !isReadOnly
                });
            }
        });
    }

    if (chapterList) {
        chapterList.addEventListener('click', async (e) => {
            const actionTarget = e.target.closest('[data-action][data-chapter-index]');
            if (!actionTarget) return;

            const chapterIndex = Number.parseInt(actionTarget.dataset.chapterIndex, 10);
            const action = actionTarget.dataset.action;
            if (Number.isNaN(chapterIndex)) return;

            if (action === 'select-chapter') {
                await selectChapter(container, chapterIndex, {
                    loadForm: !isReadOnly,
                    focusEditor: !isReadOnly
                });
                return;
            }

            if (action === 'edit-chapter') {
                await selectChapter(container, chapterIndex, {
                    loadForm: true,
                    focusEditor: true
                });
                return;
            }

            if (action === 'delete-chapter') {
                await deleteChapter(container, chapterIndex);
            }
        });
    }

    const openEditorModeBtn = container.querySelector('#open-editor-mode-btn');
    if (openEditorModeBtn) {
        openEditorModeBtn.addEventListener('click', async () => {
            await openGrimoireViewer(currentGrimoireData, {
                readOnly: false,
                initialChapterIndex: currentChapterIndex
            });
        });
    }

    if (isReadOnly) {
        return;
    }

    const editDetailsBtn = container.querySelector('#edit-grimoire-details-btn');
    const createNewChapterBtn = container.querySelector('#create-new-chapter-btn');
    const toggleEditorBtn = container.querySelector('#toggle-editor-btn');
    const closeEditorPanelBtn = container.querySelector('#close-editor-panel-btn');
    const form = container.querySelector('#chapter-entry-form');
    const imageInput = container.querySelector('#entry-image');
    const clearFormBtn = container.querySelector('#clear-form-btn');
    const expandBtn = container.querySelector('#expand-textarea-btn');
    const smallTextarea = container.querySelector('#entry-content');
    const largeTextarea = container.querySelector('#fullscreen-textarea');
    const saveExpandedBtn = container.querySelector('#save-expanded-content');
    const cancelExpandedBtn = container.querySelector('#cancel-expanded-content');
    const toggleEntryImageBtn = container.querySelector('#toggle-entry-image-btn');
    const subtitleInput = container.querySelector('#entry-subtitle');

    if (editDetailsBtn) {
        editDetailsBtn.addEventListener('click', () => editGrimoireMetadata(currentGrimoireData.id));
    }

    if (createNewChapterBtn) {
        createNewChapterBtn.addEventListener('click', async () => {
            if (!(await confirmDiscardDraft(container, 'criar um novo rascunho'))) {
                return;
            }

            clearChapterForm(container);
            openEditorPanel(container);
            container.querySelector('#entry-subtitle')?.focus();
        });
    }

    if (toggleEditorBtn) {
        toggleEditorBtn.addEventListener('click', () => openEditorPanel(container));
    }

    if (closeEditorPanelBtn) {
        closeEditorPanelBtn.addEventListener('click', () => closeEditorPanel(container));
    }

    if (subtitleInput) {
        subtitleInput.addEventListener('input', () => refreshChapterFormState(container));
    }

    if (smallTextarea) {
        smallTextarea.addEventListener('input', () => {
            if (largeTextarea && !container.querySelector('#fullscreen-editor-modal')?.classList.contains('hidden')) {
                largeTextarea.value = smallTextarea.value;
            }
            refreshChapterFormState(container);
        });
    }

    if (imageInput) {
        imageInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            entryImageFile = file || null;
            entryImageRemovalRequested = false;

            if (file) {
                setEntryImagePreview(container, URL.createObjectURL(file));
            } else {
                restoreEditingChapterImagePreview(container);
            }

            refreshChapterFormState(container);
        });
    }

    if (toggleEntryImageBtn) {
        toggleEntryImageBtn.addEventListener('click', () => {
            const imageInputEl = container.querySelector('#entry-image');

            if (entryImageFile) {
                entryImageFile = null;
                if (imageInputEl) imageInputEl.value = '';
                restoreEditingChapterImagePreview(container);
                refreshChapterFormState(container);
                return;
            }

            if (hasChapterImage(getEditingChapter(container))) {
                entryImageRemovalRequested = !entryImageRemovalRequested;
                if (entryImageRemovalRequested) {
                    clearEntryImagePreview(container);
                } else {
                    restoreEditingChapterImagePreview(container);
                }
            }

            refreshChapterFormState(container);
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveChapterForm(container);
        });
    }

    if (clearFormBtn) {
        clearFormBtn.addEventListener('click', async () => {
            if (!(await confirmDiscardDraft(container, 'limpar o rascunho atual'))) {
                return;
            }

            clearChapterForm(container);
            container.querySelector('#entry-subtitle')?.focus();
        });
    }

    if (expandBtn) {
        expandBtn.addEventListener('click', () => openFullscreenEditor(container));
    }

    if (largeTextarea && smallTextarea) {
        largeTextarea.addEventListener('input', () => {
            smallTextarea.value = largeTextarea.value;
            refreshChapterFormState(container);
        });
    }

    if (saveExpandedBtn) {
        saveExpandedBtn.addEventListener('click', () => {
            closeFullscreenEditor(container);
            refreshChapterFormState(container);
        });
    }

    if (cancelExpandedBtn) {
        cancelExpandedBtn.addEventListener('click', () => {
            closeFullscreenEditor(container, { restoreOriginal: true });
            refreshChapterFormState(container);
        });
    }

    refreshChapterFormState(container);
}
