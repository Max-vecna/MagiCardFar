export function showCustomConfirm(message) {
    return new Promise((resolve) => {
        const modalHtml = `
            <div id="custom-confirm-modal" class="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4" style="z-index: 9999;">
                <div class="bg-gray-800 text-white rounded-lg shadow-2xl p-6 w-full max-w-sm border border-gray-700">
                    <p class="text-center text-lg mb-6">${message}</p>
                    <div class="flex justify-end gap-4">
                        <button id="confirm-cancel-btn" class="py-2 px-4 rounded-lg bg-gray-600 hover:bg-gray-700 font-bold">Cancelar</button>
                        <button id="confirm-ok-btn" class="py-2 px-4 rounded-lg bg-red-600 hover:bg-red-700 font-bold">Excluir</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        const modal = document.getElementById('custom-confirm-modal');
        const confirmBtn = document.getElementById('confirm-ok-btn');
        const cancelBtn = document.getElementById('confirm-cancel-btn');

        const cleanupAndResolve = (value) => {
            modal.remove();
            resolve(value);
        };

        confirmBtn.onclick = () => cleanupAndResolve(true);
        cancelBtn.onclick = () => cleanupAndResolve(false);
    });
}

export function showCustomAlert(message) {
    const modalId = `custom-alert-modal-${Date.now()}`;
    const modalHtml = `
        <div id="${modalId}" class="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4" style="z-index: 9999;">
            <div class="bg-gray-800 text-white rounded-lg shadow-2xl p-6 w-full max-w-sm border border-gray-700 w-72">
                <p class="text-center text-lg mb-4">${message}</p>
                <button class="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 font-bold">OK</button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById(modalId);
    modal.querySelector('button').addEventListener('click', () => modal.remove());
}

export function showTopAlert(message, duration = 3000, type = 'info') {
    const container = document.getElementById('top-alert-container');
    if (!container) return;

    const alertElement = document.createElement('div');
    alertElement.className = `top-alert-message p-3 rounded-lg shadow-md text-sm font-medium flex items-center gap-2`;
    alertElement.style.flexDirection = 'column';

    let bgColor, textColor, iconClass;
    switch (type) {
        case 'success':
            bgColor = 'bg-green-600';
            textColor = 'text-white';
            iconClass = 'fas fa-check-circle';
            break;
        case 'warning':
            bgColor = 'bg-yellow-500';
            textColor = 'text-black';
            iconClass = 'fas fa-exclamation-triangle';
            break;
        case 'error':
            bgColor = 'bg-red-600';
            textColor = 'text-white';
            iconClass = 'fas fa-times-circle';
            break;
        default:
            bgColor = 'bg-blue-600';
            textColor = 'text-white';
            iconClass = 'fas fa-info-circle';
    }

    alertElement.classList.add(bgColor, textColor);
    alertElement.innerHTML = `<i class="${iconClass}"></i><span style="text-align: center;">${message}</span>`;
    container.appendChild(alertElement);

    requestAnimationFrame(() => alertElement.classList.add('visible'));

    setTimeout(() => {
        alertElement.classList.remove('visible');
        setTimeout(() => alertElement.remove(), 300);
    }, duration);
}

export function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        if (!file) return resolve(null);
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e.target.error);
        reader.readAsArrayBuffer(file);
    });
}

export function bufferToBlob(buffer, mimeType) {
    return new Blob([buffer], { type: mimeType });
}

export function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

export function base64ToArrayBuffer(base64) {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}

export function showImagePreview(element, url, isImageElement = true) {
    const elementId = element.id;
    let placeholderId = null;

    if (elementId && elementId.includes('Preview')) {
        placeholderId = elementId.replace('Preview', 'Placeholder');
    }

    const placeholder = placeholderId ? document.getElementById(placeholderId) : null;

    if (url) {
        if (isImageElement) element.src = url;
        else element.style.backgroundImage = `url('${url}')`;

        element.classList.remove('hidden');
        if (placeholder) placeholder.classList.add('hidden');
    } else {
        if (isImageElement) {
             element.src = '';
             element.classList.add('hidden');
        } else {
             element.style.backgroundImage = '';
             element.classList.remove('hidden');
        }
        if (placeholder) placeholder.classList.remove('hidden');
    }
}

function clampRgb(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function parseRgbColor(color) {
    if (!color || typeof color !== 'string') return null;

    const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (rgbMatch) {
        return {
            r: clampRgb(rgbMatch[1]),
            g: clampRgb(rgbMatch[2]),
            b: clampRgb(rgbMatch[3])
        };
    }

    const hexMatch = color.trim().match(/^#([0-9a-f]{6})$/i);
    if (hexMatch) {
        const hex = hexMatch[1];
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16)
        };
    }

    return null;
}

function buildLightColor({ r, g, b }, amount = 0.35) {
    const mix = (channel) => clampRgb(channel + ((255 - channel) * amount));
    return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function normalizePalette(colorSet) {
    const palette = {
        color30: 'rgba(74, 85, 104, 0.3)',
        color100: 'rgb(74, 85, 104)',
        ...colorSet
    };

    if (!palette.colorLight) {
        const parsed = parseRgbColor(palette.color100);
        palette.colorLight = parsed ? buildLightColor(parsed) : palette.color100;
    }

    return palette;
}

export async function calculateColor(imageBuffer, imageMimeType, defaultColor = { color30: 'rgba(74, 85, 104, 0.3)', color100: 'rgb(74, 85, 104)' }) {
    let imageUrl;
    let createdObjectUrl = null;

    if (imageBuffer) {
        createdObjectUrl = URL.createObjectURL(bufferToBlob(imageBuffer, imageMimeType));
        imageUrl = createdObjectUrl;
    } else {
        return normalizePalette(defaultColor);
    }

    try {
        return await new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.src = imageUrl;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0, img.width, img.height);
                try {
                    const data = ctx.getImageData(0, 0, img.width, img.height).data;
                    let r = 0, g = 0, b = 0, count = 0;
                    for (let i = 0; i < data.length; i += 20) {
                        r += data[i];
                        g += data[i + 1];
                        b += data[i + 2];
                        count++;
                    }
                    r = Math.floor(r / count);
                    g = Math.floor(g / count);
                    b = Math.floor(b / count);

                    resolve(normalizePalette({
                        color30: `rgba(${r}, ${g}, ${b}, 0.3)`,
                        color100: `rgb(${r}, ${g}, ${b})`
                    }));
                } catch (e) { reject(e); }
            };
            img.onerror = reject;
        });
    } catch (error) {
        console.error('Erro ao calcular cor:', error);
        return normalizePalette(defaultColor);
    } finally {
        if (createdObjectUrl) URL.revokeObjectURL(createdObjectUrl);
    }
}
