const express = require('express');
const router = express.Router();
const moment = require('moment');
const schedule = require('node-schedule');
const { v4: uuidv4 } = require('uuid');
const { successResponse, errorResponse, todayStr, nowTimeStr } = require('../utils/helpers');
const { store } = require('../utils/store');
const userConfig = require('../config/user');
const { sendNotification } = require('../utils/notifier');

// 记录阅读
router.post('/log', (req, res) => {
  try {
    const { bookTitle, author, pages, durationMinutes, notes, tags, date, time } = req.body;

    if (!bookTitle) {
      return res.json(errorResponse('请输入书名'));
    }

    const log = {
      id: uuidv4(),
      type: 'reading',
      readingType: 'log',
      bookTitle,
      author: author || '',
      pages: pages || 0,
      durationMinutes: durationMinutes || 0,
      notes: notes || '',
      tags: tags || [],
      date: date || todayStr(),
      time: time || nowTimeStr(),
      status: 'reading',
      createdAt: new Date().toISOString()
    };

    const result = store.create('reading', log);
    return res.json(successResponse(result, '阅读记录已添加'));
  } catch (err) {
    return res.json(errorResponse('记录失败: ' + err.message));
  }
});

// 阅读统计
router.get('/stats', (req, res) => {
  try {
    const logs = store.query('reading', r => r.readingType === 'log');

    // 连续阅读天数
    const uniqueDates = [...new Set(logs.map(l => l.date))].sort().reverse();
    let streak = 0;
    let checkDate = todayStr();

    for (let i = 0; i < 365; i++) {
      if (uniqueDates.includes(checkDate)) {
        streak++;
        checkDate = moment(checkDate).subtract(1, 'days').format('YYYY-MM-DD');
      } else {
        if (i === 0) {
          checkDate = moment(checkDate).subtract(1, 'days').format('YYYY-MM-DD');
          continue;
        }
        break;
      }
    }

    // 本月阅读天数
    const thisMonth = moment().format('YYYY-MM');
    const thisMonthLogs = logs.filter(l => l.date.startsWith(thisMonth));
    const thisMonthDays = new Set(thisMonthLogs.map(l => l.date)).size;

    // 总阅读时长和页数
    const totalMinutes = logs.reduce((sum, l) => sum + (l.durationMinutes || 0), 0);
    const totalPages = logs.reduce((sum, l) => sum + (l.pages || 0), 0);

    // 阅读的书籍数量
    const books = new Set(logs.map(l => l.bookTitle)).size;

    // 近7天阅读情况
    const recent7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = moment().subtract(i, 'days').format('YYYY-MM-DD');
      const dayLogs = logs.filter(l => l.date === date);
      const dayMinutes = dayLogs.reduce((s, l) => s + (l.durationMinutes || 0), 0);
      const dayPages = dayLogs.reduce((s, l) => s + (l.pages || 0), 0);
      recent7Days.push({
        date,
        read: dayLogs.length > 0,
        minutes: dayMinutes,
        pages: dayPages,
        count: dayLogs.length
      });
    }

    // 今天是否已阅读
    const todayRead = logs.some(l => l.date === todayStr());

    // 默认阅读时间
    const [readingStart, readingEnd] = userConfig.defaultReadingTime.split('-');

    return res.json(successResponse({
      streak,
      thisMonthDays,
      thisMonthMinutes: thisMonthLogs.reduce((s, l) => s + (l.durationMinutes || 0), 0),
      totalBooks: books,
      totalMinutes,
      totalPages,
      todayRead,
      defaultReadingTime: { start: readingStart, end: readingEnd },
      recent7Days
    }));
  } catch (err) {
    return res.json(errorResponse('获取统计失败: ' + err.message));
  }
});

// 获取阅读记录列表
router.get('/logs', (req, res) => {
  try {
    const { book, limit = 20, offset = 0 } = req.query;
    let logs = store.query('reading', r => r.readingType === 'log');

    if (book) {
      logs = logs.filter(l => l.bookTitle.includes(book));
    }

    logs.sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));

    return res.json(successResponse({
      logs: logs.slice(parseInt(offset), parseInt(offset) + parseInt(limit)),
      total: logs.length
    }));
  } catch (err) {
    return res.json(errorResponse('获取失败: ' + err.message));
  }
});

// 初始化阅读提醒（每天21:00检查是否已阅读）
function initReadingReminder() {
  // 每天 21:00 检查
  schedule.scheduleJob('0 21 * * *', async () => {
    console.log('[阅读提醒] 检查今日阅读情况...');

    const today = todayStr();
    const logs = store.query('reading', r => r.readingType === 'log' && r.date === today);

    if (logs.length === 0) {
      await sendNotification(
        '📚 阅读提醒',
        '今天还没阅读哦！现在是阅读时间（21:00-21:30），翻开书读几页吧~'
      );
      console.log('[阅读提醒] 已推送阅读提醒');
    } else {
      console.log('[阅读提醒] 今日已阅读，无需提醒');
    }
  });

  console.log('[阅读模块] 阅读提醒已初始化（每日21:00）');
}

module.exports = { router, initReadingReminder };
