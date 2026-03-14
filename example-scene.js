/**
 * Пример настроенной сцены для пользователя.
 * Показывает: создание сцены, загрузку моделей и CSV, показ/скрытие групп,
 * смену материала, добавление маркеров. Запуск: откройте index-example.html
 * или подключите этот файл вместо main.js в index.html.
 */
import { AtlasScene } from './AtlasScene.js';
import { MarkerManager } from './MarkerManager.js';
import { MarkerUI } from './MarkerUI.js';

const CDN = 'https://cdn.jsdelivr.net/gh/ZakharovaOlga-03/InteractiveBodyAtlas@main/';

const atlas = new AtlasScene('canvas-container', {
  modelBaseUrl: CDN + 'models/',
  csvBaseUrl: CDN
});

try {
  // Загрузка частей модели
  await atlas.loadModel('p1.glb', 0);
  await atlas.loadModel('p2.glb', 1);
  await atlas.loadModel('p3.glb', 2);
  await atlas.loadModel('p4.glb', 3);
  await atlas.loadModel('p5.glb', 4);
  await atlas.loadModel('p6.glb', 5);
  await atlas.loadModel('p7.glb', 6);
  await atlas.loadModel('p8.glb', 7);

  await atlas.loadCsv('visible_groups.csv');

  const markerManager = new MarkerManager({ scene: atlas.scene, atlas });
  atlas.markerManager = markerManager;
  const markerUI = new MarkerUI(atlas, markerManager);
  markerUI.createGroupControls();

  // Показать группы по имени из CSV (подставьте свои имена из visible_groups.csv)
  const groups = atlas.csvManager.getAllGroups();
  if (groups.length > 0) atlas.showGroup(groups[0].rawName);
  if (groups.length > 4) atlas.showGroup(groups[4].rawName);

  // Пример: скрыть группу
  // atlas.hideGroup('Имя_группы');

  // Пример: показать/скрыть один элемент по имени из модели
  // atlas.showItem('Humerus_L');
  // atlas.hideElement('Clavicle_R');

  // Пример: материал группы — цвет (строка или число) и опции
  // atlas.applyMaterialToGroup('Мышцы', '#e0a0a0', { metalness: 0.1, roughness: 0.6 });
  // atlas.applyMaterialToGroup('Скелет', 0xdddddd);

  // Пример: маркеры по координатам "x y z" и группа
  markerManager.ensureMarkerGroup('Пример');
  markerManager.addMarkerFromCoordinates('0.5 0.2 0.1', {
    color: 0xff0000,
    markerGroup: 'Пример'
  });

  atlas.focusOnModel();

  window.atlas = atlas;
  window.markerManager = markerManager;
  window.markerUI = markerUI;
} catch (err) {
  console.error('Ошибка загрузки:', err);
  document.getElementById('info').textContent = 'Ошибка: ' + err.message;
}
