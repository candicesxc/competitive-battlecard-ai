/**
 * Type definitions for battlecard data structures
 * 
 * These types define the normalized structure used for:
 * - Storing battlecards in localStorage
 * - Loading saved battlecards
 * - Generating PDFs
 */

/**
 * @typedef {Object} BattlecardSection
 * @property {string} id - Unique identifier for the section
 * @property {string} title - Section title (e.g., "Strengths", "Key Differentiators")
 * @property {string} body - Section content (formatted as text, may contain bullets)
 */

/**
 * @typedef {Object} CompetitorBattlecard
 * @property {string} id - Unique identifier (e.g., companyName + timestamp)
 * @property {string} companyName - Name of the target company
 * @property {string} [companyUrl] - URL of the target company
 * @property {string} [summary] - Market summary if available
 * @property {BattlecardSection[]} sections - All sections from target company and competitors
 * @property {string} createdAt - ISO timestamp when battlecard was created
 * @property {Object} [rawData] - Original data structure for full rendering
 */

/**
 * Converts the backend battlecard response to a normalized CompetitorBattlecard structure
 * @param {Object} data - Backend response with target_company, competitors, market_summary
 * @param {string} companyUrl - Original company URL used for generation
 * @returns {CompetitorBattlecard}
 */
function normalizeBattlecardData(data, companyUrl) {
  const target = data.target_company || {};
  const competitors = data.competitors || [];
  const marketSummary = data.market_summary || "";
  
  const companyName = target.company_name || "Unknown Company";
  const timestamp = Date.now();
  const id = `${companyName.replace(/\s+/g, '_')}_${timestamp}`;
  
  const sections = [];
  
  // Add market summary as first section if available
  if (marketSummary) {
    sections.push({
      id: "market_summary",
      title: "Market snapshot",
      body: marketSummary
    });
  }
  
  // Add target company sections
  sections.push({
    id: "target_overview",
    title: "Company overview",
    body: target.overview || ""
  });
  
  if (target.products && target.products.length > 0) {
    sections.push({
      id: "target_products",
      title: "Products",
      body: Array.isArray(target.products) ? target.products.join("\n• ") : target.products
    });
  }
  
  if (target.strengths && target.strengths.length > 0) {
    sections.push({
      id: "target_strengths",
      title: "Strengths",
      body: Array.isArray(target.strengths) ? target.strengths.join("\n• ") : target.strengths
    });
  }
  
  if (target.weaknesses && target.weaknesses.length > 0) {
    sections.push({
      id: "target_weaknesses",
      title: "Weaknesses",
      body: Array.isArray(target.weaknesses) ? target.weaknesses.join("\n• ") : target.weaknesses
    });
  }
  
  if (target.pricing && target.pricing.length > 0) {
    sections.push({
      id: "target_pricing",
      title: "Pricing",
      body: Array.isArray(target.pricing) ? target.pricing.join("\n• ") : target.pricing
    });
  }
  
  // Add competitor sections
  competitors.forEach((competitor, compIndex) => {
    const compName = competitor.company_name || `Competitor ${compIndex + 1}`;
    
    // Add competitor header only if there's a website
    if (competitor.website) {
      sections.push({
        id: `competitor_${compIndex}_header`,
        title: `Competitor: ${compName}`,
        body: `Website: ${competitor.website}`
      });
    }
    
    if (competitor.overview) {
      sections.push({
        id: `competitor_${compIndex}_overview`,
        title: `${compName} - Company overview`,
        body: competitor.overview
      });
    }
    
    if (competitor.products && competitor.products.length > 0) {
      sections.push({
        id: `competitor_${compIndex}_products`,
        title: `${compName} - Products`,
        body: Array.isArray(competitor.products) ? competitor.products.join("\n• ") : competitor.products
      });
    }
    
    if (competitor.strengths && competitor.strengths.length > 0) {
      sections.push({
        id: `competitor_${compIndex}_strengths`,
        title: `${compName} - Strengths`,
        body: Array.isArray(competitor.strengths) ? competitor.strengths.join("\n• ") : competitor.strengths
      });
    }
    
    if (competitor.weaknesses && competitor.weaknesses.length > 0) {
      sections.push({
        id: `competitor_${compIndex}_weaknesses`,
        title: `${compName} - Weaknesses`,
        body: Array.isArray(competitor.weaknesses) ? competitor.weaknesses.join("\n• ") : competitor.weaknesses
      });
    }
    
    if (competitor.how_we_win && competitor.how_we_win.length > 0) {
      sections.push({
        id: `competitor_${compIndex}_differentiators`,
        title: `${compName} - Key Differentiators`,
        body: Array.isArray(competitor.how_we_win) ? competitor.how_we_win.join("\n• ") : competitor.how_we_win
      });
    }
    
    if (competitor.potential_landmines && competitor.potential_landmines.length > 0) {
      sections.push({
        id: `competitor_${compIndex}_landmines`,
        title: `${compName} - Potential landmines`,
        body: Array.isArray(competitor.potential_landmines) ? competitor.potential_landmines.join("\n• ") : competitor.potential_landmines
      });
    }
    
    if (competitor.pricing && competitor.pricing.length > 0) {
      sections.push({
        id: `competitor_${compIndex}_pricing`,
        title: `${compName} - Pricing`,
        body: Array.isArray(competitor.pricing) ? competitor.pricing.join("\n• ") : competitor.pricing
      });
    }
  });
  
  return {
    id,
    companyName,
    companyUrl: companyUrl || target.website || "",
    summary: marketSummary,
    sections: sections.filter(s => s.body && s.body.trim()), // Filter out empty sections
    createdAt: new Date().toISOString(),
    rawData: data // Store original data for full rendering
  };
}

