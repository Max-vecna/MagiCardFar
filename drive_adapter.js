// drive_adapter.js
import { showCustomAlert, showTopAlert } from './ui_utils.js';

// --- CONFIGURAÇÃO ---
const CLIENT_ID = '482226146549-8eej5aii7eh2phesneh7qjeq5gtse8s5.apps.googleusercontent.com'; 
const API_KEY = 'AIzaSyCYcqir8zIlJFtnOctoZoJJCpAh2Bd0aC8'; 
const SCOPES = 'https://www.googleapis.com/auth/drive.file'; 
const DB_FILE_NAME = 'rpg_manager_db.json';
const GOOGLE_API_SCRIPT = 'https://apis.google.com/js/api.js';
const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client';

let tokenClient;
let gapiInited = false;
let gisInited = false;
let isAuthenticated = false;
let googleLibrariesPromise = null;

// Evento para avisar o app que o Drive está pronto
const driveReadyEvent = new Event('driveReady');

// --- Gerenciamento de Persistência do Token ---

function saveTokenToStorage(tokenResponse) {
    // O tokenResponse vem do callback do GIS e contém 'access_token' e 'expires_in'
    if (tokenResponse && tokenResponse.access_token) {
        const expiry = Date.now() + (tokenResponse.expires_in * 1000); // Converte segundos para ms
        const tokenData = {
            access_token: tokenResponse.access_token,
            expiry: expiry
        };
        localStorage.setItem('gdrive_token_data', JSON.stringify(tokenData));
    }
}

function loadTokenFromStorage() {
    try {
        const jsonToken = localStorage.getItem('gdrive_token_data');
        if (jsonToken) {
            const tokenData = JSON.parse(jsonToken);
            // Verifica se ainda é válido (damos uma margem de segurança de 1 minuto)
            if (Date.now() < (tokenData.expiry - 60000)) {
                // Restaura o token no gapi
                gapi.client.setToken({
                    access_token: tokenData.access_token
                });
                return true;
            } else {
                // Token expirado
                clearTokenStorage();
            }
        }
    } catch (e) {
        console.error("Erro ao ler token salvo:", e);
        clearTokenStorage();
    }
    return false;
}

function clearTokenStorage() {
    localStorage.removeItem('gdrive_token_data');
}


// --- Função de Espera ---
function loadExternalScript(src) {
    return new Promise((resolve, reject) => {
        const existingScript = document.querySelector(`script[src="${src}"]`);
        if (existingScript) {
            if (existingScript.dataset.loaded === 'true') {
                resolve();
                return;
            }

            existingScript.addEventListener('load', () => {
                existingScript.dataset.loaded = 'true';
                resolve();
            }, { once: true });
            existingScript.addEventListener('error', reject, { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.defer = true;
        script.addEventListener('load', () => {
            script.dataset.loaded = 'true';
            resolve();
        }, { once: true });
        script.addEventListener('error', reject, { once: true });
        document.head.appendChild(script);
    });
}

function waitForGoogleLibraries() {
    if (!googleLibrariesPromise) {
        googleLibrariesPromise = Promise.all([
            loadExternalScript(GOOGLE_API_SCRIPT),
            loadExternalScript(GOOGLE_IDENTITY_SCRIPT)
        ]).then(() => new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 100;

            const check = () => {
                if (typeof gapi !== 'undefined' && typeof google !== 'undefined' && google.accounts) {
                    resolve();
                } else if (attempts >= maxAttempts) {
                    reject(new Error('Bibliotecas do Google nao ficaram disponiveis a tempo.'));
                } else {
                    attempts += 1;
                    setTimeout(check, 100);
                }
            };

            check();
        }));
    }

    return googleLibrariesPromise;
}

export async function initDrive() {
    await waitForGoogleLibraries();

    return new Promise((resolve) => {
        gapi.load('client', async () => {
            try {
                await gapi.client.init({
                    apiKey: API_KEY,
                });

                await gapi.client.load('drive', 'v3');
                
                gapiInited = true;
                checkAuth(resolve);
            } catch (error) {
                console.error("Erro na inicialização do GAPI:", error);
                resolve();
            }
        });

        try {
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: async (resp) => {
                    if (resp.error !== undefined) {
                        throw (resp);
                    }
                    
                    // Salva o token para persistir após refresh
                    saveTokenToStorage(resp);

                    isAuthenticated = true;
                    updateUI(true);
                    document.dispatchEvent(new CustomEvent('driveLoginSuccess'));
                },
            });
            gisInited = true;
        } catch (error) {
            console.error("Erro na inicialização do GIS:", error);
        }
    });
}

