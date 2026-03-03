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
 * 3. Competitive landscape
 * 4+. One slide per competitor
 */

(function () {
  'use strict';

  // ── CRC-32 ──────────────────────────────────────────────────────────────────
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

  // ── Minimal ZIP builder (Store / no compression) ─────────────────────────────
  function buildZip(files) {
    // files: Array<{ name: string, data: Uint8Array }>
    const enc = new TextEncoder();
    const localParts = [];
    const cdEntries = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = enc.encode(file.name);
      const data = file.data;
      const crc = crc32(data);
      const size = data.length;

      // Local file header (30 bytes) + filename + data
      const lhBuf = new ArrayBuffer(30 + nameBytes.length);
      const lh = new DataView(lhBuf);
      lh.setUint32(0,  0x04034B50, true); // Local file header signature
      lh.setUint16(4,  20,         true); // Version needed to extract
      lh.setUint16(6,  0,          true); // General purpose bit flag
      lh.setUint16(8,  0,          true); // Compression method: Store
      lh.setUint16(10, 0,          true); // Last mod file time
      lh.setUint16(12, 0,          true); // Last mod file date
      lh.setUint32(14, crc,        true); // CRC-32
      lh.setUint32(18, size,       true); // Compressed size
      lh.setUint32(22, size,       true); // Uncompressed size
      lh.setUint16(26, nameBytes.length, true); // File name length
      lh.setUint16(28, 0,          true); // Extra field length
      new Uint8Array(lhBuf, 30).set(nameBytes);

      localParts.push(new Uint8Array(lhBuf));
      localParts.push(data);

      // Central directory entry (46 bytes) + filename
      const cdBuf = new ArrayBuffer(46 + nameBytes.length);
      const cd = new DataView(cdBuf);
      cd.setUint32(0,  0x02014B50, true); // Central directory signature
      cd.setUint16(4,  0x0314,     true); // Version made by (Unix, v20)
      cd.setUint16(6,  20,         true); // Version needed
      cd.setUint16(8,  0,          true); // Flags
      cd.setUint16(10, 0,          true); // Compression method
      cd.setUint16(12, 0,          true); // Mod time
      cd.setUint16(14, 0,          true); // Mod date
      cd.setUint32(16, crc,        true); // CRC-32
      cd.setUint32(20, size,       true); // Compressed size
      cd.setUint32(24, size,       true); // Uncompressed size
      cd.setUint16(28, nameBytes.length, true); // File name length
      cd.setUint16(30, 0,          true); // Extra field length
      cd.setUint16(32, 0,          true); // File comment length
      cd.setUint16(34, 0,          true); // Disk number start
      cd.setUint16(36, 0,          true); // Internal attributes
      cd.setUint32(38, 0,          true); // External attributes
      cd.setUint32(42, offset,     true); // Relative offset of local header
      new Uint8Array(cdBuf, 46).set(nameBytes);
      cdEntries.push(new Uint8Array(cdBuf));

      offset += 30 + nameBytes.length + size;
    }

    // Central directory offset and size
    const cdOffset = offset;
    const cdSize = cdEntries.reduce((s, e) => s + e.length, 0);

    // End of central directory record (22 bytes)
    const eocd = new ArrayBuffer(22);
    const ev = new DataView(eocd);
    ev.setUint32(0,  0x06054B50,    true); // Signature
    ev.setUint16(4,  0,             true); // Disk number
    ev.setUint16(6,  0,             true); // Start disk
    ev.setUint16(8,  files.length,  true); // Entries on disk
    ev.setUint16(10, files.length,  true); // Total entries
    ev.setUint32(12, cdSize,        true); // Central directory size
    ev.setUint32(16, cdOffset,      true); // Central directory offset
    ev.setUint16(20, 0,             true); // Comment length

    const parts = [...localParts, ...cdEntries, new Uint8Array(eocd)];
    const total = parts.reduce((s, p) => s + p.length, 0);
    const result = new Uint8Array(total);
    let pos = 0;
    for (const p of parts) { result.set(p, pos); pos += p.length; }
    return result;
  }

  // ── EMU helpers ──────────────────────────────────────────────────────────────
  const EMU_PER_INCH = 914400;
  const SLIDE_W = 9144000;   // 10 inches
  const SLIDE_H = 6858000;   // 7.5 inches
  function emu(inches) { return Math.round(inches * EMU_PER_INCH); }

  // ── XML escape ───────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // ── Text layout helpers ──────────────────────────────────────────────────────
  // Truncate a string to maxLen characters, appending "…" if cut.
  function truncText(s, maxLen) {
    s = String(s == null ? '' : s);
    return s.length <= maxLen ? s : s.slice(0, maxLen - 1) + '\u2026';
  }

  /**
   * Estimate the rendered height in EMU for a block of text.
   * Uses a conservative character-width model (Arial proportional font).
   * @param {string[]} lines  - array of text strings (each will be measured)
   * @param {number} fontPt   - font size in points
   * @param {number} widthIn  - text box width in inches
   * @returns {number} height in EMU
   */
  function calcH(lines, fontPt, widthIn) {
    // Conservative: assume avg char ≈ 0.58 × fontPt in points width
    const charsPerLine = Math.max(1, Math.floor(widthIn * 72 / (fontPt * 0.58)));
    let totalLines = 0;
    for (const line of lines) {
      totalLines += Math.max(1, Math.ceil(String(line).length / charsPerLine));
    }
    // 1.55× line spacing gives breathing room between wrapped lines
    return emu(totalLines * fontPt * 1.55 / 72);
  }

  // ── Color palette ────────────────────────────────────────────────────────────
  const C = {
    primaryDark:  '372FA3',
    primary:      '4F46E5',
    primaryLight: '6366F1',
    accent:       'F97316',
    white:        'FFFFFF',
    darkBg2:      '1E293B',
    slate900:     '0F172A',
    slate700:     '334155',
    slate600:     '475569',
    slate500:     '64748B',
    slate400:     '94A3B8',
    slate300:     'CBD5E1',
  };

  // ── Shape helpers ─────────────────────────────────────────────────────────────
  let _shapeId = 2;
  function nextId() { return _shapeId++; }

  function makeRect(x, y, w, h, fillColor) {
    const id = nextId();
    return `<p:sp>
      <p:nvSpPr>
        <p:cNvPr id="${id}" name="rect${id}"/>
        <p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
        <p:nvPr/>
      </p:nvSpPr>
      <p:spPr>
        <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        <a:solidFill><a:srgbClr val="${fillColor}"/></a:solidFill>
        <a:ln><a:noFill/></a:ln>
      </p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>
    </p:sp>`;
  }

  /**
   * @param {number} x, y, w, h  - position/size in EMU
   * @param {string} text         - content (newlines become paragraphs)
   * @param {number} sz           - font size in POINTS
   * @param {boolean} bold
   * @param {string} color        - hex without #
   * @param {string} align        - 'l' | 'ctr' | 'r'
   * @param {boolean} italic
   */
  function makeText(x, y, w, h, text, sz, bold, color, align, italic) {
    const id = nextId();
    align = align || 'l';
    const lines = String(text == null ? '' : text).split('\n');
    const paras = lines.map(line => `<a:p>
          <a:pPr algn="${align}"/>
          <a:r>
            <a:rPr lang="en-US" sz="${sz * 100}" b="${bold ? 1 : 0}" i="${italic ? 1 : 0}" dirty="0">
              <a:solidFill><a:srgbClr val="${color}"/></a:solidFill>
              <a:latin typeface="Arial"/>
            </a:rPr>
            <a:t>${esc(line)}</a:t>
          </a:r>
        </a:p>`).join('\n');

    return `<p:sp>
      <p:nvSpPr>
        <p:cNvPr id="${id}" name="txt${id}"/>
        <p:cNvSpPr txBox="1"><a:spLocks noGrp="1"/></p:cNvSpPr>
        <p:nvPr/>
      </p:nvSpPr>
      <p:spPr>
        <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        <a:noFill/>
      </p:spPr>
      <p:txBody>
        <a:bodyPr wrap="square" lIns="0" rIns="0" tIns="0" bIns="0">
          <a:normAutofit/>
        </a:bodyPr>
        <a:lstStyle/>
        ${paras}
      </p:txBody>
    </p:sp>`;
  }

  // ── Slide XML wrapper ─────────────────────────────────────────────────────────
  function wrapSlide(shapes, bgColor) {
    const bg = bgColor
      ? `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${bgColor}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`
      : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
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

  // ── Individual slide builders ─────────────────────────────────────────────────
  function buildTitleSlide(title, subtitle, companyUrl, dateStr) {
    _shapeId = 2;
    const shapes = [];
    // Split background: dark indigo top 60%, dark slate bottom 40%
    shapes.push(makeRect(0, 0, SLIDE_W, Math.round(SLIDE_H * 0.60), C.primaryDark));
    shapes.push(makeRect(0, Math.round(SLIDE_H * 0.60), SLIDE_W, Math.round(SLIDE_H * 0.40), C.darkBg2));
    // Title
    shapes.push(makeText(emu(0.5), emu(1.5), emu(9), emu(1.2), title, 48, true, C.white, 'l'));
    // Subtitle (company name)
    shapes.push(makeText(emu(0.5), emu(2.8), emu(9), emu(0.8), subtitle, 32, true, C.primaryLight, 'l'));
    // Accent line
    shapes.push(makeRect(emu(0.5), emu(3.7), emu(2), Math.round(0.06 * EMU_PER_INCH), C.primaryLight));

    let detailY = emu(4.2);
    if (companyUrl) {
      shapes.push(makeText(emu(0.5), detailY, emu(9), emu(0.35), `Website: ${companyUrl}`, 12, false, C.slate300, 'l'));
      detailY += emu(0.45);
    }
    shapes.push(makeText(emu(0.5), detailY, emu(9), emu(0.35), `Generated: ${dateStr}`, 12, false, C.slate400, 'l'));
    shapes.push(makeText(emu(0.5), emu(6.8), emu(9), emu(0.3), 'Created with Competitive Battlecard AI', 11, false, C.accent, 'l', true));

    // Footer
    slide.addText('Competitive Battlecard AI', {
      x: 0.5, y: 6.85, w: 9, h: 0.25,
      fontSize: 10,
      color: colors.slate500,
      fontFace: 'Arial',
      align: 'right'
    });
  };

  // Helper to add a competitor slide using a 7-panel grid layout.
  //
  // Layout (10" × 7.5" slide):
  //
  //  ┌─────────────────────────────────────────────┐
  //  │           Header (competitor name)           │
  //  ├─────────────────────────────┬───────────────┤
  //  │         Overview            │  Key Diff.    │
  //  ├──────────────┬──────────────┤               │
  //  │   Products   │  Strengths   ├───────────────┤
  //  ├──────────────┼──────────────┤  Potential    │
  //  │   Pricing    │  Weaknesses  │  Landmines    │
  //  └──────────────┴──────────────┴───────────────┘
  //
  // sectionMap keys: overview, products, strengths, weaknesses,
  //                  pricing, howWeWin, landmines  (all arrays of strings)
  const addCompetitorSlide = (competitorName, sectionMap) => {
    const slide = pres.addSlide();
    slide.background = { color: 'F1F5F9' };

    // ── Header ────────────────────────────────────────────────────────────
    slide.addShape(pres.ShapeType.rect, {
      x: 0, y: 0, w: '100%', h: 0.55,
      fill: { color: colors.slate900 }
    });
    slide.addText(competitorName, {
      x: 0.3, y: 0.08, w: 9.4, h: 0.4,
      fontSize: 22, bold: true, color: colors.white,
      fontFace: 'Arial', align: 'center'
    });

    // ── Layout constants ──────────────────────────────────────────────────
    const TOP        = 0.65;
    const BOTTOM     = 7.28;
    const TOTAL_H    = BOTTOM - TOP;   // 6.63"
    const GAP        = 0.1;

    const LEFT_X     = 0.1;
    const LEFT_W     = 6.55;
    const RIGHT_X    = LEFT_X + LEFT_W + GAP;
    const RIGHT_W    = 10 - RIGHT_X - 0.1;

    // Left column: 3 rows
    const ROW1_H     = 2.1;
    const ROW2_H     = 1.85;
    const ROW3_H     = TOTAL_H - ROW1_H - ROW2_H - GAP * 2;

    const ROW1_Y     = TOP;
    const ROW2_Y     = ROW1_Y + ROW1_H + GAP;
    const ROW3_Y     = ROW2_Y + ROW2_H + GAP;

    const HALF_W     = (LEFT_W - GAP) / 2;
    const L_HALF_X   = LEFT_X;
    const R_HALF_X   = LEFT_X + HALF_W + GAP;

    // Right column: 2 equal panels
    const RIGHT_P_H  = (TOTAL_H - GAP) / 2;
    const RIGHT_R1_Y = TOP;
    const RIGHT_R2_Y = TOP + RIGHT_P_H + GAP;

    // ── Panel helper ──────────────────────────────────────────────────────
    // Draws a white card with a coloured accent bar at the top.
    // items: string[]  — rendered as a paragraph (1 item) or bullet list (2+)
    const addPanel = (x, y, w, h, accentHex, title, items) => {
      // Card background
      slide.addShape(pres.ShapeType.rect, {
        x, y, w, h,
        fill: { color: colors.white },
        line: { color: colors.slate300, width: 0.75 }
      });
      // Coloured top bar
      slide.addShape(pres.ShapeType.rect, {
        x, y, w, h: 0.3,
        fill: { color: accentHex }
      });
      // Section title inside bar
      slide.addText(title.toUpperCase(), {
        x: x + 0.12, y: y + 0.05, w: w - 0.2, h: 0.22,
        fontSize: 9, bold: true, color: colors.white, fontFace: 'Arial'
      });

      if (!items || items.length === 0) return;

      const cx = x + 0.12;
      const cy = y + 0.36;
      const cw = w - 0.24;
      const ch = h - 0.42;

      // Single item → paragraph; multiple → bullet list
      const text = items.length === 1
        ? items[0]
        : items.map(i => `• ${i}`).join('\n');

      // Scale font down gently for longer lists so text fits
      let fontSize = 10;
      if (items.length > 5) fontSize = 9;
      if (items.length > 8) fontSize = 8;
      if (items.length === 1) fontSize = 10; // paragraph stays readable

      slide.addText(text, {
        x: cx, y: cy, w: cw, h: ch,
        fontSize,
        color: colors.slate700,
        fontFace: 'Arial',
        valign: 'top',
        wrap: true,
        shrinkText: true
      });
    };

    // ── Draw the 7 panels ─────────────────────────────────────────────────
    addPanel(LEFT_X,   ROW1_Y,     LEFT_W,  ROW1_H,  '3B82F6', 'Overview',            sectionMap.overview);
    addPanel(L_HALF_X, ROW2_Y,     HALF_W,  ROW2_H,  'EF4444', 'Products',             sectionMap.products);
    addPanel(R_HALF_X, ROW2_Y,     HALF_W,  ROW2_H,  'F59E0B', 'Strengths',            sectionMap.strengths);
    addPanel(L_HALF_X, ROW3_Y,     HALF_W,  ROW3_H,  '14B8A6', 'Pricing',              sectionMap.pricing);
    addPanel(R_HALF_X, ROW3_Y,     HALF_W,  ROW3_H,  '334155', 'Weaknesses',           sectionMap.weaknesses);
    addPanel(RIGHT_X,  RIGHT_R1_Y, RIGHT_W, RIGHT_P_H, 'DC2626', 'Key Differentiators', sectionMap.howWeWin);
    addPanel(RIGHT_X,  RIGHT_R2_Y, RIGHT_W, RIGHT_P_H, '0D9488', 'Potential Landmines', sectionMap.landmines);

    // Footer
    slide.addText('Competitive Battlecard AI', {
      x: 0.3, y: 7.3, w: 9.4, h: 0.18,
      fontSize: 8, color: colors.slate500,
      fontFace: 'Arial', align: 'right'
    });
  };

  // ── OOXML package files ───────────────────────────────────────────────────────
  function makeContentTypes(slideCount) {
    const slides = Array.from({ length: slideCount }, (_, i) =>
      `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
    ).join('\n  ');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>
  <Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>
  <Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>
  ${slides}
</Types>`;
  }

  function makeRootRels() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`;
  }

  function makePresentationXml(slideCount) {
    const sldIds = Array.from({ length: slideCount }, (_, i) =>
      `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`
    ).join('\n    ');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldMasterIdLst>
    <p:sldMasterId id="2147483648" r:id="rId1"/>
  </p:sldMasterIdLst>
  <p:sldIdLst>
    ${sldIds}
  </p:sldIdLst>
  <p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}" type="screen4x3"/>
  <p:notesSz cx="${SLIDE_H}" cy="${SLIDE_W}"/>
  <p:defaultTextStyle>
    <a:defPPr><a:defRPr lang="en-US" smtClean="0"/></a:defPPr>
    <a:lvl1pPr marL="0" algn="l"><a:defRPr lang="en-US" smtClean="0"/></a:lvl1pPr>
  </p:defaultTextStyle>
</p:presentation>`;
  }

  function makePresentationRels(slideCount) {
    const slideRels = Array.from({ length: slideCount }, (_, i) =>
      `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`
    ).join('\n  ');
    // rId1 = slideMaster, rId2..rId(n+1) = slides,
    // rId(n+2) = presProps, rId(n+3) = viewProps, rId(n+4) = tableStyles
    const n = slideCount;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  ${slideRels}
  <Relationship Id="rId${n + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/>
  <Relationship Id="rId${n + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/>
  <Relationship Id="rId${n + 4}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/>
</Relationships>`;
  }

  function makePresProps() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentationPr xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:extLst/>
</p:presentationPr>`;
  }

  function makeViewProps() {
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

  function makeTableStyles() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:tblStyleLst xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`;
  }

  function makeTheme() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Battlecard Theme">
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
        <a:gradFill rotWithShape="1"><a:gsLst>
          <a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="50000"/><a:satMod val="300000"/></a:schemeClr></a:gs>
          <a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="50000"/><a:satMod val="300000"/></a:schemeClr></a:gs>
        </a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>
        <a:gradFill rotWithShape="1"><a:gsLst>
          <a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="93000"/><a:satMod val="150000"/></a:schemeClr></a:gs>
          <a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="63000"/><a:satMod val="120000"/></a:schemeClr></a:gs>
        </a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
        <a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
        <a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst>
          <a:outerShdw blurRad="57150" dist="19050" dir="5400000" algn="ctr" rotWithShape="0">
            <a:srgbClr val="000000"><a:alpha val="63000"/></a:srgbClr>
          </a:outerShdw>
        </a:effectLst></a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/><a:satMod val="170000"/></a:schemeClr></a:solidFill>
        <a:gradFill rotWithShape="1"><a:gsLst>
          <a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="93000"/><a:satMod val="150000"/></a:schemeClr></a:gs>
          <a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="63000"/><a:satMod val="120000"/></a:schemeClr></a:gs>
        </a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>`;
  }

  function makeSlideMaster() {
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
          <a:off x="0" y="0"/><a:ext cx="${SLIDE_W}" cy="${SLIDE_H}"/>
          <a:chOff x="0" y="0"/><a:chExt cx="${SLIDE_W}" cy="${SLIDE_H}"/>
        </a:xfrm>
      </p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2"
            accent1="accent1" accent2="accent2" accent3="accent3"
            accent4="accent4" accent5="accent5" accent6="accent6"
            hlink="hlink" folHlink="folHlink"/>
  <p:txStyles>
    <p:titleStyle><a:lvl1pPr algn="ctr"><a:defRPr lang="en-US" dirty="0"/></a:lvl1pPr></p:titleStyle>
    <p:bodyStyle><a:lvl1pPr><a:defRPr lang="en-US" dirty="0"/></a:lvl1pPr></p:bodyStyle>
    <p:otherStyle><a:defPPr><a:defRPr lang="en-US" dirty="0"/></a:defPPr></p:otherStyle>
  </p:txStyles>
</p:sldMaster>`;
  }

  function makeSlideMasterRels() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`;
  }

  function makeSlideLayout() {
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
          <a:off x="0" y="0"/><a:ext cx="${SLIDE_W}" cy="${SLIDE_H}"/>
          <a:chOff x="0" y="0"/><a:chExt cx="${SLIDE_W}" cy="${SLIDE_H}"/>
        </a:xfrm>
      </p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClr/></p:clrMapOvr>
</p:sldLayout>`;
  }

  function makeSlideLayoutRels() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`;
  }

  function makeSlideRels() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`;
  }

  // Slides 4+: Each Competitor (one grid-layout slide per competitor)
  if (data.competitors && data.competitors.length > 0) {
    data.competitors.forEach((competitor) => {
      const sectionMap = {
        overview:  competitor.overview ? [competitor.overview] : [],
        products:  (competitor.products          || []).slice(0, 6),
        strengths: (competitor.strengths         || []).slice(0, 6),
        weaknesses:(competitor.weaknesses        || []).slice(0, 6),
        pricing:   (competitor.pricing           || []).slice(0, 5),
        howWeWin:  (competitor.how_we_win        || []).slice(0, 6),
        landmines: (competitor.potential_landmines || []).slice(0, 6),
      };

      addCompetitorSlide(competitor.company_name, sectionMap);
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${companyName.replace(/[^a-z0-9]/gi, '_')}_battlecard.pptx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // Expose globally (browser) and as CommonJS module (Node.js / tests)
  if (typeof window !== 'undefined') window.generateBattlecardPpt = generateBattlecardPpt;
  if (typeof module !== 'undefined' && module.exports) module.exports = { generateBattlecardPpt };
})();
