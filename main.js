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

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
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

scene.add(new THREE.AmbientLight(0x404060, 2.1));
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
let panelCollapsed = false;
let markerDeleteMode = false;

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
    return n.includes('surface') || n.includes('dorsal') || n.includes('palmar') || n.includes('plantar') || n.includes('region') || n.includes('border');
}

function isLandmarksName(name) {
    const n = String(name || '').toLowerCase();
    return n.includes('triangle') || n.includes('fossa') || n.includes('sulcus') || n.includes('gyrus') || n.includes('foramen') || n.includes('canal') || n.includes('process');
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
    const nums = String(value || '').split(/[;,\s]+/).map((v) => Number(v)).filter((v) => Number.isFinite(v));
    if (nums.length !== 3) return null;
    return { x: nums[0], y: nums[1], z: nums[2] };
}

function vectorToObject(v) {
    return { x: Number(v.x), y: Number(v.y), z: Number(v.z) };
}

function sanitizeGroupName(name) {
    const cleaned = String(name || '').trim().replace(/\s+/g, '_');
    return cleaned || 'group_1';
}

function sanitizeMarkerName(name, fallback = 'marker') {
    const cleaned = String(name || '').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-а-яА-Я]/g, '');
    return cleaned || fallback;
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
    const preferredOrder = ['bones', 'muscles', 'nerves', 'arteries', 'veins', 'organs', 'ligaments', 'landmarks', 'surfaces', 'auxiliary'];
    for (const g of preferredOrder) if (groups.includes(g)) return g;
    return groups[0];
}

function getPrimaryGroupForNode(node) {
    if (!atlas || !node) return '';
    const elementId = atlas.getIdByNode(node);
    return getPrimaryGroup(getGroupsForElementId(elementId));
}

function getSelectedMarker() {
    if (!markerManager) return null;
    return markerManager.markers.find((m) => m.selected) || null;
}

function selectMarker(markerId) {
    if (!markerManager) return;

    markerManager.markers.forEach((m) => {
        m.selected = false;
    });

    const marker = markerManager.markers.find((m) => m.id === markerId);
    if (marker) {
        marker.selected = true;


        if (marker.markerGroup !== activeMarkerGroup) {
            console.log(`Маркер из группы ${marker.markerGroup}, текущая группа ${activeMarkerGroup}`);
        }
    }

    updateMarkerInspector();
    updateMarkerTable();
}

function clearMarkerSelection() {
    if (!markerManager) return;
    markerManager.markers.forEach((m) => {
        m.selected = false;
    });
    updateMarkerInspector();
    updateMarkerTable();
}

function updateActiveGroupStatus() {
    const el = document.getElementById('active-marker-group-info');
    if (el) el.textContent = activeMarkerGroup || 'не выбрана';
}

function ensureMarkerPopup() {
    let popup = document.getElementById('marker-popup');
    if (popup) return popup;
    popup = document.createElement('div');
    popup.id = 'marker-popup';
    popup.style.cssText = `
        position:absolute; display:none; min-width:220px; max-width:320px; z-index:2000; pointer-events:none;
        background:rgba(10,14,28,0.96); color:white; border:1px solid rgba(126,182,255,0.35); border-radius:12px;
        padding:12px 14px; box-shadow:0 10px 28px rgba(0,0,0,0.35); backdrop-filter: blur(8px); font-family:inherit;
    `;
    document.body.appendChild(popup);
    return popup;
}

