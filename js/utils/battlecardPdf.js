/**
 * PDF generation utility for battlecards
 * Uses jsPDF to create a formatted PDF from battlecard data
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
  const lineHeight = 7;
  const sectionSpacing = 10;
  const titleSize = 18;
  const sectionTitleSize = 14;
  const bodySize = 11;

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
  const addText = (text, fontSize, isBold = false, color = [0, 0, 0]) => {
    if (!text || !text.trim()) return;
    
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    doc.setTextColor(color[0], color[1], color[2]);
    
    const lines = splitText(text, fontSize, maxWidth);
    const textHeight = lines.length * lineHeight;
    
    checkPageBreak(textHeight);
    
    lines.forEach((line) => {
      if (yPosition + lineHeight > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
      }
      doc.text(line, margin, yPosition);
      yPosition += lineHeight;
    });
    
    doc.setTextColor(0, 0, 0); // Reset to black
  };

  // Title: Company name
  checkPageBreak(30);
  doc.setFontSize(titleSize);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59); // slate-900
  const companyName = battlecard.companyName || "Competitor Battlecard";
  doc.text(companyName, margin, yPosition);
  yPosition += 12;

  // Subtitle: "Competitor Battlecard"
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text("Competitor Battlecard", margin, yPosition);
  yPosition += 8;

  // Company URL if available
  if (battlecard.companyUrl) {
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105); // slate-600
    doc.text(battlecard.companyUrl, margin, yPosition);
    yPosition += 8;
  }

  yPosition += sectionSpacing;

  // Summary if available
  if (battlecard.summary) {
    checkPageBreak(30);
    addText(battlecard.summary, bodySize, false, [30, 41, 59]);
    yPosition += sectionSpacing;
  }

  // Process all sections
  battlecard.sections.forEach((section) => {
    if (!section.body || !section.body.trim()) return;

    checkPageBreak(30);

    // Section title
    addText(section.title, sectionTitleSize, true, [30, 41, 59]);
    yPosition += 3; // Small gap between title and body

    // Section body
    // Handle bullet points - if body contains "•" or starts with bullet-like patterns
    let bodyText = section.body;
    const hasBullets = bodyText.includes("•") || bodyText.includes("- ");
    
    if (hasBullets) {
      // Split by bullet points and format each
      const lines = bodyText.split(/\n/).filter(line => line.trim());
      lines.forEach((line) => {
        const trimmedLine = line.trim();
        if (trimmedLine) {
          // Replace bullet symbols with a simple dash for PDF
          const cleanLine = trimmedLine.replace(/^[•\-\*]\s*/, "- ");
          addText(cleanLine, bodySize, false, [51, 65, 85]); // slate-700
        }
      });
    } else {
      // Regular paragraph text
      addText(bodyText, bodySize, false, [51, 65, 85]);
    }

    yPosition += sectionSpacing;
  });

  // Add page numbers
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184); // slate-400
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
