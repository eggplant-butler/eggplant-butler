const express = require('express');
const router = express.Router();
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const { successResponse, errorResponse, todayStr, nowTimeStr, daysBetween } = require('../utils/helpers');
const { store } = require('../utils/store');
const userConfig = require('../config/user');
const { sendNotification } = require('../utils/notifier');

// 记录饮水
router.post('/water', (req, res) => {
  try {
    const { amount, unit = 'ml', date, time, notes } = req.body;

    if (!amount) {
      return res.json(errorResponse('请输入饮水量'));
    }

    // 转换为毫升
    let mlAmount = parseFloat(amount);
    if (unit === 'cup' || unit === '杯') {
      mlAmount = mlAmount * 250; // 假设一杯250ml
    }

    const record = {
      id: uuidv4(),
      type: 'health',
      healthType: 'water',
      title: `饮水 ${mlAmount}ml`,
      amount: mlAmount,
      unit: 'ml',
      date: date || todayStr(),
      time: time || nowTimeStr(),
      notes: notes || '',
      createdAt: new Date().toISOString()
    };

    const result = store.create('health', record);
    return res.json(successResponse(result, '饮水记录已添加'));
  } catch (err) {
    return res.json(errorResponse('记录失败: ' + err.message));
  }
});

// 获取今日饮水情况
router.get('/water/today', (req, res) => {
  try {
    const today = todayStr();
    const waterRecords = store.query('health', h =>
      h.healthType === 'water' && h.date === today
    );

    const totalMl = waterRecords.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);

    // 根据天气判断目标（简化：默认2000ml，这里假设不是很热）
    // 实际可结合天气API
    const goal = userConfig.dailyWaterGoal;
    const progress = ((totalMl / goal) * 100).toFixed(1);

    return res.json(successResponse({
      date: today,
      totalMl,
      goal,
      progress: `${progress}%`,
      remaining: Math.max(0, goal - totalMl),
      records: waterRecords,
      recordCount: waterRecords.length
    }));
  } catch (err) {
    return res.json(errorResponse('获取数据失败: ' + err.message));
  }
});

// 备餐清单/菜谱库
router.post('/meal-plan', (req, res) => {
  try {
    const { name, ingredients, recipe, category = '午餐', servings = 1, tags } = req.body;

    if (!name) {
      return res.json(errorResponse('请输入菜品名称'));
    }

    const meal = {
      id: uuidv4(),
      type: 'health',
      healthType: 'meal_plan',
      title: name,
      category,
      ingredients: ingredients || [],
      recipe: recipe || '',
      servings,
      tags: tags || [],
      date: todayStr(),
      createdAt: new Date().toISOString()
    };

    const result = store.create('health', meal);
    return res.json(successResponse(result, '菜谱已添加'));
  } catch (err) {
    return res.json(errorResponse('添加失败: ' + err.message));
  }
});

// 获取菜谱列表
router.get('/meal-plan', (req, res) => {
  try {
    const { category } = req.query;
    let meals = store.query('health', h => h.healthType === 'meal_plan');

    if (category) {
      meals = meals.filter(m => m.category === category);
    }

    return res.json(successResponse({ meals, count: meals.length }));
  } catch (err) {
    return res.json(errorResponse('获取失败: ' + err.message));
  }
});

// 记录经期开始日
router.post('/period', (req, res) => {
  try {
    const { startDate, cycleDays, notes } = req.body;

    const record = {
      id: uuidv4(),
      type: 'health',
      healthType: 'period',
      title: '经期开始',
      periodStart: startDate || todayStr(),
      cycleDays: cycleDays || userConfig.periodCycleDays,
      notes: notes || '',
      date: startDate || todayStr(),
      createdAt: new Date().toISOString()
    };

    const result = store.create('health', record);
    return res.json(successResponse(result, '经期记录已添加'));
  } catch (err) {
    return res.json(errorResponse('记录失败: ' + err.message));
  }
});

