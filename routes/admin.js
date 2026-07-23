const express = require('express');
const router = express.Router();
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const { successResponse, errorResponse, todayStr, getRecentDays, daysBetween } = require('../utils/helpers');
const { store } = require('../utils/store');
const userConfig = require('../config/user');
const { sendNotification } = require('../utils/notifier');

// ===== 操作日志 =====

// 记录操作日志
function logAction(req, module, summary) {
  try {
    const log = {
      id: uuidv4(),
      type: 'admin_log',
      method: req.method,
      path: req.path,
      module: module || 'unknown',
      summary: summary || req.path,
      ip: req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || '',
      body: sanitizeBody(req.body),
      date: todayStr(),
      time: moment().format('HH:mm:ss'),
      createdAt: new Date().toISOString()
    };
    // 使用文件直写，避免递归触发
    const fs = require('fs');
    const path = require('path');
    const dataPath = path.join(__dirname, '..', 'data', 'admin_logs.json');
    let logs = [];
    try {
      const raw = fs.readFileSync(dataPath, 'utf-8');
      logs = JSON.parse(raw);
    } catch (e) { logs = []; }
    logs.push(log);
    // 保留最近 5000 条
    if (logs.length > 5000) {
      logs = logs.slice(-5000);
    }
    fs.writeFileSync(dataPath, JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error('[操作日志] 写入失败:', err.message);
  }
}

// 脱敏 body
function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return body;
  const sensitive = ['password', 'token', 'secret'];
  const sanitized = { ...body };
  for (const key of sensitive) {
    if (sanitized[key]) sanitized[key] = '***';
  }
  return sanitized;
}

// 获取操作日志
router.get('/log', (req, res) => {
  try {
    const { module, method, startDate, endDate, limit = 100, offset = 0 } = req.query;
    const fs = require('fs');
    const path = require('path');
    const dataPath = path.join(__dirname, '..', 'data', 'admin_logs.json');

    let logs = [];
    try {
      const raw = fs.readFileSync(dataPath, 'utf-8');
      logs = JSON.parse(raw);
    } catch (e) { logs = []; }

    // 过滤
    if (module) {
      logs = logs.filter(l => l.module === module);
    }
    if (method) {
      logs = logs.filter(l => l.method === method.toUpperCase());
    }
    if (startDate) {
      logs = logs.filter(l => l.date >= startDate);
    }
    if (endDate) {
      logs = logs.filter(l => l.date <= endDate);
    }

    // 按时间倒序
    logs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    const total = logs.length;
    const paginated = logs.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    return res.json(successResponse({
      logs: paginated,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    }));
  } catch (err) {
    return res.json(errorResponse('获取日志失败: ' + err.message));
  }
});

// 清空操作日志
router.delete('/log', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const dataPath = path.join(__dirname, '..', 'data', 'admin_logs.json');
    fs.writeFileSync(dataPath, '[]');
    return res.json(successResponse(null, '操作日志已清空'));
  } catch (err) {
    return res.json(errorResponse('清空失败: ' + err.message));
  }
});

// 所有模块定义
const ALL_MODULES = [
  { name: 'weather', label: '天气助手', icon: '🌤️', enabled: true },
  { name: 'schedule', label: '动态日程', icon: '📅', enabled: true },
  { name: 'finance', label: '财务管理', icon: '💰', enabled: true },
  { name: 'habit', label: '习惯打卡', icon: '✅', enabled: true },
  { name: 'health', label: '健康管理', icon: '💪', enabled: true },
  { name: 'pet', label: '宠物护理', icon: '🐱', enabled: true },
  { name: 'chores', label: '家务引擎', icon: '🧹', enabled: true },
  { name: 'inventory', label: '库存买菜', icon: '🛒', enabled: true },
  { name: 'social', label: '社交人脉', icon: '👥', enabled: true },
  { name: 'work', label: '工作引擎', icon: '💼', enabled: true },
  { name: 'photo', label: '摄影学习', icon: '📷', enabled: true },
  { name: 'reading', label: '阅读模块', icon: '📚', enabled: true },
  { name: 'wish', label: '愿望清单', icon: '🎯', enabled: true },
  { name: 'joy', label: '成就小确幸', icon: '🎉', enabled: true },
  { name: 'inbox', label: '闪念笔记', icon: '📝', enabled: true },
  { name: 'todayQuestion', label: '今日之问', icon: '❓', enabled: true },
  { name: 'emotion', label: '情绪管理', icon: '😊', enabled: true }
];

