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

module.exports = router;
