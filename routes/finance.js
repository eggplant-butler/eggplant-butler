const express = require('express');
const router = express.Router();
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const { successResponse, errorResponse, parseExpenseText, todayStr, nowTimeStr } = require('../utils/helpers');
const { store } = require('../utils/store');
const budgetConfig = require('../config/budget');

// 记录支出（支持rawText解析）
router.post('/expense', (req, res) => {
  try {
    const { rawText, title, amount, category, paymentMethod, notes, date, tags } = req.body;

    let expenseData = {
      id: uuidv4(),
      type: 'expense',
      title: title || '',
      category: category,
      amount: amount || 0,
      date: date || todayStr(),
      time: nowTimeStr(),
      paymentMethod: paymentMethod,
      notes: notes || '',
      tags: tags || [],
      createdAt: new Date().toISOString()
    };

    // 如果提供了rawText，优先解析
    if (rawText) {
      const parsed = parseExpenseText(rawText);
      expenseData.title = title || parsed.title || '';
      expenseData.amount = amount || parsed.amount || 0;
      expenseData.category = category || parsed.category || '其他';
      expenseData.paymentMethod = paymentMethod || parsed.paymentMethod || '';
      expenseData.notes = notes || rawText;
    } else {
      // 无rawText时使用默认值
      if (!expenseData.category) expenseData.category = '其他';
      if (!expenseData.paymentMethod) expenseData.paymentMethod = '';
    }

    const expense = store.create('finance', expenseData);
    return res.json(successResponse(expense, '支出记录已添加'));
  } catch (err) {
    return res.json(errorResponse('添加支出失败: ' + err.message));
  }
});

// 记录收入
router.post('/income', (req, res) => {
  try {
    const { title, amount, category = '工资', date, notes, tags } = req.body;

    if (!amount) {
      return res.json(errorResponse('请输入金额'));
    }

    const income = {
      id: uuidv4(),
      type: 'income',
      title: title || category,
      category: category || '工资',
      amount: parseFloat(amount),
      date: date || todayStr(),
      time: nowTimeStr(),
      notes: notes || '',
      tags: tags || [],
      createdAt: new Date().toISOString()
    };

    const result = store.create('finance', income);
    return res.json(successResponse(result, '收入记录已添加'));
  } catch (err) {
    return res.json(errorResponse('添加收入失败: ' + err.message));
  }
});

// 获取月度汇总
router.get('/summary', (req, res) => {
  try {
    const { month } = req.query;
    const targetMonth = month ? String(month).padStart(2, '0') : moment().format('MM');
    const targetYear = moment().format('YYYY');

    const allRecords = store.getAll('finance');
    const monthRecords = allRecords.filter(r => {
      const recordMonth = moment(r.date).format('MM');
      const recordYear = moment(r.date).format('YYYY');
      return recordMonth === targetMonth && recordYear === targetYear;
    });

    const expenses = monthRecords.filter(r => r.type === 'expense');
    const incomes = monthRecords.filter(r => r.type === 'income');

    // 按分类汇总支出
    const expenseByCategory = {};
    expenses.forEach(exp => {
      const cat = exp.category || '其他';
      if (!expenseByCategory[cat]) {
        expenseByCategory[cat] = { total: 0, count: 0 };
      }
      expenseByCategory[cat].total += parseFloat(exp.amount);
      expenseByCategory[cat].count += 1;
    });

    // 收入总额
    const totalIncome = incomes.reduce((sum, inc) => sum + parseFloat(inc.amount), 0);
    const totalExpense = expenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);

    // 宠物开销占比
    const petExpense = expenses.filter(e => e.category === '宠物')
      .reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const petExpenseRatio = totalExpense > 0 ? (petExpense / totalExpense * 100).toFixed(1) : 0;

    return res.json(successResponse({
      month: targetMonth,
      year: targetYear,
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
      expenseByCategory,
      petExpense,
      petExpenseRatio: `${petExpenseRatio}%`,
      expenseCount: expenses.length,
      incomeCount: incomes.length
    }));
  } catch (err) {
    return res.json(errorResponse('获取汇总失败: ' + err.message));
  }
});