// 经期预测
router.get('/period/predict', (req, res) => {
  try {
    const periodRecords = store.query('health', h => h.healthType === 'period')
      .sort((a, b) => b.periodStart.localeCompare(a.periodStart));

    if (periodRecords.length === 0) {
      return res.json(successResponse({
        hasData: false,
        message: '暂无经期记录，请先记录'
      }));
    }

    const latest = periodRecords[0];
    const cycleDays = latest.cycleDays || userConfig.periodCycleDays;
    const lastStart = moment(latest.periodStart);

    // 下次经期预测
    const nextPeriodStart = lastStart.clone().add(cycleDays, 'days');
    const nextPeriodEnd = nextPeriodStart.clone().add(5, 'days'); // 假设持续5天

    // 易孕期（下次经期前14天左右，即排卵期前后5天）
    const ovulationDay = nextPeriodStart.clone().subtract(14, 'days');
    const fertileStart = ovulationDay.clone().subtract(5, 'days');
    const fertileEnd = ovulationDay.clone().add(4, 'days');

    // 距离下次还有多少天
    const daysUntilNext = moment().diff(lastStart, 'days');
    const daysRemaining = cycleDays - daysUntilNext;

    // 当前阶段
    let currentPhase = '卵泡期';
    if (daysUntilNext <= 5) {
      currentPhase = '经期';
    } else if (daysUntilNext >= cycleDays - 5) {
      currentPhase = '经前期';
    } else if (daysUntilNext >= cycleDays - 19 && daysUntilNext <= cycleDays - 9) {
      currentPhase = '排卵期/易孕期';
    }

    return res.json(successResponse({
      hasData: true,
      lastPeriodStart: latest.periodStart,
      cycleDays,
      nextPeriodStart: nextPeriodStart.format('YYYY-MM-DD'),
      nextPeriodEnd: nextPeriodEnd.format('YYYY-MM-DD'),
      daysUntilNext: Math.max(0, daysRemaining),
      ovulationDay: ovulationDay.format('YYYY-MM-DD'),
      fertileWindow: {
        start: fertileStart.format('YYYY-MM-DD'),
        end: fertileEnd.format('YYYY-MM-DD')
      },
      currentPhase
    }));
  } catch (err) {
    return res.json(errorResponse('预测失败: ' + err.message));
  }
});

// 同步外部经期数据
router.post('/period/sync', (req, res) => {
  try {
    const { source, startDate, cycleDays, notes } = req.body;

    if (!startDate) {
      return res.json(errorResponse('请提供开始日期'));
    }

    const record = {
      id: uuidv4(),
      type: 'health',
      healthType: 'period',
      title: `经期记录（来自${source || '外部'}）`,
      periodStart: startDate,
      cycleDays: cycleDays || userConfig.periodCycleDays,
      source: source || 'external',
      notes: notes || '',
      date: startDate,
      createdAt: new Date().toISOString()
    };

    const result = store.create('health', record);
    return res.json(successResponse(result, '经期数据已同步'));
  } catch (err) {
    return res.json(errorResponse('同步失败: ' + err.message));
  }
});

// 记录如厕
router.post('/toilet', (req, res) => {
  try {
    const { type = 'urine', subtype, notes, date, time } = req.body;
    // type: urine(尿), stool(便), diarrhea(腹泻)

    const typeLabels = {
      urine: '排尿',
      stool: '排便',
      diarrhea: '腹泻'
    };

    const record = {
      id: uuidv4(),
      type: 'health',
      healthType: 'toilet',
      toiletType: type,
      title: typeLabels[type] || type,
      subtype: subtype || '',
      notes: notes || '',
      date: date || todayStr(),
      time: time || nowTimeStr(),
      createdAt: new Date().toISOString()
    };

    const result = store.create('health', record);
    return res.json(successResponse(result, '记录已添加'));
  } catch (err) {
    return res.json(errorResponse('记录失败: ' + err.message));
  }
});

// ===== 外部健康数据同步 =====

