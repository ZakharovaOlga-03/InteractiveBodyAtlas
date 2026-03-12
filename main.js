import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { anatomyCategories } from './anatomy-categories.js';
import { AtlasSceneLibrary } from './atlas-scene-library.js';

const MODEL_CANDIDATES = [
    './man_model_test_no_labels (1).glb',
    './man_model_test_no_labels.glb',
    './test_scene.glb'
];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111122);

const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.set(5, 5, 10);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.screenSpacePanning = true;

const ambientLight = new THREE.AmbientLight(0x404060, 2.1);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
directionalLight.position.set(2, 5, 3);
scene.add(directionalLight);

const backLight = new THREE.PointLight(0x4466ff, 0.8);
backLight.position.set(-2, 1, -3);
scene.add(backLight);

let atlas = null;
let markerManager = null;
let selectedElementId = '';
let activeMarkerGroup = '';

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const tempVec3 = new THREE.Vector3();
const tempVec3b = new THREE.Vector3();
const ndcVec = new THREE.Vector3();

const groupVisibility = {};

const testGroupOverrides = {
    bones: ['Cube', 'Torus', 'Suzanne'],
    muscles: ['Cone'],
    organs: ['Icosphere'],
    nerves: ['Suzanne'],
    arteries: ['Torus']
};

function isSurfacesName(name) {
    const n = String(name || '').toLowerCase();
    return (
        n.includes('surface') ||
        n.includes('dorsal') ||
        n.includes('palmar') ||
        n.includes('plantar') ||
        n.includes('region') ||
        n.includes('border')
    );
}

function isLandmarksName(name) {
    const n = String(name || '').toLowerCase();
    return (
        n.includes('triangle') ||
        n.includes('fossa') ||
        n.includes('sulcus') ||
        n.includes('gyrus') ||
        n.includes('foramen') ||
        n.includes('canal') ||
        n.includes('process')
    );
}

function matchesKeywords(name, keywords) {
    const n = String(name || '').toLowerCase();
    return keywords.some((k) => n.includes(String(k).toLowerCase()));
}

function matchesOverride(groupName, nodeName) {
    const list = testGroupOverrides[groupName];
    if (!list || !list.length) return false;
    const n = String(nodeName || '').trim();
    return list.includes(n);
}

function buildGroupRules() {
    const rules = {};
    Object.entries(anatomyCategories).forEach(([cat, config]) => {
        const keywords = config.keywords || [];
        rules[cat] = (node) => matchesOverride(cat, node?.name) || matchesKeywords(node?.name, keywords);
    });
    rules.surfaces = (node) => isSurfacesName(node?.name);
    rules.landmarks = (node) => isLandmarksName(node?.name);
    return rules;
}

function setStatus(text) {
    const d = document.getElementById('info');
    if (d) d.textContent = text;
}

function escapeHtml(v) {
    return String(v ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function downloadText(filename, text, type = 'application/json') {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) throw new Error('CSV файл пуст или содержит только заголовки');

    // Парсим заголовки (первая строка)
    const headers = parseCSVLine(lines[0]);

    // Ожидаемые заголовки
    const markers = [];

    // Проходим по всем строкам данных
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = parseCSVLine(line);
        if (values.length !== headers.length) {
            console.warn(`Строка ${i + 1} пропущена: неверное количество полей`);
            continue;
        }

        // Создаем объект маркера
        const marker = {};
        headers.forEach((header, index) => {
            const value = values[index];

            // Преобразуем типы данных
            if (value === 'true' || value === 'false') {
                marker[header] = value === 'true';
            }
            else if (!isNaN(value) && value !== '') {
                marker[header] = Number(value);
            }
            else {
                marker[header] = value || '';
            }
        });

        // Восстанавливаем вложенные объекты (position, localPosition и т.д.)
        if (marker.x !== undefined && marker.y !== undefined && marker.z !== undefined) {
            marker.worldPosition = {
                x: marker.x,
                y: marker.y,
                z: marker.z
            };
            delete marker.x;
            delete marker.y;
            delete marker.z;
        }

        if (marker.localX !== undefined && marker.localY !== undefined && marker.localZ !== undefined) {
            marker.localPosition = {
                x: marker.localX,
                y: marker.localY,
                z: marker.localZ
            };
            delete marker.localX;
            delete marker.localY;
            delete marker.localZ;
        }

        if (marker.normalX !== undefined && marker.normalY !== undefined && marker.normalZ !== undefined) {
            marker.localNormal = {
                x: marker.normalX,
                y: marker.normalY,
                z: marker.normalZ
            };
            delete marker.normalX;
            delete marker.normalY;
            delete marker.normalZ;
        }

        markers.push(marker);
    }

    return markers;
}

