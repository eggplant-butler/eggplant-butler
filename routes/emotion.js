const express = require('express');
const router = express.Router();
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const { successResponse, errorResponse, todayStr, nowTimeStr } = require('../utils/helpers');
const { store } = require('../utils/store');

// 记录情绪
router.post('/checkin', (req, res) => {
  try {
    const { score, tags = [], notes, date, time } = req.body;

    if (score === undefined || score === null) {
      return res.json(errorResponse('请提供情绪评分（1-5）'));
    }

    const parsedScore = parseInt(score);
    if (parsedScore < 1 || parsedScore > 5) {
      return res.json(errorResponse('情绪评分必须在 1-5 之间'));
    }

    // 标准化标签
    const validTags = Array.isArray(tags) ? tags : (tags ? [tags] : []);
    const normalizedTags = validTags.map(t => t.trim()).filter(Boolean);

    const emotionLabels = {
      1: '很低落',
      2: '低落',
      3: '一般',
      4: '开心',
      5: '非常开心'
    };

    const record = {
      id: uuidv4(),
      type: 'emotion',
      title: `情绪记录: ${emotionLabels[parsedScore] || ''}`,
      score: parsedScore,
      tags: normalizedTags,
      notes: notes || '',
      date: date || todayStr(),
      time: time || nowTimeStr(),
      createdAt: new Date().toISOString()
    };

    const result = store.create('emotions', record);
    return res.json(successResponse(result, '情绪已记录'));
  } catch (err) {
    return res.json(errorResponse('记录失败: ' + err.message));
  }
});

// 获取情绪趋势
router.get('/trend', (req, res) => {
  try {
    const { days = 7 } = req.query;
    const dayCount = Math.min(parseInt(days) || 7, 90);
    const emotions = store.getAll('emotions');

    const trendData = [];
    const tagStats = {};

    for (let i = dayCount - 1; i >= 0; i--) {
      const date = moment().subtract(i, 'days').format('YYYY-MM-DD');
      const dayRecords = emotions.filter(e => e.date === date);

      let avgScore = null;
      let dominantTags = [];

      if (dayRecords.length > 0) {
        const totalScore = dayRecords.reduce((s, r) => s + r.score, 0);
        avgScore = parseFloat((totalScore / dayRecords.length).toFixed(1));

        // 统计当日标签
        const dayTagCounts = {};
        dayRecords.forEach(r => {
          (r.tags || []).forEach(tag => {
            dayTagCounts[tag] = (dayTagCounts[tag] || 0) + 1;
            tagStats[tag] = (tagStats[tag] || 0) + 1;
          });
        });
        dominantTags = Object.entries(dayTagCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([tag]) => tag);
      }

      trendData.push({
        date,
        avgScore,
        recordCount: dayRecords.length,
        dominantTags,
        records: dayRecords
      });
    }

    // 总体统计
    const allRecordsInRange = emotions.filter(e => {
      const recordDate = moment(e.date);
      const cutoff = moment().subtract(dayCount - 1, 'days').startOf('day');
      return recordDate.isSameOrAfter(cutoff);
    });

    const avgOverall = allRecordsInRange.length > 0
      ? (allRecordsInRange.reduce((s, r) => s + r.score, 0) / allRecordsInRange.length).toFixed(1)
      : null;

    // 标签排序
    const sortedTags = Object.entries(tagStats)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));

    return res.json(successResponse({
      days: dayCount,
      trend: trendData,
      overallAvg: avgOverall,
      totalRecords: allRecordsInRange.length,
      tagStats: sortedTags,
      // 是否有连续低分
      lowScoreStreak: calculateLowScoreStreak(trendData),
      // 急躁相关统计
      impatientCount: allRecordsInRange.filter(e =>
        (e.tags || []).some(t => t.includes('急躁') || t.includes('焦虑'))
      ).length
    }));
  } catch (err) {
    return res.json(errorResponse('获取趋势失败: ' + err.message));
  }
});

// 获取今日情绪
router.get('/today', (req, res) => {
  try {
    const today = todayStr();
    const records = store.query('emotions', e => e.date === today);

    let avgScore = null;
    if (records.length > 0) {
      avgScore = (records.reduce((s, r) => s + r.score, 0) / records.length).toFixed(1);
    }

    return res.json(successResponse({
      date: today,
      records,
      count: records.length,
      avgScore,
      latest: records.length > 0 ? records[records.length - 1] : null
    }));
  } catch (err) {
    return res.json(errorResponse('获取失败: ' + err.message));
  }
});

// 计算连续低分天数
function calculateLowScoreStreak(trendData) {
  let streak = 0;
  for (let i = trendData.length - 1; i >= 0; i--) {
    const day = trendData[i];
    if (day.avgScore !== null && day.avgScore <= 2) {
      streak++;
    } else if (day.avgScore !== null) {
      break;
    }
  }
  return streak;
}

module.exports = router;
