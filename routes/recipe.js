const express = require('express');
const router = express.Router();
const moment = require('moment');
const schedule = require('node-schedule');
const { v4: uuidv4 } = require('uuid');
const { successResponse, errorResponse, todayStr } = require('../utils/helpers');
const { store } = require('../utils/store');
const { sendNotification } = require('../utils/notifier');

// 添加菜谱
router.post('/', (req, res) => {
  try {
    const { name, ingredients = [], cookTime, difficulty = 'medium', steps, tags, notes } = req.body;

    if (!name) {
      return res.json(errorResponse('请输入菜谱名称'));
    }

    // 标准化食材列表
    const normalizedIngredients = ingredients.map(ing => {
      if (typeof ing === 'string') {
        return { name: ing, amount: '', unit: '' };
      }
      return {
        name: ing.name || '',
        amount: ing.amount || '',
        unit: ing.unit || ''
      };
    }).filter(ing => ing.name);

    const recipe = {
      id: uuidv4(),
      type: 'recipe',
      name,
      ingredients: normalizedIngredients,
      cookTime: cookTime || 30, // 分钟
      difficulty, // easy, medium, hard
      steps: steps || [],
      tags: tags || [],
      notes: notes || '',
      createdAt: new Date().toISOString()
    };

    const result = store.create('recipes', recipe);
    return res.json(successResponse(result, '菜谱已添加'));
  } catch (err) {
    return res.json(errorResponse('添加失败: ' + err.message));
  }
});

// 获取所有菜谱
router.get('/', (req, res) => {
  try {
    const { tag, difficulty } = req.query;
    let recipes = store.getAll('recipes');

    if (tag) {
      recipes = recipes.filter(r => (r.tags || []).includes(tag));
    }
    if (difficulty) {
      recipes = recipes.filter(r => r.difficulty === difficulty);
    }

    return res.json(successResponse({
      recipes,
      total: recipes.length
    }));
  } catch (err) {
    return res.json(errorResponse('获取失败: ' + err.message));
  }
});

// 根据冰箱库存推荐菜谱
router.get('/recommend', (req, res) => {
  try {
    const recipes = store.getAll('recipes');
    const fridgeItems = store.query('inventory', i => i.location === 'fridge');
    const shoppingList = store.getAll('shopping_list').filter(s => !s.purchased);

    // 构建冰箱食材名称集合（统一小写匹配）
    const fridgeNames = new Set();
    const fridgeMap = {};
    fridgeItems.forEach(item => {
      const key = item.name.toLowerCase().trim();
      fridgeNames.add(key);
      fridgeMap[key] = item;
    });

    const results = [];

    for (const recipe of recipes) {
      const recipeIngredients = recipe.ingredients || [];
      let matched = 0;
      let missing = [];
      let matchedItems = [];

      for (const ing of recipeIngredients) {
        const ingName = (ing.name || '').toLowerCase().trim();
        // 模糊匹配：检查冰箱中是否有包含该食材名称的物品
        const foundKey = Array.from(fridgeNames).find(fn =>
          fn.includes(ingName) || ingName.includes(fn)
        );

        if (foundKey) {
          matched++;
          matchedItems.push({
            ingredient: ing.name,
            fridgeItem: fridgeMap[foundKey].name,
            quantity: fridgeMap[foundKey].quantity,
            unit: fridgeMap[foundKey].unit
          });
        } else {
          missing.push(ing.name);
        }
      }

      const total = recipeIngredients.length;
      const matchRate = total > 0 ? Math.round((matched / total) * 100) : 0;

      results.push({
        recipe,
        matchRate,
        matchedCount: matched,
        totalIngredients: total,
        matchedItems,
        missingIngredients: missing,
        canCook: matchRate >= 70 // 70%以上认为可以做
      });
    }

    // 按匹配度排序
    results.sort((a, b) => b.matchRate - a.matchRate);

    const canCookRecipes = results.filter(r => r.canCook);
    const cannotCookRecipes = results.filter(r => !r.canCook);

    // 如果完全无匹配，生成采购清单建议
    let purchaseSuggestion = null;
    if (canCookRecipes.length === 0 && recipes.length > 0) {
      // 收集所有缺失食材
      const allMissing = {};
      results.forEach(r => {
        r.missingIngredients.forEach(ing => {
          allMissing[ing] = (allMissing[ing] || 0) + 1;
        });
      });

      // 按缺失频率排序
      const sortedMissing = Object.entries(allMissing)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, neededBy: count }));

      // 结合现有购物清单
      const existingShopping = shoppingList.map(s => s.name);
      const newSuggestions = sortedMissing.filter(m => !existingShopping.includes(m.name));

      purchaseSuggestion = {
        reason: '当前冰箱食材不足以制作任何菜谱',
        topMissing: sortedMissing,
        alreadyInShoppingList: existingShopping,
        suggestedNewPurchases: newSuggestions
      };
    }

    return res.json(successResponse({
      fridgeItemCount: fridgeItems.length,
      totalRecipes: recipes.length,
      canCookCount: canCookRecipes.length,
      canCookRecipes: canCookRecipes.slice(0, 5),
      otherRecipes: cannotCookRecipes.slice(0, 5),
      purchaseSuggestion,
      date: todayStr()
    }));
  } catch (err) {
    return res.json(errorResponse('推荐失败: ' + err.message));
  }
});

