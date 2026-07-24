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

// ========== 物资管理 ==========

// 记录物资购买
router.post('/supply', (req, res) => {
  try {
    const { itemType, brand, quantity, unit, unitPrice, purchaseDate, notes } = req.body;

    if (!itemType || !quantity) {
      return res.json(errorResponse('请指定物资类型和数量'));
    }

    const validTypes = ['cat_food', 'snack', 'probiotics', 'litter', 'toy', 'other'];
    if (!validTypes.includes(itemType)) {
      return res.json(errorResponse(`物资类型无效，允许值: ${validTypes.join(', ')}`));
    }

    // 预估日均消耗（天/单位），不同物资类型的默认参考值
    const defaultDailyUsage = {
      cat_food: 0.15,    // 约150g/天（按kg计则每天消耗0.15kg）
      snack: 0.02,       // 零食少量
      probiotics: 0.04,  // 乳酸菌每袋约2-3天，一盒10袋≈30天，日均0.03-0.04盒
      litter: 0.3,       // 猫砂日均消耗约0.3kg（两只猫参考）
      toy: 0.01,         // 玩具不易消耗
      other: 0.05
    };
    const dailyUsage = defaultDailyUsage[itemType] || 0.05;
    const estimatedDays = quantity / dailyUsage;

    const itemLabels = {
      cat_food: '猫粮',
      snack: '零食',
      probiotics: '乳酸菌',
      litter: '猫砂',
      toy: '玩具',
      other: '其他'
    };

    const supply = {
      id: uuidv4(),
      type: 'pet_supply',
      itemType,
      itemLabel: itemLabels[itemType] || itemType,
      brand: brand || '',
      quantity,
      unit: unit || '份',
      unitPrice: unitPrice || null,
      totalPrice: unitPrice ? (unitPrice * quantity).toFixed(2) : null,
      remaining: quantity,
      purchaseDate: purchaseDate || todayStr(),
      dailyUsage,
      estimatedDays: Math.round(estimatedDays),
      estimatedExhaustDate: estimatedDays
        ? moment(purchaseDate || todayStr()).add(Math.round(estimatedDays), 'days').format('YYYY-MM-DD')
        : null,
      notes: notes || '',
      createdAt: new Date().toISOString()
    };

    const result = store.create('pet_supplies', supply);
    return res.json(successResponse(result, `${itemLabels[itemType]}采购已记录，预计可使用约${Math.round(estimatedDays)}天`));
  } catch (err) {
    return res.json(errorResponse('记录物资失败: ' + err.message));
  }
});

// 获取当前库存列表
router.get('/supplies', (req, res) => {
  try {
    const today = todayStr();
    const supplies = store.getAll('pet_supplies');

    // 计算每个物资的剩余信息和补货建议
    const inventory = supplies.map(item => {
      const daysUsed = daysBetween(item.purchaseDate, today);
      // 基于实际使用天数和剩余量重新计算日均消耗
      const used = item.quantity - item.remaining;
      const actualDailyUsage = daysUsed > 0 ? used / daysUsed : item.dailyUsage;
      const remainingDays = actualDailyUsage > 0 ? Math.round(item.remaining / actualDailyUsage) : 9999;

      const estimatedExhaustDate = remainingDays < 9999
        ? moment(today).add(remainingDays, 'days').format('YYYY-MM-DD')
        : null;

      // 补货阈值：猫粮剩余20%时补货，其他剩余15%时补货
      const reorderThreshold = item.itemType === 'cat_food' ? 0.2 : 0.15;
      const remainingRatio = item.quantity > 0 ? item.remaining / item.quantity : 0;
      const needsReorder = remainingRatio <= reorderThreshold;

      return {
        ...item,
        daysUsed,
        actualDailyUsage: Math.round(actualDailyUsage * 1000) / 1000,
        remainingDays,
        estimatedExhaustDate,
        remainingRatio: Math.round(remainingRatio * 100) + '%',
        needsReorder,
        reorderThreshold: Math.round(reorderThreshold * 100) + '%'
      };
    });

    // 按剩余量比例排序（少的排前面）
    inventory.sort((a, b) => {
      const ratioA = a.quantity > 0 ? a.remaining / a.quantity : 1;
      const ratioB = b.quantity > 0 ? b.remaining / b.quantity : 1;
      return ratioA - ratioB;
    });

    const reorderItems = inventory.filter(i => i.needsReorder);

    return res.json(successResponse({
      today,
      total: inventory.length,
      reorderCount: reorderItems.length,
      reorderItems,
      inventory
    }));
  } catch (err) {
    return res.json(errorResponse('获取库存失败: ' + err.message));
  }
});

