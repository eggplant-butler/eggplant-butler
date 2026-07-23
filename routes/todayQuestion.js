const express = require('express');
const router = express.Router();
const moment = require('moment');
const { successResponse, errorResponse, todayStr } = require('../utils/helpers');
const { store } = require('../utils/store');

// 获取今日之问
router.get('/', (req, res) => {
  try {
    const today = todayStr();
    const yesterday = moment().subtract(1, 'days').format('YYYY-MM-DD');

    // 收集昨日各模块数据
    const data = collectYesterdayData(yesterday);

    // 根据数据动态生成问题
    const question = generateQuestion(data, yesterday);

    return res.json(successResponse({
      date: today,
      question,
      context: data.summary,
      category: question.category
    }));
  } catch (err) {
    return res.json(errorResponse('生成问题失败: ' + err.message));
  }
});

// 收集昨日数据
function collectYesterdayData(yesterday) {
  const data = {
    finance: {
      expense: 0,
      expenseCount: 0,
      categories: {}
    },
    work: {
      interactions: 0,
      clients: 0
    },
    photo: {
      logs: 0
    },
    reading: {
      logs: 0,
      minutes: 0
    },
    joy: {
      joys: 0,
      wins: 0
    },
    habit: {
      completed: 0,
      total: 7
    },
    social: {
      interactions: 0
    },
    health: {
      water: 0,
      exercise: false
    }
  };

  // 财务
  const financeRecords = store.getAll('finance');
  const yesterdayExpenses = financeRecords.filter(f => f.type === 'expense' && f.date === yesterday);
  data.finance.expense = yesterdayExpenses.reduce((s, f) => s + parseFloat(f.amount || 0), 0);
  data.finance.expenseCount = yesterdayExpenses.length;
  yesterdayExpenses.forEach(e => {
    const cat = e.category || '其他';
    data.finance.categories[cat] = (data.finance.categories[cat] || 0) + 1;
  });

  // 工作
  const workRecords = store.getAll('work');
  data.work.interactions = workRecords.filter(w => w.workType === 'interaction' && w.date === yesterday).length;
  data.work.clients = workRecords.filter(w => w.workType === 'client').length;

  // 摄影
  const photoRecords = store.getAll('photos');
  data.photo.logs = photoRecords.filter(p => p.photoType === 'log' && p.date === yesterday).length;

  // 阅读
  const readingRecords = store.getAll('reading');
  const yesterdayReading = readingRecords.filter(r => r.readingType === 'log' && r.date === yesterday);
  data.reading.logs = yesterdayReading.length;
  data.reading.minutes = yesterdayReading.reduce((s, r) => s + (r.durationMinutes || 0), 0);

  // 小确幸
  const joyRecords = store.getAll('joys');
  data.joy.joys = joyRecords.filter(j => j.joyType === 'joy' && j.date === yesterday).length;
  data.joy.wins = joyRecords.filter(j => j.joyType === 'win' && j.date === yesterday).length;

  // 习惯
  const habitRecords = store.getAll('habits');
  const yesterdayHabits = habitRecords.filter(h => h.date === yesterday);
  data.habit.completed = new Set(yesterdayHabits.map(h => h.habitType)).size;

  // 社交
  const socialRecords = store.getAll('social');
  data.social.interactions = socialRecords.filter(s => s.interactionType === 'interaction' && s.date === yesterday).length;

  // 健康
  const healthRecords = store.getAll('health');
  const yesterdayWater = healthRecords.filter(h => h.healthType === 'water' && h.date === yesterday);
  data.health.water = yesterdayWater.reduce((s, w) => s + parseFloat(w.amount || 0), 0);
  data.health.exercise = habitRecords.some(h => h.habitType === 'exercise' && h.date === yesterday);

  // 睡眠质量检查：最近3天睡眠评分
  const sleepRecords = healthRecords.filter(h =>
    h.healthType === 'sync' && h.dataType === 'sleep' && h.sleepScore !== undefined
  );
  const sleepByDate = {};
  sleepRecords.forEach(r => {
    if (!sleepByDate[r.date] || (r.createdAt > sleepByDate[r.date].createdAt)) {
      sleepByDate[r.date] = r;
    }
  });
  // 检查最近3天（从昨天往前）
  let lowSleepDays = 0;
  for (let i = 1; i <= 3; i++) {
    const checkDate = moment().subtract(i, 'days').format('YYYY-MM-DD');
    if (sleepByDate[checkDate] && sleepByDate[checkDate].sleepScore < 60) {
      lowSleepDays++;
    }
  }
  data.health.lowSleepScoreStreak = lowSleepDays >= 3;

  // 情绪
  const emotionRecords = store.getAll('emotions');
  const yesterdayEmotions = emotionRecords.filter(e => e.date === yesterday);
  data.emotion = {
    records: yesterdayEmotions.length,
    avgScore: yesterdayEmotions.length > 0
      ? (yesterdayEmotions.reduce((s, e) => s + e.score, 0) / yesterdayEmotions.length).toFixed(1)
      : null,
    lowestScore: yesterdayEmotions.length > 0
      ? Math.min(...yesterdayEmotions.map(e => e.score))
      : null,
    tags: [...new Set(yesterdayEmotions.flatMap(e => e.tags || []))],
    notes: yesterdayEmotions.map(e => e.notes).filter(Boolean)
  };

  // 生成摘要
  data.summary = generateSummary(data);

  return data;
}

