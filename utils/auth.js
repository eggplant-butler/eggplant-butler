const jwt = require('jsonwebtoken');
const userConfig = require('../config/user');
const { store } = require('./store');

const JWT_SECRET = process.env.JWT_SECRET || 'eggplant-butler-secret-2026';
const TOKEN_EXPIRY = '24h';

// JWT 安全中间件
function authMiddleware(req, res, next) {
  // 跳过静态文件、根页面和健康检查
  const skipPaths = ['/public', '/api/health', '/api/notion/webhook'];
  const isStatic = req.path.startsWith('/public') || req.path === '/favicon.ico';
  const isSkipped = skipPaths.some(p => req.path === p) || req.path === '/login.html';

  if (isStatic || isSkipped) {
    return next();
  }

  // 仅对 /api/* 路由应用认证
  if (!req.path.startsWith('/api/')) {
    return next();
  }

  // 如果密码为空，直接放行（开发模式）
  if (!userConfig.accessPassword) {
    return next();
  }

  // POST /api/auth/login 不需要 token
  if (req.path === '/api/auth/login') {
    return next();
  }

  // 优先检查 Authorization Bearer token
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      return next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          data: null,
          message: 'Token已过期，请重新登录'
        });
      }
      return res.status(403).json({
        success: false,
        data: null,
        message: 'Token无效'
      });
    }
  }

  // 兼容旧版 x-access-password（过渡期支持）
  const password = req.headers['x-access-password'];
  if (password && password === userConfig.accessPassword) {
    req.user = { mode: 'legacy' };
    return next();
  }

  return res.status(401).json({
    success: false,
    data: null,
    message: '未授权访问，请提供有效Token或通过 /login.html 登录'
  });
}

// 生成 JWT Token
function generateToken() {
  const payload = {
    iat: Date.now(),
    // 可附加更多用户信息
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

// 验证密码并生成 token
function authenticate(password) {
  if (password === userConfig.accessPassword) {
    const token = generateToken();
    return { success: true, token, expiresIn: '24h' };
  }
  return { success: false, message: '密码错误' };
}

module.exports = { authMiddleware, generateToken, authenticate, JWT_SECRET };