// 获取预算情况
router.get('/budget', (req, res) => {
  try {
    const { month } = req.query;
    const targetMonth = month ? String(month).padStart(2, '0') : moment().format('MM');
    const targetYear = moment().format('YYYY');

    const allRecords = store.getAll('finance');
    const monthExpenses = allRecords.filter(r => {
      const recordMonth = moment(r.date).format('MM');
      const recordYear = moment(r.date).format('YYYY');
      return recordMonth === targetMonth && recordYear === targetYear && r.type === 'expense';
    });

    const budgetResult = {};

    for (const [category, config] of Object.entries(budgetConfig.categories)) {
      const spent = monthExpenses
        .filter(e => e.category === category)
        .reduce((sum, e) => sum + parseFloat(e.amount), 0);

      const remaining = config.budget - spent;
      const usedRatio = (spent / config.budget * 100).toFixed(1);

      budgetResult[category] = {
        budget: config.budget,
        spent: parseFloat(spent.toFixed(2)),
        remaining: parseFloat(remaining.toFixed(2)),
        usedRatio: `${usedRatio}%`,
        status: spent > config.budget ? 'over' : (usedRatio > 80 ? 'warning' : 'normal'),
        icon: config.icon
      };
    }

    // 总预算
    const totalBudget = Object.values(budgetConfig.categories).reduce((sum, c) => sum + c.budget, 0);
    const totalSpent = monthExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);

    return res.json(successResponse({
      month: targetMonth,
      year: targetYear,
      totalBudget,
      totalSpent: parseFloat(totalSpent.toFixed(2)),
      totalRemaining: parseFloat((totalBudget - totalSpent).toFixed(2)),
      totalUsedRatio: `${(totalSpent / totalBudget * 100).toFixed(1)}%`,
      categories: budgetResult
    }));
  } catch (err) {
    return res.json(errorResponse('获取预算失败: ' + err.message));
  }
});

// 获取支出列表
router.get('/expenses', (req, res) => {
  try {
    const { category, startDate, endDate, limit = 50, offset = 0 } = req.query;

    let records = store.getAll('finance').filter(r => r.type === 'expense');

    if (category) {
      records = records.filter(r => r.category === category);
    }
    if (startDate) {
      records = records.filter(r => r.date >= startDate);
    }
    if (endDate) {
      records = records.filter(r => r.date <= endDate);
    }

    records.sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));

    const paginated = records.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    return res.json(successResponse({
      records: paginated,
      total: records.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    }));
  } catch (err) {
    return res.json(errorResponse('获取支出列表失败: ' + err.message));
  }
});

// ===== 支出模板 =====

// 创建/更新模板
router.post('/template', (req, res) => {
  try {
    const { id, name, rawText, title, amount, category, paymentMethod, tags, icon } = req.body;

    if (!name || !rawText) {
      return res.json(errorResponse('请提供模板名称和rawText'));
    }

    // 如果提供了id，则更新现有模板
    if (id) {
      const existing = store.getById('finance_templates', id);
      if (!existing) {
        return res.json(errorResponse('模板不存在'));
      }
      const updated = store.update('finance_templates', id, {
        name,
        rawText,
        title: title || '',
        amount: amount || 0,
        category: category || '其他',
        paymentMethod: paymentMethod || '',
        tags: tags || [],
        icon: icon || '📝',
        updatedAt: new Date().toISOString()
      });
      return res.json(successResponse(updated, '模板已更新'));
    }

    // 创建新模板
    const template = {
      id: uuidv4(),
      type: 'finance_template',
      name,
      rawText,
      title: title || '',
      amount: amount || 0,
      category: category || '其他',
      paymentMethod: paymentMethod || '',
      tags: tags || [],
      icon: icon || '📝',
      usageCount: 0,
      createdAt: new Date().toISOString()
    };

    const result = store.create('finance_templates', template);
    return res.json(successResponse(result, '模板已创建'));
  } catch (err) {
    return res.json(errorResponse('操作失败: ' + err.message));
  }
});

