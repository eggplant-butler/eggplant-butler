const schedule = require('node-schedule');
const axios = require('axios');
const userConfig = require('../config/user');
const { isQuietHours, todayStr, nowTimeStr } = require('./helpers');
const { store } = require('./store');
const { v4: uuidv4 } = require('uuid');

// 推送通知（预留PushPlus接口）
async function sendNotification(title, content, options = {}) {
  const { force = false } = options;

  // 安静时段检查（天气预警等强制通知除外）
  if (!force && isQuietHours(userConfig.quietHours)) {
    console.log(`[安静时段] 通知已延迟: ${title}`);
    return { sent: false, reason: 'quiet_hours' };
  }

  const token = process.env.PUSHPLUS_TOKEN;

  if (token) {
    try {
      await axios.post('http://www.pushplus.plus/send', {
        token,
        title,
        content,
        template: 'html'
      });
      console.log(`[推送成功] ${title}`);
      return { sent: true, channel: 'pushplus' };
    } catch (err) {
      console.error(`[推送失败] ${title}:`, err.message);
    }
  } else {
    // 未配置token，控制台打印
    console.log(`\n=== 通知 ===`);
    console.log(`标题: ${title}`);
    console.log(`内容: ${content}`);
    console.log(`时间: ${new Date().toLocaleString()}`);
    console.log(`============\n`);
    return { sent: true, channel: 'console' };
  }

  return { sent: false, reason: 'unknown' };
}

// 向待办任务添加提醒
async function addTaskReminder(title, remindAt, options = {}) {
  const task = {
    id: uuidv4(),
    type: 'task',
    title,
    category: options.category || '提醒',
    date: todayStr(),
    time: nowTimeStr(),
    status: 'todo',
    remindAt,
    relatedPerson: options.relatedPerson || '',
    notes: options.notes || '',
    priority: options.priority || 'medium',
    tags: options.tags || [],
    createdAt: new Date().toISOString()
  };

  store.create('tasks', task);
  return task;
}

// 每小时检查今日提醒
function startHourlyReminderCheck() {
  // 每小时的第0分执行
  schedule.scheduleJob('0 * * * *', async () => {
    console.log('[定时任务] 检查今日提醒...');
    const today = todayStr();
    const nowHour = new Date().getHours();

    // 检查任务提醒
    const tasks = store.query('tasks', t =>
      t.status === 'todo' && t.remindAt && t.date === today
    );

    for (const task of tasks) {
      if (task.remindAt) {
        const remindHour = parseInt(task.remindAt.split(' ')[1]?.split(':')[0]);
        if (remindHour === nowHour) {
          await sendNotification(`⏰ 提醒: ${task.title}`, task.notes || '该处理啦！');
        }
      }
    }
  });

  console.log('[通知调度器] 每小时提醒检查已启动');
}

// 启动所有定时任务
function startAllSchedulers() {
  startHourlyReminderCheck();
}

module.exports = {
  sendNotification,
  addTaskReminder,
  startAllSchedulers
};
