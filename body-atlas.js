/**
 * csv-groups.js — библиотека для работы с CSV групп и подгрупп.
 *
 * Библиотека не зависит от интерфейса (DOM, кнопки, списки). Использование — только через
 * скрипт в HTML: тег <script type="text/atlas-script"> и/или консоль (scene.*). Хост
 * предоставляет сцену, findObject, загрузчики по имени (loadCsvByName, loadModel1ByName, …);
 * отображается только 3D-модель.
 *
 * Формат строки CSV: groupId;;item1;item2;item3;...
 * - Нумерованные группы (колонка вида "N:Name"): только чтение.
 * - Подгруппы (колонка заканчивается на ".g"): можно добавлять, редактировать, удалять.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ОГЛАВЛЕНИЕ (поиск по Ctrl+F по заголовкам или именам)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * КОНСТАНТЫ
 *   CSV_DELIMITER, SUBGROUP_SUFFIX
 *
 * ТИПЫ ГРУПП (проверки)
 *   isNumberedGroup(rawName)     — нумерованная (только чтение)
 *   isEditableSubgroup(rawName)   — редактируемая подгруппа (.g)
 *
 * ИМЕНА
 *   toDisplayName(raw)           — raw → отображаемое (подчёркивания в пробелы)
 *   toRawName(displayName, isSubgroup) — отображаемое → raw
 *
 * ПАРСИНГ И СЕРИАЛИЗАЦИЯ
 *   parseCSVLine(line)            — одна строка CSV → объект группы
 *   parseCSV(text)                — весь текст → { baseGroups, subgroups }
 *   serializeCSV(data)            — { baseGroups, subgroups } → строка CSV
 *
 * CSVGroupsManager (класс)
 *   Загрузка:
 *     loadFromText(text, fileName)
 *     loadFromFile(file)          — Promise<boolean>
 *   Чтение данных:
 *     getBaseGroups()             — нумерованные группы
 *     getSubgroups()              — редактируемые подгруппы
 *     getAllGroups()              — все с полем type
 *     getAllItems()               — все уникальные имена элементов
 *   Проверки прав:
 *     canEditGroup(group)
 *     canDeleteGroup(group)
 *     canAddSubgroup()
 *   Подгруппы (CRUD):
 *     addSubgroup(name, items)
 *     editSubgroup(group, newName)
 *     deleteSubgroup(group)
 *   Элементы в подгруппе:
 *     addItemToSubgroup(group, itemName)
 *     removeItemFromSubgroup(group, itemName)
 *   Видимость (в памяти, не в CSV):
 *     setItemVisibility(itemName, visible)  getItemVisibility(itemName)
 *     setSubgroupVisibility(groupRawName, v) getSubgroupVisibility(groupRawName)
 *     showItem / hideItem / showSubgroup / hideSubgroup
 *     toggleItemVisibility / toggleSubgroupVisibility
 *   Сохранение:
 *     saveToCSVString()
 *     saveToFile(fileName)
 *
 * УТИЛИТЫ
 *   selectFile(accept)            — диалог выбора файла, Promise<File|null>
 *
 * КОНСОЛЬНЫЙ API СЦЕНЫ (для вызова из консоли браузера)
 *   createSceneConsoleAPI({ scene, findObject, getGroupByName [, csvManager, triggerLoadCsv, triggerLoadModel, triggerLoadModel2 ] })
 *   Возвращает объект с методами (вешается на scene или window.scene):
 *   Видимость и материалы:
 *     show_group(groupName)       — показать группу
 *     hide_group(groupName)       — скрыть группу
 *     hide_element(elementName)   — скрыть элемент
 *     change_mat(target, material) — материал группе или элементу
 *     show_marker_group(markerGroup) — показать группу маркеров на сцене
 *   Файлы (если переданы triggerLoadCsv, triggerLoadModel, csvManager):
 *     load_csv(fileName?)         — без аргумента: диалог; с именем: загрузка из папки с HTML
 *     load_model(fileName?)       — то же для модели 1
 *     load_model_2(fileName?)     — то же для модели 2 (возвращают Promise при загрузке по имени)
 *     save_csv(fileName?)         — сохранить CSV в файл
 *   Данные (если передан csvManager):
 *     get_groups()                — { base, subgroups }
 *     get_base_groups()           — массив базовых групп
 *     get_subgroups()             — массив подгрупп
 *     get_items()                 — все уникальные имена элементов
 *     csv_string()                — текущий CSV в виде строки
 *   Редактирование подгрупп (если передан csvManager):
 *     add_subgroup(name, items?)  — создать подгруппу
 *     edit_subgroup(groupName, newName)
 *     delete_subgroup(groupName)
 *     add_item_to_subgroup(groupName, itemName)
 *     remove_item_from_subgroup(groupName, itemName)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// =============================================================================
// КОНСТАНТЫ
// =============================================================================

const CSV_DELIMITER = ';';
const SUBGROUP_SUFFIX = '.g';

// =============================================================================
// ТИПЫ ГРУПП (проверки)
// =============================================================================

/**
 * Нумерованная группа (только для чтения). Первая колонка вида "N:Name".
 * @param {string} rawName
 * @returns {boolean}
 */
