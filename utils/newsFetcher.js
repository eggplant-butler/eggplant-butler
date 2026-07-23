const axios = require('axios');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const { todayStr } = require('./helpers');

const DATA_DIR = path.join(__dirname, '..', 'data');

// 数据分类
const NEWS_CATEGORIES = ['行业趋势', '民生', '财经', '国际', '科技', '健康'];

// 获取模拟新闻
function getMockNews() {
  const today = todayStr();
  const time = moment().format('HH:mm');
  return [
    {
      id: 'mock-news-1',
      title: '2026年Q2数字经济报告发布：AI产业同比增长42%',
      summary: '国家统计局发布最新数字经济报告，显示2026年第二季度数字经济核心产业增加值同比增长42%，其中人工智能、大数据和云计算领域表现最为突出。',
      category: '行业趋势',
      source: '每日经济新闻',
      date: today,
      time,
      url: 'https://example.com/news/1'
    },
    {
      id: 'mock-news-2',
      title: '多地出台新政策支持灵活就业人员社保缴纳',
      summary: '北京、上海、广州等城市陆续出台灵活就业人员社保缴纳新政策，降低缴费门槛，扩大保障范围，预计惠及超过5000万灵活就业人员。',
      category: '民生',
      source: '人民日报',
      date: today,
      time,
      url: 'https://example.com/news/2'
    },
    {
      id: 'mock-news-3',
      title: '央行宣布下调存款准备金率0.5个百分点',
      summary: '中国人民银行决定自下月起下调金融机构存款准备金率0.5个百分点，释放长期资金约1.2万亿元，支持实体经济发展。',
      category: '财经',
      source: '财经网',
      date: today,
      time,
      url: 'https://example.com/news/3'
    },
    {
      id: 'mock-news-4',
      title: '国际能源署发布全球能源展望报告',
      summary: '国际能源署（IEA）最新报告指出，全球可再生能源装机容量预计在2027年将超过煤炭，成为全球最大电力来源。',
      category: '国际',
      source: '新华社',
      date: today,
      time,
      url: 'https://example.com/news/4'
    },
    {
      id: 'mock-news-5',
      title: '全球首款消费级脑机接口设备即将量产',
      summary: '国内科技公司NeuralX宣布，其研发的消费级脑机接口设备已通过FDA认证，预计年底量产，售价约2999元，可用于辅助学习与健康监测。',
      category: '科技',
      source: '36氪',
      date: today,
      time,
      url: 'https://example.com/news/5'
    },
    {
      id: 'mock-news-6',
      title: '研究发现：每日步行8000步可显著降低心血管疾病风险',
      summary: '国际医学期刊《柳叶刀》发表最新研究，对超过10万人进行追踪调查发现，每天步行8000步以上可使心血管疾病风险降低40%以上。',
      category: '健康',
      source: '健康时报',
      date: today,
      time,
      url: 'https://example.com/news/6'
    },
    {
      id: 'mock-news-7',
      title: '新能源汽车渗透率突破60%，充电桩建设加速',
      summary: '2026年上半年新能源汽车销量同比增长35%，市场渗透率首次突破60%，全国充电桩保有量已达800万个，同比增长45%。',
      category: '行业趋势',
      source: '第一财经',
      date: today,
      time,
      url: 'https://example.com/news/7'
    },
    {
      id: 'mock-news-8',
      title: '教育部：2026年高考报名人数再创新高',
      summary: '教育部发布数据显示，2026年全国高考报名人数达到1350万，较去年增加40万，各地采取措施保障考试公平公正。',
      category: '民生',
      source: '中国教育报',
      date: today,
      time,
      url: 'https://example.com/news/8'
    }
  ];
}

// 获取缓存文件路径
function getCacheFilePath(dateStr) {
  return path.join(DATA_DIR, `news_${dateStr}.json`);
}

// 从缓存读取
function readCache(dateStr) {
  const filePath = getCacheFilePath(dateStr);
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[新闻缓存] 读取缓存失败:', err.message);
  }
  return null;
}

// 写入缓存
function writeCache(dateStr, data) {
  const filePath = getCacheFilePath(dateStr);
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('[新闻缓存] 写入缓存失败:', err.message);
    return false;
  }
}

// 获取新闻简报字符串
function formatNewsBriefing(newsList) {
  const grouped = {};
  newsList.forEach(item => {
    const cat = item.category || '其他';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  });

  const parts = [];
  for (const [cat, items] of Object.entries(grouped)) {
    const titles = items.slice(0, 2).map(i => i.title).join('、');
    parts.push(`${cat}：${titles}`);
  }

  return `📰 今日速览 | ${parts.join(' | ')}`;
}

// 获取新闻（缓存优先）
async function fetchNews(newsApiKey) {
  const today = todayStr();

  // 尝试读取缓存
  const cached = readCache(today);
  if (cached && cached.length > 0) {
    console.log('[新闻模块] 使用缓存数据');
    return { news: cached, source: 'cache' };
  }

  // 有API Key则调用真实API
  if (newsApiKey) {
    try {
      // 尝试天行数据API
      const response = await axios.get('https://api.tianapi.com/topnews/index', {
        params: {
          key: newsApiKey,
          num: 30
        },
        timeout: 5000
      });

      if (response.data && response.data.code === 200) {
        const newsList = response.data.newslist.map((item, index) => ({
          id: `news-${today}-${index}`,
          title: item.title || item.mtitle || '',
          summary: (item.description || item.mtitle || '').substring(0, 200),
          category: mapCategory(item),
          source: item.source || '天行数据',
          date: today,
          time: item.ctime || moment().format('HH:mm'),
          url: item.url || ''
        }));

        // 写入缓存
        writeCache(today, newsList);
        return { news: newsList, source: 'api' };
      }
    } catch (apiErr) {
      console.error('[新闻模块] API调用失败:', apiErr.message);
    }
  }

  // 无API Key或API失败，使用模拟数据
  const mockNews = getMockNews();
  writeCache(today, mockNews);
  return { news: mockNews, source: 'mock' };
}

// 映射天行数据分类到本地分类
function mapCategory(item) {
  const catMap = {
    '0': '行业趋势',
    '1': '民生',
    '2': '财经',
    '3': '国际',
    '4': '科技',
    '5': '健康',
    '6': '娱乐',
    '7': '体育',
    '8': '教育',
    '9': '军事',
    '10': '农业'
  };

  if (item.classify) {
    return catMap[item.classify] || '行业趋势';
  }

  const title = (item.title || '') + (item.description || '');
  if (title.includes('科技') || title.includes('技术') || title.includes('AI') || title.includes('数字化')) return '科技';
  if (title.includes('经济') || title.includes('股市') || title.includes('基金') || title.includes('银行')) return '财经';
  if (title.includes('国际') || title.includes('美国') || title.includes('欧盟') || title.includes('全球')) return '国际';
  if (title.includes('健康') || title.includes('医疗') || title.includes('疾病') || title.includes('运动')) return '健康';
  if (title.includes('民生') || title.includes('社保') || title.includes('教育') || title.includes('就业')) return '民生';
  if (title.includes('行业') || title.includes('产业') || title.includes('市场') || title.includes('报告')) return '行业趋势';

  return '行业趋势';
}

module.exports = {
  fetchNews,
  formatNewsBriefing,
  NEWS_CATEGORIES,
  getMockNews
};