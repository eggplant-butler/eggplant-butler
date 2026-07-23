const express = require('express');
const router = express.Router();
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const { successResponse, errorResponse, todayStr, nowTimeStr } = require('../utils/helpers');
const { store } = require('../utils/store');

// 记录小确幸
router.post('/joy', (req, res) => {
  try {
    const { content, category = '日常', mood = 3, tags, notes, date, time } = req.body;

    if (!content) {
      return res.json(errorResponse('请输入小确幸内容'));
    }

    const joy = {
      id: uuidv4(),
      type: 'joy',
      joyType: 'joy',
      title: content.substring(0, 50),
      content,
      category,
      mood: parseInt(mood) || 3, // 1-5
      tags: tags || [],
      notes: notes || '',
      date: date || todayStr(),
      time: time || nowTimeStr(),
      createdAt: new Date().toISOString()
    };

    const result = store.create('joys', joy);
    return res.json(successResponse(result, '小确幸已记录'));
  } catch (err) {
    return res.json(errorResponse('记录失败: ' + err.message));
  }
});

// 手动记录成就
router.post('/win', (req, res) => {
  try {
    const { title, description, category = '个人', level = 'medium', tags, date } = req.body;

    if (!title) {
      return res.json(errorResponse('请输入成就标题'));
    }

    const win = {
      id: uuidv4(),
      type: 'joy',
      joyType: 'win',
      title,
      description: description || '',
      category,
      level, // small, medium, large
      source: 'manual',
      tags: tags || [],
      date: date || todayStr(),
      createdAt: new Date().toISOString()
    };

    const result = store.create('joys', win);
    return res.json(successResponse(result, '成就已记录'));
  } catch (err) {
    return res.json(errorResponse('记录失败: ' + err.message));
  }
});

// 自动检查并生成成就
router.post('/auto-achieve', (req, res) => {
  try {
    const newAchievements = [];
    const today = todayStr();

    // 检查已有成就，避免重复
    const existingAchievements = store.query('joys', j => j.joyType === 'win' && j.source === 'auto');
    const existingTitles = new Set(existingAchievements.map(a => a.title));

    // 成就1: 连续早起7天
    const habits = store.getAll('habits');
    const wakeUpRecords = habits.filter(h => h.habitType === 'wake_up')
      .sort((a, b) => b.date.localeCompare(a.date));

    let wakeUpStreak = 0;
    let checkDate = today;
    for (let i = 0; i < 365; i++) {
      const hasRecord = wakeUpRecords.some(r => r.date === checkDate);
      if (hasRecord) {
        wakeUpStreak++;
        checkDate = moment(checkDate).subtract(1, 'days').format('YYYY-MM-DD');
      } else {
        if (i === 0) {
          checkDate = moment(checkDate).subtract(1, 'days').format('YYYY-MM-DD');
          continue;
        }
        break;
      }
    }

    if (wakeUpStreak >= 7 && !existingTitles.has(`连续早起${wakeUpStreak}天`)) {
      const achievement = {
        id: uuidv4(),
        type: 'joy',
        joyType: 'win',
        title: `连续早起${wakeUpStreak}天`,
        description: `太棒了！已经连续早起${wakeUpStreak}天，坚持就是胜利！`,
        category: '习惯',
        level: wakeUpStreak >= 30 ? 'large' : (wakeUpStreak >= 14 ? 'medium' : 'small'),
        source: 'auto',
        achievementType: 'wake_up_streak',
        streak: wakeUpStreak,
        date: today,
        createdAt: new Date().toISOString()
      };
      store.create('joys', achievement);
      newAchievements.push(achievement);
    }

    // 成就2: 连续健身30天
    const exerciseRecords = habits.filter(h => h.habitType === 'exercise')
      .sort((a, b) => b.date.localeCompare(a.date));

    let exerciseStreak = 0;
    checkDate = today;
    for (let i = 0; i < 365; i++) {
      const hasRecord = exerciseRecords.some(r => r.date === checkDate);
      if (hasRecord) {
        exerciseStreak++;
        checkDate = moment(checkDate).subtract(1, 'days').format('YYYY-MM-DD');
      } else {
        if (i === 0) {
          checkDate = moment(checkDate).subtract(1, 'days').format('YYYY-MM-DD');
          continue;
        }
        break;
      }
    }

    if (exerciseStreak >= 30 && !existingTitles.has(`连续健身${exerciseStreak}天`)) {
      const achievement = {
        id: uuidv4(),
        type: 'joy',
        joyType: 'win',
        title: `连续健身${exerciseStreak}天`,
        description: `健身达人！连续${exerciseStreak}天坚持运动，身体越来越棒了！`,
        category: '健康',
        level: 'large',
        source: 'auto',
        achievementType: 'exercise_streak',
        streak: exerciseStreak,
        date: today,
        createdAt: new Date().toISOString()
      };
      store.create('joys', achievement);
      newAchievements.push(achievement);
    }

    // 成就3: 首次摄影记录
    const photos = store.getAll('photos');
    if (photos.length > 0 && !existingTitles.has('首次摄影记录')) {
      const achievement = {
        id: uuidv4(),
        type: 'joy',
        joyType: 'win',
        title: '首次摄影记录',
        description: '迈出了摄影学习的第一步，继续探索光影的世界吧！',
        category: '摄影',
        level: 'small',
        source: 'auto',
        achievementType: 'first_photo',
        date: today,
        createdAt: new Date().toISOString()
      };
      store.create('joys', achievement);
      newAchievements.push(achievement);
    }

    // 成就4: 连续阅读7天
    const readingLogs = store.query('reading', r => r.readingType === 'log');
    const uniqueReadingDays = [...new Set(readingLogs.map(l => l.date))].sort().reverse();
    let readingStreak = 0;
    checkDate = today;
    for (let i = 0; i < 365; i++) {
      if (uniqueReadingDays.includes(checkDate)) {
        readingStreak++;
        checkDate = moment(checkDate).subtract(1, 'days').format('YYYY-MM-DD');
      } else {
        if (i === 0) {
          checkDate = moment(checkDate).subtract(1, 'days').format('YYYY-MM-DD');
          continue;
        }
        break;
      }
    }

    if (readingStreak >= 7 && !existingTitles.has(`连续阅读${readingStreak}天`)) {
      const achievement = {
        id: uuidv4(),
        type: 'joy',
        joyType: 'win',
        title: `连续阅读${readingStreak}天`,
        description: `书虫养成中！连续${readingStreak}天阅读，知识在悄悄积累~`,
        category: '阅读',
        level: readingStreak >= 30 ? 'large' : 'medium',
        source: 'auto',
        achievementType: 'reading_streak',
        streak: readingStreak,
        date: today,
        createdAt: new Date().toISOString()
      };
      store.create('joys', achievement);
      newAchievements.push(achievement);
    }

    // 成就5: 储蓄里程碑
    const wishes = store.getAll('wishes');
    const totalSaved = wishes.reduce((sum, w) => sum + (w.currentAmount || 0), 0);
    const milestones = [1000, 5000, 10000, 50000];
    for (const milestone of milestones) {
      if (totalSaved >= milestone && !existingTitles.has(`储蓄突破${milestone}元`)) {
        const achievement = {
          id: uuidv4(),
          type: 'joy',
          joyType: 'win',
          title: `储蓄突破${milestone}元`,
          description: `理财小能手！累计储蓄已突破${milestone}元，继续加油！`,
          category: '财务',
          level: milestone >= 10000 ? 'large' : (milestone >= 5000 ? 'medium' : 'small'),
          source: 'auto',
          achievementType: 'saving_milestone',
          amount: milestone,
          date: today,
          createdAt: new Date().toISOString()
        };
        store.create('joys', achievement);
        newAchievements.push(achievement);
        break; // 一次只生成一个里程碑
      }
    }

    return res.json(successResponse({
      newAchievements,
      count: newAchievements.length
    }, newAchievements.length > 0 ? `发现${newAchievements.length}个新成就！` : '暂无新成就'));
  } catch (err) {
    return res.json(errorResponse('检查失败: ' + err.message));
  }
});