function showMarkerPopup(marker) {
    if (!marker?.sprite) return;
    const popup = ensureMarkerPopup();
    const positionText = [marker.worldPosition?.x, marker.worldPosition?.y, marker.worldPosition?.z].map((v) => Number(v || 0).toFixed(2)).join(', ');
    popup.innerHTML = `
        <div style="font-weight:700; margin-bottom:4px; color:#9dc3ff; font-size:18px;">${escapeHtml(marker.label || marker.name || marker.id)}</div>
        <div style="font-size:13px; opacity:0.92; margin-bottom:2px;">${escapeHtml(marker.elementName || marker.elementId || 'world')}</div>
        <div style="font-size:12px; opacity:0.82; margin-bottom:2px;">${escapeHtml(positionText)}</div>
        <div style="font-size:12px; opacity:0.82; margin-bottom:10px;">${escapeHtml(marker.groupName || 'без анатомической группы')}</div>
        <div style="font-size:13px; line-height:1.45; white-space:pre-wrap;">${escapeHtml(marker.comment || 'Комментарий не указан')}</div>
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
        this.boxGeometry = new THREE.BoxGeometry(0.42, 0.42, 0.42);
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
            markerGroup: 'group_1',
            displayShape: 'sphere'
        };
        this.markerGroupVisibility = { group_1: true };
    }

    _makeMaterial(style = {}) {
    const alwaysVisible = style.alwaysVisible ?? this.defaultStyle.alwaysVisible;
    
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
        
       
        depthTest: true,           
        depthWrite: false,          
        
        polygonOffset: true,        
        polygonOffsetFactor: 1,    
        polygonOffsetUnits: 1      
    });
}

    _getGeometry(shape = 'sphere') {
        return shape === 'cube' ? this.boxGeometry : this.sphereGeometry;
    }

    _createSprite(style = {}) {
        const mesh = new THREE.Mesh(this._getGeometry(style.displayShape), this._makeMaterial(style));
        const size = Number(style.scale ?? this.defaultStyle.scale) || this.defaultStyle.scale;
        mesh.scale.setScalar(size);
        mesh.renderOrder = 999;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        return mesh;
    }

    ensureMarkerGroup(groupName) {
        const safe = sanitizeGroupName(groupName);
        if (!(safe in this.markerGroupVisibility)) this.markerGroupVisibility[safe] = true;
        return safe;
    }

    createMarkerGroup(groupName) {
        return this.ensureMarkerGroup(groupName);
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

    renameMarkerGroup(oldName, newName) {
        const oldSafe = sanitizeGroupName(oldName);
        const newSafe = this.ensureMarkerGroup(newName);
        if (oldSafe === newSafe) return true;
        this.markers.forEach((marker) => {
            if (marker.markerGroup === oldSafe) marker.markerGroup = newSafe;
        });
        const wasVisible = this.markerGroupVisibility[oldSafe] !== false;
        delete this.markerGroupVisibility[oldSafe];
        this.markerGroupVisibility[newSafe] = wasVisible;
        this.refreshVisibility();
        return true;
    }

    deleteMarkerGroup(groupName) {
        const safe = sanitizeGroupName(groupName);
        const ids = this.markers.filter((m) => m.markerGroup === safe).map((m) => m.id);
        ids.forEach((id) => this.removeMarker(id));
        delete this.markerGroupVisibility[safe];
        if (!Object.keys(this.markerGroupVisibility).length) this.markerGroupVisibility.group_1 = true;
        return true;
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
            displayShape: input.displayShape || input.shape || input.model || this.defaultStyle.displayShape,
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
        marker.sprite.visible = marker.visible && markerGroupVisible;
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
        const marker = this._normalizeMarker({
            ...style,
            elementId,
            elementName: mesh.name || '',
            groupName: style.groupName || getPrimaryGroupForNode(mesh),
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

        // Вызываем колбэк если есть
        if (this.onMarkerRemoved) {
            this.onMarkerRemoved(id);
        }

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
        if (properties.markerGroup) marker.markerGroup = this.ensureMarkerGroup(properties.markerGroup);
        if (properties.name) marker.name = sanitizeMarkerName(properties.name, marker.name);
        if (marker.sprite) {
            if (properties.color && marker.sprite.material) {
                marker.sprite.material.color.set(properties.color);
                marker.sprite.material.emissive?.set?.(properties.color);
            }
            if (properties.scale !== undefined) marker.sprite.scale.setScalar(Number(properties.scale));
            if (properties.opacity !== undefined && marker.sprite.material) marker.sprite.material.opacity = Number(properties.opacity);
            if (properties.displayShape !== undefined || properties.model !== undefined) {
                marker.sprite.geometry = this._getGeometry(marker.displayShape);
            }
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
            payload.model = marker.displayShape || marker.model || 'sphere';
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

    toCSV() {
        const rows = [['markerGroup', 'name', 'label', 'comment', 'groupName', 'elementId', 'elementName', 'x', 'y', 'z', 'color', 'scale', 'opacity', 'visible']];
        for (const marker of this.markers) {
            rows.push([
                marker.markerGroup, marker.name, marker.label, marker.comment, marker.groupName,
                marker.elementId, marker.elementName, marker.worldPosition?.x ?? '', marker.worldPosition?.y ?? '', marker.worldPosition?.z ?? '',
                marker.color, marker.scale, marker.opacity, marker.visible
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
        if (Array.isArray(data)) return this._loadLegacyArrayFormat(data);
        if (Array.isArray(data?.markers)) return this._loadLegacyArrayFormat(data.markers);
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
                </div>

                <div class="section-card">
                    <div class="section-title">Данные маркера</div>
                    <div class="marker-data-grid">
                        <div class="data-line"><div>Крепится к:</div><div id="selected-element-name">—</div></div>
                        <div class="data-line">
                            <div>Размер:</div>
                            <div class="slider-row">
                                <input type="range" id="selected-marker-scale-slider" min="0.1" max="3" step="0.05" value="0.5">
                                <input type="number" id="selected-marker-scale" min="0.1" max="3" step="0.05" value="0.5">
                            </div>
                        </div>
                        <div class="data-line"><div>Цвет:</div><div><input type="color" id="selected-marker-color" value="#7eb6ff"></div></div>
                        <div class="data-line"><div>Отображение:</div><div><select id="selected-marker-shape"><option value="sphere">сфера</option><option value="cube">куб</option></select></div></div>
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
                    <div class="field-row"><input id="marker-group-search" placeholder="Поиск:"></div>
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
            if (isVisible) atlas.showGroup(groupName); else atlas.hideGroup(groupName);
            markerManager?.refreshVisibility();
        });
        const label = document.createElement('label');
        label.htmlFor = `group-${groupName}`;
        label.textContent = `${groupName} (${atlas.getGroupMembers(groupName).length})`;
        div.appendChild(checkbox);
        div.appendChild(label);
        controlsContainer.appendChild(div);
    });
}

function renderMarkerGroupControls() {
    if (!markerManager) return;
    const select = document.getElementById('marker-group-select');
    const listWrap = document.getElementById('stored-marker-groups-list');
    const searchInput = document.getElementById('marker-group-search');
    const groups = markerManager.getMarkerGroups();
    if (!groups.includes(activeMarkerGroup)) activeMarkerGroup = groups[0] || 'group_1';

    if (select) {
        select.innerHTML = groups.map((groupName) =>
            `<option value="${escapeHtml(groupName)}" ${groupName === activeMarkerGroup ? 'selected' : ''}>${escapeHtml(groupName)}</option>`
        ).join('');


        select.addEventListener('change', (e) => {
            const selectedGroup = e.target.value;


            markerManager.markers.forEach(marker => {
                marker.visible = false;
            });


            markerManager.markers.forEach(marker => {
                if (marker.markerGroup === selectedGroup) {
                    marker.visible = true;
                }
            });


            activeMarkerGroup = selectedGroup;


            markerManager.setMarkerGroupVisibility(selectedGroup, true);


            renderMarkerGroupControls();
            updateMarkerTable();

            setStatus(`Загружены маркеры группы: ${selectedGroup}`);
        });
    }

    if (listWrap) {
        const query = String(searchInput?.value || '').trim().toLowerCase();
        const filtered = groups.filter((groupName) => groupName.toLowerCase().includes(query));

        listWrap.innerHTML = filtered.map((groupName) => {
            const count = markerManager.markers.filter((m) => m.markerGroup === groupName).length;

            return `
                <div class="group-store-row" data-group-row="${escapeHtml(groupName)}">
                    <div class="group-store-name">${escapeHtml(groupName)} <span class="subtle">(${count})</span></div>
                    <div style="display:flex; gap:4px;">
                        <button class="mini-btn primary use-group-btn" 
                                data-group="${escapeHtml(groupName)}"
                                title="Показать маркеры этой группы">
                            ↑
                        </button>
                        <button class="mini-btn danger delete-group-btn" 
                                data-group="${escapeHtml(groupName)}"
                                title="Удалить группу">
                            🗑
                        </button>
                    </div>
                </div>
            `;
        }).join('') || '<div class="empty-note">Группы не найдены</div>';

        listWrap.querySelectorAll('.use-group-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const groupName = sanitizeGroupName(btn.dataset.group);

                // Сначала скрываем ВСЕ маркеры
                markerManager.markers.forEach(marker => {
                    marker.visible = false;
                });

                // Затем показываем только маркеры выбранной группы
                markerManager.markers.forEach(marker => {
                    if (marker.markerGroup === groupName) {
                        marker.visible = true;
                    }
                });

                // Делаем группу активной для добавления новых маркеров
                activeMarkerGroup = groupName;

                // Обновляем интерфейс
                renderMarkerGroupControls();
                updateMarkerTable();
                markerManager.refreshVisibility();

                setStatus(`Показаны маркеры группы: ${groupName}`);
            });
        });

        listWrap.querySelectorAll('.delete-group-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const groupName = sanitizeGroupName(btn.dataset.group);
                if (!confirm(`Удалить группу «${groupName}» и все её маркеры?`)) return;
                markerManager.deleteMarkerGroup(groupName);
                if (activeMarkerGroup === groupName) activeMarkerGroup = markerManager.getMarkerGroups()[0] || 'group_1';
                renderMarkerGroupControls();
                updateMarkerTable();
                updateMarkerInspector();
                setStatus(`Удалена группа ${groupName}`);
            });
        });
    }
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
        markerGroup: sanitizeGroupName(document.getElementById('marker-group-select')?.value || activeMarkerGroup),
        displayShape: document.getElementById('selected-marker-shape')?.value || 'sphere',
        model: document.getElementById('selected-marker-shape')?.value || 'sphere'
    };
}

function updateMarkerInspector() {
    const marker = getSelectedMarker();
    const elementName = document.getElementById('selected-element-name');
    const colorInput = document.getElementById('selected-marker-color');
    const sizeInput = document.getElementById('selected-marker-scale');
    const sizeSlider = document.getElementById('selected-marker-scale-slider');
    const comment = document.getElementById('marker-comment');
    const label = document.getElementById('marker-label');
    const shapeSelect = document.getElementById('selected-marker-shape');

    if (!marker) {
        if (elementName) elementName.textContent = '—';
        if (colorInput) colorInput.value = '#7eb6ff';
        if (sizeInput) sizeInput.value = '0.50';
        if (sizeSlider) sizeSlider.value = '0.5';
        if (comment) comment.value = '';
        if (label) label.value = '';
        if (shapeSelect) shapeSelect.value = 'sphere';
        return;
    }

    if (elementName) elementName.textContent = marker.elementName || marker.elementId || 'world';
    if (colorInput) colorInput.value = marker.color || '#7eb6ff';
    if (sizeInput) sizeInput.value = Number(marker.scale || 0.5).toFixed(2);
    if (sizeSlider) sizeSlider.value = Number(marker.scale || 0.5);
    if (comment) comment.value = marker.comment || '';
    if (label) label.value = marker.label || marker.name || '';
    if (shapeSelect) shapeSelect.value = marker.displayShape || 'sphere';
}

function updateMarkerTable() {
    const wrap = document.getElementById('marker-table');
    if (!wrap || !markerManager) return;

    renderMarkerGroupControls();

    // Фильтруем маркеры только для активной группы
    const markers = markerManager.markers.filter(m => m.markerGroup === activeMarkerGroup);

    if (!markers.length) {
        wrap.innerHTML = '<div class="empty-note">Нет маркеров в этой группе</div>';
        return;
    }

    wrap.innerHTML = markers.map((m) => `
        <div class="marker-row ${m.selected ? 'selected' : ''}" data-marker-id="${escapeHtml(m.id)}">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                <strong>${escapeHtml(m.label || m.name || m.id)}</strong>
                <span class="subtle">${escapeHtml(m.markerGroup)}</span>
            </div>
            <div class="small-note">${escapeHtml(m.elementName || m.elementId || 'world')}</div>
            <div class="small-note">${[m.worldPosition?.x, m.worldPosition?.y, m.worldPosition?.z].map((v) => Number(v || 0).toFixed(2)).join(', ')}</div>
            <div class="button-row compact-row">
                <button data-action="focus">Фокус</button>
                <button data-action="show">Коммент</button>
                <button data-action="delete">Удалить</button>
            </div>
        </div>
    `).join('');

    wrap.querySelectorAll('.marker-row').forEach((row) => {
        row.addEventListener('click', () => {
            selectMarker(row.dataset.markerId);
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
                if (!confirm('Удалить этот маркер?')) return;
                markerManager.removeMarker(id);
                updateMarkerTable();
                updateMarkerInspector();
                return;
            }

            if (btn.dataset.action === 'focus') {
                if (marker.sprite) controls.target.copy(marker.sprite.position);
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
    if (preset === 'glass') return atlas.applyMaterial(target, { color, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.15 });
    if (preset === 'xray') return atlas.applyMaterial(target, { color, transparent: true, opacity: 0.18, depthWrite: false, roughness: 0.2, metalness: 0 });
    if (preset === 'emissive') return atlas.applyMaterial(target, { color, emissive: color, emissiveIntensity: 0.45, roughness: 0.5, metalness: 0.1 });
    if (preset === 'matte') return atlas.applyMaterial(target, { color, roughness: 1, metalness: 0 });
    atlas.applyMaterial(target, { color, roughness: 0.55, metalness: 0.08 });
}

function bindUIEvents() {
    const toggleBodyBtn = document.getElementById('toggle-marker-panel');
    const body = document.getElementById('marker-panel-body');
    toggleBodyBtn?.addEventListener('click', () => {
        panelCollapsed = !panelCollapsed;
        if (body) body.style.display = panelCollapsed ? 'none' : '';
        toggleBodyBtn.textContent = panelCollapsed ? '>>' : '<<';
    });

    document.getElementById('toggle-add-marker')?.addEventListener('click', () => {
        const checkbox = document.getElementById('click-marker-mode');
        checkbox.checked = !checkbox.checked;
        renderer.domElement.style.cursor = checkbox.checked ? 'crosshair' : 'default';
        setStatus(checkbox.checked ? 'Режим добавления маркеров включён' : 'Режим добавления маркеров выключен');
    });

    document.getElementById('delete-selected-marker')?.addEventListener('click', () => {
        markerDeleteMode = !markerDeleteMode;
        const btn = document.getElementById('delete-selected-marker');
        if (btn) btn.classList.toggle('active-mode', markerDeleteMode);
        renderer.domElement.style.cursor = markerDeleteMode ? 'not-allowed' : (document.getElementById('click-marker-mode')?.checked ? 'crosshair' : 'default');
        setStatus(markerDeleteMode ? 'Режим удаления маркеров включён. Кликните по маркеру для удаления.' : 'Режим удаления маркеров выключен');
    });

    const selectedColor = document.getElementById('selected-marker-color');
    selectedColor?.addEventListener('input', (e) => {
        const marker = getSelectedMarker();
        if (!marker) return;
        markerManager.updateMarkerProperties(marker.id, { color: e.target.value });
        document.getElementById('marker-color').value = e.target.value;
    });

    const selectedSize = document.getElementById('selected-marker-scale');
    const selectedSizeSlider = document.getElementById('selected-marker-scale-slider');
    selectedSizeSlider?.addEventListener('input', (e) => {
        const marker = getSelectedMarker();
        if (!marker) return;
        const scale = Number(e.target.value);
        if (selectedSize) selectedSize.value = scale.toFixed(2);
        markerManager.updateMarkerProperties(marker.id, { scale });
        document.getElementById('marker-scale').value = scale;
    });
    selectedSize?.addEventListener('input', (e) => {
        const marker = getSelectedMarker();
        if (!marker) return;
        let scale = Number(e.target.value);
        if (!Number.isFinite(scale)) scale = 0.5;
        scale = Math.min(3, Math.max(0.1, scale));
        e.target.value = scale.toFixed(2);
        if (selectedSizeSlider) selectedSizeSlider.value = scale;
        markerManager.updateMarkerProperties(marker.id, { scale });
        document.getElementById('marker-scale').value = scale;
    });

    document.getElementById('marker-comment')?.addEventListener('input', (e) => {
        const marker = getSelectedMarker();
        if (!marker) return;
        markerManager.updateMarkerProperties(marker.id, { comment: e.target.value });
    });

    document.getElementById('selected-marker-shape')?.addEventListener('change', (e) => {
        const marker = getSelectedMarker();
        if (!marker) return;
        markerManager.updateMarkerProperties(marker.id, { displayShape: e.target.value, model: e.target.value });
    });

    document.getElementById('marker-label')?.addEventListener('input', (e) => {
        const marker = getSelectedMarker();
        if (!marker) return;
        markerManager.updateMarkerProperties(marker.id, { label: e.target.value, name: sanitizeMarkerName(e.target.value, marker.name) });
        updateMarkerTable();
    });

    document.getElementById('save-marker-group-name')?.addEventListener('click', () => {
        const input = document.getElementById('marker-group-name');
        const nextName = sanitizeGroupName(input?.value || '');
        if (!nextName) return;
        if (!confirm(`Добавить новую группу «${nextName}»?`)) return;
        markerManager.createMarkerGroup(nextName);
        activeMarkerGroup = nextName;
        if (input) input.value = '';
        renderMarkerGroupControls();
        updateMarkerTable();
        setStatus(`Добавлена новая группа ${nextName}`);
    });

    document.getElementById('load-marker-group-apply')?.addEventListener('click', () => {
        const select = document.getElementById('marker-group-select');
        const groupName = sanitizeGroupName(select?.value || activeMarkerGroup);
        if (!confirm(`Сделать группу «${groupName}» активной?`)) return;
        activeMarkerGroup = groupName;
        markerManager.setMarkerGroupVisibility(groupName, true);
        renderMarkerGroupControls();
        setStatus(`Активна группа ${groupName}`);
    });

    document.getElementById('marker-group-search')?.addEventListener('input', renderMarkerGroupControls);

    document.getElementById('save-markers-json')?.addEventListener('click', () => {
        downloadText('markers.json', JSON.stringify(markerManager.exportGroupedJSON(), null, 2));
    });

    document.getElementById('load-markers-btn')?.addEventListener('click', () => {
        document.getElementById('load-markers-file')?.click();
    });

    document.getElementById('load-markers-file')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        try {
            markerManager.loadFromJSON(JSON.parse(text));


            const groups = markerManager.getMarkerGroups();
            if (groups.length > 0) {

                const groupToShow = groups.includes(activeMarkerGroup) ? activeMarkerGroup : groups[0];


                markerManager.markers.forEach(marker => {
                    marker.visible = false;
                });


                markerManager.markers.forEach(marker => {
                    if (marker.markerGroup === groupToShow) {
                        marker.visible = true;
                    }
                });

                activeMarkerGroup = groupToShow;
                markerManager.setMarkerGroupVisibility(groupToShow, true);
            }

            renderMarkerGroupControls();
            updateMarkerTable();
            updateMarkerInspector();
            setStatus(`Загружено маркеров: ${markerManager.markers.length}`);
        } catch (err) {
            console.error(err);
            setStatus(`Ошибка загрузки: ${err.message}`);
        }
        e.target.value = '';
    });

    document.getElementById('selected-element-name')?.addEventListener('dblclick', () => {
        const coords = prompt('Введите координаты X Y Z для нового маркера');
        if (!coords) return;
        const marker = markerManager.addMarkerFromCoordinates(coords, getMarkerStyleFromUI());
        if (!marker) {
            setStatus('Нужны 3 координаты: X Y Z');
            return;
        }
        selectMarker(marker.id);
        setStatus(`Маркер ${marker.id} добавлен в группу ${marker.markerGroup}`);
    });

    document.getElementById('click-marker-mode')?.addEventListener('change', (e) => {
        if (markerDeleteMode) {
            renderer.domElement.style.cursor = 'not-allowed';
            return;
        }
        renderer.domElement.style.cursor = e.target.checked ? 'crosshair' : 'default';
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
                if (markerDeleteMode) {
                    if (!confirm(`Удалить маркер «${marker.label || marker.name || marker.id}»?`)) return;
                    markerManager.removeMarker(marker.id);
                    markerDeleteMode = false;
                    const deleteBtn = document.getElementById('delete-selected-marker');
                    if (deleteBtn) deleteBtn.classList.remove('active-mode');
                    renderer.domElement.style.cursor = document.getElementById('click-marker-mode')?.checked ? 'crosshair' : 'default';
                    updateMarkerTable();
                    updateMarkerInspector();
                    setStatus('Маркер удалён');
                    return;
                }
                selectMarker(marker.id);
                showMarkerPopup(marker);
                setStatus(`Открыт маркер: ${marker.label || marker.id}`);
                return;
            }
        }

        hideMarkerPopup();
        const hit = getMeshIntersection(event);
        if (!hit) {
            if (markerDeleteMode) setStatus('Кликните по маркеру, который нужно удалить');
            else if (document.getElementById('click-marker-mode')?.checked) setStatus('Кликните на видимую часть модели');
            return;
        }

        const elementId = atlas.getIdByNode(hit.object);
        selectedElementId = elementId || '';
        const attach = document.getElementById('selected-element-name');
        if (attach) attach.textContent = hit.object.name || selectedElementId || 'mesh';

        if (document.getElementById('click-marker-mode')?.checked) {
            const marker = markerManager.addMarkerFromIntersection(hit, {
                ...getMarkerStyleFromUI(),
                groupName: getPrimaryGroupForNode(hit.object),
                markerGroup: activeMarkerGroup
            });
            if (marker) {
                selectMarker(marker.id);
                updateMarkerInspector();
                updateMarkerTable();
                setStatus(`Маркер ${marker.id} добавлен в ${marker.markerGroup}`);
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

    (atlas.getGroupNames?.() || []).forEach((groupName) => { groupVisibility[groupName] = false; });

    markerManager = new MarkerManager({ scene, atlas });
    window.Atlas = atlas;
    window.MarkerManager = markerManager;

    markerManager.onMarkerRemoved = (id) => {
    updateMarkerTable();
    updateMarkerInspector();
};

    createGroupControls();
    bindUIEvents();
    bindSceneEvents();
    renderMarkerGroupControls();
    updateMarkerTable();
    updateMarkerInspector();
    setStatus('Готово. Интерфейс панелей обновлён под новый макет.');
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

const panelToggle = document.getElementById('panel-toggle');

if (panelToggle) {
    panelToggle.addEventListener('click', () => {
        const collapsed = document.body.classList.toggle('panel-collapsed');
        panelToggle.textContent = collapsed ? '»' : '«';
    });
}