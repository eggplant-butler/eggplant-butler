const express = require('express');
const router = express.Router();
const moment = require('moment');
const { successResponse, errorResponse, todayStr } = require('../utils/helpers');
const { store } = require('../utils/store');
const userConfig = require('../config/user');

// 生成今日日程
router.get('/today', (req, res) => {
  try {
    const { mode = 'auto' } = req.query;
    const today = todayStr();
    const schedule = [];

    // 晨间固定流程
    const morningRoutine = [
      { time: '06:10', activity: '起床', priority: 'high', category: '晨间' },
      { time: '06:15-06:35', activity: '古法健身', priority: 'high', category: '晨间', duration: 20 },
      { time: '06:35-06:50', activity: '洗漱护肤', priority: 'high', category: '晨间', duration: 15 },
      { time: '06:50-07:05', activity: `铲猫砂、洗猫碗、换水粮、快速梳毛（${userConfig.petName}）`, priority: 'high', category: '宠物', duration: 15 },
      { time: '07:05-07:25', activity: '做早餐、备午餐', priority: 'high', category: '餐饮', duration: 20 },
      { time: '07:25-07:35', activity: '擦防晒、换衣服、收拾', priority: 'medium', category: '晨间', duration: 10 },
      { time: '07:35', activity: '丢垃圾', priority: 'medium', category: '家务' },
      { time: '07:40', activity: '出门检查', priority: 'high', category: '晨间' },
      { time: '07:50', activity: '出门上班', priority: 'high', category: '通勤' }
    ];

    schedule.push(...morningRoutine);

    // 工作时段
    schedule.push({ time: '08:30-12:00', activity: '上午工作', priority: 'high', category: '工作', duration: 210 });
    schedule.push({ time: '12:00-13:30', activity: '午休（午餐+休息）', priority: 'medium', category: '休息', duration: 90 });
    schedule.push({ time: '13:30-18:00', activity: '下午工作', priority: 'high', category: '工作', duration: 270 });

    // 判断是否加班（从任务/习惯记录中判断，或默认不加班）
    const isOvertime = checkOvertimeStatus(today);

    if (isOvertime) {
      // 加班晚间流程
      schedule.push({ time: '18:00-21:00', activity: '加班', priority: 'high', category: '工作', duration: 180 });
      schedule.push({ time: '21:00-21:30', activity: '下班通勤', priority: 'medium', category: '通勤', duration: 30 });
      schedule.push({ time: '21:30-21:50', activity: `简单洗漱 + ${userConfig.petName}基础互动`, priority: 'medium', category: '宠物', duration: 20 });
      schedule.push({ time: '22:00', activity: '今日复盘', priority: 'medium', category: '复盘' });
    } else {
      // 不加班晚间流程
      schedule.push({ time: `18:00-18:30`, activity: '下班通勤', priority: 'medium', category: '通勤', duration: 30 });
      schedule.push({ time: '18:30', activity: '到家', priority: 'medium', category: '休息' });

      // 检查冰箱库存，决定是否插入买菜
      const needShopping = checkNeedShopping();
      if (needShopping) {
        schedule.push({ time: '18:30-19:00', activity: '买菜', priority: 'medium', category: '家务', note: '冰箱库存不足' });
        schedule.push({ time: '19:00-20:00', activity: '做饭洗碗', priority: 'high', category: '餐饮', duration: 60 });
      } else {
        schedule.push({ time: '18:30-20:00', activity: '做饭洗碗', priority: 'high', category: '餐饮', duration: 90 });
      }

      // 猫咪深度陪伴
      schedule.push({
        time: '20:00-20:30',
        activity: `${userConfig.petName}深度陪伴（梳毛、检查耳朵、剪指甲/剃脚毛若到期）`,
        priority: 'medium',
        category: '宠物',
        duration: 30
      });

      // 自由/学习时间
      schedule.push({ time: '20:30-21:00', activity: '自由时间/学习', priority: 'low', category: '个人', duration: 30 });

      // 固定阅读时间
      const [readingStart, readingEnd] = userConfig.defaultReadingTime.split('-');
      schedule.push({
        time: `${readingStart}-${readingEnd}`,
        activity: '微信读书',
        priority: 'medium',
        category: '阅读',
        duration: 30
      });

      // 检查今日家务任务
      const chores = getTodayChores(today);
      if (chores.length > 0) {
        // 插入家务到晚间合适时段
        chores.forEach((chore, idx) => {
          const choreTime = `21:${30 + idx * 15}-21:${45 + idx * 15}`;
          schedule.push({
            time: choreTime,
            activity: chore,
            priority: 'medium',
            category: '家务',
            duration: 15
          });
        });
      }

      // 检查洗头日
      if (isWashHairDay(today)) {
        schedule.push({
          time: '21:30-22:00',
          activity: '洗头+吹头发',
          priority: 'medium',
          category: '护理',
          duration: 30
        });
      }

      schedule.push({ time: '22:00', activity: '今日复盘', priority: 'medium', category: '复盘' });
      schedule.push({ time: '22:30', activity: '准备睡觉', priority: 'medium', category: '休息' });
    }

    // 家人到访计划处理
    const todayVisits = store.query('social', s =>
      s.interactionType === 'visit' &&
      s.date === today &&
      s.status !== 'cancelled'
    );

    for (const visit of todayVisits) {
      const arriveMoment = moment(visit.arriveTime, 'YYYY-MM-DD HH:mm');
      const arriveTimeStr = arriveMoment.format('HH:mm');
      const isWorkHours = isInWorkHours(arriveTimeStr);

      // 如果到达时间在上班时段，添加提醒
      if (isWorkHours) {
        schedule.push({
          time: arriveTimeStr,
          activity: `⚠️ ${visit.name}到达时间(${arriveTimeStr})在上班时段，建议调整`,
          priority: 'high',
          category: '提醒',
          visitAlert: true,
          note: '到达时间与工作时间冲突'
        });
      }

      // 插入到访事件到日程
      schedule.push({
        time: arriveTimeStr,
        activity: `🙋 ${visit.name}到达`,
        priority: 'high',
        category: '家人到访',
        duration: 0,
        visitInfo: { name: visit.name, type: 'arrive' }
      });

      // 如果需要接送，在到达前15分钟插入接站
      if (visit.needPickup && !isWorkHours) {
        const pickupMoment = arriveMoment.clone().subtract(15, 'minutes');
        schedule.push({
          time: pickupMoment.format('HH:mm'),
          activity: `🚗 去${visit.pickupLocation || '地铁站'}接${visit.name}`,
          priority: 'high',
          category: '家人到访',
          duration: 30,
          visitInfo: { name: visit.name, type: 'pickup' }
        });
      }

      // 离开时间处理
      if (visit.leaveTime) {
        const leaveMoment = moment(visit.leaveTime, 'YYYY-MM-DD HH:mm');
        const leaveTimeStr = leaveMoment.format('HH:mm');

        schedule.push({
          time: leaveTimeStr,
          activity: `👋 ${visit.name}离开`,
          priority: 'medium',
          category: '家人到访',
          visitInfo: { name: visit.name, type: 'leave' }
        });

        // 送站任务（离开前15分钟）
        const dropoffMoment = leaveMoment.clone().subtract(15, 'minutes');
        schedule.push({
          time: dropoffMoment.format('HH:mm'),
          activity: `🚗 送${visit.name}去${visit.pickupLocation || '地铁站'}`,
          priority: 'high',
          category: '家人到访',
          duration: 30,
          visitInfo: { name: visit.name, type: 'dropoff' }
        });
      }
    }

    // 加入今日待办任务
    const todayTasks = store.query('tasks', t => t.date === today && t.status !== 'cancelled');
    if (todayTasks.length > 0) {
      schedule.push({
        time: '---',
        activity: `今日待办任务 (${todayTasks.length}项)`,
        priority: 'info',
        category: '任务',
        tasks: todayTasks
      });
    }

    // 加入今日习惯打卡
    const todayHabits = store.query('habits', h => h.date === today);
    if (todayHabits.length > 0) {
      schedule.push({
        time: '---',
        activity: '今日习惯打卡',
        priority: 'info',
        category: '习惯',
        habits: todayHabits
      });
    }

    return res.json(successResponse({
      date: today,
      mode: isOvertime ? 'overtime' : 'normal',
      schedule,
      totalItems: schedule.length
    }));

  } catch (err) {
    return res.json(errorResponse('生成日程失败: ' + err.message));
  }
});