// 获取所有模块状态
router.get('/skills', (req, res) => {
  try {
    const settings = store.getAll('settings');
    const disabledModules = settings
      .filter(s => s.key === 'module_disabled' && s.value === 'true')
      .map(s => s.moduleName);

    const modulesWithStatus = ALL_MODULES.map(mod => ({
      ...mod,
      enabled: !disabledModules.includes(mod.name)
    }));

    // 统计每个模块的数据量
    const dataCounts = {
      finance: store.getAll('finance').length,
      habit: store.getAll('habits').length,
      health: store.getAll('health').length,
      pet: store.getAll('pets').length,
      inventory: store.getAll('inventory').length,
      social: store.getAll('social').length,
      work: store.getAll('work').length,
      photo: store.getAll('photos').length,
      reading: store.getAll('reading').length,
      wish: store.getAll('wishes').length,
      joy: store.getAll('joys').length,
      inbox: store.getAll('inbox').length,
      tasks: store.getAll('tasks').length,
      chore_records: store.getAll('chore_records').length,
      emotions: store.getAll('emotions').length
    };

    return res.json(successResponse({
      modules: modulesWithStatus,
      totalModules: modulesWithStatus.length,
      enabledCount: modulesWithStatus.filter(m => m.enabled).length,
      dataCounts,
      currentMode: userConfig.currentWorkMode
    }));
  } catch (err) {
    return res.json(errorResponse('获取模块状态失败: ' + err.message));
  }
});

// 开关模块
router.post('/skill/:name/toggle', (req, res) => {
  try {
    const { name } = req.params;
    const { enabled } = req.body;

    const module = ALL_MODULES.find(m => m.name === name);
    if (!module) {
      return res.json(errorResponse('模块不存在'));
    }

    const settings = store.getAll('settings');
    let setting = settings.find(s => s.key === 'module_disabled' && s.moduleName === name);

    if (enabled) {
      // 启用：删除禁用设置
      if (setting) {
        store.delete('settings', setting.id);
      }
    } else {
      // 禁用：添加禁用设置
      if (!setting) {
        store.create('settings', {
          id: uuidv4(),
          key: 'module_disabled',
          moduleName: name,
          value: 'true',
          createdAt: new Date().toISOString()
        });
      }
    }

    return res.json(successResponse({
      module: name,
      enabled: !!enabled
    }, `模块已${enabled ? '启用' : '禁用'}`));
  } catch (err) {
    return res.json(errorResponse('操作失败: ' + err.message));
  }
});

// 获取跨模块规则
router.get('/rules', (req, res) => {
  try {
    const rules = store.getAll('rules') || [];
    return res.json(successResponse({ rules, total: rules.length }));
  } catch (err) {
    return res.json(errorResponse('获取规则失败: ' + err.message));
  }
});

// 添加跨模块规则
router.post('/rule', (req, res) => {
  try {
    const { name, condition, action, description, enabled = true } = req.body;

    if (!name || !condition || !action) {
      return res.json(errorResponse('请填写规则名称、条件和动作'));
    }

    const rule = {
      id: uuidv4(),
      name,
      description: description || '',
      condition, // JSON 条件
      action,    // JSON 动作
      enabled,
      createdAt: new Date().toISOString()
    };

    const rules = store.getAll('rules') || [];
    rules.push(rule);
    store.create('rules', rule);

    return res.json(successResponse(rule, '规则已添加'));
  } catch (err) {
    return res.json(errorResponse('添加失败: ' + err.message));
  }
});

