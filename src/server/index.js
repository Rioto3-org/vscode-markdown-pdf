'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { Hono } = require('hono');
const { createDefaultOptions, renderPdf } = require('../core/render');

const app = new Hono();
const host = process.env.HOST || '0.0.0.0';
const repoRoot = path.resolve(__dirname, '..', '..');
const readmePath = path.join(repoRoot, 'README.md');
const defaultOptions = createDefaultOptions();

app.get('/', async (c) => {
  const markdown = fs.readFileSync(readmePath, 'utf8');
  const pdf = await renderPdf({
    markdown,
    sourcePath: readmePath,
    options: defaultOptions
  });

  c.header('Content-Type', 'application/pdf');
  c.header('Content-Disposition', 'inline; filename="README.pdf"');
  return c.body(pdf);
});

app.post('/render/pdf', async (c) => {
  const body = await c.req.json().catch(() => null);
  const markdown = body && typeof body.markdown === 'string' ? body.markdown : '';
  const frontMatter = body && body.frontMatter && typeof body.frontMatter === 'object' ? body.frontMatter : null;

  if (!markdown.trim()) {
    return c.json({ error: 'markdown is required' }, 400);
  }

  const pdf = await renderPdf({
    markdown,
    sourcePath: path.join(repoRoot, 'document.md'),
    options: defaultOptions,
    frontMatter
  });
  c.header('Content-Type', 'application/pdf');
  c.header('Content-Disposition', 'inline; filename="document.pdf"');
  return c.body(pdf);
});

const port = Number(process.env.PORT || 13720);

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
