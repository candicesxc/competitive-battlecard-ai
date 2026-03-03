/**
 * PowerPoint generation utility for battlecards
 * Uses PptxGenJs to create professional enterprise-style presentations
 *
 * Slide structure:
 * 1. Title slide - Battlecard for [Company], tool link, timestamp
 * 2. Company overview - About [Company]
 * 3. Competitive landscape - Market overview
 * 4+ Each competitor gets its own slide
 */

/**
 * Generates and downloads a PowerPoint presentation from battlecard data
 * @param {Object} battlecard - CompetitorBattlecard object with sections
 * @param {Object} data - Raw battlecard data with target_company and competitors
 */
function generateBattlecardPpt(battlecard, data) {
  // Check if PptxGenJs is available
  const PptxGenJs = window.PptxGenJs;
  if (typeof PptxGenJs === 'undefined') {
    console.error("PptxGenJs library not loaded");
    alert("PowerPoint generation library not available. Please refresh the page.");
    return;
  }

  const pres = new PptxGenJs();

  // Configuration
  pres.defineLayout({ name: 'TITLE', master: 'BLANK' });

  // Color palette - Enterprise SaaS style
  const colors = {
    darkBg: '0F172A',        // Deep slate
    darkBg2: '1E293B',       // Dark slate
    primaryDark: '372FA3',   // Deep indigo
    primary: '4F46E5',       // Indigo
    primaryLight: '6366F1',  // Light indigo
    accent: 'F97316',        // Orange
    white: 'FFFFFF',
    slate900: '0F172A',
    slate800: '1E293B',
    slate700: '334155',
    slate600: '475569',
    slate500: '64748B',
    slate400: '94A3B8',
    slate300: 'CBD5E1',
    slate200: 'E2E8F0',
  };

  // Typography settings
  const fonts = {
    title: { name: 'Arial', size: 54, bold: true, color: colors.white },
    subtitle: { name: 'Arial', size: 32, bold: true, color: colors.white },
    heading: { name: 'Arial', size: 28, bold: true, color: colors.slate900 },
    subheading: { name: 'Arial', size: 20, bold: true, color: colors.slate800 },
    body: { name: 'Arial', size: 14, color: colors.slate700 },
    bodyBold: { name: 'Arial', size: 14, bold: true, color: colors.slate700 },
    small: { name: 'Arial', size: 11, color: colors.slate600 },
  };

  // Helper to add a title slide
  const addTitleSlide = (title, companyName, companyUrl) => {
    const slide = pres.addSlide();

    // Background gradient effect using rectangles
    slide.addShape(pres.ShapeType.rect, {
      x: 0, y: 0, w: '100%', h: '60%',
      fill: { color: colors.primaryDark }
    });

    slide.addShape(pres.ShapeType.rect, {
      x: 0, y: '60%', w: '100%', h: '40%',
      fill: { color: colors.darkBg2 }
    });

    // Title
    slide.addText(title, {
      x: 0.5, y: 1.5, w: 9, h: 1.2,
      fontSize: 48,
      bold: true,
      color: colors.white,
      fontFace: 'Arial',
      align: 'left'
    });

    // Subtitle
    slide.addText(companyName, {
      x: 0.5, y: 2.8, w: 9, h: 0.8,
      fontSize: 32,
      bold: true,
      color: colors.primaryLight,
      fontFace: 'Arial',
      align: 'left'
    });

    // Accent line
    slide.addShape(pres.ShapeType.rect, {
      x: 0.5, y: 3.7, w: 2, h: 0.08,
      fill: { color: colors.primaryLight }
    });

    // Details box
    let detailY = 4.2;

    if (companyUrl) {
      slide.addText(`Website: ${companyUrl}`, {
        x: 0.5, y: detailY, w: 9, h: 0.35,
        fontSize: 12,
        color: colors.slate300,
        fontFace: 'Arial'
      });
      detailY += 0.45;
    }

    // Generated date
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    slide.addText(`Generated: ${dateStr}`, {
      x: 0.5, y: detailY, w: 9, h: 0.35,
      fontSize: 12,
      color: colors.slate400,
      fontFace: 'Arial'
    });

    // Tool link at bottom
    slide.addText('Created with Competitive Battlecard AI', {
      x: 0.5, y: 6.8, w: 9, h: 0.3,
      fontSize: 11,
      color: colors.accent,
      fontFace: 'Arial',
      italic: true
    });
  };

  // Helper to add a content slide with title and body
  const addContentSlide = (title, bodyItems) => {
    const slide = pres.addSlide();

    // White background
    slide.background = { color: colors.white };

    // Header bar
    slide.addShape(pres.ShapeType.rect, {
      x: 0, y: 0, w: '100%', h: 1,
      fill: { color: colors.primaryDark }
    });

    // Title
    slide.addText(title, {
      x: 0.5, y: 0.25, w: 9, h: 0.6,
      fontSize: 32,
      bold: true,
      color: colors.white,
      fontFace: 'Arial',
      align: 'left'
    });

    // Content
    let contentY = 1.3;
    const contentHeight = 4.7;

    if (Array.isArray(bodyItems)) {
      bodyItems.forEach((item, idx) => {
        if (typeof item === 'string') {
          // Simple text item
          const lines = item.match(/[\s\S]{1,70}/g) || [item];
          const itemHeight = Math.min(lines.length * 0.25, contentHeight - (contentY - 1.3));

          slide.addText(item, {
            x: 0.7, y: contentY, w: 8.5, h: itemHeight,
            fontSize: 13,
            color: colors.slate700,
            fontFace: 'Arial',
            align: 'left',
            valign: 'top'
          });
          contentY += itemHeight + 0.15;
        } else if (typeof item === 'object' && item.title) {
          // Section with title and content
          slide.addText(item.title, {
            x: 0.7, y: contentY, w: 8.5, h: 0.35,
            fontSize: 14,
            bold: true,
            color: colors.primary,
            fontFace: 'Arial'
          });
          contentY += 0.4;

          if (Array.isArray(item.content)) {
            item.content.forEach((line) => {
              const lineHeight = 0.28;
              slide.addText(`• ${line}`, {
                x: 1.0, y: contentY, w: 8.2, h: lineHeight,
                fontSize: 12,
                color: colors.slate600,
                fontFace: 'Arial'
              });
              contentY += lineHeight + 0.05;
            });
          } else {
            slide.addText(item.content, {
              x: 1.0, y: contentY, w: 8.2, h: 0.4,
              fontSize: 12,
              color: colors.slate600,
              fontFace: 'Arial'
            });
            contentY += 0.45;
          }

          contentY += 0.1;
        }

        if (contentY > 6.5) return; // Stop adding items if we're running out of space
      });
    } else {
      slide.addText(bodyItems || '', {
        x: 0.7, y: contentY, w: 8.5, h: 4,
        fontSize: 13,
        color: colors.slate700,
        fontFace: 'Arial',
        align: 'left',
        valign: 'top'
      });
    }

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

  // ========== BUILD PRESENTATION ==========

  const companyName = battlecard.companyName || "Competitor Battlecard";
  const companyUrl = battlecard.companyUrl || "";

  // Slide 1: Title Slide
  addTitleSlide("Competitive Battlecard", companyName, companyUrl);

  // Slide 2: Company Overview
  if (data.target_company) {
    const targetCompany = data.target_company;
    const aboutText = targetCompany.overview || "No overview available.";

    const aboutItems = [];

    if (targetCompany.overview) {
      aboutItems.push({
        title: "Overview",
        content: [targetCompany.overview]
      });
    }

    if (targetCompany.products && targetCompany.products.length > 0) {
      aboutItems.push({
        title: "Products & Services",
        content: targetCompany.products.slice(0, 4)
      });
    }

    if (targetCompany.strengths && targetCompany.strengths.length > 0) {
      aboutItems.push({
        title: "Key Strengths",
        content: targetCompany.strengths.slice(0, 3)
      });
    }

    addContentSlide(`About ${targetCompany.company_name || "Company"}`, aboutItems);
  }

  // Slide 3: Competitive Landscape
  if (data.market_summary || (data.competitors && data.competitors.length > 0)) {
    const landscapeItems = [];

    if (data.market_summary) {
      landscapeItems.push({
        title: "Market Overview",
        content: [data.market_summary]
      });
    }

    if (data.competitors && data.competitors.length > 0) {
      const competitorNames = data.competitors.map(c => c.company_name).slice(0, 6);
      landscapeItems.push({
        title: "Key Competitors",
        content: competitorNames
      });
    }

    addContentSlide("Competitive Landscape", landscapeItems);
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
  }

  // Generate filename
  const filename = `${companyName.replace(/[^a-z0-9]/gi, '_')}_battlecard.pptx`;

  // Save the presentation
  pres.save({ fileName: filename });
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generateBattlecardPpt };
}