// 执行规则检查
router.post('/rules/check', async (req, res) => {
  try {
    const results = await checkAllRules();
    return res.json(successResponse({
      triggered: results.filter(r => r.triggered),
      total: results.length,
      results
    }, `检查完成，触发${results.filter(r => r.triggered).length}条规则`));
  } catch (err) {
    return res.json(errorResponse('检查失败: ' + err.message));
  }
});

// 检查所有规则
async function checkAllRules() {
  const results = [];
  const today = todayStr();

  // 规则a: 日支出超近7日1.5倍，晚8点提醒
  try {
    const financeRecords = store.getAll('finance');
    const expenses = financeRecords.filter(f => f.type === 'expense');

    const recent7Days = getRecentDays(7);
    const recentExpenses = expenses.filter(e => recent7Days.includes(e.date));
    const dailyTotals = {};
    recent7Days.forEach(d => {
      dailyTotals[d] = expenses
        .filter(e => e.date === d)
        .reduce((s, e) => s + parseFloat(e.amount || 0), 0);
    });

    const avgDaily = recentExpenses.length > 0
      ? recentExpenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0) / 7
      : 0;

    const todayExpense = dailyTotals[today] || 0;
    const triggered = todayExpense > avgDaily * 1.5 && avgDaily > 0;

    if (triggered) {
      await sendNotification(
        '💰 支出超标提醒',
        `今日支出${todayExpense.toFixed(0)}元，超过近7日均值${avgDaily.toFixed(0)}元的1.5倍，注意控制开销哦~`
      );
    }

    results.push({
      rule: 'a',
      name: '日支出超标提醒',
      triggered,
      data: { todayExpense, avgDaily, ratio: todayExpense / (avgDaily || 1) }
    });
  } catch (e) {
    results.push({ rule: 'a', name: '日支出超标提醒', triggered: false, error: e.message });
  }

  // 规则b: 连续3天无小确幸，推送鼓励
  try {
    const joys = store.getAll('joys');
    const joyDays = new Set(joys.filter(j => j.joyType === 'joy').map(j => j.date));

    let streak = 0;
    for (let i = 2; i >= 0; i--) {
      const date = moment().subtract(i, 'days').format('YYYY-MM-DD');
      if (!joyDays.has(date)) streak++;
    }

    const triggered = streak >= 3;
    if (triggered) {
      await sendNotification(
        '💛 小确幸提醒',
        '已经连续3天没有记录小确幸啦~ 今天有什么让你开心的小事吗？记得记录下来哦！'
      );
    }

    results.push({
      rule: 'b',
      name: '连续无小确幸提醒',
      triggered,
      data: { streak }
    });
  } catch (e) {
    results.push({ rule: 'b', name: '连续无小确幸提醒', triggered: false, error: e.message });
  }

  // 规则d: 48h未跟进客户，加入提醒
  try {
    const workRecords = store.getAll('work');
    const clients = workRecords.filter(w => w.workType === 'client' && w.status !== 'deal' && w.status !== 'lost');

    const needFollowUp = clients.filter(c => {
      const days = daysBetween(c.lastContact, today);
      return days >= 2;
    });

    const triggered = needFollowUp.length > 0;
    if (triggered) {
      const names = needFollowUp.slice(0, 3).map(c => c.name).join('、');
      await sendNotification(
        '📋 客户跟进提醒',
        `有${needFollowUp.length}位客户超过48小时未跟进：${names}${needFollowUp.length > 3 ? '...' : ''}，记得联系哦！`
      );
    }

    results.push({
      rule: 'd',
      name: '客户48h未跟进提醒',
      triggered,
      data: { count: needFollowUp.length, clients: needFollowUp.map(c => c.name) }
    });
  } catch (e) {
    results.push({ rule: 'd', name: '客户48h未跟进提醒', triggered: false, error: e.message });
  }

  // 规则e: 家人互动带"急躁"标签后，下次来访前提醒"深呼吸"
  try {
    const socialRecords = store.getAll('social');
    const impatientInteractions = socialRecords.filter(s =>
      s.interactionType === 'interaction' && s.hasImpatient &&
      daysBetween(s.date, today) <= 7
    );

    const triggered = impatientInteractions.length > 0;
    // 这个规则比较特殊，实际应该在下次互动前触发，这里只检查是否有需要注意的
    results.push({
      rule: 'e',
      name: '急躁互动后深呼吸提醒',
      triggered: false, // 不主动推送，仅记录
      data: { recentImpatientCount: impatientInteractions.length }
    });
  } catch (e) {
    results.push({ rule: 'e', name: '急躁互动后深呼吸提醒', triggered: false, error: e.message });
  }

  // 规则f: 连续两天未在07:50前完成出门打卡，推送作息提醒
  try {
    const habits = store.getAll('habits');
    const wakeUpRecords = habits.filter(h => h.habitType === 'wake_up');

    let lateCount = 0;
    for (let i = 1; i <= 2; i++) {
      const date = moment().subtract(i, 'days').format('YYYY-MM-DD');
      const record = wakeUpRecords.find(r => r.date === date);
      // 如果没有记录，或者起床时间晚于07:50
      if (!record || record.time > '07:50') {
        lateCount++;
      }
    }

    const triggered = lateCount >= 2;
    if (triggered) {
      await sendNotification(
        '⏰ 作息提醒',
        '连续两天没能在07:50前完成出门准备，注意早点休息，调整作息哦~'
      );
    }

    results.push({
      rule: 'f',
      name: '出门迟到提醒',
      triggered,
      data: { lateDays: lateCount }
    });
  } catch (e) {
    results.push({ rule: 'f', name: '出门迟到提醒', triggered: false, error: e.message });
  }

  // 规则g: 连续2天情绪出现"急躁"标签，下次家人来访前15分钟推送提醒
  try {
    const emotionRecords = store.getAll('emotions');
    let impatientStreak = 0;

    for (let i = 1; i <= 2; i++) {
      const date = moment().subtract(i, 'days').format('YYYY-MM-DD');
      const dayEmotions = emotionRecords.filter(e => e.date === date);
      const hasImpatient = dayEmotions.some(e =>
        (e.tags || []).some(t => t.includes('急躁'))
      );
      if (hasImpatient) {
        impatientStreak++;
      }
    }

    // 检查是否有未来家人来访安排（在日程/社交中查找）
    const socialRecords = store.getAll('social');
    const upcomingFamilyVisit = socialRecords.find(s => {
      if (s.interactionType !== 'interaction') return false;
      // 检查是否与家人相关且有下次约定
      const isFamily = ['家人', '父母', '亲人'].includes(s.relatedPerson) ||
        (s.contactName && ['家人', '父母', '亲人'].some(k => s.contactName.includes(k)));
      if (!isFamily) return false;
      // 检查下次约定是否在15分钟内
      if (s.nextAppointment) {
        const apptTime = moment(s.nextAppointment, 'YYYY-MM-DD HH:mm');
        const diffMins = apptTime.diff(moment(), 'minutes');
        return diffMins > 0 && diffMins <= 15;
      }
      return false;
    });

    const triggered = impatientStreak >= 2 && upcomingFamilyVisit;

    if (triggered) {
      await sendNotification(
        '💜 茄子管家提醒',
        '家人是充电站，做几次深呼吸再出门~ 连续2天情绪有些急躁，今天见家人前先调整好状态哦！'
      );
    }

    results.push({
      rule: 'g',
      name: '情绪急躁家人来访提醒',
      triggered,
      data: {
        impatientStreak,
        hasUpcomingFamilyVisit: !!upcomingFamilyVisit,
        visitInfo: upcomingFamilyVisit ? upcomingFamilyVisit.nextAppointment : null
      }
    });
  } catch (e) {
    results.push({ rule: 'g', name: '情绪急躁家人来访提醒', triggered: false, error: e.message });
  }

  return results;
}

