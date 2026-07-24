const express = require('express');
const router = express.Router();
const CryptoJS = require('crypto-js');
const fs = require('fs');
const { successResponse, errorResponse } = require('../utils/helpers');
const { getDataPath } = require('../utils/store');
const userConfig = require('../config/user');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'eggplant-butler-encryption-key-2026';
const SETTINGS_FILE = getDataPath('settings');

// ===== 工具函数 =====

// 读取设置文件（整体 JSON 对象）
function readSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[设置] 读取失败:', err.message);
    return {};
  }
}

// 写入设置文件
function writeSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('[设置] 写入失败:', err.message);
    return false;
  }
}

// AES 加密
function encrypt(text) {
  return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
}

// AES 解密
function decrypt(cipherText) {
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (err) {
    return '';
  }
}

// 验证密码是否正确
function verifyPassword(plainPassword, encryptedPassword) {
  if (!encryptedPassword) {
    // 还没有设置过密码，使用 userConfig 中的默认密码验证
    return plainPassword === userConfig.accessPassword;
  }
  const decrypted = decrypt(encryptedPassword);
  return plainPassword === decrypted;
}

// ===== 路由 =====

// GET /api/settings - 获取所有设置
router.get('/', (req, res) => {
  const settings = readSettings();
  // 不返回密码原文，只标记是否已设置
  const safeSettings = { ...settings };
  if (safeSettings.access_password) {
    safeSettings.access_password = '******';
    safeSettings.has_password = true;
  } else {
    safeSettings.has_password = !!userConfig.accessPassword;
  }
  res.json(successResponse(safeSettings));
});

// PUT /api/settings/password - 修改密码
router.put('/password', (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return res.status(400).json(errorResponse('请提供旧密码和新密码'));
  }

  if (newPassword.length < 6) {
    return res.status(400).json(errorResponse('新密码长度不能少于6位'));
  }

  const settings = readSettings();
  const storedPassword = settings.access_password;

  // 验证旧密码
  if (!verifyPassword(oldPassword, storedPassword)) {
    return res.status(403).json(errorResponse('旧密码错误'));
  }

  // 加密新密码并存入
  settings.access_password = encrypt(newPassword);
  settings.passwordUpdatedAt = new Date().toISOString();

  if (writeSettings(settings)) {
    res.json(successResponse(null, '密码修改成功'));
  } else {
    res.status(500).json(errorResponse('密码保存失败'));
  }
});

// PUT /api/settings/profile - 修改个人偏好
router.put('/profile', (req, res) => {
  const allowedFields = [
    'wakeUpTime',
    'leaveByTime',
    'workHours',
    'overtimeHours',
    'commuteMinutes',
    'lunchBreak',
    'petName',
    'washHairCycleDays',
    'laundryCycle',
    'bedsheetCycle',
    'mopCycle',
    'fridgeCheckCycleDays',
    'lunarBirthday',
    'periodCycleDays',
    'currentWorkMode',
    'defaultReadingTime',
    'dailyWaterGoal',
    'hotWeatherWaterGoal',
    'quietHours'
  ];

  const updates = {};
  for (const key of allowedFields) {
    if (req.body[key] !== undefined) {
      updates[key] = req.body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json(errorResponse('没有可更新的字段'));
  }

  const settings = readSettings();
  settings.profile = { ...(settings.profile || {}), ...updates };
  settings.profileUpdatedAt = new Date().toISOString();

  if (writeSettings(settings)) {
    res.json(successResponse(settings.profile, '个人偏好已更新'));
  } else {
    res.status(500).json(errorResponse('个人偏好保存失败'));
  }
});

// PUT /api/settings/security - 安全设置
router.put('/security', (req, res) => {
  const { tokenExpiry, allowLegacyHeader } = req.body;

  const settings = readSettings();
  settings.security = settings.security || {};

  if (tokenExpiry !== undefined) {
    // 校验 token 过期时间格式（如 '24h', '7d', '30m'）
    const validPattern = /^\d+(h|d|m|s)$/;
    if (typeof tokenExpiry === 'string' && validPattern.test(tokenExpiry)) {
      settings.security.tokenExpiry = tokenExpiry;
    } else {
      return res.status(400).json(errorResponse('tokenExpiry 格式无效，如 24h、7d、30m'));
    }
  }

  if (allowLegacyHeader !== undefined) {
    if (typeof allowLegacyHeader === 'boolean') {
      settings.security.allowLegacyHeader = allowLegacyHeader;
    } else {
      return res.status(400).json(errorResponse('allowLegacyHeader 必须为布尔值'));
    }
  }

  settings.securityUpdatedAt = new Date().toISOString();

  if (writeSettings(settings)) {
    res.json(successResponse(settings.security, '安全设置已更新'));
  } else {
    res.status(500).json(errorResponse('安全设置保存失败'));
  }
});

// GET /api/settings/meal-plan - 获取膳食计划
router.get('/meal-plan', (req, res) => {
  const settings = readSettings();
  const defaultMealPlan = {
    milk: {
      enabled: true,
      dailyAmount: 250,       // 毫升
      time: '07:00'
    },
    egg: {
      enabled: true,
      dailyCount: 1,
      time: '07:30'
    },
    waterGoal: {
      dailyTarget: 2000,      // 毫升
      reminders: ['09:00', '11:00', '14:00', '16:00', '19:00']
    },
    fruit: {
      enabled: true,
      dailyServings: 2,
      preferredTypes: []
    },
    meals: {
      breakfast: { time: '07:30', description: '' },
      lunch: { time: '12:00', description: '' },
      dinner: { time: '18:30', description: '' }
    },
    snacks: {
      enabled: true,
      times: ['10:00', '15:30']
    }
  };

  const mealPlan = settings.mealPlan || defaultMealPlan;
  res.json(successResponse(mealPlan));
});

// PUT /api/settings/meal-plan - 更新膳食计划
router.put('/meal-plan', (req, res) => {
  const allowedSections = ['milk', 'egg', 'waterGoal', 'fruit', 'meals', 'snacks'];

  const updates = {};
  for (const section of allowedSections) {
    if (req.body[section] !== undefined) {
      updates[section] = req.body[section];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json(errorResponse('没有可更新的膳食字段'));
  }

  const settings = readSettings();
  settings.mealPlan = { ...(settings.mealPlan || {}), ...updates };
  settings.mealPlanUpdatedAt = new Date().toISOString();

  if (writeSettings(settings)) {
    res.json(successResponse(settings.mealPlan, '膳食计划已更新'));
  } else {
    res.status(500).json(errorResponse('膳食计划保存失败'));
  }
});

module.exports = router;
