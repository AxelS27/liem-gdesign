// Liem gDesign Chrome Extension Popup Script

let activeTabUrl = '';
let activeTabDomain = '';
let generatedDesignMd = '';
let generatedSkillMd = '';
let currentTab = 'design'; // 'design' or 'skill'

// RGB to OKLCH conversion helpers
function rgbToOklch(r, g, b) {
  let r_ = r / 255;
  let g_ = g / 255;
  let b_ = b / 255;

  r_ = r_ > 0.04045 ? Math.pow((r_ + 0.055) / 1.055, 2.4) : r_ / 12.92;
  g_ = g_ > 0.04045 ? Math.pow((g_ + 0.055) / 1.055, 2.4) : g_ / 12.92;
  b_ = b_ > 0.04045 ? Math.pow((b_ + 0.055) / 1.055, 2.4) : b_ / 12.92;

  let l = 0.4122214708 * r_ + 0.5363113620 * g_ + 0.0514459929 * b_;
  let m = 0.2119034982 * r_ + 0.6806995451 * g_ + 0.1073969566 * b_;
  let s = 0.0883024619 * r_ + 0.2817188376 * g_ + 0.6299787005 * b_;

  let l_ = Math.cbrt(l);
  let m_ = Math.cbrt(m);
  let s_ = Math.cbrt(s);

  let L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  let a_coord = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  let b_coord = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;

  let C = Math.sqrt(a_coord * a_coord + b_coord * b_coord);
  let H = Math.atan2(b_coord, a_coord) * (180 / Math.PI);
  if (H < 0) H += 360;

  let L_pct = Math.round(L * 100);
  let C_val = parseFloat(C.toFixed(3));
  let H_val = parseFloat(H.toFixed(2));

  return `oklch(${L_pct}% ${C_val} ${H_val})`;
}

function parseColorToOklch(colorStr) {
  if (!colorStr) return '';
  if (colorStr.startsWith('oklch')) return colorStr;
  if (colorStr === 'transparent' || colorStr === 'rgba(0, 0, 0, 0)') return 'transparent';
  
  const rgbMatch = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    const a = rgbMatch[4] ? parseFloat(rgbMatch[4]) : 1;
    
    if (r === 0 && g === 0 && b === 0 && a === 0) return 'transparent';
    
    const oklchBase = rgbToOklch(r, g, b);
    if (a < 1) {
      return oklchBase.replace(')', ` / ${a})`);
    }
    return oklchBase;
  }
  
  if (colorStr.startsWith('#')) {
    let hex = colorStr.substring(1);
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return rgbToOklch(r, g, b);
  }
  
  return colorStr;
}

