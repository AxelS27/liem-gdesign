// Liem gDesign Chrome Extension Popup Script

let activeTabUrl = '';
let activeTabDomain = '';
let generatedDesignMd = '';

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

  const scriptElements = Array.from(document.querySelectorAll('script'));
  const scriptSrcs = scriptElements.map(s => (s.src || '').toLowerCase());
  data.techStack.gsap = scriptSrcs.some(src => src.includes('gsap')) || typeof window.gsap !== 'undefined';
  data.techStack.framerMotion = !!document.querySelector('[data-framer-generated]') || !!document.querySelector('div[class*="motion-"]') || scriptSrcs.some(src => src.includes('framer-motion'));
  data.techStack.lottie = scriptSrcs.some(src => src.includes('lottie') || src.includes('bodymovin')) || typeof window.lottie !== 'undefined';
  data.techStack.tailwind = !!document.querySelector('link[href*="tailwind"]') || 
                            document.querySelectorAll('[class*="bg-"], [class*="text-"], [class*="flex-"]').length > 15;
  data.techStack.react = !!document.querySelector('[data-reactroot]') || scriptSrcs.some(src => src.includes('react')) || typeof window.React !== 'undefined';
  data.techStack.nextjs = !!document.getElementById('__NEXT_DATA__') || scriptSrcs.some(src => src.includes('/_next/')) || typeof window.__NEXT_DATA__ !== 'undefined';
  data.techStack.astro = !!document.querySelector('[data-astro-cid]') || scriptSrcs.some(src => src.includes('astro'));

  return data;
}

