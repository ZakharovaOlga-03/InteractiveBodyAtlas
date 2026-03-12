import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

function normalizeName(name) {
  return (name || '').trim();
}

function makeNodePath(node) {
  const parts = [];
  let current = node;
  while (current) {
    const n = normalizeName(current.name);
    if (n) parts.push(n);
    current = current.parent;
  }
  return parts.reverse().join('/');
}

function makeUniqueIds(nodes) {
  const nameCounts = new Map();
  for (const node of nodes) {
    const name = normalizeName(node.name);
    if (!name) continue;
    nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
  }

  const used = new Set();
  const idByNode = new Map();
  for (const node of nodes) {
    const rawName = normalizeName(node.name);
    const base = rawName && (nameCounts.get(rawName) || 0) === 1 ? rawName : makeNodePath(node) || node.uuid;

    let id = base;
    let i = 2;
    while (used.has(id)) {
      id = `${base}#${i}`;
      i += 1;
    }
    used.add(id);
    idByNode.set(node, id);
  }
  return idByNode;
}

function cloneMaterial(material) {
  return material?.clone ? material.clone() : material;
}

export class AtlasSceneLibrary {
  constructor({ scene, groupRules = {} } = {}) {
    if (!scene) throw new Error('AtlasSceneLibrary requires a three.js scene');
    this.scene = scene;
    this.groupRules = groupRules;

    this.root = null;
    this.gltf = null;

    this._nodes = [];
    this._nodeId = new Map();
    this._nodeById = new Map();
    this._idsByName = new Map();
    this._originalMaterials = new Map();

    this._ruleGroupToIds = new Map();
    this._ruleIdToGroups = new Map();
    this._manualGroupToIds = new Map();
    this._manualIdToGroups = new Map();
  }

  async load(url, { onProgress } = {}) {
    const loader = new GLTFLoader();
    const gltf = await new Promise((resolve, reject) => {
      loader.load(url, resolve, onProgress, reject);
    });

    this.gltf = gltf;
    this.root = gltf.scene;
    this.scene.add(this.root);

    this._nodes = [];
    this.root.traverse((node) => {
      if (node?.isMesh) this._nodes.push(node);
    });

    this._nodeId = makeUniqueIds(this._nodes);
    this._nodeById = new Map();
    this._idsByName = new Map();
    this._originalMaterials = new Map();

    for (const node of this._nodes) {
      const id = this._nodeId.get(node);
      this._nodeById.set(id, node);
      this._originalMaterials.set(id, cloneMaterial(node.material));

      const name = normalizeName(node.name);
      if (name) {
        const ids = this._idsByName.get(name) || [];
        ids.push(id);
        this._idsByName.set(name, ids);
      }
    }

    this._manualGroupToIds = new Map();
    this._manualIdToGroups = new Map();
    this._rebuildGroups();
    this.hideAll();

    return this;
  }

  _rebuildGroups() {
    this._ruleGroupToIds = new Map();
    this._ruleIdToGroups = new Map();

    const rules = this.groupRules || {};
    for (const groupName of Object.keys(rules)) {
      this._ruleGroupToIds.set(groupName, new Set());
    }

    for (const node of this._nodes) {
      const id = this._nodeId.get(node);
      if (!id) continue;

      for (const [groupName, rule] of Object.entries(rules)) {
        let inGroup = false;
        if (typeof rule === 'function') {
          inGroup = Boolean(rule(node));
        } else if (rule && Array.isArray(rule.keywords)) {
          const n = normalizeName(node.name).toLowerCase();
          inGroup = rule.keywords.some((k) => n.includes(String(k).toLowerCase()));
        } else if (Array.isArray(rule)) {
          const n = normalizeName(node.name).toLowerCase();
          inGroup = rule.some((k) => n.includes(String(k).toLowerCase()));
        }

        if (inGroup) {
          this._ruleGroupToIds.get(groupName)?.add(id);
          const groups = this._ruleIdToGroups.get(id) || new Set();
          groups.add(groupName);
          this._ruleIdToGroups.set(id, groups);
        }
      }
    }
  }

  getMeshes() {
    return this._nodes.slice();
  }

  getNodeById(id) {
    return this._nodeById.get(normalizeName(id)) || null;
  }

  getIdByNode(node) {
    return this._nodeId.get(node) || '';
  }

  getGroupNames() {
    const names = new Set([...this._ruleGroupToIds.keys(), ...this._manualGroupToIds.keys()]);
    return Array.from(names).sort();
  }

  getElementIds() {
    return Array.from(this._nodeById.keys()).sort();
  }

  getElementIdsByName(name) {
    return (this._idsByName.get(normalizeName(name)) || []).slice();
  }

  getManifest() {
    const elements = this.getElementIds().map((id) => {
      const node = this._nodeById.get(id);
      const groups = new Set();
      for (const g of this._ruleIdToGroups.get(id) || []) groups.add(g);
      for (const g of this._manualIdToGroups.get(id) || []) groups.add(g);
      return {
        id,
        name: normalizeName(node?.name),
        groups: Array.from(groups).sort()
      };
    });
    return {
      groups: this.getGroupNames(),
      elements
    };
  }

  hideAll() {
    for (const node of this._nodes) node.visible = false;
  }

  showAll() {
    for (const node of this._nodes) node.visible = true;
  }

