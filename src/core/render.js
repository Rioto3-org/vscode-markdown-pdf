'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const url = require('url');
const Mustache = require('mustache');
const markdownIt = require('markdown-it');
const puppeteer = require('puppeteer-core');
const grayMatter = require('gray-matter');
const cheerio = require('cheerio');
const hljs = require('highlight.js');

const repoRoot = path.resolve(__dirname, '..', '..');

function createDefaultOptions() {
  return {
    breaks: false,
    emoji: true,
    plantumlOpenMarker: '@startuml',
    plantumlCloseMarker: '@enduml',
    plantumlServer: 'http://www.plantuml.com/plantuml',
    markdownItInclude: {
      enable: true
    },
    includeDefaultStyles: true,
    markdownStyles: [],
    styles: [],
    stylesRelativePathFile: false,
    highlight: true,
    highlightStyle: '',
    mermaidScript: '',
    executablePath: '',
    pdf: {
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: false,
      headerTemplate: '',
      footerTemplate: '',
      scale: 1,
      landscape: false,
      pageRanges: '',
      width: '',
      height: '',
      margin: {
        top: '1.5cm',
        right: '1cm',
        bottom: '1cm',
        left: '1cm'
      }
    }
  };
}

function mergeOptions(options) {
  const defaults = createDefaultOptions();
  const merged = {
    ...defaults,
    ...options,
    markdownItInclude: {
      ...defaults.markdownItInclude,
      ...(options && options.markdownItInclude)
    },
    pdf: {
      ...defaults.pdf,
      ...(options && options.pdf),
      margin: {
        ...defaults.pdf.margin,
        ...(options && options.pdf && options.pdf.margin)
      }
    }
  };

  return merged;
}

function readFile(filename, encode = 'utf-8') {
  if (!filename) {
    return '';
  }

  if (filename.indexOf('file://') === 0) {
    if (process.platform === 'win32') {
      filename = filename.replace(/^file:\/\/\//, '').replace(/^file:\/\//, '');
    } else {
      filename = filename.replace(/^file:\/\//, '');
    }
  }

  if (!fs.existsSync(filename)) {
    return '';
  }

  return fs.readFileSync(filename, encode);
}

function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.ttf') {
    return 'font/ttf';
  }
  if (ext === '.otf') {
    return 'font/otf';
  }
  if (ext === '.woff') {
    return 'font/woff';
  }
  if (ext === '.woff2') {
    return 'font/woff2';
  }
  return 'application/octet-stream';
}

