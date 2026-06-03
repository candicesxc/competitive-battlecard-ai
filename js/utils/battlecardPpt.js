/**
 * PowerPoint generation utility for battlecards.
 * Uses PptxGenJS (loaded via CDN) for reliable OOXML generation — no custom
 * ZIP/XML code, which was the root cause of PowerPoint's "needs repair" errors.
 *
 * Layout: LAYOUT_WIDE (13.33" × 7.5", 16:9 widescreen)
 * Slide types:
 *   1. Title slide
 *   2. Company overview
 *   3+. One competitor slide per competitor (grid layout)
 */

(function () {
  'use strict';

  // ── Color palette (hex, no #) ─────────────────────────────────────────────
  const C = {
    primary:      '4F46E5',
    primaryDark:  '372FA3',
    primaryLight: '818CF8',
    accent:       'F97316',
    white:        'FFFFFF',
    slate900:     '0F172A',
    slate800:     '1E293B',
    slate700:     '334155',
    slate600:     '475569',
    slate500:     '64748B',
    slate400:     '94A3B8',
    slate300:     'CBD5E1',
    slate200:     'E2E8F0',
    lightBg:      'F8FAFC',
    blue:         '2563EB',
    emerald:      '059669',
    amber:        'D97706',
    teal:         '0D9488',
    violet:       '7C3AED',
    rose:         'E11D48',
    red:          'DC2626',
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  function trunc(s, n) {
    s = String(s == null ? '' : s).trim();
    return s.length <= n ? s : s.slice(0, n - 1) + '…';
  }

  function bulletList(items) {
    return items.map(i => `•  ${i}`).join('\n');
  }

  // ── Slide builders ────────────────────────────────────────────────────────

  function buildTitleSlide(pptx, companyName, companyUrl, dateStr) {
    const slide = pptx.addSlide();
    const W = 13.33, H = 7.5;

    slide.background = { color: C.slate900 };

    // Top accent strip
    slide.addShape('rect', {
      x: 0, y: 0, w: W, h: 0.07,
      fill: { color: C.primary }, line: { color: C.primary, width: 0 },
    });

    // Left vertical accent bar
    slide.addShape('rect', {
      x: 0, y: 0.07, w: 0.09, h: H * 0.72,
      fill: { color: C.primary }, line: { color: C.primary, width: 0 },
    });

    // Subtle right-side decorative block
    slide.addShape('rect', {
      x: W - 3.2, y: 0, w: 3.2, h: H,
      fill: { color: '080F1E' }, line: { color: '080F1E', width: 0 },
    });
    slide.addShape('rect', {
      x: W - 3.2, y: 0, w: 0.06, h: H,
      fill: { color: C.primaryDark }, line: { color: C.primaryDark, width: 0 },
    });

    // Company name
    slide.addText(companyName, {
      x: 0.55, y: 1.1, w: 9.5, h: 1.7,
      fontSize: 46, bold: true, color: C.white,
      fontFace: 'Calibri',
      charSpacing: -0.5,
      shrinkText: true,
    });

    // "Competitive Battlecard" subtitle
    slide.addText('Competitive Battlecard', {
      x: 0.55, y: 2.95, w: 9.5, h: 0.65,
      fontSize: 22, bold: false, color: 'A5B4FC',
      fontFace: 'Calibri',
    });

    // Divider rule
    slide.addShape('rect', {
      x: 0.55, y: 3.75, w: 2.4, h: 0.045,
      fill: { color: C.primaryLight }, line: { color: C.primaryLight, width: 0 },
    });

    // Meta info
    let metaY = 4.1;
    if (companyUrl) {
      slide.addText('Website:  ' + companyUrl, {
        x: 0.55, y: metaY, w: 9.5, h: 0.33,
        fontSize: 11, color: 'CBD5E1', fontFace: 'Calibri',
      });
      metaY += 0.4;
    }
    slide.addText('Generated:  ' + dateStr, {
      x: 0.55, y: metaY, w: 9.5, h: 0.33,
      fontSize: 11, color: '94A3B8', fontFace: 'Calibri',
    });

    // Tagline
    slide.addText('Powered by Competitive Battlecard AI', {
      x: 0.55, y: 7.1, w: 9.5, h: 0.28,
      fontSize: 9, italic: true, color: C.accent, fontFace: 'Calibri',
    });
  }

  function buildOverviewSlide(pptx, targetCompany, marketSummary) {
    const slide = pptx.addSlide();
    const tc = targetCompany || {};
    slide.background = { color: C.lightBg };

    const W = 13.33;
    const PAD = 0.18;
    const CW = W - PAD * 2;   // content width
    const GAP = 0.1;

    // Header bar
    slide.addShape('rect', {
      x: 0, y: 0, w: W, h: 0.6,
      fill: { color: C.primary }, line: { color: C.primary, width: 0 },
    });
    slide.addShape('rect', {
      x: 0, y: 0, w: 0.07, h: 0.6,
      fill: { color: C.accent }, line: { color: C.accent, width: 0 },
    });
    slide.addText('Company Overview', {
      x: 0.3, y: 0, w: 12, h: 0.6,
      fontSize: 20, bold: true, color: C.white,
      fontFace: 'Calibri', valign: 'middle',
    });

    let cy = 0.72;

    // Market snapshot
    const summary = (marketSummary || '').trim();
    if (summary) {
      const BOX_H = 1.52;
      slide.addShape('rect', {
        x: PAD, y: cy, w: CW, h: BOX_H,
        fill: { color: C.slate800 }, line: { color: C.slate800, width: 0 },
      });
      slide.addShape('rect', {
        x: PAD, y: cy, w: 0.07, h: BOX_H,
        fill: { color: C.accent }, line: { color: C.accent, width: 0 },
      });
      slide.addText('MARKET SNAPSHOT', {
        x: PAD + 0.16, y: cy + 0.08, w: CW - 0.25, h: 0.22,
        fontSize: 7.5, bold: true, color: C.slate400, fontFace: 'Calibri',
      });
      slide.addText(trunc(summary, 520), {
        x: PAD + 0.16, y: cy + 0.34, w: CW - 0.28, h: BOX_H - 0.44,
        fontSize: 10.5, color: 'CBD5E1', fontFace: 'Calibri',
        valign: 'top', wrap: true, shrinkText: true,
      });
      cy += BOX_H + GAP * 1.5;
    }

    // Company overview paragraph
    const overview = (tc.overview || '').trim();
    if (overview) {
      slide.addShape('rect', {
        x: PAD, y: cy, w: CW, h: 0.27,
        fill: { color: C.primaryDark }, line: { color: C.primaryDark, width: 0 },
      });
      slide.addText('COMPANY OVERVIEW', {
        x: PAD + 0.1, y: cy + 0.05, w: CW - 0.2, h: 0.19,
        fontSize: 7.5, bold: true, color: C.white, fontFace: 'Calibri',
      });
      slide.addText(trunc(overview, 440), {
        x: PAD + 0.1, y: cy + 0.32, w: CW - 0.2, h: 0.85,
        fontSize: 10.5, color: C.slate700, fontFace: 'Calibri',
        valign: 'top', wrap: true, shrinkText: true,
      });
      cy += 1.3;
    }

    // Two columns: Products | Strengths
    const products  = (tc.products  || []).slice(0, 7).map(p => trunc(p, 110));
    const strengths = (tc.strengths || []).slice(0, 7).map(s => trunc(s, 110));
    const colGap = GAP;
    const colW   = (CW - colGap) / 2;
    const rowH   = 7.32 - cy - 0.08;

    function col(x, accentColor, label, items) {
      if (items.length === 0) return;
      slide.addShape('rect', {
        x, y: cy, w: colW, h: rowH,
        fill: { color: C.white }, line: { color: C.slate300, width: 0.75 },
      });
      slide.addShape('rect', {
        x, y: cy, w: colW, h: 0.27,
        fill: { color: accentColor }, line: { color: accentColor, width: 0 },
      });
      slide.addText(label, {
        x: x + 0.1, y: cy + 0.04, w: colW - 0.15, h: 0.2,
        fontSize: 7.5, bold: true, color: C.white, fontFace: 'Calibri',
      });
      slide.addText(bulletList(items), {
        x: x + 0.12, y: cy + 0.33, w: colW - 0.22, h: rowH - 0.42,
        fontSize: 10, color: C.slate700, fontFace: 'Calibri',
        valign: 'top', wrap: true, shrinkText: true, paraSpaceAfter: 1,
      });
    }

    col(PAD,                C.blue,  'PRODUCTS & CAPABILITIES', products);
    col(PAD + colW + colGap, C.amber, 'COMPANY STRENGTHS',       strengths);

    // Footer
    slide.addText('Competitive Battlecard AI', {
      x: 0.3, y: 7.35, w: W - 0.5, h: 0.15,
      fontSize: 7, color: C.slate400, fontFace: 'Calibri', align: 'right',
    });
  }

  function buildCompetitorSlide(pptx, competitor) {
    const slide = pptx.addSlide();
    slide.background = { color: C.lightBg };

    const name = trunc((competitor.company_name || 'Competitor').trim(), 80);

    const d = {
      overview:   competitor.overview ? [trunc(competitor.overview, 480)] : [],
      products:   (competitor.products            || []).slice(0, 8).map(v => trunc(v, 140)),
      strengths:  (competitor.strengths           || []).slice(0, 8).map(v => trunc(v, 140)),
      weaknesses: (competitor.weaknesses          || []).slice(0, 8).map(v => trunc(v, 140)),
      pricing:    (competitor.pricing             || []).slice(0, 6).map(v => trunc(v, 140)),
      howWeWin:   (competitor.how_we_win          || []).slice(0, 8).map(v => trunc(v, 140)),
      landmines:  (competitor.potential_landmines || []).slice(0, 8).map(v => trunc(v, 140)),
    };

    const W = 13.33, H = 7.5;
    const HDR_H  = 0.64;
    const GAP    = 0.1;
    const PAD    = 0.12;
    const TOP    = HDR_H + GAP;
    const BOTTOM = 7.38;
    const TOTAL  = BOTTOM - TOP;

    // ── Header ────────────────────────────────────────────────────────────────
    slide.addShape('rect', {
      x: 0, y: 0, w: W, h: HDR_H,
      fill: { color: C.slate900 }, line: { color: C.slate900, width: 0 },
    });
    slide.addShape('rect', {
      x: 0, y: 0, w: 0.08, h: HDR_H,
      fill: { color: C.primary }, line: { color: C.primary, width: 0 },
    });
    slide.addText(name, {
      x: 0.3, y: 0, w: W - 0.5, h: HDR_H,
      fontSize: 22, bold: true, color: C.white,
      fontFace: 'Calibri', valign: 'middle', align: 'center', shrinkText: true,
    });

    // ── Layout constants ──────────────────────────────────────────────────────
    // Left area (overview + 2×2 grid) and right column (key diff + landmines)
    const LEFT_W  = 8.24;
    const RIGHT_X = LEFT_W + GAP * 2;
    const RIGHT_W = W - RIGHT_X - 0.06;

    const ROW1_H = TOTAL * 0.285;         // Overview
    const ROW2_H = TOTAL * 0.36;          // Products | Strengths
    const ROW3_H = TOTAL - ROW1_H - ROW2_H - GAP * 2;  // Pricing | Weaknesses

    const ROW1_Y = TOP;
    const ROW2_Y = ROW1_Y + ROW1_H + GAP;
    const ROW3_Y = ROW2_Y + ROW2_H + GAP;

    const HALF_W  = (LEFT_W - GAP) / 2;
    const COL2_X  = HALF_W + GAP;

    const RP_H   = (TOTAL - GAP) / 2;
    const RP2_Y  = TOP + RP_H + GAP;

    // ── Panel helper ──────────────────────────────────────────────────────────
    function panel(x, y, w, h, accentColor, label, items, singlePara) {
      slide.addShape('rect', {
        x, y, w, h,
        fill: { color: C.white }, line: { color: C.slate300, width: 0.75 },
      });
      slide.addShape('rect', {
        x, y, w, h: 0.28,
        fill: { color: accentColor }, line: { color: accentColor, width: 0 },
      });
      slide.addText(label.toUpperCase(), {
        x: x + PAD, y: y + 0.04, w: w - PAD * 2, h: 0.22,
        fontSize: 7.5, bold: true, color: C.white,
        fontFace: 'Calibri', valign: 'middle',
      });

      if (!items || items.length === 0) return;

      const contentY = y + 0.34;
      const contentH = h - 0.42;
      const cnt      = items.length;
      let fs = singlePara ? 10 : (cnt > 6 ? 9 : cnt > 4 ? 9.5 : 10);

      slide.addText(singlePara ? items[0] : bulletList(items), {
        x: x + PAD, y: contentY, w: w - PAD * 2, h: contentH,
        fontSize: fs, color: C.slate700, fontFace: 'Calibri',
        valign: 'top', wrap: true, shrinkText: true,
        paraSpaceAfter: singlePara ? 0 : 1,
      });
    }

    // ── Panels ────────────────────────────────────────────────────────────────
    panel(0,       ROW1_Y, LEFT_W, ROW1_H, C.blue,    'Overview',             d.overview,  true);
    panel(0,       ROW2_Y, HALF_W, ROW2_H, C.violet,  'Products',             d.products,  false);
    panel(COL2_X,  ROW2_Y, HALF_W, ROW2_H, C.emerald, 'Strengths',            d.strengths, false);
    panel(0,       ROW3_Y, HALF_W, ROW3_H, C.teal,    'Pricing',              d.pricing,   false);
    panel(COL2_X,  ROW3_Y, HALF_W, ROW3_H, C.rose,    'Weaknesses',           d.weaknesses,false);
    panel(RIGHT_X, TOP,    RIGHT_W, RP_H,  C.amber,   'Key Differentiators',  d.howWeWin,  false);
    panel(RIGHT_X, RP2_Y,  RIGHT_W, RP_H,  C.red,     'Potential Landmines',  d.landmines, false);

    // Footer
    slide.addText('Competitive Battlecard AI', {
      x: 0.3, y: 7.37, w: W - 0.5, h: 0.13,
      fontSize: 7, color: C.slate400, fontFace: 'Calibri', align: 'right',
    });
  }

  // ── Main export ───────────────────────────────────────────────────────────

  function generateBattlecardPpt(battlecard, rawData) {
    if (typeof PptxGenJS === 'undefined') {
      alert('PptxGenJS library is not loaded. Please refresh the page and try again.');
      return;
    }

    const data        = rawData || {};
    const companyName = (battlecard && battlecard.companyName)
      || (data.target_company && data.target_company.company_name)
      || 'Company';
    const companyUrl  = (battlecard && battlecard.companyUrl)
      || (data.target_company && data.target_company.website)
      || '';
    const dateStr = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    const pptx = new PptxGenJS();
    pptx.layout  = 'LAYOUT_WIDE';
    pptx.author  = 'Competitive Battlecard AI';
    pptx.company = companyName;
    pptx.subject = 'Competitive Battlecard';
    pptx.title   = companyName + ' — Competitive Battlecard';

    buildTitleSlide(pptx, companyName, companyUrl, dateStr);
    buildOverviewSlide(pptx, data.target_company || {}, data.market_summary || '');
    (data.competitors || []).forEach(c => buildCompetitorSlide(pptx, c));

    const filename = companyName.replace(/[^a-z0-9]/gi, '_') + '_battlecard.pptx';
    pptx.writeFile({ fileName: filename }).catch(err => {
      console.error('Failed to write PPTX:', err);
      alert('Failed to generate PowerPoint. Please try again.');
    });
  }

  if (typeof window !== 'undefined') window.generateBattlecardPpt = generateBattlecardPpt;
  if (typeof module !== 'undefined' && module.exports) module.exports = { generateBattlecardPpt };
})();