function checkAuth(resolve) {
    if (gapiInited && gisInited) {
        try {
            // Tenta carregar do storage local primeiro
            const restored = loadTokenFromStorage();
            
            if (restored) {
                isAuthenticated = true;
                updateUI(true);
                console.log("Sessão do Drive restaurada automaticamente.");
            } else {
                // Se não restaurou, verifica se o gapi tem algo em memória (raro no reload)
                const token = gapi.client.getToken();
                if(token) {
                    isAuthenticated = true;
                    updateUI(true);
                }
            }
        } catch (e) {
            console.warn("Não foi possível verificar autenticação:", e);
        }
        resolve(true);
    } else {
        resolve(false);
    }
}

export function login() {
    if(!tokenClient) {
        console.error("Cliente Google Drive não inicializado ainda.");
        showTopAlert('Erro: Serviço Google não inicializado.', 3000, 'error');
        return;
    }
    // Ao solicitar novo token, se o usuário já deu permissão antes, 
    // o Google pode pular a tela de consentimento dependendo das configs do navegador
    tokenClient.requestAccessToken({prompt: ''}); 
}

export function logout() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        clearTokenStorage(); // Limpa o storage
        isAuthenticated = false;
        updateUI(false);
        showTopAlert('Desconectado do Google Drive', 3000, 'info');
    }
}

function updateUI(isLoggedIn, customText = null) {
    const btnText = document.getElementById('google-login-text');
    const btnMobile = document.getElementById('google-login-btn-mobile');
    
    // Desktop Controls Container
    const manualControls = document.getElementById('drive-manual-controls');
    
    // Mobile Buttons
    const btnUploadMobile = document.getElementById('drive-upload-btn-mobile');
    const btnDownloadMobile = document.getElementById('drive-download-btn-mobile');

    // Toggle Desktop Controls
    if (manualControls) {
        if (isLoggedIn) {
            manualControls.classList.remove('hidden');
            manualControls.classList.add('flex');
        } else {
            manualControls.classList.add('hidden');
            manualControls.classList.remove('flex');
        }
    }

    // Toggle Mobile Buttons
    if (btnUploadMobile) btnUploadMobile.classList.toggle('hidden', !isLoggedIn);
    if (btnDownloadMobile) btnDownloadMobile.classList.toggle('hidden', !isLoggedIn);

    // Update Styles
    if (isLoggedIn) {
        if(btnText) {
            btnText.innerHTML = customText || 'Conectado <i class="fas fa-check-circle text-emerald-500 ml-1"></i>';
            btnText.parentElement.classList.replace('text-gray-300', 'text-emerald-400');
            btnText.parentElement.classList.replace('border-gray-600', 'border-emerald-500/50');
            btnText.parentElement.classList.add('bg-emerald-900/20');
        } 
        if(btnMobile) {
            btnMobile.classList.add('bg-emerald-600', 'text-white', 'border-emerald-400');
            btnMobile.classList.remove('text-gray-400');
        }
    } else {
        if(btnText) {
            btnText.textContent = 'Conectar';
            btnText.parentElement.classList.replace('text-emerald-400', 'text-gray-300');
            btnText.parentElement.classList.replace('border-emerald-500/50', 'border-gray-600');
            btnText.parentElement.classList.remove('bg-emerald-900/20');
        }
        if(btnMobile) {
            btnMobile.classList.remove('bg-emerald-600', 'text-white', 'border-emerald-400');
            // btnMobile.classList.add('text-gray-400'); // If needed
        }
    }
}

async function findDbFile() {
    try {
        const response = await gapi.client.drive.files.list({
            q: `name = '${DB_FILE_NAME}' and trashed = false`,
            fields: 'files(id, name)',
        });
        const files = response.result.files;
        if (files && files.length > 0) {
            return files[0].id;
        }
        return null;
    } catch (err) {
        // Se o token expirou no meio da operação, limpa e avisa
        if (err.status === 401) {
            console.warn("Token expirado durante operação.");
            logout();
            showTopAlert("Sessão expirada. Conecte novamente.", 4000, "warning");
        } else {
            console.error('Erro ao buscar arquivo no Drive', err);
        }
        return null;
    }
}

