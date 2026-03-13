// MarkerUI.js — пользовательский интерфейс для маркеров
export class MarkerUI {
    constructor(atlasScene, markerManager) {
        this.atlas = atlasScene;
        this.markerManager = markerManager;
        this.selectedElementId = '';
        this.activeMarkerGroup = '';
        this.groupVisibility = {};
        
        this.initUI();
    }

    initUI() {
        this.createMainPanels();
        this.bindUIEvents();
        this.updateMarkerTable();
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

    updateActiveGroupStatus() {
        const el = document.getElementById('active-marker-group-info');
        if (!el) return;
        el.textContent = this.activeMarkerGroup
            ? `Активная группа для маркеров: ${this.activeMarkerGroup}`
            : 'Активная группа для маркеров: не выбрана';
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

        popup.innerHTML = `
            <div style="font-weight:700; margin-bottom:6px; color:#9dc3ff;">
                ${this.escapeHtml(marker.label || marker.id)}
            </div>
            <div style="font-size:12px; opacity:0.8; margin-bottom:6px;">
                ${this.escapeHtml(marker.groupName || 'без группы')}
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

    getMarkerStyleFromUI() {
        return {
            label: document.getElementById('marker-label')?.value?.trim() || '',
            comment: document.getElementById('marker-comment')?.value?.trim() || '',
            color: document.getElementById('marker-color')?.value || '#7eb6ff',
            scale: Number(document.getElementById('marker-scale')?.value || 0.25),
            opacity: Number(document.getElementById('marker-opacity')?.value || 1),
            alwaysVisible: true
        };
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
                <h3>Маркеры и материалы</h3>
                <div class="field-row" style="display: flex; align-items: center;">
                    <input type="checkbox" id="click-marker-mode" style="margin: 0; width: 16px; height: 16px;">
                    <label for="click-marker-mode" style="margin-left: 8px; margin-bottom: 0; cursor: pointer;">Ставить маркер кликом</label>
                </div>
                <div class="field-row">
                    <label>Подпись</label>
                    <input id="marker-label" placeholder="Например: Точка боли">
                </div>
                <div class="field-row">
                    <label>Комментарий</label>
                    <textarea id="marker-comment" placeholder="Комментарий к маркеру" rows="4"></textarea>
                </div>
                <div class="field-row field-grid3">
                    <div><label>Цвет</label><input type="color" id="marker-color" value="#7eb6ff"></div>
                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <label>Размер</label>
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 4px;">
                            <input type="number" id="marker-scale" value="0.5" min="0.1" max="3" step="0.05" style="width: 100%;">
                        </div>
                        <div style="padding: 0 4px;">
                            <input type="range" id="marker-scale-slider" value="0.5" min="0.1" max="3" step="0.05" style="width: 100%;">
                        </div>
                    </div>
                    <div><label>Прозр.</label><input type="number" id="marker-opacity" value="1" min="0.1" max="1" step="0.1"></div>
                </div>
                <div class="field-row">
                    <label>Координаты X Y Z</label>
                    <input id="marker-coords" placeholder="0 1.2 0.5">
                </div>
                <div class="field-row button-row">
                    <button id="add-coords-marker">Добавить по координатам</button>
                    <button id="clear-markers">Очистить</button>
                </div>
                <div class="field-row button-row">
                    <button id="save-markers-json">Скачать JSON</button>
                    <button id="save-markers-csv">Скачать CSV</button>
                    <button id="load-markers-btn">Загрузить</button>
                    <input type="file" id="load-markers-file" accept=".json,.csv" hidden>
                </div>
                <div class="field-row">
                    <label>Выбранный элемент / ID</label>
                    <input id="selected-element" placeholder="Кликните по модели" readonly>
                </div>
                <div class="field-row field-grid3">
                    <div><label>Материал группы</label><select id="group-material-target"></select></div>
                    <div><label>Тип</label><select id="material-preset">
                        <option value="standard">Standard</option>
                        <option value="glass">Glass</option>
                        <option value="xray">XRay</option>
                        <option value="emissive">Emissive</option>
                        <option value="matte">Matte</option>
                    </select></div>
                    <div><label>Цвет</label><input type="color" id="material-color" value="#ff7a59"></div>
                </div>
                <div class="field-row button-row">
                    <button id="apply-element-material">Материал элементу</button>
                    <button id="apply-group-material">Материал группе</button>
                    <button id="reset-materials">Сбросить материалы</button>
                </div>
                <div class="field-row">
                    <label>Список маркеров</label>
                    <div id="marker-table" class="marker-table"></div>
                </div>
                <div class="field-row button-row" style="margin-top: 10px;">
                    <button id="show-all-markers">Показать все</button>
                    <button id="hide-all-markers">Скрыть все</button>
                </div>
            </div>
        `;
        document.body.appendChild(ui);
    }

    createGroupControls() {
        const controlsContainer = document.getElementById('group-controls');
        if (!controlsContainer || !this.atlas) return;
        controlsContainer.innerHTML = '';

        // Получаем группы из CSV менеджера
        const groups = this.atlas.csvManager.getAllGroups();
        const groupNames = groups.map(g => g.rawName);

        const buttonDiv = document.createElement('div');
        buttonDiv.className = 'button-row';

        const showAllBtn = document.createElement('button');
        showAllBtn.textContent = 'Show all';
        showAllBtn.onclick = () => {
            this.atlas.showAll();
            controlsContainer.querySelectorAll('input[type="checkbox"][data-group]').forEach((b) => {
                b.checked = true;
            });
            groupNames.forEach((groupName) => {
                this.groupVisibility[groupName] = true;
            });
            this.markerManager?.refreshVisibility();
        };

        const hideAllBtn = document.createElement('button');
        hideAllBtn.textContent = 'Hide all';
        hideAllBtn.onclick = () => {
            this.atlas.hideAll();
            controlsContainer.querySelectorAll('input[type="checkbox"][data-group]').forEach((b) => {
                b.checked = false;
            });
            groupNames.forEach((groupName) => {
                this.groupVisibility[groupName] = false;
            });
            this.activeMarkerGroup = '';
            this.markerManager?.refreshVisibility();
            this.updateActiveGroupStatus();
            this.hideMarkerPopup();
        };

        buttonDiv.appendChild(showAllBtn);
        buttonDiv.appendChild(hideAllBtn);
        controlsContainer.appendChild(buttonDiv);

        groupNames.forEach((groupName) => {
            if (!(groupName in this.groupVisibility)) {
                this.groupVisibility[groupName] = false;
            }

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

                if (isVisible) {
                    this.atlas.showGroup(groupName);
                    this.activeMarkerGroup = groupName;
                } else {
                    this.atlas.hideGroup(groupName);
                    if (this.activeMarkerGroup === groupName) {
                        const stillVisible = groupNames.filter((g) => this.groupVisibility[g]);
                        this.activeMarkerGroup = stillVisible.length ? stillVisible[stillVisible.length - 1] : '';
                    }
                }

                this.markerManager?.refreshVisibility();
                this.updateActiveGroupStatus();
            });

            const label = document.createElement('label');
            label.htmlFor = `group-${groupName}`;
            label.textContent = `${groupName}`;

            div.appendChild(checkbox);
            div.appendChild(label);
            controlsContainer.appendChild(div);
        });