// Extractor function executed in active tab context
function pageExtractorScript() {
  const data = {
    title: document.title || '',
    description: '',
    domain: window.location.hostname || '',
    url: window.location.href || '',
    cssVariables: {},
    computedStyles: {},
    structure: {},
    techStack: {}
  };

  const descMeta = document.querySelector('meta[name="description"]') || 
                   document.querySelector('meta[property="og:description"]');
  if (descMeta) {
    data.description = descMeta.getAttribute('content') || '';
  }

  function getElementStyles(selector, defaultTagName = 'div') {
    let el = document.querySelector(selector);
    let created = false;
    if (!el) {
      el = document.createElement(defaultTagName);
      document.body.appendChild(el);
      created = true;
    }
    const computed = window.getComputedStyle(el);
    const styles = {
      backgroundColor: computed.backgroundColor,
      color: computed.color,
      borderColor: computed.borderColor,
      borderRadius: computed.borderRadius,
      padding: computed.padding,
      fontFamily: computed.fontFamily,
      fontSize: computed.fontSize,
      fontWeight: computed.fontWeight,
      lineHeight: computed.lineHeight,
      letterSpacing: computed.letterSpacing
    };
    if (created) {
      document.body.removeChild(el);
    }
    return styles;
  }

  data.computedStyles.body = getElementStyles('body', 'body');
  data.computedStyles.h1 = getElementStyles('h1', 'h1');
  data.computedStyles.h2 = getElementStyles('h2', 'h2');
  data.computedStyles.h3 = getElementStyles('h3', 'h3');
  data.computedStyles.button = getElementStyles('button, .btn, .button', 'button');
  data.computedStyles.input = getElementStyles('input[type="text"], input:not([type]), textarea', 'input');
  data.computedStyles.card = getElementStyles('.card, .container, section, article', 'div');

  try {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.style) {
            for (let i = 0; i < rule.style.length; i++) {
              const prop = rule.style[i];
              if (prop.startsWith('--')) {
                const val = rule.style.getPropertyValue(prop).trim();
                if (val && (val.includes('rgb') || val.includes('#') || val.includes('oklch') || val.endsWith('px') || val.endsWith('rem') || val.endsWith('em'))) {
                  data.cssVariables[prop] = val;
                }
              }
            }
          }
        }
      } catch (e) {}
    }
  } catch (e) {}

  data.structure.headingsCount = {
    h1: document.querySelectorAll('h1').length,
    h2: document.querySelectorAll('h2').length,
    h3: document.querySelectorAll('h3').length
  };
  data.structure.hasMain = document.querySelector('main') !== null;
  data.structure.hasHeader = document.querySelector('header') !== null;
  data.structure.hasFooter = document.querySelector('footer') !== null;

  data.techStack.gsap = typeof window.gsap !== 'undefined' || !!document.querySelector('script[src*="gsap"]');
  data.techStack.framerMotion = !!document.querySelector('[data-framer-generated]') || !!document.querySelector('div[class*="motion-"]');
  data.techStack.lottie = typeof window.lottie !== 'undefined' || !!document.querySelector('script[src*="lottie"]');
  data.techStack.tailwind = !!document.querySelector('link[href*="tailwind"]') || 
                            document.querySelectorAll('[class*="bg-"], [class*="text-"], [class*="flex-"]').length > 15;
  data.techStack.react = typeof window.React !== 'undefined' || !!document.querySelector('[data-reactroot]');
  data.techStack.nextjs = typeof window.__NEXT_DATA__ !== 'undefined';
  data.techStack.astro = !!document.querySelector('[data-astro-cid]') || !!document.querySelector('script[src*="astro"]');

  return data;
}

