// MarkerManager.js — управление маркерами
import * as THREE from 'three';

export class MarkerManager {
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
        
        // Для рейкастинга
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
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
            visible: input.visible !== false,
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
        const mesh = this.atlas?.findObject?.(marker.elementId) || 
                    this.atlas?.getNodeById?.(marker.elementId);
        if (!mesh || !marker.localPosition || !marker.sprite) return;

        marker.sprite.position.set(marker.localPosition.x, marker.localPosition.y, marker.localPosition.z);
        mesh.localToWorld(marker.sprite.position);

        if (marker.localNormal) {
            this.tempVec3.set(marker.localNormal.x, marker.localNormal.y, marker.localNormal.z).normalize();
            this.tempVec3b.copy(this.tempVec3).multiplyScalar(0.04);
            marker.sprite.position.add(this.tempVec3b);
        }
    }

    _applyMarkerVisibility(marker) {
        if (marker?.sprite) {
            marker.sprite.visible = marker.visible;
        }
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

        const elementId = this.atlas.getIdByNode?.(mesh) || mesh.name;
        const localPoint = mesh.worldToLocal(intersection.point.clone());

        const worldNormal =
            intersection.face?.normal?.clone()?.transformDirection(mesh.matrixWorld) ||
            new THREE.Vector3(0, 1, 0);

        const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
        const localNormal = worldNormal.clone().applyMatrix3(normalMatrix.clone().invert()).normalize();

        const marker = this._normalizeMarker({
            ...style,
            elementId,
            elementName: mesh.name || '',
            groupName: style.groupName || '',
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
            visible: m.visible,
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
            this._attachSprite(marker);
            this.markers.push(marker);
        }

        this.refreshVisibility();
    }
}