// AtlasScene.js — управление 3D сценой
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSVGroupsManager } from './csv-groups.js';
import { MarkerManager } from './MarkerManager.js';

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

        this.modelBaseUrl = options.modelBaseUrl || '';
        this.csvBaseUrl = options.csvBaseUrl || '';

        console.log('AtlasScene initialized with:', {
            modelBaseUrl: this.modelBaseUrl,
            csvBaseUrl: this.csvBaseUrl
        });
    }

    // 🔥 Единая функция загрузки модели
    async loadModel(fileName, partIndex = null) {
        const url = fileName.startsWith('http')
            ? fileName
            : this.modelBaseUrl + fileName;
        
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

    // Для обратной совместимости
    async loadModel1(fileName) {
        return this.loadModel(fileName, 0);
    }

    async loadModel2(fileName) {
        return this.loadModel(fileName, 1);
    }

    async loadModel3(fileName) {
        return this.loadModel(fileName, 2);
    }

    async loadModel4(fileName) {
        return this.loadModel(fileName, 3);
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

    // 🔥 Упрощенный метод построения индекса
    buildMeshIndex() {
        this.objectByName.clear();
        if (!this.currentModel) {
            console.warn('buildMeshIndex: currentModel is null');
            return;
        }

        let meshCount = 0;
        let namedMeshCount = 0;

        this.currentModel.traverse(c => {
            if (c.isMesh) meshCount++;

            if (c.name) {
                namedMeshCount++;
                // 🔥 Сохраняем ТОЧНОЕ имя как есть (без изменений)
                // Это ключевой момент - мы верим, что имена в CSV совпадают с именами в модели
                this.objectByName.set(c.name, c);
                
                if (namedMeshCount <= 10) {
                    console.log(`Индексирован: "${c.name}"`);
                }
            }
        });

        console.log(`buildMeshIndex: всего мешей: ${meshCount}, именованных: ${namedMeshCount}`);
        console.log('Первые 10 индексированных имен:', Array.from(this.objectByName.keys()).slice(0, 10));
    }

    // 🔥 Упрощенный поиск - только точное совпадение
    findObject(csvName) {
        if (!csvName) return null;

        // Прямой поиск по точному имени (без изменений)
        const obj = this.objectByName.get(csvName);
        
        if (obj) {
            console.log(`✅ Найден объект: "${csvName}"`);
        } else {
            console.log(`❌ Не найден: "${csvName}"`);
        }
        
        return obj || null;
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
                obj.visible = true;

                // Показываем всех родителей
                let parent = obj.parent;
                while (parent) {
                    parent.visible = true;
                    parent = parent.parent;
                }
            }
        });
        
        console.log(`Группа "${groupName}": найдено ${foundCount}/${group.items.length} объектов`);
        return true;
    }

    showItem(itemName){
        const obj = this.findObject(itemName);
        if (obj) {
            obj.visible = true;

            // Показываем всех родителей
            let parent = obj.parent;
            while (parent) {
                parent.visible = true;
                parent = parent.parent;
            }
            return true;
        }
        return false;
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