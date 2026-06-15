const RELATED_CARD_ROLES = [
    { role: 'base', label: 'Base', field: '' },
    { role: 'enhance', label: 'Aprimorar', field: 'enhanceCardId' },
    { role: 'true', label: 'Verdadeiro', field: 'trueCardId' }
];

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeRelatedRole(role) {
    return role === 'enhance' || role === 'true' ? role : 'base';
}

function sameId(a, b) {
    return String(a || '') !== '' && String(a || '') === String(b || '');
}

function getCardId(card) {
    return String(card?.id || '');
}

function findParentCard(cards, cardId) {
    return (cards || []).find(card =>
        sameId(card?.enhanceCardId, cardId) ||
        sameId(card?.trueCardId, cardId)
    ) || null;
}

function getRoleFromParent(parent, cardId) {
    if (!parent) return 'base';
    if (sameId(parent.trueCardId, cardId)) return 'true';
    if (sameId(parent.enhanceCardId, cardId)) return 'enhance';
    return 'base';
}

export async function getRelatedCardGroup(cardData, storeName) {
    const currentId = getCardId(cardData);
    if (!cardData || !currentId) {
        return { cards: [], activeIndex: 0 };
    }

    let allCards = [];
    try {
        const { getData } = await import('./db-local.js');
        allCards = ((await getData(storeName)) || []).filter(Boolean);
    } catch (error) {
        console.warn('Nao foi possivel carregar cards relacionados:', error);
    }

    const cardsById = new Map(allCards.map(card => [getCardId(card), card]).filter(([id]) => id));
    if (!cardsById.has(currentId)) cardsById.set(currentId, cardData);

    const parent = findParentCard(allCards, currentId);
    const explicitRole = normalizeRelatedRole(cardData.cardVariant);
    const currentRole = explicitRole !== 'base' ? explicitRole : getRoleFromParent(parent, currentId);
    const baseId = currentRole === 'base'
        ? currentId
        : String(cardData.baseCardId || parent?.id || '');
    const baseCard = cardsById.get(baseId) || parent || (currentRole === 'base' ? cardData : null);
    const cardsByRole = new Map();

    if (baseCard) {
        cardsByRole.set('base', baseCard);
        RELATED_CARD_ROLES.forEach(({ role, field }) => {
            if (!field) return;
            const relatedId = baseCard[field];
            const relatedCard = cardsById.get(String(relatedId || ''));
            if (relatedCard) cardsByRole.set(role, relatedCard);
        });
    }

    cardsByRole.set(currentRole, cardData);

    const seenIds = new Set();
    const cards = RELATED_CARD_ROLES
        .map(({ role, label }) => {
            const card = cardsByRole.get(role);
            if (!card) return null;
            const id = getCardId(card);
            if (!id || seenIds.has(id)) return null;
            seenIds.add(id);
            return { role, label, card };
        })
        .filter(Boolean);

    const activeIndex = Math.max(0, cards.findIndex(relation =>
        sameId(relation.card?.id, currentId) || relation.role === currentRole
    ));

    return { cards, activeIndex };
}

