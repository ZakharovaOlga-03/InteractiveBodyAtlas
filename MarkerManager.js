// MarkerManager.js — управление маркерами
import * as THREE from 'three';

export class MarkerManager {
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
        
        // Вспомогательные векторы для вычислений
        this.tempVec3 = new THREE.Vector3();
        this.tempVec3b = new THREE.Vector3();
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
        const safe = this._sanitizeGroupName(groupName);
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
        const oldSafe = this._sanitizeGroupName(oldName);
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
        const safe = this._sanitizeGroupName(groupName);
        const ids = this.markers.filter((m) => m.markerGroup === safe).map((m) => m.id);
        ids.forEach((id) => this.removeMarker(id));
        delete this.markerGroupVisibility[safe];
        if (!Object.keys(this.markerGroupVisibility).length) this.markerGroupVisibility.group_1 = true;
        return true;
    }

    _sanitizeGroupName(name) {
        const cleaned = String(name || '').trim().replace(/\s+/g, '_');
        return cleaned || 'group_1';
    }

    _sanitizeMarkerName(name, fallback = 'marker') {
        const cleaned = String(name || '').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-а-яА-Я]/g, '');
        return cleaned || fallback;
    }

    _vectorToObject(v) {
        return { x: Number(v.x), y: Number(v.y), z: Number(v.z) };
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
            markerGroup: this._sanitizeGroupName(input.markerGroup || input.marker_group || this.defaultStyle.markerGroup),
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
        if (!marker.name) marker.name = this._sanitizeMarkerName(marker.label || marker.id, `marker${this.nextId}`);
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
    const mesh = this.atlas?.findObject?.(marker.elementId) || 
                this.atlas?.getNodeById?.(marker.elementId);
    
    if (!mesh || !mesh.visible || !marker.localPosition || !marker.sprite) return;

    // Устанавливаем позицию спрайта в локальных координатах
    marker.sprite.position.set(marker.localPosition.x, marker.localPosition.y, marker.localPosition.z);
    
    // Преобразуем в мировые координаты
    mesh.localToWorld(marker.sprite.position);

    // 🔥 ВАЖНО: Больше НЕ смещаем вдоль нормали!
    // Вместо этого центр спрайта будет точно на поверхности
    
    // Опционально: можно сохранить нормаль для других целей
    if (marker.localNormal) {
        // Не используем для смещения, только сохраняем
        marker.worldNormal = marker.localNormal ? 
            this._vectorToObject(new THREE.Vector3(
                marker.localNormal.x, 
                marker.localNormal.y, 
                marker.localNormal.z
            ).transformDirection(mesh.matrixWorld)) : null;
    }
}

// Добавим метод для создания спрайта с правильным якорем
_createSprite(style = {}) {
    // Создаем геометрию с центром в (0,0,0)
    const mesh = new THREE.Mesh(this._getGeometry(style.displayShape), this._makeMaterial(style));
    const size = Number(style.scale ?? this.defaultStyle.scale) || this.defaultStyle.scale;
    
    // Масштабируем от центра
    mesh.scale.setScalar(size);
    
    mesh.renderOrder = 999;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    
    // Убеждаемся, что bounding box обновлен
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
    
    return mesh;
}

// Обновим метод прикрепления спрайта
_attachSprite(marker) {
    marker.sprite = this._createSprite(marker);
    marker.sprite.userData.markerId = marker.id;

    if (marker.elementId && marker.localPosition) {
        // Позиция будет установлена в _updateMarkerWorldPosition
        this.group.add(marker.sprite);
        this._updateMarkerWorldPosition(marker); // сразу обновляем позицию
    } else if (marker.worldPosition) {
        marker.sprite.position.set(marker.worldPosition.x, marker.worldPosition.y, marker.worldPosition.z);
        this.group.add(marker.sprite);
    }

    this._applyMarkerVisibility(marker);
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

    const elementId = this.atlas?.getIdByNode?.(mesh) || mesh.name;
    const localPoint = mesh.worldToLocal(intersection.point.clone());
    
    // Сохраняем нормаль, но НЕ используем для смещения
    const worldNormal = intersection.face?.normal?.clone()?.transformDirection(mesh.matrixWorld) || new THREE.Vector3(0, 1, 0);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const localNormal = worldNormal.clone().applyMatrix3(normalMatrix.clone().invert()).normalize();

    const marker = this._normalizeMarker({
        ...style,
        elementId,
        elementName: mesh.name || '',
        groupName: style.groupName || '',
        markerGroup: style.markerGroup || 'group_1',
        localPosition: this._vectorToObject(localPoint),
        localNormal: this._vectorToObject(localNormal),
        worldPosition: this._vectorToObject(intersection.point),
        rotation: style.rotation || this._vectorToObject(worldNormal)
    });

    this._attachSprite(marker);
    this.markers.push(marker);
    return marker;
}

    addMarkerAtWorldPosition(worldPosition, style = {}) {
        const marker = this._normalizeMarker({
            ...style,
            markerGroup: style.markerGroup || 'group_1',
            worldPosition: { ...worldPosition },
            position: { ...worldPosition }
        });
        this._attachSprite(marker);
        this.markers.push(marker);
        return marker;
    }

    addMarkerFromCoordinates(coords, style = {}) {
        const vec = this._parseVec3Input(coords);
        if (!vec) return null;
        return this.addMarkerAtWorldPosition(vec, style);
    }

    _parseVec3Input(value) {
        const nums = String(value || '').split(/[;,\s]+/).map((v) => Number(v)).filter((v) => Number.isFinite(v));
        if (nums.length !== 3) return null;
        return { x: nums[0], y: nums[1], z: nums[2] };
    }

    removeMarker(id) {
        const idx = this.markers.findIndex((m) => m.id === id);
        if (idx < 0) return false;
        
        const [marker] = this.markers.splice(idx, 1);
        if (marker?.sprite) {
            this.group.remove(marker.sprite);
            marker.sprite.material?.dispose?.();
        }
        return true;
    }

    clear() {
        const ids = this.markers.map((m) => m.id);
        ids.forEach((id) => this.removeMarker(id));
    }

    updateMarkerProperties(id, properties) {
        const marker = this.markers.find((m) => m.id === id);
        if (!marker) return false;

        Object.assign(marker, properties);
        if (properties.markerGroup) marker.markerGroup = this.ensureMarkerGroup(properties.markerGroup);
        if (properties.name) marker.name = this._sanitizeMarkerName(properties.name, marker.name);

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
        let key = this._sanitizeMarkerName(baseName, `marker${Object.keys(targetObj).length + 1}`);
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
                marker.elementId, marker.elementName, 
                marker.worldPosition?.x ?? '', marker.worldPosition?.y ?? '', marker.worldPosition?.z ?? '',
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

                this._attachSprite(marker);
                this.markers.push(marker);
            });
        });

        this.refreshVisibility();
    }
}