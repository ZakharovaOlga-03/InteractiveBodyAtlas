// main.js — точка входа для CDN
import { CSVGroupsManager } from './csv-groups.js';
import { AtlasScene } from './AtlasScene.js';

// Реэкспортируем всё
export { CSVGroupsManager, AtlasScene };
export * from './csv-groups.js';

// Для обратной совместимости
export default { CSVGroupsManager, AtlasScene };