import CSVGroupsManager, {
  isNumberedGroup,
  isEditableSubgroup,
  toDisplayName,
  toRawName,
  parseCSVLine,
  parseCSV,
  serializeCSV,
  selectFile,
  createSceneConsoleAPI
} from './body-atlas.js';

// Экспортируем всё, что нужно пользователям
export {
  CSVGroupsManager,
  isNumberedGroup,
  isEditableSubgroup,
  toDisplayName,
  toRawName,
  parseCSVLine,
  parseCSV,
  serializeCSV,
  selectFile,
  createSceneConsoleAPI
};

// Экспорт по умолчанию для удобства
export default CSVGroupsManager;