// 获取模板列表
router.get('/templates', (req, res) => {
  try {
    let templates = store.getAll('finance_templates');
    // 按使用频率排序
    templates.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
    return res.json(successResponse({
      templates,
      total: templates.length
    }));
  } catch (err) {
    return res.json(errorResponse('获取模板失败: ' + err.message));
  }
});

// 删除模板
router.delete('/template/:id', (req, res) => {
  try {
    const { id } = req.params;
    const deleted = store.delete('finance_templates', id);
    if (!deleted) {
      return res.json(errorResponse('模板不存在'));
    }
    return res.json(successResponse(null, '模板已删除'));
  } catch (err) {
    return res.json(errorResponse('删除失败: ' + err.message));
  }
});

// 使用模板快速记账
router.post('/template/:id/use', (req, res) => {
  try {
    const { id } = req.params;
    const { date, notes } = req.body;

    const template = store.getById('finance_templates', id);
    if (!template) {
      return res.json(errorResponse('模板不存在'));
    }

    // 解析模板rawText
    const parsed = parseExpenseText(template.rawText);

    const expenseData = {
      id: uuidv4(),
      type: 'expense',
      title: template.title || parsed.title || template.name,
      category: template.category || parsed.category || '其他',
      amount: template.amount || parsed.amount || 0,
      date: date || todayStr(),
      time: nowTimeStr(),
      paymentMethod: template.paymentMethod || parsed.paymentMethod || '',
      notes: notes || `通过模板「${template.name}」快速记账`,
      tags: template.tags || [],
      templateId: id,
      createdAt: new Date().toISOString()
    };

    const expense = store.create('finance', expenseData);

    // 更新模板使用次数
    store.update('finance_templates', id, {
      usageCount: (template.usageCount || 0) + 1,
      lastUsedAt: new Date().toISOString()
    });

    return res.json(successResponse(expense, `已通过模板「${template.name}」记账`));
  } catch (err) {
    return res.json(errorResponse('快速记账失败: ' + err.message));
  }
});