function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                // Экранированная кавычка
                current += '"';
                i++;
            } else {
                // Переключение режима кавычек
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            // Конец поля
            values.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    // Добавляем последнее поле
    values.push(current);

    return values;
}

function parseVec3Input(value) {
    const nums = String(value || '')
        .split(/[;,\s]+/)
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v));
    if (nums.length !== 3) return null;
    return { x: nums[0], y: nums[1], z: nums[2] };
}

function getGroupsForElementId(elementId) {
    if (!atlas || !elementId) return [];
    const groups = [];
    const groupNames = atlas.getGroupNames?.() || [];
    for (const groupName of groupNames) {
        const members = atlas.getGroupMembers?.(groupName) || [];
        if (members.includes(elementId)) {
            groups.push(groupName);
        }
    }
    return groups;
}

function getPrimaryGroup(groups) {
    if (!groups || !groups.length) return '';
    const preferredOrder = [
        'bones',
        'muscles',
        'nerves',
        'arteries',
        'veins',
        'organs',
        'ligaments',
        'landmarks',
        'surfaces',
        'auxiliary'
    ];
    for (const g of preferredOrder) {
        if (groups.includes(g)) return g;
    }
    return groups[0];
}

function getPrimaryGroupForNode(node) {
    if (!atlas || !node) return '';
    const elementId = atlas.getIdByNode(node);
    const groups = getGroupsForElementId(elementId);
    return getPrimaryGroup(groups);
}

function updateActiveGroupStatus() {
    const el = document.getElementById('active-marker-group-info');
    if (!el) return;
    el.textContent = activeMarkerGroup
        ? `Активная группа для маркеров: ${activeMarkerGroup}`
        : 'Активная группа для маркеров: не выбрана';
}

