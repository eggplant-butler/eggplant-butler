const express = require('express');
const router = express.Router();
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const { successResponse, errorResponse, todayStr } = require('../utils/helpers');
const { store } = require('../utils/store');

// 添加/更新物品
router.post('/item', (req, res) => {
  try {
    const { name, category, quantity = 1, unit = '个', minQuantity = 1, shelfLifeDays, notes, location = 'fridge' } = req.body;

    if (!name) {
      return res.json(errorResponse('请输入物品名称'));
    }

    const item = {
      id: uuidv4(),
      type: 'inventory',
      name,
      category: category || '其他',
      quantity: parseFloat(quantity),
      unit,
      minQuantity: parseFloat(minQuantity),
      shelfLifeDays: shelfLifeDays || null,
      addedDate: todayStr(),
      expiryDate: shelfLifeDays
        ? moment().add(parseInt(shelfLifeDays), 'days').format('YYYY-MM-DD')
        : null,
      location, // fridge, pantry, bathroom, etc.
      notes: notes || '',
      tags: [],
      createdAt: new Date().toISOString()
    };

    const result = store.create('inventory', item);
    return res.json(successResponse(result, '物品已添加'));
  } catch (err) {
    return res.json(errorResponse('添加失败: ' + err.message));
  }
});

// 消耗物品
router.patch('/:id/consume', (req, res) => {
  try {
    const { id } = req.params;
    const { amount = 1, notes } = req.body;

    const item = store.getById('inventory', id);
    if (!item) {
      return res.json(errorResponse('物品不存在'));
    }

    const newQuantity = Math.max(0, parseFloat(item.quantity) - parseFloat(amount));
    const isLow = newQuantity <= item.minQuantity;

    const updated = store.update('inventory', id, {
      quantity: newQuantity,
      lastConsumed: todayStr(),
      updatedAt: new Date().toISOString()
    });

    // 如果低于警戒，自动加入购物清单
    let addedToShopping = false;
    if (isLow) {
      const shoppingList = store.getAll('shopping_list');
      const existing = shoppingList.find(s => s.itemId === id);
      if (!existing) {
        store.create('shopping_list', {
          id: uuidv4(),
          itemId: id,
          name: item.name,
          category: item.category,
          quantity: item.minQuantity * 2,
          unit: item.unit,
          priority: newQuantity === 0 ? 'high' : 'medium',
          source: 'low_stock',
          addedDate: todayStr(),
          purchased: false,
          createdAt: new Date().toISOString()
        });
        addedToShopping = true;
      }
    }

    return res.json(successResponse({
      item: updated,
      consumed: amount,
      remaining: newQuantity,
      isLow,
      addedToShopping
    }, isLow ? '库存不足，已加入购物清单' : '消耗已记录'));
  } catch (err) {
    return res.json(errorResponse('操作失败: ' + err.message));
  }
});

// 获取库存列表
router.get('/items', (req, res) => {
  try {
    const { category, location, lowStock } = req.query;
    let items = store.getAll('inventory');

    if (category) {
      items = items.filter(i => i.category === category);
    }
    if (location) {
      items = items.filter(i => i.location === location);
    }
    if (lowStock === 'true') {
      items = items.filter(i => i.quantity <= i.minQuantity);
    }

    items.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

    return res.json(successResponse({
      items,
      total: items.length,
      lowStockCount: items.filter(i => i.quantity <= i.minQuantity).length
    }));
  } catch (err) {
    return res.json(errorResponse('获取失败: ' + err.message));
  }
});

// 获取购物清单
router.get('/shopping-list', (req, res) => {
  try {
    const { category, purchased } = req.query;
    let items = store.getAll('shopping_list');

    if (category) {
      items = items.filter(i => i.category === category);
    }
    if (purchased !== undefined) {
      items = items.filter(i => i.purchased === (purchased === 'true'));
    } else {
      items = items.filter(i => !i.purchased);
    }

    // 按分类分组
    const grouped = {};
    items.forEach(item => {
      const cat = item.category || '其他';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    });

    // 按优先级排序
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    items.sort((a, b) =>
      (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2)
    );

    return res.json(successResponse({
      items,
      grouped,
      total: items.length,
      totalEstimatedCost: items.reduce((sum, i) => sum + (i.estimatedPrice || 0) * i.quantity, 0)
    }));
  } catch (err) {
    return res.json(errorResponse('获取购物清单失败: ' + err.message));
  }
});

// 添加到购物清单
router.post('/shopping-list', (req, res) => {
  try {
    const { name, category, quantity = 1, unit = '个', priority = 'medium', notes } = req.body;

    if (!name) {
      return res.json(errorResponse('请输入物品名称'));
    }

    const item = {
      id: uuidv4(),
      name,
      category: category || '其他',
      quantity: parseFloat(quantity),
      unit,
      priority,
      source: 'manual',
      addedDate: todayStr(),
      purchased: false,
      notes: notes || '',
      createdAt: new Date().toISOString()
    };

    const result = store.create('shopping_list', item);
    return res.json(successResponse(result, '已添加到购物清单'));
  } catch (err) {
    return res.json(errorResponse('添加失败: ' + err.message));
  }
});

// 标记购物清单项目已购买
router.post('/shopping-list/:id/purchased', (req, res) => {
  try {
    const { id } = req.params;
    const { actualPrice, addToInventory = false } = req.body;

    const item = store.getById('shopping_list', id);
    if (!item) {
      return res.json(errorResponse('项目不存在'));
    }

    const updated = store.update('shopping_list', id, {
      purchased: true,
      purchasedDate: todayStr(),
      actualPrice: actualPrice || null,
      updatedAt: new Date().toISOString()
    });

    // 如果选择加入库存
    if (addToInventory) {
      store.create('inventory', {
        id: uuidv4(),
        type: 'inventory',
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        minQuantity: 1,
        addedDate: todayStr(),
        location: 'pantry',
        createdAt: new Date().toISOString()
      });
    }

    return res.json(successResponse(updated, '已标记为已购买'));
  } catch (err) {
    return res.json(errorResponse('操作失败: ' + err.message));
  }
});

// 获取冰箱物品及快过期提醒
router.get('/fridge', (req, res) => {
  try {
    const today = todayStr();
    const items = store.query('inventory', i => i.location === 'fridge');

    // 计算快过期的物品（保鲜期前1天）
    const expiringSoon = [];
    const expired = [];

    items.forEach(item => {
      if (item.expiryDate) {
        const daysUntil = moment(item.expiryDate).diff(moment(today), 'days');
        if (daysUntil < 0) {
          expired.push({ ...item, daysExpired: -daysUntil });
        } else if (daysUntil <= 1) {
          expiringSoon.push({ ...item, daysRemaining: daysUntil });
        }
      }
    });

    return res.json(successResponse({
      items,
      total: items.length,
      expiringSoon,
      expiringCount: expiringSoon.length,
      expired,
      expiredCount: expired.length,
      warning: expiringSoon.length > 0 || expired.length > 0
    }));
  } catch (err) {
    return res.json(errorResponse('获取冰箱数据失败: ' + err.message));
  }
});

// 删除物品
router.delete('/item/:id', (req, res) => {
  try {
    const { id } = req.params;
    const deleted = store.delete('inventory', id);
    if (!deleted) {
      return res.json(errorResponse('物品不存在'));
    }
    return res.json(successResponse(null, '物品已删除'));
  } catch (err) {
    return res.json(errorResponse('删除失败: ' + err.message));
  }
});

module.exports = router;
