/**
 * PDF generation utility for battlecards.
 * Uses jsPDF with content-driven panel heights — no text is ever truncated.
 *
 * Layout:
 *   - Title page
 *   - Company overview page (when rawData is available)
 *   - One or more pages per competitor, sections sized to their content
 */

function generateBattlecardPdf(battlecard, rawData) {
  // ── jsPDF availability ────────────────────────────────────────────────────
  if (typeof window.jsPDF === 'undefined' && typeof window.jspdf === 'undefined') {
    alert('PDF generation library not available. Please refresh the page.');
    return;
  }
  const jsPDF = window.jsPDF || (window.jspdf && window.jspdf.jsPDF);
  if (!jsPDF) { alert('PDF generation library not available.'); return; }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ── Page geometry ─────────────────────────────────────────────────────────
  const PW = 210, PH = 297;
  const ML = 12, MR = 12, MT = 14, MB = 16;
  const CW = PW - ML - MR;   // 186 mm usable width

  // ── Typography constants ──────────────────────────────────────────────────
  const BODY_FS   = 9;      // pt — body text
  const LABEL_FS  = 7.5;    // pt — panel header label
  const LABEL_H   = 6.5;    // mm — coloured label strip height
  const LINE_H    = BODY_FS * 0.42;  // mm per line (empirically reliable)
  const PAD_X     = 2.5;    // mm — horizontal inset inside panel
  const PAD_TOP   = 2.5;    // mm — gap between label strip and first text line
  const PAD_BOT   = 3;      // mm — gap below last text line

  // ── Color palette ─────────────────────────────────────────────────────────
  const C = {
    primary:   [79,  70, 229],
    primaryDk: [55,  48, 163],
    primaryLt: [129,140, 248],
    accent:    [249,115,  22],
    white:     [255,255, 255],
    slate900:  [ 15, 23,  42],
    slate800:  [ 30, 41,  59],
    slate700:  [ 51, 65,  85],
    slate600:  [ 71, 85, 105],
    slate500:  [100,116, 139],
    slate400:  [148,163, 184],
    slate300:  [203,213, 225],
    slate200:  [226,232, 240],
    lightBg:   [248,250, 252],
    blue:      [ 37, 99, 235],
    emerald:   [  5,150, 105],
    amber:     [217,119,   6],
    teal:      [ 13,148, 136],
    violet:    [124, 58, 237],
    rose:      [225, 29,  72],
    red:       [220, 38,  38],
  };
  const sf = c => doc.setFillColor(c[0], c[1], c[2]);
  const ss = c => doc.setDrawColor(c[0], c[1], c[2]);
  const sc = c => doc.setTextColor(c[0], c[1], c[2]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  let yPos = MT;

  function addFooter() {
    const n = doc.internal.getNumberOfPages();
    ss(C.slate200); doc.setLineWidth(0.3);
    doc.line(ML, PH - MB + 3, PW - MR, PH - MB + 3);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); sc(C.slate500);
    doc.text('Competitive Battlecard AI', ML, PH - MB + 7);
    doc.text(`Page ${n}`, PW - MR, PH - MB + 7, { align: 'right' });
  }

  function newPage() {
    addFooter();
    doc.addPage();
    yPos = MT;
  }

  // Returns the height (mm) a panel body would need for the given lines.
  function panelBodyHeight(lines) {
    return LABEL_H + PAD_TOP + lines.length * LINE_H + PAD_BOT;
  }

  // Measure lines for a text block within a given width (in mm).
  function measureLines(text, width) {
    if (!text || !text.trim()) return [];
    doc.setFontSize(BODY_FS);
    doc.setFont('helvetica', 'normal');
    return doc.splitTextToSize(text.trim(), width - PAD_X * 2);
  }

  // Draws a single labelled panel box. Height is determined by the supplied lines.
  // Does NOT check for page breaks — call ensureSpace() first.
  function drawPanel(x, y, w, accentColor, label, lines) {
    const h = panelBodyHeight(lines);

    // White background + border
    sf(C.white); ss(C.slate300); doc.setLineWidth(0.25);
    doc.rect(x, y, w, h, 'FD');

    // Coloured header strip
    sf(accentColor); doc.rect(x, y, w, LABEL_H, 'F');
    doc.setFontSize(LABEL_FS); doc.setFont('helvetica', 'bold'); sc(C.white);
    doc.text(label.toUpperCase(), x + PAD_X, y + LABEL_H * 0.76);

    // Body text — all lines, no clipping
    if (lines.length === 0) return h;
    doc.setFontSize(BODY_FS); doc.setFont('helvetica', 'normal'); sc(C.slate700);
    lines.forEach((line, i) => {
      doc.text(line, x + PAD_X, y + LABEL_H + PAD_TOP + (i + 0.82) * LINE_H);
    });

    return h;
  }

  // Ensure at least `need` mm remain on the page (excluding footer), else new page.
  function ensureSpace(need) {
    const avail = PH - MB - 8 - yPos;
    if (avail < need) newPage();
  }

  // Draw a full-width panel, advancing yPos.
  function addFullPanel(accentColor, label, text, gap) {
    const lines = measureLines(text, CW);
    if (lines.length === 0) return;
    const h = panelBodyHeight(lines);
    ensureSpace(h);
    drawPanel(ML, yPos, CW, accentColor, label, lines);
    yPos += h + (gap !== undefined ? gap : 3);
  }

  // Draw a two-column panel row, advancing yPos.
  // Both panels share the same top y and row height (the taller of the two).
  function addTwoColRow(
    leftColor, leftLabel, leftText,
    rightColor, rightLabel, rightText,
    gap
  ) {
    const COL_GAP = 4;
    const COL_W   = (CW - COL_GAP) / 2;

    const leftLines  = measureLines(leftText,  COL_W);
    const rightLines = measureLines(rightText, COL_W);

    if (leftLines.length === 0 && rightLines.length === 0) return;

    // Pad the shorter column to match the taller one
    const leftH  = panelBodyHeight(leftLines);
    const rightH = panelBodyHeight(rightLines);
    const rowH   = Math.max(leftH, rightH);

    ensureSpace(rowH);

    if (leftLines.length > 0)  drawPanelFixed(ML,              yPos, COL_W, rowH, leftColor,  leftLabel,  leftLines);
    if (rightLines.length > 0) drawPanelFixed(ML + COL_W + COL_GAP, yPos, COL_W, rowH, rightColor, rightLabel, rightLines);

    yPos += rowH + (gap !== undefined ? gap : 3);
  }

  // Like drawPanel but with an explicit height (for matching two columns).
  function drawPanelFixed(x, y, w, h, accentColor, label, lines) {
    sf(C.white); ss(C.slate300); doc.setLineWidth(0.25);
    doc.rect(x, y, w, h, 'FD');

    sf(accentColor); doc.rect(x, y, w, LABEL_H, 'F');
    doc.setFontSize(LABEL_FS); doc.setFont('helvetica', 'bold'); sc(C.white);
    doc.text(label.toUpperCase(), x + PAD_X, y + LABEL_H * 0.76);

    if (lines.length === 0) return;
    doc.setFontSize(BODY_FS); doc.setFont('helvetica', 'normal'); sc(C.slate700);
    lines.forEach((line, i) => {
      doc.text(line, x + PAD_X, y + LABEL_H + PAD_TOP + (i + 0.82) * LINE_H);
    });
  }

  // Format an array of strings as a bulleted block.
  function bullets(arr) {
    return (arr || []).map(s => '•  ' + s).join('\n');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TITLE PAGE
  // ═══════════════════════════════════════════════════════════════════════
  const companyName = battlecard.companyName || 'Company';
  const companyUrl  = battlecard.companyUrl  || '';
  const dateStr     = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  sf(C.primaryDk); doc.rect(0, 0, PW, 56, 'F');
  sf(C.accent);    doc.rect(0, 0, 4.5, 56, 'F');

  doc.setFontSize(26); doc.setFont('helvetica', 'bold'); sc(C.white);
  const nameLines = doc.splitTextToSize(companyName, CW - 8);
  nameLines.forEach((l, i) => doc.text(l, ML + 7, 20 + i * 10));

  doc.setFontSize(12); doc.setFont('helvetica', 'normal'); sc([165, 180, 252]);
  doc.text('Competitive Battlecard', ML + 7, 20 + nameLines.length * 10 + 3);

  ss(C.primaryLt); doc.setLineWidth(0.8);
  doc.line(ML + 7, 53, ML + 42, 53);

  yPos = 64;
  if (companyUrl) {
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); sc(C.slate700);
    doc.text('Website:  ' + companyUrl, ML, yPos);
    yPos += 7;
  }
  doc.setFontSize(9.5); sc(C.slate500);
  doc.text('Generated:  ' + dateStr, ML, yPos);
  yPos += 12;

  // Market summary on title page
  const marketSummary = (rawData && rawData.market_summary || '').trim();
  if (marketSummary) {
    sf(C.slate900); doc.rect(ML, yPos, CW, 6.5, 'F');
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); sc(C.white);
    doc.text('MARKET SNAPSHOT', ML + PAD_X, yPos + 4.6);
    yPos += 8;

    doc.setFontSize(9.5); doc.setFont('helvetica', 'normal'); sc(C.slate700);
    const mLines = doc.splitTextToSize(marketSummary, CW - 4);
    const maxMLines = Math.floor((PH - MB - 10 - yPos) / (9.5 * 0.42));
    mLines.slice(0, maxMLines).forEach((l, i) => {
      doc.text(l, ML, yPos + (i + 0.9) * (9.5 * 0.42));
    });
  }

  addFooter();

  // ═══════════════════════════════════════════════════════════════════════
  // COMPANY OVERVIEW PAGE
  // ═══════════════════════════════════════════════════════════════════════
  if (rawData && rawData.target_company) {
    const tc = rawData.target_company;
    doc.addPage(); yPos = MT;

    // Page header bar
    sf(C.primary); doc.rect(0, 0, PW, 11, 'F');
    sf(C.accent);  doc.rect(0, 0, 4.5, 11, 'F');
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); sc(C.white);
    doc.text('Company Overview — ' + companyName, ML + 5, 7.5);
    yPos = 16;

    if ((tc.overview || '').trim())
      addFullPanel(C.primaryDk,  'Company Overview',        tc.overview,                4);

    addTwoColRow(
      C.blue,    'Products & Capabilities', bullets(tc.products  || []),
      C.amber,   'Company Strengths',       bullets(tc.strengths || []),
      4
    );

    addFooter();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // COMPETITOR PAGES
  // ═══════════════════════════════════════════════════════════════════════
  if (rawData && rawData.competitors && rawData.competitors.length > 0) {

    rawData.competitors.forEach(comp => {
      doc.addPage(); yPos = MT;

      const cName = (comp.company_name || 'Competitor').trim();

      // Competitor name header
      sf(C.slate900); doc.rect(0, 0, PW, 13, 'F');
      sf(C.primary);  doc.rect(0, 0, 4.5, 13, 'F');
      doc.setFontSize(14); doc.setFont('helvetica', 'bold'); sc(C.white);
      doc.text(cName, PW / 2, 8.5, { align: 'center' });

      if (comp.website) {
        doc.setFontSize(8); doc.setFont('helvetica', 'normal'); sc(C.slate400);
        doc.text(comp.website, PW / 2, 12.2, { align: 'center' });
      }
      yPos = 17;

      // Overview — full width
      if ((comp.overview || '').trim())
        addFullPanel(C.blue,    'Overview',                  comp.overview,              4);

      // Products | Strengths
      addTwoColRow(
        C.violet,  'Products',                  bullets(comp.products   || []),
        C.emerald, 'Strengths',                 bullets(comp.strengths  || []),
        3
      );

      // Pricing | Weaknesses
      addTwoColRow(
        C.teal,    'Pricing',                   bullets(comp.pricing    || []),
        C.rose,    'Weaknesses',                bullets(comp.weaknesses || []),
        3
      );

      // Key Differentiators | Potential Landmines
      addTwoColRow(
        C.amber,   'Key Differentiators — Why We Win', bullets(comp.how_we_win          || []),
        C.red,     'Potential Landmines',              bullets(comp.potential_landmines || []),
        3
      );

      addFooter();
    });

  } else {
    // ═════════════════════════════════════════════════════════════════════
    // FALLBACK: render from normalised section list (saved battlecards)
    // ═════════════════════════════════════════════════════════════════════
    let lastCompIdx = null;

    const addSecHeader = (title) => {
      ensureSpace(20);
      yPos += 4;
      const lines = doc.splitTextToSize(title, CW - 8);
      const bh = Math.max(8, lines.length * 6 + 3);
      sf(C.primaryDk); doc.rect(ML, yPos, CW, bh, 'F');
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); sc(C.white);
      lines.forEach((l, i) => doc.text(l, ML + 3, yPos + 6 + i * 6));
      yPos += bh + 4;
    };

    const addBodyText = (text) => {
      if (!text || !text.trim()) return;
      const lines = doc.splitTextToSize(text, CW - 2);
      lines.forEach(line => {
        ensureSpace(LINE_H + 2);
        doc.setFontSize(BODY_FS); doc.setFont('helvetica', 'normal'); sc(C.slate700);
        doc.text(line, ML, yPos);
        yPos += LINE_H + 0.8;
      });
      yPos += 3;
    };

    (battlecard.sections || []).forEach(section => {
      if (!section.body || !section.body.trim()) return;

      const compMatch = section.id && section.id.match(/^competitor_(\d+)/);
      const isHdr     = section.id && section.id.endsWith('_header');

      if (compMatch && lastCompIdx !== compMatch[1]) {
        lastCompIdx = compMatch[1];
        newPage();

        const cName = section.title.replace(/^Competitor:\s*/i, '').replace(/ - .+$/i, '');
        sf(C.slate900); doc.rect(0, 0, PW, 13, 'F');
        doc.setFontSize(14); doc.setFont('helvetica', 'bold'); sc(C.white);
        doc.text(cName, PW / 2, 9, { align: 'center' });
        yPos = 18;

        if (isHdr && section.body.startsWith('Website:')) {
          doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); sc(C.slate500);
          doc.text(section.body, ML, yPos);
          yPos += 6;
          return;
        }
      }

      let title = section.title;
      const pfx = title.match(/^.+ - (.+)$/);
      if (pfx && section.id && section.id.startsWith('competitor_')) title = pfx[1];

      addSecHeader(title);
      addBodyText(section.body);
    });

    addFooter();
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const filename = (battlecard.companyName || 'battlecard')
    .replace(/[^a-z0-9]/gi, '_') + '_battlecard.pdf';
  doc.save(filename);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generateBattlecardPdf };
}
