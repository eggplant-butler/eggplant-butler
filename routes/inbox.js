const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { successResponse, errorResponse, todayStr, nowTimeStr } = require('../utils/helpers');
const { store } = require('../utils/store');

// 添加闪念笔记
router.post('/', (req, res) => {
  try {
    const { content, source, tags } = req.body;

    if (!content) {
      return res.json(errorResponse('请输入内容'));
    }

    const note = {
      id: uuidv4(),
      type: 'note',
      noteType: 'inbox',
      content,
      category: null,
      source: source || 'manual',
      tags: tags || [],
      processed: false,
      suggestedCategory: null,
      date: todayStr(),
      time: nowTimeStr(),
      createdAt: new Date().toISOString()
    };

    const result = store.create('inbox', note);
    return res.json(successResponse(result, '笔记已添加'));
  } catch (err) {
    return res.json(errorResponse('添加失败: ' + err.message));
  }
});

// 获取未处理的笔记
router.get('/unprocessed', (req, res) => {
  try {
    const notes = store.query('inbox', n => n.noteType === 'inbox' && !n.processed);
    notes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    // AI归类建议（基于关键词简单匹配）
    const suggestions = notes.map(note => {
      const suggested = suggestCategory(note.content);
      return {
        ...note,
        suggestedCategory: suggested.category,
        suggestionReason: suggested.reason
      };
    });

    return res.json(successResponse({
      notes: suggestions,
      total: suggestions.length
    }));
  } catch (err) {
    return res.json(errorResponse('获取失败: ' + err.message));
  }
});

// AI归类建议
function suggestCategory(content) {
  const keywords = {
    '工作': ['客户', '工作', '会议', '项目', '任务', '汇报', '方案', '需求', 'KPI', '业绩', '销售', '面试', '公司', '同事', '老板'],
    '财务': ['钱', '花费', '支出', '收入', '预算', '省钱', '买', '价格', '工资', '提成', '投资', '储蓄'],
    '学习': ['学习', '读书', '课程', '技能', '知识', '研究', '总结', '方法', '效率'],
    '摄影': ['拍照', '摄影', '相机', '镜头', '构图', '光线', '理光', '参数', '后期'],
    '健康': ['身体', '健康', '运动', '健身', '减肥', '饮食', '睡眠', '喝水', '体检', '药'],
    '宠物': ['猫', '猫砂', '猫粮', '茄子', '宠物', '驱虫', '疫苗', '梳毛', '剪指甲'],
    '社交': ['朋友', '家人', '聚会', '约会', '联系', '生日', '礼物', '关系'],
    '家务': ['打扫', '洗衣', '做饭', '整理', '收纳', '拖地', '清洁', '买菜', '冰箱'],
    '愿望': ['想买', '想要', '愿望', '目标', '计划', '梦想', '存钱']
  };

  const scores = {};
  for (const [category, words] of Object.entries(keywords)) {
    let score = 0;
    for (const word of words) {
      if (content.includes(word)) {
        score++;
      }
    }
    if (score > 0) {
      scores[category] = score;
    }
  }

  if (Object.keys(scores).length === 0) {
    return { category: '其他', reason: '未匹配到明确分类' };
  }

  // 返回最高分的分类
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return {
    category: sorted[0][0],
    reason: `匹配到${sorted[0][1]}个关键词`
  };
}

// 处理笔记（归类或删除）
router.post('/:id/process', (req, res) => {
  try {
    const { id } = req.params;
    const { category, action, targetModule } = req.body;

    const note = store.getById('inbox', id);
    if (!note) {
      return res.json(errorResponse('笔记不存在'));
    }

    if (action === 'categorize') {
      const updated = store.update('inbox', id, {
        category: category || note.suggestedCategory,
        processed: true,
        processedAt: new Date().toISOString()
      });
      return res.json(successResponse(updated, '笔记已归类'));
    }

    if (action === 'delete') {
      store.delete('inbox', id);
      return res.json(successResponse(null, '笔记已删除'));
    }

    if (action === 'move') {
      // 移动到对应模块（如任务、愿望等）
      const updated = store.update('inbox', id, {
        processed: true,
        movedTo: targetModule,
        processedAt: new Date().toISOString()
      });
      return res.json(successResponse(updated, `已移动到${targetModule}`));
    }

    return res.json(errorResponse('未知操作'));
  } catch (err) {
    return res.json(errorResponse('操作失败: ' + err.message));
  }
});

// 获取所有笔记
router.get('/', (req, res) => {
  try {
    const { processed, category, limit = 50, offset = 0 } = req.query;
    let notes = store.getAll('inbox').filter(n => n.noteType === 'inbox');

    if (processed !== undefined) {
      notes = notes.filter(n => n.processed === (processed === 'true'));
    }
    if (category) {
      notes = notes.filter(n => n.category === category);
    }

    notes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return res.json(successResponse({
      notes: notes.slice(parseInt(offset), parseInt(offset) + parseInt(limit)),
      total: notes.length,
      unprocessedCount: notes.filter(n => !n.processed).length
    }));
  } catch (err) {
    return res.json(errorResponse('获取失败: ' + err.message));
  }
});

// 批量AI归类（每日一次）
router.post('/batch-suggest', (req, res) => {
  try {
    const notes = store.query('inbox', n => n.noteType === 'inbox' && !n.processed && !n.suggestedCategory);

    const updated = notes.map(note => {
      const suggested = suggestCategory(note.content);
      return store.update('inbox', note.id, {
        suggestedCategory: suggested.category,
        suggestionReason: suggested.reason,
        suggestedAt: new Date().toISOString()
      });
    });

    return res.json(successResponse({
      processed: updated.length,
      notes: updated
    }, `已为${updated.length}条笔记生成归类建议`));
  } catch (err) {
    return res.json(errorResponse('操作失败: ' + err.message));
  }
});

module.exports = router;
