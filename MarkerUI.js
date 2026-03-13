/**
 * MarkerUI.js — пользовательский интерфейс для маркеров на 3D-сцене.
 *
 * Строит DOM-панели (группы, маркеры, загрузка/сохранение JSON), обрабатывает клики
 * по канвасу (raycaster): клик по маркеру — попап и выбор; клик по мешу — добавление
 * маркера (если режим включён). Связывает AtlasScene и MarkerManager с UI.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ОГЛАВЛЕНИЕ (поиск по Ctrl+F по заголовкам или именам)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * КЛАСС MarkerUI
 *   Конструктор и инициализация:
 *     constructor(atlasScene, markerManager)
 *     initUI()                           — createMainPanels, bindUIEvents, обновление таблицы
 *     initEventListeners()               — клик по канвасу, сворачивание панели
 *   Обработка кликов:
 *     handleCanvasClick(event)           — raycaster: маркер / меш / пусто
 *     handleMarkerClick(marker)          — выбор, попап или удаление (режим удаления)
 *     handleMeshClick(hit)               — обновление "Крепится к", опционально добавление маркера
 *     handleEmptyClick()                 — подсказка при режиме добавления
 *   Панели и элементы:
 *     createMainPanels()                 — ui-root: группы, маркеры, загрузка, список
 *     createGroupControls()              — чекбоксы групп из csvManager
 *     renderMarkerGroupControls()        — селект групп, список с видимостью/удалением
 *   Вспомогательные:
 *     escapeHtml(v)                      — экранирование HTML
 *     setStatus(text)                    — вывод в #info
 *     getVisibleMeshes()                 — видимые меши сцены
 *     getMarkerStyleFromUI()             — стиль из полей формы (цвет, масштаб, группа, …)
 *   Попап маркера:
 *     ensureMarkerPopup()               — создать #marker-popup при необходимости
 *     showMarkerPopup(marker)            — показать попап у маркера
 *     hideMarkerPopup()                  — скрыть попап
 *   Выбор и инспектор:
 *     getSelectedMarker()                — выбранный маркер или null
 *     selectMarker(markerId)             — выбрать маркер, обновить UI
 *     clearMarkerSelection()             — снять выбор
 *     updateMarkerInspector()            — синхронизация полей формы с выбранным маркером
 *     updateMarkerTable()                — таблица маркеров, кнопки Фокус/Скрыть/Коммент/Удалить
 *   События:
 *     togglePanel()                      — сворачивание/разворачивание панели
 *     bindUIEvents()                     — привязка кнопок, полей, загрузке JSON
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import * as THREE from 'three';

// =============================================================================
// КЛАСС MarkerUI
// =============================================================================

export class MarkerUI {
    constructor(atlasScene, markerManager) {
        this.atlas = atlasScene;
        this.markerManager = markerManager;
        this.selectedElementId = '';
        this.activeMarkerGroup = 'group_1';
        this.groupVisibility = {};
        this.panelCollapsed = false;
        this.markerDeleteMode = false;

        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();

        this.initUI();
        this.initEventListeners();
    }

    // 🔥 НОВЫЙ МЕТОД: инициализация всех обработчиков событий
    initEventListeners() {
        if (!this.atlas || !this.atlas.renderer) {
            console.error('Atlas or renderer not available for event listeners');
            return;
        }

        // Добавляем обработчик кликов на renderer
        this.atlas.renderer.domElement.addEventListener('click', this.handleCanvasClick.bind(this));
        
        // Обработка сворачивания панели
        const panelToggle = document.getElementById('panel-toggle');
        if (panelToggle) {
            panelToggle.addEventListener('click', this.togglePanel.bind(this));
        }

        console.log('✅ Event listeners initialized');
    }

    // 🔥 НОВЫЙ МЕТОД: обработка кликов по канвасу
    handleCanvasClick(event) {
        if (!this.markerManager) return;

        if (!this.raycaster) {
        console.error('Raycaster not initialized');
        return;
    }

        const rect = this.atlas.renderer.domElement.getBoundingClientRect();
        this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        this.raycaster.setFromCamera(this.pointer, this.atlas.camera);
        
        // 1. Сначала проверяем маркеры
        if (this.markerManager.group) {
            const visibleMarkers = this.markerManager.group.children.filter(child => child.visible);
            const markerIntersections = this.raycaster.intersectObjects(visibleMarkers);
            
            if (markerIntersections.length > 0) {
                const marker = this.markerManager.getMarkerBySprite(markerIntersections[0].object);
                if (marker) {
                    this.handleMarkerClick(marker);
                    return;
                }
            }
        }
        
        // 2. Если не маркер, проверяем видимые меши модели
        this.hideMarkerPopup();
        
        const visibleMeshes = this.getVisibleMeshes();
        const meshIntersections = this.raycaster.intersectObjects(visibleMeshes);
        
        if (meshIntersections.length > 0) {
            this.handleMeshClick(meshIntersections[0]);
        } else {
            this.handleEmptyClick();
        }
    }

    // 🔥 НОВЫЙ МЕТОД: получить видимые меши
    getVisibleMeshes() {
        return this.atlas.getMeshes().filter(mesh => mesh.visible);
    }

    // 🔥 НОВЫЙ МЕТОД: обработка клика по маркеру
    handleMarkerClick(marker) {
        if (this.markerDeleteMode) {
            if (confirm(`Удалить маркер «${marker.label || marker.name || marker.id}»?`)) {
                this.markerManager.removeMarker(marker.id);
                this.markerDeleteMode = false;
                const deleteBtn = document.getElementById('delete-selected-marker');
                if (deleteBtn) deleteBtn.classList.remove('active-mode');
                this.atlas.renderer.domElement.style.cursor = 
                    document.getElementById('click-marker-mode')?.checked ? 'crosshair' : 'default';
                this.updateMarkerTable();
                this.updateMarkerInspector();
                this.setStatus('Маркер удалён');
            }
            return;
        }
        
        this.selectMarker(marker.id);
        this.showMarkerPopup(marker);
        this.setStatus(`Открыт маркер: ${marker.label || marker.id}`);
    }

    // 🔥 НОВЫЙ МЕТОД: обработка клика по мешу модели
    handleMeshClick(hit) {
        // Обновляем выбранный элемент в UI
        const attach = document.getElementById('selected-element-name');
        if (attach) attach.textContent = hit.object.name || hit.object.uuid || 'mesh';
        
        // Если включен режим добавления маркеров
        if (document.getElementById('click-marker-mode')?.checked) {
            const marker = this.markerManager.addMarkerFromIntersection(hit, this.getMarkerStyleFromUI());
            
            if (marker) {
                this.selectMarker(marker.id);
                this.updateMarkerTable();
                this.setStatus(`✅ Маркер добавлен на ${hit.object.name || 'mesh'} в группу ${marker.markerGroup}`);
            }
        } else {
            this.setStatus(`Выбран элемент: ${hit.object.name || 'mesh'}`);
        }
    }

    // 🔥 НОВЫЙ МЕТОД: обработка клика по пустому месту
    handleEmptyClick() {
        if (document.getElementById('click-marker-mode')?.checked) {
            this.setStatus('❌ Кликните на видимую часть модели');
        }
    }

    // 🔥 НОВЫЙ МЕТОД: сворачивание/разворачивание панели
    togglePanel() {
        document.body.classList.toggle('panel-collapsed');
        const toggle = document.getElementById('panel-toggle');
        if (toggle) {
            toggle.textContent = document.body.classList.contains('panel-collapsed') ? '»' : '«';
        }
    }

    initUI() {
        this.createMainPanels();
        this.bindUIEvents();
        this.updateMarkerTable();
        this.updateMarkerInspector();
    }

    escapeHtml(v) {
        return String(v ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    setStatus(text) {
        const d = document.getElementById('info');
        if (d) d.textContent = text;
    }

    ensureMarkerPopup() {
        let popup = document.getElementById('marker-popup');
        if (popup) return popup;

        popup = document.createElement('div');
        popup.id = 'marker-popup';
        popup.style.cssText = `
            position: absolute;
            display: none;
            min-width: 220px;
            max-width: 320px;
            z-index: 2000;
            pointer-events: none;
            background: rgba(10, 14, 28, 0.96);
            color: white;
            border: 1px solid rgba(126, 182, 255, 0.35);
            border-radius: 12px;
            padding: 12px 14px;
            box-shadow: 0 10px 28px rgba(0,0,0,0.35);
            backdrop-filter: blur(8px);
            font-family: inherit;
        `;
        document.body.appendChild(popup);
        return popup;
    }

    showMarkerPopup(marker) {
        if (!marker?.sprite) return;
        const popup = this.ensureMarkerPopup();

        const positionText = [marker.worldPosition?.x, marker.worldPosition?.y, marker.worldPosition?.z]
            .map((v) => Number(v || 0).toFixed(2)).join(', ');

        popup.innerHTML = `
            <div style="font-weight:700; margin-bottom:4px; color:#9dc3ff; font-size:18px;">
                ${this.escapeHtml(marker.label || marker.name || marker.id)}
            </div>
            <div style="font-size:13px; opacity:0.92; margin-bottom:2px;">
                ${this.escapeHtml(marker.elementName || marker.elementId || 'world')}
            </div>
            <div style="font-size:12px; opacity:0.82; margin-bottom:2px;">
                ${this.escapeHtml(positionText)}
            </div>
            <div style="font-size:12px; opacity:0.82; margin-bottom:10px;">
                ${this.escapeHtml(marker.groupName || 'без анатомической группы')}
            </div>
            <div style="font-size:13px; line-height:1.45; white-space:pre-wrap;">
                ${this.escapeHtml(marker.comment || 'Комментарий не указан')}
            </div>
        `;

        const world = marker.sprite.position.clone();
        world.project(this.atlas.camera);

        const x = (world.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-world.y * 0.5 + 0.5) * window.innerHeight;

        popup.style.left = `${Math.round(x + 14)}px`;
        popup.style.top = `${Math.round(y - 14)}px`;
        popup.style.display = 'block';
        popup.dataset.markerId = marker.id;
    }

    hideMarkerPopup() {
        const popup = document.getElementById('marker-popup');
        if (popup) {
            popup.style.display = 'none';
            popup.dataset.markerId = '';
        }
    }

    getSelectedMarker() {
        return this.markerManager.markers.find((m) => m.selected) || null;
    }

    selectMarker(markerId) {
        this.markerManager.markers.forEach((m) => {
            m.selected = m.id === markerId;
        });
        this.updateMarkerInspector();
        this.updateMarkerTable();
    }

    clearMarkerSelection() {
        this.markerManager.markers.forEach((m) => {
            m.selected = false;
        });
        this.updateMarkerInspector();
        this.updateMarkerTable();
    }

    createMainPanels() {
        const existing = document.getElementById('ui-root');
        if (existing) existing.remove();

        const ui = document.createElement('div');
        ui.id = 'ui-root';
        ui.innerHTML = `
            <div id="group-panel" class="panel">
                <h3>Группы</h3>
                <div id="group-controls"></div>
            </div>
            
            <div id="tools-panel" class="panel panel-left">
                <div class="marker-shell">
                    <h3>Маркеры</h3>
                </div>
                
                <div id="marker-panel-body">
                    <div class="section-card">
                        <div class="action-row">
                            <div class="action-label">Добавить маркер</div>
                            <button id="toggle-add-marker" class="mini-btn">+</button>
                        </div>
                        <div class="action-row">
                            <div class="action-label">Удаление маркера</div>
                            <button id="delete-selected-marker" class="mini-btn">−</button>
                        </div>
                        <div class="data-line">
                            <div>Поверх всего:</div>
                            <div>
                            <input type="checkbox" id="marker-always-visible" style="width: auto; margin: 0;">
                        </div>
                    </div>
                    </div>

                    <div class="section-card">
                        <div class="section-title">Данные маркера</div>
                        <div class="marker-data-grid">
                            <div class="data-line">
                                <div>Крепится к:</div>
                                <div id="selected-element-name">—</div>
                            </div>
                            <div class="data-line">
                                <div>Размер:</div>
                                <div class="slider-row">
                                    <input type="range" id="selected-marker-scale-slider" min="0.01" max="1" step="0.01" value="0.5">
                                    <input type="number" id="selected-marker-scale" min="0.01" max="1" step="0.01" value="0.5">
                                </div>
                            </div>
                            <div class="data-line">
                                <div>Цвет:</div>
                                <div><input type="color" id="selected-marker-color" value="#7eb6ff"></div>
                            </div>
                            <div class="data-line">
                                <div>Отображение:</div>
                                <div>
                                    <select id="selected-marker-shape">
                                        <option value="sphere">сфера</option>
                                        <option value="cube">куб</option>
                                    </select>
                                </div>
                            </div>
                            <div class="field-row" style="margin-top:6px;">
                                <label>Комментарий</label>
                                <textarea id="marker-comment" placeholder="Комментарий к маркеру"></textarea>
                            </div>
                        </div>
                    </div>

                    <div class="section-card">
                        <div class="section-title">Загрузка</div>
                        <div class="inline-row">
                            <select id="marker-group-select"></select>
                            <button id="load-marker-group-apply" class="mini-btn primary">↑</button>
                        </div>
                    </div>

                    <div class="section-card">
                        <div class="section-title">Сохранение</div>
                        <div class="inline-row">
                            <input id="marker-group-name" placeholder="my_group">
                            <button id="save-marker-group-name" class="mini-btn primary">↓</button>
                        </div>
                        <div class="button-row" style="margin-top:8px;">
                            <button id="save-markers-json">Скачать JSON</button>
                            <button id="load-markers-btn">Загрузить JSON</button>
                            <input type="file" id="load-markers-file" accept=".json" hidden>
                        </div>
                    </div>

                    <div class="section-card">
                        <div class="section-title">Все группы</div>
                        <div class="field-row">
                            <input id="marker-group-search" placeholder="Поиск:">
                        </div>
                        <div id="stored-marker-groups-list"></div>
                    </div>

                    <div class="section-card">
                        <div class="section-title">Список маркеров</div>
                        <div id="marker-table" class="marker-table"></div>
                    </div>

                    <div class="toggle-hidden">
                        <input type="checkbox" id="click-marker-mode">
                        <input type="color" id="marker-color" value="#7eb6ff">
                        <input type="number" id="marker-scale" value="0.5" min="0.1" max="3" step="0.05">
                        <input type="number" id="marker-opacity" value="1" min="0.1" max="1" step="0.05">
                        <input id="marker-label" placeholder="marker1">
                        <input id="marker-coords" placeholder="0 1.2 0.5">
                        <div id="active-marker-group-info"></div>
                    </div>
                </div>
                <div class="section-card">
        <div class="section-title">Режим отображения</div>
        <div class="button-row">
            <button id="set-all-markers-always">Все поверх</button>
            <button id="set-all-markers-normal">Все в глубине</button>
        </div>
        <div class="button-row" style="margin-top: 8px;">
            <button id="set-group-always">Группа поверх</button>
            <button id="set-group-normal">Группа в глубине</button>
        </div>
    </div>
            </div>
        `;
        document.body.appendChild(ui);
    }

    createGroupControls() {
        const controlsContainer = document.getElementById('group-controls');
        if (!controlsContainer || !this.atlas) return;
        controlsContainer.innerHTML = '';

        const buttonDiv = document.createElement('div');
        buttonDiv.className = 'button-row';

        const showAllBtn = document.createElement('button');
        showAllBtn.textContent = 'Show all';
        showAllBtn.onclick = () => {
            this.atlas.showAll();
            controlsContainer.querySelectorAll('input[type="checkbox"][data-group]').forEach((b) => { b.checked = true; });
            this.markerManager?.refreshVisibility();
        };

        const hideAllBtn = document.createElement('button');
        hideAllBtn.textContent = 'Hide all';
        hideAllBtn.onclick = () => {
            this.atlas.hideAll();
            controlsContainer.querySelectorAll('input[type="checkbox"][data-group]').forEach((b) => { b.checked = false; });
            this.markerManager?.refreshVisibility();
            this.hideMarkerPopup();
        };

        buttonDiv.appendChild(showAllBtn);
        buttonDiv.appendChild(hideAllBtn);
        controlsContainer.appendChild(buttonDiv);

        const groups = this.atlas.csvManager.getAllGroups().map(g => g.rawName);

        groups.forEach((groupName) => {
            if (!(groupName in this.groupVisibility)) this.groupVisibility[groupName] = false;

            const div = document.createElement('div');
            div.className = 'group-row';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = false;
            checkbox.dataset.group = groupName;
            checkbox.id = `group-${groupName}`;

            checkbox.addEventListener('change', (e) => {
                const isVisible = Boolean(e.target.checked);
                this.groupVisibility[groupName] = isVisible;
                if (isVisible) this.atlas.showGroup(groupName);
                else this.atlas.hideGroup(groupName);
                this.markerManager?.refreshVisibility();
            });

            const label = document.createElement('label');
            label.htmlFor = `group-${groupName}`;
            label.textContent = `${groupName}`;

            div.appendChild(checkbox);
            div.appendChild(label);
            controlsContainer.appendChild(div);
        });
    }

    renderMarkerGroupControls() {
        if (!this.markerManager) return;

        const select = document.getElementById('marker-group-select');
        const listWrap = document.getElementById('stored-marker-groups-list');
        const searchInput = document.getElementById('marker-group-search');
        const groups = this.markerManager.getMarkerGroups();

        if (!groups.includes(this.activeMarkerGroup)) this.activeMarkerGroup = groups[0] || 'group_1';

        if (select) {
            select.innerHTML = groups.map((groupName) =>
                `<option value="${this.escapeHtml(groupName)}" ${groupName === this.activeMarkerGroup ? 'selected' : ''}>
                    ${this.escapeHtml(groupName)}
                </option>`
            ).join('');
        }

        if (listWrap) {
            const query = String(searchInput?.value || '').trim().toLowerCase();
            const filtered = groups.filter((groupName) => groupName.toLowerCase().includes(query));

            listWrap.innerHTML = filtered.map((groupName) => {
                const count = this.markerManager.markers.filter((m) => m.markerGroup === groupName).length;
                const visible = this.markerManager.markerGroupVisibility[groupName] !== false;
                const visibilityIcon = visible ? '👁️' : '👁️‍🗨️';
                const visibilityTitle = visible ? 'Скрыть группу' : 'Показать группу';

                return `
                    <div class="group-store-row" data-group-row="${this.escapeHtml(groupName)}">
                        <div class="subtle">${this.escapeHtml(groupName)} <span class="subtle">(${count})</span></div>
                        <div style="display:flex; gap:4px;">
                            <button class="mini-btn visibility-group-btn" 
                                    data-group="${this.escapeHtml(groupName)}" 
                                    data-visible="${visible}"
                                    title="${visibilityTitle}">
                                ${visibilityIcon}
                            </button>
                            <button class="mini-btn primary use-group-btn" 
                                    data-group="${this.escapeHtml(groupName)}"
                                    title="Сделать активной">
                                ↑
                            </button>
                            <button class="mini-btn danger delete-group-btn" 
                                    data-group="${this.escapeHtml(groupName)}"
                                    title="Удалить группу">
                                🗑
                            </button>
                        </div>
                    </div>
                `;
            }).join('') || '<div class="empty-note">Группы не найдены</div>';

            listWrap.querySelectorAll('.visibility-group-btn').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const groupName = btn.dataset.group;
                    const currentVisible = btn.dataset.visible === 'true';
                    const newVisible = !currentVisible;

                    this.markerManager.setMarkerGroupVisibility(groupName, newVisible);

                    btn.dataset.visible = newVisible;
                    btn.innerHTML = newVisible ? '👁️' : '👁️‍🗨️';
                    btn.title = newVisible ? 'Скрыть группу' : 'Показать группу';

                    this.updateMarkerTable();
                    this.setStatus(`Группа «${groupName}» ${newVisible ? 'показана' : 'скрыта'}`);
                });
            });

            listWrap.querySelectorAll('.use-group-btn').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const groupName = btn.dataset.group;
                    this.activeMarkerGroup = groupName;
                    this.markerManager.setMarkerGroupVisibility(groupName, true);
                    this.renderMarkerGroupControls();
                    this.setStatus(`Активна группа маркеров: ${groupName}`);
                });
            });

            listWrap.querySelectorAll('.delete-group-btn').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const groupName = btn.dataset.group;
                    if (!confirm(`Удалить группу «${groupName}» и все её маркеры?`)) return;
                    this.markerManager.deleteMarkerGroup(groupName);
                    if (this.activeMarkerGroup === groupName) {
                        this.activeMarkerGroup = this.markerManager.getMarkerGroups()[0] || 'group_1';
                    }
                    this.renderMarkerGroupControls();
                    this.updateMarkerTable();
                    this.updateMarkerInspector();
                    this.setStatus(`Удалена группа ${groupName}`);
                });
            });
        }
    }

    getMarkerStyleFromUI() {
        return {
            label: document.getElementById('marker-label')?.value?.trim() || '',
            comment: document.getElementById('marker-comment')?.value?.trim() || '',
            color: document.getElementById('marker-color')?.value || '#7eb6ff',
            scale: Number(document.getElementById('marker-scale')?.value || 0.25),
            opacity: Number(document.getElementById('marker-opacity')?.value || 1),
            alwaysVisible: true,
            markerGroup: this.activeMarkerGroup,
            displayShape: document.getElementById('selected-marker-shape')?.value || 'sphere',
            model: document.getElementById('selected-marker-shape')?.value || 'sphere'
        };
    }

    updateMarkerInspector() {
        const marker = this.getSelectedMarker();
        const elementName = document.getElementById('selected-element-name');
        const colorInput = document.getElementById('selected-marker-color');
        const sizeInput = document.getElementById('selected-marker-scale');
        const sizeSlider = document.getElementById('selected-marker-scale-slider');
        const comment = document.getElementById('marker-comment');
        const label = document.getElementById('marker-label');
        const shapeSelect = document.getElementById('selected-marker-shape');
        const alwaysVisibleCheck = document.getElementById('marker-always-visible');

        if (!marker) {
            if (elementName) elementName.textContent = '—';
            if (colorInput) colorInput.value = '#7eb6ff';
            if (sizeInput) sizeInput.value = '0.25';
            if (sizeSlider) sizeSlider.value = '0.25';
            if (comment) comment.value = '';
            if (label) label.value = '';
            if (shapeSelect) shapeSelect.value = 'sphere';
            if (alwaysVisibleCheck) alwaysVisibleCheck.checked = false;
            return;
        }

        if (elementName) elementName.textContent = marker.elementName || marker.elementId || 'world';
        if (colorInput) colorInput.value = marker.color || '#7eb6ff';
        if (sizeInput) sizeInput.value = Number(marker.scale || 0.25).toFixed(3);
        if (sizeSlider) sizeSlider.value = Number(marker.scale || 0.25);
        if (comment) comment.value = marker.comment || '';
        if (label) label.value = marker.label || marker.name || '';
        if (shapeSelect) shapeSelect.value = marker.displayShape || 'sphere';
        if (alwaysVisibleCheck) alwaysVisibleCheck.checked = marker.alwaysVisible === true;
    }

    updateMarkerTable() {
        const wrap = document.getElementById('marker-table');
        if (!wrap || !this.markerManager) return;

        this.renderMarkerGroupControls();
        const markers = this.markerManager.markers;

        if (!markers.length) {
            wrap.innerHTML = '<div class="empty-note">Маркеров пока нет</div>';
            return;
        }

        wrap.innerHTML = markers.map((m) => `
            <div class="marker-row ${m.selected ? 'selected' : ''}" data-marker-id="${this.escapeHtml(m.id)}">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                    <strong>${this.escapeHtml(m.label || m.name || m.id)}</strong>
                    <span class="subtle">${this.escapeHtml(m.markerGroup)}</span>
                </div>
                <div class="small-note">${this.escapeHtml(m.elementName || m.elementId || 'world')}</div>
                <div class="small-note">${[m.worldPosition?.x, m.worldPosition?.y, m.worldPosition?.z].map((v) => Number(v || 0).toFixed(2)).join(', ')}</div>
                <div class="button-row compact-row">
                    <button data-action="focus">Фокус</button>
                    <button data-action="toggle-visibility">${m.visible ? 'Скрыть' : 'Показать'}</button>
                    <button data-action="show">Коммент</button>
                    <button data-action="delete">Удалить</button>
                </div>
            </div>
        `).join('');

        wrap.querySelectorAll('.marker-row').forEach((row) => {
            row.addEventListener('click', () => {
                this.selectMarker(row.dataset.markerId);
            });
        });

        wrap.querySelectorAll('button[data-action]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const row = btn.closest('[data-marker-id]');
                const id = row?.dataset.markerId;
                if (!id) return;

                const marker = this.markerManager.markers.find((m) => m.id === id);
                if (!marker) return;

                if (btn.dataset.action === 'delete') {
                    if (!confirm('Удалить этот маркер?')) return;
                    this.markerManager.removeMarker(id);
                    this.updateMarkerTable();
                    this.updateMarkerInspector();
                    return;
                }
                if (btn.dataset.action === 'focus') {
                    if (marker.sprite) this.atlas.controls.target.copy(marker.sprite.position);
                    return;
                }
                if (btn.dataset.action === 'show') {
                    this.showMarkerPopup(marker);
                }
                if (btn.dataset.action === 'toggle-visibility') {
                    this.markerManager.toggleMarkerVisibility(id);
                    this.updateMarkerTable();
                    return;
                }
            });
        });
    }

    bindUIEvents() {
        document.getElementById('toggle-add-marker')?.addEventListener('click', () => {
            const checkbox = document.getElementById('click-marker-mode');
            checkbox.checked = !checkbox.checked;
            this.atlas.renderer.domElement.style.cursor = checkbox.checked ? 'crosshair' : 'default';
            this.setStatus(checkbox.checked ? 'Режим добавления маркеров включён' : 'Режим добавления маркеров выключен');
        });

        document.getElementById('delete-selected-marker')?.addEventListener('click', () => {
            this.markerDeleteMode = !this.markerDeleteMode;
            const btn = document.getElementById('delete-selected-marker');
            if (btn) btn.classList.toggle('active-mode', this.markerDeleteMode);
            this.atlas.renderer.domElement.style.cursor = this.markerDeleteMode ? 'not-allowed' :
                (document.getElementById('click-marker-mode')?.checked ? 'crosshair' : 'default');
            this.setStatus(this.markerDeleteMode ? 'Режим удаления маркеров включён. Кликните по маркеру для удаления.' : 'Режим удаления маркеров выключен');
        });

        const selectedColor = document.getElementById('selected-marker-color');
        selectedColor?.addEventListener('input', (e) => {
            const marker = this.getSelectedMarker();
            if (!marker) return;
            this.markerManager.updateMarkerProperties(marker.id, { color: e.target.value });
            document.getElementById('marker-color').value = e.target.value;
        });

        const selectedSize = document.getElementById('selected-marker-scale');
        const selectedSizeSlider = document.getElementById('selected-marker-scale-slider');

        const scaleSlider = document.getElementById('marker-scale-slider');
        const scaleInput = document.getElementById('marker-scale');

        selectedSizeSlider?.addEventListener('input', (e) => {
            const marker = this.getSelectedMarker();
            if (!marker) return;
            const scale = Number(e.target.value);
            if (selectedSize) selectedSize.value = scale.toFixed(2);
            this.markerManager.updateMarkerProperties(marker.id, { scale });
            document.getElementById('marker-scale').value = scale;
        });

        selectedSize?.addEventListener('input', (e) => {
            const marker = this.getSelectedMarker();
            if (!marker) return;
            let scale = Number(e.target.value);
            if (!Number.isFinite(scale)) scale = 0.5;
            scale = Math.min(3, Math.max(0.1, scale));
            e.target.value = scale.toFixed(2);
            if (selectedSizeSlider) selectedSizeSlider.value = scale;
            this.markerManager.updateMarkerProperties(marker.id, { scale });
            document.getElementById('marker-scale').value = scale;
        });

        document.getElementById('marker-comment')?.addEventListener('input', (e) => {
            const marker = this.getSelectedMarker();
            if (!marker) return;
            this.markerManager.updateMarkerProperties(marker.id, { comment: e.target.value });
        });

        document.getElementById('selected-marker-shape')?.addEventListener('change', (e) => {
            const marker = this.getSelectedMarker();
            if (!marker) return;
            this.markerManager.updateMarkerProperties(marker.id, { displayShape: e.target.value, model: e.target.value });
        });

        document.getElementById('marker-label')?.addEventListener('input', (e) => {
            const marker = this.getSelectedMarker();
            if (!marker) return;
            this.markerManager.updateMarkerProperties(marker.id, { label: e.target.value });
            this.updateMarkerTable();
        });

        document.getElementById('save-marker-group-name')?.addEventListener('click', () => {
            const input = document.getElementById('marker-group-name');
            const nextName = input?.value?.trim().replace(/\s+/g, '_') || '';
            if (!nextName) return;
            if (!confirm(`Добавить новую группу «${nextName}»?`)) return;
            this.markerManager.createMarkerGroup(nextName);
            this.activeMarkerGroup = nextName;
            if (input) input.value = '';
            this.renderMarkerGroupControls();
            this.updateMarkerTable();
            this.setStatus(`Добавлена новая группа ${nextName}`);
        });

        document.getElementById('load-marker-group-apply')?.addEventListener('click', () => {
            const select = document.getElementById('marker-group-select');
            const groupName = select?.value || this.activeMarkerGroup;
            if (!confirm(`Сделать группу «${groupName}» активной?`)) return;
            this.activeMarkerGroup = groupName;
            this.markerManager.setMarkerGroupVisibility(groupName, true);
            this.renderMarkerGroupControls();
            this.setStatus(`Активна группа ${groupName}`);
        });

        document.getElementById('marker-group-search')?.addEventListener('input', () => this.renderMarkerGroupControls());

        document.getElementById('save-markers-json')?.addEventListener('click', () => {
            const blob = new Blob([JSON.stringify(this.markerManager.exportGroupedJSON(), null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'markers.json';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        });

        document.getElementById('load-markers-btn')?.addEventListener('click', () => {
            document.getElementById('load-markers-file')?.click();
        });

        document.getElementById('load-markers-file')?.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const text = await file.text();
            try {
                this.markerManager.loadFromJSON(JSON.parse(text));
                this.renderMarkerGroupControls();
                this.updateMarkerTable();
                this.updateMarkerInspector();
                this.setStatus(`Загружено маркеров: ${this.markerManager.markers.length}`);
            } catch (err) {
                console.error(err);
                this.setStatus(`Ошибка загрузки: ${err.message}`);
            }
            e.target.value = '';
        });

        document.getElementById('selected-element-name')?.addEventListener('dblclick', () => {
            const coords = prompt('Введите координаты X Y Z для нового маркера');
            if (!coords) return;
            const marker = this.markerManager.addMarkerFromCoordinates(coords, this.getMarkerStyleFromUI());
            if (!marker) {
                this.setStatus('Нужны 3 координаты: X Y Z');
                return;
            }
            this.selectMarker(marker.id);
            this.setStatus(`Маркер ${marker.id} добавлен в группу ${marker.markerGroup}`);
        });

        document.getElementById('click-marker-mode')?.addEventListener('change', (e) => {
            if (this.markerDeleteMode) {
                this.atlas.renderer.domElement.style.cursor = 'not-allowed';
                return;
            }
            this.atlas.renderer.domElement.style.cursor = e.target.checked ? 'crosshair' : 'default';
        });

        document.getElementById('add-coords-marker')?.addEventListener('click', () => {
            const coords = document.getElementById('marker-coords')?.value;
            const marker = this.markerManager.addMarkerFromCoordinates(coords, this.getMarkerStyleFromUI());
            if (!marker) {
                this.setStatus('Нужны 3 координаты: X Y Z');
                return;
            }
            this.selectMarker(marker.id);
            this.updateMarkerTable();
            this.setStatus(`Маркер добавлен по координатам в группу ${marker.markerGroup}`);
        });

        document.getElementById('marker-always-visible')?.addEventListener('change', (e) => {
            const marker = this.getSelectedMarker();
            if (!marker) {
                e.target.checked = false;
                return;
            }
            this.markerManager.setMarkerAlwaysVisible(marker.id, e.target.checked);
            this.updateMarkerTable();
            this.setStatus(`Маркер теперь ${e.target.checked ? 'поверх всех' : 'в глубине'}`);
        });

        // Все маркеры поверх
        document.getElementById('set-all-markers-always')?.addEventListener('click', () => {
            this.markerManager.markers.forEach(m => {
                this.markerManager.setMarkerAlwaysVisible(m.id, true);
            });
            this.updateMarkerTable();
            this.updateMarkerInspector();
            this.setStatus('Все маркеры теперь поверх всех объектов');
        });

        // Все маркеры в глубине
        document.getElementById('set-all-markers-normal')?.addEventListener('click', () => {
            this.markerManager.markers.forEach(m => {
                this.markerManager.setMarkerAlwaysVisible(m.id, false);
            });
            this.updateMarkerTable();
            this.updateMarkerInspector();
            this.setStatus('Все маркеры теперь учитывают глубину');
        });

        // Текущая группа поверх
        document.getElementById('set-group-always')?.addEventListener('click', () => {
            const count = this.markerManager.setGroupAlwaysVisible(this.activeMarkerGroup, true);
            this.updateMarkerTable();
            this.updateMarkerInspector();
            this.setStatus(`Группа "${this.activeMarkerGroup}" (${count} маркеров) теперь поверх всех`);
        });

        // Текущая группа в глубине
        document.getElementById('set-group-normal')?.addEventListener('click', () => {
            const count = this.markerManager.setGroupAlwaysVisible(this.activeMarkerGroup, false);
            this.updateMarkerTable();
            this.updateMarkerInspector();
            this.setStatus(`Группа "${this.activeMarkerGroup}" (${count} маркеров) теперь в глубине`);
        });
    }
}