// 获取单个菜谱详情
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const recipe = store.getById('recipes', id);

    if (!recipe) {
      return res.json(errorResponse('菜谱不存在'));
    }

    return res.json(successResponse(recipe));
  } catch (err) {
    return res.json(errorResponse('获取失败: ' + err.message));
  }
});

// 删除菜谱
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const deleted = store.delete('recipes', id);
    if (!deleted) {
      return res.json(errorResponse('菜谱不存在'));
    }
    return res.json(successResponse(null, '菜谱已删除'));
  } catch (err) {
    return res.json(errorResponse('删除失败: ' + err.message));
  }
});

// ===== 每天早上7:00自动菜谱推荐 =====
function initRecipeScheduler() {
  schedule.scheduleJob('0 7 * * *', async () => {
    console.log('[菜谱定时任务] 开始推荐今日菜谱...');

    try {
      const recipes = store.getAll('recipes');
      if (recipes.length === 0) {
        console.log('[菜谱定时任务] 暂无菜谱，跳过');
        return;
      }

      const fridgeItems = store.query('inventory', i => i.location === 'fridge');
      const fridgeNames = new Set(fridgeItems.map(i => i.name.toLowerCase().trim()));

      let canCookList = [];
      let lowStockRecipes = [];

      for (const recipe of recipes) {
        const ingredients = recipe.ingredients || [];
        let matched = 0;
        let missing = [];

        for (const ing of ingredients) {
          const ingName = (ing.name || '').toLowerCase().trim();
          const found = Array.from(fridgeNames).some(fn =>
            fn.includes(ingName) || ingName.includes(fn)
          );
          if (found) {
            matched++;
          } else {
            missing.push(ing.name);
          }
        }

        const total = ingredients.length;
        const matchRate = total > 0 ? Math.round((matched / total) * 100) : 0;

        if (matchRate >= 70) {
          canCookList.push({ name: recipe.name, matchRate, missing });
        } else if (matchRate >= 40) {
          lowStockRecipes.push({ name: recipe.name, matchRate, missing });
        }
      }

      // 检查冰箱库存是否偏低
      const lowStockItems = fridgeItems.filter(i => i.quantity <= i.minQuantity);
      const isLowStock = lowStockItems.length > 0;

      // 构建推送消息
      let message = '';
      if (canCookList.length > 0) {
        const top = canCookList.slice(0, 2);
        message = `🍳 今日菜谱建议\n当前食材能做：${top.map(r => r.name).join('、')}`;
        if (lowStockRecipes.length > 0) {
          const extra = lowStockRecipes[0];
          message += `\n想做「${extra.name}」还需购买：${extra.missing.slice(0, 3).join('、')}`;
        }
      } else if (isLowStock) {
        message = `🍳 今日菜谱建议\n冰箱库存偏低（${lowStockItems.length}项），暂无可直接制作的菜谱。建议采购后查看推荐。`;
      } else {
        message = '🍳 今日菜谱建议\n暂无匹配菜谱，建议添加新菜谱或补充食材。';
      }

      await sendNotification('🍳 今日菜谱建议', message);
      console.log('[菜谱定时任务] 推送完成');

    } catch (err) {
      console.error('[菜谱定时任务] 失败:', err.message);
    }
  });

  console.log('[菜谱模块] 定时推荐已初始化（每日07:00）');
}

module.exports = { router, initRecipeScheduler };
