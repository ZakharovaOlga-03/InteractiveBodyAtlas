# Команды консоли и скрипты в HTML (scene API)

Библиотека не зависит от интерфейса: на странице только отображение 3D-модели. Управление — **только через тег `<script type="text/atlas-script">`** в HTML и/или через консоль браузера (объект `scene`). Файлы (CSV, модели) задаются в скрипте атрибутами `data-csv`, `data-model1`, `data-model2` или вызовами `scene.load_csv(...)` и т.д.

## Скрипты в HTML

В разметке можно добавить скрипт с типом `text/atlas-script` — он выполнится при запуске страницы и повторно после загрузки CSV или модели. В коде доступны переменные **scene**, **csvManager**, **THREE**.

### Параметры через data-атрибуты (загрузка по имени из папки с HTML)

Через атрибуты можно задать имена файлов — они подгрузятся из той же папки, что и страница, до выполнения кода скрипта:

- **data-csv** — имя CSV (например `atlas.csv`)
- **data-model1** — имя файла модели 1 (например `model1.glb`)
- **data-model2** — имя файла модели 2 (например `model2.glb`)

```html
<script type="text/atlas-script" data-csv="NamesAndGroupsTest.csv" data-model1="part1.glb" data-model2="part2.glb">
  scene.show_group("1:1:_Skeletal_system");
  scene.show_group("Bones_of_pelvic_girdle.g");
  scene.hide_element("Femur.l");
</script>
```

Сначала загружаются указанные файлы, затем выполняется код скрипта.

### Загрузка по имени из кода скрипта

В коде можно вызывать загрузку по имени файла (из папки с HTML): `scene.load_csv("atlas.csv")`, `scene.load_model("model1.glb")`, `scene.load_model_2("model2.glb")`. Методы возвращают Promise, поэтому для последовательной загрузки удобнее задать файлы через data-атрибуты (см. выше).

### Простой вариант без параметров

```html
<script type="text/atlas-script">
  scene.show_group("1:1:_Skeletal_system");
  scene.show_group("Bones_of_pelvic_girdle.g");
  // или: var mat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
  // scene.change_mat("Hip_bone.l", mat);
</script>
```

Скрипт выполняется: (1) сразу после инициализации, (2) после загрузки CSV, (3) после загрузки модели 1 или 2. Команды вроде `show_group` сработают после загрузки данных.

---

## Видимость и материалы

```javascript
// Показать группу (все элементы группы становятся видимыми)
scene.show_group("Bones_of_free_part_of_lower_limb.g")
scene.show_group("1:1:_Skeletal_system")

// Скрыть группу
scene.hide_group("Bones_of_free_part_of_lower_limb.g")

// Скрыть один элемент
scene.hide_element("Femur.l")

// Изменить материал группе или элементу
// (создайте материал: custom_material = new THREE.MeshStandardMaterial({ color: 0xff0000 }))
scene.change_mat("1:1:_Skeletal_system", custom_material)
scene.change_mat("Hip_bone.l", custom_material_2)

// Показать группу маркеров на сцене (Object3D / THREE.Group)
scene.show_marker_group(my_marker_group1)
```

---

## Файлы

```javascript
// Открыть диалог выбора CSV и загрузить
scene.load_csv()

// Открыть диалог выбора модели 1 или 2 (.glb) и загрузить (модель из двух частей)
scene.load_model()
scene.load_model_2()

// Сохранить CSV в файл (имя опционально)
scene.save_csv()
scene.save_csv("export.csv")
```

---

## Данные (чтение)

```javascript
// Все группы: { base: [...], subgroups: [...] }
scene.get_groups()

// Только базовые (нумерованные) группы
scene.get_base_groups()

// Только подгруппы (редактируемые)
scene.get_subgroups()

// Список имён всех подгрупп
scene.get_subgroups().map(g => g.rawName)

// Все уникальные имена элементов из всех групп
scene.get_items()

// Текущее содержимое CSV в виде строки
scene.csv_string()
```

---

## Редактирование подгрупп

```javascript
// Создать подгруппу (второй аргумент — массив имён элементов, можно не передавать)
scene.add_subgroup("Моя группа")
scene.add_subgroup("Кости ноги", ["Femur.l", "Femur.r", "Tibia.l"])

// Переименовать подгруппу
scene.edit_subgroup("Моя_группа.g", "Новое имя")

// Удалить подгруппу
scene.delete_subgroup("Моя_группа.g")

// Добавить элемент в подгруппу
scene.add_item_to_subgroup("Моя_группа.g", "Hip_bone.l")

// Удалить элемент из подгруппы
scene.remove_item_from_subgroup("Моя_группа.g", "Hip_bone.l")
```

---

## Полезные комбинации

```javascript
// Показать несколько групп подряд
scene.show_group("Bones_of_free_part_of_lower_limb.g").show_group("Bones_of_pelvic_girdle.g")

// Список rawName всех групп (база + подгруппы)
[...scene.get_base_groups(), ...scene.get_subgroups()].map(g => g.rawName)

// Найти группу по имени (rawName)
scene.get_subgroups().find(g => g.rawName === "Bones_of_pelvic_girdle.g")
```

---

## Имена групп и элементов

- **Базовые группы** — как в CSV, например: `"1:1:_Skeletal_system"`.
- **Подгруппы** — заканчиваются на `.g`, например: `"Bones_of_pelvic_girdle.g"`.
- **Элементы** — имена из CSV, например: `"Femur.l"`, `"Hip_bone.r"`.

Используйте `scene.get_groups()` и `scene.get_items()`, чтобы увидеть точные имена после загрузки CSV.
