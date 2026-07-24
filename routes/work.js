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

// ====== 技能评分（仅销售模式） ======

// 工作技能评分
router.post('/skill-score', (req, res) => {
  try {
    // 检查当前模式是否为 sales
    const settings = store.getAll('settings');
    const modeSetting = settings.find(s => s.key === 'work_mode');
    const mode = modeSetting ? modeSetting.value : userConfig.currentWorkMode;

    if (mode !== 'sales') {
      return res.json(errorResponse('技能评分仅限销售模式下使用'));
    }

    const { date, skills, notes } = req.body;
    const skillNames = ['icebreaking', 'needs_discovery', 'closing', 'follow_up', 'presentation', 'negotiation'];
    const skillLabels = {
      icebreaking: '破冰',
      needs_discovery: '需求挖掘',
      closing: '促单成交',
      follow_up: '跟进维护',
      presentation: '方案展示',
      negotiation: '谈判议价'
    };

    if (!skills) {
      return res.json(errorResponse('请提供技能评分数据'));
    }

    // 校验每个技能分数范围
    for (const name of skillNames) {
      if (skills[name] !== undefined) {
        const score = parseInt(skills[name]);
        if (isNaN(score) || score < 1 || score > 5) {
          return res.json(errorResponse(`技能 ${skillLabels[name]} 的评分必须是1-5的整数`));
        }
      }
    }

    // 构建存储记录
    const record = {
      id: uuidv4(),
      type: 'work_skill_score',
      date: date || todayStr(),
      time: nowTimeStr(),
      skills: {},
      notes: notes || '',
      mode: 'sales',
      createdAt: new Date().toISOString()
    };

    // 只存储提供的技能评分
    for (const name of skillNames) {
      if (skills[name] !== undefined) {
        record.skills[name] = parseInt(skills[name]);
      }
    }

    const result = store.create('work', record);
    return res.json(successResponse(result, '技能评分已记录'));
  } catch (err) {
    return res.json(errorResponse('记录技能评分失败: ' + err.message));
  }
});

