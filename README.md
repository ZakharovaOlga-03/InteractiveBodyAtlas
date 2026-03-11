# InteractiveBodyAtlas

Небольшой viewer на Three.js + “библиотека” управления видимостью элементов модели.

- Модель (`.glb`) загружается один раз
- По умолчанию **всё скрыто**
- “Добавить/удалить объект” = показать/скрыть (через `visible`)
- Доступ к API из консоли: `window.Atlas`

## Быстрый старт

1) Запустите сервер из корня проекта:

```bash
python server.py
```

2) Откройте `http://127.0.0.1:5173/`

3) Дождитесь текста `Ready. All hidden by default.`

## API (то, что пишет конечный пользователь)

Экземпляр доступен как `window.Atlas`.

### Видимость (показать/скрыть)

```js
Atlas.hideAll()
Atlas.showAll()

Atlas.showGroup('bones')
Atlas.hideGroup('bones')

Atlas.showElement('Cube') // id или name из GLB
Atlas.hideElement('Cube') // id или name из GLB
```

### Информация (что есть в сцене)

```js
Atlas.getGroupNames()
Atlas.getElementIds()
Atlas.getElementIdsByName('ExactMeshName')
Atlas.getManifest() // элементы + их группы
```

### Группы в рантайме (ручные)

```js
Atlas.createGroup('myGroup')
Atlas.deleteGroup('myGroup')

Atlas.addToGroup('myGroup', 'Cube')     // 1 элемент
Atlas.removeFromGroup('myGroup', 'Cube') // 1 элемент

Atlas.getGroupMembers('myGroup')
```