// Generate Markdown contents from scraped data
function generateMarkdowns(raw) {
  const colors = {};
  const typography = {};
  const rounded = {};
  const spacing = {};
  const components = {};

  // Robust brand name extraction
  let parsedName = (raw.title || '').split(/\s*[\-\|—–•:]\s*/)[0].trim();
  let cleanName = parsedName.replace(/\b(official online store|official store|online store|official website|homepage|home|welcome to)\b/gi, '').trim();
  if (!cleanName && (raw.title || '').split(/\s*[\-\|—–•:]\s*/)[1]) {
    cleanName = raw.title.split(/\s*[\-\|—–•:]\s*/)[1].trim();
  }
  const name = cleanName || raw.domain.split('.')[0] || 'DesignSystem';
  const desc = raw.description || `Discover the ${name} official online store and design foundations.`;

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
  designMd += `name: "${name.replace(/"/g, '\\"')}"\n`;
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

  designMd += `## 1. Context & Goals\n\n`;
  designMd += `### Mission\n`;
  designMd += `Create implementation-ready, token-driven UI guidance for ${name} that is optimized for consistency, accessibility, and fast delivery across e-commerce storefront.\n\n`;
  designMd += `### Brand Context\n`;
  designMd += `- **Product/Brand**: ${name}\n`;
  designMd += `- **URL**: ${raw.url}\n`;
  designMd += `- **Audience**: Online shoppers and consumers\n`;
  designMd += `- **Product Surface**: E-commerce storefront\n`;
  designMd += `- **Creative North Star**: "${name} Aesthetic"\n`;
  designMd += `- **Description**: ${desc}\n\n`;

  designMd += `## 2. Design Tokens & Foundations\n\n`;
  
  designMd += `### Style Foundations\n`;
  designMd += `- **Visual Style**: Minimal, utility-first, accessibility-prioritized.\n`;
  designMd += `- **Main Font Style**: \`fontFamily: "${typography.body.fontFamily}"\`, \`fontSize: "${typography.body.fontSize}"\`, \`fontWeight: "${typography.body.fontWeight}"\`, \`lineHeight: "${typography.body.lineHeight}"\`.\n\n`;

  designMd += `### Colors\n`;
  designMd += `Core colors defined in this interface (WCAG contrast-compliant mapping):\n\n`;
  for (const [key, val] of Object.entries(colors)) {
    designMd += `- **${key}**: \`${val}\`\n`;
  }
  designMd += '\n';

  designMd += `### Typography Scale\n`;
  designMd += `Typography configuration blocks:\n\n`;
  for (const [key, val] of Object.entries(typography)) {
    designMd += `#### ${key.toUpperCase()}\n`;
    designMd += `- Font Family: \`${val.fontFamily}\`\n`;
    if (val.fontSize) designMd += `- Font Size: \`${val.fontSize}\`\n`;
    if (val.fontWeight) designMd += `- Font Weight: \`${val.fontWeight}\`\n`;
    if (val.lineHeight) designMd += `- Line Height: \`${val.lineHeight}\`\n`;
    designMd += '\n';
  }

  designMd += `### Spacing Scale\n`;
  designMd += `System spacing configurations:\n\n`;
  for (const [key, val] of Object.entries(spacing)) {
    designMd += `- **${key}**: \`${val}\`\n`;
  }
  designMd += '\n';

  designMd += `### Radius, Shadows & Motions\n`;
  designMd += `- **Radius Tokens**:\n`;
  for (const [key, val] of Object.entries(rounded)) {
    designMd += `  - \`${key}\`: \`${val}\`\n`;
  }
  designMd += `- **Motion Tokens**: \`motion.duration.instant=250ms\`, \`motion.duration.fast=350ms\`.\n\n`;

  designMd += `### Page Structure & Diagnostics\n`;
  designMd += `- **Headings Structure**:\n`;
  designMd += `  - \`<h1>\` tags: ${raw.structure.headingsCount.h1}\n`;
  designMd += `  - \`<h2>\` tags: ${raw.structure.headingsCount.h2}\n`;
  designMd += `  - \`<h3>\` tags: ${raw.structure.headingsCount.h3}\n`;
  designMd += `- **Layout Blocks**:\n`;
  designMd += `  - Has \`<header>\`: ${raw.structure.hasHeader ? 'Yes' : 'No'}\n`;
  designMd += `  - Has \`<main>\`: ${raw.structure.hasMain ? 'Yes' : 'No'}\n`;
  designMd += `  - Has \`<footer>\`: ${raw.structure.hasFooter ? 'Yes' : 'No'}\n`;
  designMd += `- **Animations & Tech Stack**:\n`;
  let techCount = 0;
  for (const [tech, detected] of Object.entries(raw.techStack)) {
    if (detected) {
      designMd += `  - **${tech.toUpperCase()}**: Detected\n`;
      techCount++;
    }
  }
  if (techCount === 0) {
    designMd += `  - No standard libraries or frameworks detected.\n`;
  }
  designMd += '\n';

  designMd += `## 3. Component-Level Rules\n\n`;
  designMd += `Every component must be built using semantic tokens and define explicit state rules:\n\n`;
  for (const [key, val] of Object.entries(components)) {
    designMd += `### Component: ${key.toUpperCase()}\n`;
    designMd += `#### Anatomy & Styles\n`;
    for (const [prop, propVal] of Object.entries(val)) {
      designMd += `- **${prop}**: \`${propVal}\`\n`;
    }
    designMd += `\n#### State Matrix\n`;
    designMd += `- **Default**: Render using token defaults.\n`;
    designMd += `- **Hover**: Add outline/background shift using \`${colors['border-active'] || 'border-active'}\`.\n`;
    designMd += `- **Focus-Visible**: Must show outline (thickness >= 2px, offset >= 2px) for keyboard accessibility.\n`;
    designMd += `- **Active/Pressed**: Micro-interaction scale shrink to \`98%\` (instant transition: 100ms).\n`;
    designMd += `- **Disabled**: Set opacity to \`40%\` and trigger \`pointer-events: none\`.\n`;
    designMd += `- **Loading**: Display circular spinner; hide button text labels.\n`;
    designMd += `- **Error**: Highlight border with \`${colors['color-background-error'] || 'oklch(50% 0.18 29.7)'}\`.\n\n`;
    
    designMd += `#### Interaction Behavior\n`;
    designMd += `- **Pointer (Mouse)**: Hover triggers cursor change to pointer and subtle transition (duration: 250ms).\n`;
    designMd += `- **Keyboard**: Activate via \`Space\` or \`Enter\` key when focused.\n`;
    designMd += `- **Touch**: Touch targets must maintain a minimum interactive surface of \`44x44px\` to prevent mis-clicks.\n\n`;
  }

  designMd += `## 4. Accessibility Requirements (WCAG 2.2 AA)\n\n`;
  designMd += `- **Keyboard-First Navigation**: All interactive elements must be focusable using \`Tab\` and actionable using keyboard controls.\n`;
  designMd += `- **Focus-Visible Indicators**: Focus outlines must never be disabled or hidden. Outline contrast must meet a \`3:1\` ratio against the background.\n`;
  designMd += `- **Color Contrast**: Main body text contrast against the background must satisfy a \`4.5:1\` ratio (\`3:1\` for large display headings).\n\n`;
  designMd += `### Pass/Fail Acceptance Criteria\n`;
  designMd += `- [ ] **PASS**: Elements can be navigated entirely using the \`Tab\` key in logical order. | **FAIL**: Focus order is trapped or jumps randomly.\n`;
  designMd += `- [ ] **PASS**: Active elements have a clear, high-contrast outline on focus. | **FAIL**: \`outline: none\` is declared without custom focus styles.\n`;
  designMd += `- [ ] **PASS**: Color contrast ratio of text elements meets or exceeds WCAG 2.2 AA targets. | **FAIL**: Subdued text color makes content unreadable.\n\n`;

  designMd += `## 5. Content & Tone Standards\n\n`;
  designMd += `- **Tone**: Concise, confident, implementation-focused.\n`;
  designMd += `- **Action Labels**: Use direct, verb-first actions (e.g., "Add to Bag", "Secure Checkout") instead of ambiguous text.\n\n`;

  designMd += `## 6. Anti-Patterns & Prohibited Implementations\n\n`;
  designMd += `- **No Raw Values**: Do not hardcode raw OKLCH, Hex, or RGB colors directly in component styling.\n`;
  designMd += `- **No Hidden Focus**: Do not allow low-contrast text or hidden focus indicators (\`outline: none\`).\n`;
  designMd += `- **No One-Off Spacing**: Do not introduce one-off spacing or typography exceptions that deviate from the token scale.\n\n`;

  designMd += `## 7. QA Checklist\n\n`;
  designMd += `- [ ] All colors and styles utilize system design tokens.\n`;
  designMd += `- [ ] Component states (Hover, Focus-visible, Active, Disabled, Loading, Error) are fully implemented.\n`;
  designMd += `- [ ] Keyboard accessibility is verified; no keyboard traps exist.\n`;
  designMd += `- [ ] Screen reader landmarks are structured (headings hierarchy has valid order).\n`;

  return designMd;
}