function ensureMarkerPopup() {
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

function showMarkerPopup(marker) {
    if (!marker?.sprite) return;
    const popup = ensureMarkerPopup();

    popup.innerHTML = `
        <div style="font-weight:700; margin-bottom:6px; color:#9dc3ff;">
            ${escapeHtml(marker.label || marker.id)}
        </div>
        <div style="font-size:12px; opacity:0.8; margin-bottom:6px;">
            ${escapeHtml(marker.groupName || 'без группы')}
        </div>
        <div style="font-size:13px; line-height:1.45; white-space:pre-wrap;">
            ${escapeHtml(marker.comment || 'Комментарий не указан')}
        </div>
    `;

    const world = marker.sprite.position.clone();
    world.project(camera);

    const x = (world.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-world.y * 0.5 + 0.5) * window.innerHeight;

    popup.style.left = `${Math.round(x + 14)}px`;
    popup.style.top = `${Math.round(y - 14)}px`;
    popup.style.display = 'block';
    popup.dataset.markerId = marker.id;
}

function hideMarkerPopup() {
    const popup = document.getElementById('marker-popup');
    if (popup) {
        popup.style.display = 'none';
        popup.dataset.markerId = '';
    }
}

function updatePopupPosition() {
    const popup = document.getElementById('marker-popup');
    if (!popup || popup.style.display === 'none' || !markerManager) return;

    const id = popup.dataset.markerId;
    if (!id) return;

    const marker = markerManager.markers.find((m) => m.id === id);
    if (!marker?.sprite || !marker.sprite.visible) {
        hideMarkerPopup();
        return;
    }

    ndcVec.copy(marker.sprite.position).project(camera);
    const x = (ndcVec.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-ndcVec.y * 0.5 + 0.5) * window.innerHeight;

    popup.style.left = `${Math.round(x + 14)}px`;
    popup.style.top = `${Math.round(y - 14)}px`;
}

class MarkerManager {
    constructor({ scene, atlas, camera }) {
        this.scene = scene;
        this.atlas = atlas;
        this.camera = camera;
        this.sphereGeometry = new THREE.SphereGeometry(0.25, 24, 24);
        this.group = new THREE.Group();
        this.group.name = 'marker-root';
        this.scene.add(this.group);
        this.markers = [];
        this.nextId = 1;
        this.defaultStyle = {
            label: '',
            comment: '',
            color: '#7eb6ff',
            scale: 0.25,
            opacity: 1,
            alwaysVisible: true
        };
    }

    _makeMaterial(style = {}) {
        return new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(style.color || this.defaultStyle.color),
            emissive: new THREE.Color(style.color || this.defaultStyle.color),
            emissiveIntensity: 0.25,
            metalness: 0.05,
            roughness: 0.12,
            clearcoat: 1,
            clearcoatRoughness: 0.08,
            transparent: true,
            opacity: Number.isFinite(style.opacity) ? style.opacity : this.defaultStyle.opacity,
            depthTest: !(style.alwaysVisible ?? this.defaultStyle.alwaysVisible),
            depthWrite: false
        });
    }

    _createSprite(style = {}) {
        const sphere = new THREE.Mesh(this.sphereGeometry, this._makeMaterial(style));
        const size = Number(style.scale ?? this.defaultStyle.scale) || this.defaultStyle.scale;
        sphere.scale.setScalar(size);
        sphere.renderOrder = 999;
        sphere.castShadow = false;
        sphere.receiveShadow = false;
        return sphere;
    }

    _normalizeMarker(input) {
        const marker = {
            id: input.id || `marker-${this.nextId++}`,
            label: input.label || '',
            comment: input.comment || '',
            elementId: input.elementId || '',
            elementName: input.elementName || '',
            groupName: input.groupName || input.group || '',
            color: input.color || this.defaultStyle.color,
            scale: Number(input.scale ?? this.defaultStyle.scale) || this.defaultStyle.scale,
            opacity: Number(input.opacity ?? this.defaultStyle.opacity),
            alwaysVisible: Boolean(input.alwaysVisible ?? this.defaultStyle.alwaysVisible),
            visible: input.visible !== false, // По умолчанию true, если не указано false
            localPosition: input.localPosition || null,
            localNormal: input.localNormal || null,
            worldPosition: input.worldPosition || null,
            sprite: null
        };
        if (!Number.isFinite(marker.opacity)) marker.opacity = this.defaultStyle.opacity;
        return marker;
    }

    _attachSprite(marker) {
        marker.sprite = this._createSprite(marker);
        marker.sprite.userData.markerId = marker.id;

        if (marker.elementId && marker.localPosition) {
            this._updateMarkerWorldPosition(marker);
            this.group.add(marker.sprite);
        } else if (marker.worldPosition) {
            marker.sprite.position.set(marker.worldPosition.x, marker.worldPosition.y, marker.worldPosition.z);
            this.group.add(marker.sprite);
        }

        this._applyMarkerVisibility(marker);
    }

    _updateMarkerWorldPosition(marker) {
        const mesh = this.atlas?.getNodeById?.(marker.elementId);
        if (!mesh || !marker.localPosition || !marker.sprite) return;

        marker.sprite.position.set(marker.localPosition.x, marker.localPosition.y, marker.localPosition.z);
        mesh.localToWorld(marker.sprite.position);

        if (marker.localNormal) {
            tempVec3.set(marker.localNormal.x, marker.localNormal.y, marker.localNormal.z).normalize();
            tempVec3b.copy(tempVec3).multiplyScalar(0.04);
            marker.sprite.position.add(tempVec3b);
        }
    }

    _applyMarkerVisibility(marker) {
        if (!marker?.sprite) return;

        // Видимость определяется индивидуальным флагом marker.visible
        marker.sprite.visible = marker.visible;
    }

    refreshVisibility() {
        for (const marker of this.markers) {
            if (marker?.sprite) {
                marker.sprite.visible = marker.visible;
            }
        }
    }

    update() {
        for (const marker of this.markers) {
            this._updateMarkerWorldPosition(marker);
            // Индивидуальная видимость
            if (marker?.sprite) {
                marker.sprite.visible = marker.visible;
            }
        }
    }

    toggleMarkerVisibility(id) {
        const marker = this.markers.find(m => m.id === id);
        if (!marker) return false;

        marker.visible = !marker.visible;
        if (marker.sprite) {
            marker.sprite.visible = marker.visible;
        }
        return marker.visible;
    }

    setMarkerVisibility(id, visible) {
        const marker = this.markers.find(m => m.id === id);
        if (!marker) return false;

        marker.visible = visible;
        if (marker.sprite) {
            marker.sprite.visible = visible;
        }
        return true;
    }

    addMarkerFromIntersection(intersection, style = {}) {
        const mesh = intersection?.object;
        if (!mesh) return null;

        const elementId = this.atlas.getIdByNode(mesh);
        const localPoint = mesh.worldToLocal(intersection.point.clone());

        const worldNormal =
            intersection.face?.normal?.clone()?.transformDirection(mesh.matrixWorld) ||
            new THREE.Vector3(0, 1, 0);

        const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
        const localNormal = worldNormal.clone().applyMatrix3(normalMatrix.clone().invert()).normalize();

        const autoGroup = getPrimaryGroupForNode(mesh);
        const forcedGroup = style.groupName || '';
        const finalGroup = forcedGroup || autoGroup;

        const marker = this._normalizeMarker({
            ...style,
            elementId,
            elementName: mesh.name || '',
            groupName: finalGroup,
            localPosition: { x: localPoint.x, y: localPoint.y, z: localPoint.z },
            localNormal: { x: localNormal.x, y: localNormal.y, z: localNormal.z },
            worldPosition: { x: intersection.point.x, y: intersection.point.y, z: intersection.point.z }
        });

        this._attachSprite(marker);
        this.markers.push(marker);
        return marker;
    }

    addMarkerAtWorldPosition(worldPosition, style = {}) {
        const marker = this._normalizeMarker({
            ...style,
            groupName: style.groupName || style.group || '',
            worldPosition: { ...worldPosition }
        });
        this._attachSprite(marker);
        this.markers.push(marker);
        return marker;
    }

    addMarkerFromCoordinates(coords, style = {}) {
        const vec = parseVec3Input(coords);
        if (!vec) return null;
        return this.addMarkerAtWorldPosition(vec, style);
    }

    removeMarker(id) {
        const idx = this.markers.findIndex((m) => m.id === id);
        if (idx < 0) return false;

        const [marker] = this.markers.splice(idx, 1);
        if (marker?.sprite) {
            this.group.remove(marker.sprite);
            marker.sprite.material?.dispose?.();
        }

        const popup = document.getElementById('marker-popup');
        if (popup?.dataset.markerId === id) {
            hideMarkerPopup();
        }

        return true;
    }

    updateMarker(id, patch = {}) {
        const marker = this.markers.find((m) => m.id === id);
        if (!marker) return null;

        Object.assign(marker, patch);

        if (marker.sprite) {
            marker.sprite.material?.dispose?.();
            marker.sprite.material = this._makeMaterial(marker);
            marker.sprite.scale.setScalar(Number(marker.scale) || this.defaultStyle.scale);
        }

        this._applyMarkerVisibility(marker);
        return marker;
    }

    getMarkerBySprite(sprite) {
        const id = sprite?.userData?.markerId;
        if (!id) return null;
        return this.markers.find((m) => m.id === id) || null;
    }

    clear() {
        const ids = this.markers.map((m) => m.id);
        ids.forEach((id) => this.removeMarker(id));
        hideMarkerPopup();
    }

    toJSON() {
        return this.markers.map((m) => ({
            id: m.id,
            label: m.label,
            comment: m.comment,
            elementId: m.elementId,
            elementName: m.elementName,
            groupName: m.groupName,
            color: m.color,
            scale: m.scale,
            opacity: m.opacity,
            alwaysVisible: m.alwaysVisible,
            visible: m.visible, // Добавляем visible
            localPosition: m.localPosition,
            localNormal: m.localNormal,
            worldPosition: m.worldPosition
        }));
    }

    toCSV() {
        const rows = [
            ['id', 'label', 'comment', 'groupName', 'elementId', 'elementName', 'x', 'y', 'z', 'localX', 'localY', 'localZ', 'normalX', 'normalY', 'normalZ', 'color', 'scale', 'opacity', 'alwaysVisible']
        ];

        for (const m of this.markers) {
            rows.push([
                m.id,
                m.label,
                m.comment,
                m.groupName,
                m.elementId,
                m.elementName,
                m.worldPosition?.x ?? '',
                m.worldPosition?.y ?? '',
                m.worldPosition?.z ?? '',
                m.localPosition?.x ?? '',
                m.localPosition?.y ?? '',
                m.localPosition?.z ?? '',
                m.localNormal?.x ?? '',
                m.localNormal?.y ?? '',
                m.localNormal?.z ?? '',
                m.color,
                m.scale,
                m.opacity,
                m.alwaysVisible
            ]);
        }

        return rows.map((row) => row.map((cell) => {
            const value = String(cell ?? '');
            return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
        }).join(',')).join('\n');
    }

    loadFromJSON(data) {
        const arr = Array.isArray(data) ? data : data?.markers;
        if (!Array.isArray(arr)) throw new Error('Некорректный JSON маркеров');

        this.clear();

        for (const raw of arr) {
            const marker = this._normalizeMarker(raw);

            if (!marker.groupName && marker.elementId) {
                const groups = getGroupsForElementId(marker.elementId);
                marker.groupName = getPrimaryGroup(groups);
            }

            this._attachSprite(marker);
            this.markers.push(marker);
        }

        this.refreshVisibility();
    }
}