/**
 * Retrieves all saved battlecards from localStorage
 * @returns {CompetitorBattlecard[]}
 */
function getSavedBattlecards() {
  try {
    const stored = localStorage.getItem("cbt_savedBattlecards");
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Error loading saved battlecards:", error);
    return [];
  }
}

/**
 * Saves a battlecard to localStorage
 * Prevents duplicates by checking companyName + companyUrl combination
 * If a duplicate exists, updates the existing entry with latest content
 * @param {CompetitorBattlecard} battlecard - Battlecard to save
 */
function saveBattlecard(battlecard) {
  try {
    const saved = getSavedBattlecards();
    
    // Duplicate check: Use companyName + companyUrl as unique identifier
    // Normalize URLs for comparison (remove trailing slashes, lowercase)
    const normalizeUrl = (url) => {
      if (!url) return "";
      return url.trim().toLowerCase().replace(/\/+$/, "");
    };
    
    const battlecardKey = `${battlecard.companyName || ""}_${normalizeUrl(battlecard.companyUrl || "")}`;
    
    // Check if a battlecard with the same companyName + companyUrl already exists
    const existingIndex = saved.findIndex(b => {
      const existingKey = `${b.companyName || ""}_${normalizeUrl(b.companyUrl || "")}`;
      return existingKey === battlecardKey;
    });
    
    let updated = saved;
    
    if (existingIndex >= 0) {
      // Duplicate found: Update existing entry with latest content and timestamp
      updated[existingIndex] = {
        ...battlecard,
        id: saved[existingIndex].id, // Keep original ID
        createdAt: new Date().toISOString() // Update timestamp
      };
    } else {
      // No duplicate: Add new battlecard
      updated.push(battlecard);
    }
    
    // Sort by createdAt (most recent first)
    updated.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    localStorage.setItem("cbt_savedBattlecards", JSON.stringify(updated));
    return true;
  } catch (error) {
    console.warn("Error saving battlecard:", error);
    return false;
  }
}

/**
 * Deletes a battlecard from localStorage by id
 * @param {string} battlecardId - ID of battlecard to delete
 */
function deleteBattlecard(battlecardId) {
  try {
    const saved = getSavedBattlecards();
    const filtered = saved.filter(b => b.id !== battlecardId);
    localStorage.setItem("cbt_savedBattlecards", JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.warn("Error deleting battlecard:", error);
    return false;
  }
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeBattlecardData,
    getSavedBattlecards,
    saveBattlecard,
    deleteBattlecard
  };
}
