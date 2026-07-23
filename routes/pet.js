const express = require('express');
const router = express.Router();
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const { successResponse, errorResponse, todayStr, nowTimeStr, daysBetween } = require('../utils/helpers');
const { store } = require('../utils/store');
const userConfig = require('../config/user');

// 记录宠物事件
router.post('/event', (req, res) => {
  try {
    const { eventType, petName, date, time, notes, weight, tags } = req.body;

    if (!eventType) {
      return res.json(errorResponse('请指定事件类型'));
    }

    const eventLabels = {
      deworming: '驱虫',
      vaccine: '疫苗',
      weight: '体重记录',
      litter_clean: '猫砂盆清洁',
      litter_change: '猫砂更换',
      bath: '洗澡',
      grooming: '梳毛',
      nail_trim: '剪指甲',
      paw_shave: '剃脚毛',
      ear_clean: '耳朵清洁',
      feeding: '喂食',
      vet_visit: '看医生',
      play: '玩耍'
    };

    const event = {
      id: uuidv4(),
      type: 'pet',
      eventType,
      petName: petName || userConfig.petName,
      title: eventLabels[eventType] || eventType,
      weight: weight || null,
      date: date || todayStr(),
      time: time || nowTimeStr(),
      notes: notes || '',
      tags: tags || [],
      createdAt: new Date().toISOString()
    };

    const result = store.create('pets', event);
    return res.json(successResponse(result, '宠物事件已记录'));
  } catch (err) {
    return res.json(errorResponse('记录失败: ' + err.message));
  }
});

// 获取宠物护理提醒
router.get('/reminder', (req, res) => {
  try {
    const today = todayStr();
    const events = store.getAll('pets');

    // 各类事件的周期（天）
    const cycles = {
      deworming: 30,       // 驱虫每月
      litter_clean: 3,     // 猫砂盆清洁每3天
      litter_change: 14,   // 猫砂更换每2周
      nail_trim: 10,       // 剪指甲每10天
      paw_shave: 15,       // 剃脚毛每15天
      ear_clean: 14,       // 耳朵清洁每2周
      bath: 30,            // 洗澡每月
      vaccine: 365         // 疫苗每年
    };

    const labels = {
      deworming: '驱虫',
      litter_clean: '猫砂盆清洁',
      litter_change: '更换猫砂',
      nail_trim: '剪指甲',
      paw_shave: '剃脚毛',
      ear_clean: '耳朵清洁',
      bath: '洗澡',
      vaccine: '疫苗接种',
      weight: '称体重'
    };

    const reminders = [];

    for (const [eventType, cycleDays] of Object.entries(cycles)) {
      const typeEvents = events
        .filter(e => e.eventType === eventType)
        .sort((a, b) => b.date.localeCompare(a.date));

      const lastEvent = typeEvents[0];
      const lastDate = lastEvent ? lastEvent.date : null;
      const daysSince = lastDate ? daysBetween(lastDate, today) : cycleDays;
      const due = daysSince >= cycleDays;
      const overdueDays = due ? daysSince - cycleDays : 0;

      reminders.push({
        eventType,
        label: labels[eventType] || eventType,
        cycleDays,
        lastDate,
        daysSince,
        due,
        overdueDays,
        nextDueDate: lastDate
          ? moment(lastDate).add(cycleDays, 'days').format('YYYY-MM-DD')
          : today,
        priority: overdueDays > 3 ? 'high' : (due ? 'medium' : 'low')
      });
    }

    // 按紧急程度排序
    reminders.sort((a, b) => b.overdueDays - a.overdueDays || a.daysSince - b.daysSince);

    const dueItems = reminders.filter(r => r.due);

    return res.json(successResponse({
      petName: userConfig.petName,
      today,
      reminders,
      dueCount: dueItems.length,
      dueItems
    }));
  } catch (err) {
    return res.json(errorResponse('获取提醒失败: ' + err.message));
  }
});

// 宠物紧急症状记录
router.post('/emergency', (req, res) => {
  try {
    const { symptoms, petName, date, time, notes } = req.body;

    if (!symptoms || symptoms.length === 0) {
      return res.json(errorResponse('请描述症状'));
    }

    const symptomList = Array.isArray(symptoms) ? symptoms : [symptoms];

    // 简易建议
    const advice = generateEmergencyAdvice(symptomList);

    const emergency = {
      id: uuidv4(),
      type: 'pet',
      eventType: 'emergency',
      petName: petName || userConfig.petName,
      title: '紧急症状记录',
      symptoms: symptomList,
      advice,
      date: date || todayStr(),
      time: time || nowTimeStr(),
      notes: notes || '',
      createdAt: new Date().toISOString()
    };

    const result = store.create('pets', emergency);

    return res.json(successResponse({
      record: result,
      advice
    }, '症状已记录，建议仅供参考，严重请及时就医'));
  } catch (err) {
    return res.json(errorResponse('记录失败: ' + err.message));
  }
});

function generateEmergencyAdvice(symptoms) {
  const advices = [];

  if (symptoms.some(s => s.includes('呕吐') || s.includes('吐'))) {
    advices.push('禁食4-6小时，观察是否继续呕吐');
    advices.push('若持续呕吐超过24小时，请立即就医');
  }

  if (symptoms.some(s => s.includes('腹泻') || s.includes('拉稀'))) {
    advices.push('注意补充水分，防止脱水');
    advices.push('禁食12小时，之后给予易消化食物');
  }

  if (symptoms.some(s => s.includes('不吃饭') || s.includes('食欲'))) {
    advices.push('观察精神状态，若精神好可再观察1天');
    advices.push('若超过24小时不进食且精神差，请就医');
  }

  if (symptoms.some(s => s.includes('咳嗽') || s.includes('打喷嚏'))) {
    advices.push('注意保暖，避免温差过大');
    advices.push('若伴随发烧或精神差，请就医');
  }

  if (symptoms.some(s => s.includes('精神') || s.includes('萎靡'))) {
    advices.push('密切观察，测量体温');
    advices.push('若持续萎靡超过12小时，建议就医');
  }

  if (symptoms.some(s => s.includes('血') || s.includes('出血'))) {
    advices.push('⚠️ 有出血症状，请立即就医！');
  }

  if (symptoms.some(s => s.includes('尿') && (s.includes('少') || s.includes('不')))) {
    advices.push('⚠️ 排尿异常可能是尿路问题，请尽快就医！');
  }

  if (advices.length === 0) {
    advices.push('建议观察症状变化，如有加重请及时就医');
  }

  advices.push('---');
  advices.push('⚠️ 以上建议仅供参考，不能替代专业兽医诊断');
  advices.push('如有疑问或症状加重，请立即联系宠物医院');

  return advices;
}

// 获取宠物事件历史
router.get('/history', (req, res) => {
  try {
    const { eventType, limit = 50 } = req.query;
    let events = store.getAll('pets');

    if (eventType) {
      events = events.filter(e => e.eventType === eventType);
    }

    events.sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));

    return res.json(successResponse({
      events: events.slice(0, parseInt(limit)),
      total: events.length
    }));
  } catch (err) {
    return res.json(errorResponse('获取历史失败: ' + err.message));
  }
});

module.exports = router;
