// main.js — точка входа для CDN
import { CSVGroupsManager } from './csv-groups.js';
import { AtlasScene } from './AtlasScene.js';
import {MarkerManager} from './MarkerManager.js'
import {MarkerUI} from './MarkerUI.js'

// Реэкспортируем всё
export { CSVGroupsManager, AtlasScene, MarkerManager, MarkerUI };
export * from './csv-groups.js';

// Для обратной совместимости
export default { CSVGroupsManager, AtlasScene, MarkerManager, MarkerUI };