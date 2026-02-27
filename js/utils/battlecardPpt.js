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

  // Helper to add a competitor slide
  const addCompetitorSlide = (competitorName, sections) => {
    const slide = pres.addSlide();

    // White background
    slide.background = { color: colors.white };

    // Header bar with competitor name
    slide.addShape(pres.ShapeType.rect, {
      x: 0, y: 0, w: '100%', h: 0.9,
      fill: { color: colors.primary }
    });

    slide.addText(competitorName, {
      x: 0.5, y: 0.2, w: 9, h: 0.6,
      fontSize: 32,
      bold: true,
      color: colors.white,
      fontFace: 'Arial'
    });

    // Content sections
    let contentY = 1.1;
    const maxY = 6.5;

    sections.forEach((section) => {
      if (contentY > maxY) return;

      // Section title
      slide.addText(section.title, {
        x: 0.7, y: contentY, w: 8.5, h: 0.35,
        fontSize: 13,
        bold: true,
        color: colors.primaryDark,
        fontFace: 'Arial'
      });
      contentY += 0.4;

      // Section content
      if (Array.isArray(section.content)) {
        section.content.forEach((item) => {
          if (contentY > maxY) return;
          const bullet = `• ${item}`;
          slide.addText(bullet, {
            x: 1.0, y: contentY, w: 8.2, h: 0.3,
            fontSize: 11,
            color: colors.slate600,
            fontFace: 'Arial'
          });
          contentY += 0.3;
        });
      } else {
        slide.addText(section.content, {
          x: 1.0, y: contentY, w: 8.2, h: 0.3,
          fontSize: 11,
          color: colors.slate600,
          fontFace: 'Arial'
        });
        contentY += 0.35;
      }

      contentY += 0.15;
    });

    // Footer
    slide.addText('Competitive Battlecard AI', {
      x: 0.5, y: 6.85, w: 9, h: 0.25,
      fontSize: 10,
      color: colors.slate500,
      fontFace: 'Arial',
      align: 'right'
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

  // Slides 4+: Each Competitor
  if (data.competitors && data.competitors.length > 0) {
    data.competitors.forEach((competitor) => {
      const sections = [];

      // Overview
      if (competitor.overview) {
        sections.push({
          title: "Overview",
          content: [competitor.overview]
        });
      }

      // Products
      if (competitor.products && competitor.products.length > 0) {
        sections.push({
          title: "Products",
          content: competitor.products.slice(0, 4)
        });
      }

      // Strengths
      if (competitor.strengths && competitor.strengths.length > 0) {
        sections.push({
          title: "Strengths",
          content: competitor.strengths.slice(0, 5)
        });
      }

      // Weaknesses
      if (competitor.weaknesses && competitor.weaknesses.length > 0) {
        sections.push({
          title: "Weaknesses",
          content: competitor.weaknesses.slice(0, 5)
        });
      }

      // Pricing
      if (competitor.pricing && competitor.pricing.length > 0) {
        sections.push({
          title: "Pricing",
          content: competitor.pricing.slice(0, 3)
        });
      }

      addCompetitorSlide(competitor.company_name, sections);
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
