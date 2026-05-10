import { saveData, getData, removeData } from './local_db.js';
import { showCustomAlert, showCustomConfirm } from './ui_utils.js';

const CATEGORY_TYPES = {
    magia: "Magias",
    habilidade: "Habilidades",
    item: "Itens",
    ataque: "Ataques"
};

const ITEM_STORES_TO_CHECK = [
    'rpgEffects',  // Armazena magias, habilidades e ataques
    'rpgItems',
];

/**
 * Salva uma nova categoria ou atualiza uma existente no banco de dados.
 */
async function saveCategory(name, type, description, editId = null) {
    if (!name || !type) {
        showCustomAlert("Por favor, insira um nome e selecione um tipo para a categoria.");
        return;
    }
    
    const category = {
        id: editId || Date.now().toString(),
        name: name.trim(),
        type: type,
        description: description.trim()
    };
    
    await saveData('rpgCategories', category);
    document.dispatchEvent(new CustomEvent('dataChanged', { detail: { type: 'categorias' } }));
}


/**
 * Procura em todos os armazenamentos de dados de itens e remove a referência
 * da categoria excluída, definindo o campo 'categoryId' do item como "".
 */
async function clearCategoryFromItems(categoryId) {
  for (const storeName of ITEM_STORES_TO_CHECK) {
    try {
      const allItems = await getData(storeName);
      if (!Array.isArray(allItems)) continue;

      for (const item of allItems) {
        if (item.categoryId === categoryId) {
          item.categoryId = ""; 
          await saveData(storeName, item); // Salva o item individualmente após a modificação
        }
      }

    } catch (error) {
      if (error.name === 'NotFoundError') {
        console.warn(`[IGNORADO] O armazenamento de dados '${storeName}' não foi encontrado.`);
      } else {
        console.error(`Erro ao limpar categoria em '${storeName}':`, error);
      }
    }
  }
}


/**
 * Exclui uma categoria do banco de dados, e limpa as referências nos itens.
 */
async function deleteCategory(id) {
    if (await showCustomConfirm("Tem certeza que deseja excluir esta categoria? Os itens que a utilizavam ficarão como 'Sem Categoria'.")) {
        
        // 1. Limpa a referência da categoria nos itens antes de excluir a categoria
        await clearCategoryFromItems(id); 

        // 2. Remove a categoria do banco de dados
        await removeData('rpgCategories', id);
        
        // 3. Dispara um evento para notificar toda a aplicação que os dados mudaram.
        document.dispatchEvent(new CustomEvent('dataChanged', { detail: { type: 'categorias' } }));
    }
}

/**
 * Renderiza a tela de gerenciamento de categorias.
 */
