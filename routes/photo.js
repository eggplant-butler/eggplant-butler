const express = require('express');
const router = express.Router();
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const { successResponse, errorResponse, todayStr, nowTimeStr } = require('../utils/helpers');
const { store } = require('../utils/store');

// 记录摄影日志
router.post('/log', (req, res) => {
  try {
    const { theme, device = '理光', parameters, selfScore, location, photosCount, notes, tags } = req.body;

    if (!theme) {
      return res.json(errorResponse('请输入主题'));
    }

    const log = {
      id: uuidv4(),
      type: 'photo',
      photoType: 'log',
      title: theme,
      theme,
      device,
      parameters: parameters || {}, // aperture, shutter, iso, focalLength, etc.
      selfScore: selfScore || 0, // 1-5
      location: location || '',
      photosCount: photosCount || 0,
      notes: notes || '',
      tags: tags || [],
      date: todayStr(),
      time: nowTimeStr(),
      createdAt: new Date().toISOString()
    };

    const result = store.create('photos', log);
    return res.json(successResponse(result, '摄影记录已添加'));
  } catch (err) {
    return res.json(errorResponse('记录失败: ' + err.message));
  }
});

// 摄影复盘
router.post('/reflection', (req, res) => {
  try {
    const { logId, title, content, goodPoints, badPoints, improvements, rating, date } = req.body;

    if (!content) {
      return res.json(errorResponse('请输入复盘内容'));
    }

    const reflection = {
      id: uuidv4(),
      type: 'photo',
      photoType: 'reflection',
      logId: logId || '',
      title: title || '摄影复盘',
      content,
      goodPoints: goodPoints || [],
      badPoints: badPoints || [],
      improvements: improvements || [],
      rating: rating || 0,
      date: date || todayStr(),
      createdAt: new Date().toISOString()
    };

    const result = store.create('photos', reflection);
    return res.json(successResponse(result, '复盘已记录'));
  } catch (err) {
    return res.json(errorResponse('记录失败: ' + err.message));
  }
});

// 获取技能进步趋势
router.get('/progress', (req, res) => {
  try {
    const logs = store.query('photos', p => p.photoType === 'log');
    const reflections = store.query('photos', p => p.photoType === 'reflection');

    // 按月份统计
    const monthlyStats = {};
    const skills = {
      composition: '构图',
      lighting: '光线',
      color: '色彩',
      story: '故事性',
      technique: '技术'
    };

    logs.sort((a, b) => a.date.localeCompare(b.date));

    // 计算平均分趋势
    const scoreTrend = [];
    const monthlyScores = {};

    logs.forEach(log => {
      const month = log.date.substring(0, 7);
      if (!monthlyScores[month]) {
        monthlyScores[month] = { total: 0, count: 0, scores: [] };
      }
      if (log.selfScore) {
        monthlyScores[month].total += log.selfScore;
        monthlyScores[month].count += 1;
        monthlyScores[month].scores.push(log.selfScore);
      }
    });

    for (const [month, data] of Object.entries(monthlyScores).sort()) {
      scoreTrend.push({
        month,
        avgScore: data.count > 0 ? (data.total / data.count).toFixed(1) : 0,
        count: data.count
      });
    }

    // 技能雷达（基于复盘内容关键词简单分析）
    const skillAnalysis = {};
    for (const [key, label] of Object.entries(skills)) {
      skillAnalysis[key] = {
        label,
        level: 3, // 默认中等
        trend: 'stable',
        notes: []
      };
    }

    // 从复盘中提取关键词
    reflections.forEach(ref => {
      const content = ref.content || '';
      const goodPoints = ref.goodPoints || [];
      const badPoints = ref.badPoints || [];

      // 简单关键词匹配
      for (const point of goodPoints) {
        if (point.includes('构图') || point.includes('frame')) {
          skillAnalysis.composition.level = Math.min(5, skillAnalysis.composition.level + 0.1);
          skillAnalysis.composition.notes.push(point);
        }
        if (point.includes('光线') || point.includes('光')) {
          skillAnalysis.lighting.level = Math.min(5, skillAnalysis.lighting.level + 0.1);
          skillAnalysis.lighting.notes.push(point);
        }
        if (point.includes('色彩') || point.includes('颜色')) {
          skillAnalysis.color.level = Math.min(5, skillAnalysis.color.level + 0.1);
          skillAnalysis.color.notes.push(point);
        }
      }
    });

    return res.json(successResponse({
      totalLogs: logs.length,
      totalReflections: reflections.length,
      avgSelfScore: logs.filter(l => l.selfScore).length > 0
        ? (logs.filter(l => l.selfScore).reduce((s, l) => s + l.selfScore, 0) / logs.filter(l => l.selfScore).length).toFixed(1)
        : 0,
      scoreTrend,
      skillAnalysis,
      recentLogs: logs.slice(-5).reverse()
    }));
  } catch (err) {
    return res.json(errorResponse('获取进度失败: ' + err.message));
  }
});

// 获取摄影记录列表
router.get('/logs', (req, res) => {
  try {
    const { limit = 20, offset = 0, device } = req.query;
    let logs = store.query('photos', p => p.photoType === 'log');

    if (device) {
      logs = logs.filter(l => l.device === device);
    }

    logs.sort((a, b) => b.date.localeCompare(a.date));

    return res.json(successResponse({
      logs: logs.slice(parseInt(offset), parseInt(offset) + parseInt(limit)),
      total: logs.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    }));
  } catch (err) {
    return res.json(errorResponse('获取失败: ' + err.message));
  }
});

module.exports = router;
