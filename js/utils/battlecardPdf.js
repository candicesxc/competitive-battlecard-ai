/**
 * PDF generation utility for battlecards
 * Uses jsPDF to create a formatted PDF from battlecard data
 * 
 * PDF styling improvements:
 * - Uses app color palette (indigo/slate) for consistency
 * - Clean typography hierarchy with proper font sizes and weights
 * - Subtle accent lines under section titles instead of heavy boxes
 * - Generous whitespace and spacing between sections
 * - No borders or boxes around content blocks
 */

/**
 * Generates and downloads a PDF from a CompetitorBattlecard
 * @param {Object} battlecard - CompetitorBattlecard object with sections
 */
function generateBattlecardPdf(battlecard) {
  // Check if jsPDF is available
  // jsPDF from CDN is available as window.jsPDF (UMD build)
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
  const margin = 20;
  const maxWidth = pageWidth - (margin * 2);
  let yPosition = margin;
  
  // Typography settings - matching app visual language
  const lineHeight = 6.5;
  const sectionSpacing = 12; // Increased spacing between sections
  const titleSize = 22; // Larger main title
  const sectionTitleSize = 13; // Section headers
  const bodySize = 10.5; // Body text
  
  // Color palette from app (RGB values)
  const colors = {
    slate900: [30, 41, 59],      // Main text
    slate700: [51, 65, 85],      // Body text
    slate600: [71, 85, 105],     // Secondary text
    slate500: [100, 116, 139],    // Muted text
    slate400: [148, 163, 184],    // Page numbers
    indigo600: [79, 70, 229],     // Accent color
    indigo500: [99, 102, 241],    // Accent color variant
    slate200: [226, 232, 240],   // Subtle accent lines
  };

  // Helper function to add a new page if needed
  const checkPageBreak = (requiredSpace = 20) => {
    if (yPosition + requiredSpace > pageHeight - margin) {
      doc.addPage();
      yPosition = margin;
      return true;
    }
    return false;
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
    const textHeight = lines.length * lineSpacing;
    
    checkPageBreak(textHeight);
    
    lines.forEach((line) => {
      if (yPosition + lineSpacing > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
      }
      doc.text(line, margin, yPosition);
      yPosition += lineSpacing;
    });
  };

  // Helper function to add a subtle accent line under section titles
  const addAccentLine = () => {
    const lineY = yPosition - 2;
    doc.setDrawColor(colors.slate200[0], colors.slate200[1], colors.slate200[2]);
    doc.setLineWidth(0.3);
    doc.line(margin, lineY, pageWidth - margin, lineY);
  };

  // Title: Company name - large and bold
  checkPageBreak(35);
  doc.setFontSize(titleSize);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(colors.slate900[0], colors.slate900[1], colors.slate900[2]);
  const companyName = battlecard.companyName || "Competitor Battlecard";
  doc.text(companyName, margin, yPosition);
  yPosition += 10;

  // Subtitle: "Competitor Battlecard" - smaller and muted
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(colors.slate500[0], colors.slate500[1], colors.slate500[2]);
  doc.text("Competitor Battlecard", margin, yPosition);
  yPosition += 6;

  // Company URL if available - small and secondary
  if (battlecard.companyUrl) {
    doc.setFontSize(9);
    doc.setTextColor(colors.slate600[0], colors.slate600[1], colors.slate600[2]);
    doc.text(battlecard.companyUrl, margin, yPosition);
    yPosition += 8;
  }

  yPosition += sectionSpacing; // Extra space before content

  // Helper to render a section body (bullets or paragraph)
  const renderSectionBody = (bodyText) => {
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
            if (yPosition + lineHeight > pageHeight - margin) {
              doc.addPage();
              yPosition = margin;
            }
            const xPos = idx === 0 ? margin : margin + 5;
            doc.text(bulletLine, xPos, yPosition);
            yPosition += lineHeight * 1.2;
          });
        }
      });
    } else {
      addText(bodyText, bodySize, false, colors.slate700, lineHeight * 1.3);
    }
  };

  // Track competitor sections to add page breaks + name headers
  let lastCompetitorIndex = null;

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

        // Page break before each competitor
        doc.addPage();
        yPosition = margin;

        // Extract competitor name from title
        const competitorName = section.title.replace(/^Competitor:\s*/i, "").replace(/ - Company overview$/i, "");

        // Bold separator line
        doc.setDrawColor(colors.indigo600[0], colors.indigo600[1], colors.indigo600[2]);
        doc.setLineWidth(0.8);
        doc.line(margin, yPosition, pageWidth - margin, yPosition);
        yPosition += 8;

        // Large competitor name header
        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(colors.slate900[0], colors.slate900[1], colors.slate900[2]);
        doc.text(competitorName, margin, yPosition);
        yPosition += 8;

        // "Competitor Analysis" label
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(colors.indigo600[0], colors.indigo600[1], colors.indigo600[2]);
        doc.text("COMPETITOR ANALYSIS", margin, yPosition);
        yPosition += sectionSpacing;

        // If this was the header section (with website), render the website inline and skip normal rendering
        if (competitorHeaderMatch) {
          if (section.body && section.body.startsWith("Website:")) {
            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(colors.slate600[0], colors.slate600[1], colors.slate600[2]);
            doc.text(section.body, margin, yPosition - sectionSpacing + 2);
          }
          return; // Skip normal section rendering for header
        }
      }
    }

    checkPageBreak(35);

    // Add spacing before section (except first one)
    if (index > 0 && !isNewCompetitor) {
      yPosition += sectionSpacing;
    }

    // Clean section title: strip "CompanyName - " prefix for competitor sub-sections
    let displayTitle = section.title;
    const competitorPrefixMatch = displayTitle.match(/^.+ - (.+)$/);
    if (competitorPrefixMatch && section.id && section.id.startsWith("competitor_")) {
      displayTitle = competitorPrefixMatch[1];
    }

    // Section title - bold and larger
    doc.setFontSize(sectionTitleSize);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(colors.slate900[0], colors.slate900[1], colors.slate900[2]);

    const titleLines = splitText(displayTitle, sectionTitleSize, maxWidth);
    titleLines.forEach((line) => {
      if (yPosition + lineHeight > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
      }
      doc.text(line, margin, yPosition);
      yPosition += lineHeight;
    });

    // Add subtle accent line under section title
    addAccentLine();
    yPosition += 5;

    renderSectionBody(section.body);
  });

  // Add page numbers - subtle and in footer
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(colors.slate400[0], colors.slate400[1], colors.slate400[2]);
    doc.text(
      `Page ${i} of ${totalPages}`,
      pageWidth - margin - 20,
      pageHeight - 10,
      { align: 'right' }
    );
  }

  // Generate filename
  const filename = `${battlecard.companyName.replace(/[^a-z0-9]/gi, '_')}_battlecard.pdf`;
  
  // Save the PDF
  doc.save(filename);
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generateBattlecardPdf };
}
