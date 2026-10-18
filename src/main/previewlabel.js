// Makes Higgsfield's "Preview · 480p" label (shown on low-resolution previews of a
// result) impossible to miss: bright red with a black outline, a little larger.
// The label is found by its text rather than by the site's class names, which change
// with every release; a page script marks it and an inserted stylesheet styles it.
const { isSite } = require('../shared/actions');

const CLASS = 'hf-preview-label';

const CSS = `
.${CLASS}, .${CLASS} * {
  color: #ff1f1f !important;
  font-weight: 600 !important;
  -webkit-text-stroke: 2px #000 !important;
  paint-order: stroke fill !important;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.8) !important;
}
.${CLASS} {
  transform: scale(1.3);
  transform-origin: left center;
}
.${CLASS} svg {
  stroke: #000 !important;
  stroke-width: 2px;
  fill: #ff1f1f !important;
  paint-order: stroke fill;
}
`;

// Runs in the page: marks the element holding the label (its icon included), now and
// whenever the page adds or changes content.
const SCRIPT = `(() => {
  if (window.__hfPreviewLabel) return;
  window.__hfPreviewLabel = true;
  const LABEL = /^\\s*Preview\\s*[·•]\\s*\\d{3,4}p\\s*$/i;
  const markFrom = text => {
    let el = text.parentElement;
    while (el && el !== document.body) {
      const t = el.textContent;
      if (t.length > 40) return;
      if (LABEL.test(t)) {
        // Take in the icon beside the text: the outermost element with the same text,
        // stopping short of anything with controls (the card's select checkbox sits
        // next to the label) or media (the card itself).
        for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) {
          if (up.textContent.trim() !== t.trim() || up.getBoundingClientRect().height > 40
            || up.querySelector('img, video, canvas, button, input, a, [role="button"]')) break;
          el = up;
        }
        el.classList.add('${CLASS}');
        return;
      }
      el = el.parentElement;
    }
  };
  const scan = root => {
    if (root.nodeType === 3) return /Preview|\\dp/.test(root.nodeValue) && markFrom(root);
    if (root.nodeType !== 1) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (/Preview|\\dp/.test(n.nodeValue)) markFrom(n);
  };
  scan(document.body);
  new MutationObserver(records => {
    for (const r of records) {
      if (r.type === 'characterData') scan(r.target);
      else r.addedNodes.forEach(scan);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
})()`;

// Called for every tab's webContents.
function watch(contents) {
  contents.on('dom-ready', () => {
    if (!isSite(contents.getURL())) return;
    contents.insertCSS(CSS).catch(() => {});
    contents.executeJavaScript(SCRIPT).catch(() => {});
  });
}

module.exports = { watch };