export function isNumberedGroup(rawName) {
  if (!rawName || typeof rawName !== 'string') return false;
  return /^\d+:/.test(rawName.trim());
}

/**
 * Редактируемая подгруппа. Первая колонка заканчивается на ".g".
 * @param {string} rawName
 * @returns {boolean}
 */
export function isEditableSubgroup(rawName) {
  if (!rawName || typeof rawName !== 'string') return false;
  const t = rawName.trim();
  return t.endsWith(SUBGROUP_SUFFIX) && !/^\d+:/.test(t);
}

// =============================================================================
// ИМЕНА (отображение ↔ raw)
// =============================================================================

/**
 * raw → отображаемое имя (подчёркивания в пробелы, .g убирается).
 * @param {string} raw
 * @returns {string}
 */
export function toDisplayName(raw) {
  if (!raw) return '';
  return String(raw).replace(/_/g, ' ').replace(/\.g$/i, '').trim();
}

/**
 * Отображаемое имя → raw (для подгруппы добавляется .g).
 * @param {string} displayName
 * @param {boolean} [isSubgroup=false]
 * @returns {string}
 */
export function toRawName(displayName, isSubgroup = false) {
  if (!displayName) return '';
  const base = String(displayName).trim().replace(/\s+/g, '_');
  return isSubgroup ? (base.endsWith(SUBGROUP_SUFFIX) ? base : base + SUBGROUP_SUFFIX) : base;
}

// =============================================================================
// ПАРСИНГ И СЕРИАЛИЗАЦИЯ
// =============================================================================

/**
 * Парсит одну строку CSV (разделитель ;).
 * @param {string} line
 * @returns {{ rawName, groupName, items, numbered, editable } | null}
 */
export function parseCSVLine(line) {
  const t = line.trim();
  if (!t) return null;
  const parts = t.split(CSV_DELIMITER);
  const rawName = (parts[0] || '').replace(/\uFEFF/g, '').trim();
  if (!rawName) return null;
  const items = parts.slice(2).map((p) => p.trim()).filter(Boolean);
  const numbered = isNumberedGroup(rawName);
  const editable = isEditableSubgroup(rawName);
  const groupName = toDisplayName(rawName.replace(/\.g$/i, ''));
  return { rawName, groupName, items, numbered, editable };
}

/**
 * Парсит весь текст CSV.
 * @param {string} text
 * @returns {{ baseGroups: Array, subgroups: Array }}
 */
export function parseCSV(text) {
  const baseGroups = [];
  const subgroups = [];
  const rawText = (text || '').replace(/^\uFEFF/, '');
  const lines = rawText.split(/\r?\n/);
  for (const line of lines) {
    const row = parseCSVLine(line);
    if (!row) continue;
    if (row.numbered) baseGroups.push({ ...row });
    else if (row.editable) subgroups.push({ ...row });
  }
  return { baseGroups, subgroups };
}

/**
 * Сериализует данные в строку CSV.
 * @param {{ baseGroups: Array<{rawName, items}>, subgroups: Array<{rawName, items}> }} data
 * @returns {string}
 */