function generateSummary(data) {
  const parts = [];
  if (data.finance.expense > 0) {
    parts.push(`支出${data.finance.expense.toFixed(0)}元`);
  }
  if (data.reading.logs > 0) {
    parts.push(`阅读${data.reading.minutes}分钟`);
  }
  if (data.photo.logs > 0) {
    parts.push(`摄影${data.photo.logs}次`);
  }
  if (data.joy.joys > 0) {
    parts.push(`${data.joy.joys}件小确幸`);
  }
  if (data.work.interactions > 0) {
    parts.push(`工作互动${data.work.interactions}次`);
  }
  if (data.emotion.avgScore !== null) {
    const label = data.emotion.avgScore >= 4 ? '愉快' : (data.emotion.avgScore <= 2 ? '低落' : '平稳');
    parts.push(`情绪${label}(${data.emotion.avgScore}分)`);
  }
  parts.push(`习惯完成${data.habit.completed}/${data.habit.total}`);
  return parts.join('，');
}

// 根据数据生成问题
function generateQuestion(data, yesterday) {
  const questions = [];

  // 财务相关问题
  if (data.finance.expense > 100) {
    questions.push({
      text: `昨天花费了${data.finance.expense.toFixed(0)}元，主要花在了哪里？有哪些是可以优化的？`,
      category: '财务',
      priority: 'high'
    });
  }

  // 工作相关问题
  if (data.work.interactions > 0) {
    questions.push({
      text: `昨天有${data.work.interactions}次工作互动，收获最大的是哪一次？学到了什么？`,
      category: '工作',
      priority: 'medium'
    });
  }

  // 摄影相关问题
  if (data.photo.logs > 0) {
    questions.push({
      text: '昨天拍了照片，最满意的是哪一张？如果重拍会怎么改进？',
      category: '摄影',
      priority: 'medium'
    });
  }

  // 阅读相关问题
  if (data.reading.logs > 0) {
    questions.push({
      text: `昨天读了${data.reading.minutes}分钟的书，印象最深的观点或句子是什么？`,
      category: '阅读',
      priority: 'medium'
    });
  }

  // 小确幸相关
  if (data.joy.joys > 0) {
    questions.push({
      text: `昨天记录了${data.joy.joys}件小确幸，最让你开心的是哪一件？为什么？`,
      category: '小确幸',
      priority: 'low'
    });
  }

  // 习惯相关
  if (data.habit.completed < data.habit.total) {
    const missed = data.habit.total - data.habit.completed;
    questions.push({
      text: `昨天有${missed}个习惯没完成，是什么原因？今天能补上吗？`,
      category: '习惯',
      priority: 'medium'
    });
  }

  // 社交相关
  if (data.social.interactions === 0) {
    questions.push({
      text: '昨天好像没有社交互动，今天想联系谁聊聊吗？',
      category: '社交',
      priority: 'low'
    });
  }

  // 情绪相关问题
  if (data.emotion.avgScore !== null) {
    const score = parseFloat(data.emotion.avgScore);
    if (score <= 2) {
      questions.push({
        text: `昨天情绪平均分只有${score}分，今天什么时候情绪最低落？触发点是什么？可以尝试什么方法改善？`,
        category: '情绪',
        priority: 'high'
      });
    } else if (score >= 4) {
      questions.push({
        text: `昨天情绪不错（${score}分）！是什么让你感到开心？如何让这种状态延续到今天？`,
        category: '情绪',
        priority: 'low'
      });
    } else {
      questions.push({
        text: `昨天情绪${score}分，今天什么时候情绪最低落？触发点是什么？`,
        category: '情绪',
        priority: 'medium'
      });
    }

    // 如果有急躁标签，追加反思问题
    if (data.emotion.tags.some(t => t.includes('急躁'))) {
      questions.push({
        text: '昨天记录了"急躁"情绪，当时是什么触发了这种感觉？下次遇到类似情况可以怎么应对？',
        category: '情绪',
        priority: 'high'
      });
    }
  }

  // 健康相关
  if (!data.health.exercise) {
    questions.push({
      text: '昨天没有运动，今天打算动一动吗？哪怕10分钟也好~',
      category: '健康',
      priority: 'low'
    });
  }

  // 睡眠质量相关：连续3天睡眠评分低于60
  if (data.health.lowSleepScoreStreak) {
    questions.push({
      text: '最近睡得好吗？是不是该提前30分钟上床？连续几天睡眠评分偏低，今晚试试早睡吧~',
      category: '睡眠',
      priority: 'high'
    });
  }

  // 默认问题
  if (questions.length === 0) {
    const defaultQuestions = [
      { text: '今天最想完成的一件事是什么？', category: '通用', priority: 'medium' },
      { text: '最近有什么让你感到满足的事情吗？', category: '反思', priority: 'low' },
      { text: '如果今天可以重来，你会做什么不同的选择？', category: '反思', priority: 'low' },
      { text: '你最近在学习什么新东西？进展如何？', category: '成长', priority: 'medium' },
      { text: '今天想感恩什么人或事？', category: '感恩', priority: 'low' }
    ];
    // 根据日期选一个
    const dayOfWeek = moment(yesterday).day();
    questions.push(defaultQuestions[dayOfWeek % defaultQuestions.length]);
  }

  // 返回优先级最高的问题
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  questions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return questions[0];
}

// 获取历史问题列表
router.get('/history', (req, res) => {
  try {
    const { limit = 30 } = req.query;
    const questions = store.getAll('daily_questions') || [];
    questions.sort((a, b) => b.date.localeCompare(a.date));

    return res.json(successResponse({
      questions: questions.slice(0, parseInt(limit)),
      total: questions.length
    }));
  } catch (err) {
    return res.json(errorResponse('获取失败: ' + err.message));
  }
});

// 回答今日之问
router.post('/answer', (req, res) => {
  try {
    const { date, answer, question } = req.body;

    const record = {
      id: require('uuid').v4(),
      date: date || todayStr(),
      question,
      answer,
      createdAt: new Date().toISOString()
    };

    const questions = store.getAll('daily_questions') || [];
    questions.push(record);
    // 这里使用通用存储
    const fs = require('fs');
    const path = require('path');
    const dataPath = path.join(__dirname, '..', 'data', 'daily_questions.json');
    fs.writeFileSync(dataPath, JSON.stringify(questions, null, 2));

    return res.json(successResponse(record, '回答已记录'));
  } catch (err) {
    return res.json(errorResponse('记录失败: ' + err.message));
  }
});

module.exports = router;
