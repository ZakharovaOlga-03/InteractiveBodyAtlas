// AtlasScene.js — управление 3D сценой
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSVGroupsManager } from './csv-groups.js';

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
    if (!this.currentModel) return;
    
    this.currentModel.traverse(c => {
      if (c.name) {
        // Сохраняем несколько вариантов имени для гибкого поиска
        const name = c.name.toLowerCase().trim();
        this.objectByName.set(name, c);
        
        const noExt = name.replace(/\.([a-z0-9]+)$/, '$1');
        if (noExt !== name) this.objectByName.set(noExt, c);
        
        const withUnderscores = name.replace(/\s+/g, '_');
        if (withUnderscores !== name) this.objectByName.set(withUnderscores, c);
        
        const withSpaces = name.replace(/_/g, ' ');
        if (withSpaces !== name) this.objectByName.set(withSpaces, c);
      }
    });
  }

  findObject(csvName) {
    const key = csvName.toLowerCase().trim();
    return this.objectByName.get(key) || null;
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
        this.buildMeshIndex();
        
        // Отложенный фокус, чтобы сцена успела обновиться
        setTimeout(() => this.focusOnModel(), 100);
        resolve();
      }, undefined, reject);
    });
  }

//   loadModel1(name) {
//     return this.loadModel(name, 1);
//   }

//   loadModel2(name) {
//     return this.loadModel(name, 2);
//   }

//   async loadCsv(name) {
//     const response = await fetch(name);
//     if (!response.ok) throw new Error(`CSV file not found: ${name}`);
//     const text = await response.text();
//     this.csvManager.loadFromText(text, name);
//   }

  // Методы для управления видимостью через CSV группы
  showGroup(groupName) {
    const all = this.csvManager.getAllGroups();
    const group = all.find(g => g.rawName === groupName);
    if (!group || !group.items) return false;
    
    group.items.forEach(itemName => {
      const obj = this.findObject(itemName);
      if (obj) {
        obj.visible = true;
        // Показываем всех родителей
        let parent = obj.parent;
        while (parent) {
          parent.visible = true;
          parent = parent.parent;
        }
      }
    });
    return true;
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

  applyMaterialToGroup(groupName, material) {
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
      change_mat: (target, material) => {
        // Пытаемся найти группу
        const all = this.csvManager.getAllGroups();
        const group = all.find(g => g.rawName === target);
        if (group) {
          this.applyMaterialToGroup(target, material);
        } else {
          // Ищем отдельный элемент
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
}