// 物资规划建议
router.get('/supply-plan', (req, res) => {
  try {
    const today = todayStr();
    const supplies = store.getAll('pet_supplies');
    const feedings = store.getAll('pet_feeding');

    // 分类汇总库存
    const categories = {};

    supplies.forEach(item => {
      const daysUsed = daysBetween(item.purchaseDate, today);
      const used = item.quantity - item.remaining;
      const actualDailyUsage = daysUsed > 0 && used > 0 ? used / daysUsed : item.dailyUsage;
      const remainingDays = actualDailyUsage > 0 ? Math.round(item.remaining / actualDailyUsage) : 9999;

      if (!categories[item.itemType]) {
        categories[item.itemType] = { items: [], totalRemaining: 0, totalDailyUsage: 0 };
      }

      categories[item.itemType].items.push({
        ...item,
        actualDailyUsage: Math.round(actualDailyUsage * 1000) / 1000,
        remainingDays
      });
      categories[item.itemType].totalRemaining += item.remaining;
      categories[item.itemType].totalDailyUsage += actualDailyUsage;
    });

    const categoryLabels = {
      cat_food: '猫粮',
      snack: '零食',
      probiotics: '乳酸菌',
      litter: '猫砂',
      toy: '玩具',
      other: '其他'
    };

    // 推荐品牌（基于已有购买记录的偏好）
    const brandFrequency = {};
    supplies.forEach(s => {
      if (s.brand) {
        brandFrequency[s.brand] = (brandFrequency[s.brand] || 0) + 1;
      }
    });
    const topBrands = Object.entries(brandFrequency)
      .sort((a, b) => b[1] - a[1])
      .map(([brand]) => brand);

    const plan = [];
    const purchaseTimeline = [];

    // 猫粮规划：剩余20%时购买，不能频繁换
    if (categories.cat_food) {
      const catFood = categories.cat_food;
      catFood.items.sort((a, b) => a.remainingDays - b.remainingDays);
      const currentItem = catFood.items[0];
      const reorderAt20Pct = currentItem.quantity * 0.2;
      const shouldReorder = currentItem.remaining <= reorderAt20Pct;
      const daysUntilReorder = currentItem.actualDailyUsage > 0
        ? Math.max(0, Math.round((currentItem.remaining - reorderAt20Pct) / currentItem.actualDailyUsage))
        : 0;

      plan.push({
        category: 'cat_food',
        label: '猫粮',
        currentBrand: currentItem.brand || '未指定',
        recommendedBrand: topBrands[0] || currentItem.brand || '请选择稳定品牌',
        currentRemaining: currentItem.remaining,
        remainingUnit: currentItem.unit,
        remainingDays: currentItem.remainingDays,
        shouldReorder,
        reorderThreshold: '20%',
        daysUntilReorder,
        reorderDate: daysUntilReorder > 0
          ? moment(today).add(daysUntilReorder, 'days').format('YYYY-MM-DD')
          : today,
        suggestion: shouldReorder
          ? `猫粮库存偏低，建议立即补货。当前品牌: ${currentItem.brand || '未知'}，猫粮不宜频繁更换品牌。`
          : `猫粮库存充足，预计${daysUntilReorder}天后需要补货（${moment(today).add(daysUntilReorder, 'days').format('YYYY-MM-DD')}）。继续保持当前品牌。`
      });

      if (daysUntilReorder <= 14 || shouldReorder) {
        purchaseTimeline.push({
          priority: shouldReorder ? '立即' : (daysUntilReorder <= 7 ? '本周' : '两周内'),
          date: shouldReorder ? today : moment(today).add(daysUntilReorder, 'days').format('YYYY-MM-DD'),
          item: '猫粮',
          brand: topBrands[0] || currentItem.brand || '待定',
          note: '不要频繁换品牌'
        });
      }
    }

    // 乳酸菌规划：每周2-3次
    if (categories.probiotics) {
      const probiotics = categories.probiotics;
      const weeklyUsage = probiotics.totalDailyUsage * 7;
      const remainingWeeks = weeklyUsage > 0 ? Math.round(probiotics.totalRemaining / weeklyUsage) : 99;
      const daysUntilReorder = remainingWeeks * 7 * 0.15; // 剩余15%时补货

      plan.push({
        category: 'probiotics',
        label: '乳酸菌',
        frequency: '每周2-3次',
        totalRemaining: probiotics.totalRemaining,
        weeklyUsage: Math.round(weeklyUsage * 100) / 100,
        remainingWeeks,
        daysUntilReorder: Math.round(daysUntilReorder),
        reorderDate: daysUntilReorder > 0
          ? moment(today).add(Math.round(daysUntilReorder), 'days').format('YYYY-MM-DD')
          : today,
        suggestion: remainingWeeks <= 2
          ? '乳酸菌库存不足两周，建议尽快补充。'
          : `乳酸菌库存可维持约${remainingWeeks}周，按每周2-3次使用频率计算。`
      });

      if (remainingWeeks <= 3) {
        purchaseTimeline.push({
          priority: remainingWeeks <= 1 ? '立即' : '一周内',
          date: remainingWeeks <= 1 ? today : moment(today).add(7, 'days').format('YYYY-MM-DD'),
          item: '乳酸菌',
          brand: topBrands.find(b => {
            return probiotics.items.some(i => i.brand === b);
          }) || '待定',
          note: '按每周2-3次频率补充'
        });
      }
    }

    // 零食规划：按种类
    if (categories.snack) {
      const snackItems = categories.snack.items.sort((a, b) => a.remainingDays - b.remainingDays);
      const snackSummary = snackItems.map(item => ({
        brand: item.brand || '未指定',
        remaining: item.remaining,
        unit: item.unit,
        remainingDays: item.remainingDays,
        needsReorder: item.remainingDays <= 7
      }));

      plan.push({
        category: 'snack',
        label: '零食',
        kinds: snackSummary,
        totalKinds: snackSummary.length,
        needsReorderKinds: snackSummary.filter(s => s.needsReorder),
        suggestion: snackSummary.some(s => s.needsReorder)
          ? '有零食即将用完，建议补充。'
          : '零食库存充足。'
      });

      snackSummary.filter(s => s.needsReorder).forEach(s => {
        purchaseTimeline.push({
          priority: s.remainingDays <= 3 ? '立即' : '一周内',
          date: s.remainingDays <= 3 ? today : moment(today).add(7, 'days').format('YYYY-MM-DD'),
          item: `零食 (${s.brand})`,
          brand: s.brand,
          note: '按需补充'
        });
      });
    }

    // 猫砂规划
    if (categories.litter) {
      const litter = categories.litter;
      litter.items.sort((a, b) => a.remainingDays - b.remainingDays);
      const mainLitter = litter.items[0];
      const reorderAt15Pct = mainLitter.quantity * 0.15;
      const shouldReorder = mainLitter.remaining <= reorderAt15Pct;
      const daysUntilReorder = mainLitter.actualDailyUsage > 0
        ? Math.max(0, Math.round((mainLitter.remaining - reorderAt15Pct) / mainLitter.actualDailyUsage))
        : 0;

      plan.push({
        category: 'litter',
        label: '猫砂',
        currentRemaining: mainLitter.remaining,
        remainingUnit: mainLitter.unit,
        remainingDays: mainLitter.remainingDays,
        shouldReorder,
        daysUntilReorder,
        reorderDate: daysUntilReorder > 0
          ? moment(today).add(daysUntilReorder, 'days').format('YYYY-MM-DD')
          : today,
        suggestion: shouldReorder
          ? '猫砂库存偏低，建议立即补货。'
          : `猫砂预计${daysUntilReorder}天后需要补货（${moment(today).add(daysUntilReorder, 'days').format('YYYY-MM-DD')}）。`
      });

      if (daysUntilReorder <= 14 || shouldReorder) {
        purchaseTimeline.push({
          priority: shouldReorder ? '立即' : (daysUntilReorder <= 7 ? '本周' : '两周内'),
          date: shouldReorder ? today : moment(today).add(daysUntilReorder, 'days').format('YYYY-MM-DD'),
          item: '猫砂',
          brand: mainLitter.brand || '待定',
          note: '日常消耗品'
        });
      }
    }

    // 按优先级排序采购时间线
    const priorityOrder = { '立即': 0, '本周': 1, '一周内': 1, '两周内': 2 };
    purchaseTimeline.sort((a, b) => (priorityOrder[a.priority] || 9) - (priorityOrder[b.priority] || 9));

    return res.json(successResponse({
      generatedAt: today,
      petName: userConfig.petName,
      plans: plan,
      purchaseList: purchaseTimeline,
      brandPreferences: topBrands.length > 0 ? topBrands.slice(0, 5) : []
    }));
  } catch (err) {
    return res.json(errorResponse('获取物资规划失败: ' + err.message));
  }
});

