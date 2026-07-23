const express = require('express');
const router = express.Router();
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const { successResponse, errorResponse, todayStr } = require('../utils/helpers');
const { store } = require('../utils/store');

// 创建愿望
router.post('/', (req, res) => {
  try {
    const { name, targetAmount, priority = 'medium', category, deadline, description, tags } = req.body;

    if (!name) {
      return res.json(errorResponse('请输入愿望名称'));
    }

    const wish = {
      id: uuidv4(),
      type: 'wish',
      name,
      targetAmount: parseFloat(targetAmount) || 0,
      currentAmount: 0,
      priority, // high, medium, low
      category: category || '其他',
      deadline: deadline || '',
      description: description || '',
      tags: tags || [],
      status: 'active', // active, completed, abandoned
      createdAt: new Date().toISOString()
    };

    const result = store.create('wishes', wish);
    return res.json(successResponse(result, '愿望已添加'));
  } catch (err) {
    return res.json(errorResponse('添加失败: ' + err.message));
  }
});

// 存入储蓄
router.post('/saving', (req, res) => {
  try {
    const { wishId, amount, source, notes } = req.body;

    if (!wishId || !amount) {
      return res.json(errorResponse('请指定愿望和金额'));
    }

    const wish = store.getById('wishes', wishId);
    if (!wish) {
      return res.json(errorResponse('愿望不存在'));
    }

    const newAmount = parseFloat(wish.currentAmount || 0) + parseFloat(amount);
    const isCompleted = newAmount >= wish.targetAmount;

    const updated = store.update('wishes', wishId, {
      currentAmount: newAmount,
      status: isCompleted ? 'completed' : wish.status,
      completedAt: isCompleted ? new Date().toISOString() : wish.completedAt,
      updatedAt: new Date().toISOString()
    });

    // 记录储蓄历史
    store.create('saving_records', {
      id: uuidv4(),
      wishId,
      amount: parseFloat(amount),
      source: source || '',
      notes: notes || '',
      date: todayStr(),
      createdAt: new Date().toISOString()
    });

    return res.json(successResponse({
      wish: updated,
      saved: parseFloat(amount),
      isNewlyCompleted: isCompleted && wish.status !== 'completed'
    }, isCompleted ? '🎉 恭喜！愿望已达成！' : '储蓄已存入'));
  } catch (err) {
    return res.json(errorResponse('操作失败: ' + err.message));
  }
});

// 获取愿望进度
router.get('/status', (req, res) => {
  try {
    const wishes = store.getAll('wishes');
    const savingRecords = store.getAll('saving_records');

    const wishesWithProgress = wishes.map(wish => {
      const progress = wish.targetAmount > 0
        ? ((wish.currentAmount || 0) / wish.targetAmount * 100).toFixed(1)
        : 0;
      const remaining = Math.max(0, wish.targetAmount - (wish.currentAmount || 0));

      // 计算预计达成日期（基于过去30天的储蓄速度）
      const recentSavings = savingRecords.filter(s => s.wishId === wish.id);
      let estimatedDate = null;
      let monthlySavingRate = 0;

      if (recentSavings.length > 0) {
        const totalSaved = wish.currentAmount || 0;
        const daysSinceStart = moment().diff(moment(wish.createdAt), 'days');
        if (daysSinceStart > 0 && totalSaved > 0) {
          const dailyRate = totalSaved / daysSinceStart;
          monthlySavingRate = dailyRate * 30;
          if (remaining > 0 && dailyRate > 0) {
            const daysRemaining = Math.ceil(remaining / dailyRate);
            estimatedDate = moment().add(daysRemaining, 'days').format('YYYY-MM-DD');
          }
        }
      }

      return {
        ...wish,
        progress: `${progress}%`,
        progressNum: parseFloat(progress),
        remaining,
        estimatedDate,
        monthlySavingRate
      };
    });

    // 按优先级和进度排序
    wishesWithProgress.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      if (a.status !== b.status) {
        if (a.status === 'active') return -1;
        if (b.status === 'active') return 1;
      }
      return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2) ||
        a.progressNum - b.progressNum;
    });

    // 汇总统计
    const totalTarget = wishes.reduce((sum, w) => sum + w.targetAmount, 0);
    const totalSaved = wishes.reduce((sum, w) => sum + (w.currentAmount || 0), 0);
    const completedCount = wishes.filter(w => w.status === 'completed').length;

    return res.json(successResponse({
      wishes: wishesWithProgress,
      total: wishes.length,
      activeCount: wishes.filter(w => w.status === 'active').length,
      completedCount,
      totalTarget,
      totalSaved,
      overallProgress: totalTarget > 0 ? `${(totalSaved / totalTarget * 100).toFixed(1)}%` : '0%'
    }));
  } catch (err) {
    return res.json(errorResponse('获取状态失败: ' + err.message));
  }
});

