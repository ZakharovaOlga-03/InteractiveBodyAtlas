/**
 * atlas-library.js — библиотека-обёртка для объединения функций работы с 3D-моделью
 * и CSV-группами в единый API.
 *
 * Назначение:
 * - Не изменяет существующие файлы проекта.
 * - Использует уже готовый window.Atlas, создаваемый в main.js.
 * - Использует CSVGroupsManager из csv-groups.js.
 * - Объединяет функции сцены, элементов, групп, подгрупп и CSV в один модуль.
 *
 * Библиотека не создаёт новый 3D-движок и не добавляет новые базовые функции
 * рендеринга. Она служит единым слоем доступа к уже существующим возможностям проекта.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ОГЛАВЛЕНИЕ (поиск по Ctrl+F по заголовкам или именам)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
 *   sleep(ms)                     — задержка для ожидания window.Atlas
 *   text(v)                       — безопасное преобразование значения в строку
 *
 * AtlasLibrary (класс)
 *
 *   СОЗДАНИЕ И ПОДКЛЮЧЕНИЕ
 *     constructor(atlasInstance)  — создать библиотеку на основе atlas instance
 *     static create(options)      — дождаться window.Atlas и создать экземпляр
 *     attachAtlas(atlasInstance)  — вручную подключить atlas instance
 *
 *   НОРМАЛИЗАЦИЯ И СОПОСТАВЛЕНИЕ
 *     normalizeName(name)         — нормализовать имя для сопоставления
 *     rebuildMapping()            — построить map item CSV → element id сцены
 *     resolveItem(itemName)       — найти element id по имени item
 *
 *   ЗАГРУЗКА CSV
 *     loadGroupsFromText(csvText, fileName)
 *     loadGroupsFromFile(file)
 *
 *   ЧТЕНИЕ ДАННЫХ СЦЕНЫ
 *     getManifest()               — получить manifest от window.Atlas
 *     getSceneElements()          — получить список элементов сцены
 *     getSceneElementIds()        — получить id всех элементов сцены
 *     getGroupNamesFromScene()    — получить имена групп из scene library
 *
 *   ЧТЕНИЕ ДАННЫХ ГРУПП
 *     getBaseGroups()             — базовые нумерованные группы
 *     getSubgroups()              — редактируемые подгруппы
 *     getAllGroups()              — все группы
 *     getAllItems()               — все уникальные элементы из CSV
 *     findGroup(groupOrName)      — найти группу по объекту или имени
 *     getGroupItems(groupOrName)  — получить элементы конкретной группы
 *
 *   УПРАВЛЕНИЕ ВИДИМОСТЬЮ
 *     showAll() / hideAll()       — показать / скрыть всю модель
 *     showItem(itemName)          — показать элемент
 *     hideItem(itemName)          — скрыть элемент
 *     toggleItem(itemName)        — переключить видимость элемента
 *     showGroup(groupOrName)      — показать группу
 *     hideGroup(groupOrName)      — скрыть группу
 *     toggleGroup(groupOrName)    — переключить видимость группы
 *     syncVisibilityToScene()     — синхронизировать visibility из CSV в сцену
 *
 *   ПОДГРУППЫ (CRUD)
 *     createSubgroup(name, items)
 *     renameSubgroup(groupOrName, newName)
 *     deleteSubgroup(groupOrName)
 *     addItemToSubgroup(groupOrName, itemName)
 *     removeItemFromSubgroup(groupOrName, itemName)
 *
 *   СОСТОЯНИЕ И ПРОВЕРКА
 *     getItemVisibility(itemName)
 *     getGroupVisibility(groupOrName)
 *     getResolvedMap()            — map сопоставленных элементов
 *     getUnresolvedItems()        — список несопоставленных элементов
 *     validateMappings()          — сводка по успешному и ошибочному сопоставлению
 *
 *   ЭКСПОРТ
 *     exportCSV()                 — экспорт CSV в строку
 *     saveCSVToFile(fileName)     — сохранить CSV в файл
 *
 * ВНУТРЕННИЕ ПРОВЕРКИ
 *   _assertAtlas()                — проверка наличия atlas instance
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ЗАВИСИМОСТИ
 * - csv-groups.js
 * - window.Atlas (должен быть создан main.js после загрузки сцены)
 *
 * ОСОБЕННОСТИ
 * - Библиотека не требует изменения существующих файлов проекта.
 * - Все операции со сценой выполняются через уже существующий API window.Atlas.
 * - Все операции с CSV выполняются через CSVGroupsManager.
 * - Дополнительная логика библиотеки отвечает за сопоставление CSV-элементов
 *   с mesh-элементами 3D-модели и за синхронизацию состояний.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// =============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =============================================================================
import CSVGroupsManager from './csv-groups.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function text(v) {
  return String(v ?? '').trim();
}

export default class AtlasLibrary {
  constructor(atlasInstance = null) {
    this.atlas = atlasInstance || (typeof window !== 'undefined' ? window.Atlas : null) || null;
    if (!this.atlas) {
      throw new Error('Atlas instance not found. Pass atlas instance explicitly or ensure window.Atlas exists.');
    }

    this.csvManager = new CSVGroupsManager();
    this.resolvedMap = new Map(); // itemName -> atlas element id
    this.unresolvedItems = new Set();
  }

  static async create({ atlasInstance = null, maxRetries = 120, delayMs = 100 } = {}) {
    if (atlasInstance) return new AtlasLibrary(atlasInstance);
    if (typeof window === 'undefined') {
      throw new Error('window is not available and no atlasInstance was provided.');
    }

    for (let i = 0; i < maxRetries; i += 1) {
      if (window.Atlas) {
        return new AtlasLibrary(window.Atlas);
      }
      await sleep(delayMs);
    }

    throw new Error('window.Atlas was not found within the expected time.');
  }

  _assertAtlas() {
    if (!this.atlas) {
      throw new Error('Atlas instance is not attached.');
    }
  }

  attachAtlas(atlasInstance) {
    if (!atlasInstance) {
      throw new Error('attachAtlas requires a valid atlas instance.');
    }
    this.atlas = atlasInstance;
    this.rebuildMapping();
    return this;
  }

  normalizeName(name) {
    return text(name)
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/-+/g, '_');
  }

  loadGroupsFromText(csvText, fileName = 'groups.csv') {
    this.csvManager.loadFromText(csvText, fileName);
    this.rebuildMapping();
    return true;
  }

  async loadGroupsFromFile(file) {
    const ok = await this.csvManager.loadFromFile(file);
    this.rebuildMapping();
    return ok;
  }

  getManifest() {
    this._assertAtlas();
    return this.atlas.getManifest();
  }

  getSceneElements() {
    const manifest = this.getManifest();
    return Array.isArray(manifest?.elements) ? manifest.elements.slice() : [];
  }

  getSceneElementIds() {
    this._assertAtlas();
    return this.atlas.getElementIds();
  }

  getGroupNamesFromScene() {
    this._assertAtlas();
    return this.atlas.getGroupNames();
  }

  getBaseGroups() {
    return this.csvManager.getBaseGroups();
  }

  getSubgroups() {
    return this.csvManager.getSubgroups();
  }

  getAllGroups() {
    return this.csvManager.getAllGroups();
  }

  getAllItems() {
    return this.csvManager.getAllItems();
  }

  findGroup(groupOrName) {
    const groups = this.getAllGroups();
    if (!groupOrName) return null;

    if (typeof groupOrName === 'object') {
      return groups.find((g) => g === groupOrName) || null;
    }

    const raw = text(groupOrName);
    const normalized = this.normalizeName(raw);

    return (
      groups.find((g) => text(g.rawName) === raw) ||
      groups.find((g) => text(g.groupName) === raw) ||
      groups.find((g) => this.normalizeName(g.rawName) === normalized) ||
      groups.find((g) => this.normalizeName(g.groupName) === normalized) ||
      null
    );
  }

  getGroupItems(groupOrName) {
    const group = this.findGroup(groupOrName);
    return group && Array.isArray(group.items) ? group.items.slice() : [];
  }

  rebuildMapping() {
    this.resolvedMap.clear();
    this.unresolvedItems.clear();

    if (!this.atlas) {
      return { resolved: 0, unresolved: 0 };
    }

    const elements = this.getSceneElements();
    const lookup = new Map();

    for (const entry of elements) {
      const id = text(entry?.id);
      const name = text(entry?.name || entry?.id);
      if (!id) continue;

      const variants = [
        id,
        name,
        this.normalizeName(id),
        this.normalizeName(name),
        id.toLowerCase(),
        name.toLowerCase(),
      ].filter(Boolean);

      for (const key of variants) {
        if (!lookup.has(key)) lookup.set(key, id);
      }
    }

    const items = this.getAllItems();
    for (const item of items) {
      const raw = text(item);
      const variants = [raw, raw.toLowerCase(), this.normalizeName(raw)].filter(Boolean);

      let matchedId = null;
      for (const key of variants) {
        matchedId = lookup.get(key);
        if (matchedId) break;
      }

      if (!matchedId && this.atlas.getElementIdsByName) {
        const ids = this.atlas.getElementIdsByName(raw);
        if (Array.isArray(ids) && ids.length) matchedId = ids[0];
      }

      if (matchedId) this.resolvedMap.set(raw, matchedId);
      else this.unresolvedItems.add(raw);
    }

    return { resolved: this.resolvedMap.size, unresolved: this.unresolvedItems.size };
  }

  resolveItem(itemName) {
    const raw = text(itemName);
    if (!raw) return null;

    if (this.resolvedMap.has(raw)) return this.resolvedMap.get(raw);

    this._assertAtlas();

    if (this.atlas.getElementIdsByName) {
      const ids = this.atlas.getElementIdsByName(raw);
      if (Array.isArray(ids) && ids.length) return ids[0];
    }

    const elements = this.getSceneElements();
    const target = this.normalizeName(raw);

    for (const entry of elements) {
      const id = text(entry?.id);
      const name = text(entry?.name || entry?.id);
      if (!id) continue;
      if (this.normalizeName(id) === target || this.normalizeName(name) === target) {
        return id;
      }
    }

    return null;
  }

  showAll() {
    this._assertAtlas();
    this.atlas.showAll();

    for (const item of this.getAllItems()) {
      this.csvManager.showItem(item);
    }
    for (const group of this.getAllGroups()) {
      this.csvManager.showSubgroup(group.rawName);
    }

    return true;
  }

  hideAll() {
    this._assertAtlas();
    this.atlas.hideAll();

    for (const item of this.getAllItems()) {
      this.csvManager.hideItem(item);
    }
    for (const group of this.getAllGroups()) {
      this.csvManager.hideSubgroup(group.rawName);
    }

    return true;
  }

  showItem(itemName) {
    this._assertAtlas();
    const raw = text(itemName);
    const id = this.resolveItem(raw);
    if (!id) return false;

    this.csvManager.showItem(raw);
    this.atlas.showElement(id);
    return true;
  }

  hideItem(itemName) {
    this._assertAtlas();
    const raw = text(itemName);
    const id = this.resolveItem(raw);
    if (!id) return false;

    this.csvManager.hideItem(raw);
    this.atlas.hideElement(id);
    return true;
  }

  toggleItem(itemName) {
    this._assertAtlas();
    const raw = text(itemName);
    const visible = this.csvManager.toggleItemVisibility(raw);
    const id = this.resolveItem(raw);

    if (id) {
      if (visible) this.atlas.showElement(id);
      else this.atlas.hideElement(id);
    }

    return visible;
  }

  showGroup(groupOrName) {
    this._assertAtlas();
    const group = this.findGroup(groupOrName);
    if (!group) return false;

    this.csvManager.showSubgroup(group.rawName);
    for (const item of group.items || []) {
      this.csvManager.showItem(item);
      const id = this.resolveItem(item);
      if (id) this.atlas.showElement(id);
    }
    return true;
  }

  hideGroup(groupOrName) {
    this._assertAtlas();
    const group = this.findGroup(groupOrName);
    if (!group) return false;

    this.csvManager.hideSubgroup(group.rawName);
    for (const item of group.items || []) {
      this.csvManager.hideItem(item);
      const id = this.resolveItem(item);
      if (id) this.atlas.hideElement(id);
    }
    return true;
  }

  toggleGroup(groupOrName) {
    this._assertAtlas();
    const group = this.findGroup(groupOrName);
    if (!group) return false;

    const visible = this.csvManager.toggleSubgroupVisibility(group.rawName);
    for (const item of group.items || []) {
      this.csvManager.setItemVisibility(item, visible);
      const id = this.resolveItem(item);
      if (id) {
        if (visible) this.atlas.showElement(id);
        else this.atlas.hideElement(id);
      }
    }
    return visible;
  }

  syncVisibilityToScene() {
    this._assertAtlas();
    this.atlas.hideAll();

    const shown = new Set();
    for (const group of this.getAllGroups()) {
      const groupVisible = this.csvManager.getSubgroupVisibility(group.rawName);
      if (!groupVisible) continue;

      for (const item of group.items || []) {
        const itemVisible = this.csvManager.getItemVisibility(item);
        if (!itemVisible) continue;

        const id = this.resolveItem(item);
        if (id && !shown.has(id)) {
          this.atlas.showElement(id);
          shown.add(id);
        }
      }
    }

    return Array.from(shown);
  }

  createSubgroup(name, items = []) {
    const result = this.csvManager.addSubgroup(name, items);
    this.rebuildMapping();
    return result;
  }

  renameSubgroup(groupOrName, newName) {
    const group = this.findGroup(groupOrName);
    if (!group) return { success: false, error: 'Group not found' };
    const result = this.csvManager.editSubgroup(group, newName);
    this.rebuildMapping();
    return result;
  }

  deleteSubgroup(groupOrName) {
    const group = this.findGroup(groupOrName);
    if (!group) return { success: false, error: 'Group not found' };
    const result = this.csvManager.deleteSubgroup(group);
    this.rebuildMapping();
    return result;
  }

  addItemToSubgroup(groupOrName, itemName) {
    const group = this.findGroup(groupOrName);
    if (!group) return { success: false, error: 'Group not found' };
    const result = this.csvManager.addItemToSubgroup(group, itemName);
    this.rebuildMapping();
    return result;
  }

  removeItemFromSubgroup(groupOrName, itemName) {
    const group = this.findGroup(groupOrName);
    if (!group) return { success: false, error: 'Group not found' };
    const result = this.csvManager.removeItemFromSubgroup(group, itemName);
    this.rebuildMapping();
    return result;
  }

  getItemVisibility(itemName) {
    return this.csvManager.getItemVisibility(itemName);
  }

  getGroupVisibility(groupOrName) {
    const group = this.findGroup(groupOrName);
    if (!group) return null;
    return this.csvManager.getSubgroupVisibility(group.rawName);
  }

  getResolvedMap() {
    return new Map(this.resolvedMap);
  }

  getUnresolvedItems() {
    return Array.from(this.unresolvedItems);
  }

  validateMappings() {
    return {
      totalItems: this.getAllItems().length,
      resolvedCount: this.resolvedMap.size,
      unresolvedCount: this.unresolvedItems.size,
      unresolvedItems: this.getUnresolvedItems(),
      resolvedMap: Array.from(this.resolvedMap.entries()).map(([item, id]) => ({ item, id })),
    };
  }

  exportCSV() {
    return this.csvManager.saveToCSVString();
  }

  saveCSVToFile(fileName = 'groups.csv') {
    return this.csvManager.saveToFile(fileName);
  }
}