// ========== 每日喂食记录 ==========

router.post('/daily-feeding', (req, res) => {
  try {
    const { date, meals } = req.body;

    if (!date || !meals || !Array.isArray(meals) || meals.length === 0) {
      return res.json(errorResponse('请提供日期和喂食记录（meals数组）'));
    }

    const validFoodTypes = ['cat_food', 'wet_food', 'snack', 'probiotics'];
    const foodTypeLabels = {
      cat_food: '猫粮',
      wet_food: '湿粮',
      snack: '零食',
      probiotics: '乳酸菌'
    };

    // 验证并构建喂食记录
    const validatedMeals = meals.map((meal, index) => {
      if (!meal.time || !meal.foodType) {
        throw new Error(`第${index + 1}条喂食记录缺少 time 或 foodType`);
      }
      if (!validFoodTypes.includes(meal.foodType)) {
        throw new Error(`第${index + 1}条记录的 foodType 无效，允许值: ${validFoodTypes.join(', ')}`);
      }
      return {
        time: meal.time,
        foodType: meal.foodType,
        foodLabel: foodTypeLabels[meal.foodType] || meal.foodType,
        amount: meal.amount || 0,
        notes: meal.notes || ''
      };
    });

    // 保存喂食记录
    const feedingRecord = {
      id: uuidv4(),
      type: 'pet_feeding',
      date,
      meals: validatedMeals,
      petName: userConfig.petName,
      createdAt: new Date().toISOString()
    };

    store.create('pet_feeding', feedingRecord);

    // 根据喂食记录自动更新库存消耗
    const stockUpdates = updateStockFromFeeding(date, validatedMeals);

    return res.json(successResponse({
      record: feedingRecord,
      stockUpdates
    }, `已记录${validatedMeals.length}条喂食记录，库存已自动更新`));
  } catch (err) {
    return res.json(errorResponse('记录喂食失败: ' + err.message));
  }
});