function createMainPanels() {
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

function createGroupControls() {
    const controlsContainer = document.getElementById('group-controls');
    if (!controlsContainer || !atlas) return;
    controlsContainer.innerHTML = '';

    const buttonDiv = document.createElement('div');
    buttonDiv.className = 'button-row';

    const showAllBtn = document.createElement('button');
    showAllBtn.textContent = 'Show all';
    showAllBtn.onclick = () => {
        atlas.showAll();
        controlsContainer.querySelectorAll('input[type="checkbox"][data-group]').forEach((b) => {
            b.checked = true;
        });
        (atlas.getGroupNames?.() || []).forEach((groupName) => {
            groupVisibility[groupName] = true;
        });
        markerManager?.refreshVisibility();
    };

    const hideAllBtn = document.createElement('button');
    hideAllBtn.textContent = 'Hide all';
    hideAllBtn.onclick = () => {
        atlas.hideAll();
        controlsContainer.querySelectorAll('input[type="checkbox"][data-group]').forEach((b) => {
            b.checked = false;
        });
        (atlas.getGroupNames?.() || []).forEach((groupName) => {
            groupVisibility[groupName] = false;
        });
        activeMarkerGroup = '';
        markerManager?.refreshVisibility();
        updateActiveGroupStatus();
        hideMarkerPopup();
    };

    buttonDiv.appendChild(showAllBtn);
    buttonDiv.appendChild(hideAllBtn);
    controlsContainer.appendChild(buttonDiv);

    const groups = atlas.getGroupNames();

    groups.forEach((groupName) => {
        if (!(groupName in groupVisibility)) {
            groupVisibility[groupName] = false;
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
            groupVisibility[groupName] = isVisible;

            if (isVisible) {
                atlas.showGroup(groupName);
                activeMarkerGroup = groupName;
            } else {
                atlas.hideGroup(groupName);
                if (activeMarkerGroup === groupName) {
                    const stillVisible = groups.filter((g) => groupVisibility[g]);
                    activeMarkerGroup = stillVisible.length ? stillVisible[stillVisible.length - 1] : '';
                }
            }

            markerManager?.refreshVisibility();
            updateActiveGroupStatus();
        });

        const label = document.createElement('label');
        label.htmlFor = `group-${groupName}`;
        label.textContent = `${groupName} (${atlas.getGroupMembers(groupName).length})`;

        div.appendChild(checkbox);
        div.appendChild(label);
        controlsContainer.appendChild(div);
    });

    const activeInfo = document.createElement('div');
    activeInfo.id = 'active-marker-group-info';
    activeInfo.className = 'small-note';
    activeInfo.style.marginTop = '10px';
    controlsContainer.appendChild(activeInfo);

    updateActiveGroupStatus();

    const select = document.getElementById('group-material-target');
    if (select) {
        select.innerHTML = groups.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
    }
}