export async function buildRelatedCardCarousel({
    relatedCards,
    activeIndex = 0,
    width,
    height,
    closeButtonHtml = '',
    renderCard
}) {
    const safeActiveIndex = Math.max(0, Math.min(activeIndex, relatedCards.length - 1));
    const slidesHtml = (await Promise.all(relatedCards.map(async (relation, index) => {
        const cardHtml = await renderCard(relation.card);
        const isActive = index === safeActiveIndex;
        return `
            <div class="spell-carousel-slide${isActive ? ' active' : ''}" data-slide-index="${index}" aria-hidden="${isActive ? 'false' : 'true'}">
                <div class="spell-carousel-label">${escapeHtml(relation.label)}</div>
                <div class="spell-carousel-card-frame">
                    ${cardHtml}
                </div>
            </div>
        `;
    }))).join('');

    return `
        <div class="spell-carousel-modal-layout">
            ${closeButtonHtml}
            <div
                class="spell-carousel-shell"
                style="width: ${width}px; height: ${height}px;"
                data-active-slide="${safeActiveIndex}"
                tabindex="0"
                role="region"
                aria-label="Cards relacionados">
                <button type="button" class="spell-carousel-nav prev" aria-label="Card anterior">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <div class="spell-carousel-track">
                    ${slidesHtml}
                </div>
                <button type="button" class="spell-carousel-nav next" aria-label="Proximo card">
                    <i class="fas fa-chevron-right"></i>
                </button>
                <div class="spell-carousel-dots">
                    ${relatedCards.map((relation, index) => `
                        <button
                            type="button"
                            class="spell-carousel-dot${index === safeActiveIndex ? ' active' : ''}"
                            data-slide-index="${index}"
                            aria-label="${escapeHtml(relation.label)}"
                            aria-current="${index === safeActiveIndex ? 'true' : 'false'}"></button>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

export function setupRelatedCardCarousel(root) {
    const carousels = Array.from(root?.querySelectorAll?.('.spell-carousel-shell') || []);

    carousels.forEach(carousel => {
        if (carousel.dataset.carouselReady === 'true') return;
        carousel.dataset.carouselReady = 'true';

        const slides = Array.from(carousel.querySelectorAll('.spell-carousel-slide'));
        const dots = Array.from(carousel.querySelectorAll('.spell-carousel-dot'));
        const track = carousel.querySelector('.spell-carousel-track');
        if (slides.length <= 1) return;

        let activeIndex = parseInt(carousel.dataset.activeSlide || '0', 10) || 0;
        const isMobileSwipeMode = () => (
            typeof window !== 'undefined'
            && (window.matchMedia?.('(max-width: 640px)').matches || window.innerWidth <= 640)
        );
        const showSlide = (nextIndex, options = {}) => {
            activeIndex = (nextIndex + slides.length) % slides.length;
            carousel.dataset.activeSlide = String(activeIndex);
            slides.forEach((slide, index) => {
                const isActive = index === activeIndex;
                slide.classList.toggle('active', isActive);
                slide.setAttribute('aria-hidden', isActive ? 'false' : 'true');
            });
            dots.forEach((dot, index) => {
                const isActive = index === activeIndex;
                dot.classList.toggle('active', isActive);
                dot.setAttribute('aria-current', isActive ? 'true' : 'false');
            });

            if (options.scroll !== false && track && isMobileSwipeMode()) {
                const targetSlide = slides[activeIndex];
                if (targetSlide) {
                    track.scrollTo({
                        left: targetSlide.offsetLeft,
                        behavior: options.instant ? 'auto' : 'smooth'
                    });
                }
            }
        };

        carousel.querySelector('.spell-carousel-nav.prev')?.addEventListener('click', (event) => {
            event.stopPropagation();
            showSlide(activeIndex - 1);
        });

        carousel.querySelector('.spell-carousel-nav.next')?.addEventListener('click', (event) => {
            event.stopPropagation();
            showSlide(activeIndex + 1);
        });

        dots.forEach(dot => {
            dot.addEventListener('click', (event) => {
                event.stopPropagation();
                showSlide(parseInt(dot.dataset.slideIndex || '0', 10) || 0);
            });
        });

        carousel.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                showSlide(activeIndex - 1);
            } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                showSlide(activeIndex + 1);
            } else if (event.key === 'Home') {
                event.preventDefault();
                showSlide(0);
            } else if (event.key === 'End') {
                event.preventDefault();
                showSlide(slides.length - 1);
            }
        });

        let scrollFrame = 0;
        track?.addEventListener('scroll', () => {
            if (!isMobileSwipeMode()) return;
            if (scrollFrame) cancelAnimationFrame(scrollFrame);
            scrollFrame = requestAnimationFrame(() => {
                const slideWidth = Math.max(1, track.clientWidth);
                showSlide(Math.round(track.scrollLeft / slideWidth), { scroll: false });
            });
        }, { passive: true });

        window.addEventListener('resize', () => {
            showSlide(activeIndex, { instant: true });
        }, { passive: true });

        showSlide(activeIndex, { instant: true });
    });
}