// POST /sync - 接受外部健康数据
router.post('/sync', (req, res) => {
  try {
    const { source, dataType, value, date, time, metadata } = req.body;

    if (!dataType || value === undefined || value === null) {
      return res.json(errorResponse('请提供数据类型(dataType)和数值(value)'));
    }

    const supportedTypes = ['sleep', 'steps', 'heart_rate'];
    if (!supportedTypes.includes(dataType)) {
      return res.json(errorResponse(`不支持的数据类型: ${dataType}，支持: ${supportedTypes.join(', ')}`));
    }

    const typeLabels = {
      sleep: '睡眠',
      steps: '步数',
      heart_rate: '心率'
    };

    // sleep 类型支持深睡/浅睡
    let record = {
      id: uuidv4(),
      type: 'health',
      healthType: 'sync',
      dataType,
      title: `${typeLabels[dataType]}数据（来自${source || '外部'}）`,
      source: source || 'unknown',
      date: date || todayStr(),
      time: time || nowTimeStr(),
      createdAt: new Date().toISOString()
    };

    if (dataType === 'sleep') {
      // value 可以是数字（总时长）或对象 { deep: 2.5, light: 4.5, rem: 1.5, awake: 0.5 }
      if (typeof value === 'object') {
        record.deepSleep = parseFloat(value.deep) || 0;
        record.lightSleep = parseFloat(value.light) || 0;
        record.remSleep = parseFloat(value.rem) || 0;
        record.awakeTime = parseFloat(value.awake) || 0;
        record.totalSleep = record.deepSleep + record.lightSleep + record.remSleep;
      } else {
        record.totalSleep = parseFloat(value) || 0;
        record.deepSleep = 0;
        record.lightSleep = record.totalSleep;
      }
      // 睡眠评分规则：深睡>1.5h 优，>1h 良，>0.5h 中，<0.5h 差
      record.sleepScore = calculateSleepScore(record.deepSleep, record.totalSleep);
      record.title = `睡眠 ${record.totalSleep.toFixed(1)}h (深睡${record.deepSleep.toFixed(1)}h) 评分${record.sleepScore}`;
    } else if (dataType === 'steps') {
      record.steps = parseInt(value) || 0;
      record.title = `步数 ${record.steps}`;
    } else if (dataType === 'heart_rate') {
      if (typeof value === 'object') {
        record.heartRateAvg = parseInt(value.avg) || parseInt(value.average) || 0;
        record.heartRateMax = parseInt(value.max) || 0;
        record.heartRateMin = parseInt(value.min) || 0;
        record.title = `心率 均值${record.heartRateAvg} 最大${record.heartRateMax} 最小${record.heartRateMin}`;
      } else {
        record.heartRateAvg = parseInt(value) || 0;
        record.title = `心率 ${record.heartRateAvg}`;
      }
    }

    // 附加元数据
    if (metadata) {
      record.metadata = metadata;
    }

    const result = store.create('health', record);
    return res.json(successResponse(result, `${typeLabels[dataType]}数据已同步`));
  } catch (err) {
    return res.json(errorResponse('同步失败: ' + err.message));
  }
});

