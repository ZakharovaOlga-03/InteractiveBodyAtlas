# Interactive Body Atlas

Интерактивный 3D-атлас тела на Three.js: просмотр GLTF-модели, управление группами анатомии по CSV и маркерами на сцене.

## Что это

- **Просмотр модели** — загрузка одной или нескольких частей модели (`.glb`), по умолчанию всё скрыто; показ/скрытие по группам из CSV.
- **Группы из CSV** — группы анатомии (имена и элементы), загрузка/сохранение `visible_groups.csv`.
- **Маркеры** — добавление маркеров по клику на меш или по координатам; группы маркеров, экспорт/импорт JSON.
- **API для скриптов** — все операции доступны из кода: консоль браузера или свой скрипт после загрузки страницы.

## Где использовать API

После загрузки страницы в глобальную область вынесены три объекта:

- **`window.atlas`** — сцена атласа (`AtlasScene`): показ/скрытие групп и элементов, материалы, загрузка моделей и CSV.
- **`window.markerManager`** — менеджер маркеров: добавление, удаление, видимость, экспорт/импорт.
- **`window.markerUI`** — UI панелей (группы, маркеры); обычно достаточно кнопок в интерфейсе.

**Использование:**

1. **Консоль браузера** (F12 → Console): после полной загрузки страницы вызывайте, например, `atlas.showGroup('Мышцы')`, `markerManager.addMarkerFromCoordinates('1 0 0', {})`.
2. **Свой скрипт в HTML**: подключите свой `<script type="module">` после загрузки (например, с `defer` или в конце `<body>`), в нём используйте глобальные `atlas`, `markerManager`, `markerUI` (они уже созданы в `main.js`).

## API для пользователя

### Показ и скрытие на сцене (`atlas`)

| Метод | Описание |
|-------|----------|
| `atlas.showGroup(groupName)` | Показать группу анатомии по имени из CSV (и предков/потомков в иерархии). |
| `atlas.hideGroup(groupName)` | Скрыть все элементы группы по имени. |
| `atlas.showItem(itemName)` | Показать один элемент по имени (как в CSV). |
| `atlas.hideElement(elementName)` | Скрыть один элемент по имени. |
| `atlas.hideAll()` | Скрыть всю модель. |
| `atlas.showAll()` | Показать всю модель. |

Имена групп и элементов задаются в CSV и должны совпадать с именами узлов в модели.

### Материалы (`atlas`)

| Метод | Описание |
|-------|----------|
| `atlas.applyMaterialToGroup(groupName, material, options?)` | Применить материал ко всем мешам группы. `material` — цвет (строка `'#ff0000'` или число `0xff0000`), объект `{ color, metalness?, roughness? }` или экземпляр `THREE.Material`. `options` — `{ metalness, roughness }` при передаче цвета. |
| `atlas.resetAllMaterials()` | Сбросить все меши модели к базовому материалу (серый MeshStandardMaterial). |

### Загрузка данных (`atlas`)

| Метод | Описание |
|-------|----------|
| `atlas.loadModel(fileName, partIndex?)` | Загрузить `.glb`; при указании `partIndex` (0–7) заменить соответствующую часть. |
| `atlas.loadCsv(fileName)` | Загрузить CSV групп (например `visible_groups.csv`). |

### Группы из CSV (`atlas.csvManager`)

| Метод | Описание |
|-------|----------|
| `atlas.csvManager.getAllGroups()` | Массив групп: `{ rawName, items: string[], type, … }`. |
| `atlas.csvManager.loadFromText(text, fileName?)` | Загрузить содержимое CSV из строки. |

### Маркеры (`markerManager`)

| Метод | Описание |
|-------|----------|
| `markerManager.addMarkerFromIntersection(intersection, style?)` | Добавить маркер в точку пересечения луча с мешем (например, из события клика). |
| `markerManager.addMarkerAtWorldPosition(worldPosition, style?)` | Добавить маркер в мировые координаты (`THREE.Vector3` или `{ x, y, z }`). |
| `markerManager.addMarkerFromCoordinates(coords, style?)` | Добавить маркер по строке `"x y z"`. |
| `markerManager.removeMarker(id)` | Удалить маркер по `id`. |
| `markerManager.updateMarkerProperties(id, properties)` | Обновить свойства: `markerGroup`, `name`, `color`, `scale`, `opacity`, `displayShape`, `comment`, `label` и др. |
| `markerManager.setMarkerVisibility(id, visible)` | Показать/скрыть маркер. |
| `markerManager.toggleMarkerVisibility(id)` | Переключить видимость маркера. |
| `markerManager.setMarkerGroupVisibility(groupName, visible)` | Показать/скрыть группу маркеров. |
| `markerManager.setMarkerAlwaysVisible(id, alwaysVisible)` | Рисовать маркер поверх модели. |
| `markerManager.setGroupAlwaysVisible(groupName, alwaysVisible)` | То же для всей группы маркеров. |
| `markerManager.ensureMarkerGroup(groupName)` | Создать группу маркеров при отсутствии. |
| `markerManager.getMarkerGroups()` | Список имён групп маркеров. |
| `markerManager.exportGroupedJSON()` | Экспорт маркеров в объект `{ groupName: { markerKey: payload } }`. |
| `markerManager.loadFromJSON(data)` | Загрузить маркеры из JSON (объект групп или массив). |
| `markerManager.toCSV()` | Строка CSV с маркерами. |
| `markerManager.clear()` | Удалить все маркеры. |

`style` при добавлении маркера: `{ color?, scale?, opacity?, markerGroup?, displayShape? }` (опционально).

### Вспомогательные методы сцены (`atlas`)

| Метод | Описание |
|-------|----------|
| `atlas.findObject(name)` | Найти объект сцены по имени (точное или без учёта регистра). |
| `atlas.getMeshes()` | Массив всех мешей текущей модели. |
| `atlas.focusOnModel()` | Подстроить камеру под габариты модели. |

## Модули

| Файл | Назначение |
|------|------------|
| `main.js` | Точка входа: создание сцены, загрузка моделей и CSV, инициализация маркеров, экспорт `atlas`, `markerManager`, `markerUI` в `window`. |
| `AtlasScene.js` | 3D-сцена (Three.js), камера, загрузка GLTF и CSV, индекс мешей по имени, группы, материалы. |
| `csv-groups.js` | Парсинг/сериализация CSV групп, `CSVGroupsManager`. |
| `MarkerManager.js` | Маркеры на сцене (сфера/куб), привязка к мешам или координатам, группы, JSON. |
| `MarkerUI.js` | Панели и формы: группы, маркеры, клики по канвасу, попап, таблица маркеров. |

Подробное оглавление API — в JSDoc в начале каждого файла.

## Запуск

- **Локальная разработка**: запустите HTTP-сервер из корня проекта (например, `python server.py`) и откройте в браузере `http://127.0.0.1:5173/`. Так выполняются локальные скрипты и корректно грузятся ассеты.
- **Один index.html**: двойной клик по `index.html` или открытие по `file://` — скрипты подгружаются с CDN (ветка `restructure`), модели и CSV — тоже с CDN.

## Использование в интерфейсе

- **Группы** — чекбоксы в панели «Группы» показывают/скрывают анатомические группы из CSV.
- **Маркеры** — включите режим «Добавить маркер», кликните по видимой части модели; редактирование в панели «Данные маркера», экспорт/импорт через кнопки в UI.
