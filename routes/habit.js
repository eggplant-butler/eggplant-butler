const express = require('express');
const router = express.Router();
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const { successResponse, errorResponse, todayStr, nowTimeStr, getRecentDays } = require('../utils/helpers');
const { store } = require('../utils/store');

// 习惯打卡
router.post('/checkin', (req, res) => {
  try {
    const { type, value, date, time, notes } = req.body;

    if (!type) {
      return res.json(errorResponse('请指定习惯类型'));
    }

    const record = {
      id: uuidv4(),
      type: 'habit',
      habitType: type, // wake_up, exercise, sleep, wash_hair, etc.
      title: getHabitTitle(type),
      value: value || 1,
      date: date || todayStr(),
      time: time || nowTimeStr(),
      status: 'done',
      notes: notes || '',
      createdAt: new Date().toISOString()
    };

    const result = store.create('habits', record);
    return res.json(successResponse(result, '打卡成功'));
  } catch (err) {
    return res.json(errorResponse('打卡失败: ' + err.message));
  }
});

// 获取连续打卡统计
router.get('/streak', (req, res) => {
  try {
    const habits = store.getAll('habits');

    // 连续早起天数
    const wakeUpRecords = habits.filter(h => h.habitType === 'wake_up')
      .sort((a, b) => b.date.localeCompare(a.date));

    let wakeUpStreak = 0;
    const today = todayStr();
    let checkDate = today;

    for (let i = 0; i < 365; i++) {
      const hasRecord = wakeUpRecords.some(r => r.date === checkDate);
      if (hasRecord) {
        wakeUpStreak++;
        checkDate = moment(checkDate).subtract(1, 'days').format('YYYY-MM-DD');
      } else {
        // 如果今天还没打卡，从昨天开始算
        if (i === 0) {
          checkDate = moment(checkDate).subtract(1, 'days').format('YYYY-MM-DD');
          continue;
        }
        break;
      }
    }

    // 近7天平均入睡时间
    const recent7Days = getRecentDays(7);
    const sleepRecords = habits.filter(h =>
      h.habitType === 'sleep' && recent7Days.includes(h.date)
    );

    let avgSleepTime = null;
    if (sleepRecords.length > 0) {
      const totalMinutes = sleepRecords.reduce((sum, r) => {
        const [h, m] = (r.time || r.value || '00:00').split(':').map(Number);
        // 处理跨午夜的情况（如00:30应算24:30）
        let mins = h * 60 + m;
        if (h < 12) mins += 24 * 60;
        return sum + mins;
      }, 0);
      const avgMins = Math.round(totalMinutes / sleepRecords.length);
      const avgH = Math.floor(avgMins / 60) % 24;
      const avgM = avgMins % 60;
      avgSleepTime = `${String(avgH).padStart(2, '0')}:${String(avgM).padStart(2, '0')}`;
    }

    // 近7天熬夜天数（>23:30）
    let lateNightCount = 0;
    sleepRecords.forEach(r => {
      const [h, m] = (r.time || r.value || '00:00').split(':').map(Number);
      const mins = h * 60 + m;
      // 23:30 = 23*60+30 = 1410
      // 00:00以后算熬夜
      if (mins < 12 * 60 || mins >= 23 * 60 + 30) {
        lateNightCount++;
      }
    });

    // 近7天平均起床时间
    const wakeUpRecent = habits.filter(h =>
      h.habitType === 'wake_up' && recent7Days.includes(h.date)
    );
    let avgWakeUpTime = null;
    if (wakeUpRecent.length > 0) {
      const totalMinutes = wakeUpRecent.reduce((sum, r) => {
        const [h, m] = (r.time || '07:00').split(':').map(Number);
        return sum + h * 60 + m;
      }, 0);
      const avgMins = Math.round(totalMinutes / wakeUpRecent.length);
      avgWakeUpTime = `${String(Math.floor(avgMins / 60)).padStart(2, '0')}:${String(avgMins % 60).padStart(2, '0')}`;
    }

    // 连续健身天数
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

    // 最近30天早起时间数据（用于折线图）
    const recent30Days = getRecentDays(30);
    const recentWakeUpData = recent30Days.map(date => {
      const record = wakeUpRecords.find(r => r.date === date);
      if (record && record.time) {
        const [h, m] = record.time.split(':').map(Number);
        return { date, time: record.time, minutes: h * 60 + m };
      }
      return { date, time: null, minutes: null };
    }).filter(d => d.minutes !== null);

    return res.json(successResponse({
      wakeUpStreak,
      exerciseStreak,
      avgSleepTime,
      avgWakeUpTime,
      lateNightCount,
      recent7DaysSleepCount: sleepRecords.length,
      recent7DaysWakeUpCount: wakeUpRecent.length,
      recent7DaysExerciseCount: wakeUpRecent.filter(h => h.habitType === 'exercise').length,
      recentWakeUpData
    }));
  } catch (err) {
    return res.json(errorResponse('获取统计失败: ' + err.message));
  }
});

// 获取今日打卡状态
router.get('/today', (req, res) => {
  try {
    const today = todayStr();
    const todayHabits = store.query('habits', h => h.date === today);

    const habitTypes = [
      { type: 'wake_up', label: '早起', icon: '🌅' },
      { type: 'exercise', label: '健身', icon: '💪' },
      { type: 'wash_hair', label: '洗头', icon: '💇' },
      { type: 'skincare', label: '护肤', icon: '🧴' },
      { type: 'reading', label: '阅读', icon: '📖' },
      { type: 'water', label: '喝水', icon: '💧' },
      { type: 'sleep', label: '睡觉', icon: '😴' }
    ];

    const status = habitTypes.map(habit => {
      const record = todayHabits.find(h => h.habitType === habit.type);
      return {
        ...habit,
        checked: !!record,
        record: record || null
      };
    });

    return res.json(successResponse({
      date: today,
      habits: status,
      completedCount: status.filter(s => s.checked).length,
      totalCount: status.length
    }));
  } catch (err) {
    return res.json(errorResponse('获取今日状态失败: ' + err.message));
  }
});

function getHabitTitle(type) {
  const titles = {
    'wake_up': '早起打卡',
    'exercise': '健身打卡',
    'sleep': '睡觉打卡',
    'wash_hair': '洗头',
    'skincare': '护肤',
    'reading': '阅读',
    'water': '喝水',
    'meditation': '冥想'
  };
  return titles[type] || type;
}

module.exports = router;
