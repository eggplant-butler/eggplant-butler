const express = require('express');
const router = express.Router();
const schedule = require('node-schedule');
const { successResponse, errorResponse, todayStr } = require('../utils/helpers');
const { fetchNews, formatNewsBriefing, NEWS_CATEGORIES } = require('../utils/newsFetcher');
const { sendNotification } = require('../utils/notifier');
const userConfig = require('../config/user');

// 获取今日新闻（按分类分组，每类最多3条）
router.get('/today', async (req, res) => {
  try {
    const result = await fetchNews(userConfig.newsApiKey);
    const newsList = result.news;

    // 按分类分组
    const grouped = {};
    NEWS_CATEGORIES.forEach(cat => {
      grouped[cat] = [];
    });

    // 先添加"其他"分类
    grouped['其他'] = [];

    newsList.forEach(item => {
      const cat = item.category || '其他';
      if (!grouped[cat]) grouped[cat] = [];
      if (grouped[cat].length < 3) {
        grouped[cat].push(item);
      }
    });

    // 删除空分类
    const filteredGrouped = {};
    for (const [cat, items] of Object.entries(grouped)) {
      if (items.length > 0) {
        filteredGrouped[cat] = items;
      }
    }

    return res.json(successResponse({
      date: todayStr(),
      source: result.source,
      total: newsList.length,
      organized: filteredGrouped,
      categories: Object.keys(filteredGrouped)
    }));
  } catch (err) {
    return res.json(errorResponse('获取新闻失败: ' + err.message));
  }
});

// 获取特定分类新闻
router.get('/category/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const result = await fetchNews(userConfig.newsApiKey);
    const newsList = result.news;

    const filtered = newsList.filter(item => item.category === name);

    return res.json(successResponse({
      category: name,
      date: todayStr(),
      source: result.source,
      news: filtered,
      total: filtered.length
    }));
  } catch (err) {
    return res.json(errorResponse('获取分类新闻失败: ' + err.message));
  }
});

// 获取新闻摘要（用于简报）
router.get('/briefing', async (req, res) => {
  try {
    const result = await fetchNews(userConfig.newsApiKey);
    const briefing = formatNewsBriefing(result.news);

    return res.json(successResponse({
      date: todayStr(),
      source: result.source,
      briefing
    }));
  } catch (err) {
    return res.json(errorResponse('获取简报失败: ' + err.message));
  }
});

// 初始化新闻推送定时任务（每天08:00）
function initNewsScheduler() {
  schedule.scheduleJob('0 8 * * *', async () => {
    console.log('[新闻定时任务] 准备推送今日新闻简报...');

    try {
      const result = await fetchNews(userConfig.newsApiKey);
      const briefing = formatNewsBriefing(result.news);

      await sendNotification(briefing, '点击查看详情', { force: true });
      console.log('[新闻定时任务] 新闻简报已推送');
    } catch (err) {
      console.error('[新闻定时任务] 推送失败:', err.message);
    }
  });

  console.log('[新闻模块] 定时推送已初始化（每日08:00）');
}

module.exports = { router, initNewsScheduler };