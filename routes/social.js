const express = require('express');
const router = express.Router();
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const { successResponse, errorResponse, todayStr, nowTimeStr } = require('../utils/helpers');
const { store } = require('../utils/store');
const { getLunarBirthdaySolarDate, daysUntilNextBirthday, parseLunarDate } = require('../utils/lunar');

// 创建人脉
router.post('/contact', (req, res) => {
  try {
    const { name, relationship, phone, birthday, birthdayType = 'solar', lunarBirthday, promises, notes, tags } = req.body;

    if (!name) {
      return res.json(errorResponse('请输入姓名'));
    }

    const contact = {
      id: uuidv4(),
      type: 'social',
      contactType: 'person',
      name,
      relationship: relationship || '朋友',
      phone: phone || '',
      birthday: birthday || '',
      birthdayType, // solar 或 lunar
      lunarBirthday: lunarBirthday || '',
      promises: promises || [],
      notes: notes || '',
      tags: tags || [],
      createdAt: new Date().toISOString()
    };

    const result = store.create('social', contact);
    return res.json(successResponse(result, '人脉已添加'));
  } catch (err) {
    return res.json(errorResponse('添加失败: ' + err.message));
  }
});

// 获取所有人脉
router.get('/contacts', (req, res) => {
  try {
    const { relationship, tag } = req.query;
    let contacts = store.query('social', s => s.contactType === 'person');

    if (relationship) {
      contacts = contacts.filter(c => c.relationship === relationship);
    }
    if (tag) {
      contacts = contacts.filter(c => c.tags && c.tags.includes(tag));
    }

    contacts.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

    return res.json(successResponse({ contacts, total: contacts.length }));
  } catch (err) {
    return res.json(errorResponse('获取失败: ' + err.message));
  }
});

