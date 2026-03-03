/**
 * Self-contained PowerPoint generation utility for battlecards.
 * Generates PPTX files using raw OOXML + ZIP — no external library required.
 *
 * PPTX is a ZIP archive of XML files (Office Open XML / ECMA-376).
 * We build the ZIP with Store compression (method 0) and generate
 * all required OOXML parts inline — zero CDN dependencies.
 *
 * Slide structure:
 * 1. Title slide
 * 2. Company overview
 * 3+. One slide per competitor (7-panel grid layout)
 */

(function () {
  'use strict';

  // ── CRC-32 ────────────────────────────────────────────────────────────────────
  const _crcTable = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })();

  function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) crc = _crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // ── Minimal ZIP builder (Store / no compression) ──────────────────────────────
  function buildZip(files) {
    const enc = new TextEncoder();
    const localParts = [];
    const cdEntries = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = enc.encode(file.name);
      const fileData = file.data;
      const crc = crc32(fileData);
      const size = fileData.length;

      // Local file header (30 bytes) + filename + data
      const lhBuf = new ArrayBuffer(30 + nameBytes.length);
      const lh = new DataView(lhBuf);
      lh.setUint32(0,  0x04034B50, true); // signature
      lh.setUint16(4,  20,         true); // version needed
      lh.setUint16(6,  0,          true); // flags
      lh.setUint16(8,  0,          true); // compression: Store
      lh.setUint16(10, 0,          true); // mod time
      lh.setUint16(12, 0,          true); // mod date
      lh.setUint32(14, crc,        true); // CRC-32
      lh.setUint32(18, size,       true); // compressed size
      lh.setUint32(22, size,       true); // uncompressed size
      lh.setUint16(26, nameBytes.length, true); // filename length
      lh.setUint16(28, 0,          true); // extra field length
      new Uint8Array(lhBuf, 30).set(nameBytes);

      localParts.push(new Uint8Array(lhBuf));
      localParts.push(fileData);

      // Central directory entry (46 bytes) + filename
      const cdBuf = new ArrayBuffer(46 + nameBytes.length);
      const cd = new DataView(cdBuf);
      cd.setUint32(0,  0x02014B50, true);
      cd.setUint16(4,  0x0314,     true); // version made by
      cd.setUint16(6,  20,         true); // version needed
      cd.setUint16(8,  0,          true);
      cd.setUint16(10, 0,          true);
      cd.setUint16(12, 0,          true);
      cd.setUint16(14, 0,          true);
      cd.setUint32(16, crc,        true);
      cd.setUint32(20, size,       true);
      cd.setUint32(24, size,       true);
      cd.setUint16(28, nameBytes.length, true);
      cd.setUint16(30, 0,          true);
      cd.setUint16(32, 0,          true);
      cd.setUint16(34, 0,          true);
      cd.setUint16(36, 0,          true);
      cd.setUint32(38, 0,          true);
      cd.setUint32(42, offset,     true); // local header offset
      new Uint8Array(cdBuf, 46).set(nameBytes);
      cdEntries.push(new Uint8Array(cdBuf));

      offset += 30 + nameBytes.length + size;
    }

    const cdOffset = offset;
    const cdSize = cdEntries.reduce((s, e) => s + e.length, 0);

    // End of central directory record (22 bytes)
    const eocd = new ArrayBuffer(22);
    const ev = new DataView(eocd);
    ev.setUint32(0,  0x06054B50,   true);
    ev.setUint16(4,  0,            true);
    ev.setUint16(6,  0,            true);
    ev.setUint16(8,  files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize,       true);
    ev.setUint32(16, cdOffset,     true);
    ev.setUint16(20, 0,            true);

    const parts = [...localParts, ...cdEntries, new Uint8Array(eocd)];
    const total = parts.reduce((s, p) => s + p.length, 0);
    const result = new Uint8Array(total);
    let pos = 0;
    for (const p of parts) { result.set(p, pos); pos += p.length; }
    return result;
  }

  // ── EMU helpers ───────────────────────────────────────────────────────────────
  const EMU = 914400;           // EMU per inch
  const SLIDE_W = 9144000;      // 10 inches
  const SLIDE_H = 6858000;      // 7.5 inches
  function e(inches) { return Math.round(inches * EMU); }

  // ── XML escape ────────────────────────────────────────────────────────────────
  function x(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function trunc(s, n) {
    s = String(s == null ? '' : s);
    return s.length <= n ? s : s.slice(0, n - 1) + '\u2026';
  }

  // ── Color palette ─────────────────────────────────────────────────────────────
  const C = {
    primaryDark:  '372FA3',
    primary:      '4F46E5',
    primaryLight: '6366F1',
    accent:       'F97316',
    white:        'FFFFFF',
    darkBg:       '1E293B',
    slate900:     '0F172A',
    slate700:     '334155',
    slate600:     '475569',
    slate500:     '64748B',
    slate400:     '94A3B8',
    slate300:     'CBD5E1',
    lightBg:      'F1F5F9',
    blue:         '3B82F6',
    red:          'EF4444',
    amber:        'F59E0B',
    teal:         '14B8A6',
    crimson:      'DC2626',
    teal2:        '0D9488',
  };

  // ── Shape ID counter (reset per slide) ────────────────────────────────────────
  let _sid = 2;
  function nid() { return _sid++; }
  function resetSid() { _sid = 2; }

  // ── OOXML shape builders ──────────────────────────────────────────────────────

  /**
   * Solid-filled rectangle with optional border.
   * @param {number} px x in EMU  @param {number} py y in EMU
   * @param {number} pw w in EMU  @param {number} ph h in EMU
   * @param {string} fill hex color (no #)
   * @param {string} [stroke] hex border color; omit for no border
   */
  function rect(px, py, pw, ph, fill, stroke) {
    const id = nid();
    const ln = stroke
      ? `<a:ln w="9525"><a:solidFill><a:srgbClr val="${stroke}"/></a:solidFill></a:ln>`
      : `<a:ln><a:noFill/></a:ln>`;
    return `<p:sp>
  <p:nvSpPr>
    <p:cNvPr id="${id}" name="r${id}"/>
    <p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
    <p:nvPr/>
  </p:nvSpPr>
  <p:spPr>
    <a:xfrm><a:off x="${px}" y="${py}"/><a:ext cx="${pw}" cy="${ph}"/></a:xfrm>
    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
    <a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>
    ${ln}
  </p:spPr>
  <p:txBody>
    <a:bodyPr/>
    <a:lstStyle/>
    <a:p><a:endParaRPr lang="en-US" dirty="0"/></a:p>
  </p:txBody>
</p:sp>`;
  }

  /**
   * Text box.
   * @param {number} px x  @param {number} py y  @param {number} pw w  @param {number} ph h (all EMU)
   * @param {string} text content — newlines become separate paragraphs
   * @param {number} sz font size in pt
   * @param {boolean} bold
   * @param {string} color hex (no #)
   * @param {string} align 'l' | 'ctr' | 'r'
   * @param {boolean} [italic]
   */
  function txt(px, py, pw, ph, text, sz, bold, color, align, italic) {
    const id = nid();
    align = align || 'l';
    const lines = String(text == null ? '' : text).split('\n');
    const paras = lines.map(line => `<a:p>
      <a:pPr algn="${align}"/>
      <a:r>
        <a:rPr lang="en-US" sz="${sz * 100}" b="${bold ? 1 : 0}" i="${italic ? 1 : 0}" dirty="0" smtClean="0">
          <a:solidFill><a:srgbClr val="${color}"/></a:solidFill>
          <a:latin typeface="Arial" panose="020B0604020202020204" pitchFamily="34" charset="0"/>
        </a:rPr>
        <a:t>${x(line)}</a:t>
      </a:r>
    </a:p>`).join('\n');

    return `<p:sp>
  <p:nvSpPr>
    <p:cNvPr id="${id}" name="t${id}"/>
    <p:cNvSpPr txBox="1"><a:spLocks noGrp="1"/></p:cNvSpPr>
    <p:nvPr/>
  </p:nvSpPr>
  <p:spPr>
    <a:xfrm><a:off x="${px}" y="${py}"/><a:ext cx="${pw}" cy="${ph}"/></a:xfrm>
    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
    <a:noFill/>
    <a:ln><a:noFill/></a:ln>
  </p:spPr>
  <p:txBody>
    <a:bodyPr wrap="square" lIns="0" rIns="0" tIns="0" bIns="0" rtlCol="0">
      <a:normAutofit/>
    </a:bodyPr>
    <a:lstStyle/>
    ${paras}
  </p:txBody>
</p:sp>`;
  }

  // ── Slide XML wrapper ─────────────────────────────────────────────────────────
  function slide(shapes, bgColor) {
    const bg = bgColor
      ? `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${bgColor}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`
      : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       show="1">
  <p:cSld>
    ${bg}
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="${SLIDE_W}" cy="${SLIDE_H}"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="${SLIDE_W}" cy="${SLIDE_H}"/>
        </a:xfrm>
      </p:grpSpPr>
      ${shapes.join('\n      ')}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClr/></p:clrMapOvr>
</p:sld>`;
  }

  // ── Slide builders ────────────────────────────────────────────────────────────

  function buildTitleSlide(title, subtitle, companyUrl, dateStr) {
    resetSid();
    const s = [];
    // Two-tone background
    s.push(rect(0, 0, SLIDE_W, Math.round(SLIDE_H * 0.62), C.primaryDark));
    s.push(rect(0, Math.round(SLIDE_H * 0.62), SLIDE_W, Math.round(SLIDE_H * 0.38), C.darkBg));
    // Main title
    s.push(txt(e(0.5), e(1.4), e(9), e(1.3), title, 38, true, C.white, 'l'));
    // Subtitle
    s.push(txt(e(0.5), e(2.8), e(9), e(0.7), subtitle, 26, true, C.primaryLight, 'l'));
    // Accent line
    s.push(rect(e(0.5), e(3.65), e(2), Math.round(0.055 * EMU), C.primaryLight));
    // URL + date
    let dy = e(4.1);
    if (companyUrl) {
      s.push(txt(e(0.5), dy, e(9), e(0.35), 'Website: ' + companyUrl, 11, false, C.slate300, 'l'));
      dy += e(0.42);
    }
    s.push(txt(e(0.5), dy, e(9), e(0.35), 'Generated: ' + dateStr, 11, false, C.slate400, 'l'));
    // Footer tagline
    s.push(txt(e(0.5), e(6.85), e(9), e(0.28), 'Created with Competitive Battlecard AI', 10, false, C.accent, 'l', true));
    return slide(s);
  }

  function buildOverviewSlide(targetCompany, marketSummary) {
    resetSid();
    const s = [];
    const tc = targetCompany || {};

    // Header bar
    s.push(rect(0, 0, SLIDE_W, e(0.55), C.primary));
    s.push(txt(e(0.3), e(0.1), e(9.4), e(0.42), 'Company Overview', 20, true, C.white, 'l'));

    let cy = e(0.72);

    // Market snapshot
    const summary = (marketSummary || '').trim();
    if (summary) {
      const sh = e(1.65);
      s.push(rect(e(0.2), cy, e(9.6), sh, C.slate900));
      s.push(txt(e(0.35), cy + e(0.07), e(9.3), e(0.24), 'MARKET SNAPSHOT', 8, true, C.slate400, 'l'));
      s.push(txt(e(0.35), cy + e(0.36), e(9.3), e(1.15), trunc(summary, 480), 11, false, C.slate300, 'l'));
      cy += sh + e(0.14);
    }

    // Company overview text
    const overview = (tc.overview || '').trim();
    if (overview) {
      s.push(rect(e(0.2), cy, e(9.6), e(0.28), C.primaryDark));
      s.push(txt(e(0.35), cy + e(0.04), e(9.3), e(0.22), 'COMPANY OVERVIEW', 8, true, C.white, 'l'));
      s.push(txt(e(0.35), cy + e(0.33), e(9.3), e(0.85), trunc(overview, 380), 11, false, C.slate700, 'l'));
      cy += e(1.28);
    }

    // Two columns: Products | Strengths
    const products = (tc.products || []).slice(0, 5);
    const strengths = (tc.strengths || []).slice(0, 5);
    const colW = e(4.7);
    const col2x = e(5.1);
    const rowH = e(1.8);

    if (products.length > 0) {
      s.push(rect(e(0.2), cy, colW, rowH, C.white, C.slate300));
      s.push(rect(e(0.2), cy, colW, e(0.27), C.blue));
      s.push(txt(e(0.35), cy + e(0.04), colW - e(0.2), e(0.21), 'PRODUCTS', 8, true, C.white, 'l'));
      const pt = products.map(p => '\u2022 ' + trunc(p, 90)).join('\n');
      s.push(txt(e(0.35), cy + e(0.33), colW - e(0.3), rowH - e(0.4), pt, 10, false, C.slate700, 'l'));
    }
    if (strengths.length > 0) {
      s.push(rect(col2x, cy, colW, rowH, C.white, C.slate300));
      s.push(rect(col2x, cy, colW, e(0.27), C.amber));
      s.push(txt(col2x + e(0.12), cy + e(0.04), colW - e(0.2), e(0.21), 'STRENGTHS', 8, true, C.white, 'l'));
      const st = strengths.map(s2 => '\u2022 ' + trunc(s2, 90)).join('\n');
      s.push(txt(col2x + e(0.12), cy + e(0.33), colW - e(0.3), rowH - e(0.4), st, 10, false, C.slate700, 'l'));
    }

    // Footer
    s.push(txt(e(0.3), e(7.32), e(9.4), e(0.18), 'Competitive Battlecard AI', 8, false, C.slate500, 'r'));
    return slide(s, C.lightBg);
  }

  /**
   * Build a competitor grid slide (7 panels).
   *
   * Layout (10" × 7.5"):
   *  ┌───────────────────────────────────────────────┐
   *  │            Header (competitor name)            │
   *  ├───────────────────────────────┬───────────────┤
   *  │           Overview            │  Key Diff.    │
   *  ├───────────────┬───────────────┤               │
   *  │    Products   │   Strengths   ├───────────────┤
   *  ├───────────────┼───────────────┤   Potential   │
   *  │    Pricing    │  Weaknesses   │   Landmines   │
   *  └───────────────┴───────────────┴───────────────┘
   */
  function buildCompetitorSlide(competitor) {
    resetSid();
    const s = [];
    const name = (competitor.company_name || 'Competitor').trim();

    const sm = {
      overview:   competitor.overview ? [trunc(competitor.overview, 400)] : [],
      products:   (competitor.products            || []).slice(0, 6).map(v => trunc(v, 120)),
      strengths:  (competitor.strengths           || []).slice(0, 6).map(v => trunc(v, 120)),
      weaknesses: (competitor.weaknesses          || []).slice(0, 6).map(v => trunc(v, 120)),
      pricing:    (competitor.pricing             || []).slice(0, 5).map(v => trunc(v, 120)),
      howWeWin:   (competitor.how_we_win          || []).slice(0, 6).map(v => trunc(v, 120)),
      landmines:  (competitor.potential_landmines || []).slice(0, 6).map(v => trunc(v, 120)),
    };

    // Background
    s.push(rect(0, 0, SLIDE_W, SLIDE_H, C.lightBg));

    // Header bar
    s.push(rect(0, 0, SLIDE_W, e(0.54), C.slate900));
    s.push(txt(e(0.3), e(0.08), e(9.4), e(0.4), name, 20, true, C.white, 'ctr'));

    // ── Layout constants ───────────────────────────────────────────────────────
    const TOP     = e(0.63);
    const BOTTOM  = e(7.3);
    const TOTAL_H = BOTTOM - TOP;
    const GAP     = e(0.09);

    const LEFT_X  = e(0.1);
    const LEFT_W  = e(6.55);
    const RIGHT_X = LEFT_X + LEFT_W + GAP;
    const RIGHT_W = SLIDE_W - RIGHT_X - e(0.1);

    const ROW1_H  = e(2.05);
    const ROW2_H  = e(1.82);
    const ROW3_H  = TOTAL_H - ROW1_H - ROW2_H - GAP * 2;

    const ROW1_Y  = TOP;
    const ROW2_Y  = ROW1_Y + ROW1_H + GAP;
    const ROW3_Y  = ROW2_Y + ROW2_H + GAP;

    const HALF_W  = Math.floor((LEFT_W - GAP) / 2);
    const L_X     = LEFT_X;
    const R_X     = LEFT_X + HALF_W + GAP;

    const RP_H   = Math.floor((TOTAL_H - GAP) / 2);
    const RP1_Y  = TOP;
    const RP2_Y  = TOP + RP_H + GAP;

    // ── Panel helper ───────────────────────────────────────────────────────────
    function panel(px, py, pw, ph, accentColor, label, items) {
      // White card with border
      s.push(rect(px, py, pw, ph, C.white, C.slate300));
      // Colored accent bar at top
      s.push(rect(px, py, pw, e(0.28), accentColor));
      // Panel label
      s.push(txt(px + e(0.1), py + e(0.04), pw - e(0.16), e(0.22), label.toUpperCase(), 8, true, C.white, 'l'));

      if (!items || items.length === 0) return;

      const tx = px + e(0.1);
      const ty = py + e(0.33);
      const tw = pw - e(0.2);
      const th = ph - e(0.38);

      const content = items.length === 1
        ? items[0]
        : items.map(i => '\u2022 ' + i).join('\n');

      let fs = 10;
      if (items.length > 5) fs = 9;
      if (items.length > 8) fs = 8;

      s.push(txt(tx, ty, tw, th, content, fs, false, C.slate700, 'l'));
    }

    panel(LEFT_X, ROW1_Y,  LEFT_W, ROW1_H, C.blue,     'Overview',             sm.overview);
    panel(L_X,    ROW2_Y,  HALF_W, ROW2_H, C.red,      'Products',             sm.products);
    panel(R_X,    ROW2_Y,  HALF_W, ROW2_H, C.amber,    'Strengths',            sm.strengths);
    panel(L_X,    ROW3_Y,  HALF_W, ROW3_H, C.teal,     'Pricing',              sm.pricing);
    panel(R_X,    ROW3_Y,  HALF_W, ROW3_H, C.slate700, 'Weaknesses',           sm.weaknesses);
    panel(RIGHT_X, RP1_Y, RIGHT_W, RP_H,   C.crimson,  'Key Differentiators',  sm.howWeWin);
    panel(RIGHT_X, RP2_Y, RIGHT_W, RP_H,   C.teal2,    'Potential Landmines',  sm.landmines);

    // Footer
    s.push(txt(e(0.3), e(7.32), e(9.4), e(0.18), 'Competitive Battlecard AI', 8, false, C.slate500, 'r'));

    return slide(s);
  }

  // ── OOXML package files ───────────────────────────────────────────────────────

  function contentTypes(n) {
    const overrides = Array.from({ length: n }, (_, i) =>
      `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
    ).join('\n  ');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml"             ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml"              ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/ppt/presProps.xml"                 ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>
  <Override PartName="/ppt/viewProps.xml"                 ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>
  <Override PartName="/ppt/tableStyles.xml"               ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>
  ${overrides}
</Types>`;
  }

  function rootRels() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`;
  }

  function presentationXml(n) {
    const ids = Array.from({ length: n }, (_, i) =>
      `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`
    ).join('\n    ');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
                saveSubsetFonts="1">
  <p:sldMasterIdLst>
    <p:sldMasterId id="2147483648" r:id="rId1"/>
  </p:sldMasterIdLst>
  <p:sldIdLst>
    ${ids}
  </p:sldIdLst>
  <p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}" type="screen4x3"/>
  <p:notesSz cx="${SLIDE_H}" cy="${SLIDE_W}"/>
  <p:defaultTextStyle>
    <a:defPPr><a:defRPr lang="en-US" smtClean="0"/></a:defPPr>
    <a:lvl1pPr marL="0" algn="l"><a:defRPr lang="en-US" smtClean="0"/></a:lvl1pPr>
  </p:defaultTextStyle>
