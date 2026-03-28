import express from 'express';
import https from 'https';
import { XMLParser } from 'fast-xml-parser';

const app = express();
const parser = new XMLParser({ ignoreAttributes: false });

app.get('/krdict-proxy', async (req, res) => {
  const q = req.query.q;
  if (!q) {
    return res.status(400).json({ error: 'Missing q parameter' });
  }

  const apiKey = '09039EB86949159AD9DFFB98AD411BBD';
  const decoded = decodeURIComponent(q);
  const encoded = encodeURIComponent(decoded);
  const url = `https://krdict.korean.go.kr/api/search?key=${apiKey}&type_search=search&part=word&type=json&q=${encoded}`;

  const requestUrl = new URL(url);
  const options = {
    hostname: requestUrl.hostname,
    path: requestUrl.pathname + requestUrl.search,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/xml, text/xml, */*',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      'Connection': 'keep-alive'
    }
  };

  const request = https.get(options, (response) => {
    let data = '';
    response.on('data', chunk => { data += chunk; });
    response.on('end', () => {
      try {
        // Parse the XML response
        const parsed = parser.parse(data);
        // KRDict returns a <channel> element as the root
        if (parsed && parsed.channel) {
          // Send the channel object directly as JSON
          res.set('Content-Type', 'application/json');
          res.send(JSON.stringify(parsed.channel));
        } else {
          // Fallback: send raw XML
          res.json({ xml: data });
        }
      } catch (err) {
        console.error('XML parsing error:', err);
        res.status(500).json({ error: 'Failed to parse XML', details: err.message });
      }
    });
  });

  request.on('error', (err) => {
    console.error('Proxy error:', err.message, 'URL:', url);
    res.status(502).json({ error: 'Failed to fetch from KRDict', details: err.message });
  });

  request.end();
});

app.listen(3000, () => console.log('Proxy running on port 3000'));