// GET /sleep - 睡眠趋势
router.get('/sleep', (req, res) => {
  try {
    const { days = 7 } = req.query;
    const numDays = Math.min(parseInt(days), 90);

    const recentDays = [];
    for (let i = numDays - 1; i >= 0; i--) {
      recentDays.push(moment().subtract(i, 'days').format('YYYY-MM-DD'));
    }

    const allSyncRecords = store.query('health', h =>
      h.healthType === 'sync' && h.dataType === 'sleep'
    );

    const dailySleep = recentDays.map(date => {
      const dayRecords = allSyncRecords.filter(r => r.date === date);
      if (dayRecords.length === 0) return null;

      // 取当天最新的一条
      const latest = dayRecords.sort((a, b) =>
        (b.createdAt || '').localeCompare(a.createdAt || '')
      )[0];

      return {
        date,
        totalSleep: latest.totalSleep || 0,
        deepSleep: latest.deepSleep || 0,
        lightSleep: latest.lightSleep || 0,
        remSleep: latest.remSleep || 0,
        awakeTime: latest.awakeTime || 0,
        score: latest.sleepScore || 0,
        source: latest.source || 'unknown'
      };
    }).filter(Boolean);

    // 计算趋势
    const avgTotalSleep = dailySleep.length > 0
      ? dailySleep.reduce((s, d) => s + d.totalSleep, 0) / dailySleep.length : 0;
    const avgDeepSleep = dailySleep.length > 0
      ? dailySleep.reduce((s, d) => s + d.deepSleep, 0) / dailySleep.length : 0;
    const avgScore = dailySleep.length > 0
      ? dailySleep.reduce((s, d) => s + d.score, 0) / dailySleep.length : 0;

    // 判断最近3天是否有低评分（<60）
    const recent3Days = dailySleep.slice(-3);
    const lowScoreDays = recent3Days.filter(d => d.score < 60);
    const isLowScoreStreak = lowScoreDays.length >= 3;

    return res.json(successResponse({
      days: numDays,
      daily: dailySleep,
      stats: {
        avgTotalSleep: parseFloat(avgTotalSleep.toFixed(1)),
        avgDeepSleep: parseFloat(avgDeepSleep.toFixed(1)),
        avgScore: parseFloat(avgScore.toFixed(0)),
        dataCount: dailySleep.length
      },
      alerts: {
        lowScoreStreak: isLowScoreStreak,
        lowScoreDays: lowScoreDays.length,
        recent3Days
      }
    }));
  } catch (err) {
    return res.json(errorResponse('获取睡眠数据失败: ' + err.message));
  }
});

// 睡眠评分计算
function calculateSleepScore(deepSleep, totalSleep) {
  if (!totalSleep || totalSleep <= 0) return 0;

  let score = 0;

  // 基础分：总睡眠时长（推荐7-9小时）
  if (totalSleep >= 7 && totalSleep <= 9) {
    score += 40;
  } else if (totalSleep >= 6 && totalSleep < 7) {
    score += 30;
  } else if (totalSleep > 9 && totalSleep <= 10) {
    score += 25;
  } else if (totalSleep >= 5) {
    score += 15;
  } else {
    score += 5;
  }

  // 深睡评分（>1.5h优，>1h良，>0.5h中，<0.5h差）
  if (deepSleep >= 1.5) {
    score += 35;
  } else if (deepSleep >= 1.0) {
    score += 25;
  } else if (deepSleep >= 0.5) {
    score += 15;
  } else {
    score += 5;
  }

  // 深睡占比（深睡应占总睡眠20-25%为佳）
  const deepRatio = deepSleep / totalSleep;
  if (deepRatio >= 0.2 && deepRatio <= 0.3) {
    score += 25;
  } else if (deepRatio >= 0.15) {
    score += 15;
  } else if (deepRatio >= 0.1) {
    score += 8;
  } else {
    score += 3;
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

module.exports.calculateSleepScore = calculateSleepScore;

// 当日如厕记录
router.get('/toilet/daily', async (req, res) => {
  try {
    const today = todayStr();
    const records = store.query('health', h =>
      h.healthType === 'toilet' && h.date === today
    );

    const urineCount = records.filter(r => r.toiletType === 'urine').length;
    const stoolCount = records.filter(r => r.toiletType === 'stool').length;
    const diarrheaCount = records.filter(r => r.toiletType === 'diarrhea').length;

    // 检查连续2天无排便
    const yesterday = moment().subtract(1, 'days').format('YYYY-MM-DD');
    const yesterdayStool = store.query('health', h =>
      h.healthType === 'toilet' && h.toiletType === 'stool' && h.date === yesterday
    );

    let noStoolWarning = false;
    if (stoolCount === 0 && yesterdayStool.length === 0) {
      noStoolWarning = true;
      // 推送提醒
      await sendNotification(
        '💩 排便提醒',
        '已经连续2天没有排便了，注意多喝水、多吃蔬菜水果哦！'
      );
    }

    return res.json(successResponse({
      date: today,
      records,
      summary: {
        urine: urineCount,
        stool: stoolCount,
        diarrhea: diarrheaCount
      },
      noStoolWarning
    }));
  } catch (err) {
    return res.json(errorResponse('获取失败: ' + err.message));
  }
});

module.exports = router;