// 根据喂食记录更新库存
function updateStockFromFeeding(date, meals) {
  const supplies = store.getAll('pet_supplies');
  const updates = [];

  // 按物资类型汇总当日消耗量
  const consumption = {};
  meals.forEach(meal => {
    // 将喂食类型映射到库存类型
    const stockTypeMap = {
      cat_food: 'cat_food',
      wet_food: 'cat_food',   // 湿粮暂归入猫粮大类
      snack: 'snack',
      probiotics: 'probiotics'
    };
    const stockType = stockTypeMap[meal.foodType] || meal.foodType;

    if (!consumption[stockType]) {
      consumption[stockType] = 0;
    }
    consumption[stockType] += meal.amount;
  });

  // 更新对应物资的剩余量
  Object.entries(consumption).forEach(([itemType, amount]) => {
    // 找到该类型中最近购买的、有剩余的物资
    const matched = supplies
      .filter(s => s.itemType === itemType && s.remaining > 0)
      .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate)); // 优先消耗新购买的

    let remaining = amount;
    matched.forEach(item => {
      if (remaining <= 0) return;

      const deducted = Math.min(remaining, item.remaining);
      item.remaining = Math.round((item.remaining - deducted) * 1000) / 1000;
      remaining -= deducted;

      // 重新计算日均消耗和预计用完日期
      const daysUsed = daysBetween(item.purchaseDate, date);
      const used = item.quantity - item.remaining;
      if (daysUsed > 0 && used > 0) {
        item.dailyUsage = Math.round((used / daysUsed) * 1000) / 1000;
        item.estimatedDays = Math.round(item.remaining / item.dailyUsage);
        item.estimatedExhaustDate = moment(date).add(item.estimatedDays, 'days').format('YYYY-MM-DD');
      }

      updates.push({
        supplyId: item.id,
        itemType: item.itemType,
        itemLabel: item.itemLabel,
        deducted,
        newRemaining: item.remaining
      });
    });

    // 如果有未扣除的消耗（库存不足），记录警告
    if (remaining > 0) {
      updates.push({
        warning: true,
        itemType,
        message: `${itemType}库存不足以覆盖本次消耗，缺${remaining}${matched[0]?.unit || '份'}`
      });
    }
  });

  return updates;
}

module.exports = router;