function getMarkerStyleFromUI() {
    return {
        label: document.getElementById('marker-label')?.value?.trim() || '',
        comment: document.getElementById('marker-comment')?.value?.trim() || '',
        color: document.getElementById('marker-color')?.value || '#7eb6ff',
        scale: Number(document.getElementById('marker-scale')?.value || 0.25),
        opacity: Number(document.getElementById('marker-opacity')?.value || 1),
        alwaysVisible: true
    };
}

function updateMarkerTable() {
    const wrap = document.getElementById('marker-table');
    if (!wrap || !markerManager) return;
    const markers = markerManager.toJSON();

    if (!markers.length) {
        wrap.innerHTML = '<div class="empty-note">Маркеров пока нет</div>';
        return;
    }

    wrap.innerHTML = markers.map((m) => {
        // Находим полный объект маркера чтобы получить текущий статус visible
        const fullMarker = markerManager.markers.find(mk => mk.id === m.id);
        const isVisible = fullMarker?.visible !== false;

        return `
        <div class="marker-row" data-marker-id="${escapeHtml(m.id)}">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 18px; cursor: pointer;" 
                      class="visibility-toggle" 
                      data-marker-id="${escapeHtml(m.id)}"
                      title="${isVisible ? 'Скрыть маркер' : 'Показать маркер'}">
                    ${isVisible ? '👁️' : '👁️‍🗨️'}
                </span>
                <div style="flex: 1;">
                    <div><strong>${escapeHtml(m.label || m.id)}</strong></div>
                    <div class="small-note">${escapeHtml(m.elementName || m.elementId || 'world')}</div>
                </div>
            </div>
            <div class="small-note">${[m.worldPosition?.x, m.worldPosition?.y, m.worldPosition?.z].map((v) => Number(v || 0).toFixed(2)).join(', ')}</div>
            <div class="small-note">${escapeHtml(m.groupName || 'no group')}</div>
            <div class="small-note">${escapeHtml(m.comment || '')}</div>
            <div class="button-row compact-row">
                <button data-action="focus">Фокус</button>
                <button data-action="show">Комментарий</button>
                <button data-action="delete">Удалить</button>
            </div>
        </div>
    `}).join('');

    // Обработчики для кнопок видимости
    wrap.querySelectorAll('.visibility-toggle').forEach((toggle) => {
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const markerId = toggle.dataset.markerId;
            const newVisibility = markerManager.toggleMarkerVisibility(markerId);
            updateMarkerTable(); // Обновляем таблицу
            setStatus(`Маркер ${newVisibility ? 'показан' : 'скрыт'}`);
        });
    });

    // Остальные обработчики...
    wrap.querySelectorAll('button[data-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const row = btn.closest('[data-marker-id]');
            const id = row?.dataset.markerId;
            if (!id) return;

            if (btn.dataset.action === 'delete') {
                markerManager.removeMarker(id);
                updateMarkerTable();
                return;
            }

            const marker = markerManager.markers.find((m) => m.id === id);
            if (!marker) return;

            if (btn.dataset.action === 'focus') {
                if (marker.sprite) {
                    controls.target.copy(marker.sprite.position);
                }
                return;
            }

            if (btn.dataset.action === 'show') {
                showMarkerPopup(marker);
            }
        });
    });
}