// Generate Markdown contents from scraped data
function generateMarkdowns(raw) {
  const colors = {};
  const typography = {};
  const rounded = {};
  const spacing = {};
  const components = {};

  const name = raw.title.split(/[\s\-|]+/)[0] || raw.domain.split('.')[0] || 'DesignSystem';
  const desc = raw.description || `Design DNA extracted from ${raw.domain}`;

  // Process Colors to OKLCH
  colors['primary-accent'] = parseColorToOklch(raw.computedStyles.button.backgroundColor) || 'oklch(84% 0.19 80.46)';
  colors['secondary-accent'] = parseColorToOklch(raw.computedStyles.card.borderColor) || 'oklch(70% 0.12 188)';
  colors['surface-ground'] = parseColorToOklch(raw.computedStyles.body.backgroundColor) || 'oklch(7% 0.006 95)';
  colors['surface-card'] = parseColorToOklch(raw.computedStyles.card.backgroundColor) || 'oklch(11% 0.006 95)';
  colors['surface-input'] = parseColorToOklch(raw.computedStyles.input.backgroundColor) || 'oklch(15% 0.008 95)';
  colors['text-main'] = parseColorToOklch(raw.computedStyles.body.color) || 'oklch(91% 0 0)';
  colors['text-muted'] = parseColorToOklch(raw.computedStyles.h3.color) || 'oklch(72% 0 0)';
  colors['border-default'] = parseColorToOklch(raw.computedStyles.card.borderColor) || 'oklch(78% 0 0 / 0.16)';
  colors['border-active'] = parseColorToOklch(raw.computedStyles.input.borderColor) || 'oklch(74% 0.09 82 / 0.6)';

  // Pick up top variables
  let varIdx = 1;
  for (const [key, val] of Object.entries(raw.cssVariables)) {
    if (key.includes('color') || key.includes('bg') || key.includes('text') || val.includes('rgb') || val.includes('#')) {
      const cleanKey = key.replace('--', '');
      if (!colors[cleanKey]) {
        colors[cleanKey] = parseColorToOklch(val);
        if (varIdx++ > 15) break;
      }
    }
  }

  // Process Typography
  typography['display'] = {
    fontFamily: raw.computedStyles.h1.fontFamily || 'sans-serif',
    fontSize: raw.computedStyles.h1.fontSize || '2.5rem',
    fontWeight: raw.computedStyles.h1.fontWeight || '700',
    lineHeight: raw.computedStyles.h1.lineHeight || '1.2',
    letterSpacing: raw.computedStyles.h1.letterSpacing || 'normal'
  };

  typography['headline'] = {
    fontFamily: raw.computedStyles.h2.fontFamily || 'sans-serif',
    fontSize: raw.computedStyles.h2.fontSize || '1.8rem',
    fontWeight: raw.computedStyles.h2.fontWeight || '600',
    lineHeight: raw.computedStyles.h2.lineHeight || '1.3',
    letterSpacing: raw.computedStyles.h2.letterSpacing || 'normal'
  };

  typography['title'] = {
    fontFamily: raw.computedStyles.h3.fontFamily || 'sans-serif',
    fontSize: raw.computedStyles.h3.fontSize || '1.25rem',
    fontWeight: raw.computedStyles.h3.fontWeight || '500',
    lineHeight: raw.computedStyles.h3.lineHeight || '1.4'
  };

  typography['body'] = {
    fontFamily: raw.computedStyles.body.fontFamily || 'sans-serif',
    fontSize: raw.computedStyles.body.fontSize || '1rem',
    fontWeight: raw.computedStyles.body.fontWeight || '400',
    lineHeight: raw.computedStyles.body.lineHeight || '1.6'
  };

  typography['mono'] = {
    fontFamily: raw.computedStyles.body.fontFamily.includes('mono') ? raw.computedStyles.body.fontFamily : 'SFMono-Regular, Roboto Mono, Consolas, monospace',
    fontSize: '0.85rem',
    fontWeight: '400',
    letterSpacing: '0.05em'
  };

  // Process Rounded
  rounded['none'] = '0px';
  rounded['sm'] = raw.computedStyles.input.borderRadius || '4px';
  rounded['md'] = raw.computedStyles.button.borderRadius || '6px';
  rounded['lg'] = raw.computedStyles.card.borderRadius || '8px';
  rounded['pill'] = '9999px';

  for (const [key, val] of Object.entries(raw.cssVariables)) {
    if (key.includes('radius') || key.includes('rounded')) {
      rounded[key.replace('--', '')] = val;
    }
  }

  // Process Spacing
  spacing['xs'] = '4px';
  spacing['sm'] = '8px';
  spacing['md'] = '16px';
  spacing['lg'] = '24px';
  spacing['xl'] = '32px';

  for (const [key, val] of Object.entries(raw.cssVariables)) {
    if (key.includes('space') || key.includes('spacing') || key.includes('padding') || key.includes('margin')) {
      spacing[key.replace('--', '')] = val;
    }
  }

  // Components mapping
  components['button-primary'] = {
    backgroundColor: '{colors.primary-accent}',
    textColor: '{colors.surface-ground}',
    rounded: '{rounded.md}',
    padding: raw.computedStyles.button.padding || '8px 16px'
  };

  components['input-text'] = {
    backgroundColor: '{colors.surface-input}',
    textColor: '{colors.text-main}',
    borderColor: '{colors.border-default}',
    rounded: '{rounded.sm}',
    padding: raw.computedStyles.input.padding || '10px 14px'
  };

  components['card'] = {
    backgroundColor: '{colors.surface-card}',
    borderColor: '{colors.border-default}',
    rounded: '{rounded.lg}',
    padding: raw.computedStyles.card.padding || '20px'
  };

  // Generate DESIGN.md
  let designMd = '---\n';
  designMd += `name: "${name}"\n`;
  designMd += `description: "${desc.replace(/"/g, '\\"')}"\n\n`;
  
  designMd += 'colors:\n';
  for (const [key, val] of Object.entries(colors)) {
    designMd += `  ${key}: "${val}"\n`;
  }
  designMd += '\n';

  designMd += 'typography:\n';
  for (const [key, val] of Object.entries(typography)) {
    designMd += `  ${key}:\n`;
    for (const [prop, propVal] of Object.entries(val)) {
      designMd += `    ${prop}: "${propVal}"\n`;
    }
  }
  designMd += '\n';

  designMd += 'rounded:\n';
  for (const [key, val] of Object.entries(rounded)) {
    designMd += `  ${key}: "${val}"\n`;
  }
  designMd += '\n';

  designMd += 'spacing:\n';
  for (const [key, val] of Object.entries(spacing)) {
    designMd += `  ${key}: "${val}"\n`;
  }
  designMd += '\n';

  designMd += 'components:\n';
  for (const [key, val] of Object.entries(components)) {
    designMd += `  ${key}:\n`;
    for (const [prop, propVal] of Object.entries(val)) {
      designMd += `    ${prop}: "${propVal}"\n`;
    }
  }
  designMd += '---\n\n';

  designMd += `# Design System: ${name}\n\n`;
  designMd += `## 1. Overview: ${name}\n\n`;
  designMd += `**Creative North Star: "${name} Aesthetic"**\n\n`;
  designMd += `This design system was auto-extracted from [${raw.domain}](https://${raw.domain}) on ${new Date().toLocaleDateString()}.\n\n`;
  designMd += `- **URL**: ${raw.url}\n`;
  designMd += `- **Description**: ${desc}\n\n`;

  designMd += `## 2. Information Architecture & Structure\n\n`;
  designMd += `- **Headings Structure**:\n`;
  designMd += `  - \`<h1>\` tags: ${raw.structure.headingsCount.h1}\n`;
  designMd += `  - \`<h2>\` tags: ${raw.structure.headingsCount.h2}\n`;
  designMd += `  - \`<h3>\` tags: ${raw.structure.headingsCount.h3}\n`;
  designMd += `- **Layout Blocks**:\n`;
  designMd += `  - Has \`<header>\`: ${raw.structure.hasHeader ? 'Yes' : 'No'}\n`;
  designMd += `  - Has \`<main>\`: ${raw.structure.hasMain ? 'Yes' : 'No'}\n`;
  designMd += `  - Has \`<footer>\`: ${raw.structure.hasFooter ? 'Yes' : 'No'}\n\n`;

  designMd += `## 3. Colors\n\n`;
  designMd += `Core colors defined in this interface:\n\n`;
  for (const [key, val] of Object.entries(colors)) {
    designMd += `- **${key}**: \`${val}\`\n`;
  }
  designMd += '\n';

  designMd += `## 4. Typography\n\n`;
  designMd += `Typography configuration blocks:\n\n`;
  for (const [key, val] of Object.entries(typography)) {
    designMd += `### ${key.toUpperCase()}\n`;
    designMd += `- Font Family: \`${val.fontFamily}\`\n`;
    if (val.fontSize) designMd += `- Font Size: \`${val.fontSize}\`\n`;
    if (val.fontWeight) designMd += `- Font Weight: \`${val.fontWeight}\`\n`;
    if (val.lineHeight) designMd += `- Line Height: \`${val.lineHeight}\`\n`;
    designMd += '\n';
  }

  designMd += `## 5. Components\n\n`;
  designMd += `Predefined visual styling specifications:\n\n`;
  for (const [key, val] of Object.entries(components)) {
    designMd += `### ${key}\n`;
    for (const [prop, propVal] of Object.entries(val)) {
      designMd += `- ${prop}: \`${propVal}\`\n`;
    }
    designMd += '\n';
  }

  designMd += `## 6. Animations & Tech Stack\n\n`;
  let techCount = 0;
  for (const [tech, detected] of Object.entries(raw.techStack)) {
    if (detected) {
      designMd += `- **${tech.toUpperCase()}**: Detected\n`;
      techCount++;
    }
  }
  if (techCount === 0) {
    designMd += `No standard frontend libraries or animation frameworks were explicitly detected.\n`;
  }
  designMd += '\n';

  designMd += `## 7. Do and Do Not\n\n`;
  designMd += `### Do\n`;
  designMd += `- Do leverage CSS variables for dynamic color values: e.g. \`var(--primary-accent)\`.\n`;
  designMd += `- Do use standard border-radius tokens (\`${rounded.sm}\` or \`${rounded.lg}\`) for control borders.\n`;
  designMd += `- Do enforce monospace font families (\`${typography.mono.fontFamily}\`) for code samples and numbers.\n\n`;
  designMd += `### Do Not\n`;
  designMd += `- Do not hardcode raw OKLCH, Hex, or RGB colors directly in component styling.\n`;
  designMd += `- Do not use mismatched border radii on control components.\n`;

  return designMd;
}

