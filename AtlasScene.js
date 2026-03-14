// AtlasScene.js — управление 3D сценой
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSVGroupsManager } from './csv-groups.js';
import { MarkerManager } from './MarkerManager.js';

/** Базовый URL репозитория на CDN — используется по умолчанию, чтобы приложение работало из одного index.html (file://, localhost или CDN). */
const DEFAULT_CDN_BASE = 'https://cdn.jsdelivr.net/gh/ZakharovaOlga-03/InteractiveBodyAtlas@restructure/';

export class AtlasScene {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Container #${containerId} not found`);
        }

        // Инициализация Three.js
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x888888);

        this.camera = new THREE.PerspectiveCamera(
            60,
            this.container.clientWidth / this.container.clientHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 0, 3);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        // Загрузчик моделей
        this.loader = new GLTFLoader();

        // Базовые URL: если не заданы — используем CDN, чтобы работало из одного index.html (file://, localhost, CDN)
        this.modelBaseUrl = options.modelBaseUrl ?? (DEFAULT_CDN_BASE + 'models/');
        this.csvBaseUrl = options.csvBaseUrl ?? DEFAULT_CDN_BASE;
        if (this.modelBaseUrl && !this.modelBaseUrl.endsWith('/')) this.modelBaseUrl += '/';
        // path не задаём: в loadModel всегда передаём полный URL, чтобы не дублировать базовый путь в FileLoader

        // Хранилище объектов
        this.objectByName = new Map(); // КЛЮЧ: точное имя из модели
        this.currentModel = null;
        this.modelParts = [];

        // Менеджер CSV
        this.csvManager = new CSVGroupsManager();

        // Свет
        this.setupLights();

        // Вспомогательный куб (для теста)
        this.cube = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshStandardMaterial({ color: 0x4488ff })
        );
        this.scene.add(this.cube);

        // Запуск анимации
        this.animate = this.animate.bind(this);
        this.animate();

        // Обработка ресайза
        window.addEventListener('resize', () => this.onResize());

        console.log('AtlasScene initialized with:', {
            modelBaseUrl: this.modelBaseUrl,
            csvBaseUrl: this.csvBaseUrl
        });
    }

    // 🔥 Единая функция загрузки модели
    async loadModel(fileName, partIndex = null) {
        const url = fileName.startsWith('http')
            ? fileName
            : (this.modelBaseUrl + fileName);

        return new Promise((resolve, reject) => {
            this.loader.load(url, gltf => {
                this.cube.visible = false;

                if (!this.currentModel) {
                    this.currentModel = new THREE.Group();
                    this.scene.add(this.currentModel);
                }

                const modelScene = gltf.scene;
                
                // Если указан индекс, заменяем конкретную часть
                if (partIndex !== null) {
                    if (this.modelParts[partIndex]) {
                        this.currentModel.remove(this.modelParts[partIndex]);
                    }
                    this.modelParts[partIndex] = modelScene;
                } else {
                    // Если индекс не указан, добавляем в конец
                    this.modelParts.push(modelScene);
                }

                this.currentModel.add(modelScene);

                // Применяем базовый материал ко всем мешам
                this.applyBaseMaterialToAllMeshes();

                // 🔥 Строим индекс с ТОЧНЫМИ именами
                this.buildMeshIndex();

                // Скрываем все элементы после загрузки
                this.hideAll();

                // Отложенный фокус, чтобы сцена успела обновиться
                setTimeout(() => this.focusOnModel(), 100);
                
                console.log(`✅ Model loaded: ${fileName} (part ${partIndex !== null ? partIndex : this.modelParts.length - 1})`);
                resolve();
            }, 
            (progress) => {
                const percent = (progress.loaded / progress.total * 100).toFixed(1);
                console.log(`Loading ${fileName}: ${percent}%`);
            },
            (error) => {
                console.error(`Error loading model ${fileName}:`, error);
                reject(error);
            });
        });
    }

    async loadCsv(fileName) {
        const url = fileName.startsWith('http')
            ? fileName
            : this.csvBaseUrl + fileName;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`CSV file not found: ${fileName}`);
        const text = await response.text();
        this.csvManager.loadFromText(text, fileName);
    }

    setupLights() {
        // Контейнер для света, следующего за камерой
        this.lightHolder = new THREE.Object3D();
        this.scene.add(this.lightHolder);

        const cameraLight = new THREE.PointLight(0xffffff, 1.5);
        cameraLight.position.set(0, 0, 0);
        this.lightHolder.add(cameraLight);

        // Окружающий свет
        const ambientLight = new THREE.AmbientLight(0x404060);
        this.scene.add(ambientLight);
    }

    // 🔥 Индексируем ВСЕ именованные узлы (Mesh, Group, Bone и т.д.),
    // чтобы объекты из CSV находились и когда имя на родителе, и когда на меше.
    buildMeshIndex() {
        this.objectByName.clear();
        if (!this.currentModel) {
            console.warn('buildMeshIndex: currentModel is null');
            return;
        }

        let meshCount = 0;
        let namedCount = 0;

        this.currentModel.traverse(c => {
            if (c.isMesh) meshCount++;

            const name = (c.name && typeof c.name === 'string') ? c.name.trim() : '';
            if (name) {
                namedCount++;
                this.objectByName.set(name, c);
                if (namedCount <= 10) {
                    console.log(`Индексирован: "${name}" (${c.type})`);
                }
            }
        });

        console.log(`buildMeshIndex: всего мешей: ${meshCount}, именованных узлов: ${namedCount}`);
        console.log('Первые 10 индексированных имен:', Array.from(this.objectByName.keys()).slice(0, 10));
    }

    // 🔥 Поиск: сначала точное совпадение, затем без учёта регистра
    // (в модели может быть Femur_L, в CSV — Femur_l)
    findObject(csvName) {
        if (!csvName || typeof csvName !== 'string') return null;
        const key = csvName.trim();
        if (!key) return null;

        let obj = this.objectByName.get(key);
        if (obj) return obj;

        const keyLower = key.toLowerCase();
        for (const [name, node] of this.objectByName) {
            if (name.toLowerCase() === keyLower) return node;
        }
        return null;
    }

    showGroup(groupName) {
        const all = this.csvManager.getAllGroups();
        const group = all.find(g => g.rawName === groupName);
        if (!group || !group.items) {
            console.warn(`Группа "${groupName}" не найдена или не имеет элементов`);
            return false;
        }

        console.log(`Показываем группу "${groupName}" (${group.items.length} элементов)`);
        
        let foundCount = 0;
        
        group.items.forEach(itemName => {
            const obj = this.findObject(itemName);
            if (obj) {
                foundCount++;
                this.setVisibleWithAncestorsAndDescendants(obj, true);
            }
        });
        
        console.log(`Группа "${groupName}": найдено ${foundCount}/${group.items.length} объектов`);
        return true;
    }

    showItem(itemName){
        const obj = this.findObject(itemName);
        if (obj) {
            this.setVisibleWithAncestorsAndDescendants(obj, true);
            return true;
        }
        return false;
    }

    // Показ/скрытие узла, всех его предков и всего поддерева (иначе после hideAll потомки остаются скрытыми)
    setVisibleWithAncestorsAndDescendants(obj, visible) {
        if (!obj) return;
        obj.traverse(c => { c.visible = visible; });
        let parent = obj.parent;
        while (parent) {
            parent.visible = visible;
            parent = parent.parent;
        }
    }

    hideAll() {
        if (this.currentModel) {
            this.currentModel.traverse(c => c.visible = false);
        }
    }

    showAll() {
        if (this.currentModel) {
            this.currentModel.traverse(c => c.visible = true);
        }
    }

    focusOnModel() {
        if (!this.currentModel) return;

        const box = new THREE.Box3().setFromObject(this.currentModel);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        this.camera.position.set(center.x, center.y, center.z + maxDim * 1.2);
        this.camera.lookAt(center.x, center.y, center.z);
        this.camera.far = maxDim * 10;
        this.camera.updateProjectionMatrix();
    }

    hideGroup(groupName) {
        const all = this.csvManager.getAllGroups();
        const group = all.find(g => g.rawName === groupName);
        if (!group || !group.items) return false;

        group.items.forEach(itemName => {
            const obj = this.findObject(itemName);
            if (obj) obj.visible = false;
        });
        return true;
    }

    hideElement(elementName) {
        const obj = this.findObject(elementName);
        if (obj) {
            obj.visible = false;
            return true;
        }
        return false;
    }

    applyMaterialToGroup(groupName, material, options = {}) {
        if (typeof material === 'string' || typeof material === 'number') {
            const color = typeof material === 'string' ?
                (material.startsWith('#') ? material : `#${material}`) :
                material;

            material = new THREE.MeshStandardMaterial({
                color: color,
                metalness: options.metalness || 0,
                roughness: options.roughness || 0.5
            });
        } else if (material && typeof material === 'object' && !material.isMaterial) {
            material = new THREE.MeshStandardMaterial({
                color: material.color || 0xffffff,
                metalness: material.metalness || 0,
                roughness: material.roughness || 0.5
            });
        }

        const all = this.csvManager.getAllGroups();
        const group = all.find(g => g.rawName === groupName);
        if (!group || !group.items) return false;

        group.items.forEach(itemName => {
            const obj = this.findObject(itemName);
            if (obj) {
                obj.traverse(child => {
                    if (child.isMesh) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach((_, i) => child.material[i] = material);
                        } else {
                            child.material = material;
                        }
                    }
                });
            }
        });
        return true;
    }

    applyBaseMaterialToAllMeshes() {
        if (!this.currentModel) return;

        const baseMaterial = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            roughness: 0.7,
            metalness: 0.1
        });

        let meshCount = 0;

        this.currentModel.traverse(child => {
            if (child.isMesh) {
                meshCount++;
                if (Array.isArray(child.material)) {
                    child.material = child.material.map(() => baseMaterial.clone());
                } else {
                    child.material = baseMaterial.clone();
                }
            }
        });

        console.log(`Applied base material to ${meshCount} meshes`);
    }

    // Создание консольного API
    createConsoleAPI() {
        const api = {
            show_group: (groupName) => {
                this.showGroup(groupName);
                return api;
            },
            hide_group: (groupName) => {
                this.hideGroup(groupName);
                return api;
            },
            hide_element: (elementName) => {
                this.hideElement(elementName);
                return api;
            },
            show_item: (itemName) => {
                this.showItem(itemName);
                return api;
            },
            change_mat: (target, material, options = {}) => {
                if (typeof material === 'string' || typeof material === 'number') {
                    const color = typeof material === 'string' ?
                        (material.startsWith('#') ? material : `#${material}`) :
                        material;

                    material = new THREE.MeshStandardMaterial({
                        color: color,
                        metalness: options.metalness || 0,
                        roughness: options.roughness || 0.5
                    });
                } else if (material && typeof material === 'object' && !material.isMaterial) {
                    material = new THREE.MeshStandardMaterial({
                        color: material.color || 0xffffff,
                        metalness: material.metalness || 0,
                        roughness: material.roughness || 0.5
                    });
                }

                const all = this.csvManager.getAllGroups();
                const group = all.find(g => g.rawName === target);

                if (group) {
                    this.applyMaterialToGroup(target, material);
                } else {
                    const obj = this.findObject(target);
                    if (obj) {
                        obj.traverse(child => {
                            if (child.isMesh) {
                                if (Array.isArray(child.material)) {
                                    child.material.forEach((_, i) => child.material[i] = material);
                                } else {
                                    child.material = material;
                                }
                            }
                        });
                    }
                }
                return api;
            },
            load_csv: (fileName) => {
                if (fileName) {
                    return this.loadCsv(fileName).then(() => api);
                }
                return api;
            },
            load_model: (fileName) => {
                if (fileName) {
                    return this.loadModel(fileName).then(() => api);
                }
                return api;
            },
            save_csv: (fileName) => {
                this.csvManager.saveToFile(fileName);
                return api;
            },
            get_groups: () => ({
                base: this.csvManager.getBaseGroups(),
                subgroups: this.csvManager.getSubgroups()
            }),
            get_base_groups: () => this.csvManager.getBaseGroups(),
            get_subgroups: () => this.csvManager.getSubgroups(),
            get_items: () => this.csvManager.getAllItems(),
            csv_string: () => this.csvManager.saveToCSVString(),
            add_subgroup: (name, items) => {
                this.csvManager.addSubgroup(name, items);
                return api;
            },
            edit_subgroup: (groupName, newName) => {
                const group = this.csvManager.getSubgroups().find(g => g.rawName === groupName);
                if (group) this.csvManager.editSubgroup(group, newName);
                return api;
            },
            delete_subgroup: (groupName) => {
                const group = this.csvManager.getSubgroups().find(g => g.rawName === groupName);
                if (group) this.csvManager.deleteSubgroup(group);
                return api;
            },
            add_item_to_subgroup: (groupName, itemName) => {
                const group = this.csvManager.getSubgroups().find(g => g.rawName === groupName);
                if (group) this.csvManager.addItemToSubgroup(group, itemName);
                return api;
            },
            remove_item_from_subgroup: (groupName, itemName) => {
                const group = this.csvManager.getSubgroups().find(g => g.rawName === groupName);
                if (group) this.csvManager.removeItemFromSubgroup(group, itemName);
                return api;
            },
            apply_material_to_group: (groupName, material) => {
                this.applyMaterialToGroup(groupName, material);
                return api;
            }
        };
        return api;
    }

    animate() {
        requestAnimationFrame(this.animate);

        if (this.lightHolder) {
            this.lightHolder.position.copy(this.camera.position);
            this.lightHolder.quaternion.copy(this.camera.quaternion);
        }

        if (this.markerManager) {
            this.markerManager.update();
        }

        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    testFindElement(csvName) {
        console.log(`\n=== ТЕСТ ПОИСКА: "${csvName}" ===`);
        const obj = this.findObject(csvName);
        if (obj) {
            console.log(`✅ НАЙДЕН! Объект:`, obj);
            console.log(`Родители:`, this.getParentChain(obj));
        } else {
            console.log(`❌ НЕ НАЙДЕН`);
        }
        return obj;
    }

    getParentChain(obj) {
        const chain = [];
        let current = obj;
        while (current) {
            chain.push(current.type + (current.name ? `: "${current.name}"` : ''));
            current = current.parent;
        }
        return chain;
    }

    getMeshes() {
        const meshes = [];
        if (this.currentModel) {
            this.currentModel.traverse(child => {
                if (child.isMesh) {
                    meshes.push(child);
                }
            });
        }
        return meshes;
    }

    getIdByNode(node) {
        return node.name || node.uuid || '';
    }

    getNodeById(id) {
        return this.findObject(id);
    }

    initMarkerManager() {
        if (!this.markerManager) {
            this.markerManager = new MarkerManager({
                scene: this.scene,
                atlas: this
            });
        }
        return this.markerManager;
    }

    resetAllMaterials() {
        if (!this.currentModel) return;
        this.applyBaseMaterialToAllMeshes();
        console.log('All materials reset to base');
    }
}