// 检查是否加班（简化逻辑）
function checkOvertimeStatus(today) {
  // 可以从工作记录或用户设置中判断
  // 这里简化为检查是否有加班相关的任务记录
  const workLogs = store.query('work_logs', w => w.date === today);
  return workLogs.some(w => w.overtime);
}

// 检查是否需要买菜
function checkNeedShopping() {
  const items = store.getAll('inventory');
  const lowItems = items.filter(i => i.category === '食材' && i.quantity <= i.minQuantity);
  return lowItems.length > 0;
}

// 获取今日家务
function getTodayChores(today) {
  const chores = [];
  const choreRecords = store.getAll('chore_records');
  const mode = userConfig.currentWorkMode === 'sales' ? 'busy' : 'normal';

  // 洗衣
  const laundryDays = userConfig.laundryCycle[mode];
  const lastLaundry = choreRecords.filter(c => c.type === 'laundry').sort((a, b) => b.date - a.date)[0];
  if (!lastLaundry || daysBetween(lastLaundry.date, today) >= laundryDays) {
    chores.push('洗衣服');
  }

  // 换床单
  const bedsheetDays = userConfig.bedsheetCycle[mode];
  const lastBedsheet = choreRecords.filter(c => c.type === 'bedsheet').sort((a, b) => b.date - a.date)[0];
  if (!lastBedsheet || daysBetween(lastBedsheet.date, today) >= bedsheetDays) {
    chores.push('换床单');
  }

  // 拖地
  const mopDays = userConfig.mopCycle[mode];
  const lastMop = choreRecords.filter(c => c.type === 'mop').sort((a, b) => b.date - a.date)[0];
  if (!lastMop || daysBetween(lastMop.date, today) >= mopDays) {
    chores.push('拖地');
  }

  return chores;
}

// 检查今天是不是洗头日
function isWashHairDay(today) {
  const records = store.getAll('habit_records');
  const washHairRecords = records.filter(r => r.type === 'wash_hair').sort((a, b) => b.date.localeCompare(a.date));

  if (washHairRecords.length === 0) return true;

  const lastWash = washHairRecords[0].date;
  const diffDays = daysBetween(lastWash, today);
  return diffDays >= userConfig.washHairCycleDays;
}

// 计算两个日期之间的天数差
function daysBetween(date1, date2) {
  const d1 = moment(date1);
  const d2 = moment(date2);
  return Math.abs(d2.diff(d1, 'days'));
}

// 判断时间是否在上班时段
function isInWorkHours(timeStr) {
  // workHours: "08:30-12:00,13:30-18:00"
  const [workStart1, workEnd1] = ['08:30', '12:00'];
  const [workStart2, workEnd2] = ['13:30', '18:00'];

  return (timeStr >= workStart1 && timeStr < workEnd1) ||
         (timeStr >= workStart2 && timeStr < workEnd2);
}

module.exports = router;