function inlineCssAssets(css, cssFilename) {
  return css.replace(/url\\((['"]?)([^'")]+)\\1\\)/g, (match, quote, assetPath) => {
    if (!assetPath || assetPath.startsWith('data:')) {
      return match;
    }

    const protocol = url.parse(assetPath).protocol;
    if (protocol && protocol !== 'file:') {
      return match;
    }

    const absolutePath = protocol === 'file:'
      ? url.fileURLToPath(assetPath)
      : path.resolve(path.dirname(cssFilename), assetPath);

    if (!fs.existsSync(absolutePath)) {
      return match;
    }

    const mimeType = getMimeType(absolutePath);
    const base64 = fs.readFileSync(absolutePath).toString('base64');
    return `url("data:${mimeType};base64,${base64}")`;
  });
}

function getFontDataUrl(fontFilename) {
  if (!fs.existsSync(fontFilename)) {
    return '';
  }

  const mimeType = getMimeType(fontFilename);
  const base64 = fs.readFileSync(fontFilename).toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

function makeCss(filename) {
  const css = readFile(filename);
  if (!css) {
    return '';
  }

  return `\n<style>\n${inlineCssAssets(css, filename)}\n</style>\n`;
}

function buildForcedFontStyle() {
  const sansRegularFont = getFontDataUrl(path.join(repoRoot, 'styles', 'Noto_Sans_JP', 'static', 'NotoSansJP-Regular.ttf'));
  const sansBoldFont = getFontDataUrl(path.join(repoRoot, 'styles', 'Noto_Sans_JP', 'static', 'NotoSansJP-Bold.ttf'));
  const serifRegularFont = getFontDataUrl(path.join(repoRoot, 'styles', 'Noto_Serif_JP', 'static', 'NotoSerifJP-Regular.ttf'));
  const serifBoldFont = getFontDataUrl(path.join(repoRoot, 'styles', 'Noto_Serif_JP', 'static', 'NotoSerifJP-Bold.ttf'));

  if (!sansRegularFont || !sansBoldFont || !serifRegularFont || !serifBoldFont) {
    return '';
  }

  return `\n<style>
@font-face {
  font-family: "Noto Sans JP";
  font-style: normal;
  font-weight: 400;
  src: url("${sansRegularFont}") format("truetype");
}

@font-face {
  font-family: "Noto Sans JP";
  font-style: normal;
  font-weight: 700;
  src: url("${sansBoldFont}") format("truetype");
}

@font-face {
  font-family: "Noto Serif JP";
  font-style: normal;
  font-weight: 400;
  src: url("${serifRegularFont}") format("truetype");
}

@font-face {
  font-family: "Noto Serif JP";
  font-style: normal;
  font-weight: 700;
  src: url("${serifBoldFont}") format("truetype");
}

html, body, p, li, blockquote, table, h1, h2, h3, h4, h5, h6 {
  font-family: "Noto Serif JP" !important;
}
</style>\n`;
}

function resolveFileUri(sourcePath, href, stylesRelativePathFile) {
  if (!href) {
    return href;
  }

  const hrefUri = url.parse(href);
  if (['http:', 'https:'].includes(hrefUri.protocol)) {
    return href;
  }

  if (href.indexOf('~') === 0) {
    return `file://${path.join(os.homedir(), href.slice(1))}`;
  }

  if (path.isAbsolute(href)) {
    return `file://${href}`;
  }

  const baseDir = stylesRelativePathFile ? path.dirname(sourcePath) : repoRoot;
  return `file://${path.join(baseDir, href)}`;
}

function convertImgPath(src, filename) {
  let href = decodeURIComponent(src);
  href = href.replace(/("|')/g, '').replace(/\\/g, '/').replace(/#/g, '%23');
  const protocol = url.parse(href).protocol;

  if (protocol === 'file:' && href.indexOf('file:///') !== 0) {
    return href.replace(/^file:\/\//, 'file:///');
  }

  if (protocol === 'file:') {
    return href;
  }

  if (!protocol || path.isAbsolute(href)) {
    href = path.resolve(path.dirname(filename), href).replace(/\\/g, '/').replace(/#/g, '%23');
    if (href.indexOf('//') === 0) {
      return 'file:' + href;
    }
    if (href.indexOf('/') === 0) {
      return 'file://' + href;
    }
    return 'file:///' + href;
  }

  return src;
}

function convertImagePathToDataUrl(src, sourcePath) {
  try {
    let href = decodeURIComponent(src).replace(/("|')/g, '');
    const protocol = url.parse(href).protocol;
    let resolvedPath = href;

    if (!protocol || path.isAbsolute(href)) {
      resolvedPath = path.resolve(path.dirname(sourcePath), href);
    } else if (protocol === 'file:') {
      resolvedPath = href;
    } else {
      return '';
    }

    const imageData = readFile(resolvedPath, null);
    if (!imageData) {
      return '';
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    let mimeType = 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') {
      mimeType = 'image/jpeg';
    } else if (ext === '.svg') {
      mimeType = 'image/svg+xml';
    } else if (ext === '.gif') {
      mimeType = 'image/gif';
    } else if (ext === '.webp') {
      mimeType = 'image/webp';
    }

    return `data:${mimeType};base64,${imageData.toString('base64')}`;
  } catch (_error) {
    return '';
  }
}

function mergeFrontMatterData(parsedData, inputData) {
  return {
    ...parsedData,
    ...(inputData || {}),
    header: {
      ...(parsedData && parsedData.header),
      ...(inputData && inputData.header)
    },
    footer: {
      ...(parsedData && parsedData.footer),
      ...(inputData && inputData.footer)
    }
  };
}

function slug(string) {
  return encodeURI(
    string
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[\]\[\!\'\#\$\%\&\(\)\*\+\,\.\/\:\;\<\=\>\?\@\\\^\_\{\|\}\~\`。，、；：？！…—·ˉ¨‘’“”々～‖∶＂＇｀｜〃〔〕〈〉《》「」『』．〖〗【】（）［］｛｝]/g, '')
      .replace(/^\-+/, '')
      .replace(/\-+$/, '')
  );
}

function setBooleanValue(a, b) {
  return typeof a === 'boolean' ? a : b;
}

function readStyles(sourcePath, options) {
  let style = '';

  if (options.includeDefaultStyles) {
    style += makeCss(path.join(repoRoot, 'styles', 'markdown.css'));
  }

  if (options.includeDefaultStyles && Array.isArray(options.markdownStyles)) {
    options.markdownStyles.forEach((href) => {
      style += `<link rel="stylesheet" href="${resolveFileUri(sourcePath, href, options.stylesRelativePathFile)}" type="text/css">`;
    });
  }

  if (options.highlight) {
    if (options.highlightStyle) {
      style += makeCss(path.join(repoRoot, 'node_modules', 'highlight.js', 'styles', options.highlightStyle));
    } else {
      style += makeCss(path.join(repoRoot, 'styles', 'tomorrow.css'));
    }
  }

  if (options.includeDefaultStyles) {
    style += makeCss(path.join(repoRoot, 'styles', 'markdown-pdf.css'));
  }

  if (Array.isArray(options.styles)) {
    options.styles.forEach((href) => {
      style += `<link rel="stylesheet" href="${resolveFileUri(sourcePath, href, options.stylesRelativePathFile)}" type="text/css">`;
    });
  }

  style += buildForcedFontStyle();

  return style;
}

function convertMarkdownToHtml(sourcePath, markdown, type, options, inputFrontMatter) {
  const matterParts = grayMatter(markdown);
  matterParts.data = mergeFrontMatterData(matterParts.data, inputFrontMatter);
  const breaks = setBooleanValue(matterParts.data.breaks, options.breaks);
  const md = markdownIt({
    html: true,
    breaks,
    highlight: function (str, lang) {
      if (lang && lang.match(/\bmermaid\b/i)) {
        return `<div class="mermaid">${str}</div>`;
      }

      if (lang && hljs.getLanguage(lang)) {
        try {
          str = hljs.highlight(lang, str, true).value;
        } catch (_error) {
          str = md.utils.escapeHtml(str);
        }
      } else {
        str = md.utils.escapeHtml(str);
      }

      return '<pre class="hljs"><code><div>' + str + '</div></code></pre>';
    }
  });

  const defaultRender = md.renderer.rules.image;
  md.renderer.rules.image = function (tokens, idx, opts, env, self) {
    const token = tokens[idx];
    let href = token.attrs[token.attrIndex('src')][1];
    href = type === 'html' ? decodeURIComponent(href).replace(/("|')/g, '') : convertImgPath(href, sourcePath);
    token.attrs[token.attrIndex('src')][1] = href;
    return defaultRender(tokens, idx, opts, env, self);
  };

  if (type !== 'html') {
    md.renderer.rules.html_block = function (tokens, idx) {
      const html = tokens[idx].content;
      const $ = cheerio.load(html);
      $('img').each(function () {
        const src = $(this).attr('src');
        $(this).attr('src', convertImgPath(src, sourcePath));
      });
      return $.html();
    };
  }

  md.use(require('markdown-it-checkbox'));

  if (setBooleanValue(matterParts.data.emoji, options.emoji)) {
    const emojiDefs = require(path.join(repoRoot, 'data', 'emoji.json'));
    md.use(require('markdown-it-emoji'), { defs: emojiDefs });
    md.renderer.rules.emoji = function (token, idx) {
      const emoji = token[idx].markup;
      const emojiPath = path.join(repoRoot, 'node_modules', 'emoji-images', 'pngs', `${emoji}.png`);
      const emojiData = readFile(emojiPath, null).toString('base64');
      return emojiData ? `<img class="emoji" alt="${emoji}" src="data:image/png;base64,${emojiData}" />` : `:${emoji}:`;
    };
  }

  md.use(require('markdown-it-named-headers'), { slugify: slug });

  md.use(require('markdown-it-container'), '', {
    validate: function (name) {
      return name.trim().length;
    },
    render: function (tokens, idx) {
      return tokens[idx].info.trim() !== '' ? `<div class="${tokens[idx].info.trim()}">\n` : '</div>\n';
    }
  });

  md.use(require('markdown-it-plantuml'), {
    openMarker: matterParts.data.plantumlOpenMarker || options.plantumlOpenMarker,
    closeMarker: matterParts.data.plantumlCloseMarker || options.plantumlCloseMarker,
    server: options.plantumlServer
  });

  if (options.markdownItInclude.enable) {
    md.use(require('markdown-it-include'), {
      root: path.dirname(sourcePath),
      includeRe: /:\[.+\]\((.+\..+)\)/i
    });
  }

  return {
    frontMatter: matterParts,
    html: md.render(matterParts.content)
  };
}

function buildMermaidScriptTag(options) {
  const mermaidScript = options.mermaidScript || getDefaultMermaidScript();
  if (!mermaidScript) {
    return '';
  }

  if (mermaidScript.startsWith('file://')) {
    const scriptContent = readFile(mermaidScript);
    return scriptContent ? `<script>\n${scriptContent}\n</script>` : '';
  }

  return `<script src="${mermaidScript}"></script>`;
}

function makeHtml(content, sourcePath, options, frontMatter) {
  const template = readFile(path.join(repoRoot, 'template', 'template.html'));
  const title = typeof frontMatter.data.title === 'string' && frontMatter.data.title.trim()
    ? frontMatter.data.title.trim()
    : path.basename(sourcePath);
  return Mustache.render(template, {
    title,
    style: readStyles(sourcePath, options),
    content,
    mermaid: buildMermaidScriptTag(options)
  });
}

function getDefaultMermaidScript() {
  const localMermaidPath = path.join(repoRoot, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');
  if (fs.existsSync(localMermaidPath)) {
    return `file://${localMermaidPath}`;
  }
  return '';
}

async function renderMermaidDiagrams(page) {
  const status = await page.evaluate(() => {
    return {
      hasMermaidGlobal: typeof mermaid !== 'undefined',
      mermaidNodeCount: document.querySelectorAll('.mermaid').length
    };
  });
  console.log('[api:mermaid:status]', status);

  const hasMermaid = await page.evaluate(() => {
    return typeof mermaid !== 'undefined' && document.querySelector('.mermaid');
  });

  if (!hasMermaid) {
    return;
  }

  await page.evaluate(async () => {
    if (typeof mermaid === 'undefined') {
      return;
    }

    const nodes = Array.from(document.querySelectorAll('.mermaid'));
    if (nodes.length === 0) {
      return;
    }

    await mermaid.run({
      nodes,
      suppressErrors: false
    });
  });

  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('.mermaid')).every((node) => {
      return !!node.querySelector('svg');
    }),
    { timeout: 15000 }
  );
}

function buildFrontMatterHeaderTemplate(frontMatter) {
  if (frontMatter && frontMatter.data && frontMatter.data.header && frontMatter.data.header.pageNumber === true) {
    return `<div style="width: 100%; padding: 0 1cm; font-size: 9px; text-align: right;"><span class='pageNumber'></span> / <span class='totalPages'></span></div>`;
  }

  return '<div></div>';
}

function buildFrontMatterFooterTemplate(frontMatter, sourcePath) {
  if (!frontMatter || !frontMatter.data || !frontMatter.data.footer || !frontMatter.data.footer.logo) {
    return '<div></div>';
  }

  const rawLogo = frontMatter.data.footer.logo;
  const logoHref = rawLogo.startsWith('data:') || rawLogo.startsWith('http://') || rawLogo.startsWith('https://')
    ? rawLogo
    : '';
  if (!logoHref) {
    return '<div></div>';
  }

  return `<div style="width: 100%; padding: 4px 1cm 0; font-size: 9px;"><div style="height: 14px; text-align: center;"><img src="${logoHref}" style="display: inline-block; max-height: 100%; width: auto; vertical-align: top;" /></div></div>`;
}

function applyFrontMatterToOptions(options, frontMatter, sourcePath) {
  const nextOptions = mergeOptions(options);
  const hasHeader = !!(frontMatter && frontMatter.data && frontMatter.data.header);
  const hasFooter = !!(frontMatter && frontMatter.data && frontMatter.data.footer);

  if (!hasHeader && !hasFooter) {
    return nextOptions;
  }

  nextOptions.pdf.headerTemplate = '<div></div>';
  nextOptions.pdf.footerTemplate = '<div></div>';

  if (hasHeader && frontMatter.data.header.pageNumber === true) {
    nextOptions.pdf.displayHeaderFooter = true;
    nextOptions.pdf.headerTemplate = buildFrontMatterHeaderTemplate(frontMatter);
  }

  if (hasFooter && frontMatter.data.footer.logo) {
    nextOptions.pdf.displayHeaderFooter = true;
    nextOptions.pdf.footerTemplate = buildFrontMatterFooterTemplate(frontMatter, sourcePath);
    nextOptions.pdf.margin = Object.assign({}, nextOptions.pdf.margin, {
      bottom: '24mm'
    });
  }

  return nextOptions;
}

function getExecutablePath(options) {
  const defaultChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const executablePathFromEnv = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN || '';

  if (options.executablePath) {
    return options.executablePath;
  }

  if (executablePathFromEnv) {
    return executablePathFromEnv;
  }

  if (fs.existsSync(defaultChromePath)) {
    return defaultChromePath;
  }

  if (typeof puppeteer.executablePath === 'function') {
    return puppeteer.executablePath();
  }

  return defaultChromePath;
}

async function renderPdf({ markdown, sourcePath, options = {}, frontMatter = null }) {
  const baseOptions = mergeOptions(options);
  const rendered = convertMarkdownToHtml(sourcePath, markdown, 'pdf', baseOptions, frontMatter);
  const resolvedOptions = applyFrontMatterToOptions(baseOptions, rendered.frontMatter, sourcePath);
  const documentHtml = makeHtml(rendered.html, sourcePath, resolvedOptions, rendered.frontMatter);

  const browser = await puppeteer.launch({
    executablePath: getExecutablePath(resolvedOptions),
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    page.on('console', (message) => {
      console.log('[api:page:console]', message.type(), message.text());
    });
    page.on('pageerror', (error) => {
      console.error('[api:page:error]', error && error.stack ? error.stack : error);
    });
    await page.setContent(documentHtml, { waitUntil: 'load' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    await renderMermaidDiagrams(page);

    return await page.pdf({
      format: resolvedOptions.pdf.format,
      printBackground: resolvedOptions.pdf.printBackground,
      displayHeaderFooter: resolvedOptions.pdf.displayHeaderFooter,
      headerTemplate: resolvedOptions.pdf.headerTemplate,
      footerTemplate: resolvedOptions.pdf.footerTemplate,
      scale: resolvedOptions.pdf.scale,
      landscape: resolvedOptions.pdf.landscape,
      pageRanges: resolvedOptions.pdf.pageRanges,
      width: resolvedOptions.pdf.width,
      height: resolvedOptions.pdf.height,
      margin: resolvedOptions.pdf.margin
    });
  } finally {
    await browser.close();
  }
}

module.exports = {
  createDefaultOptions,
  renderPdf
};