// Baixa os dados do Drive (Público/Exportado para ser chamado manualmente)
export async function loadFromDrive(signal = null, onProgress = () => {}) {
    if (!isAuthenticated) {
        showTopAlert('Você precisa conectar ao Drive primeiro.', 3000, 'warning');
        return null;
    }

    // Verificação de Internet
    if (!navigator.onLine) {
         showTopAlert('Sem conexão com a internet.', 3000, 'error');
         return null;
    }

    onProgress(0);

    try {
        const fileId = await findDbFile();
        if (!fileId) {
            if (isAuthenticated) { // Só mostra erro se ainda estiver logado
                console.log('Nenhum backup encontrado no Drive.');
                showTopAlert('Nenhum backup encontrado no Drive.', 3000, 'info');
            }
            return null;
        }

        onProgress(10); // ID encontrado

        const accessToken = gapi.client.getToken().access_token;
        const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

        // Usamos fetch para suportar signal (cancelamento) e stream reader (progresso)
        const response = await fetch(url, {
            headers: { 'Authorization': 'Bearer ' + accessToken },
            signal: signal
        });

        if (!response.ok) {
            if (response.status === 401) {
                logout();
                throw new Error("Sessão expirada");
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const contentLength = response.headers.get('Content-Length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        let loaded = 0;

        const reader = response.body.getReader();
        const chunks = [];

        while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            chunks.push(value);
            loaded += value.length;
            
            if (total) {
                // Mapeia download de 10% a 95%
                const percent = 10 + ((loaded / total) * 85);
                onProgress(percent);
            } else {
                onProgress(-1); // Indeterminado
            }
        }

        onProgress(95); // Montando JSON

        const blob = new Blob(chunks);
        const text = await blob.text();
        const json = JSON.parse(text);
        
        onProgress(100);
        return json;
    } catch (err) {
        if (err.name === 'AbortError') {
            console.log('Download abortado.');
            throw err;
        }
        console.error('Erro ao baixar do Drive:', err);
        showTopAlert(err.message === "Sessão expirada" ? "Sessão expirada. Faça login novamente." : 'Erro ao baixar dados do Drive.', 4000, 'error');
        return null;
    } 
}

// Salva (Upload/Update) no Drive (Público/Exportado para ser chamado manualmente)
export async function saveToDrive(dataJSON, signal = null, onProgress = () => {}) {
    if (!isAuthenticated) {
        showTopAlert('Você precisa conectar ao Drive primeiro.', 3000, 'warning');
        return;
    }
    
    if (!navigator.onLine) {
         showTopAlert('Sem conexão com a internet.', 3000, 'error');
         return;
    }

    console.log("Iniciando upload manual para o Google Drive...");
    onProgress(5); // Inicio

    try {
        const fileContent = JSON.stringify(dataJSON);
        onProgress(10); // Serializado
        
        const fileId = await findDbFile();
        if (!isAuthenticated) return; // Se findDbFile detectou expiração
        
        onProgress(20); // Verificado

        const file = new Blob([fileContent], {type: 'application/json'});
        
        const metadata = {
            name: DB_FILE_NAME,
            mimeType: 'application/json'
        };

        const accessToken = gapi.client.getToken().access_token;
        const form = new FormData();
        
        form.append('metadata', new Blob([JSON.stringify(metadata)], {type: 'application/json'}));
        form.append('file', file);

        let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
        let method = 'POST';

        if (fileId) {
            url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
            method = 'PATCH';
        }

        onProgress(30); // Iniciando Upload real

        // Simulamos progresso visual pois fetch não tem onUploadProgress nativo facilmente acessível sem XHR
        // Vai de 30% a 95% enquanto a promise não resolve
        let fakeProgress = 30;
        const progressInterval = setInterval(() => {
            fakeProgress += (95 - fakeProgress) * 0.1; 
            if (fakeProgress > 95) fakeProgress = 95;
            onProgress(fakeProgress);
        }, 400);

        const response = await fetch(url, {
            method: method,
            headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
            body: form,
            signal: signal
        });

        clearInterval(progressInterval);

        if (!response.ok) {
            if (response.status === 401) {
                logout();
                throw new Error("Sessão expirada");
            }
            throw new Error(`HTTP Error: ${response.status}`);
        }

        onProgress(100);
        console.log("Upload concluído com sucesso!");
        showTopAlert('Salvo no Drive com sucesso!', 2000, 'success');

    } catch (err) {
        if (err.name === 'AbortError') {
            console.log('Upload abortado.');
            throw err;
        }
        console.error('Erro ao salvar no Drive:', err);
        showTopAlert(err.message === "Sessão expirada" ? "Sessão expirada. Faça login novamente." : 'Falha ao salvar no Drive.', 4000, 'error');
    } 
}

// Configuração dos Botões de Login
document.addEventListener('DOMContentLoaded', () => {
    const btnDesktop = document.getElementById('google-login-btn');
    const btnMobile = document.getElementById('google-login-btn-mobile');

    const toggleAuth = () => {
        if (isAuthenticated) logout();
        else login();
    };

    if(btnDesktop) btnDesktop.addEventListener('click', toggleAuth);
    if(btnMobile) btnMobile.addEventListener('click', toggleAuth);
});
