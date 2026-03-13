/**
 * main.js — точка входа и реэкспорт модулей для CDN/приложения.
 *
 * Подключает CSVGroupsManager, AtlasScene, MarkerManager, MarkerUI и реэкспортирует
 * всё из csv-groups.js. Экспорт по умолчанию — объект с ключами CSVGroupsManager,
 * AtlasScene, MarkerManager, MarkerUI для обратной совместимости.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ОГЛАВЛЕНИЕ
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ИМПОРТЫ
 *   CSVGroupsManager, AtlasScene, MarkerManager, MarkerUI — из соответствующих модулей
 *
 * ЭКСПОРТЫ
 *   export { CSVGroupsManager, AtlasScene, MarkerManager, MarkerUI }
 *   export * from '.../csv-groups.js' (CDN) — все экспорты csv-groups (функции, класс)
 *   export default { CSVGroupsManager, AtlasScene, MarkerManager, MarkerUI }
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { CSVGroupsManager } from 'https://cdn.jsdelivr.net/gh/ZakharovaOlga-03/InteractiveBodyAtlas@main/csv-groups.js';
import { AtlasScene } from 'https://cdn.jsdelivr.net/gh/ZakharovaOlga-03/InteractiveBodyAtlas@main/AtlasScene.js';
import { MarkerManager } from 'https://cdn.jsdelivr.net/gh/ZakharovaOlga-03/InteractiveBodyAtlas@main/MarkerManager.js';
import { MarkerUI } from 'https://cdn.jsdelivr.net/gh/ZakharovaOlga-03/InteractiveBodyAtlas@main/MarkerUI.js';

// Реэкспортируем всё
export { CSVGroupsManager, AtlasScene, MarkerManager, MarkerUI };
export * from 'https://cdn.jsdelivr.net/gh/ZakharovaOlga-03/InteractiveBodyAtlas@main/csv-groups.js';

// Для обратной совместимости
export default { CSVGroupsManager, AtlasScene, MarkerManager, MarkerUI };