function applyMaterialPreset(target, preset, color) {
    if (!atlas || !target) return;

    if (preset === 'glass') {
        atlas.applyMaterial(target, {
            color,
            transparent: true,
            opacity: 0.35,
            roughness: 0.05,
            metalness: 0.15
        });
        return;
    }

    if (preset === 'xray') {
        atlas.applyMaterial(target, {
            color,
            transparent: true,
            opacity: 0.18,
            depthWrite: false,
            roughness: 0.2,
            metalness: 0
        });
        return;
    }

    if (preset === 'emissive') {
        atlas.applyMaterial(target, {
            color,
            emissive: color,
            emissiveIntensity: 0.45,
            roughness: 0.5,
            metalness: 0.1
        });
        return;
    }

    if (preset === 'matte') {
        atlas.applyMaterial(target, {
            color,
            roughness: 1,
            metalness: 0
        });
        return;
    }

    atlas.applyMaterial(target, { color, roughness: 0.55, metalness: 0.08 });
}

function bindUIEvents() {
    // Синхронизация ползунка и числового поля размера (ВЫНЕСЕНО НАВЕРХ!)
    const scaleSlider = document.getElementById('marker-scale-slider');
    const scaleInput = document.getElementById('marker-scale');
    const scaleValueSpan = document.getElementById('marker-scale-value');

    if (scaleSlider && scaleInput) {
        // Инициализация отображения значения
        if (scaleValueSpan) {
            scaleValueSpan.textContent = parseFloat(scaleInput.value).toFixed(2);
        }

        // При изменении ползунка
        scaleSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            scaleInput.value = value.toFixed(2);
            if (scaleValueSpan) {
                scaleValueSpan.textContent = value.toFixed(2);
            }

            // Если есть выбранный маркер в таблице, показываем предпросмотр
            const selectedRow = document.querySelector('.marker-row.selected');
            if (selectedRow) {
                const markerId = selectedRow.dataset.markerId;
                const marker = markerManager?.markers.find(m => m.id === markerId);
                if (marker && marker.sprite) {
                    marker.sprite.scale.setScalar(value);
                }
            }
        });

        // При изменении числового поля
        scaleInput.addEventListener('input', (e) => {
            let value = parseFloat(e.target.value);

            // Проверка границ
            if (isNaN(value)) value = 0.5;
            if (value < 0.1) value = 0.1;
            if (value > 3) value = 3;

            scaleInput.value = value.toFixed(2);
            scaleSlider.value = value;
            if (scaleValueSpan) {
                scaleValueSpan.textContent = value.toFixed(2);
            }

            // Если есть выбранный маркер в таблице, показываем предпросмотр
            const selectedRow = document.querySelector('.marker-row.selected');
            if (selectedRow) {
                const markerId = selectedRow.dataset.markerId;
                const marker = markerManager?.markers.find(m => m.id === markerId);
                if (marker && marker.sprite) {
                    marker.sprite.scale.setScalar(value);
                }
            }
        });
    }

    // Обработчик для добавления маркера по координатам
    document.getElementById('add-coords-marker')?.addEventListener('click', () => {
        const coords = document.getElementById('marker-coords')?.value;
        const marker = markerManager.addMarkerFromCoordinates(coords, {
            ...getMarkerStyleFromUI(),
            groupName: activeMarkerGroup || ''
        });

        if (!marker) {
            setStatus('Нужны 3 координаты: X Y Z');
            return;
        }

        setStatus(`Маркер ${marker.id} добавлен по координатам${marker.groupName ? ` | группа: ${marker.groupName}` : ''}.`);
        updateMarkerTable();
    });

    // Визуальная обратная связь для чекбокса с изменением курсора
    const clickModeCheckbox = document.getElementById('click-marker-mode');
    if (clickModeCheckbox) {
        clickModeCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                // Включаем режим добавления - меняем курсор на перекрестие
                renderer.domElement.style.cursor = 'crosshair';
                document.body.style.cursor = 'crosshair'; // На всякий случай
                setStatus('Режим добавления маркеров включен - кликните по модели');
            } else {
                // Выключаем режим - возвращаем стандартный курсор
                renderer.domElement.style.cursor = 'default';
                document.body.style.cursor = 'default';
                setStatus('Режим добавления маркеров выключен');
            }
        });
    }
    document.getElementById('show-all-markers')?.addEventListener('click', () => {
    markerManager.markers.forEach(m => {
        markerManager.setMarkerVisibility(m.id, true);
    });
    updateMarkerTable();
    setStatus('Все маркеры показаны');
});

