const express = require('express');
const router = express.Router();
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const { successResponse, errorResponse, todayStr, nowTimeStr, daysBetween } = require('../utils/helpers');
const { store } = require('../utils/store');
const userConfig = require('../config/user');

// 获取今日待做家务
router.get('/due', (req, res) => {
  try {
    const today = todayStr();
    const mode = getCurrentMode();
    const records = store.getAll('chore_records');

    const chores = [];

    // 定义家务类型和周期
    const choreTypes = [
      {
        type: 'laundry',
        label: '洗衣服',
        icon: '🧺',
        cycle: userConfig.laundryCycle[mode],
        category: '衣物'
      },
      {
        type: 'bedsheet',
        label: '换床单被套',
        icon: '🛏️',
        cycle: userConfig.bedsheetCycle[mode],
        category: '卧室'
      },
      {
        type: 'mop',
        label: '拖地',
        icon: '🧹',
        cycle: userConfig.mopCycle[mode],
        category: '清洁'
      },
      {
        type: 'trash',
        label: '倒垃圾',
        icon: '🗑️',
        cycle: 1,
        category: '日常'
      },
      {
        type: 'fridge_check',
        label: '检查冰箱',
        icon: '🧊',
        cycle: userConfig.fridgeCheckCycleDays,
        category: '厨房'
      },
      {
        type: 'cat_litter',
        label: `铲猫砂（${userConfig.petName}）`,
        icon: '🐱',
        cycle: 1,
        category: '宠物'
      }
    ];

    for (const chore of choreTypes) {
      const typeRecords = records
        .filter(r => r.type === chore.type)
        .sort((a, b) => b.date.localeCompare(a.date));

      const lastDone = typeRecords[0];
      const lastDate = lastDone ? lastDone.date : null;
      const daysSince = lastDate ? daysBetween(lastDate, today) : chore.cycle;
      const isDue = daysSince >= chore.cycle;

      chores.push({
        id: `chore_${chore.type}`,
        type: chore.type,
        label: chore.label,
        icon: chore.icon,
        category: chore.category,
        cycleDays: chore.cycle,
        lastDoneDate: lastDate,
        daysSinceLast: daysSince,
        isDue,
        overdueDays: isDue ? daysSince - chore.cycle : 0,
        priority: isDue ? (daysSince > chore.cycle + 1 ? 'high' : 'medium') : 'low',
        nextDueDate: lastDate
          ? moment(lastDate).add(chore.cycle, 'days').format('YYYY-MM-DD')
          : today
      });
    }

    // 按优先级和逾期天数排序
    chores.sort((a, b) => {
      if (a.isDue !== b.isDue) return a.isDue ? -1 : 1;
      return b.overdueDays - a.overdueDays || b.daysSinceLast - a.daysSinceLast;
    });

    const dueChores = chores.filter(c => c.isDue);

    return res.json(successResponse({
      date: today,
      mode,
      chores,
      dueCount: dueChores.length,
      dueChores,
      totalCount: chores.length
    }));
  } catch (err) {
    return res.json(errorResponse('获取家务失败: ' + err.message));
  }
});

// 设置忙/闲模式
router.post('/set-mode', (req, res) => {
  try {
    const { mode } = req.body;

    if (!['busy', 'normal'].includes(mode)) {
      return res.json(errorResponse('模式必须是 busy 或 normal'));
    }

    // 存储模式设置
    const settings = store.getAll('settings');
    let modeSetting = settings.find(s => s.key === 'chore_mode');

    if (modeSetting) {
      store.update('settings', modeSetting.id, { value: mode, updatedAt: new Date().toISOString() });
    } else {
      store.create('settings', {
        id: uuidv4(),
        key: 'chore_mode',
        value: mode,
        createdAt: new Date().toISOString()
      });
    }

    return res.json(successResponse({ mode }, `模式已切换为${mode === 'busy' ? '忙碌' : '正常'}`));
  } catch (err) {
    return res.json(errorResponse('切换模式失败: ' + err.message));
  }
});

// 标记家务完成
router.post('/:id/complete', (req, res) => {
  try {
    const { id } = req.params;
    const { type, date, time, notes } = req.body;

    const record = {
      id: uuidv4(),
      type: type || id.replace('chore_', ''),
      choreId: id,
      title: `完成家务: ${type || id}`,
      date: date || todayStr(),
      time: time || nowTimeStr(),
      status: 'done',
      notes: notes || '',
      createdAt: new Date().toISOString()
    };

    const result = store.create('chore_records', record);
    return res.json(successResponse(result, '家务已标记完成'));
  } catch (err) {
    return res.json(errorResponse('操作失败: ' + err.message));
  }
});

// 获取家务历史记录
router.get('/history', (req, res) => {
  try {
    const { type, limit = 30 } = req.query;
    let records = store.getAll('chore_records');

    if (type) {
      records = records.filter(r => r.type === type);
    }

    records.sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));

    return res.json(successResponse({
      records: records.slice(0, parseInt(limit)),
      total: records.length
    }));
  } catch (err) {
    return res.json(errorResponse('获取历史失败: ' + err.message));
  }
});

// 获取当前模式
function getCurrentMode() {
  const settings = store.getAll('settings');
  const modeSetting = settings.find(s => s.key === 'chore_mode');
  if (modeSetting) return modeSetting.value;

  // 根据工作模式推断
  if (userConfig.currentWorkMode === 'sales') return 'busy';
  return 'normal';
}

module.exports = router;