// 获取单个愿望详情
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const wish = store.getById('wishes', id);

    if (!wish) {
      return res.json(errorResponse('愿望不存在'));
    }

    const savingRecords = store.query('saving_records', s => s.wishId === id);
    savingRecords.sort((a, b) => b.date.localeCompare(a.date));

    const progress = wish.targetAmount > 0
      ? ((wish.currentAmount || 0) / wish.targetAmount * 100).toFixed(1)
      : 0;

    return res.json(successResponse({
      wish,
      progress: `${progress}%`,
      savingRecords,
      totalDeposits: savingRecords.length
    }));
  } catch (err) {
    return res.json(errorResponse('获取失败: ' + err.message));
  }
});

// 更新愿望
router.patch('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const updated = store.update('wishes', id, {
      ...updates,
      updatedAt: new Date().toISOString()
    });

    if (!updated) {
      return res.json(errorResponse('愿望不存在'));
    }

    return res.json(successResponse(updated, '愿望已更新'));
  } catch (err) {
    return res.json(errorResponse('更新失败: ' + err.message));
  }
});

// ===== 愿望里程碑 =====

// 为愿望添加里程碑
router.post('/:id/milestone', (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, targetAmount, condition, order } = req.body;

    if (!title) {
      return res.json(errorResponse('请输入里程碑标题'));
    }

    const wish = store.getById('wishes', id);
    if (!wish) {
      return res.json(errorResponse('愿望不存在'));
    }

    const milestone = {
      id: uuidv4(),
      type: 'wish_milestone',
      wishId: id,
      title,
      description: description || '',
      targetAmount: parseFloat(targetAmount) || 0,
      condition: condition || '',
      status: 'pending', // pending, completed
      order: order !== undefined ? order : 999,
      completedAt: null,
      createdAt: new Date().toISOString()
    };

    const result = store.create('wish_milestones', milestone);
    return res.json(successResponse(result, '里程碑已添加'));
  } catch (err) {
    return res.json(errorResponse('添加失败: ' + err.message));
  }
});