// 获取即将到来的生日（未来30天）
router.get('/upcoming-birthdays', (req, res) => {
  try {
    const contacts = store.query('social', s => s.contactType === 'person');
    const today = todayStr();
    const upcoming = [];

    contacts.forEach(contact => {
      if (!contact.birthday && !contact.lunarBirthday) return;

      let nextBirthday = null;
      let daysUntil = null;
      let birthdayType = contact.birthdayType || 'solar';

      if (birthdayType === 'lunar' && contact.lunarBirthday) {
        // 农历生日转公历
        const solarDate = getLunarBirthdaySolarDate(contact.lunarBirthday);
        if (solarDate) {
          nextBirthday = solarDate;
          daysUntil = daysUntilNextBirthday(solarDate);
        }
      } else if (contact.birthday) {
        // 公历生日
        const [month, day] = contact.birthday.includes('-')
          ? contact.birthday.split('-').slice(1)
          : contact.birthday.split('/');
        if (month && day) {
          const thisYear = new Date().getFullYear();
          const birthdayStr = `${thisYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          daysUntil = daysUntilNextBirthday(birthdayStr);
          const nextDate = moment(birthdayStr);
          if (nextDate.isBefore(moment(), 'day')) {
            nextDate.add(1, 'year');
          }
          nextBirthday = nextDate.format('YYYY-MM-DD');
        }
      }

      // 只显示未来30天内的
      if (daysUntil !== null && daysUntil <= 30) {
        upcoming.push({
          contactId: contact.id,
          name: contact.name,
          relationship: contact.relationship,
          nextBirthday,
          daysUntil,
          birthdayType,
          lunarBirthday: contact.lunarBirthday || '',
          isSoon: daysUntil <= 7
        });
      }
    });

    // 按剩余天数排序
    upcoming.sort((a, b) => a.daysUntil - b.daysUntil);

    return res.json(successResponse({
      today,
      upcoming,
      count: upcoming.length,
      withinWeekCount: upcoming.filter(u => u.isSoon).length
    }));
  } catch (err) {
    return res.json(errorResponse('获取生日提醒失败: ' + err.message));
  }
});

// 记录互动
router.post('/interaction', (req, res) => {
  try {
    const { contactId, contactName, content, moodTags = [], nextAppointment, date, time, notes } = req.body;

    if (!contactId && !contactName) {
      return res.json(errorResponse('请指定联系人'));
    }

    // 检查是否有"急躁"标签
    const hasImpatient = moodTags.some(t =>
      t.includes('急躁') || t.includes('不耐烦') || t.includes('生气')
    );

    const interaction = {
      id: uuidv4(),
      type: 'social',
      interactionType: 'interaction',
      contactId: contactId || '',
      contactName: contactName || '',
      content: content || '',
      moodTags,
      hasImpatient,
      nextAppointment: nextAppointment || '',
      date: date || todayStr(),
      time: time || nowTimeStr(),
      notes: notes || '',
      createdAt: new Date().toISOString()
    };

    const result = store.create('social', interaction);

    // 如果有"急躁"标签，为下次互动添加提醒标记
    if (hasImpatient && contactId) {
      // 可以在这里添加提醒逻辑
    }

    return res.json(successResponse(result, '互动已记录'));
  } catch (err) {
    return res.json(errorResponse('记录失败: ' + err.message));
  }
});

// 获取某人的互动时间线
router.get('/contact/:id/timeline', (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50 } = req.query;

    const interactions = store.query('social', s =>
      s.interactionType === 'interaction' && s.contactId === id
    );

    interactions.sort((a, b) =>
      b.date.localeCompare(a.date) || b.time.localeCompare(a.time)
    );

    // 获取联系人信息
    const contact = store.getById('social', id);

    // 统计
    const totalInteractions = interactions.length;
    const lastInteraction = interactions[0];
    const daysSinceLast = lastInteraction
      ? moment().diff(moment(lastInteraction.date), 'days')
      : null;

    // 情绪统计
    const moodStats = {};
    interactions.forEach(i => {
      (i.moodTags || []).forEach(tag => {
        moodStats[tag] = (moodStats[tag] || 0) + 1;
      });
    });

    return res.json(successResponse({
      contact: contact || { id, name: lastInteraction?.contactName || '未知' },
      interactions: interactions.slice(0, parseInt(limit)),
      total: totalInteractions,
      lastInteraction: lastInteraction || null,
      daysSinceLast,
      moodStats
    }));
  } catch (err) {
    return res.json(errorResponse('获取时间线失败: ' + err.message));
  }
});

// 记录家人到访计划
router.post('/visit', (req, res) => {
  try {
    const { name, arriveTime, leaveTime, needPickup = false, pickupLocation = '地铁站', notes } = req.body;

    if (!name || !arriveTime) {
      return res.json(errorResponse('请提供访客姓名和到达时间'));
    }

    // 验证时间格式
    const arriveMoment = moment(arriveTime, 'YYYY-MM-DD HH:mm');
    if (!arriveMoment.isValid()) {
      return res.json(errorResponse('到达时间格式错误，请使用 YYYY-MM-DD HH:mm'));
    }

    const leaveMoment = leaveTime ? moment(leaveTime, 'YYYY-MM-DD HH:mm') : null;

    const visit = {
      id: uuidv4(),
      type: 'social',
      interactionType: 'visit',
      name,
      arriveTime,
      leaveTime: leaveTime || '',
      needPickup: !!needPickup,
      pickupLocation: pickupLocation || '地铁站',
      status: 'upcoming', // upcoming, arrived, left, cancelled
      notes: notes || '',
      date: arriveTime.split(' ')[0],
      createdAt: new Date().toISOString()
    };

    const result = store.create('social', visit);

    // 自动生成接送任务到日程
    if (needPickup) {
      const pickupTime = arriveMoment.clone().subtract(15, 'minutes').format('YYYY-MM-DD HH:mm');
      const { addTaskReminder } = require('../utils/notifier');
      addTaskReminder(
        `去${pickupLocation}接${name}`,
        pickupTime,
        {
          category: '家人到访',
          priority: 'high',
          tags: ['接送', '家人', name],
          notes: `${name}将于${arriveTime}到达，提前15分钟去接`
        }
      );
    }

    // 如果有离开时间，自动生成送站任务
    if (leaveTime && leaveMoment && leaveMoment.isValid()) {
      const dropoffTime = leaveMoment.clone().subtract(15, 'minutes').format('YYYY-MM-DD HH:mm');
      const { addTaskReminder } = require('../utils/notifier');
      addTaskReminder(
        `送${name}去${pickupLocation || '地铁站'}`,
        dropoffTime,
        {
          category: '家人到访',
          priority: 'high',
          tags: ['送别', '家人', name],
          notes: `${name}将于${leaveTime}离开，提前15分钟送站`
        }
      );
    }

    return res.json(successResponse(result, `家人到访计划已记录${needPickup ? '，已自动添加接送任务' : ''}`));
  } catch (err) {
    return res.json(errorResponse('记录失败: ' + err.message));
  }
});

// 获取今日及未来的到访计划
router.get('/visits', (req, res) => {
  try {
    const { upcoming } = req.query;
    const today = todayStr();
    let visits = store.query('social', s => s.interactionType === 'visit');

    if (upcoming === 'true') {
      visits = visits.filter(v => v.date >= today && v.status !== 'cancelled' && v.status !== 'left');
    }

    visits.sort((a, b) => a.arriveTime.localeCompare(b.arriveTime));

    return res.json(successResponse({
      visits,
      total: visits.length,
      upcomingCount: visits.filter(v => v.date >= today && v.status === 'upcoming').length
    }));
  } catch (err) {
    return res.json(errorResponse('获取失败: ' + err.message));
  }
});

// 获取所有人脉的互动统计
router.get('/stats', (req, res) => {
  try {
    const contacts = store.query('social', s => s.contactType === 'person');
    const interactions = store.query('social', s => s.interactionType === 'interaction');
    const visits = store.query('social', s => s.interactionType === 'visit');

    // 按关系分类
    const byRelationship = {};
    contacts.forEach(c => {
      const rel = c.relationship || '其他';
      if (!byRelationship[rel]) byRelationship[rel] = 0;
      byRelationship[rel]++;
    });

    // 本月互动数
    const thisMonth = moment().format('YYYY-MM');
    const thisMonthInteractions = interactions.filter(i =>
      i.date.startsWith(thisMonth)
    );

    // 有"急躁"标签的互动
    const impatientInteractions = interactions.filter(i => i.hasImpatient);

    return res.json(successResponse({
      totalContacts: contacts.length,
      byRelationship,
      totalInteractions: interactions.length,
      thisMonthInteractions: thisMonthInteractions.length,
      impatientCount: impatientInteractions.length,
      totalVisits: visits.length,
      upcomingVisits: visits.filter(v => v.status === 'upcoming').length
    }));
  } catch (err) {
    return res.json(errorResponse('获取统计失败: ' + err.message));
  }
});

module.exports = router;
