/**
 * PDF generation utility for battlecards.
 * Uses jsPDF with a grid-based layout to ensure no content is ever cut off.
 *
 * When rawData is supplied (same object as the PPT generator receives), each
 * competitor gets a full-page grid layout.  When rawData is absent we fall
 * back to the section-list flow so the function always produces output.
 */

function generateBattlecardPdf(battlecard, rawData) {
  // ── jsPDF availability check ─────────────────────────────────────────────
  if (typeof window.jsPDF === 'undefined' && typeof window.jspdf === 'undefined') {
    alert('PDF generation library not available. Please refresh the page.');
    return;
  }
  const jsPDF = window.jsPDF || (window.jspdf && window.jspdf.jsPDF);
  if (!jsPDF) {
    alert('PDF generation library not available. Please refresh the page.');
    return;
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ── Page geometry ─────────────────────────────────────────────────────────
  const PW = 210, PH = 297;
  const ML = 12, MR = 12, MT = 12, MB = 12;
  const CW = PW - ML - MR;  // 186mm

  // ── Color palette (RGB arrays) ────────────────────────────────────────────
  const COL = {
    primary:    [79,  70,  229],
    primaryDk:  [55,  48,  163],
    primaryLt:  [129, 140, 248],
    accent:     [249, 115,  22],
    white:      [255, 255, 255],
    slate900:   [ 15,  23,  42],
    slate800:   [ 30,  41,  59],
    slate700:   [ 51,  65,  85],
    slate600:   [ 71,  85, 105],
    slate500:   [100, 116, 139],
    slate400:   [148, 163, 184],
    slate300:   [203, 213, 225],
    slate200:   [226, 232, 240],
    lightBg:    [248, 250, 252],
    blue:       [ 37,  99, 235],
    emerald:    [  5, 150, 105],
    amber:      [217, 119,   6],
    teal:       [ 13, 148, 136],
    violet:     [124,  58, 237],
    rose:       [225,  29,  72],
    red:        [220,  38,  38],
  };

  function setFill(c)   { doc.setFillColor(c[0], c[1], c[2]); }
  function setStroke(c) { doc.setDrawColor(c[0], c[1], c[2]); }
  function setColor(c)  { doc.setTextColor(c[0], c[1], c[2]); }

  function trunc(s, n) {
    s = String(s == null ? '' : s).trim();
    return s.length <= n ? s : s.slice(0, n - 1) + '…';
  }

  // ── Text clipping helper ──────────────────────────────────────────────────
  // Renders text lines inside a fixed box, clipping to available height.
  // Never lets text overflow beyond (x+w, y+h).
  function renderClipped(textOrLines, x, y, w, h, fontSize, color) {
    doc.setFontSize(fontSize);
    setColor(color);
    const LINE_H = fontSize * 0.42;  // mm per line (empirically reliable)
    const maxLines = Math.max(1, Math.floor(h / LINE_H));

    let lines = Array.isArray(textOrLines)
      ? textOrLines
      : doc.splitTextToSize(textOrLines, w - 2);

    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      // Ellipsis on last visible line
      const last = lines[maxLines - 1];
      lines[maxLines - 1] = last.replace(/\s+\S*$/, '').slice(0, -1) + '…';
    }

    lines.forEach((line, i) => {
      doc.text(line, x, y + (i + 0.85) * LINE_H);
    });
  }

  // ── Panel: colored-header box with clipped content ───────────────────────
  function drawPanel(x, y, w, h, headerColor, label, content, fontSize) {
    const LABEL_H = 7;
    const PAD_X   = 2.5;

    // White background + border
    setFill(COL.white);
    setStroke(COL.slate300);
    doc.setLineWidth(0.25);
    doc.rect(x, y, w, h, 'FD');

    // Coloured header strip
    setFill(headerColor);
    doc.rect(x, y, w, LABEL_H, 'F');

    // Label text
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    setColor(COL.white);
    doc.text(label.toUpperCase(), x + PAD_X, y + LABEL_H * 0.74);

    // Body content
    if (!content || !content.trim()) return;
    doc.setFont('helvetica', 'normal');
    renderClipped(content, x + PAD_X, y + LABEL_H + 2, w - PAD_X * 2, h - LABEL_H - 3, fontSize || 8.5, COL.slate700);
  }

  // ── Footer on each page ───────────────────────────────────────────────────
  function addFooter() {
    const pageNum = doc.internal.getNumberOfPages();
    setStroke(COL.slate200);
    doc.setLineWidth(0.3);
    doc.line(ML, PH - MB + 2, PW - MR, PH - MB + 2);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    setColor(COL.slate500);
    doc.text('Competitive Battlecard AI', ML, PH - MB + 6);
    doc.text(`Page ${pageNum}`, PW - MR, PH - MB + 6, { align: 'right' });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // TITLE PAGE
  // ═════════════════════════════════════════════════════════════════════════
  const companyName = battlecard.companyName || 'Company';
  const companyUrl  = battlecard.companyUrl  || '';
  const dateStr     = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  // Header block
  setFill(COL.primaryDk);
  doc.rect(0, 0, PW, 58, 'F');

  // Left accent bar
  setFill(COL.accent);
  doc.rect(0, 0, 4, 58, 'F');

  // Company name
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  setColor(COL.white);
  const nameLines = doc.splitTextToSize(companyName, CW - 10);
  doc.text(nameLines, ML + 6, 22);

  // "Competitive Battlecard" label
  doc.setFontSize(13);
  doc.setFont('helvetica', 'normal');
  setColor([165, 180, 252]);  // indigo-300
  doc.text('Competitive Battlecard', ML + 6, 22 + nameLines.length * 10 + 2);

  // Divider
  setStroke(COL.primaryLt);
  doc.setLineWidth(1);
  doc.line(ML + 6, 55, ML + 40, 55);

  let y = 68;

  if (companyUrl) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    setColor(COL.slate700);
    doc.text('Website:  ' + companyUrl, ML, y);
    y += 7;
  }

  doc.setFontSize(9.5);
  setColor(COL.slate500);
  doc.text('Generated:  ' + dateStr, ML, y);
  y += 14;

  // Market summary on title page (if available via rawData)
  const marketSummary = (rawData && rawData.market_summary || '').trim();
  if (marketSummary) {
    setFill(COL.slate900);
    doc.rect(ML, y, CW, 6, 'F');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    setColor(COL.white);
    doc.text('MARKET SNAPSHOT', ML + 3, y + 4.5);
    y += 8;

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    setColor(COL.slate700);
    const summaryLines = doc.splitTextToSize(trunc(marketSummary, 800), CW - 4);
    const LINE_H = 4.5;
    const maxLines = Math.floor((PH - MB - y - 20) / LINE_H);
    summaryLines.slice(0, maxLines).forEach((line, i) => {
      doc.text(line, ML, y + (i + 1) * LINE_H);
    });
  }

  addFooter();

  // ═════════════════════════════════════════════════════════════════════════
  // COMPANY OVERVIEW PAGE (when rawData is available)
  // ═════════════════════════════════════════════════════════════════════════
  if (rawData && rawData.target_company) {
    const tc = rawData.target_company;

    doc.addPage();
    let oy = MT;

    // Page header
    setFill(COL.primary);
    doc.rect(0, 0, PW, 11, 'F');
    setFill(COL.accent);
    doc.rect(0, 0, 4, 11, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    setColor(COL.white);
    doc.text('Company Overview — ' + companyName, ML + 4, 7.5);
    oy = 16;

    // Overview paragraph
    const overview = (tc.overview || '').trim();
    if (overview) {
      setFill(COL.primaryDk);
      doc.rect(ML, oy, CW, 6, 'F');
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      setColor(COL.white);
      doc.text('COMPANY OVERVIEW', ML + 2.5, oy + 4.2);
      oy += 7.5;

      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'normal');
      setColor(COL.slate700);
      const ovLines = doc.splitTextToSize(trunc(overview, 600), CW - 4);
      ovLines.slice(0, 8).forEach((line, i) => {
        doc.text(line, ML, oy + (i + 1) * 4.4);
      });
      oy += Math.min(ovLines.length, 8) * 4.4 + 6;
    }

    // Two-column Products | Strengths
    const GAP    = 4;
    const COL_W  = (CW - GAP) / 2;
    const ROW_H  = 55;

    const products  = (tc.products  || []).slice(0, 8).map(p => trunc(p, 120));
    const strengths = (tc.strengths || []).slice(0, 8).map(s => trunc(s, 120));

    if (products.length || strengths.length) {
      if (products.length) {
        drawPanel(ML,              oy, COL_W, ROW_H, COL.blue,  'Products & Capabilities',
          products.map(p => '•  ' + p).join('\n'), 8.5);
      }
      if (strengths.length) {
        drawPanel(ML + COL_W + GAP, oy, COL_W, ROW_H, COL.amber, 'Company Strengths',
          strengths.map(s => '•  ' + s).join('\n'), 8.5);
      }
      oy += ROW_H + 4;
    }

    addFooter();
  }

  // ═════════════════════════════════════════════════════════════════════════
  // COMPETITOR PAGES — grid layout, one page per competitor
  // ═════════════════════════════════════════════════════════════════════════
  if (rawData && rawData.competitors && rawData.competitors.length > 0) {
    rawData.competitors.forEach(comp => {
      doc.addPage();

      const cName = trunc((comp.company_name || 'Competitor').trim(), 80);

      // ── Competitor name header ──────────────────────────────────────────
      setFill(COL.slate900);
      doc.rect(0, 0, PW, 13, 'F');
      setFill(COL.primary);
      doc.rect(0, 0, 4, 13, 'F');

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      setColor(COL.white);
      doc.text(cName, PW / 2, 8.8, { align: 'center' });

      // Website sub-label
      if (comp.website) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        setColor(COL.slate400);
        doc.text(trunc(comp.website, 60), PW / 2, 12, { align: 'center' });
      }

      let gy = 16;

      // ── Overview (full width) ──────────────────────────────────────────
      const OV_H = 28;
      const overviewText = (comp.overview || '').trim();
      drawPanel(ML, gy, CW, OV_H, COL.blue, 'Overview',
        trunc(overviewText, 500), 8.5);
      gy += OV_H + 3;

      // ── 2×2 grid: Products | Strengths / Pricing | Weaknesses ─────────
      const GRID_GAP = 4;
      const GCOL_W   = (CW - GRID_GAP) / 2;
      const GRID_ROW = 52;

      const products   = (comp.products   || []).slice(0, 8).map(v => trunc(v, 130));
      const strengths  = (comp.strengths  || []).slice(0, 8).map(v => trunc(v, 130));
      const pricing    = (comp.pricing    || []).slice(0, 6).map(v => trunc(v, 130));
      const weaknesses = (comp.weaknesses || []).slice(0, 8).map(v => trunc(v, 130));

      drawPanel(ML,               gy, GCOL_W, GRID_ROW, COL.violet,  'Products',
        products.map(v => '•  ' + v).join('\n'), 8.5);
      drawPanel(ML + GCOL_W + GRID_GAP, gy, GCOL_W, GRID_ROW, COL.emerald, 'Strengths',
        strengths.map(v => '•  ' + v).join('\n'), 8.5);
      gy += GRID_ROW + 3;

      drawPanel(ML,               gy, GCOL_W, GRID_ROW, COL.teal,   'Pricing',
        pricing.map(v => '•  ' + v).join('\n'), 8.5);
      drawPanel(ML + GCOL_W + GRID_GAP, gy, GCOL_W, GRID_ROW, COL.rose,    'Weaknesses',
        weaknesses.map(v => '•  ' + v).join('\n'), 8.5);
      gy += GRID_ROW + 3;

      // ── Bottom row: Key Differentiators | Potential Landmines ──────────
      const howWeWin  = (comp.how_we_win          || []).slice(0, 8).map(v => trunc(v, 130));
      const landmines = (comp.potential_landmines || []).slice(0, 8).map(v => trunc(v, 130));

      // Remaining height for bottom row
      const BOT_ROW = PH - MB - gy - 8;
      const BOT_H   = Math.max(40, Math.min(BOT_ROW, 52));

      drawPanel(ML,               gy, GCOL_W, BOT_H, COL.amber, 'Key Differentiators — Why We Win',
        howWeWin.map(v => '•  ' + v).join('\n'), 8.5);
      drawPanel(ML + GCOL_W + GRID_GAP, gy, GCOL_W, BOT_H, COL.red,   'Potential Landmines',
        landmines.map(v => '•  ' + v).join('\n'), 8.5);

      addFooter();
    });
  } else {
    // ═══════════════════════════════════════════════════════════════════════
    // FALLBACK: render from normalised battlecard sections
    // ═══════════════════════════════════════════════════════════════════════
    let yPos = MT;
    let lastCompIdx = null;

    const checkBreak = (need) => {
      if (yPos + need > PH - MB - 8) {
        addFooter();
        doc.addPage();
        yPos = MT;
      }
    };

    const addSecHeader = (title, bgColor) => {
      checkBreak(20);
      yPos += 5;
      const lines = doc.splitTextToSize(title, CW - 8);
      const bh = Math.max(8, lines.length * 6 + 3);
      setFill(bgColor || COL.primary);
      doc.rect(ML, yPos, CW, bh, 'F');
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      setColor(COL.white);
      lines.forEach((l, i) => doc.text(l, ML + 3, yPos + 6 + i * 6));
      yPos += bh + 4;
    };

    const addBody = (text) => {
      if (!text || !text.trim()) return;
      const lines = doc.splitTextToSize(text, CW - 2);
      const LH = 5;
      lines.forEach(line => {
        checkBreak(LH + 2);
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'normal');
        setColor(COL.slate700);
        doc.text(line, ML, yPos);
        yPos += LH;
      });
      yPos += 3;
    };

    (battlecard.sections || []).forEach(section => {
      if (!section.body || !section.body.trim()) return;

      const compMatch = section.id && section.id.match(/^competitor_(\d+)/);
      const isHdr     = section.id && section.id.endsWith('_header');

      if (compMatch && lastCompIdx !== compMatch[1]) {
        lastCompIdx = compMatch[1];
        addFooter();
        doc.addPage();
        yPos = MT;

        const cName = section.title
          .replace(/^Competitor:\s*/i, '')
          .replace(/ - .+$/i, '');

        setFill(COL.slate900);
        doc.rect(0, 0, PW, 13, 'F');
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        setColor(COL.white);
        doc.text(cName, PW / 2, 9, { align: 'center' });
        yPos = 18;

        if (isHdr) {
          if (section.body.startsWith('Website:')) {
            doc.setFontSize(8.5);
            doc.setFont('helvetica', 'normal');
            setColor(COL.slate500);
            doc.text(section.body, ML, yPos);
            yPos += 6;
          }
          return;
        }
      }

      let displayTitle = section.title;
      const pfx = displayTitle.match(/^.+ - (.+)$/);
      if (pfx && section.id && section.id.startsWith('competitor_')) displayTitle = pfx[1];

      addSecHeader(displayTitle, COL.primaryDk);
      addBody(section.body);
    });

    addFooter();
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const filename = (battlecard.companyName || 'battlecard').replace(/[^a-z0-9]/gi, '_') + '_battlecard.pdf';
  doc.save(filename);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generateBattlecardPdf };
}