  showElement(idOrName) {
    const ids = this._resolveToIds(idOrName);
    for (const id of ids) {
      const node = this._nodeById.get(id);
      if (node) node.visible = true;
    }
    return ids;
  }

  hideElement(idOrName) {
    const ids = this._resolveToIds(idOrName);
    for (const id of ids) {
      const node = this._nodeById.get(id);
      if (node) node.visible = false;
    }
    return ids;
  }

  showGroup(groupName) {
    const a = this._ruleGroupToIds.get(groupName);
    const b = this._manualGroupToIds.get(groupName);
    if (!a && !b) return [];
    const out = new Set();
    if (a) {
      for (const id of a) {
        const node = this._nodeById.get(id);
        if (node) node.visible = true;
        out.add(id);
      }
    }
    if (b) {
      for (const id of b) {
        const node = this._nodeById.get(id);
        if (node) node.visible = true;
        out.add(id);
      }
    }
    return Array.from(out);
  }

  hideGroup(groupName) {
    const a = this._ruleGroupToIds.get(groupName);
    const b = this._manualGroupToIds.get(groupName);
    if (!a && !b) return [];
    const out = new Set();
    if (a) {
      for (const id of a) {
        const node = this._nodeById.get(id);
        if (node) node.visible = false;
        out.add(id);
      }
    }
    if (b) {
      for (const id of b) {
        const node = this._nodeById.get(id);
        if (node) node.visible = false;
        out.add(id);
      }
    }
    return Array.from(out);
  }

  getGroupMembers(groupName) {
    const a = this._ruleGroupToIds.get(groupName);
    const b = this._manualGroupToIds.get(groupName);
    const out = new Set();
    if (a) for (const id of a) out.add(id);
    if (b) for (const id of b) out.add(id);
    return Array.from(out);
  }

  createGroup(groupName) {
    const name = normalizeName(groupName);
    if (!name) return false;
    if (!this._manualGroupToIds.has(name)) this._manualGroupToIds.set(name, new Set());
    return true;
  }

  deleteGroup(groupName) {
    const name = normalizeName(groupName);
    if (!name) return false;
    const ids = this._manualGroupToIds.get(name);
    if (ids) {
      for (const id of ids) {
        const groups = this._manualIdToGroups.get(id);
        if (groups) {
          groups.delete(name);
          if (!groups.size) this._manualIdToGroups.delete(id);
          else this._manualIdToGroups.set(id, groups);
        }
      }
    }
    this._manualGroupToIds.delete(name);
    return true;
  }

  addToGroup(groupName, elementIdOrName) {
    const name = normalizeName(groupName);
    if (!name) return [];
    if (!this._manualGroupToIds.has(name)) this._manualGroupToIds.set(name, new Set());
    const set = this._manualGroupToIds.get(name);

    const added = [];
    for (const id of this._resolveToIds(elementIdOrName)) {
      if (!set.has(id)) {
        set.add(id);
        added.push(id);
      }
      const groups = this._manualIdToGroups.get(id) || new Set();
      groups.add(name);
      this._manualIdToGroups.set(id, groups);
    }
    return added;
  }

  removeFromGroup(groupName, elementIdOrName) {
    const name = normalizeName(groupName);
    if (!name) return [];
    const set = this._manualGroupToIds.get(name);
    if (!set) return [];

    const removed = [];
    for (const id of this._resolveToIds(elementIdOrName)) {
      if (set.has(id)) {
        set.delete(id);
        removed.push(id);
      }
      const groups = this._manualIdToGroups.get(id);
      if (groups) {
        groups.delete(name);
        if (!groups.size) this._manualIdToGroups.delete(id);
        else this._manualIdToGroups.set(id, groups);
      }
    }
    return removed;
  }

  applyMaterial(target, params = {}) {
    const ids = typeof target === 'object' && target?.group ? this.getGroupMembers(target.group) : this._resolveToIds(target);
    const out = [];
    for (const id of ids) {
      const node = this._nodeById.get(id);
      if (!node) continue;
      const material = new THREE.MeshStandardMaterial({
        color: params.color || '#ffffff',
        roughness: params.roughness ?? 0.6,
        metalness: params.metalness ?? 0.05,
        transparent: Boolean(params.transparent),
        opacity: params.opacity ?? 1,
        emissive: params.emissive || 0x000000,
        emissiveIntensity: params.emissiveIntensity ?? 0,
        depthWrite: params.depthWrite ?? true,
        side: THREE.DoubleSide
      });
      node.material = material;
      out.push(id);
    }
    return out;
  }

  resetMaterial(target) {
    const ids = typeof target === 'object' && target?.group ? this.getGroupMembers(target.group) : this._resolveToIds(target);
    const out = [];
    for (const id of ids) {
      const node = this._nodeById.get(id);
      const material = this._originalMaterials.get(id);
      if (!node || !material) continue;
      node.material = cloneMaterial(material);
      out.push(id);
    }
    return out;
  }

  resetAllMaterials() {
    for (const id of this.getElementIds()) this.resetMaterial(id);
  }

  _resolveToIds(idOrName) {
    const key = normalizeName(idOrName);
    if (!key) return [];
    if (this._nodeById.has(key)) return [key];
    const byName = this._idsByName.get(key);
    if (byName && byName.length) return byName.slice();
    return [];
  }
}
