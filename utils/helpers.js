const { v4: uuidv4 } = require('uuid');
const moment = require('moment');

// 生成UUID
function generateId() {
  return uuidv4();
}

// 获取今天的日期字符串 YYYY-MM-DD
function todayStr() {
  return moment().format('YYYY-MM-DD');
}

// 获取当前时间字符串 HH:mm
function nowTimeStr() {
  return moment().format('HH:mm');
}

// 获取当前ISO时间戳
function nowISO() {
  return new Date().toISOString();
}

// 统一响应格式
function successResponse(data, message = '操作成功') {
  return {
    success: true,
    data,
    message
  };
}

function errorResponse(message = '操作失败', data = null) {
  return {
    success: false,
    data,
    message
  };
}

// 解析金额文本（如"午餐25餐饮微信"）
// 增强版：支持简写、语音转文字容错、拼音识别
function parseExpenseText(rawText) {
  const result = {
    title: '',
    amount: 0,
    category: '其他',
    paymentMethod: '',
    notes: ''
  };

  if (!rawText) return result;

  // 预处理：统一小写、去多余空格
  let processedText = rawText.toLowerCase().replace(/\s+/g, ' ').trim();

  // === 语音容错：常见拼音/误识别替换 ===
  const pinyinFixes = [
    // 餐饮类
    { pattern: /wu\s?fan|wu\s?fan|wufan/g, replace: '午饭' },
    { pattern: /zao\s?fan|zaofan/g, replace: '早餐' },
    { pattern: /wan\s?fan|wanfan/g, replace: '晚餐' },
    { pattern: /can\s?yin|canyin/g, replace: '餐饮' },
    { pattern: /wai\s?mai|waimai/g, replace: '外卖' },
    { pattern: /nai\s?cha|naicha/g, replace: '奶茶' },
    { pattern: /ka\s?fei|kafei/g, replace: '咖啡' },
    { pattern: /ling\s?shi|lingshi/g, replace: '零食' },
    { pattern: /shui\s?guo|shuiguo/g, replace: '水果' },
    // 交通类
    { pattern: /di\s?di|didi/g, replace: '滴滴' },
    { pattern: /da\s?che|dache/g, replace: '打车' },
    { pattern: /chu\s?zu\s?che|chuzuche/g, replace: '出租车' },
    { pattern: /di\s?tie|ditie/g, replace: '地铁' },
    { pattern: /gong\s?jiao|gongjiao/g, replace: '公交' },
    { pattern: /gao\s?tie|gaotie/g, replace: '高铁' },
    // 支付类
    { pattern: /wei\s?xin|weixin/g, replace: '微信' },
    { pattern: /zhi\s?fu\s?bao|zhifubao/g, replace: '支付宝' },
    { pattern: /hua\s?bei|huabei/g, replace: '花呗' },
    { pattern: /yin\s?hang\s?ka|yinhangka/g, replace: '银行卡' },
    { pattern: /xian\s?jin|xianjin/g, replace: '现金' },
    // 购物类
    { pattern: /tao\s?bao|taobao/g, replace: '淘宝' },
    { pattern: /jing\s?dong|jingdong/g, replace: '京东' },
    { pattern: /pin\s?duo\s?duo|pinduoduo/g, replace: '拼多多' },
    // 宠物类
    { pattern: /mao\s?liang|maoliang/g, replace: '猫粮' },
    { pattern: /mao\s?sha|maosha/g, replace: '猫砂' },
    { pattern: /chong\s?wu|chongwu/g, replace: '宠物' },
    // 医疗类
    { pattern: /yi\s?yuan|yiyuan/g, replace: '医院' },
    { pattern: /kan\s?bing|kanbing/g, replace: '看病' },
    { pattern: /ti\s?jian|tijian/g, replace: '体检' },
    // 居住类
    { pattern: /fang\s?zu|fangzu/g, replace: '房租' },
    { pattern: /shui\s?dian|shuidian/g, replace: '水电' },
  ];

  for (const fix of pinyinFixes) {
    processedText = processedText.replace(fix.pattern, fix.replace);
  }

  // 提取金额（数字，可能带小数）
  const amountMatch = processedText.match(/(\d+\.?\d*)/);
  if (amountMatch) {
    result.amount = parseFloat(amountMatch[1]);
  }

  // 常见分类关键词
  const categoryKeywords = {
    '餐饮': ['午餐', '晚餐', '早餐', '饭', '外卖', '奶茶', '咖啡', '吃', '餐', '餐饮', '零食', '水果', '菜', '超市', '午饭'],
    '交通': ['地铁', '公交', '打车', '滴滴', '出租', '加油', '停车', '高铁', '火车', '机票'],
    '购物': ['衣服', '鞋', '包', '淘宝', '京东', '拼多多', '买', '购物'],
    '娱乐': ['电影', '游戏', 'KTV', '旅游', '门票', '演出'],
    '宠物': ['猫粮', '猫砂', '宠物', '猫', '狗', '驱虫', '疫苗'],
    '医疗': ['药', '医院', '看病', '体检', '挂号'],
    '教育': ['书', '课程', '学习', '培训'],
    '居住': ['房租', '水电', '物业', '网费'],
    '通讯': ['话费', '流量', '手机']
  };

  for (const [cat, keywords] of Object.entries(categoryKeywords)) {
    for (const kw of keywords) {
      if (processedText.includes(kw)) {
        result.category = cat;
        break;
      }
    }
    if (result.category !== '其他') break;
  }

  // 支付方式（增强：支持单字母简写）
  const paymentKeywords = {
    '微信': ['微信', 'wx', 'w', 'wechat'],
    '支付宝': ['支付宝', 'zfb', 'z', 'alipay'],
    '花呗': ['花呗', 'hb', 'h'],
    '现金': ['现金', 'xianjin'],
    '银行卡': ['银行卡', '信用卡', '刷卡', 'yinhangka']
  };

  // 简写匹配：前后不能是字母（但可以是数字、空格、标点或首尾）
  const paymentPatterns = {
    '微信': [/\bwx\b/, /(?:^|[^a-z])w(?:$|[^a-z])/i, /微信/, /wechat/],
    '支付宝': [/\bzfb\b/, /(?:^|[^a-z])z(?:$|[^a-z])/i, /支付宝/, /alipay/],
    '花呗': [/\bhb\b/, /(?:^|[^a-z])h(?:$|[^a-z])/i, /花呗/, /huabei/],
    '现金': [/\bxj\b/, /(?:^|[^a-z])xj(?:$|[^a-z])/i, /现金/, /xianjin/],
    '银行卡': [/银行卡/, /信用卡/, /刷卡/, /yinhangka/]
  };

  for (const [method, patterns] of Object.entries(paymentPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(processedText)) {
        result.paymentMethod = method;
        break;
      }
    }
    if (result.paymentMethod) break;
  }

  // 标题（去掉金额和支付方式关键词后的内容）
  let title = processedText;
  if (amountMatch) title = title.replace(amountMatch[1], '');
  // 去掉支付方式关键词
  title = title.replace(/微信|wx|\bw\b|支付宝|zfb|\bz\b|花呗|hb|\bh\b|现金|银行卡|信用卡/, '');
  title = title.replace(/\s+/g, ' ').trim();
  result.title = title || result.category;
  result.notes = rawText; // 保留原始文本

  return result;
}

// 计算两个日期之间的天数差
function daysBetween(date1, date2) {
  const d1 = moment(date1);
  const d2 = moment(date2);
  return Math.abs(d2.diff(d1, 'days'));
}

// 获取最近N天的日期数组
function getRecentDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    days.push(moment().subtract(i, 'days').format('YYYY-MM-DD'));
  }
  return days;
}

// 判断是否在安静时段
function isQuietHours(quietHoursConfig) {
  const now = moment();
  const currentTime = now.format('HH:mm');
  const { start, end } = quietHoursConfig;

  // 如果开始时间大于结束时间（跨午夜）
  if (start > end) {
    return currentTime >= start || currentTime < end;
  }
  return currentTime >= start && currentTime < end;
}

module.exports = {
  generateId,
  todayStr,
  nowTimeStr,
  nowISO,
  successResponse,
  errorResponse,
  parseExpenseText,
  daysBetween,
  getRecentDays,
  isQuietHours
};
