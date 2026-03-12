/**
 * csv-groups.js — библиотека для работы с CSV групп и подгрупп.
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

export default CSVGroupsManager;