// 获取系统概览
router.get('/overview', (req, res) => {
  try {
    const today = todayStr();

    const overview = {
      today,
      finance: {
        todayExpense: store.getAll('finance')
          .filter(f => f.type === 'expense' && f.date === today)
          .reduce((s, f) => s + parseFloat(f.amount || 0), 0),
        thisMonthIncome: store.getAll('finance')
          .filter(f => f.type === 'income' && f.date.startsWith(today.substring(0, 7)))
          .reduce((s, f) => s + parseFloat(f.amount || 0), 0)
      },
      habits: {
        todayCompleted: new Set(
          store.getAll('habits').filter(h => h.date === today).map(h => h.habitType)
        ).size
      },
      tasks: {
        todayTotal: store.getAll('tasks').filter(t => t.date === today).length,
        todayDone: store.getAll('tasks').filter(t => t.date === today && t.status === 'done').length
      },
      joy: {
        thisMonthJoys: store.getAll('joys')
          .filter(j => j.joyType === 'joy' && j.date.startsWith(today.substring(0, 7))).length
      },
      reading: {
        todayRead: store.getAll('reading')
          .some(r => r.readingType === 'log' && r.date === today)
      },
      inbox: {
        unprocessed: store.getAll('inbox').filter(n => !n.processed).length
      }
    };

    return res.json(successResponse(overview));
  } catch (err) {
    return res.json(errorResponse('获取概览失败: ' + err.message));
  }
});