        const activeInfo = document.createElement('div');
        activeInfo.id = 'active-marker-group-info';
        activeInfo.className = 'small-note';
        activeInfo.style.marginTop = '10px';
        controlsContainer.appendChild(activeInfo);

        this.updateActiveGroupStatus();

        const select = document.getElementById('group-material-target');
        if (select) {
            select.innerHTML = groupNames.map((g) => `<option value="${this.escapeHtml(g)}">${this.escapeHtml(g)}</option>`).join('');
        }
    }

    parseVec3Input(value) {
        const nums = String(value || '')
            .split(/[;,\s]+/)
            .map((v) => Number(v))
            .filter((v) => Number.isFinite(v));
        if (nums.length !== 3) return null;
        return { x: nums[0], y: nums[1], z: nums[2] };
    }

    updateMarkerTable() {
        const wrap = document.getElementById('marker-table');
        if (!wrap || !this.markerManager) return;
        const markers = this.markerManager.toJSON();

        if (!markers.length) {
            wrap.innerHTML = '<div class="empty-note">Маркеров пока нет</div>';
            return;
        }

        wrap.innerHTML = markers.map((m) => {
            const fullMarker = this.markerManager.markers.find(mk => mk.id === m.id);
            const isVisible = fullMarker?.visible !== false;

            return `
            <div class="marker-row" data-marker-id="${this.escapeHtml(m.id)}">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 18px; cursor: pointer;" 
                          class="visibility-toggle" 
                          data-marker-id="${this.escapeHtml(m.id)}"
                          title="${isVisible ? 'Скрыть маркер' : 'Показать маркер'}">
                        ${isVisible ? '👁️' : '👁️‍🗨️'}
                    </span>
                    <div style="flex: 1;">
                        <div><strong>${this.escapeHtml(m.label || m.id)}</strong></div>
                        <div class="small-note">${this.escapeHtml(m.elementName || m.elementId || 'world')}</div>
                    </div>
                </div>
                <div class="small-note">${[m.worldPosition?.x, m.worldPosition?.y, m.worldPosition?.z].map((v) => Number(v || 0).toFixed(2)).join(', ')}</div>
                <div class="small-note">${this.escapeHtml(m.groupName || 'no group')}</div>
                <div class="small-note">${this.escapeHtml(m.comment || '')}</div>
                <div class="button-row compact-row">
                    <button data-action="focus">Фокус</button>
                    <button data-action="show">Комментарий</button>
                    <button data-action="delete">Удалить</button>
                </div>
            </div>
        `}).join('');

        wrap.querySelectorAll('.visibility-toggle').forEach((toggle) => {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const markerId = toggle.dataset.markerId;
                const newVisibility = this.markerManager.toggleMarkerVisibility(markerId);
                this.updateMarkerTable();
                this.setStatus(`Маркер ${newVisibility ? 'показан' : 'скрыт'}`);
            });
        });

        wrap.querySelectorAll('button[data-action]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const row = btn.closest('[data-marker-id]');
                const id = row?.dataset.markerId;
                if (!id) return;

                if (btn.dataset.action === 'delete') {
                    this.markerManager.removeMarker(id);
                    this.updateMarkerTable();
                    return;
                }

                const marker = this.markerManager.markers.find((m) => m.id === id);
                if (!marker) return;

                if (btn.dataset.action === 'focus') {
                    if (marker.sprite) {
                        this.atlas.controls.target.copy(marker.sprite.position);
                    }
                    return;
                }

                if (btn.dataset.action === 'show') {
                    this.showMarkerPopup(marker);
                }
            });
        });
    }

    bindUIEvents() {
        const scaleSlider = document.getElementById('marker-scale-slider');
        const scaleInput = document.getElementById('marker-scale');

        if (scaleSlider && scaleInput) {
            scaleSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                scaleInput.value = value.toFixed(2);
            });

            scaleInput.addEventListener('input', (e) => {
                let value = parseFloat(e.target.value);
                if (isNaN(value)) value = 0.5;
                if (value < 0.1) value = 0.1;
                if (value > 3) value = 3;
                scaleInput.value = value.toFixed(2);
                scaleSlider.value = value;
            });
        }

        document.getElementById('add-coords-marker')?.addEventListener('click', () => {
            const coords = document.getElementById('marker-coords')?.value;
            const vec = this.parseVec3Input(coords);
            if (!vec) {
                this.setStatus('Нужны 3 координаты: X Y Z');
                return;
            }
            const marker = this.markerManager.addMarkerAtWorldPosition(vec, {
                ...this.getMarkerStyleFromUI(),
                groupName: this.activeMarkerGroup || ''
            });
            this.setStatus(`Маркер ${marker.id} добавлен по координатам`);
            this.updateMarkerTable();
        });

        const clickModeCheckbox = document.getElementById('click-marker-mode');
        if (clickModeCheckbox) {
            clickModeCheckbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.atlas.renderer.domElement.style.cursor = 'crosshair';
                    document.body.style.cursor = 'crosshair';
                    this.setStatus('Режим добавления маркеров включен - кликните по модели');
                } else {
                    this.atlas.renderer.domElement.style.cursor = 'default';
                    document.body.style.cursor = 'default';
                    this.setStatus('Режим добавления маркеров выключен');
                }
            });
        }

        document.getElementById('show-all-markers')?.addEventListener('click', () => {
            this.markerManager.markers.forEach(m => {
                this.markerManager.setMarkerVisibility(m.id, true);
            });
            this.updateMarkerTable();
            this.setStatus('Все маркеры показаны');
        });

        document.getElementById('hide-all-markers')?.addEventListener('click', () => {
            this.markerManager.markers.forEach(m => {
                this.markerManager.setMarkerVisibility(m.id, false);
            });
            this.updateMarkerTable();
            this.setStatus('Все маркеры скрыты');
        });

        document.getElementById('clear-markers')?.addEventListener('click', () => {
            this.markerManager.clear();
            this.updateMarkerTable();
            this.setStatus('Маркеры очищены.');
        });

        document.getElementById('save-markers-json')?.addEventListener('click', () => {
            const blob = new Blob([JSON.stringify({ markers: this.markerManager.toJSON() }, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'markers.json';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        });

        document.getElementById('save-markers-csv')?.addEventListener('click', () => {
            const blob = new Blob([this.markerManager.toCSV()], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'markers.csv';
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
            const fileName = file.name.toLowerCase();

            try {
                if (fileName.endsWith('.json')) {
                    const json = JSON.parse(text);
                    this.markerManager.loadFromJSON(json);
                    this.setStatus(`✅ Загружено маркеров из JSON: ${this.markerManager.markers.length}`);
                }
                else if (fileName.endsWith('.csv')) {
                    // Здесь нужна функция parseCSV, которую можно добавить
                    this.setStatus('CSV загрузка пока в разработке');
                }
                else {
                    this.setStatus('❌ Поддерживаются только .json и .csv файлы');
                }

                this.updateMarkerTable();
            } catch (err) {
                console.error('Ошибка загрузки:', err);
                this.setStatus(`❌ Ошибка загрузки: ${err.message}`);
            }

            e.target.value = '';
        });

        document.getElementById('apply-element-material')?.addEventListener('click', () => {
            if (!this.selectedElementId) {
                this.setStatus('Сначала выберите элемент кликом по модели.');
                return;
            }
            const color = document.getElementById('material-color')?.value;
            this.atlas.applyMaterialToGroup(this.selectedElementId, color);
            this.setStatus(`Материал применён к элементу: ${this.selectedElementId}`);
        });

        document.getElementById('apply-group-material')?.addEventListener('click', () => {
            const group = document.getElementById('group-material-target')?.value;
            if (!group) return;
            const color = document.getElementById('material-color')?.value;
            this.atlas.applyMaterialToGroup(group, color);
            this.setStatus(`Материал применён к группе: ${group}`);
        });

        document.getElementById('reset-materials')?.addEventListener('click', () => {
            // Здесь нужен метод resetAllMaterials
            this.setStatus('Сброс материалов пока не реализован');
        });
    }
}