// 财务洞察与优化建议
router.get('/insights', (req, res) => {
  try {
    const allRecords = store.getAll('finance');
    const now = moment();

    // 近6个月的月份列表
    const months = [];
    for (let i = 5; i >= 0; i--) {
      months.push(now.clone().subtract(i, 'months'));
    }

    // 按月组织支出和收入数据
    const monthlyData = months.map(m => {
      const monthStr = m.format('YYYY-MM');
      const monthRecords = allRecords.filter(r => r.date && r.date.startsWith(monthStr));
      const expenses = monthRecords.filter(r => r.type === 'expense');
      const incomes = monthRecords.filter(r => r.type === 'income');

      // 按分类汇总支出
      const categoryTotals = {};
      expenses.forEach(e => {
        const cat = e.category || '其他';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + parseFloat(e.amount);
      });

      const totalExpense = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
      const totalIncome = incomes.reduce((sum, e) => sum + parseFloat(e.amount), 0);

      // 收入分类汇总
      const incomeCategoryTotals = {};
      incomes.forEach(inc => {
        const cat = inc.category || '工资';
        incomeCategoryTotals[cat] = (incomeCategoryTotals[cat] || 0) + parseFloat(inc.amount);
      });

      return {
        month: monthStr,
        label: m.format('YYYY年MM月'),
        totalExpense,
        totalIncome,
        expenseCount: expenses.length,
        incomeCount: incomes.length,
        categoryTotals,
        incomeCategoryTotals
      };
    });

    if (monthlyData.length === 0) {
      return res.json(successResponse({
        summary: '暂无近6个月的财务数据',
        trends: [],
        alerts: [],
        suggestions: [],
        monthlyComparison: []
      }));
    }

    // 当前月、上月、上上月
    const current = monthlyData[monthlyData.length - 1];
    const lastMonth = monthlyData.length >= 2 ? monthlyData[monthlyData.length - 2] : null;
    const twoMonthsAgo = monthlyData.length >= 3 ? monthlyData[monthlyData.length - 3] : null;

    // ===== 消费结构趋势分析 =====
    const allCategories = new Set();
    monthlyData.forEach(md => Object.keys(md.categoryTotals).forEach(cat => allCategories.add(cat)));

    const trends = [];
    allCategories.forEach(cat => {
      const categoryMonths = monthlyData.map(md => ({
        month: md.month,
        label: md.label,
        amount: md.categoryTotals[cat] || 0,
        ratio: md.totalExpense > 0 ? ((md.categoryTotals[cat] || 0) / md.totalExpense * 100).toFixed(1) : '0.0'
      }));

      // 计算趋势方向
      const recentAmounts = categoryMonths.slice(-3).map(cm => cm.amount);
      let direction = 'stable';
      if (recentAmounts.length >= 2) {
        const diff = recentAmounts[recentAmounts.length - 1] - recentAmounts[recentAmounts.length - 2];
        if (diff > 0 && (recentAmounts[recentAmounts.length - 2] > 0 ? diff / recentAmounts[recentAmounts.length - 2] > 0.1 : true)) {
          direction = 'up';
        } else if (diff < 0 && (recentAmounts[recentAmounts.length - 2] > 0 ? Math.abs(diff) / recentAmounts[recentAmounts.length - 2] > 0.1 : true)) {
          direction = 'down';
        }
      }

      trends.push({
        category: cat,
        direction,
        months: categoryMonths
      });
    });

    // ===== 月度环比对比 =====
    const monthlyComparison = monthlyData.map(md => {
      const prevIdx = monthlyData.indexOf(md) - 1;
      const prev = prevIdx >= 0 ? monthlyData[prevIdx] : null;

      return {
        month: md.month,
        label: md.label,
        totalExpense: md.totalExpense,
        totalIncome: md.totalIncome,
        balance: md.totalIncome - md.totalExpense,
        expenseChange: prev ? parseFloat((md.totalExpense - prev.totalExpense).toFixed(2)) : null,
        expenseChangeRatio: prev && prev.totalExpense > 0
          ? parseFloat(((md.totalExpense - prev.totalExpense) / prev.totalExpense * 100).toFixed(1))
          : null,
        incomeChange: prev ? parseFloat((md.totalIncome - prev.totalIncome).toFixed(2)) : null,
        incomeChangeRatio: prev && prev.totalIncome > 0
          ? parseFloat(((md.totalIncome - prev.totalIncome) / prev.totalIncome * 100).toFixed(1))
          : null
      };
    });

    // ===== 生成预警 =====
    const alerts = [];

    // 宠物支出异常增加检测（环比 > 30%）
    const petTrend = trends.find(t => t.category === '宠物');
    if (petTrend && petTrend.months.length >= 2) {
      const latestPet = petTrend.months[petTrend.months.length - 1].amount;
      const prevPet = petTrend.months[petTrend.months.length - 2].amount;
      if (prevPet > 0 && latestPet > prevPet * 1.3) {
        const increase = ((latestPet - prevPet) / prevPet * 100).toFixed(1);
        alerts.push({
          type: 'pet_expense_spike',
          level: 'warning',
          message: `宠物支出本月 ${latestPet.toFixed(0)} 元，环比增长 ${increase}%，请检查是否有异常开支`
        });
      }
    }

    // 提成占比下降检测
    if (current.incomeCategoryTotals && lastMonth && lastMonth.incomeCategoryTotals) {
      const currentCommission = current.incomeCategoryTotals['提成'] || 0;
      const lastCommission = lastMonth.incomeCategoryTotals['提成'] || 0;
      const currentCommissionRatio = current.totalIncome > 0 ? currentCommission / current.totalIncome : 0;
      const lastCommissionRatio = lastMonth.totalIncome > 0 ? lastCommission / lastMonth.totalIncome : 0;

      if (lastCommissionRatio > 0.1 && currentCommissionRatio < lastCommissionRatio * 0.7) {
        alerts.push({
          type: 'commission_decline',
          level: 'warning',
          message: `提成收入占比从 ${(lastCommissionRatio * 100).toFixed(1)}% 下降到 ${(currentCommissionRatio * 100).toFixed(1)}%，请注意跟进业绩`
        });
      }
    }

    // 总支出连续增长预警
    if (monthlyComparison.length >= 3) {
      const last3 = monthlyComparison.slice(-3);
      if (last3[0].expenseChangeRatio > 10 && last3[1].expenseChangeRatio > 10) {
        alerts.push({
          type: 'expense_rising',
          level: 'caution',
          message: '支出连续2个月环比增长超过10%，请注意控制开支'
        });
      }
    }

    // ===== 生成优化建议 =====
    const suggestions = [];

    // 餐饮超支检测（连续3月超支20%）
    const foodTrend = trends.find(t => t.category === '餐饮');
    if (foodTrend && foodTrend.months.length >= 3) {
      const last3Food = foodTrend.months.slice(-3);
      const avgFood = last3Food.reduce((s, m) => s + m.amount, 0) / 3;
      const hasBudget = budgetConfig.categories['餐饮'];
      if (hasBudget && avgFood > hasBudget.budget * 1.2) {
        suggestions.push({
          type: 'food_overspend',
          message: `餐饮月均消费 ${avgFood.toFixed(0)} 元，超过预算 ${hasBudget.budget} 元的20%，建议自带午餐减少外卖`
        });
      }
    }

    // 交通费用优化
    const transportTrend = trends.find(t => t.category === '交通');
    if (transportTrend && transportTrend.months.length >= 2) {
      const latestTransport = transportTrend.months[transportTrend.months.length - 1].amount;
      const prevTransport = transportTrend.months[transportTrend.months.length - 2].amount;
      if (latestTransport > prevTransport * 1.2 && prevTransport > 0) {
        suggestions.push({
          type: 'transport_optimize',
          message: `交通费用本月 ${latestTransport.toFixed(0)} 元，环比增长显著，建议考虑公共交通或拼车`
        });
      }
    }

    // 储蓄建议
    const avgBalance = monthlyData.slice(-3).reduce((s, md) => s + (md.totalIncome - md.totalExpense), 0) / Math.min(3, monthlyData.length);
    if (avgBalance < 0) {
      suggestions.push({
        type: 'savings_warning',
        message: `近3个月平均月结余为 ${avgBalance.toFixed(0)} 元，入不敷出，建议重新规划预算`
      });
    } else if (avgBalance > 0 && current.totalIncome > 0) {
      const savingsRatio = avgBalance / current.totalIncome;
      if (savingsRatio < 0.2) {
        suggestions.push({
          type: 'savings_low',
          message: `近3个月储蓄率仅 ${(savingsRatio * 100).toFixed(1)}%，建议将目标储蓄率提升至20%以上`
        });
      }
    }

    // 生成总结
    const totalExpenseChange = lastMonth ? current.totalExpense - lastMonth.totalExpense : 0;
    const totalExpenseChangeRatio = lastMonth && lastMonth.totalExpense > 0
      ? (totalExpenseChange / lastMonth.totalExpense * 100).toFixed(1)
      : 0;

    const summary = `本月总支出 ${current.totalExpense.toFixed(0)} 元` +
      (lastMonth ? `，环比${totalExpenseChange >= 0 ? '增长' : '减少'} ${Math.abs(totalExpenseChangeRatio)}%` : '') +
      `，收入 ${current.totalIncome.toFixed(0)} 元` +
      `，结余 ${(current.totalIncome - current.totalExpense).toFixed(0)} 元。` +
      (alerts.length > 0 ? ` 共 ${alerts.length} 条预警需要注意。` : ' 财务状况良好。');

    return res.json(successResponse({
      summary,
      trends,
      alerts,
      suggestions,
      monthlyComparison
    }));
  } catch (err) {
    return res.json(errorResponse('获取财务洞察失败: ' + err.message));
  }
});

module.exports = router;
