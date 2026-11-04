const FONT_TIMEOUT_MS = 4000;
const IMAGE_TIMEOUT_MS = 20000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => { setTimeout(() => reject(new Error('timeout')), ms); }),
  ]);
}

function dataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// An exported image can only use fonts embedded in it. Left to itself
// html-to-image fetches all fifteen Google subsets and stalls, so this embeds
// just the upright Latin faces, which cover English, Portuguese and Spanish.
async function latinFontCss() {
  const sheet = [...document.styleSheets].find(item => item.href?.includes('fonts.googleapis.com'));
  if (!sheet) return '';
  const faces = [...sheet.cssRules].filter(rule => rule.type === CSSRule.FONT_FACE_RULE
    && rule.style.getPropertyValue('font-style') === 'normal'
    && /U\+0+-FF\b/i.test(rule.style.getPropertyValue('unicode-range')));
  const urls = [...new Set(faces.map(rule => rule.cssText.match(/url\("?([^")]+)"?\)/)?.[1]).filter(Boolean))];
  const inlined = new Map(await Promise.all(urls.map(async url => {
    const response = await fetch(url);
    return [url, await dataUrl(await response.blob())];
  })));
  return faces
    .map(rule => rule.cssText.replace(/url\("?([^")]+)"?\)/, (match, url) => `url("${inlined.get(url)}")`))
    .join('\n');
}

let fontCss = null;

function embeddedFonts() {
  fontCss ??= withTimeout(latinFontCss(), FONT_TIMEOUT_MS).catch(() => {
    fontCss = null;
    return '';
  });
  return fontCss;
}

// Turns a rendered node into a PNG and hands it to the share sheet, or
// downloads it where sharing files is not supported. Loaded on demand because
// most sessions never share anything. A missing font falls back to the system
// face rather than costing the player their image.
export async function shareNode(node, { fileName, url }) {
  const { toBlob } = await import('html-to-image');
  const css = await embeddedFonts();
  const blob = await withTimeout(
    toBlob(node, { pixelRatio: 2, ...(css ? { fontEmbedCSS: css } : { skipFonts: true }) }),
    IMAGE_TIMEOUT_MS,
  );
  if (!blob) return false;
  const file = new File([blob], fileName, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], url });
    } catch { /* share sheet dismissed */ }
    return true;
  }
  const href = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href, download: fileName }).click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
  return true;
}
