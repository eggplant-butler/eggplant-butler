const express = require('express');
const router = express.Router();
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const { successResponse, errorResponse, todayStr, nowTimeStr, daysBetween } = require('../utils/helpers');
const { store } = require('../utils/store');
const userConfig = require('../config/user');

// 切换工作模式
router.post('/mode', (req, res) => {
  try {
    const { mode } = req.body;

    if (!['sales', 'tutoring', 'interview', 'other'].includes(mode)) {
      return res.json(errorResponse('模式必须是 sales, tutoring, interview, other 之一'));
    }

    // 存储模式设置
    const settings = store.getAll('settings');
    let modeSetting = settings.find(s => s.key === 'work_mode');

    if (modeSetting) {
      store.update('settings', modeSetting.id, {
        value: mode,
        updatedAt: new Date().toISOString()
      });
    } else {
      store.create('settings', {
        id: uuidv4(),
        key: 'work_mode',
        value: mode,
        createdAt: new Date().toISOString()
      });
    }

    const modeLabels = {
      sales: '销售模式',
      tutoring: '家教模式',
      interview: '面试模式',
      other: '其他模式'
    };

    return res.json(successResponse({ mode }, `工作模式已切换为${modeLabels[mode]}`));
  } catch (err) {
    return res.json(errorResponse('切换模式失败: ' + err.message));
  }
});

// 获取当前工作模式
router.get('/mode', (req, res) => {
  try {
    const settings = store.getAll('settings');
    const modeSetting = settings.find(s => s.key === 'work_mode');
    const mode = modeSetting ? modeSetting.value : userConfig.currentWorkMode;

    const modeLabels = {
      sales: '销售模式',
      tutoring: '家教模式',
      interview: '面试模式',
      other: '其他模式'
    };

    return res.json(successResponse({
      mode,
      label: modeLabels[mode] || mode
    }));
  } catch (err) {
    return res.json(errorResponse('获取模式失败: ' + err.message));
  }
});

// ====== 销售模式 ======

// 添加客户
router.post('/client', (req, res) => {
  try {
    const { name, company, phone, source, status = 'new', notes, tags } = req.body;

    if (!name) {
      return res.json(errorResponse('请输入客户姓名'));
    }

    const client = {
      id: uuidv4(),
      type: 'work',
      workType: 'client',
      name,
      company: company || '',
      phone: phone || '',
      source: source || '',
      status, // new, following, deal, lost
      lastContact: todayStr(),
      notes: notes || '',
      tags: tags || [],
      createdAt: new Date().toISOString()
    };

    const result = store.create('work', client);
    return res.json(successResponse(result, '客户已添加'));
  } catch (err) {
    return res.json(errorResponse('添加失败: ' + err.message));
  }
});

// 记录客户互动
router.post('/interaction', (req, res) => {
  try {
    const { clientId, clientName, type, content, outcome, nextFollowUp, date, time, notes } = req.body;

    if (!clientId && !clientName) {
      return res.json(errorResponse('请指定客户'));
    }

    const interaction = {
      id: uuidv4(),
      type: 'work',
      workType: 'interaction',
      clientId: clientId || '',
      clientName: clientName || '',
      interactionType: type || 'call', // call, visit, message, meeting
      content: content || '',
      outcome: outcome || '', // positive, neutral, negative
      nextFollowUp: nextFollowUp || '',
      date: date || todayStr(),
      time: time || nowTimeStr(),
      notes: notes || '',
      createdAt: new Date().toISOString()
    };

    const result = store.create('work', interaction);

    // 更新客户最后联系时间
    if (clientId) {
      const client = store.getById('work', clientId);
      if (client) {
        store.update('work', clientId, { lastContact: todayStr() });
      }
    }

    return res.json(successResponse(result, '互动已记录'));
  } catch (err) {
    return res.json(errorResponse('记录失败: ' + err.message));
  }
});

// 获取48小时未跟进的客户
router.get('/clients/follow-up-needed', (req, res) => {
  try {
    const clients = store.query('work', w => w.workType === 'client' && w.status !== 'deal' && w.status !== 'lost');
    const today = todayStr();

    const needFollowUp = clients.filter(client => {
      const daysSince = daysBetween(client.lastContact, today);
      return daysSince >= 2;
    }).map(client => {
      const daysSince = daysBetween(client.lastContact, today);
      return {
        ...client,
        daysSinceLastContact: daysSince,
        urgency: daysSince >= 5 ? 'high' : 'medium'
      };
    });

    needFollowUp.sort((a, b) => b.daysSinceLastContact - a.daysSinceLastContact);

    return res.json(successResponse({
      clients: needFollowUp,
      count: needFollowUp.length,
      highUrgencyCount: needFollowUp.filter(c => c.urgency === 'high').length
    }));
  } catch (err) {
    return res.json(errorResponse('获取失败: ' + err.message));
  }
});

// ====== 家教模式 ======

// 添加学生
router.post('/student', (req, res) => {
  try {
    const { name, grade, subject, phone, parentName, rate, schedule, notes } = req.body;

    if (!name) {
      return res.json(errorResponse('请输入学生姓名'));
    }

    const student = {
      id: uuidv4(),
      type: 'work',
      workType: 'student',
      name,
      grade: grade || '',
      subject: subject || '',
      phone: phone || '',
      parentName: parentName || '',
      rate: rate || 0,
      schedule: schedule || [],
      notes: notes || '',
      status: 'active',
      createdAt: new Date().toISOString()
    };

    const result = store.create('work', student);
    return res.json(successResponse(result, '学生已添加'));
  } catch (err) {
    return res.json(errorResponse('添加失败: ' + err.message));
  }
});