export function serializeCSV(data) {
  const lines = [];
  const { baseGroups = [], subgroups = [] } = data;
  for (const g of baseGroups) {
    lines.push([g.rawName, '', ...(g.items || [])].join(CSV_DELIMITER));
  }
  for (const g of subgroups) {
    const raw = g.rawName || toRawName(g.groupName, true);
    lines.push([raw, '', ...(g.items || [])].join(CSV_DELIMITER));
  }
  return lines.join('\r\n');
}

// =============================================================================
// CSVGroupsManager — класс для работы с CSV
// =============================================================================

export class CSVGroupsManager {
  constructor() {
    this.baseGroups = [];
    this.subgroups = [];
    this.fileName = 'atlas.csv';
    this.visibilityByItem = new Map();
    this.visibilityByGroup = new Map();
  }

  // ---------- Загрузка ----------

  /** Загружает данные из строки CSV. */
  loadFromText(text, fileName) {
    const { baseGroups, subgroups } = parseCSV(text);
    this.baseGroups = baseGroups;
    this.subgroups = subgroups;
    if (fileName) this.fileName = fileName;
  }

  /** Загружает из File (браузер). Возвращает Promise<boolean>. */
  async loadFromFile(file) {
    if (!file) return false;
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          this.loadFromText(ev.target.result, file.name);
          resolve(true);
        } catch (err) {
          console.error('CSV load error:', err);
          resolve(false);
        }
      };
      reader.onerror = () => resolve(false);
      reader.readAsText(file, 'UTF-8');
    });
  }

  // ---------- Чтение данных ----------

  /** Только базовые (нумерованные) группы. */
  getBaseGroups() {
    return [...this.baseGroups];
  }

  /** Только подгруппы (редактируемые). */
  getSubgroups() {
    return [...this.subgroups];
  }

  /** Все группы с полем type: 'base' | 'subgroup'. */
  getAllGroups() {
    const list = [];
    this.baseGroups.forEach((g) => list.push({ ...g, type: 'base' }));
    this.subgroups.forEach((g) => list.push({ ...g, type: 'subgroup' }));
    return list;
  }

  /** Все уникальные имена элементов из всех групп. */
  getAllItems() {
    const set = new Set();
    [...this.baseGroups, ...this.subgroups].forEach((g) => (g.items || []).forEach((name) => set.add(name)));
    return Array.from(set);
  }

  // ---------- Проверки прав ----------

  /** Можно ли редактировать группу (только подгруппы .g). */
  canEditGroup(group) {
    if (group.type === 'base' || group.numbered) return false;
    return group.editable === true || (group.rawName && isEditableSubgroup(group.rawName));
  }

  /** Можно ли удалить группу. */
  canDeleteGroup(group) {
    return this.canEditGroup(group);
  }

  /** Можно ли добавлять новые подгруппы. */
  canAddSubgroup() {
    return true;
  }

  // ---------- Подгруппы (CRUD) ----------

  /**
   * Добавить подгруппу. Возвращает { success, group?, error? }.
   * @param {string} groupName
   * @param {string[]} [items=[]]
   */
  addSubgroup(groupName, items = []) {
    const name = (groupName || '').trim();
    if (!name) return { success: false, error: 'Название не задано' };
    const rawName = toRawName(name, true);
    const displayName = toDisplayName(rawName);
    if (this.subgroups.some((g) => g.rawName === rawName || (g.groupName && g.groupName === displayName)))
      return { success: false, error: 'Группа с таким названием уже есть' };
    if (this.baseGroups.some((g) => g.groupName === displayName || toDisplayName(g.rawName) === displayName))
      return { success: false, error: 'Группа с таким названием уже есть (базовая группа)' };
    const group = {
      rawName,
      groupName: toDisplayName(rawName),
      items: Array.isArray(items) ? [...items] : [],
      numbered: false,
      editable: true,
    };
    this.subgroups.push(group);
    return { success: true, group };
  }

  /**
   * Переименовать подгруппу. Возвращает { success, error? }.
   * @param {object} group — ссылка на объект из getSubgroups()
   * @param {string} newName
   */
  editSubgroup(group, newName) {
    const g = this.subgroups.find((x) => x === group);
    if (!g) return { success: false, error: 'Редактируемая группа не найдена' };
    if (!this.canEditGroup(group)) return { success: false, error: 'Эту группу нельзя редактировать (нумерованные группы защищены)' };
    const name = (newName || '').trim();
    if (!name) return { success: false, error: 'Название не задано' };
    const rawName = toRawName(name, true);
    if (this.subgroups.some((x) => x !== group && (x.rawName === rawName || x.groupName === toDisplayName(rawName))))
      return { success: false, error: 'Группа с таким названием уже есть' };
    g.rawName = rawName;
    g.groupName = toDisplayName(rawName);
    return { success: true };
  }

  /**
   * Удалить подгруппу. Возвращает { success, error? }.
   * @param {object} group
   */
  deleteSubgroup(group) {
    const idx = this.subgroups.findIndex((g) => g === group);
    if (idx === -1) return { success: false, error: 'Такая группа не найдена' };
    if (!this.canDeleteGroup(group)) return { success: false, error: 'Эту группу нельзя удалить' };
    this.subgroups.splice(idx, 1);
    return { success: true };
  }

  // ---------- Элементы в подгруппе ----------

  /**
   * Добавить элемент в подгруппу. Возвращает { success, error? }.
   * @param {object} group
   * @param {string} itemName
   */
  addItemToSubgroup(group, itemName) {
    if (!this.canEditGroup(group)) return { success: false, error: 'Группу нельзя редактировать' };
    const name = (itemName || '').trim();
    if (!name) return { success: false, error: 'Имя элемента не задано' };
    const g = this.subgroups.find((x) => x === group);
    if (!g) return { success: false, error: 'Группа не найдена' };
    if (!g.items) g.items = [];
    if (g.items.includes(name)) return { success: true };
    g.items.push(name);
    return { success: true };
  }

  /**
   * Удалить элемент из подгруппы. Возвращает { success, error? }.
   * @param {object} group
   * @param {string} itemName
   */
  removeItemFromSubgroup(group, itemName) {
    if (!this.canEditGroup(group)) return { success: false, error: 'Группу нельзя редактировать' };
    const g = this.subgroups.find((x) => x === group);
    if (!g) return { success: false, error: 'Группа не найдена' };
    if (!g.items) return { success: true };
    g.items = g.items.filter((n) => n !== itemName);
    return { success: true };
  }

  applyMaterialToGroup(groupRawName, material, findObject) {
      const group = [...this.baseGroups, ...this.subgroups].find(g => g.rawName === groupRawName);
      if (!group || !group.items) return false;
      
      group.items.forEach(itemName => {
          const obj = findObject(itemName);
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


  // ---------- Видимость (в памяти, не сохраняется в CSV) ----------

  /** Установить видимость одного элемента. */
  setItemVisibility(itemName, visible) {
    const key = (itemName || '').trim();
    if (!key) return;
    this.visibilityByItem.set(key, !!visible);
  }

  /** Получить видимость элемента (по умолчанию true). */
  getItemVisibility(itemName) {
    const key = (itemName || '').trim();
    if (!key) return true;
    if (this.visibilityByItem.has(key)) return this.visibilityByItem.get(key);
    return true;
  }

  /** Установить видимость всей подгруппы. */
  setSubgroupVisibility(groupRawName, visible) {
    const key = (groupRawName || '').trim();
    if (!key) return;
    this.visibilityByGroup.set(key, !!visible);
    const group = [...this.baseGroups, ...this.subgroups].find((g) => g.rawName === key);
    if (group && group.items) {
      group.items.forEach((item) => this.visibilityByItem.set(item, !!visible));
    }
  }

  /** Получить видимость подгруппы (по умолчанию true). */
  getSubgroupVisibility(groupRawName) {
    const key = (groupRawName || '').trim();
    if (!key) return true;
    if (this.visibilityByGroup.has(key)) return this.visibilityByGroup.get(key);
    return true;
  }

  showItem(itemName) {
    this.setItemVisibility(itemName, true);
  }
  hideItem(itemName) {
    this.setItemVisibility(itemName, false);
  }
  showSubgroup(groupRawName) {
    this.setSubgroupVisibility(groupRawName, true);
  }
  hideSubgroup(groupRawName) {
    this.setSubgroupVisibility(groupRawName, false);
  }

  /** Переключить видимость элемента. Возвращает новое состояние (true = видим). */
  toggleItemVisibility(itemName) {
    const v = !this.getItemVisibility(itemName);
    this.setItemVisibility(itemName, v);
    return v;
  }

  /** Переключить видимость подгруппы. Возвращает новое состояние. */
  toggleSubgroupVisibility(groupRawName) {
    const v = !this.getSubgroupVisibility(groupRawName);
    this.setSubgroupVisibility(groupRawName, v);
    return v;
  }

  // ---------- Сохранение ----------

  /** Вернуть содержимое CSV строкой. */
  saveToCSVString() {
    return serializeCSV({ baseGroups: this.baseGroups, subgroups: this.subgroups });
  }

  /** Скачать CSV как файл (браузер). */
  saveToFile(fileName) {
    const name = fileName || this.fileName;
    const content = this.saveToCSVString();
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// =============================================================================
// УТИЛИТЫ
// =============================================================================

/**
 * Диалог выбора файла (браузер). Возвращает Promise<File|null>.
 * @param {string} [accept='.csv']
 */
export function selectFile(accept = '.csv') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.onchange = () => {
      const file = input.files && input.files[0];
      document.body.removeChild(input);
      resolve(file || null);
    };
    input.oncancel = () => {
      setTimeout(() => {
        if (!input.files || !input.files.length) {
          document.body.removeChild(input);
          resolve(null);
        }
      }, 0);
    };
    document.body.appendChild(input);
    input.click();
  });
}

// =============================================================================
// КОНСОЛЬНЫЙ API СЦЕНЫ (scene.show_group, scene.hide_element, scene.change_mat, …)
// =============================================================================

/**
 * Создаёт объект с методами для управления сценой из консоли браузера.
 * Подключение: Object.assign(scene, createSceneConsoleAPI({ scene, findObject, getGroupByName, csvManager, triggerLoadCsv, triggerLoadModel })); window.scene = scene;
 *
 * @param {Object} opts
 * @param {Object} opts.scene
 * @param {function(string): Object|null} opts.findObject
 * @param {function(string): { items: string[] }|null} opts.getGroupByName
 * @param {Object} [opts.csvManager] — CSVGroupsManager для save_csv, get_groups, CRUD
 * @param {function()} [opts.triggerLoadCsv] — вызвать выбор CSV (например () => document.getElementById('csvInput').click())
 * @param {function()} [opts.triggerLoadModel] — вызвать выбор модели 1 (например () => document.getElementById('glbInput').click())
 * @param {function()} [opts.triggerLoadModel2] — вызвать выбор модели 2 (например () => document.getElementById('glbInput2').click())
 * @param {function(string): Promise} [opts.loadCsvByName] — загрузить CSV по имени файла (из папки с HTML)
 * @param {function(string): Promise} [opts.loadModel1ByName] — загрузить модель 1 по имени
 * @param {function(string): Promise} [opts.loadModel2ByName] — загрузить модель 2 по имени
 */
export function createSceneConsoleAPI(opts) {
  const {
    scene, findObject, getGroupByName, csvManager,
    triggerLoadCsv, triggerLoadModel, triggerLoadModel2,
    loadCsvByName, loadModel1ByName, loadModel2ByName,
  } = opts;

  function showObj(obj) {
    if (!obj) return;
    obj.visible = true;
    let p = obj.parent;
    while (p) {
      p.visible = true;
      p = p.parent;
    }
  }

  function hideObj(obj) {
    if (!obj) return;
    obj.traverse((c) => { c.visible = false; });
  }

  function setMaterialOn(obj, material) {
    if (!obj) return;
    obj.traverse((c) => {
      if (c.isMesh) {
        if (Array.isArray(c.material)) {
          for (let i = 0; i < c.material.length; i++) c.material[i] = material;
        } else {
          c.material = material;
        }
      }
    });
  }

  return {
      // ===== НОВЫЙ МЕТОД =====
      apply_material_to_group: function(groupName, material) {
          if (!csvManager) return this;
          const group = getGroupByName && getGroupByName(String(groupName));
          if (!group) { console.warn('Группа не найдена:', groupName); return this; }
          csvManager.applyMaterialToGroup(group.rawName, material, findObject);
          return this;
      },
      
      /**
       * Показать группу по имени (базовую или подгруппу).
       * Пример: scene.show_group("Bones_of_free_part_of_lower_limb.g")
       * @param {string} groupName — rawName группы (например "1:1:_Skeletal_system" или "Bones_of_pelvic_girdle.g")
       */
      show_group: function(groupName) {
          const group = getGroupByName && getGroupByName(String(groupName));
          if (!group || !group.items) {
              console.warn('Группа не найдена:', groupName);
              return this;
          }
          group.items.forEach((itemName) => {
              const obj = findObject(itemName);
              if (obj) showObj(obj);
          });
          return this;
      },

    /**
     * Скрыть группу.
     * Пример: scene.hide_group("Bones_of_free_part_of_lower_limb.g")
     * @param {string} groupName
     */
    hide_group(groupName) {
      const group = getGroupByName && getGroupByName(String(groupName));
      if (!group || !group.items) {
        console.warn('Группа не найдена:', groupName);
        return this;
      }
      group.items.forEach((itemName) => {
        const obj = findObject(itemName);
        if (obj) hideObj(obj);
      });
      return this;
    },

    /**
     * Скрыть один элемент.
     * Пример: scene.hide_element("Femur.l")
     * @param {string} elementName
     */
    hide_element(elementName) {
      const obj = findObject(String(elementName));
      if (!obj) {
        console.warn('Элемент не найден:', elementName);
        return this;
      }
      hideObj(obj);
      return this;
    },

    /**
     * Изменить материал группе или одному элементу.
     * Примеры:
     *   scene.change_mat("1:1:_Skeletal_system", custom_material)
     *   scene.change_mat("Hip_bone.l", custom_material_2)
     * @param {string} target — имя группы или элемента
     * @param {Object} material — THREE.Material (или совместимый объект)
     */
    change_mat(target, material) {
      const name = String(target);
      const group = getGroupByName && getGroupByName(name);
      if (group && group.items) {
        group.items.forEach((itemName) => {
          const obj = findObject(itemName);
          setMaterialOn(obj, material);
        });
      } else {
        const obj = findObject(name);
        if (!obj) {
          console.warn('Группа/элемент не найден:', target);
          return this;
        }
        setMaterialOn(obj, material);
      }
      return this;
    },

    /**
     * Показать группу маркеров на сцене (добавить на сцену).
     * Пример: scene.show_marker_group(my_marker_group1)
     * @param {Object} markerGroup — THREE.Group или Object3D
     */
    show_marker_group(markerGroup) {
      if (scene && typeof scene.add === 'function') scene.add(markerGroup);
      return this;
    },

    // ---------- Файлы ----------
    /**
     * Загрузить CSV. Без аргумента — диалог выбора файла.
     * С аргументом (имя файла) — загрузка из папки с HTML: scene.load_csv("atlas.csv").
     * @param {string} [fileName] — имя файла в папке со страницей
     * @returns {this|Promise<this>}
     */
    load_csv(fileName) {
      const name = typeof fileName === 'string' ? fileName.trim() : '';
      if (name && typeof loadCsvByName === 'function') {
        return loadCsvByName(name).then(() => this);
      }
      if (typeof triggerLoadCsv === 'function') triggerLoadCsv();
      else console.warn('load_csv: передайте triggerLoadCsv или loadCsvByName в createSceneConsoleAPI');
      return this;
    },
    /**
     * Загрузить модель 1. Без аргумента — диалог. С именем — из папки с HTML: scene.load_model("model1.glb").
     * @param {string} [fileName]
     * @returns {this|Promise<this>}
     */
    load_model(fileName) {
      const name = typeof fileName === 'string' ? fileName.trim() : '';
      if (name && typeof loadModel1ByName === 'function') {
        return loadModel1ByName(name).then(() => this);
      }
      if (typeof triggerLoadModel === 'function') triggerLoadModel();
      else console.warn('load_model: передайте triggerLoadModel или loadModel1ByName в createSceneConsoleAPI');
      return this;
    },
    /**
     * Загрузить модель 2. Без аргумента — диалог. С именем — из папки: scene.load_model_2("model2.glb").
     * @param {string} [fileName]
     * @returns {this|Promise<this>}
     */
    load_model_2(fileName) {
      const name = typeof fileName === 'string' ? fileName.trim() : '';
      if (name && typeof loadModel2ByName === 'function') {
        return loadModel2ByName(name).then(() => this);
      }
      if (typeof triggerLoadModel2 === 'function') triggerLoadModel2();
      else console.warn('load_model_2: передайте triggerLoadModel2 или loadModel2ByName в createSceneConsoleAPI');
      return this;
    },
    /** Сохранить CSV в файл. */
    save_csv(fileName) {
      if (!csvManager) { console.warn('save_csv: передайте csvManager'); return this; }
      csvManager.saveToFile(fileName);
      return this;
    },

    // ---------- Данные ----------
    /** Вернуть { base: baseGroups[], subgroups: subgroups[] }. */
    get_groups() {
      if (!csvManager) { console.warn('get_groups: передайте csvManager'); return { base: [], subgroups: [] }; }
      return { base: csvManager.getBaseGroups(), subgroups: csvManager.getSubgroups() };
    },
    get_base_groups() {
      if (!csvManager) return [];
      return csvManager.getBaseGroups();
    },
    get_subgroups() {
      if (!csvManager) return [];
      return csvManager.getSubgroups();
    },
    /** Все уникальные имена элементов из всех групп. */
    get_items() {
      if (!csvManager) return [];
      return csvManager.getAllItems();
    },
    /** Текущее содержимое CSV в виде строки. */
    csv_string() {
      if (!csvManager) return '';
      return csvManager.saveToCSVString();
    },

    // ---------- Редактирование подгрупп ----------
    /** Создать подгруппу. items — массив имён элементов (необязательно). */
    add_subgroup(name, items) {
      if (!csvManager) { console.warn('add_subgroup: передайте csvManager'); return this; }
      const result = csvManager.addSubgroup(name, items || []);
      if (!result.success) console.warn('add_subgroup:', result.error);
      return this;
    },
    /** Переименовать подгруппу. */
    edit_subgroup(groupName, newName) {
      if (!csvManager) { console.warn('edit_subgroup: передайте csvManager'); return this; }
      const group = getGroupByName && getGroupByName(String(groupName));
      if (!group) { console.warn('Группа не найдена:', groupName); return this; }
      const result = csvManager.editSubgroup(group, newName);
      if (!result.success) console.warn('edit_subgroup:', result.error);
      return this;
    },
    /** Удалить подгруппу. */
    delete_subgroup(groupName) {
      if (!csvManager) { console.warn('delete_subgroup: передайте csvManager'); return this; }
      const group = getGroupByName && getGroupByName(String(groupName));
      if (!group) { console.warn('Группа не найдена:', groupName); return this; }
      const result = csvManager.deleteSubgroup(group);
      if (!result.success) console.warn('delete_subgroup:', result.error);
      return this;
    },
    /** Добавить элемент в подгруппу. */
    add_item_to_subgroup(groupName, itemName) {
      if (!csvManager) { console.warn('add_item_to_subgroup: передайте csvManager'); return this; }
      const group = getGroupByName && getGroupByName(String(groupName));
      if (!group) { console.warn('Группа не найдена:', groupName); return this; }
      csvManager.addItemToSubgroup(group, itemName);
      return this;
    },
    /** Удалить элемент из подгруппы. */
    remove_item_from_subgroup(groupName, itemName) {
      if (!csvManager) { console.warn('remove_item_from_subgroup: передайте csvManager'); return this; }
      const group = getGroupByName && getGroupByName(String(groupName));
      if (!group) { console.warn('Группа не найдена:', groupName); return this; }
      csvManager.removeItemFromSubgroup(group, itemName);
      return this;
    },
  };
}

export default CSVGroupsManager;
