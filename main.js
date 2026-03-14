/**
 * Точка входа приложения. Подключается из index.html:
 * - по file:// — с CDN (обход CORS при двойном клике по index.html);
 * - по http(s) — локально (./main.js), чтобы выполнялся ваш код.
 */
import { AtlasScene } from './AtlasScene.js';
import { MarkerManager } from './MarkerManager.js';
import { MarkerUI } from './MarkerUI.js';

const atlas = new AtlasScene('canvas-container', {
  modelBaseUrl: 'https://cdn.jsdelivr.net/gh/ZakharovaOlga-03/InteractiveBodyAtlas@restructure/models/',
  csvBaseUrl: 'https://cdn.jsdelivr.net/gh/ZakharovaOlga-03/InteractiveBodyAtlas@restructure/'
});

try {
  await atlas.loadModel('p1.glb', 0);
  console.log('✅ Model 1 loaded');

  await atlas.loadModel('p2.glb', 1);
  console.log('✅ Model 2 loaded');

  await atlas.loadModel('p3.glb', 2);
  console.log('✅ Model 3 loaded');

  await atlas.loadModel('p4.glb', 3);
  console.log('✅ Model 4 loaded');

  await atlas.loadModel('p5.glb', 4);
  console.log('✅ Model 5 loaded');

  await atlas.loadModel('p6.glb', 5);
  console.log('✅ Model 6 loaded');

  await atlas.loadModel('p7.glb', 6);
  console.log('✅ Model 7 loaded');

  await atlas.loadModel('p8.glb', 7);
  console.log('✅ Model 8 loaded');

  await atlas.loadCsv('visible_groups.csv');
  console.log('✅ CSV loaded');

  const markerManager = new MarkerManager({
    scene: atlas.scene,
    atlas: atlas
  });

  atlas.markerManager = markerManager;

  const markerUI = new MarkerUI(atlas, markerManager);
  markerUI.createGroupControls();

  const groups = atlas.csvManager.getAllGroups();
  if (groups.length > 0) {
    atlas.showGroup(groups[0].rawName);
    if (groups.length > 4) atlas.showGroup(groups[4].rawName);
  }

  window.atlas = atlas;
  window.markerManager = markerManager;
  window.markerUI = markerUI;

} catch (error) {
  console.error('❌ Error loading assets:', error);
  document.getElementById('info').textContent = 'Ошибка загрузки: ' + error.message;
}