// Render raw markdown string into parsed, styled HTML
function renderMarkdownToHtml(markdown) {
  if (!markdown) return '';

  let frontmatterRaw = '';
  let markdownBody = markdown;

  // Split frontmatter
  if (markdown.startsWith('---')) {
    const parts = markdown.split('---\n');
    if (parts.length >= 3) {
      frontmatterRaw = parts[1];
      markdownBody = parts.slice(2).join('---\n');
    }
  }

  // Escape HTML entities in markdownBody first to avoid tag collisions
  let html = markdownBody
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Translate bold syntax: **text** -> <strong>text</strong>
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Translate inline code syntax: `code` -> <code>code</code>
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');

  // Process line by line to handle block structures (headers, lists, breaks)
  const lines = html.split('\n');
  const processedLines = [];
  let inList = false;

  for (let line of lines) {
    const trimmed = line.trim();

    // Headers (Closing active lists if any)
    if (trimmed.startsWith('#### ') || trimmed.startsWith('### ') || trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
      if (inList) {
        processedLines.push('</ul>');
        inList = false;
      }
      if (trimmed.startsWith('#### ')) {
        processedLines.push(`<h4>${trimmed.substring(5)}</h4>`);
      } else if (trimmed.startsWith('### ')) {
        processedLines.push(`<h3>${trimmed.substring(4)}</h3>`);
      } else if (trimmed.startsWith('## ')) {
        processedLines.push(`<h2>${trimmed.substring(3)}</h2>`);
      } else if (trimmed.startsWith('# ')) {
        processedLines.push(`<h1>${trimmed.substring(2)}</h1>`);
      }
      continue;
    }

    // List items: check for "- item" or "- [ ] item"
    const listMatch = line.match(/^(\s*)-\s+(.*)$/);
    if (listMatch) {
      if (!inList) {
        processedLines.push('<ul>');
        inList = true;
      }
      // Handle checkboxes: [ ] or [x]
      let itemContent = listMatch[2];
      if (itemContent.startsWith('[ ] ') || itemContent.startsWith('[x] ') || itemContent.startsWith('[X] ')) {
        const isChecked = !itemContent.startsWith('[ ] ');
        const text = itemContent.substring(4);
        itemContent = `<input type="checkbox" disabled ${isChecked ? 'checked' : ''} style="margin-right: 6px; vertical-align: middle;">${text}`;
      }
      processedLines.push(`<li>${itemContent}</li>`);
    } else {
      if (inList) {
        processedLines.push('</ul>');
        inList = false;
      }

      if (trimmed === '') {
        processedLines.push('<br>');
      } else {
        // Just standard text paragraphs
        processedLines.push(`<p>${line}</p>`);
      }
    }
  }

  if (inList) {
    processedLines.push('</ul>');
  }

  // Construct final html output
  let finalHtml = '';
  finalHtml += processedLines.join('\n');
  
  return finalHtml;
}

