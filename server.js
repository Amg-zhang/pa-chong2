const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/crawl', async (req, res) => {
  try {
    const { url, depth, maxPages, extractContent, followNavigation } = req.body;
    
    // 获取网页内容
    const response = await axios.get(url);
    const html = response.data;
    
    // 解析内容
    const $ = cheerio.load(html);
    const title = $('title').text();
    const links = [];
    
    $('a').each((i, link) => {
      const href = $(link).attr('href');
      if (href && !href.startsWith('#')) {
        try {
          // 处理相对路径
          const fullUrl = new URL(href, url).href;
          links.push(fullUrl);
        } catch (e) {
          // 忽略无效URL
        }
      }
    });
    
    // 提取内容
    let parsedContent = null;
    if (extractContent) {
      parsedContent = {
        title,
        text: $('body').text().replace(/\\s+/g, ' ').trim(),
        images: $('img').map((i, img) => $(img).attr('src')).get(),
        metadata: {}
      };
      
      // 提取meta标签
      $('meta').each((i, meta) => {
        const name = $(meta).attr('name');
        const content = $(meta).attr('content');
        if (name && content) {
          parsedContent.metadata[name] = content;
        }
      });
    }
    
    // 处理子页面爬取
    let childResults = [];
    if (followNavigation && depth > 1 && links.length > 0) {
      // 选择前3个链接进行递归爬取
      const childLinks = links.slice(0, 3);
      
      // 简单递归爬取
      childResults = await Promise.all(
        childLinks.map(async (link) => {
          try {
            const childResponse = await axios.get(link);
            const childHtml = childResponse.data;
            const child$ = cheerio.load(childHtml);
            
            return {
              url: link,
              content: childHtml,
              parsedContent: extractContent ? {
                title: child$('title').text(),
                text: child$('body').text().replace(/\\s+/g, ' ').trim().substring(0, 1000),
                images: child$('img').map((i, img) => child$(img).attr('src')).get().slice(0, 5),
                metadata: {}
              } : undefined,
              links: [],
              status: 200,
              timestamp: new Date()
            };
          } catch (err) {
            return {
              url: link,
              content: `<html><body>爬取失败</body></html>`,
              links: [],
              status: 500,
              timestamp: new Date()
            };
          }
        })
      );
    }
    
    res.json({
      url,
      content: html,
      parsedContent,
      links,
      childResults,
      status: 200,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('爬取失败:', error);
    res.status(500).json({ error: '爬取失败', message: error.message });
  }
});

app.get('/', (req, res) => {
  res.send('爬虫服务正在运行');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`爬虫服务运行在端口 ${PORT}`);
});
