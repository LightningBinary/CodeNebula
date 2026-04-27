/**
 * CodeNebula - UI Controls
 */

export class UIController {
    constructor(sceneManager, galaxyRenderer, connectionRenderer) {
        this.sceneManager = sceneManager;
        this.galaxyRenderer = galaxyRenderer;
        this.connectionRenderer = connectionRenderer;

        this.currentData = null;

        this.init();
    }

    init() {
        this.bindToolbar();
        this.bindFilters();
        this.bindSearch();
        this.bindKeyboard();
        this.bindHelpModal();
    }

    bindToolbar() {
        document.getElementById('btn-reset')?.addEventListener('click', () => {
            this.sceneManager.resetView();
        });

        document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
            this.toggleFullscreen();
        });

        document.getElementById('btn-help')?.addEventListener('click', () => {
            this.showHelp();
        });
    }

    bindFilters() {
        document.getElementById('filter-stars')?.addEventListener('change', (e) => {
            this.galaxyRenderer.setVisibility('stars', e.target.checked);
        });

        document.getElementById('filter-planets')?.addEventListener('change', (e) => {
            this.galaxyRenderer.setVisibility('planets', e.target.checked);
        });

        document.getElementById('filter-connections')?.addEventListener('change', (e) => {
            this.connectionRenderer.setVisible(e.target.checked);
        });

        document.getElementById('star-size')?.addEventListener('input', (e) => {
            this.galaxyRenderer.config.starBaseSize = parseInt(e.target.value);
            if (this.currentData) {
                this.galaxyRenderer.render(this.currentData);
            }
        });

        document.getElementById('planet-size')?.addEventListener('input', (e) => {
            this.galaxyRenderer.config.planetBaseSize = parseInt(e.target.value);
            if (this.currentData) {
                this.galaxyRenderer.render(this.currentData);
            }
        });

        document.getElementById('connection-opacity')?.addEventListener('input', (e) => {
            this.connectionRenderer.setOpacity(e.target.value);
        });
    }

    bindSearch() {
        const searchInput = document.getElementById('search-input');
        const searchBtn = document.getElementById('search-btn');
        const resultsEl = document.getElementById('search-results');

        let debounceTimer;

        const performSearch = (term) => {
            if (!this.currentData || !term.trim()) {
                resultsEl.innerHTML = '';
                return;
            }

            const stars = this.currentData.stars || [];
            const planets = this.currentData.planets || [];

            const results = [
                ...stars.filter(s => s.name.toLowerCase().includes(term.toLowerCase())),
                ...planets.filter(p => p.name.toLowerCase().includes(term.toLowerCase()))
            ].slice(0, 20);

            if (results.length === 0) {
                resultsEl.innerHTML = '<div class="result-item"><span class="result-name">No matching results</span></div>';
                return;
            }

            resultsEl.innerHTML = results.map(item => `
                <div class="result-item" data-id="${item.id}" data-type="${item.type || 'star'}">
                    <div class="result-name">${item.name}</div>
                    <div class="result-type">${this.getTypeLabel(item)}</div>
                </div>
            `).join('');

            resultsEl.querySelectorAll('.result-item').forEach(el => {
                el.addEventListener('click', () => {
                    const id = el.dataset.id;
                    const type = el.dataset.type;
                    this.focusOnNode(id, type);
                });
            });

            this.galaxyRenderer.highlightSearch(term);
        };

        searchInput?.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => performSearch(e.target.value), 300);
        });

        searchBtn?.addEventListener('click', () => {
            performSearch(searchInput.value);
        });

        searchInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                performSearch(searchInput.value);
            }
        });
    }

    getTypeLabel(item) {
        if (item.type === 'class') return 'Class';
        if (item.type === 'method') return 'Method';
        if (item.type === 'function') return 'Function';
        return 'File';
    }

    focusOnNode(id, type) {
        const stars = this.galaxyRenderer.stars;
        const planets = this.galaxyRenderer.planets;

        let target;
        if (type === 'star') {
            target = stars.get(id);
        } else {
            target = planets.get(id);
        }

        if (target) {
            this.sceneManager.focusOn(target.position);
            this.galaxyRenderer.selectObject(target);
        }
    }

    bindKeyboard() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;

            switch(e.key.toLowerCase()) {
                case 'r':
                    this.sceneManager.resetView();
                    break;
                case 'f':
                    this.toggleFullscreen();
                    break;
                case 'escape':
                    this.galaxyRenderer.deselectObject();
                    this.hideHelp();
                    break;
                case '/':
                    document.getElementById('search-input')?.focus();
                    break;
            }
        });
    }

    bindHelpModal() {
        const modal = document.getElementById('help-modal');
        const closeBtn = modal?.querySelector('.modal-close');

        closeBtn?.addEventListener('click', () => this.hideHelp());
        modal?.addEventListener('click', (e) => {
            if (e.target === modal) this.hideHelp();
        });
    }

    showHelp() {
        document.getElementById('help-modal')?.classList.remove('hidden');
    }

    hideHelp() {
        document.getElementById('help-modal')?.classList.add('hidden');
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen?.();
        } else {
            document.exitFullscreen?.();
        }
    }

    updateCameraPosition() {
        const pos = this.sceneManager.camera.position;
        document.getElementById('camera-pos').textContent =
            `Camera: ${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}, ${pos.z.toFixed(0)}`;
    }

    setData(data) {
        this.currentData = data;
    }

    hideLoading() {
        const loading = document.getElementById('loading-overlay');
        loading?.classList.add('hidden');
    }

    showLoading() {
        const loading = document.getElementById('loading-overlay');
        loading?.classList.remove('hidden');
    }
}
