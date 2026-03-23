'use strict';

const fs = require('fs');
const path = require('path');
const Mustache = require('mustache');
const markdownIt = require('markdown-it');
const puppeteer = require('puppeteer-core');

const repoRoot = path.resolve(__dirname, '..', '..');
const readmePath = path.join(repoRoot, 'README.md');
const templatePath = path.join(repoRoot, 'template', 'template.html');
const markdownPdfCssPath = path.join(repoRoot, 'styles', 'markdown-pdf.css');

function readUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function buildHtml() {
  const markdown = readUtf8(readmePath);
  const template = readUtf8(templatePath);
  const markdownPdfCss = readUtf8(markdownPdfCssPath);
  const md = markdownIt({ html: true, breaks: false });

  const style = `\n<style>\n${markdownPdfCss}\n</style>\n`;

  return Mustache.render(template, {
    title: 'README.md',
    style,
    mermaid: '',
    content: md.render(markdown)
  });
}

function getExecutablePath() {
  const defaultChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  if (fs.existsSync(defaultChromePath)) {
    return defaultChromePath;
  }

  if (typeof puppeteer.executablePath === 'function') {
    return puppeteer.executablePath();
  }

  return defaultChromePath;
}

async function renderReadmePdf() {
  const browser = await puppeteer.launch({
    executablePath: getExecutablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setContent(buildHtml(), {
      waitUntil: 'networkidle0'
    });

    return await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: false,
      margin: {
        top: '1.5cm',
        right: '1cm',
        bottom: '1cm',
        left: '1cm'
      }
    });
  } finally {
    await browser.close();
  }
}

module.exports = {
  renderReadmePdf
};