// 技能趋势分析
router.get('/skill-trend', (req, res) => {
  try {
    const now = moment();
    const thirtyDaysAgo = now.clone().subtract(30, 'days').format('YYYY-MM-DD');

    // 读取近30天的技能评分记录
    const allWork = store.getAll('work');
    const skillRecords = allWork.filter(r => {
      return r.type === 'work_skill_score' && r.date >= thirtyDaysAgo;
    }).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

    const skillNames = ['icebreaking', 'needs_discovery', 'closing', 'follow_up', 'presentation', 'negotiation'];
    const skillLabels = {
      icebreaking: '破冰',
      needs_discovery: '需求挖掘',
      closing: '促单成交',
      follow_up: '跟进维护',
      presentation: '方案展示',
      negotiation: '谈判议价'
    };

    if (skillRecords.length === 0) {
      return res.json(successResponse({
        skills: skillNames.map(name => ({
          name,
          label: skillLabels[name],
          avgScore: 0,
          trend: 'stable',
          suggestion: '暂无数据，请先记录技能评分'
        })),
        overallTrend: 'stable',
        overallAvg: 0,
        recentScores: []
      }));
    }

    // 计算每个技能的平均分和趋势
    const skillsAnalysis = skillNames.map(name => {
      const scores = skillRecords
        .filter(r => r.skills && r.skills[name] !== undefined)
        .map(r => r.skills[name]);

      const avgScore = scores.length > 0
        ? parseFloat((scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(1))
        : 0;

      // 趋势判断：将最近评分分为前半和后半
      let trend = 'stable';
      if (scores.length >= 4) {
        const mid = Math.floor(scores.length / 2);
        const firstHalf = scores.slice(0, mid);
        const secondHalf = scores.slice(mid);
        const firstAvg = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
        const diff = secondAvg - firstAvg;

        if (diff > 0.3) {
          trend = 'up';
        } else if (diff < -0.3) {
          trend = 'down';
        }
      } else if (scores.length >= 2) {
        const diff = scores[scores.length - 1] - scores[0];
        if (diff >= 1) trend = 'up';
        else if (diff <= -1) trend = 'down';
      }

      // 生成改进建议
      const suggestions = [];
      if (avgScore === 0) {
        suggestions.push('暂无评分记录，建议持续记录');
      } else if (avgScore < 2.5) {
        suggestions.push(`${skillLabels[name]}能力偏弱，建议加强专项训练和角色扮演练习`);
      } else if (avgScore < 3.5) {
        suggestions.push(`${skillLabels[name]}处于中等水平，可通过刻意练习和复盘进一步提升`);
      } else if (avgScore >= 4.5) {
        suggestions.push(`${skillLabels[name]}表现优秀，可考虑总结经验分享给团队`);
      }

      if (trend === 'down') {
        suggestions.push(`近期${skillLabels[name]}评分呈下降趋势，建议回顾最近的客户互动，找出不足之处`);
      } else if (trend === 'up') {
        suggestions.push(`${skillLabels[name]}评分持续上升，保持当前的学习节奏`);
      }

      return {
        name,
        label: skillLabels[name],
        avgScore,
        trend,
        count: scores.length,
        suggestion: suggestions.join('。') || '表现稳定，继续保持'
      };
    });

    // 总体趋势
    const allAvgs = skillsAnalysis.filter(s => s.count > 0).map(s => s.avgScore);
    const overallAvg = allAvgs.length > 0
      ? parseFloat((allAvgs.reduce((s, v) => s + v, 0) / allAvgs.length).toFixed(1))
      : 0;

    let overallTrend = 'stable';
    if (skillRecords.length >= 4) {
      const mid = Math.floor(skillRecords.length / 2);
      const firstHalf = skillRecords.slice(0, mid);
      const secondHalf = skillRecords.slice(mid);

      const firstOverallAvg = firstHalf.reduce((sum, r) => {
        const vals = Object.values(r.skills || {});
        return sum + (vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0);
      }, 0) / firstHalf.length;

      const secondOverallAvg = secondHalf.reduce((sum, r) => {
        const vals = Object.values(r.skills || {});
        return sum + (vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0);
      }, 0) / secondHalf.length;

      if (secondOverallAvg - firstOverallAvg > 0.3) overallTrend = 'up';
      else if (secondOverallAvg - firstOverallAvg < -0.3) overallTrend = 'down';
    }

    // 结合转化率估算收入影响
    const recentClients = store.query('work', w => w.workType === 'client');
    const totalClients = recentClients.length;
    const dealClients = recentClients.filter(c => c.status === 'deal').length;
    const conversionRate = totalClients > 0 ? (dealClients / totalClients * 100).toFixed(1) : null;

    let revenueImpact = null;
    if (conversionRate !== null && overallAvg > 0) {
      // 简单估算：技能平均分每提升1分，转化率预计提升约5%
      const estimatedRateIncrease = ((overallAvg / 5) * 5).toFixed(1);
      revenueImpact = {
        currentConversionRate: `${conversionRate}%`,
        estimatedRatePerSkillPoint: '5%',
        suggestion: overallAvg < 3.0
          ? `当前转化率 ${conversionRate}%，技能评分有较大提升空间，提高技能评分有望显著提升转化率和收入`
          : `当前转化率 ${conversionRate}%，技能水平良好，建议重点攻克短板技能以进一步突破`
      };
    }

    // 最近评分记录
    const recentScores = skillRecords.slice(-10).map(r => ({
      id: r.id,
      date: r.date,
      skills: r.skills,
      notes: r.notes || ''
    }));

    return res.json(successResponse({
      skills: skillsAnalysis,
      overallTrend,
      overallAvg,
      conversionRate: conversionRate !== null ? `${conversionRate}%` : null,
      revenueImpact,
      recentScores
    }));
  } catch (err) {
    return res.json(errorResponse('获取技能趋势失败: ' + err.message));
  }
});

module.exports = router;