// 记录课程
router.post('/lesson', (req, res) => {
  try {
    const { studentId, studentName, subject, duration, date, time, content, homework, payment, notes } = req.body;

    if (!studentId && !studentName) {
      return res.json(errorResponse('请指定学生'));
    }

    const lesson = {
      id: uuidv4(),
      type: 'work',
      workType: 'lesson',
      studentId: studentId || '',
      studentName: studentName || '',
      subject: subject || '',
      duration: duration || 120,
      date: date || todayStr(),
      time: time || nowTimeStr(),
      content: content || '',
      homework: homework || '',
      payment: payment || 0,
      paid: false,
      notes: notes || '',
      createdAt: new Date().toISOString()
    };

    const result = store.create('work', lesson);
    return res.json(successResponse(result, '课程已记录'));
  } catch (err) {
    return res.json(errorResponse('记录失败: ' + err.message));
  }
});

// ====== 面试模式 ======

// 添加面试公司
router.post('/interview', (req, res) => {
  try {
    const { company, position, interviewDate, interviewTime, round, location, prepItems, notes } = req.body;

    if (!company) {
      return res.json(errorResponse('请输入公司名称'));
    }

    const interview = {
      id: uuidv4(),
      type: 'work',
      workType: 'interview',
      company,
      position: position || '',
      interviewDate: interviewDate || todayStr(),
      interviewTime: interviewTime || '',
      round: round || 1,
      location: location || '',
      prepItems: prepItems || [],
      status: 'upcoming', // upcoming, passed, failed
      notes: notes || '',
      createdAt: new Date().toISOString()
    };

    const result = store.create('work', interview);
    return res.json(successResponse(result, '面试已添加'));
  } catch (err) {
    return res.json(errorResponse('添加失败: ' + err.message));
  }
});

// 面试复盘
router.post('/interview/:id/review', (req, res) => {
  try {
    const { id } = req.params;
    const { questions, answers, feedback, result, notes } = req.body;

    const interview = store.getById('work', id);
    if (!interview) {
      return res.json(errorResponse('面试记录不存在'));
    }

    const updated = store.update('work', id, {
      review: {
        questions: questions || [],
        answers: answers || [],
        feedback: feedback || '',
        result: result || 'pending'
      },
      status: result === 'passed' ? 'passed' : (result === 'failed' ? 'failed' : 'upcoming'),
      reviewNotes: notes || '',
      reviewedAt: new Date().toISOString()
    });

    return res.json(successResponse(updated, '复盘已记录'));
  } catch (err) {
    return res.json(errorResponse('记录失败: ' + err.message));
  }
});

// 每日工作复盘
router.get('/daily-review', (req, res) => {
  try {
    const today = todayStr();
    const settings = store.getAll('settings');
    const modeSetting = settings.find(s => s.key === 'work_mode');
    const mode = modeSetting ? modeSetting.value : userConfig.currentWorkMode;

    const todayWork = store.query('work', w => {
      if (w.workType === 'interaction' || w.workType === 'lesson') {
        return w.date === today;
      }
      if (w.workType === 'interview') {
        return w.interviewDate === today;
      }
      return false;
    });

    // 根据模式生成不同的复盘
    let reviewData = {};

    if (mode === 'sales') {
      const clients = store.query('work', w => w.workType === 'client');
      const interactions = store.query('work', w => w.workType === 'interaction' && w.date === today);
      const needFollowUp = clients.filter(c => c.status !== 'deal' && c.status !== 'lost')
        .filter(c => daysBetween(c.lastContact, today) >= 2);

      reviewData = {
        mode: 'sales',
        todayInteractions: interactions.length,
        positiveInteractions: interactions.filter(i => i.outcome === 'positive').length,
        totalClients: clients.length,
        activeClients: clients.filter(c => c.status === 'following').length,
        needFollowUpCount: needFollowUp.length
      };
    } else if (mode === 'tutoring') {
      const students = store.query('work', w => w.workType === 'student');
      const lessons = store.query('work', w => w.workType === 'lesson' && w.date === today);
      const totalMinutes = lessons.reduce((sum, l) => sum + (l.duration || 0), 0);
      const totalEarnings = lessons.reduce((sum, l) => sum + (l.payment || 0), 0);

      reviewData = {
        mode: 'tutoring',
        todayLessons: lessons.length,
        totalMinutes,
        totalEarnings,
        totalStudents: students.length,
        activeStudents: students.filter(s => s.status === 'active').length
      };
    } else if (mode === 'interview') {
      const interviews = store.query('work', w => w.workType === 'interview');
      const upcoming = interviews.filter(i => i.status === 'upcoming');

      reviewData = {
        mode: 'interview',
        totalInterviews: interviews.length,
        upcomingCount: upcoming.length,
        passedCount: interviews.filter(i => i.status === 'passed').length,
        todayInterviews: interviews.filter(i => i.interviewDate === today).length
      };
    }

    return res.json(successResponse({
      date: today,
      mode,
      ...reviewData,
      todayWorkItems: todayWork
    }));
  } catch (err) {
    return res.json(errorResponse('获取复盘失败: ' + err.message));
  }
});

// 获取客户/学生列表
router.get('/clients', (req, res) => {
  try {
    const { status } = req.query;
    let clients = store.query('work', w => w.workType === 'client');

    if (status) {
      clients = clients.filter(c => c.status === status);
    }

    return res.json(successResponse({ clients, total: clients.length }));
  } catch (err) {
    return res.json(errorResponse('获取失败: ' + err.message));
  }
});

module.exports = router;