// Extract design from active tab
async function executeExtraction() {
  const display = document.getElementById('markdown-code-display');
  const domainText = document.getElementById('domain-info-text');
  
  display.innerText = 'Extracting design DNA from active tab... Please wait.';
  domainText.innerText = '# loading...';
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url) {
      display.innerText = 'Error: No active tab found.';
      return;
    }
    
    activeTabUrl = tab.url;
    
    // Check if we can inject scripts into this tab (must be http/https/file protocol)
    if (!activeTabUrl.startsWith('http://') && !activeTabUrl.startsWith('https://')) {
      display.innerText = 'Cannot extract design details from this page.\nPlease try again on a standard website.';
      domainText.innerText = '# local';
      return;
    }
    
    activeTabDomain = new URL(activeTabUrl).hostname;
    const cleanDomain = activeTabDomain.replace('www.', '');
    domainText.innerText = `# ${cleanDomain}`;
    
    // Run script injection
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: pageExtractorScript
    });
    
    if (results && results[0] && results[0].result) {
      generatedDesignMd = generateMarkdowns(results[0].result);
      
      // Render active tab content
      display.innerText = generatedDesignMd || 'No DESIGN.md content generated.';
    } else {
      display.innerText = 'Failed to retrieve design data from active tab.';
    }
  } catch (error) {
    console.error('Extraction Error:', error);
    display.innerText = `Error: ${error.message}\n\nMake sure the page is fully loaded and you are not on a restricted browser settings page.`;
  }
}

