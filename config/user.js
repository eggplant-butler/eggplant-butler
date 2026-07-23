// 用户个人配置
module.exports = {
  // 作息时间
  wakeUpTime: '06:10',
  leaveByTime: '07:50',
  workHours: '08:30-12:00,13:30-18:00',
  overtimeHours: '18:00-21:00',
  commuteMinutes: 30,
  lunchBreak: '12:00-13:30',

  // 宠物
  petName: '茄子',

  // 个人护理周期
  washHairCycleDays: 3,

  // 家务周期（天）
  laundryCycle: { busy: 2, normal: 1 },
  bedsheetCycle: { busy: 14, normal: 7 },
  mopCycle: { busy: 7, normal: 2 },
  fridgeCheckCycleDays: 3,

  // 生日（农历）
  lunarBirthday: '九月初八',

  // 生理周期
  periodCycleDays: 28,

  // 工作模式: sales, tutoring, interview, other
  currentWorkMode: 'sales',

  // 默认阅读时间
  defaultReadingTime: '21:00-21:30',

  // 每日饮水目标（毫升）
  dailyWaterGoal: 2000,
  hotWeatherWaterGoal: 2500,

  // 安静时段（不推送通知，天气预警除外）
  quietHours: { start: '22:00', end: '07:00' },

  // 访问密码
  accessPassword: process.env.ACCESS_PASSWORD || 'eggplant2026',

  // 新闻API Key（天行数据等）
  newsApiKey: process.env.NEWS_API_KEY || ''
};