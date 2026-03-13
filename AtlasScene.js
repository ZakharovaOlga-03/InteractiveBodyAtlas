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
        this.objectByName = new Map();
        this.currentModel = null;
        this.modelPart1 = null;
        this.modelPart2 = null;

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

        //index.html пример:
//     const atlas = new AtlasScene('canvas-container', {
//         modelBaseUrl: 'https://raw.githubusercontent.com/ZakharovaOlga-03/InteractiveBodyAtlas/main/models/',
//         csvBaseUrl: 'https://raw.githubusercontent.com/ZakharovaOlga-03/InteractiveBodyAtlas/main/'
//     });

        console.log('AtlasScene initialized with:', {
            modelBaseUrl: this.modelBaseUrl,
            csvBaseUrl: this.csvBaseUrl
        });
    }

    async loadModel1(fileName) {
        // Если fileName уже полный URL, используем как есть
        const url = fileName.startsWith('http')
            ? fileName
            : this.modelBaseUrl + fileName;
        return this.loadModel(url, 1);
    }

    async loadModel2(fileName) {
        const url = fileName.startsWith('http')
            ? fileName
            : this.modelBaseUrl + fileName;
        return this.loadModel(url, 2);
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

        // Окружающий свет (можно раскомментировать если нужен)
        // const ambientLight = new THREE.AmbientLight(0x404060);
        // this.scene.add(ambientLight);
    }

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
                const originalName = c.name;

                // Сохраняем оригинальное имя
                this.objectByName.set(originalName.toLowerCase().trim(), c);

                // Генерируем все возможные варианты имени
                const variations = this.generateNameVariations(originalName);

                variations.forEach(variation => {
                    if (!this.objectByName.has(variation)) {
                        this.objectByName.set(variation, c);
                    }
                });

                if (namedMeshCount < 20) { // Логируем первые 20 для примера
                    console.log(`Индексирован: "${originalName}" -> варианты:`, variations.slice(0, 5));
                }
            }
        });

        console.log(`buildMeshIndex: всего мешей: ${meshCount}, именованных: ${namedMeshCount}`);
        console.log('Примеры индексированных имен:', Array.from(this.objectByName.keys()).slice(0, 20));
    }

    generateNameVariations(name) {
        const variations = new Set();
        const lower = name.toLowerCase().trim();

        // 1. Оригинал в нижнем регистре
        variations.add(lower);

        // 2. Без точек в конце (l, r)
        const withoutDot = lower.replace(/\.(l|r)$/i, '$1');
        variations.add(withoutDot);

        // 3. С точкой (l -> .l, r -> .r)
        const withDot = lower.replace(/([lr])$/i, '.$1');
        variations.add(withDot);

        // 4. Подчеркивания в пробелы и наоборот
        variations.add(lower.replace(/_/g, ' '));
        variations.add(lower.replace(/\s+/g, '_'));

        // 5. Комбинации для боковых вариантов
        if (lower.endsWith('l')) {
            variations.add(lower.slice(0, -1) + '.l');
            variations.add(lower.slice(0, -1) + ' left');
            variations.add(lower.slice(0, -1) + '_left');
        }
        if (lower.endsWith('r')) {
            variations.add(lower.slice(0, -1) + '.r');
            variations.add(lower.slice(0, -1) + ' right');
            variations.add(lower.slice(0, -1) + '_right');
        }

        // 6. Убираем все не-буквенно-цифровые символы
        variations.add(lower.replace(/[^a-z0-9]/g, ''));

        return Array.from(variations);
    }

    findObject(csvName) {
        if (!csvName) return null;

        const searchKey = csvName.toLowerCase().trim();
        console.log(`🔍 Поиск "${csvName}" -> ключ "${searchKey}"`);

        // Прямой поиск
        let obj = this.objectByName.get(searchKey);
        if (obj) {
            console.log(`✅ Найден по точному совпадению: "${searchKey}"`);
            return obj;
        }

        // Поиск по всем ключам (для отладки)
        const possibleMatches = Array.from(this.objectByName.keys())
            .filter(key => key.includes(searchKey) || searchKey.includes(key))
            .slice(0, 5);

        if (possibleMatches.length > 0) {
            console.log(`Возможные совпадения для "${searchKey}":`, possibleMatches);
        } else {
            console.log(`❌ Нет совпадений для "${searchKey}"`);
        }

        return null;
    }

    findObject(csvName) {
        const key = csvName.toLowerCase().trim();
        const obj = this.objectByName.get(key);
        console.log(`findObject("${csvName}") -> key="${key}"`, obj ? 'найден' : 'не найден');
        return obj || null;
    }

    showGroup(groupName) {
        console.log(`showGroup("${groupName}") called`);
        const all = this.csvManager.getAllGroups();
        console.log('Все группы:', all.map(g => ({ rawName: g.rawName, items: g.items })));

        const group = all.find(g => g.rawName === groupName);
        if (!group || !group.items) {
            console.warn(`Группа "${groupName}" не найдена или не имеет элементов`);
            return false;
        }

        console.log(`Найдена группа:`, group);

        group.items.forEach(itemName => {
            console.log(`Ищем элемент "${itemName}" в группе...`);
            const obj = this.findObject(itemName);
            if (obj) {
                console.log(`✅ Нашли объект для "${itemName}"`, obj);
                obj.visible = true;

                // Показываем всех родителей
                let parent = obj.parent;
                while (parent) {
                    console.log(`Показываем родителя:`, parent.type);
                    parent.visible = true;
                    parent = parent.parent;
                }
            } else {
                console.warn(`❌ Объект "${itemName}" не найден в сцене`);
            }
        });

        return true;
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

    async loadModel(name, part = 1) {
        return new Promise((resolve, reject) => {
            this.loader.load(name, gltf => {
                this.cube.visible = false;

                if (!this.currentModel) {
                    this.currentModel = new THREE.Group();
                    this.scene.add(this.currentModel);
                }

                if (part === 1) {
                    if (this.modelPart1) this.currentModel.remove(this.modelPart1);
                    this.modelPart1 = gltf.scene;
                } else {
                    if (this.modelPart2) this.currentModel.remove(this.modelPart2);
                    this.modelPart2 = gltf.scene;
                }

                this.currentModel.add(gltf.scene);

                // Применяем базовый материал ко всем мешам
                this.applyBaseMaterialToAllMeshes();

                this.buildMeshIndex();

                // 🔥 ВАЖНО: скрываем все элементы после загрузки
                this.hideAll();

                // Отложенный фокус, чтобы сцена успела обновиться
                setTimeout(() => this.focusOnModel(), 100);
                resolve();
            }, undefined, reject);
        });
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
        }

        else if (material && typeof material === 'object' && !material.isMaterial) {
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

        // Создаем базовый материал
        const baseMaterial = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            roughness: 0.7,
            metalness: 0.1
        });

        let meshCount = 0;

        // Проходим по ВСЕМ объектам в модели
        this.currentModel.traverse(child => {
            if (child.isMesh) {
                meshCount++;

                // Применяем материал к мешу
                if (Array.isArray(child.material)) {
                    child.material = child.material.map(() => baseMaterial.clone());
                } else {
                    child.material = baseMaterial.clone();
                }
            }
        });

        console.log(`Applied base material to ${meshCount} meshes`);
    }

    // Создание консольного API (совместимость со старым кодом)
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
                }

                // создание материала с определёнными параметрами
                else if (material && typeof material === 'object' && !material.isMaterial) {
                    // If material is a config object but not a THREE.Material
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
                    return this.loadModel1(fileName).then(() => api);
                }
                return api;
            },
            load_model_2: (fileName) => {
                if (fileName) {
                    return this.loadModel2(fileName).then(() => api);
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

        // Обновляем позицию света за камерой
        if (this.lightHolder) {
            this.lightHolder.position.copy(this.camera.position);
            this.lightHolder.quaternion.copy(this.camera.quaternion);
        }

        // Обновляем маркеры, если они есть
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

            // Покажем похожие имена из модели
            const searchLower = csvName.toLowerCase();
            const similar = Array.from(this.objectByName.keys())
                .filter(key => {
                    const k1 = key.replace(/[^a-z0-9]/g, '');
                    const s1 = searchLower.replace(/[^a-z0-9]/g, '');
                    return k1.includes(s1) || s1.includes(k1);
                })
                .slice(0, 10);

            if (similar.length > 0) {
                console.log('Похожие имена в модели:', similar);
            }
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

    // Метод для получения всех мешей (нужен для MarkerManager)
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

// Метод для получения ID по ноде (нужен для MarkerManager)
getIdByNode(node) {
    // Ищем по имени в objectByName
    if (node.name) {
        // Пробуем найти по разным вариантам имени
        const name = node.name.toLowerCase().trim();
        // Возвращаем имя как ID (можно изменить логику)
        return name;
    }
    return node.uuid || '';
}

// Метод для поиска объекта по ID (совместимость)
getNodeById(id) {
    return this.findObject(id);
}

// Инициализация менеджера маркеров
initMarkerManager() {
    if (!this.markerManager) {
        this.markerManager = new MarkerManager({
            scene: this.scene,
            atlas: this,
            camera: this.camera
        });
    }
    return this.markerManager;
}
}