// 完成里程碑
router.patch('/milestone/:milestoneId/complete', (req, res) => {
  try {
    const { milestoneId } = req.params;
    const milestone = store.getById('wish_milestones', milestoneId);

    if (!milestone) {
      return res.json(errorResponse('里程碑不存在'));
    }

    const updated = store.update('wish_milestones', milestoneId, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return res.json(successResponse(updated, '里程碑已完成'));
  } catch (err) {
    return res.json(errorResponse('操作失败: ' + err.message));
  }
});

// 获取愿望的路线图
router.get('/:id/roadmap', (req, res) => {
  try {
    const { id } = req.params;
    const wish = store.getById('wishes', id);

    if (!wish) {
      return res.json(errorResponse('愿望不存在'));
    }

    const milestones = store.query('wish_milestones', m => m.wishId === id);
    milestones.sort((a, b) => (a.order || 0) - (b.order || 0));

    const progress = wish.targetAmount > 0
      ? ((wish.currentAmount || 0) / wish.targetAmount * 100).toFixed(1)
      : 0;

    // 计算预计达成日期
    const savingRecords = store.query('saving_records', s => s.wishId === id);
    let estimatedDate = null;
    let isDelayed = false;

    if (savingRecords.length > 0 && wish.targetAmount > 0) {
      const totalSaved = wish.currentAmount || 0;
      const daysSinceStart = moment().diff(moment(wish.createdAt), 'days');
      if (daysSinceStart > 0 && totalSaved > 0) {
        const dailyRate = totalSaved / daysSinceStart;
        const remaining = Math.max(0, wish.targetAmount - totalSaved);
        if (dailyRate > 0) {
          estimatedDate = moment().add(Math.ceil(remaining / dailyRate), 'days').format('YYYY-MM-DD');
          // 判断是否延迟
          if (wish.deadline && estimatedDate > wish.deadline) {
            isDelayed = true;
          }
        }
      }
    }

    // 里程碑状态分析
    const completedMilestones = milestones.filter(m => m.status === 'completed');
    const pendingMilestones = milestones.filter(m => m.status === 'pending');

    // 自动检查是否达到金额里程碑
    for (const ms of pendingMilestones) {
      if (ms.targetAmount > 0 && (wish.currentAmount || 0) >= ms.targetAmount && ms.status !== 'completed') {
        store.update('wish_milestones', ms.id, {
          status: 'completed',
          completedAt: new Date().toISOString()
        });
        ms.status = 'completed';
        ms.completedAt = new Date().toISOString();
      }
    }

    return res.json(successResponse({
      wish: {
        id: wish.id,
        name: wish.name,
        targetAmount: wish.targetAmount,
        currentAmount: wish.currentAmount || 0,
        progress: `${progress}%`,
        deadline: wish.deadline,
        status: wish.status
      },
      milestones: milestones.map(m => ({
        ...m,
        isReached: m.targetAmount > 0 && (wish.currentAmount || 0) >= m.targetAmount
      })),
      stats: {
        total: milestones.length,
        completed: completedMilestones.length,
        pending: pendingMilestones.length,
        completionRate: milestones.length > 0 ? `${(completedMilestones.length / milestones.length * 100).toFixed(0)}%` : '0%'
      },
      estimatedDate,
      isDelayed,
      nextMilestone: pendingMilestones.sort((a, b) => (a.order || 0) - (b.order || 0))[0] || null
    }));
  } catch (err) {
    return res.json(errorResponse('获取路线图失败: ' + err.message));
  }
});

// 删除里程碑
router.delete('/milestone/:milestoneId', (req, res) => {
  try {
    const { milestoneId } = req.params;
    const deleted = store.delete('wish_milestones', milestoneId);
    if (!deleted) {
      return res.json(errorResponse('里程碑不存在'));
    }
    return res.json(successResponse(null, '里程碑已删除'));
  } catch (err) {
    return res.json(errorResponse('删除失败: ' + err.message));
  }
});

module.exports = router;

// ===== 月度愿望进度报告调度器 =====
const schedule = require('node-schedule');
const { sendNotification } = require('../utils/notifier');

function initWishReportScheduler() {
  // 每月1号上午9:00生成报告
  schedule.scheduleJob('0 9 1 * *', async () => {
    console.log('[定时任务] 生成愿望进度月度报告...');
    await generateMonthlyWishReport();
  });
  console.log('[愿望调度器] 月度报告定时任务已启动（每月1号 09:00）');
}

async function generateMonthlyWishReport() {
  try {
    const wishes = store.getAll('wishes');
    const milestones = store.getAll('wish_milestones');
    const savingRecords = store.getAll('saving_records');

    const now = moment();
    const lastMonth = now.clone().subtract(1, 'month');
    const lastMonthStr = lastMonth.format('YYYY年MM月');

    let reportLines = [`📊 ${lastMonthStr} 愿望进度报告`, ''];
    let hasContent = false;

    for (const wish of wishes) {
      if (wish.status === 'abandoned') continue;

      const wishMilestones = milestones.filter(m => m.wishId === wish.id);
      const completedThisMonth = wishMilestones.filter(m => {
        if (!m.completedAt) return false;
        const completedMonth = moment(m.completedAt).format('YYYY-MM');
        return completedMonth === lastMonth.format('YYYY-MM');
      });

      const wishSavings = savingRecords.filter(s => s.wishId === wish.id);
      const savedThisMonth = wishSavings
        .filter(s => moment(s.date).format('YYYY-MM') === lastMonth.format('YYYY-MM'))
        .reduce((sum, s) => sum + s.amount, 0);

      const progress = wish.targetAmount > 0
        ? ((wish.currentAmount || 0) / wish.targetAmount * 100).toFixed(1)
        : 0;

      // 计算预计达成
      let estimatedDate = null;
      let isDelayed = false;
      const totalSaved = wish.currentAmount || 0;
      const daysSinceStart = moment().diff(moment(wish.createdAt), 'days');
      if (daysSinceStart > 0 && totalSaved > 0 && wish.targetAmount > 0) {
        const dailyRate = totalSaved / daysSinceStart;
        const remaining = Math.max(0, wish.targetAmount - totalSaved);
        if (dailyRate > 0) {
          estimatedDate = moment().add(Math.ceil(remaining / dailyRate), 'days').format('YYYY-MM-DD');
          if (wish.deadline && estimatedDate > wish.deadline) {
            isDelayed = true;
          }
        }
      }

      reportLines.push(`🎯 ${wish.name}`);
      reportLines.push(`   当前进度: ${progress}% (¥${wish.currentAmount || 0} / ¥${wish.targetAmount})`);

      if (completedThisMonth.length > 0) {
        reportLines.push(`   ✅ 上月完成里程碑:`);
        completedThisMonth.forEach(m => {
          reportLines.push(`      · ${m.title}`);
        });
        hasContent = true;
      }

      if (savedThisMonth > 0) {
        reportLines.push(`   💰 上月存入: ¥${savedThisMonth.toFixed(2)}`);
        hasContent = true;
      }

      if (estimatedDate) {
        reportLines.push(`   📅 预计达成: ${estimatedDate}${isDelayed ? ' ⚠️已延迟' : ''}`);
      }

      const nextPending = wishMilestones
        .filter(m => m.status === 'pending')
        .sort((a, b) => (a.order || 0) - (b.order || 0))[0];
      if (nextPending) {
        reportLines.push(`   📝 下个里程碑: ${nextPending.title}`);
      }

      reportLines.push('');
    }

    if (!hasContent) {
      reportLines.push('上个月没有新的里程碑完成或储蓄记录。');
      reportLines.push('继续加油！💪');
    }

    const reportText = reportLines.join('\n');
    await sendNotification(
      `📊 ${lastMonthStr} 愿望进度报告`,
      `<pre>${reportText}</pre>`,
      { force: false }
    );

    console.log('[愿望报告] 月度报告已生成并推送');
  } catch (err) {
    console.error('[愿望报告] 生成失败:', err.message);
  }
}

module.exports.initWishReportScheduler = initWishReportScheduler;
module.exports.generateMonthlyWishReport = generateMonthlyWishReport;
