'use strict';

const http = require('http');
const { Hono } = require('hono');

const app = new Hono();
const host = process.env.HOST || '127.0.0.1';

app.get('/', (c) => {
  return c.text('Hello World');
});

const port = Number(process.env.PORT || 3000);

const server = http.createServer(async (req, res) => {
  const origin = `http://${req.headers.host || `localhost:${port}`}`;
  const url = new URL(req.url || '/', origin);
  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req,
    duplex: 'half'
  });

  try {
    const response = await app.fetch(request);

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    if (!response.body) {
      res.end();
      return;
    }

    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      res.write(Buffer.from(value));
    }

    res.end();
  } catch (error) {
    console.error('[api] request failed', error);
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
});

server.listen(port, host, () => {
  console.log(`[api] listening on http://${host}:${port}`);
});
