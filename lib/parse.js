'use strict';

const NAMED_ENTITIES = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  ndash: '\u2013',
  mdash: '\u2014',
  hellip: '\u2026'
};

export function decodeEntities(input) {
  if (!input) return '';
  return String(input).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, function (match, code) {
    if (code[0] === '#') {
      const isHex = code[1] === 'x' || code[1] === 'X';
      const value = parseInt(code.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (!isNaN(value)) return String.fromCodePoint(value);
      return match;
    }
    const key = code.toLowerCase();
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key)
      ? NAMED_ENTITIES[key]
      : match;
  });
}

export function stripComments(input) {
  if (!input) return '';
  return String(input).replace(/<!--[\s\S]*?-->/g, '');
}

export function stripTags(input) {
  if (!input) return '';
  return decodeEntities(
    stripComments(input)
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, '')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractRows(html, marker) {
  if (!html) return [];
  const clean = stripComments(html);
  const rows = [];
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = rowRe.exec(clean)) !== null) {
    const raw = m[1];
    if (marker && !raw.includes(marker)) continue;
    const cells = raw
      .split(/<td\b[^>]*>/i)
      .slice(1)
      .map(function (cell) {
        return stripTags(cell.split(/<\/td>/i)[0]);
      });
    if (cells.length) rows.push(cells);
  }
  return rows;
}

export function findForm(html, name) {
  if (!html) return null;
  const clean = stripComments(html);
  const re = new RegExp('<form[^>]*name="' + name + '"[^>]*>([\\s\\S]*?)<\\/form>', 'i');
  const m = clean.match(re);
  return m ? m[1] : null;
}

export function extractHiddenInputs(fragment) {
  const result = {};
  if (!fragment) return result;
  const re = /<input\b[^>]*>/gi;
  let m;
  while ((m = re.exec(fragment)) !== null) {
    const tag = m[0];
    if (!/type="hidden"/i.test(tag)) continue;
    const nameMatch = tag.match(/name="([^"]*)"/i);
    if (!nameMatch) continue;
    const valueMatch = tag.match(/value="([^"]*)"/i);
    result[nameMatch[1]] = decodeEntities(valueMatch ? valueMatch[1] : '');
  }
  return result;
}

export function extractCaptchaPath(html) {
  if (!html) return null;
  const m = html.match(/assets\/captcha\/([0-9]+\.jpg)/i);
  return m ? 'assets/captcha/' + m[1] : null;
}

export function extractFirst(html, regex) {
  const m = String(html || '').match(regex);
  return m ? m[1] : null;
}

export function extractFormFields(fragment) {
  const fields = {};
  if (!fragment) return fields;

  const inputRe = /<input\b[^>]*>/gi;
  let m;
  while ((m = inputRe.exec(fragment)) !== null) {
    const tag = m[0];
    const nameMatch = tag.match(/name="([^"]*)"/i);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    const type = (tag.match(/type="([^"]*)"/i) || [, 'text'])[1].toLowerCase();
    const value = decodeEntities((tag.match(/value="([^"]*)"/i) || [, ''])[1]);
    if (type === 'submit' || type === 'button' || type === 'image') continue;
    if (type === 'radio' || type === 'checkbox') {
      if (/\bchecked\b/i.test(tag)) fields[name] = value;
      continue;
    }
    fields[name] = value;
  }

  const selectRe = /<select\b[^>]*>([\s\S]*?)<\/select>/gi;
  while ((m = selectRe.exec(fragment)) !== null) {
    const nameMatch = m[0].match(/name="([^"]*)"/i);
    if (!nameMatch) continue;
    const options = m[1].match(/<option\b[^>]*>/gi) || [];
    let value = '';
    for (const opt of options) {
      const v = decodeEntities((opt.match(/value="([^"]*)"/i) || [, ''])[1]);
      if (/\bselected\b/i.test(opt)) {
        value = v;
        break;
      }
      if (value === '' && !/value=/.test(opt)) value = stripTags(opt);
    }
    fields[nameMatch[1]] = value;
  }

  const textareaRe = /<textarea\b[^>]*>([\s\S]*?)<\/textarea>/gi;
  while ((m = textareaRe.exec(fragment)) !== null) {
    const nameMatch = m[0].match(/name="([^"]*)"/i);
    if (nameMatch) fields[nameMatch[1]] = stripTags(m[1]);
  }

  return fields;
}

const MONTH_NAMES = {
  januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6,
  juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12
};

export function extractMeasurements(html) {
  const clean = stripComments(html);
  const out = [];
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = rowRe.exec(clean)) !== null) {
    const cells = m[1]
      .split(/<td\b[^>]*>/i)
      .slice(1)
      .map(function (cell) {
        return stripTags(cell.split(/<\/td>/i)[0]);
      });
    if (cells.length < 4) continue;
    if (!/^\d+\.?$/.test(cells[0])) continue;
    const dm = (cells[1] || '').match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    if (!dm) continue;
    const bulan = MONTH_NAMES[dm[2].toLowerCase()];
    if (!bulan) continue;
    out.push({
      hari: Number(dm[1]),
      bulan: bulan,
      tahun: Number(dm[3]),
      bb: cells[2] || '',
      tb: cells[3] || '',
      tanggalDisplay: cells[1]
    });
  }
  return out;
}