document.getElementById('hide-all-markers')?.addEventListener('click', () => {
    markerManager.markers.forEach(m => {
        markerManager.setMarkerVisibility(m.id, false);
    });
    updateMarkerTable();
    setStatus('Все маркеры скрыты');
});

    // Остальные обработчики...
    document.getElementById('clear-markers')?.addEventListener('click', () => {
        markerManager.clear();
        updateMarkerTable();
        setStatus('Маркеры очищены.');
    });

    document.getElementById('save-markers-json')?.addEventListener('click', () => {
        downloadText('markers.json', JSON.stringify({ markers: markerManager.toJSON() }, null, 2));
    });

    document.getElementById('save-markers-csv')?.addEventListener('click', () => {
        downloadText('markers.csv', markerManager.toCSV(), 'text/csv;charset=utf-8');
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
                // Загрузка JSON
                const json = JSON.parse(text);
                markerManager.loadFromJSON(json);
                setStatus(`✅ Загружено маркеров из JSON: ${markerManager.markers.length}`);
            }
            else if (fileName.endsWith('.csv')) {
                // Загрузка CSV
                const markers = parseCSV(text);
                markerManager.loadFromJSON({ markers });
                setStatus(`✅ Загружено маркеров из CSV: ${markerManager.markers.length}`);
            }
            else {
                setStatus('❌ Поддерживаются только .json и .csv файлы');
            }

            updateMarkerTable();
        } catch (err) {
            console.error('Ошибка загрузки:', err);
            setStatus(`❌ Ошибка загрузки: ${err.message}`);
        }

        e.target.value = '';
    });

    document.getElementById('apply-element-material')?.addEventListener('click', () => {
        if (!selectedElementId) {
            setStatus('Сначала выберите элемент кликом по модели.');
            return;
        }
        applyMaterialPreset(
            selectedElementId,
            document.getElementById('material-preset')?.value,
            document.getElementById('material-color')?.value
        );
        setStatus(`Материал применён к элементу: ${selectedElementId}`);
    });

    document.getElementById('apply-group-material')?.addEventListener('click', () => {
        const group = document.getElementById('group-material-target')?.value;
        if (!group) return;
        applyMaterialPreset(
            { group },
            document.getElementById('material-preset')?.value,
            document.getElementById('material-color')?.value
        );
        setStatus(`Материал применён к группе: ${group}`);
    });

    document.getElementById('reset-materials')?.addEventListener('click', () => {
        atlas.resetAllMaterials();
        setStatus('Материалы сброшены.');
    });
}