</p:presentation>`;
  }

  function presentationRels(n) {
    const slideRels = Array.from({ length: n }, (_, i) =>
      `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`
    ).join('\n  ');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  ${slideRels}
  <Relationship Id="rId${n + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps"   Target="presProps.xml"/>
  <Relationship Id="rId${n + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps"    Target="viewProps.xml"/>
  <Relationship Id="rId${n + 4}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles"  Target="tableStyles.xml"/>
</Relationships>`;
  }

  function presProps() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentationPr xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:extLst/>
</p:presentationPr>`;
  }

  function viewProps() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:viewPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:normalViewPr>
    <p:restoredLeft sz="15620" autoAdjust="0"/>
    <p:restoredTop sz="94660" autoAdjust="0"/>
  </p:normalViewPr>
  <p:slideViewPr>
    <p:cSldViewPr>
      <p:cViewPr varScale="1">
        <p:scale>
          <a:sx n="64" d="100"/>
          <a:sy n="64" d="100"/>
        </p:scale>
        <p:origin x="-1488" y="-108"/>
      </p:cViewPr>
    </p:cSldViewPr>
  </p:slideViewPr>
  <p:lastView>sldView</p:lastView>
</p:viewPr>`;
  }

  function tableStyles() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:tblStyleLst xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`;
  }

  function theme() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Battlecard">
  <a:themeElements>
    <a:clrScheme name="Battlecard">
      <a:dk1><a:sysClr lastClr="000000" val="windowText"/></a:dk1>
      <a:lt1><a:sysClr lastClr="FFFFFF" val="window"/></a:lt1>
      <a:dk2><a:srgbClr val="1F3864"/></a:dk2>
      <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
      <a:accent1><a:srgbClr val="4F46E5"/></a:accent1>
      <a:accent2><a:srgbClr val="F97316"/></a:accent2>
      <a:accent3><a:srgbClr val="6366F1"/></a:accent3>
      <a:accent4><a:srgbClr val="372FA3"/></a:accent4>
      <a:accent5><a:srgbClr val="64748B"/></a:accent5>
      <a:accent6><a:srgbClr val="334155"/></a:accent6>
      <a:hlink><a:srgbClr val="4F46E5"/></a:hlink>
      <a:folHlink><a:srgbClr val="372FA3"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Battlecard">
      <a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
      <a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Office">
      <a:fillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:gradFill rotWithShape="1">
          <a:gsLst>
            <a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="50000"/><a:satMod val="300000"/></a:schemeClr></a:gs>
            <a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="50000"/><a:satMod val="300000"/></a:schemeClr></a:gs>
          </a:gsLst>
          <a:lin ang="5400000" scaled="0"/>
        </a:gradFill>
        <a:gradFill rotWithShape="1">
          <a:gsLst>
            <a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="93000"/><a:satMod val="150000"/></a:schemeClr></a:gs>
            <a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="63000"/><a:satMod val="120000"/></a:schemeClr></a:gs>
          </a:gsLst>
          <a:lin ang="5400000" scaled="0"/>
        </a:gradFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="6350"  cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
        <a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
        <a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle>
          <a:effectLst>
            <a:outerShdw blurRad="57150" dist="19050" dir="5400000" algn="ctr" rotWithShape="0">
              <a:srgbClr val="000000"><a:alpha val="63000"/></a:srgbClr>
            </a:outerShdw>
          </a:effectLst>
        </a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/><a:satMod val="170000"/></a:schemeClr></a:solidFill>
        <a:gradFill rotWithShape="1">
          <a:gsLst>
            <a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="93000"/><a:satMod val="150000"/></a:schemeClr></a:gs>
            <a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="63000"/><a:satMod val="120000"/></a:schemeClr></a:gs>
          </a:gsLst>
          <a:lin ang="5400000" scaled="0"/>
        </a:gradFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>`;
  }

  function slideMaster() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld>
    <p:bg>
      <p:bgPr>
        <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
        <a:effectLst/>
      </p:bgPr>
    </p:bg>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="${SLIDE_W}" cy="${SLIDE_H}"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="${SLIDE_W}" cy="${SLIDE_H}"/>
        </a:xfrm>
      </p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2"
            accent1="accent1" accent2="accent2" accent3="accent3"
            accent4="accent4" accent5="accent5" accent6="accent6"
            hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst>
    <p:sldLayoutId id="2147483649" r:id="rId1"/>
  </p:sldLayoutIdLst>
  <p:txStyles>
    <p:titleStyle>
      <a:lvl1pPr algn="ctr"><a:defRPr lang="en-US" dirty="0"/></a:lvl1pPr>
    </p:titleStyle>
    <p:bodyStyle>
      <a:lvl1pPr><a:defRPr lang="en-US" dirty="0"/></a:lvl1pPr>
    </p:bodyStyle>
    <p:otherStyle>
      <a:defPPr><a:defRPr lang="en-US" dirty="0"/></a:defPPr>
    </p:otherStyle>
  </p:txStyles>
