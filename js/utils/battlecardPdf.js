/**
 * PDF generation utility for battlecards
 * Uses jsPDF to create a formatted PDF from battlecard data
 *
 * Enhanced PDF styling:
 * - Professional enterprise design with gradient headers
 * - Modern typography hierarchy
 * - Color-coded sections with accent colors
 * - Improved spacing and visual hierarchy
 * - Custom fonts and styling
 */

/**
 * Generates and downloads a PDF from a CompetitorBattlecard
 * @param {Object} battlecard - CompetitorBattlecard object with sections
 */
function generateBattlecardPdf(battlecard) {
  // Check if jsPDF is available
  if (typeof window.jsPDF === 'undefined' && typeof window.jspdf === 'undefined') {
    console.error("jsPDF library not loaded");
    alert("PDF generation library not available. Please refresh the page.");
    return;
  }

  // Get jsPDF constructor - try both possible names
  const jsPDF = window.jsPDF || (window.jspdf && window.jspdf.jsPDF);
  if (!jsPDF) {
    console.error("jsPDF constructor not found");
    alert("PDF generation library not available. Please refresh the page.");
    return;
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const maxWidth = pageWidth - (margin * 2);
  let yPosition = margin;

  // Typography settings - matching modern enterprise design
  const lineHeight = 5;
  const sectionSpacing = 8;
  const titleSize = 26;
  const subtitleSize = 12;
  const sectionTitleSize = 14;
  const bodySize = 10;

  // Enhanced color palette
  const colors = {
    darkBg: [15, 23, 42],        // Deep slate background
    slate900: [15, 23, 42],      // Main text
    slate800: [30, 41, 59],      // Titles
    slate700: [51, 65, 85],      // Body text
    slate600: [71, 85, 105],     // Secondary text
    slate500: [100, 116, 139],   // Muted text
    slate400: [148, 163, 184],   // Light text
    indigo700: [55, 48, 163],    // Primary accent
    indigo600: [79, 70, 229],    // Accent
    indigo500: [99, 102, 241],   // Light accent
    indigo200: [199, 210, 254],  // Very light accent
    slate200: [226, 232, 240],   // Subtle lines
    white: [255, 255, 255],      // White
  };

  // Helper function to add a new page if needed
  const checkPageBreak = (requiredSpace = 20) => {
    if (yPosition + requiredSpace > pageHeight - margin - 5) {
      addPageFooter();
      doc.addPage();
      yPosition = margin;
      return true;
    }
    return false;
  };

  // Helper to add page number and timestamp
  const addPageFooter = () => {
    const pageNum = doc.internal.getNumberOfPages();
    doc.setFontSize(8);
    doc.setTextColor(colors.slate500[0], colors.slate500[1], colors.slate500[2]);
    doc.text(
      `Page ${pageNum}`,
      pageWidth - margin - 15,
      pageHeight - 8,
      { align: 'right' }
    );
    // Small divider line
    doc.setDrawColor(colors.slate200[0], colors.slate200[1], colors.slate200[2]);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
  };

  // Helper function to split text into lines that fit the page width
  const splitText = (text, fontSize, maxWidth) => {
    return doc.splitTextToSize(text, maxWidth);
  };

  // Helper function to add text with word wrapping
  const addText = (text, fontSize, isBold = false, color = colors.slate700, lineSpacing = lineHeight) => {
    if (!text || !text.trim()) return;

    doc.setFontSize(fontSize);
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    doc.setTextColor(color[0], color[1], color[2]);

    const lines = splitText(text, fontSize, maxWidth);

    lines.forEach((line, idx) => {
      if (yPosition + lineSpacing > pageHeight - margin - 5) {
        addPageFooter();
        doc.addPage();
        yPosition = margin;
      }
      doc.text(line, margin, yPosition);
      yPosition += lineSpacing;
    });
  };

  // Helper to add a section header with background
  const addSectionHeader = (title) => {
    // Ensure enough space for header + content
    if (yPosition + 20 > pageHeight - margin - 5) {
      addPageFooter();
      doc.addPage();
      yPosition = margin;
    }

    // Add spacing above header
    yPosition += 4;

    // Background rectangle
    doc.setFillColor(colors.indigo700[0], colors.indigo700[1], colors.indigo700[2]);
    doc.rect(margin, yPosition, maxWidth, 7, 'F');

    // Title text
    doc.setFontSize(sectionTitleSize);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(colors.white[0], colors.white[1], colors.white[2]);
    doc.text(title, margin + 2, yPosition + 4.5);

    // Move past the header with spacing
    yPosition += 9;
  };

  // ========== TITLE PAGE ==========

  // Background gradient effect (using rectangles)
  doc.setFillColor(colors.indigo700[0], colors.indigo700[1], colors.indigo700[2]);
  doc.rect(0, 0, pageWidth, 60, 'F');

  // Title
  doc.setFontSize(titleSize);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(colors.white[0], colors.white[1], colors.white[2]);
  const companyName = battlecard.companyName || "Competitor Battlecard";
  doc.text(companyName, margin, 25);

  // Subtitle
  doc.setFontSize(subtitleSize);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(colors.indigo200[0], colors.indigo200[1], colors.indigo200[2]);
  doc.text("Competitive Battlecard", margin, 35);

  // Separator line
  doc.setDrawColor(colors.indigo500[0], colors.indigo500[1], colors.indigo500[2]);
  doc.setLineWidth(1);
  doc.line(margin, 45, pageWidth - margin, 45);

  yPosition = 65;

  // Company URL if available
  if (battlecard.companyUrl) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(colors.slate700[0], colors.slate700[1], colors.slate700[2]);
    doc.text(`Website: ${battlecard.companyUrl}`, margin, yPosition);
    yPosition += 8;
  }

  yPosition += 10;

  // Generated timestamp
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.setFontSize(9);
  doc.setTextColor(colors.slate600[0], colors.slate600[1], colors.slate600[2]);
  doc.text(`Generated: ${dateStr}`, margin, yPosition);

  // Track competitor sections to add page breaks + name headers
  let lastCompetitorIndex = null;
  let isFirstSection = true;

  // Helper to render a section body (bullets or paragraph)
  const renderSectionBody = (bodyText) => {
    if (!bodyText || !bodyText.trim()) return;

    const hasBullets = bodyText.includes("•") || bodyText.includes("- ") || bodyText.includes("* ");
    if (hasBullets) {
      const lines = bodyText.split(/\n/).filter(line => line.trim());
      lines.forEach((line) => {
        const trimmedLine = line.trim();
        if (trimmedLine) {
          const cleanLine = trimmedLine.replace(/^[•\-\*]\s*/, "");
          doc.setFontSize(bodySize);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(colors.slate700[0], colors.slate700[1], colors.slate700[2]);
          const bulletLines = splitText(`• ${cleanLine}`, bodySize, maxWidth - 5);
          bulletLines.forEach((bulletLine, idx) => {
            if (yPosition + lineHeight + 3 > pageHeight - margin - 5) {
              addPageFooter();
              doc.addPage();
              yPosition = margin;
            }
            const xPos = idx === 0 ? margin : margin + 3;
            doc.text(bulletLine, xPos, yPosition);
            yPosition += lineHeight + 1;
          });
        }
      });
    } else {
      const paragraphLines = splitText(bodyText, bodySize, maxWidth);
      paragraphLines.forEach((line) => {
        if (yPosition + lineHeight + 3 > pageHeight - margin - 5) {
          addPageFooter();
          doc.addPage();
          yPosition = margin;
        }
        doc.setFontSize(bodySize);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(colors.slate700[0], colors.slate700[1], colors.slate700[2]);
        doc.text(line, margin, yPosition);
        yPosition += lineHeight + 1.2;
      });
    }
    yPosition += 5;
  };

  // Process all sections
  battlecard.sections.forEach((section, index) => {
    if (!section.body || !section.body.trim()) return;

    // Detect start of a new competitor block
    const competitorHeaderMatch = section.id && section.id.match(/^competitor_(\d+)_header$/);
    const competitorOverviewMatch = section.id && section.id.match(/^competitor_(\d+)_overview$/);
    const isNewCompetitor = competitorHeaderMatch || (competitorOverviewMatch && lastCompetitorIndex !== competitorOverviewMatch[1]);

    if (isNewCompetitor) {
      const compIndex = (competitorHeaderMatch || competitorOverviewMatch)[1];
      if (lastCompetitorIndex !== compIndex) {
        lastCompetitorIndex = compIndex;

        // Page break before each competitor (always, to ensure clean separation)
        addPageFooter();
        doc.addPage();
        yPosition = margin;
        isFirstSection = false;

        // Extract competitor name from title
        const competitorName = section.title.replace(/^Competitor:\s*/i, "").replace(/ - Company overview$/i, "");

        // Large competitor name header with background
        doc.setFillColor(colors.indigo600[0], colors.indigo600[1], colors.indigo600[2]);
        doc.rect(0, yPosition - 5, pageWidth, 16, 'F');

        doc.setFontSize(20);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(colors.white[0], colors.white[1], colors.white[2]);
        doc.text(competitorName, margin + 2, yPosition + 6);
        yPosition += 18;

        // If this was the header section (with website), render the website inline and skip normal rendering
        if (competitorHeaderMatch) {
          if (section.body && section.body.startsWith("Website:")) {
            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(colors.slate600[0], colors.slate600[1], colors.slate600[2]);
            doc.text(section.body, margin, yPosition);
            yPosition += 6;
          }
          return; // Skip normal section rendering for header
        }
      }
    }

    // Clean section title: strip "CompanyName - " prefix for competitor sub-sections
    let displayTitle = section.title;
    const competitorPrefixMatch = displayTitle.match(/^.+ - (.+)$/);
    if (competitorPrefixMatch && section.id && section.id.startsWith("competitor_")) {
      displayTitle = competitorPrefixMatch[1];
    }

    // Add section header with background (handles page breaks internally)
    addSectionHeader(displayTitle);

    renderSectionBody(section.body);
  });

  // Add final page footer
  addPageFooter();

  // Generate filename
  const filename = `${battlecard.companyName.replace(/[^a-z0-9]/gi, '_')}_battlecard.pdf`;

  // Save the PDF
  doc.save(filename);
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generateBattlecardPdf };
}