// Copy to Clipboard
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    const copyBtn = document.getElementById('btn-copy');
    const originalSvg = copyBtn.innerHTML;
    
    // Change button icon to a green checkmark
    copyBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" style="color: #10b981;">
        <polyline points="20 6 9 17 4 12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    
    setTimeout(() => {
      copyBtn.innerHTML = originalSvg;
    }, 1500);
  } catch (err) {
    alert('Failed to copy text to clipboard: ' + err);
  }
}

// Download markdown file
function downloadMarkdown(filename, content) {
  if (!content) {
    alert('No content to download.');
    return;
  }
  const element = document.createElement('a');
  element.setAttribute('href', 'data:text/markdown;charset=utf-8,' + encodeURIComponent(content));
  element.setAttribute('download', filename);
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}

// Wire events
document.addEventListener('DOMContentLoaded', () => {
  // Controls
  document.getElementById('btn-copy').addEventListener('click', () => {
    copyToClipboard(generatedDesignMd);
  });
  
  document.getElementById('btn-download').addEventListener('click', () => {
    downloadMarkdown('DESIGN.md', generatedDesignMd);
  });
  
  document.getElementById('btn-refresh').addEventListener('click', () => {
    executeExtraction();
  });
  
  document.getElementById('btn-help').addEventListener('click', () => {
    alert('Liem gDesign Extractor\n\nThis utility analyzes the CSS variables, typography ramps, computed colors, spacing, and framework signatures from your active browser tab, compiling them into a portable DESIGN.md spec.');
  });
  
  // Run extraction instantly on open
  executeExtraction();
});