// 获取时间线
router.get('/timeline', (req, res) => {
  try {
    const { type, limit = 50, offset = 0 } = req.query;

    let items = store.getAll('joys');

    if (type) {
      items = items.filter(i => i.joyType === type);
    }

    items.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

    const paginated = items.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    // 统计
    const joyCount = items.filter(i => i.joyType === 'joy').length;
    const winCount = items.filter(i => i.joyType === 'win').length;
    const smallWins = items.filter(i => i.level === 'small').length;
    const mediumWins = items.filter(i => i.level === 'medium').length;
    const largeWins = items.filter(i => i.level === 'large').length;

    return res.json(successResponse({
      items: paginated,
      total: items.length,
      stats: {
        joyCount,
        winCount,
        smallWins,
        mediumWins,
        largeWins
      }
    }));
  } catch (err) {
    return res.json(errorResponse('获取时间线失败: ' + err.message));
  }
});

// 获取统计
router.get('/stats', (req, res) => {
  try {
    const items = store.getAll('joys');
    const joys = items.filter(i => i.joyType === 'joy');
    const wins = items.filter(i => i.joyType === 'win');

    // 本月
    const thisMonth = moment().format('YYYY-MM');
    const thisMonthJoys = joys.filter(j => j.date.startsWith(thisMonth));
    const thisMonthWins = wins.filter(w => w.date.startsWith(thisMonth));

    // 平均心情
    const avgMood = joys.length > 0
      ? (joys.reduce((sum, j) => sum + (j.mood || 3), 0) / joys.length).toFixed(1)
      : 0;

    // 按分类统计
    const categoryStats = {};
    joys.forEach(j => {
      const cat = j.category || '其他';
      if (!categoryStats[cat]) categoryStats[cat] = 0;
      categoryStats[cat]++;
    });

    return res.json(successResponse({
      totalJoys: joys.length,
      totalWins: wins.length,
      thisMonthJoys: thisMonthJoys.length,
      thisMonthWins: thisMonthWins.length,
      avgMood,
      categoryStats
    }));
  } catch (err) {
    return res.json(errorResponse('获取统计失败: ' + err.message));
  }
});

module.exports = router;