function updatePointerFromEvent(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function getMeshIntersection(event) {
    if (!atlas) return null;
    updatePointerFromEvent(event);
    raycaster.setFromCamera(pointer, camera);
    
    // Получаем все меши, но фильтруем только видимые
    const allMeshes = atlas.getMeshes();
    const visibleMeshes = allMeshes.filter(mesh => mesh.visible);
    
    const intersections = raycaster.intersectObjects(visibleMeshes, false);
    return intersections[0] || null;
}

function getMarkerIntersection(event) {
    if (!markerManager?.group) return null;
    updatePointerFromEvent(event);
    raycaster.setFromCamera(pointer, camera);

    const markerSprites = markerManager.group.children.filter((obj) => obj.visible);
    if (!markerSprites.length) return null;

    const intersections = raycaster.intersectObjects(markerSprites, false);
    return intersections[0] || null;
}

function bindSceneEvents() {
    renderer.domElement.addEventListener('click', (event) => {
        const markerHit = getMarkerIntersection(event);
        if (markerHit) {
            const marker = markerManager.getMarkerBySprite(markerHit.object);
            if (marker) {
                showMarkerPopup(marker);
                setStatus(`Открыт комментарий маркера: ${marker.label || marker.id}`);
                return;
            }
        }

        hideMarkerPopup();

        const hit = getMeshIntersection(event);
        if (!hit) {
            // Если кликнули в пустоту или на скрытый объект
            if (document.getElementById('click-marker-mode')?.checked) {
                setStatus('❌ Кликните на видимую часть модели');
            }
            return;
        }

        const elementId = atlas.getIdByNode(hit.object);
        selectedElementId = elementId || '';

        const selectedInput = document.getElementById('selected-element');
        if (selectedInput) {
            selectedInput.value = `${hit.object.name || 'mesh'} | ${selectedElementId}`;
        }

        const clickMarkerMode = document.getElementById('click-marker-mode');
        if (clickMarkerMode?.checked) {
            const marker = markerManager.addMarkerFromIntersection(hit, {
                ...getMarkerStyleFromUI(),
                groupName: activeMarkerGroup || getPrimaryGroupForNode(hit.object)
            });

            if (marker) {
                const suffix = marker.groupName ? ` | группа: ${marker.groupName}` : '';
                setStatus(`✅ Маркер ${marker.id} привязан к ${marker.elementName || marker.elementId}${suffix}`);
                updateMarkerTable();
            }
        } else {
            setStatus(`Выбран элемент: ${hit.object.name || 'mesh'}`);
        }
    });
}

async function loadAtlasScene() {
    createMainPanels();
    ensureMarkerPopup();
    setStatus('Loading scene...');

    atlas = new AtlasSceneLibrary({
        scene,
        groupRules: buildGroupRules()
    });

    let lastError = null;
    for (const candidate of MODEL_CANDIDATES) {
        try {
            await atlas.load(candidate, {
                onProgress: (xhr) => {
                    if (!xhr || !xhr.total) return;
                    const percent = (xhr.loaded / xhr.total) * 100;
                    setStatus(`Loading: ${percent.toFixed(0)}%`);
                }
            });
            console.log('Loaded model:', candidate);
            break;
        } catch (err) {
            lastError = err;
            console.warn('Model load failed:', candidate, err);
        }
    }

    if (!atlas.root) throw lastError || new Error('Model not loaded');

    atlas.root.scale.set(5, 5, 5);
    atlas.root.position.set(0, -5, 0);
    atlas.root.traverse((node) => {
        if (node?.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
        }
    });

    (atlas.getGroupNames?.() || []).forEach((groupName) => {
        groupVisibility[groupName] = false;
    });

    markerManager = new MarkerManager({ scene, atlas, camera });
    window.Atlas = atlas;
    window.MarkerManager = markerManager;

    setStatus('Готово. Доступны маркеры, комментарии, сохранение, материалы и группы.');
    createGroupControls();
    bindUIEvents();
    bindSceneEvents();
    updateMarkerTable();
}

loadAtlasScene().catch((err) => {
    console.error('AtlasSceneLibrary - Load failed:', err);
    setStatus('Load failed. See console.');
});

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    markerManager?.update();
    updatePopupPosition();
    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', onWindowResize, false);
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    updatePopupPosition();
}