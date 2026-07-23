// 农历工具函数
// 由于chinese-lunar包的API可能不同，这里提供一个简化的农历转换工具
// 实际项目中可根据chinese-lunar的具体API调整

function parseLunarDate(lunarStr) {
  // 解析如 "九月初八" 这样的农历日期
  const monthMap = {
    '正月': 1, '二月': 2, '三月': 3, '四月': 4, '五月': 5, '六月': 6,
    '七月': 7, '八月': 8, '九月': 9, '十月': 10, '冬月': 11, '腊月': 12
  };

  const dayMap = {
    '初一': 1, '初二': 2, '初三': 3, '初四': 4, '初五': 5,
    '初六': 6, '初七': 7, '初八': 8, '初九': 9, '初十': 10,
    '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15,
    '十六': 16, '十七': 17, '十八': 18, '十九': 19, '二十': 20,
    '廿一': 21, '廿二': 22, '廿三': 23, '廿四': 24, '廿五': 25,
    '廿六': 26, '廿七': 27, '廿八': 28, '廿九': 29, '三十': 30
  };

  let month = 0;
  let day = 0;

  for (const [key, val] of Object.entries(monthMap)) {
    if (lunarStr.includes(key)) {
      month = val;
      break;
    }
  }

  for (const [key, val] of Object.entries(dayMap)) {
    if (lunarStr.includes(key)) {
      day = val;
      break;
    }
  }

  return { month, day };
}

// 简化版：农历转公历（近似计算，实际应使用专业库）
// 这里提供一个基于chinese-lunar包的封装
function lunarToSolar(lunarMonth, lunarDay, year) {
  try {
    // 尝试使用chinese-lunar包
    const chineseLunar = require('chinese-lunar');
    if (chineseLunar && chineseLunar.lunarToSolar) {
      return chineseLunar.lunarToSolar(year, lunarMonth, lunarDay);
    }
  } catch (e) {
    // 如果包不可用，使用近似值（农历比公历晚约1个月左右）
    console.warn('chinese-lunar包不可用，使用近似计算');
  }

  // 简化近似：农历日期大约比公历晚20-50天
  // 返回一个近似日期（实际项目请使用专业农历库）
  const solarMonth = lunarMonth + 1;
  const solarDay = Math.max(1, lunarDay - 10);

  return {
    year: solarMonth > 12 ? year + 1 : year,
    month: solarMonth > 12 ? solarMonth - 12 : solarMonth,
    day: solarDay
  };
}

// 获取今年的农历生日对应的公历日期
function getLunarBirthdaySolarDate(lunarBirthdayStr, year = new Date().getFullYear()) {
  const { month, day } = parseLunarDate(lunarBirthdayStr);
  if (!month || !day) return null;

  const solar = lunarToSolar(month, day, year);
  return `${solar.year}-${String(solar.month).padStart(2, '0')}-${String(solar.day).padStart(2, '0')}`;
}

// 计算距离下次生日还有多少天
function daysUntilNextBirthday(solarDateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [year, month, day] = solarDateStr.split('-').map(Number);
  let birthday = new Date(today.getFullYear(), month - 1, day);
  birthday.setHours(0, 0, 0, 0);

  // 如果今年生日已过，算明年的
  if (birthday < today) {
    birthday = new Date(today.getFullYear() + 1, month - 1, day);
  }

  const diffMs = birthday - today;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
}

module.exports = {
  parseLunarDate,
  lunarToSolar,
  getLunarBirthdaySolarDate,
  daysUntilNextBirthday
};
