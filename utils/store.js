const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 获取数据文件路径
function getDataPath(type) {
  return path.join(DATA_DIR, `${type}.json`);
}

// 读取JSON文件
function readJSON(type) {
  const filePath = getDataPath(type);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`读取 ${type} 数据失败:`, err.message);
    return [];
  }
}

// 写入JSON文件
function writeJSON(type, data) {
  const filePath = getDataPath(type);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error(`写入 ${type} 数据失败:`, err.message);
    return false;
  }
}

// 通用CRUD操作
const store = {
  // 获取所有记录
  getAll(type) {
    return readJSON(type);
  },

  // 根据ID获取
  getById(type, id) {
    const items = readJSON(type);
    return items.find(item => item.id === id);
  },

  // 创建记录
  create(type, item) {
    const items = readJSON(type);
    items.push(item);
    writeJSON(type, items);
    return item;
  },

  // 更新记录
  update(type, id, updates) {
    const items = readJSON(type);
    const index = items.findIndex(item => item.id === id);
    if (index === -1) return null;
    items[index] = { ...items[index], ...updates };
    writeJSON(type, items);
    return items[index];
  },

  // 删除记录
  delete(type, id) {
    const items = readJSON(type);
    const filtered = items.filter(item => item.id !== id);
    writeJSON(type, filtered);
    return filtered.length !== items.length;
  },

  // 按条件查询
  query(type, filterFn) {
    const items = readJSON(type);
    return items.filter(filterFn);
  },

  // 按日期范围查询
  queryByDateRange(type, startDate, endDate, dateField = 'date') {
    const items = readJSON(type);
    return items.filter(item => {
      const itemDate = item[dateField];
      return itemDate >= startDate && itemDate <= endDate;
    });
  }
};

module.exports = { store, getDataPath, DATA_DIR };