</p:sldMaster>`;
  }

  function slideMasterRels() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme"       Target="../theme/theme1.xml"/>
</Relationships>`;
  }

  function slideLayout() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             type="blank" preserve="1">
  <p:cSld name="Blank">
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="${SLIDE_W}" cy="${SLIDE_H}"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="${SLIDE_W}" cy="${SLIDE_H}"/>
        </a:xfrm>
      </p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClr/></p:clrMapOvr>
</p:sldLayout>`;
  }

  function slideLayoutRels() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`;
  }

  function slideRels() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`;
  }

  // ── Main generator ────────────────────────────────────────────────────────────

  /**
   * Generates and downloads a PPTX battlecard file.
   *
   * @param {Object} battlecard  - Normalized battlecard object ({ companyName, companyUrl, … })
   * @param {Object} rawData     - Raw backend data ({ target_company, competitors, market_summary })
   */
  function generateBattlecardPpt(battlecard, rawData) {
    const data = rawData || {};
    const companyName = (battlecard && battlecard.companyName)
      || (data.target_company && data.target_company.company_name)
      || 'Company';
    const companyUrl = (battlecard && battlecard.companyUrl)
      || (data.target_company && data.target_company.website)
      || '';
    const dateStr = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });

    // Build slide XML strings
    const slides = [];
    slides.push(buildTitleSlide(companyName + ' — Competitive Battlecard', companyName, companyUrl, dateStr));
    slides.push(buildOverviewSlide(data.target_company || {}, data.market_summary || ''));
    (data.competitors || []).forEach(c => slides.push(buildCompetitorSlide(c)));

    const n = slides.length;
    const enc = new TextEncoder();

    // Collect all ZIP entries
    const files = [];
    const add = (name, xml) => files.push({ name, data: enc.encode(xml) });

    add('[Content_Types].xml',                       contentTypes(n));
    add('_rels/.rels',                               rootRels());
    add('ppt/presentation.xml',                      presentationXml(n));
    add('ppt/_rels/presentation.xml.rels',           presentationRels(n));
    add('ppt/slideMasters/slideMaster1.xml',         slideMaster());
    add('ppt/slideMasters/_rels/slideMaster1.xml.rels', slideMasterRels());
    add('ppt/slideLayouts/slideLayout1.xml',         slideLayout());
    add('ppt/slideLayouts/_rels/slideLayout1.xml.rels', slideLayoutRels());
    add('ppt/theme/theme1.xml',                      theme());
    add('ppt/presProps.xml',                         presProps());
    add('ppt/viewProps.xml',                         viewProps());
    add('ppt/tableStyles.xml',                       tableStyles());

    slides.forEach((xml, i) => {
      add(`ppt/slides/slide${i + 1}.xml`,            xml);
      add(`ppt/slides/_rels/slide${i + 1}.xml.rels`, slideRels());
    });

    // Build ZIP buffer and trigger download
    const zipBuf = buildZip(files);
    const blob = new Blob([zipBuf], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = companyName.replace(/[^a-z0-9]/gi, '_') + '_battlecard.pptx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // Expose globally (browser) and as CommonJS module (Node.js / tests)
  if (typeof window !== 'undefined') window.generateBattlecardPpt = generateBattlecardPpt;
  if (typeof module !== 'undefined' && module.exports) module.exports = { generateBattlecardPpt };
})();