export async function renderCategoryScreen(container) {
    // Se o container não for passado (compatibilidade), usa o content-display global e limpa.
    // Se for passado, assume que é limpo pelo chamador ou é um container novo.
    if (!container) {
        container = document.getElementById('content-display');
        container.innerHTML = '';
    }
    
    container.innerHTML = `
        <div id="category-management-section" class="w-full h-full p-6 flex flex-col items-center overflow-y-auto">
            <div class="w-full max-w-4xl">
                <h2 class="text-3xl font-bold text-indigo-300 mb-6 border-b-2 border-gray-700 pb-2">Gerenciar Categorias</h2>
                
                <!-- Formulário de Adição -->
                <div class="bg-gray-900/50 p-6 rounded-xl border border-gray-700 mb-8">
                    <h3 class="text-xl font-semibold text-white mb-4">Nova Categoria</h3>
                    <form id="add-category-form" class="space-y-4">
                        <div class="flex flex-col md:flex-row gap-4">
                            <div class="flex-grow">
                                <label for="category-name" class="block text-sm font-semibold mb-1">Nome</label>
                                <input type="text" id="category-name" placeholder="Ex: Fogo, Cura, Arma Leve" required class="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600">
                            </div>
                            <div class="w-full md:w-48">
                                <label for="category-type" class="block text-sm font-semibold mb-1">Tipo</label>
                                <select id="category-type" required class="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600">
                                    <option value="" disabled selected>Selecione...</option>
                                    <option value="magia">Magia</option>
                                    <option value="habilidade">Habilidade</option>
                                    <option value="item">Item</option>
                                    <option value="ataque">Ataque</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label for="category-description" class="block text-sm font-semibold mb-1">Descrição (Opcional)</label>
                            <textarea id="category-description" rows="2" placeholder="Uma breve explicação sobre esta categoria..." class="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600"></textarea>
                        </div>
                        <button type="submit" class="w-full md:w-auto py-2 px-6 rounded-lg font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors self-end">Adicionar</button>
                    </form>
                </div>

                <!-- Listas de Categorias -->
                <div id="category-lists-container" class="grid md:grid-cols-2 gap-6">
                    <!-- As listas serão inseridas aqui -->
                </div>
            </div>
        </div>
    `;

    const form = document.getElementById('add-category-form');
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('category-name');
        const typeSelect = document.getElementById('category-type');
        const descriptionInput = document.getElementById('category-description');
        const submitButton = form.querySelector('button[type="submit"]');
        const editId = submitButton.dataset.editId || null;
        
        saveCategory(nameInput.value, typeSelect.value, descriptionInput.value, editId);
        
        // Resetar o formulário e o botão
        form.reset();
        submitButton.textContent = 'Adicionar';
        delete submitButton.dataset.editId;
    });

    const listsContainer = document.getElementById('category-lists-container');
    listsContainer.innerHTML = '';
    const allCategories = await getData('rpgCategories') || [];

    for (const type in CATEGORY_TYPES) {
        const categoriesOfType = allCategories.filter(c => c.type === type);
        const listContainer = document.createElement('div');
        listContainer.className = 'bg-gray-800/50 p-4 rounded-lg';
        
        let itemsHtml = '<p class="text-gray-500 text-sm italic">Nenhuma categoria adicionada.</p>';
        if (categoriesOfType.length > 0) {
            itemsHtml = categoriesOfType.map(cat => `
                <div class="bg-gray-700/50 p-2 rounded-md">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="font-medium category-item" data-id="${cat.id}" data-name="${cat.name}" data-type="${cat.type}" data-description="${cat.description || ''}" style="cursor: pointer;">${cat.name}</span>
                            ${cat.description ? `<button data-desc-id="desc-${cat.id}" class="toggle-desc-btn text-gray-400 hover:text-white text-xs w-5 h-5 rounded-full bg-gray-600 flex items-center justify-center font-bold">?</button>` : ''}
                        </div>
                        <button data-id="${cat.id}" class="delete-category-btn text-red-500 hover:text-red-400 text-lg" title="Excluir Categoria">&times;</button>
                    </div>
                    ${cat.description ? `<p id="desc-${cat.id}" class="text-xs text-gray-300 mt-2 pt-2 border-t border-gray-600 hidden">${cat.description}</p>` : ''}
                </div>
            `).join('');
        }

        listContainer.innerHTML = `
            <h4 class="text-lg font-semibold text-indigo-200 mb-3">${CATEGORY_TYPES[type]}</h4>
            <div class="space-y-2">${itemsHtml}</div>
        `;

        listsContainer.appendChild(listContainer);
    }
    
    listsContainer.querySelectorAll('.delete-category-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteCategory(btn.dataset.id));
    });
    
    listsContainer.querySelectorAll('.toggle-desc-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const descId = btn.dataset.descId;
            const descEl = document.getElementById(descId);
            if (descEl) {
                descEl.classList.toggle('hidden');
            }
        });
    });
    
    // Adiciona evento de clique para os itens de categoria
    listsContainer.querySelectorAll('.category-item').forEach(item => {
        item.addEventListener('click', () => {
            // Preenche os campos do formulário com os dados da categoria
            document.getElementById('category-name').value = item.dataset.name;
            document.getElementById('category-type').value = item.dataset.type;
            document.getElementById('category-description').value = item.dataset.description;
            
            // Modifica o botão para indicar que está editando
            const submitButton = document.querySelector('#add-category-form button[type="submit"]');
            submitButton.textContent = 'Atualizar';
            submitButton.dataset.editId = item.dataset.id;
            
            // Rola a página para o formulário
            document.getElementById('add-category-form').scrollIntoView({ behavior: 'smooth' });
        });
    });
}


/**
 * Popula um elemento <select> com as categorias de um tipo específico.
 */
export async function populateCategorySelect(selectId, itemType) {
    const selectElement = document.getElementById(selectId);
    if (!selectElement) return;

    selectElement.innerHTML = '<option value="">Sem Categoria</option>';
    
    const allCategories = await getData('rpgCategories') || [];
    const relevantCategories = allCategories.filter(c => c.type === itemType);

    relevantCategories.sort((a,b) => a.name.localeCompare(b.name)).forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = cat.name;
        selectElement.appendChild(option);
    });
}