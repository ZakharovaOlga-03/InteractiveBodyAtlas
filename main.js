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
let activeMarkerGroup = 'group_1';

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

function parseVec3Input(value) {
    const nums = String(value || '')
        .split(/[;,\s]+/)
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v));
    if (nums.length !== 3) return null;
    return { x: nums[0], y: nums[1], z: nums[2] };
}

function vectorToObject(v) {
    return { x: Number(v.x), y: Number(v.y), z: Number(v.z) };
}

function getGroupsForElementId(elementId) {
    if (!atlas || !elementId) return [];
    const groups = [];
    const groupNames = atlas.getGroupNames?.() || [];
    for (const groupName of groupNames) {
        const members = atlas.getGroupMembers?.(groupName) || [];
        if (members.includes(elementId)) groups.push(groupName);
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
    return getPrimaryGroup(getGroupsForElementId(elementId));
}

function sanitizeGroupName(name) {
    const cleaned = String(name || '').trim();
    return cleaned || 'group_1';
}

function sanitizeMarkerName(name, fallback = 'marker') {
    const cleaned = String(name || '')
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_\-а-яА-Я]/g, '');
    return cleaned || fallback;
}

function updateActiveGroupStatus() {
    const el = document.getElementById('active-marker-group-info');
    if (!el) return;
    el.textContent = activeMarkerGroup
        ? `Активная группа маркеров: ${activeMarkerGroup}`
        : 'Активная группа маркеров: не выбрана';
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

    const positionText = [
        marker.worldPosition?.x,
        marker.worldPosition?.y,
        marker.worldPosition?.z
    ].map((v) => Number(v || 0).toFixed(2)).join(', ');

    popup.innerHTML = `
        <div style="font-weight:700; margin-bottom:4px; color:#9dc3ff; font-size:18px;">
            ${escapeHtml(marker.label || marker.name || marker.id)}
        </div>
        <div style="font-size:13px; opacity:0.92; margin-bottom:2px;">
            ${escapeHtml(marker.elementName || marker.elementId || 'world')}
        </div>
        <div style="font-size:12px; opacity:0.82; margin-bottom:2px;">
            ${escapeHtml(positionText)}
        </div>
        <div style="font-size:12px; opacity:0.82; margin-bottom:10px;">
            ${escapeHtml(marker.groupName || 'без анатомической группы')}
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
    if (!popup) return;
    popup.style.display = 'none';
    popup.dataset.markerId = '';
}

function updatePopupPosition() {
    const popup = document.getElementById('marker-popup');
    if (!popup || popup.style.display === 'none' || !markerManager) return;

    const marker = markerManager.markers.find((m) => m.id === popup.dataset.markerId);
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
    constructor({ scene, atlas }) {
        this.scene = scene;
        this.atlas = atlas;
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
            alwaysVisible: true,
            markerGroup: 'group_1'
        };
        this.markerGroupVisibility = { group_1: true };
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
        const mesh = new THREE.Mesh(this.sphereGeometry, this._makeMaterial(style));
        const size = Number(style.scale ?? this.defaultStyle.scale) || this.defaultStyle.scale;
        mesh.scale.setScalar(size);
        mesh.renderOrder = 999;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        return mesh;
    }

    _normalizeMarker(input) {
        const marker = {
            id: input.id || `marker-${this.nextId++}`,
            name: input.name || '',
            label: input.label || input.name || '',
            comment: input.comment || '',
            elementId: input.elementId || '',
            elementName: input.elementName || '',
            groupName: input.groupName || input.anatomyGroup || input.group || '',
            markerGroup: sanitizeGroupName(input.markerGroup || input.marker_group || this.defaultStyle.markerGroup),
            color: input.color || this.defaultStyle.color,
            scale: Number(input.scale ?? input.size ?? this.defaultStyle.scale) || this.defaultStyle.scale,
            opacity: Number(input.opacity ?? this.defaultStyle.opacity),
            alwaysVisible: Boolean(input.alwaysVisible ?? this.defaultStyle.alwaysVisible),
            visible: input.visible !== false,
            model: input.model || '',
            localPosition: input.localPosition || null,
            localNormal: input.localNormal || null,
            worldPosition: input.worldPosition || input.position || null,
            rotation: input.rotation || null,
            sprite: null,
            selected: false
        };
        if (!Number.isFinite(marker.opacity)) marker.opacity = this.defaultStyle.opacity;
        if (!marker.name) marker.name = sanitizeMarkerName(marker.label || marker.id, `marker${this.nextId}`);
        this.ensureMarkerGroup(marker.markerGroup);
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
        const markerGroupVisible = this.markerGroupVisibility[marker.markerGroup] !== false;
        const anatomyVisible = marker.groupName ? groupVisibility[marker.groupName] !== false : true;
        marker.sprite.visible = marker.visible && markerGroupVisible && anatomyVisible;
    }

    refreshVisibility() {
        for (const marker of this.markers) this._applyMarkerVisibility(marker);
    }

    update() {
        for (const marker of this.markers) {
            this._updateMarkerWorldPosition(marker);
            this._applyMarkerVisibility(marker);
        }
    }

    ensureMarkerGroup(groupName) {
        const safe = sanitizeGroupName(groupName);
        if (!(safe in this.markerGroupVisibility)) this.markerGroupVisibility[safe] = true;
        return safe;
    }

    getMarkerGroups() {
        const set = new Set(Object.keys(this.markerGroupVisibility));
        for (const marker of this.markers) set.add(marker.markerGroup || 'group_1');
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
    }

    setMarkerGroupVisibility(groupName, visible) {
        const safe = this.ensureMarkerGroup(groupName);
        this.markerGroupVisibility[safe] = Boolean(visible);
        this.refreshVisibility();
    }

    toggleMarkerVisibility(id) {
        const marker = this.markers.find((m) => m.id === id);
        if (!marker) return false;
        marker.visible = !marker.visible;
        this._applyMarkerVisibility(marker);
        return marker.visible;
    }

    setMarkerVisibility(id, visible) {
        const marker = this.markers.find((m) => m.id === id);
        if (!marker) return false;
        marker.visible = Boolean(visible);
        this._applyMarkerVisibility(marker);
        return true;
    }

    addMarkerFromIntersection(intersection, style = {}) {
        const mesh = intersection?.object;
        if (!mesh) return null;

        const elementId = this.atlas.getIdByNode(mesh);
        const localPoint = mesh.worldToLocal(intersection.point.clone());
        const worldNormal = intersection.face?.normal?.clone()?.transformDirection(mesh.matrixWorld) || new THREE.Vector3(0, 1, 0);
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
        const localNormal = worldNormal.clone().applyMatrix3(normalMatrix.clone().invert()).normalize();
        const autoGroup = getPrimaryGroupForNode(mesh);
        const marker = this._normalizeMarker({
            ...style,
            elementId,
            elementName: mesh.name || '',
            groupName: style.groupName || autoGroup,
            markerGroup: style.markerGroup || activeMarkerGroup,
            localPosition: vectorToObject(localPoint),
            localNormal: vectorToObject(localNormal),
            worldPosition: vectorToObject(intersection.point),
            rotation: style.rotation || vectorToObject(worldNormal)
        });

        this._attachSprite(marker);
        this.markers.push(marker);
        return marker;
    }

    addMarkerAtWorldPosition(worldPosition, style = {}) {
        const marker = this._normalizeMarker({
            ...style,
            markerGroup: style.markerGroup || activeMarkerGroup,
            worldPosition: { ...worldPosition },
            position: { ...worldPosition }
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
        if (document.getElementById('marker-popup')?.dataset.markerId === id) hideMarkerPopup();
        return true;
    }

    clear() {
        const ids = this.markers.map((m) => m.id);
        ids.forEach((id) => this.removeMarker(id));
        hideMarkerPopup();
    }

    updateMarkerProperties(id, properties) {
        const marker = this.markers.find((m) => m.id === id);
        if (!marker) return false;

        Object.assign(marker, properties);
        if (properties.markerGroup) {
            marker.markerGroup = this.ensureMarkerGroup(properties.markerGroup);
        }
        if (properties.name) marker.name = sanitizeMarkerName(properties.name, marker.name);

        if (marker.sprite) {
            if (properties.color && marker.sprite.material) {
                marker.sprite.material.color.set(properties.color);
                marker.sprite.material.emissive?.set?.(properties.color);
            }
            if (properties.scale !== undefined) marker.sprite.scale.setScalar(Number(properties.scale));
            if (properties.opacity !== undefined && marker.sprite.material) marker.sprite.material.opacity = Number(properties.opacity);
        }

        this._applyMarkerVisibility(marker);
        return true;
    }

    getMarkerBySprite(sprite) {
        const id = sprite?.userData?.markerId;
        return this.markers.find((m) => m.id === id) || null;
    }

    _buildUniqueMarkerKey(baseName, targetObj) {
        let key = sanitizeMarkerName(baseName, `marker${Object.keys(targetObj).length + 1}`);
        if (!targetObj[key]) return key;
        let i = 2;
        while (targetObj[`${key}_${i}`]) i += 1;
        return `${key}_${i}`;
    }

    exportGroupedJSON() {
        const result = {};
        for (const marker of this.markers) {
            const markerGroup = this.ensureMarkerGroup(marker.markerGroup || 'group_1');
            if (!result[markerGroup]) result[markerGroup] = {};

            const markerKey = this._buildUniqueMarkerKey(marker.name || marker.label || marker.id, result[markerGroup]);
            const payload = {
                position: marker.worldPosition ? { ...marker.worldPosition } : null,
                color: marker.color,
                size: marker.scale
            };

            if (marker.model) payload.model = marker.model;
            if (marker.rotation) payload.rotation = marker.rotation;
            if (marker.comment) payload.comment = marker.comment;
            if (marker.label) payload.label = marker.label;
            if (marker.groupName) payload.anatomyGroup = marker.groupName;
            if (marker.elementId) payload.elementId = marker.elementId;
            if (marker.elementName) payload.elementName = marker.elementName;
            if (marker.opacity !== undefined) payload.opacity = marker.opacity;
            if (marker.visible !== undefined) payload.visible = marker.visible;
            if (marker.localPosition) payload.localPosition = marker.localPosition;
            if (marker.localNormal) payload.localNormal = marker.localNormal;

            result[markerGroup][markerKey] = payload;
        }
        return result;
    }

    toJSON() {
        return this.exportGroupedJSON();
    }

    toCSV() {
        const rows = [
            ['markerGroup', 'name', 'label', 'comment', 'groupName', 'elementId', 'elementName', 'x', 'y', 'z', 'localX', 'localY', 'localZ', 'normalX', 'normalY', 'normalZ', 'color', 'scale', 'opacity', 'visible', 'model']
        ];
        for (const marker of this.markers) {
            rows.push([
                marker.markerGroup,
                marker.name,
                marker.label,
                marker.comment,
                marker.groupName,
                marker.elementId,
                marker.elementName,
                marker.worldPosition?.x ?? '',
                marker.worldPosition?.y ?? '',
                marker.worldPosition?.z ?? '',
                marker.localPosition?.x ?? '',
                marker.localPosition?.y ?? '',
                marker.localPosition?.z ?? '',
                marker.localNormal?.x ?? '',
                marker.localNormal?.y ?? '',
                marker.localNormal?.z ?? '',
                marker.color,
                marker.scale,
                marker.opacity,
                marker.visible,
                marker.model || ''
            ]);
        }
        return rows.map((row) => row.map((cell) => {
            const value = String(cell ?? '');
            return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
        }).join(',')).join('\n');
    }

    _loadLegacyArrayFormat(arr) {
        this.clear();
        for (const raw of arr) {
            const marker = this._normalizeMarker(raw);
            if (!marker.groupName && marker.elementId) marker.groupName = getPrimaryGroup(getGroupsForElementId(marker.elementId));
            this._attachSprite(marker);
            this.markers.push(marker);
        }
        this.refreshVisibility();
    }

    loadFromJSON(data) {
        if (Array.isArray(data)) {
            this._loadLegacyArrayFormat(data);
            return;
        }
        if (Array.isArray(data?.markers)) {
            this._loadLegacyArrayFormat(data.markers);
            return;
        }
        if (!data || typeof data !== 'object') throw new Error('Некорректный JSON маркеров');

        this.clear();

        Object.entries(data).forEach(([markerGroupName, groupMarkers]) => {
            const safeGroup = this.ensureMarkerGroup(markerGroupName);
            if (!groupMarkers || typeof groupMarkers !== 'object') return;

            Object.entries(groupMarkers).forEach(([markerName, raw]) => {
                if (!raw || typeof raw !== 'object') return;
                const marker = this._normalizeMarker({
                    ...raw,
                    name: markerName,
                    label: raw.label || markerName,
                    markerGroup: safeGroup,
                    worldPosition: raw.position || raw.worldPosition,
                    scale: raw.size ?? raw.scale,
                    groupName: raw.anatomyGroup || raw.groupName || raw.group || ''
                });

                if (!marker.groupName && marker.elementId) marker.groupName = getPrimaryGroup(getGroupsForElementId(marker.elementId));
                this._attachSprite(marker);
                this.markers.push(marker);
            });
        });

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
            <div class="field-row" style="display:flex; align-items:center;">
                <input type="checkbox" id="click-marker-mode" style="margin:0; width:16px; height:16px;">
                <label for="click-marker-mode" style="margin-left:8px; margin-bottom:0; cursor:pointer;">Ставить маркер кликом</label>
            </div>
            <div class="field-row">
                <label>Группа маркеров</label>
                <div style="display:flex; gap:8px;">
                    <select id="marker-group-select" style="flex:1;"></select>
                    <button id="create-marker-group" type="button">+</button>
                </div>
                <input id="marker-group-name" placeholder="Например: group_2" style="margin-top:8px;">
            </div>
            <div class="field-row">
                <div id="marker-group-controls"></div>
            </div>
            <div class="field-row">
                <label>Подпись</label>
                <input id="marker-label" placeholder="Например: marker1">
            </div>
            <div class="field-row">
                <label>Комментарий</label>
                <textarea id="marker-comment" placeholder="Комментарий к маркеру" rows="4"></textarea>
            </div>
            <div class="field-row field-grid3">
                <div><label>Цвет</label><input type="color" id="marker-color" value="#7eb6ff"></div>
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <label>Размер</label>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center; margin-bottom:4px;">
                        <input type="number" id="marker-scale" value="0.5" min="0.1" max="3" step="0.05" style="width:100%;">
                    </div>
                    <div style="padding:0 4px;">
                        <input type="range" id="marker-scale-slider" value="0.5" min="0.1" max="3" step="0.05" style="width:100%;">
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
    <button id="save-markers" style="flex:2;">💾 Сохранить маркеры</button>
    <button id="load-markers-btn" style="flex:1;">📂 Загрузить</button>
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
            <div class="field-row button-row" style="margin-top:10px;">
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
        controlsContainer.querySelectorAll('input[type="checkbox"][data-group]').forEach((b) => { b.checked = true; });
        (atlas.getGroupNames?.() || []).forEach((groupName) => { groupVisibility[groupName] = true; });
        markerManager?.refreshVisibility();
    };

    const hideAllBtn = document.createElement('button');
    hideAllBtn.textContent = 'Hide all';
    hideAllBtn.onclick = () => {
        atlas.hideAll();
        controlsContainer.querySelectorAll('input[type="checkbox"][data-group]').forEach((b) => { b.checked = false; });
        (atlas.getGroupNames?.() || []).forEach((groupName) => { groupVisibility[groupName] = false; });
        markerManager?.refreshVisibility();
        hideMarkerPopup();
    };

    buttonDiv.appendChild(showAllBtn);
    buttonDiv.appendChild(hideAllBtn);
    controlsContainer.appendChild(buttonDiv);

    const groups = atlas.getGroupNames();
    groups.forEach((groupName) => {
        if (!(groupName in groupVisibility)) groupVisibility[groupName] = false;

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
            if (isVisible) atlas.showGroup(groupName);
            else atlas.hideGroup(groupName);
            markerManager?.refreshVisibility();
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

function renderMarkerGroupControls() {
    const controlsWrap = document.getElementById('marker-group-controls');
    const select = document.getElementById('marker-group-select');
    if (!controlsWrap || !select || !markerManager) return;

    const groups = markerManager.getMarkerGroups();
    if (!groups.includes(activeMarkerGroup)) activeMarkerGroup = groups[0] || 'group_1';

    select.innerHTML = groups.map((groupName) => `
        <option value="${escapeHtml(groupName)}" ${groupName === activeMarkerGroup ? 'selected' : ''}>${escapeHtml(groupName)}</option>
    `).join('');

    controlsWrap.innerHTML = groups.map((groupName) => {
        const checked = markerManager.markerGroupVisibility[groupName] !== false;
        const count = markerManager.markers.filter((m) => m.markerGroup === groupName).length;
        return `
            <div class="group-row" style="margin-bottom:6px;">
                <input type="checkbox" class="marker-group-toggle" data-marker-group="${escapeHtml(groupName)}" id="marker-group-${escapeHtml(groupName)}" ${checked ? 'checked' : ''}>
                <label for="marker-group-${escapeHtml(groupName)}">${escapeHtml(groupName)} (${count})</label>
            </div>
        `;
    }).join('');

    select.onchange = (e) => {
        activeMarkerGroup = sanitizeGroupName(e.target.value);
        updateActiveGroupStatus();
    };

    controlsWrap.querySelectorAll('.marker-group-toggle').forEach((checkbox) => {
        checkbox.addEventListener('change', (e) => {
            const groupName = sanitizeGroupName(e.target.dataset.markerGroup);
            markerManager.setMarkerGroupVisibility(groupName, e.target.checked);
            updateMarkerTable();
        });
    });

    updateActiveGroupStatus();
}

function getMarkerStyleFromUI() {
    return {
        label: document.getElementById('marker-label')?.value?.trim() || '',
        comment: document.getElementById('marker-comment')?.value?.trim() || '',
        color: document.getElementById('marker-color')?.value || '#7eb6ff',
        scale: Number(document.getElementById('marker-scale')?.value || 0.25),
        opacity: Number(document.getElementById('marker-opacity')?.value || 1),
        alwaysVisible: true,
        markerGroup: sanitizeGroupName(document.getElementById('marker-group-select')?.value || activeMarkerGroup)
    };
}

function updateMarkerTable() {
    const wrap = document.getElementById('marker-table');
    if (!wrap || !markerManager) return;
    const markers = markerManager.markers;
    renderMarkerGroupControls();

    if (!markers.length) {
        wrap.innerHTML = '<div class="empty-note">Маркеров пока нет</div>';
        return;
    }

    wrap.innerHTML = markers.map((m) => {
        const isVisible = m.visible !== false;
        const groupVisible = markerManager.markerGroupVisibility[m.markerGroup] !== false;
        return `
            <div class="marker-row ${m.selected ? 'selected' : ''}" data-marker-id="${escapeHtml(m.id)}">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:18px; cursor:pointer;" class="visibility-toggle" data-marker-id="${escapeHtml(m.id)}" title="${isVisible ? 'Скрыть маркер' : 'Показать маркер'}">${isVisible ? '👁️' : '🚫'}</span>
                    <div style="flex:1;">
                        <div><strong>${escapeHtml(m.label || m.name || m.id)}</strong></div>
                        <div class="small-note">${escapeHtml(m.markerGroup)} / ${escapeHtml(m.elementName || m.elementId || 'world')}</div>
                    </div>
                </div>
                <div class="small-note">${[m.worldPosition?.x, m.worldPosition?.y, m.worldPosition?.z].map((v) => Number(v || 0).toFixed(2)).join(', ')}</div>
                <div class="small-note">${escapeHtml(m.groupName || 'no anatomy group')}</div>
                <div class="small-note">${escapeHtml(m.comment || '')}</div>
                <div class="small-note">${groupVisible ? 'Группа видна' : 'Группа скрыта'}</div>
                <div class="button-row compact-row" style="display:flex; gap:5px; flex-wrap:wrap;">
                    <button data-action="focus" style="flex:1;">Фокус</button>
                    <button data-action="show" style="flex:1;">Коммент</button>
                    <button data-action="delete" style="flex:1;">Удалить</button>
                    <button data-action="select" style="flex:1; background:#2a6f97;">Правка</button>
                </div>
                ${m.selected ? `
                <div style="margin-top:8px; padding:8px; background:rgba(0,0,0,0.3); border-radius:4px;">
                    <div style="margin-bottom:6px;">
                        <span style="color:#aaa; font-size:12px;">Группа:</span>
                        <select class="edit-marker-group" data-marker-id="${escapeHtml(m.id)}" style="width:100%; margin-top:4px;">
                            ${markerManager.getMarkerGroups().map((g) => `<option value="${escapeHtml(g)}" ${g === m.markerGroup ? 'selected' : ''}>${escapeHtml(g)}</option>`).join('')}
                        </select>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center; margin-bottom:5px;">
                        <span style="color:#aaa; font-size:12px;">Цвет:</span>
                        <input type="color" class="edit-color" data-marker-id="${escapeHtml(m.id)}" value="${escapeHtml(m.color)}" style="width:40px; height:30px;">
                    </div>
                    <div style="display:flex; gap:8px; align-items:center; margin-bottom:5px;">
                        <span style="color:#aaa; font-size:12px;">Размер:</span>
                        <input type="range" class="edit-scale" data-marker-id="${escapeHtml(m.id)}" min="0.1" max="3" step="0.05" value="${m.scale || 0.25}" style="flex:1;">
                        <span class="scale-value">${(m.scale || 0.25).toFixed(2)}</span>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <span style="color:#aaa; font-size:12px;">Прозр.:</span>
                        <input type="range" class="edit-opacity" data-marker-id="${escapeHtml(m.id)}" min="0.1" max="1" step="0.05" value="${m.opacity || 1}" style="flex:1;">
                        <span class="opacity-value">${Math.round((m.opacity || 1) * 100)}%</span>
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    }).join('');

    wrap.querySelectorAll('.visibility-toggle').forEach((toggle) => {
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const markerId = toggle.dataset.markerId;
            const newVisibility = markerManager.toggleMarkerVisibility(markerId);
            updateMarkerTable();
            setStatus(`Маркер ${newVisibility ? 'показан' : 'скрыт'}`);
        });
    });

    wrap.querySelectorAll('button[data-action]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const row = btn.closest('[data-marker-id]');
            const id = row?.dataset.markerId;
            if (!id) return;
            const marker = markerManager.markers.find((m) => m.id === id);
            if (!marker) return;

            if (btn.dataset.action === 'delete') {
                markerManager.removeMarker(id);
                updateMarkerTable();
                return;
            }
            if (btn.dataset.action === 'focus') {
                if (marker.sprite) controls.target.copy(marker.sprite.position);
                return;
            }
            if (btn.dataset.action === 'show') {
                showMarkerPopup(marker);
                return;
            }
            if (btn.dataset.action === 'select') {
                markerManager.markers.forEach((m) => { m.selected = false; });
                marker.selected = true;
                updateMarkerTable();
            }
        });
    });

    wrap.querySelectorAll('.edit-color').forEach((input) => {
        input.addEventListener('input', (e) => {
            const markerId = input.dataset.markerId;
            markerManager.updateMarkerProperties(markerId, { color: e.target.value });
        });
    });

    wrap.querySelectorAll('.edit-scale').forEach((slider) => {
        const valueSpan = slider.closest('div')?.querySelector('.scale-value');
        slider.addEventListener('input', (e) => {
            const scale = parseFloat(e.target.value);
            if (valueSpan) valueSpan.textContent = scale.toFixed(2);
            markerManager.updateMarkerProperties(slider.dataset.markerId, { scale });
        });
    });

    wrap.querySelectorAll('.edit-opacity').forEach((slider) => {
        const valueSpan = slider.closest('div')?.querySelector('.opacity-value');
        slider.addEventListener('input', (e) => {
            const opacity = parseFloat(e.target.value);
            if (valueSpan) valueSpan.textContent = `${Math.round(opacity * 100)}%`;
            markerManager.updateMarkerProperties(slider.dataset.markerId, { opacity });
        });
    });

    wrap.querySelectorAll('.edit-marker-group').forEach((select) => {
        select.addEventListener('change', (e) => {
            markerManager.updateMarkerProperties(select.dataset.markerId, { markerGroup: e.target.value });
            updateMarkerTable();
        });
    });
}

function applyMaterialPreset(target, preset, color) {
    if (!atlas || !target) return;

    if (preset === 'glass') {
        atlas.applyMaterial(target, { color, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.15 });
        return;
    }
    if (preset === 'xray') {
        atlas.applyMaterial(target, { color, transparent: true, opacity: 0.18, depthWrite: false, roughness: 0.2, metalness: 0 });
        return;
    }
    if (preset === 'emissive') {
        atlas.applyMaterial(target, { color, emissive: color, emissiveIntensity: 0.45, roughness: 0.5, metalness: 0.1 });
        return;
    }
    if (preset === 'matte') {
        atlas.applyMaterial(target, { color, roughness: 1, metalness: 0 });
        return;
    }

    atlas.applyMaterial(target, { color, roughness: 0.55, metalness: 0.08 });
}

function bindUIEvents() {
    const scaleSlider = document.getElementById('marker-scale-slider');
    const scaleInput = document.getElementById('marker-scale');
    if (scaleSlider && scaleInput) {
        scaleSlider.addEventListener('input', (e) => { scaleInput.value = Number(e.target.value).toFixed(2); });
        scaleInput.addEventListener('input', (e) => {
            let value = parseFloat(e.target.value);
            if (Number.isNaN(value)) value = 0.5;
            value = Math.min(3, Math.max(0.1, value));
            e.target.value = value.toFixed(2);
            scaleSlider.value = value;
        });
    }

    document.getElementById('create-marker-group')?.addEventListener('click', () => {
        const input = document.getElementById('marker-group-name');
        const groupName = sanitizeGroupName(input?.value || '');
        markerManager.ensureMarkerGroup(groupName);
        activeMarkerGroup = groupName;
        renderMarkerGroupControls();
        if (input) input.value = '';
        setStatus(`Создана группа маркеров: ${groupName}`);
    });

    document.getElementById('add-coords-marker')?.addEventListener('click', () => {
        const coords = document.getElementById('marker-coords')?.value;
        const marker = markerManager.addMarkerFromCoordinates(coords, getMarkerStyleFromUI());
        if (!marker) {
            setStatus('Нужны 3 координаты: X Y Z');
            return;
        }
        setStatus(`Маркер ${marker.id} добавлен в группу ${marker.markerGroup}.`);
        updateMarkerTable();
    });

    document.getElementById('click-marker-mode')?.addEventListener('change', (e) => {
        const mode = Boolean(e.target.checked);
        renderer.domElement.style.cursor = mode ? 'crosshair' : 'default';
        document.body.style.cursor = mode ? 'crosshair' : 'default';
        setStatus(mode ? 'Режим добавления маркеров включён' : 'Режим добавления маркеров выключен');
    });

    document.getElementById('show-all-markers')?.addEventListener('click', () => {
        markerManager.markers.forEach((m) => markerManager.setMarkerVisibility(m.id, true));
        updateMarkerTable();
        setStatus('Все маркеры показаны');
    });

    document.getElementById('hide-all-markers')?.addEventListener('click', () => {
        markerManager.markers.forEach((m) => markerManager.setMarkerVisibility(m.id, false));
        updateMarkerTable();
        setStatus('Все маркеры скрыты');
    });

    document.getElementById('clear-markers')?.addEventListener('click', () => {
        markerManager.clear();
        updateMarkerTable();
        setStatus('Маркеры очищены.');
    });

    document.getElementById('save-markers')?.addEventListener('click', () => {
    // Создаем временный input для ввода имени файла
    const fileName = prompt('Введите имя файла (без расширения):', 'markers');
    if (!fileName) return;
    
    // Создаем select для выбора формата
    const format = confirm('Нажмите OK для JSON (сохраняет все данные)\nОтмена для CSV (для Excel)') ? 'json' : 'csv';
    
    if (format === 'json') {
        const grouped = markerManager.exportGroupedJSON();
        downloadText(`${fileName}.json`, JSON.stringify(grouped, null, 2));
        setStatus(`✅ Маркеры сохранены как ${fileName}.json`);
    } else {
        downloadText(`${fileName}.csv`, markerManager.toCSV(), 'text/csv;charset=utf-8');
        setStatus(`✅ Маркеры экспортированы как ${fileName}.csv`);
    }
});
    document.getElementById('load-markers-btn')?.addEventListener('click', () => {
        document.getElementById('load-markers-file')?.click();
    });

    document.getElementById('load-markers-file')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        try {
            if (file.name.toLowerCase().endsWith('.json')) {
                markerManager.loadFromJSON(JSON.parse(text));
                setStatus(`✅ Загружено маркеров: ${markerManager.markers.length}`);
            } else {
                setStatus('❌ Для новой структуры поддерживается только JSON');
            }
            updateMarkerTable();
        } catch (err) {
            console.error(err);
            setStatus(`❌ Ошибка загрузки: ${err.message}`);
        }
        e.target.value = '';
    });

    document.getElementById('apply-element-material')?.addEventListener('click', () => {
        if (!selectedElementId) {
            setStatus('Сначала выберите элемент кликом по модели.');
            return;
        }
        applyMaterialPreset(selectedElementId, document.getElementById('material-preset')?.value, document.getElementById('material-color')?.value);
        setStatus(`Материал применён к элементу: ${selectedElementId}`);
    });

    document.getElementById('apply-group-material')?.addEventListener('click', () => {
        const group = document.getElementById('group-material-target')?.value;
        if (!group) return;
        applyMaterialPreset({ group }, document.getElementById('material-preset')?.value, document.getElementById('material-color')?.value);
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
    const visibleMeshes = atlas.getMeshes().filter((mesh) => mesh.visible);
    const intersections = raycaster.intersectObjects(visibleMeshes, false);
    return intersections[0] || null;
}

function getMarkerIntersection(event) {
    if (!markerManager?.group) return null;
    updatePointerFromEvent(event);
    raycaster.setFromCamera(pointer, camera);
    const visibleMarkers = markerManager.group.children.filter((obj) => obj.visible);
    const intersections = raycaster.intersectObjects(visibleMarkers, false);
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
            if (document.getElementById('click-marker-mode')?.checked) setStatus('❌ Кликните на видимую часть модели');
            return;
        }

        const elementId = atlas.getIdByNode(hit.object);
        selectedElementId = elementId || '';
        const selectedInput = document.getElementById('selected-element');
        if (selectedInput) selectedInput.value = `${hit.object.name || 'mesh'} | ${selectedElementId}`;

        if (document.getElementById('click-marker-mode')?.checked) {
            const marker = markerManager.addMarkerFromIntersection(hit, {
                ...getMarkerStyleFromUI(),
                groupName: getPrimaryGroupForNode(hit.object),
                markerGroup: activeMarkerGroup
            });
            if (marker) {
                setStatus(`✅ Маркер ${marker.id} добавлен в ${marker.markerGroup}`);
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

    atlas = new AtlasSceneLibrary({ scene, groupRules: buildGroupRules() });

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

    markerManager = new MarkerManager({ scene, atlas });
    window.Atlas = atlas;
    window.MarkerManager = markerManager;

    createGroupControls();
    bindUIEvents();
    bindSceneEvents();
    renderMarkerGroupControls();
    updateMarkerTable();
    setStatus('Готово. Добавлены группы маркеров и новый JSON-формат.');
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
