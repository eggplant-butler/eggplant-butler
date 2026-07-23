const express = require('express');
const path = require('path');

// 加载环境变量（可选）
try {
  require('dotenv').config();
} catch (e) {
  // dotenv 不是必须的
}

// 导入路由
const weatherRoute = require('./routes/weather');
const scheduleRoute = require('./routes/schedule');
const financeRoute = require('./routes/finance');
const habitRoute = require('./routes/habit');
const healthRoute = require('./routes/health');
const petRoute = require('./routes/pet');
const choresRoute = require('./routes/chores');
const inventoryRoute = require('./routes/inventory');
const socialRoute = require('./routes/social');
const workRoute = require('./routes/work');
const photoRoute = require('./routes/photo');
const readingModule = require('./routes/reading');
const wishRoute = require('./routes/wish');
const joyRoute = require('./routes/joy');
const inboxRoute = require('./routes/inbox');
const todayQuestionRoute = require('./routes/todayQuestion');
const adminModule = require('./routes/admin');
const newsModule = require('./routes/news');
const emotionRoute = require('./routes/emotion');
const recipeModule = require('./routes/recipe');

// 导入工具
const { startAllSchedulers } = require('./utils/notifier');
const { initBackupScheduler, performBackup } = require('./utils/backup');
const { successResponse, errorResponse } = require('./utils/helpers');
const authMiddlewareModule = require('./utils/auth');
const authMiddleware = authMiddlewareModule.authMiddleware;
const { authenticate } = authMiddlewareModule;
const { logAction } = require('./routes/admin');
const ngrok = require('ngrok');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件
app.use('/public', express.static(path.join(__dirname, 'public')));

// CORS（开发用）
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-access-password');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// 安全中间件（检查 JWT token 或密码）
app.use(authMiddleware);

// 登录接口：验证密码，返回 JWT token
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json(errorResponse('请输入密码'));
  }
  const result = authenticate(password);
  if (result.success) {
    res.json(successResponse({
      token: result.token,
      expiresIn: result.expiresIn
    }, '登录成功'));
  } else {
    res.status(403).json(errorResponse(result.message));
  }
});

// 操作日志中间件：记录所有 POST/PATCH/DELETE 请求（放在路由之前）
app.use('/api', (req, res, next) => {
  // 跳过登录接口本身（避免密码写入日志）
  if (req.path === '/auth/login') return next();

  const writeMethods = ['POST', 'PATCH', 'PUT', 'DELETE'];
  if (writeMethods.includes(req.method)) {
    const parts = req.path.split('/').filter(Boolean);
    const module = parts[0] || 'unknown';
    const summary = `${req.method} ${req.path}`;
    logAction(req, module, summary);
  }
  next();
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json(successResponse({
    status: 'ok',
    service: 'eggplant-butler',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  }, '服务运行正常'));
});

// 注册路由
app.use('/api/weather', weatherRoute.router);
app.use('/api/schedule', scheduleRoute);
app.use('/api/finance', financeRoute);
app.use('/api/habit', habitRoute);
app.use('/api/health', healthRoute);
app.use('/api/pet', petRoute);
app.use('/api/chores', choresRoute);
app.use('/api/inventory', inventoryRoute);
app.use('/api/social', socialRoute);
app.use('/api/work', workRoute);
app.use('/api/photo', photoRoute);
app.use('/api/reading', readingModule.router);
app.use('/api/wish', wishRoute);
app.use('/api/joy', joyRoute);
app.use('/api/inbox', inboxRoute);
app.use('/api/today-question', todayQuestionRoute);
app.use('/api/admin', adminModule.router);
app.use('/api/news', newsModule.router);
app.use('/api/emotion', emotionRoute);
app.use('/api/recipe', recipeModule.router);

// Notion Webhook 预留
app.post('/api/notion/webhook', (req, res) => {
  console.log('[Notion Webhook] 收到请求:', JSON.stringify(req.body));
  res.json(successResponse({ received: true }, 'Webhook已接收'));
});

// 手动触发备份
app.post('/api/admin/backup', (req, res) => {
  const result = performBackup();
  if (result.success) {
    res.json(successResponse({ backupPath: result.backupPath }, '备份完成'));
  } else {
    res.json(errorResponse('备份失败: ' + result.error));
  }
});

// 获取备份列表
app.get('/api/admin/backups', (req, res) => {
  const { getBackupList } = require('./utils/backup');
  const list = getBackupList();
  res.json(successResponse({ backups: list, total: list.length }));
});

// 主页面（工作台）
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 登录页面
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// 404处理
app.use((req, res) => {
  res.status(404).json(errorResponse('接口不存在', { path: req.path, method: req.method }));
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json(errorResponse('服务器内部错误: ' + err.message));
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🍆 茄子管家 (Eggplant Butler) 启动成功！');
  console.log('========================================');
  console.log(`服务地址: http://localhost:${PORT}`);
  console.log(`工作台: http://localhost:${PORT}/`);
  console.log(`健康检查: http://localhost:${PORT}/api/health`);
  console.log('========================================');
  console.log('');

  // 初始化定时任务
  startAllSchedulers();
  weatherRoute.initWeatherScheduler();
  readingModule.initReadingReminder();
  newsModule.initNewsScheduler();
  recipeModule.initRecipeScheduler();
  wishRoute.initWishReportScheduler();
  initBackupScheduler();
  adminModule.initDefaultRules();

  console.log('所有定时任务已启动');
  console.log('');

  // 启动 ngrok 隧道（失败不影响主服务）
  startNgrok();
});

async function startNgrok() {
  const authtoken = process.env.NGROK_AUTHTOKEN;

  if (!authtoken) {
    console.log('');
    console.log('[ngrok] 未设置 NGROK_AUTHTOKEN 环境变量，跳过公网隧道。');
    console.log('[ngrok] 如需公网访问，请注册 ngrok 并获取 authtoken：');
    console.log('        https://dashboard.ngrok.com/get-started/your-authtoken');
    console.log('[ngrok] 然后执行：export NGROK_AUTHTOKEN=你的token');
    console.log('');
    return;
  }

  try {
    await ngrok.authtoken(authtoken);
    const url = await ngrok.connect(PORT);
    console.log('');
    console.log('🌐 ngrok 隧道已建立');
    console.log('========================================');
    console.log(`📱 手机访问地址：${url}`);
    console.log('========================================');
    console.log('');
  } catch (err) {
    console.warn('[ngrok] 启动失败:', err.message);
    console.warn('手机无法通过公网访问，请检查网络或使用局域网 IP');
  }
}

module.exports = app;