// Extract design from active tab
async function executeExtraction() {
  const display = document.getElementById('markdown-code-display');
  const domainText = document.getElementById('domain-info-text');
  const yamlText = document.getElementById('yaml-raw-text');
  
  generatedDesignMd = ''; // Reset state to prevent leaks on failures
  display.innerHTML = '<p>Extracting design DNA from active tab... Please wait.</p>';
  domainText.innerText = 'Active Tab: loading...';
  if (yamlText) {
    yamlText.innerText = 'Extracting YAML tokens...';
  }
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url) {
      display.innerHTML = '<p>Error: No active tab found.</p>';
      if (yamlText) yamlText.innerText = 'Error: No active tab found.';
      return;
    }
    
    activeTabUrl = tab.url;
    
    // Check if we can inject scripts into this tab (must be http/https/file protocol)
    if (!activeTabUrl.startsWith('http://') && !activeTabUrl.startsWith('https://')) {
      display.innerHTML = '<p>Cannot extract design details from this page.<br>Please try again on a standard website.</p>';
      domainText.innerText = 'Active Tab: local';
      if (yamlText) yamlText.innerText = 'Cannot extract tokens from local/restricted pages.';
      return;
    }

    // Check if the page is a restricted browser store page
    if (activeTabUrl.includes('chromewebstore.google.com') || activeTabUrl.includes('chrome.google.com/webstore')) {
      display.innerHTML = '<p>Cannot extract design details from the Chrome Web Store.<br>Please try again on a standard website.</p>';
      domainText.innerText = `Active Tab: ${activeTabUrl}`;
      if (yamlText) yamlText.innerText = 'Cannot extract tokens from Chrome Web Store.';
      return;
    }
    
    activeTabDomain = new URL(activeTabUrl).hostname;
    domainText.innerText = `Active Tab: ${activeTabUrl}`;
    
    // Run script injection
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: pageExtractorScript
    });
    
    if (results && results[0] && results[0].result) {
      generatedDesignMd = generateMarkdowns(results[0].result);
      
      // Render active tab content as parsed HTML
      display.innerHTML = generatedDesignMd ? renderMarkdownToHtml(generatedDesignMd) : '<p>No DESIGN.md content generated.</p>';

      // Populate YAML tokens
      if (yamlText && generatedDesignMd) {
        let yamlContent = '';
        if (generatedDesignMd.startsWith('---')) {
          const secondIndex = generatedDesignMd.indexOf('---', 3);
          if (secondIndex !== -1) {
            yamlContent = generatedDesignMd.substring(3, secondIndex).trim();
          }
        }
        yamlText.innerText = yamlContent || 'No YAML tokens found.';
      }
    } else {
      display.innerHTML = '<p>Failed to retrieve design data from active tab.</p>';
      if (yamlText) yamlText.innerText = 'Failed to retrieve design data.';
    }
  } catch (error) {
    console.warn('Extraction Error:', error);
    display.innerHTML = `<p>Error: ${error.message}<br><br>Make sure the page is fully loaded and you are not on a restricted page.</p>`;
    if (yamlText) {
      yamlText.innerText = `Error: ${error.message}`;
    }
  }
}


// Copy to Clipboard
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    const copyBtn = document.getElementById('btn-copy');
    const originalHtml = copyBtn.innerHTML;
    
    // Change button icon to a green checkmark
    copyBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" style="color: #10b981;">
        <polyline points="20 6 9 17 4 12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    
    setTimeout(() => {
      copyBtn.innerHTML = originalHtml;
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
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  element.setAttribute('href', url);
  element.setAttribute('download', filename);
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
  URL.revokeObjectURL(url);
}

// Wire events
document.addEventListener('DOMContentLoaded', () => {
  // Tabs switching
  const tabPreview = document.getElementById('tab-preview');
  const tabYaml = document.getElementById('tab-yaml');
  const previewDisplay = document.getElementById('markdown-code-display');
  const yamlDisplay = document.getElementById('yaml-code-display');

  if (tabPreview && tabYaml && previewDisplay && yamlDisplay) {
    tabPreview.addEventListener('click', () => {
      tabPreview.classList.add('active');
      tabYaml.classList.remove('active');
      previewDisplay.style.display = 'block';
      yamlDisplay.style.display = 'none';
    });

    tabYaml.addEventListener('click', () => {
      tabYaml.classList.add('active');
      tabPreview.classList.remove('active');
      yamlDisplay.style.display = 'block';
      previewDisplay.style.display = 'none';
    });
  }

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

  // Run extraction instantly on open
  executeExtraction();
});