// 初始化默认规则
function initDefaultRules() {
  const existingRules = store.getAll('rules') || [];
  if (existingRules.length > 0) return;

  const defaultRules = [
    {
      id: uuidv4(),
      name: '日支出超标提醒',
      description: '日支出超近7日1.5倍，晚8点提醒',
      condition: { type: 'expense_exceed_avg', ratio: 1.5, days: 7 },
      action: { type: 'notification', title: '支出超标', time: '20:00' },
      enabled: true,
      builtin: true,
      createdAt: new Date().toISOString()
    },
    {
      id: uuidv4(),
      name: '连续无小确幸提醒',
      description: '连续3天无小确幸，推送鼓励',
      condition: { type: 'no_joy_streak', days: 3 },
      action: { type: 'notification', title: '小确幸提醒' },
      enabled: true,
      builtin: true,
      createdAt: new Date().toISOString()
    },
    {
      id: uuidv4(),
      name: '客户48h未跟进提醒',
      description: '48h未跟进客户，加入提醒',
      condition: { type: 'client_no_followup', hours: 48 },
      action: { type: 'add_task', category: '工作' },
      enabled: true,
      builtin: true,
      createdAt: new Date().toISOString()
    },
    {
      id: uuidv4(),
      name: '急躁互动深呼吸提醒',
      description: '家人互动带"急躁"标签后，下次来访前提醒',
      condition: { type: 'impatient_interaction' },
      action: { type: 'notification', title: '深呼吸提醒' },
      enabled: true,
      builtin: true,
      createdAt: new Date().toISOString()
    },
    {
      id: uuidv4(),
      name: '出门迟到提醒',
      description: '连续两天未在07:50前完成出门打卡',
      condition: { type: 'late_leave_streak', days: 2, deadline: '07:50' },
      action: { type: 'notification', title: '作息提醒' },
      enabled: true,
      builtin: true,
      createdAt: new Date().toISOString()
    },
    {
      id: uuidv4(),
      name: '情绪急躁家人来访提醒',
      description: '连续2天出现"急躁"标签，下次家人来访前15分钟推送深呼吸提醒',
      condition: { type: 'emotion_impatient_streak', days: 2, tags: ['急躁'] },
      action: { type: 'notification', title: '茄子管家提醒', trigger: 'family_visit_15min_before' },
      enabled: true,
      builtin: true,
      createdAt: new Date().toISOString()
    }
  ];

  defaultRules.forEach(rule => store.create('rules', rule));
  console.log('[管理员] 默认规则已初始化');
}

const adminExports = { router, initDefaultRules, checkAllRules, logAction };

module.exports = adminExports;
