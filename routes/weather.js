const express = require('express');
const router = express.Router();
const axios = require('axios');
const schedule = require('node-schedule');
const { successResponse, errorResponse, todayStr } = require('../utils/helpers');
const { sendNotification, addTaskReminder } = require('../utils/notifier');

// 模拟天气数据
function getMockWeather() {
  return {
    city: '本地',
    date: todayStr(),
    temp: '28',
    tempMax: '32',
    tempMin: '24',
    weather: '多云',
    humidity: '65',
    wind: '东南风 3级',
    rainProbability: 30,
    feelsLike: '30',
    uv: '中等',
    mock: true
  };
}

// 获取当天天气
router.get('/today', async (req, res) => {
  try {
    const apiKey = process.env.WEATHER_API_KEY;

    if (!apiKey) {
      // 无API Key，返回模拟数据
      return res.json(successResponse(getMockWeather(), '返回模拟天气数据'));
    }

    // 调用和风天气API（简化版，实际需要城市ID）
    // 这里使用实时天气接口作为示例
    try {
      const response = await axios.get('https://devapi.qweather.com/v7/weather/now', {
        params: {
          location: 'auto_ip',
          key: apiKey
        }
      });

      if (response.data.code === '200') {
        const now = response.data.now;
        const weatherData = {
          city: response.data.fxLink ? '当前城市' : '本地',
          date: todayStr(),
          temp: now.temp,
          weather: now.text,
          humidity: now.humidity,
          wind: `${now.windDir} ${now.windScale}级`,
          feelsLike: now.feelsLike,
          rainProbability: now.text.includes('雨') ? 80 : 20,
          mock: false
        };
        return res.json(successResponse(weatherData));
      }
    } catch (apiErr) {
      console.error('天气API调用失败:', apiErr.message);
    }

    // API调用失败，返回模拟数据
    return res.json(successResponse(getMockWeather(), '天气API调用失败，返回模拟数据'));

  } catch (err) {
    return res.json(errorResponse('获取天气失败: ' + err.message));
  }
});

// 初始化天气定时任务（每天07:30检查降雨）
function initWeatherScheduler() {
  // 每天 07:30 执行
  schedule.scheduleJob('30 7 * * *', async () => {
    console.log('[天气定时任务] 检查今日降雨情况...');

    const apiKey = process.env.WEATHER_API_KEY;
    let weatherData;

    if (apiKey) {
      try {
        const response = await axios.get('https://devapi.qweather.com/v7/weather/now', {
          params: { location: 'auto_ip', key: apiKey }
        });
        if (response.data.code === '200') {
          weatherData = {
            weather: response.data.now.text,
            rainProbability: response.data.now.text.includes('雨') ? 80 : 20
          };
        }
      } catch (e) {
        console.error('天气定时任务API调用失败:', e.message);
      }
    }

    if (!weatherData) {
      weatherData = getMockWeather();
    }

    // 如果降雨概率>70%或包含"雨"，添加带伞提醒
    const isRainy = weatherData.rainProbability > 70 ||
      (weatherData.weather && weatherData.weather.includes('雨'));

    if (isRainy) {
      const today = todayStr();
      await addTaskReminder(
        '今天有雨，出门带伞',
        `${today} 07:40`,
        { category: '天气提醒', priority: 'high', tags: ['天气', '雨伞'] }
      );
      await sendNotification(
        '🌧️ 今日有雨提醒',
        `今天天气：${weatherData.weather}，降雨概率约${weatherData.rainProbability}%，出门记得带伞！`,
        { force: true }
      );
      console.log('[天气定时任务] 已添加带伞提醒');
    } else {
      console.log('[天气定时任务] 今日无雨，无需提醒');
    }
  });

  console.log('[天气模块] 定时任务已初始化（每日07:30）');
}

module.exports = { router, initWeatherScheduler };
