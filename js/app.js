const DEFAULT_BACKEND_URL = "https://competitive-battlecard-ai.onrender.com";
const LOCAL_BACKEND_URL = "http://localhost:8000";
const BACKEND_STORAGE_KEY = "battlecard-backend-base-url";

const sanitizeBaseUrl = (value) => {
  if (!value) return null;

  try {
    const url = new URL(value.trim());
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.origin;
    }
  } catch (error) {
    console.warn("Invalid backend URL provided", error);
  }

  return null;
};

const loadStoredBackendUrl = () => {
  try {
    const storedValue = window.localStorage?.getItem(BACKEND_STORAGE_KEY);
    return sanitizeBaseUrl(storedValue);
  } catch (error) {
    console.warn("Unable to read stored backend URL", error);
    return null;
  }
};

const persistBackendUrl = (value) => {
  const sanitized = sanitizeBaseUrl(value);
  if (!sanitized) return null;

  try {
    window.localStorage?.setItem(BACKEND_STORAGE_KEY, sanitized);
  } catch (error) {
    console.warn("Unable to store backend URL", error);
  }

  return sanitized;
};

const inferBackendUrl = () => {
  const globalOverride = sanitizeBaseUrl(window.BACKEND_BASE_URL);
  if (globalOverride) return globalOverride;

  const params = new URLSearchParams(window.location.search);
  const queryOverride = sanitizeBaseUrl(params.get("backend"));
  if (queryOverride) {
    persistBackendUrl(queryOverride);

    params.delete("backend");
    const newQuery = params.toString();
    const newUrl = `${window.location.pathname}${
      newQuery ? `?${newQuery}` : ""
    }${window.location.hash}`;
    window.history.replaceState(null, "", newUrl);

    return queryOverride;
  }

  const storedOverride = loadStoredBackendUrl();
  if (storedOverride) return storedOverride;

  const metaOverride = document
    .querySelector('meta[name="backend-base-url"]')
    ?.getAttribute("content");
  const sanitizedMeta = sanitizeBaseUrl(metaOverride);
  if (sanitizedMeta) return sanitizedMeta;

  if (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  ) {
    return LOCAL_BACKEND_URL;
  }

  if (window.location.hostname.endsWith(".onrender.com")) {
    return window.location.origin;
  }

  return DEFAULT_BACKEND_URL;
};

const BACKEND_BASE_URL = inferBackendUrl();

const selectors = {
  form: document.getElementById("analyze-form"),
  urlInput: document.getElementById("company-url"),
  submitBtn: document.getElementById("submit-btn"),
  validationHint: document.getElementById("validation-hint"),
  errorBanner: document.getElementById("error-banner"),
  errorText: document.getElementById("error-text"),
  loadingState: document.getElementById("loading-state"),
  progressFill: document.getElementById("progress-fill"),
  progressMessage: document.getElementById("progress-message"),
  results: document.getElementById("results"),
  resultsContent: document.getElementById("results-content"),
  domainSuggestion: document.getElementById("domain-suggestion"),
  suggestionButton: document.getElementById("suggestion-button"),
  savedBattlecardsContainer: document.getElementById("saved-battlecards-container"),
  savedBattlecardsList: document.getElementById("saved-battlecards-list"),
  pdfDownloadContainer: document.getElementById("pdf-download-container"),
  downloadPdfBtn: document.getElementById("download-pdf-btn"),
};

const isValidUrl = (value) => {
  try {
    // eslint-disable-next-line no-new
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

const toggleClass = (element, className, shouldAdd) => {
  if (!element) return;
  element.classList[shouldAdd ? "add" : "remove"](className);
};

let isLoading = false;
let progress = 0;
let progressTimer = null;
let startTime = null;
let elapsedTime = 0;
let currentBattlecard = null; // Store current battlecard for PDF generation

const getProgressMessage = (value, elapsedSeconds) => {
  const estimatedTotal = 45; // Estimated total time in seconds (45 seconds)
  const remaining = Math.max(0, estimatedTotal - elapsedSeconds);
  const remainingSeconds = Math.floor(remaining % 60);
  const timeEstimate = remaining > 5
    ? ` (~${remainingSeconds}s remaining)`
    : remaining > 0
    ? ` (almost done…)`
    : "";

  if (value < 25) return `Analyzing company website…${timeEstimate}`;
  if (value < 50) return `Searching for relevant competitors…${timeEstimate}`;
  if (value < 75) return `Scoring and ranking competitors…${timeEstimate}`;
  if (value < 95) return `Generating final battlecard…${timeEstimate}`;
  return `Finalizing your battlecard…${timeEstimate}`;
};

const updateProgressUI = () => {
  if (selectors.progressFill) {
    selectors.progressFill.style.width = `${progress}%`;
  }
  if (selectors.progressMessage) {
    const elapsed = startTime ? (Date.now() - startTime) / 1000 : 0;
    selectors.progressMessage.textContent = getProgressMessage(progress, elapsed);
  }
};

const setProgress = (value) => {
  progress = Math.max(0, Math.min(100, Number(value) || 0));
  updateProgressUI();
};

const stopProgressTimer = () => {
  if (progressTimer) {
    window.clearInterval(progressTimer);
    progressTimer = null;
  }
};

const startProgressTimer = () => {
  stopProgressTimer();
  startTime = Date.now();
  progressTimer = window.setInterval(() => {
    if (!isLoading) {
      stopProgressTimer();
      return;
    }
    
    const elapsed = (Date.now() - startTime) / 1000;
    let increment = 0.3;
    
    // More realistic progress based on elapsed time
    // Early stages move faster
    if (progress < 20) {
      increment = 2.5;
    } else if (progress < 40) {
      increment = 1.8;
    } else if (progress < 60) {
      increment = 1.2;
    } else if (progress < 80) {
      increment = 0.8;
    } else if (progress < 92) {
      increment = 0.4;
    } else if (progress < 97) {
      // Slow down significantly but still progress
      increment = 0.15;
    } else {
      // Very slow near completion, but don't stop
      increment = 0.05;
    }
    
    // Don't let it get stuck - always allow some progress
    // Cap at 98% until actual completion
    const maxProgress = elapsed > 90 ? 98 : 97;
    setProgress(Math.min(progress + increment, maxProgress));
  }, 500);
};

const setLoading = (loading) => {
  if (loading) {
    if (isLoading) return;
    isLoading = true;
    startTime = Date.now();
    toggleClass(selectors.loadingState, "hidden", false);
    if (selectors.submitBtn) {
      selectors.submitBtn.disabled = true;
    }
    setProgress(5);
    startProgressTimer();
    return;
  }

  if (!isLoading) return;

  setProgress(100);
  stopProgressTimer();
  startTime = null;

  window.setTimeout(() => {
    isLoading = false;
    if (selectors.submitBtn) {
      selectors.submitBtn.disabled = false;
    }
    toggleClass(selectors.loadingState, "hidden", true);
    setProgress(0);
  }, 600);
};

const clearError = () => {
  toggleClass(selectors.errorBanner, "hidden", true);
  selectors.errorText.textContent = "";
};

const showError = (message) => {
  selectors.errorText.textContent = message;
  toggleClass(selectors.errorBanner, "hidden", false);
};

const normalizeCompanyUrl = (value) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  let normalized = trimmed;
  // Add https:// if protocol is missing
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  try {
    const url = new URL(normalized);
    // For domains without www, add www if it's a simple domain (e.g., example.com)
    const hostnameParts = url.hostname.split(".");
    const isSimpleDomain = hostnameParts.length === 2;
    const hasWww = /^www\./i.test(url.hostname);
    
    if (!hasWww && isSimpleDomain) {
      url.hostname = `www.${url.hostname}`;
    }
    return url.toString();
  } catch (error) {
    console.warn("Unable to normalize URL", error);
    // If URL parsing fails, try to fix common issues
    // Remove trailing slashes and spaces
    normalized = normalized.replace(/\/+$/, "").trim();
    return normalized;
  }
};

// Common TLDs for domain completion suggestions
const COMMON_TLDS = [".com", ".org", ".net", ".io", ".co", ".ai", ".dev"];

const suggestDomainCompletion = (value) => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Check if the input looks like it's missing a TLD
  // Pattern: https://www.domainname. (ends with a dot but no TLD)
  const endsWithDotPattern = /^https?:\/\/[^\/]+\.$/i;
  if (endsWithDotPattern.test(trimmed)) {
    return ".com"; // Default suggestion
  }

  // Pattern: https://www.domainname (no dot, no TLD)
  const noTldPattern = /^https?:\/\/(www\.)?[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$/i;
  if (noTldPattern.test(trimmed)) {
    return ".com"; // Default suggestion
  }

  return null;
};

// Section creation with boxes around sections
const createSection = (title, items, accentClass) => {
  const section = document.createElement("div");
  section.className =
    "rounded-2xl border border-slate-200/80 bg-white/95 backdrop-blur-sm p-6 shadow-md transition-all duration-200 hover:shadow-lg";

  const titleRow = document.createElement("div");
  titleRow.className = "flex items-center justify-between mb-3";

  const heading = document.createElement("h3");
  heading.className = `section-title ${accentClass}`;
  heading.textContent = title;
  titleRow.appendChild(heading);

  // Add copy button to all sections
  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors shrink-0 ml-2";
  copyBtn.setAttribute("aria-label", `Copy ${title}`);
  copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><span>Copy</span>`;

  copyBtn.addEventListener("click", () => {
    if (!items || items.length === 0) return;
    const text = items.map((item) => `• ${item}`).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      const label = copyBtn.querySelector("span");
      if (label) {
        label.textContent = "Copied!";
        copyBtn.classList.add("text-emerald-600");
        setTimeout(() => {
          label.textContent = "Copy";
          copyBtn.classList.remove("text-emerald-600");
        }, 2000);
      }
    }).catch(() => {
      // Fallback for environments without clipboard API
      const textArea = document.createElement("textarea");
      textArea.value = items.map((item) => `• ${item}`).join("\n");
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    });
  });

  titleRow.appendChild(copyBtn);
  section.appendChild(titleRow);

  if (!items || items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "text-sm text-slate-400 italic";
    empty.textContent = "No data available.";
    section.appendChild(empty);
    return section;
  }

  const list = document.createElement("ul");
  list.className = "space-y-2.5 text-sm leading-relaxed text-slate-700 list-none";

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "flex items-start gap-2.5 before:content-['•'] before:text-indigo-500 before:font-bold before:flex-shrink-0 before:mt-0.5";
    li.textContent = item;
    list.appendChild(li);
  });

  section.appendChild(list);
  return section;
};

// Pricing section with boxes around sections
const createPricingSection = (title, items, accentClass) => {
  const section = document.createElement("div");
  section.className =
    "rounded-2xl border border-slate-200/80 bg-white/95 backdrop-blur-sm p-6 shadow-md transition-all duration-200 hover:shadow-lg col-span-full";

  const heading = document.createElement("h3");
  heading.className = `section-title mb-3 ${accentClass}`;
  heading.textContent = title;
  section.appendChild(heading);

  if (!items || items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "text-sm text-slate-400 italic";
    empty.textContent = "No data available.";
    section.appendChild(empty);
    return section;
  }

  // Create a single column layout for pricing (full width)
  const list = document.createElement("ul");
  list.className = "space-y-2.5 text-sm leading-relaxed text-slate-700 list-none";

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "flex items-start gap-2.5 before:content-['•'] before:text-indigo-500 before:font-bold before:flex-shrink-0 before:mt-0.5";
    li.textContent = item;
    list.appendChild(li);
  });

  section.appendChild(list);
  return section;
};

// createScoreBar function removed - competitive score no longer displayed in UI

// Filter out irrelevant news (listicles, comparison articles, etc.)

// Simplified target card - removed heavy borders and boxes
// Market snapshot is now clearly its own separate section
const createTargetCard = (target, marketSummary) => {
  const section = document.createElement("section");
  // Removed border, rounded corners, background gradient, and shadow for cleaner look
  section.className = "space-y-12 py-6";

  // Market snapshot as its own clearly separate section with proper heading
  if (marketSummary) {
    const marketSection = document.createElement("div");
    marketSection.className = "market-snapshot-section mb-12";
    const heading = document.createElement("h2");
    heading.className = "text-2xl font-semibold text-blue-800 mb-4";
    heading.textContent = "Market snapshot";
    const body = document.createElement("p");
    body.className = "mt-2 text-base leading-7 text-slate-800 font-medium";
    body.textContent = marketSummary;
    marketSection.append(heading, body);
    section.appendChild(marketSection);
  }

  // Company header
  const header = document.createElement("header");
  header.className = "flex flex-col gap-6 md:flex-row md:items-center md:justify-between pb-2 mb-2";

  const companyInfo = document.createElement("div");
  companyInfo.className = "flex flex-col gap-2";

  const titleWrapper = document.createElement("div");
  const title = document.createElement("h1");
  title.className = "text-3xl lg:text-4xl font-bold text-slate-900";
  title.textContent = target.company_name || "Target company";
  const category = document.createElement("p");
  category.className = "text-sm font-medium text-indigo-600 uppercase tracking-wide";
  category.textContent = target.category || "";

  titleWrapper.append(title, category);
  companyInfo.appendChild(titleWrapper);
  header.appendChild(companyInfo);

  section.appendChild(header);

  const grid = document.createElement("div");
  grid.className = "card-grid -mt-2";
  grid.append(
    createSection("Company overview", [target.overview].filter(Boolean), "text-blue-600"),
    createSection("Products", target.products, "text-blue-600"),
  );

  const strengthsWeaknesses = document.createElement("div");
  strengthsWeaknesses.className = "card-grid";
  strengthsWeaknesses.append(
    createSection("Strengths", target.strengths, "text-emerald-600"),
    createSection("Weaknesses", target.weaknesses, "text-slate-500"),
  );

  // Add pricing section at the end with full width (2 columns)
  const pricingSection = createPricingSection("Pricing", target.pricing, "text-blue-600");
  
  section.append(grid, strengthsWeaknesses, pricingSection);
  return section;
};

// Competitor card with boxes around sections
const createCompetitorCard = (competitor, index, isActive = false) => {
  const article = document.createElement("article");
  article.className =
    `competitor-card group rounded-3xl border border-slate-200/80 bg-white/95 backdrop-blur-sm p-8 lg:p-10 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:border-slate-300/80`;
  article.dataset.competitorIndex = index;
  if (!isActive) {
    article.classList.add("hidden");
  }

  const header = document.createElement("header");
  header.className = "mb-6 pb-6 border-b border-slate-200/60";

  const info = document.createElement("div");
  const title = document.createElement("h3");
  title.className = "text-3xl font-bold text-slate-900 mb-2";
  title.textContent = competitor.company_name || "Competitor";
  
  // Add website URL directly under the competitor name
  const website = competitor.website || "";
  let websiteLink = null;
  if (website) {
    websiteLink = document.createElement("a");
    websiteLink.href = website;
    websiteLink.target = "_blank";
    websiteLink.rel = "noopener noreferrer";
    websiteLink.className = "text-sm text-slate-600 hover:text-slate-800 mt-1 mb-3 block break-all transition-colors duration-200 font-medium";
    websiteLink.textContent = website;
  }
  
  // Format category/description - clean up messy text with brackets and special characters
  let categoryText = (competitor.category || "Market competitor").trim();
  // Clean up common messy formats like "[IDC]", "[Gartner]", "Source: X", etc.
  categoryText = categoryText
    .replace(/\[.*?\]/g, "") // Remove [bracketed] content
    .replace(/Source:\s*/gi, "")
    .replace(/\*\*/g, "")
    .split(",")[0] // Just take first part if comma-separated
    .trim();

  if (!categoryText) categoryText = "Market competitor";

  const category = document.createElement("p");
  category.className = "text-xs uppercase tracking-wider text-indigo-600 font-semibold mt-2";
  category.textContent = categoryText;

  info.appendChild(title);
  if (websiteLink) {
    info.appendChild(websiteLink);
  }
  info.appendChild(category);

  // Competitor type badge with tooltip
  const competitorType = (competitor.competitor_type || "").toLowerCase();
  if (competitorType) {
    const typeRow = document.createElement("div");
    typeRow.className = "flex items-center gap-2 mt-3";

    const typeBadgeColors = {
      direct: "bg-red-100 text-red-700 border-red-200",
      adjacent: "bg-amber-100 text-amber-700 border-amber-200",
      aspirational: "bg-blue-100 text-blue-700 border-blue-200",
    };
    const typeColor = typeBadgeColors[competitorType] || "bg-slate-100 text-slate-600 border-slate-200";

    const typeBadge = document.createElement("span");
    typeBadge.className = `inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${typeColor}`;
    typeBadge.textContent = competitorType.charAt(0).toUpperCase() + competitorType.slice(1) + " competitor";
    typeRow.appendChild(typeBadge);

    const reasonIcon = document.createElement("button");
    reasonIcon.type = "button";
    reasonIcon.className = "text-slate-400 hover:text-slate-600 transition-colors relative group";
    reasonIcon.setAttribute("aria-label", "Why this competitor?");
    reasonIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>`;

    const tooltip = document.createElement("div");
    tooltip.className = "absolute left-6 top-0 z-10 w-80 rounded-xl bg-slate-900 text-white text-xs leading-relaxed px-3 py-2.5 shadow-xl hidden group-hover:block";

    // Build rich tooltip with similarity metrics
    const typeDescriptions = {
      direct: "Head-to-head competitor with similar products, target audience, and pricing model",
      adjacent: "Related player in the same ecosystem with some feature/audience overlap",
      aspirational: "Aspirational competitor—larger player or different market segment, but seen as a model"
    };

    const typeDesc = typeDescriptions[competitorType] || "Competitor identified through research";
    const industry = competitor.industry_similarity ? Math.round(competitor.industry_similarity) : "—";
    const product = competitor.product_similarity ? Math.round(competitor.product_similarity) : "—";
    const audience = competitor.audience_similarity ? Math.round(competitor.audience_similarity) : "—";
    const size = competitor.size_similarity ? Math.round(competitor.size_similarity) : "—";
    const model = competitor.business_model_similarity ? Math.round(competitor.business_model_similarity) : "—";

    const reason = competitor.reason_for_similarity || competitor.why_similar || "";

    // Check if any similarity metrics are available
    const hasMetrics = industry !== "—" || product !== "—" || audience !== "—" || size !== "—" || model !== "—";

    const metricsHTML = hasMetrics ? `
      <div class="grid grid-cols-2 gap-1 text-slate-400 text-xs mb-2 border-t border-slate-700 pt-1.5">
        ${industry !== "—" ? `<div>• Industry: <span class="text-slate-200 font-medium">${industry}%</span></div>` : ""}
        ${product !== "—" ? `<div>• Product: <span class="text-slate-200 font-medium">${product}%</span></div>` : ""}
        ${audience !== "—" ? `<div>• Audience: <span class="text-slate-200 font-medium">${audience}%</span></div>` : ""}
        ${size !== "—" ? `<div>• Size: <span class="text-slate-200 font-medium">${size}%</span></div>` : ""}
        ${model !== "—" ? `<div>• Business model: <span class="text-slate-200 font-medium">${model}%</span></div>` : ""}
      </div>
    ` : "";

    const tooltipHTML = `
      <div class="font-semibold mb-1.5 text-white">
        ${competitorType.toUpperCase()} COMPETITOR
      </div>
      <div class="mb-2 text-slate-300">${typeDesc}</div>
      ${metricsHTML}
      ${reason ? `<div class="${hasMetrics ? "border-t border-slate-700 pt-1.5" : ""} text-slate-300 italic">"${reason}"</div>` : ""}
    `;

    tooltip.innerHTML = tooltipHTML;
    reasonIcon.appendChild(tooltip);
    typeRow.appendChild(reasonIcon);

    info.appendChild(typeRow);
  }

  header.append(info);

  const grid = document.createElement("div");
  grid.className = "card-grid -mt-4";
  grid.append(
    createSection("Company overview", [competitor.overview].filter(Boolean), "text-blue-600"),
    createSection("Products", competitor.products, "text-blue-600"),
    createSection("Strengths", competitor.strengths, "text-emerald-600"),
    createSection("Weaknesses", competitor.weaknesses, "text-slate-500"),
    createSection("Key Differentiators", competitor.how_we_win, "text-red-500"),
    createSection(
      "Potential landmines",
      competitor.potential_landmines,
      "text-purple-500",
    ),
  );

  // Add pricing section at the end with full width (2 columns)
  const pricingSection = createPricingSection("Pricing", competitor.pricing, "text-blue-600");
  grid.appendChild(pricingSection);


  // Add competitor navigation buttons
  const competitors = document.querySelectorAll('[data-competitor-index]') ?
    Array.from(document.querySelectorAll('[data-competitor-index]')) : [];
  const competitorCount = competitors.length;

  if (competitorCount > 1) {
    const navWrapper = document.createElement("div");
    navWrapper.className = "col-span-full mt-4 flex items-center justify-center gap-4";

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-sm transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-md";
    prevBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg> <span>Previous</span>`;
    prevBtn.dataset.direction = "prev";
    prevBtn.setAttribute("aria-label", "View previous competitor");

    const counterSpan = document.createElement("span");
    counterSpan.className = "text-sm font-bold text-slate-700 whitespace-nowrap px-3 py-2.5 bg-slate-100 rounded-lg";
    counterSpan.innerHTML = `<span class="text-indigo-600">${index + 1}</span><span class="text-slate-500"> / ${competitorCount}</span>`;

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-sm transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-md";
    nextBtn.innerHTML = `<span>Next</span> <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
    nextBtn.dataset.direction = "next";
    nextBtn.setAttribute("aria-label", "View next competitor");

    // Disable buttons at edges
    if (index === 0) prevBtn.disabled = true;
    if (index === competitorCount - 1) nextBtn.disabled = true;

    // Add click handlers
    const handleNavClick = (e) => {
      const direction = e.currentTarget.dataset.direction;
      const nextIndex = direction === "next" ? index + 1 : index - 1;
      if (nextIndex >= 0 && nextIndex < competitorCount) {
        const tabs = Array.from(document.querySelectorAll(".competitor-tab"));
        if (tabs[nextIndex]) tabs[nextIndex].click();
      }
    };

    prevBtn.addEventListener("click", handleNavClick);
    nextBtn.addEventListener("click", handleNavClick);

    navWrapper.appendChild(prevBtn);
    navWrapper.appendChild(counterSpan);
    navWrapper.appendChild(nextBtn);
    grid.appendChild(navWrapper);
  }

  article.append(header, grid);
  return article;
};

const createCompetitorGrid = (competitors) => {
  const section = document.createElement("section");
  section.className = "space-y-8";

  const headerWrapper = document.createElement("div");
  headerWrapper.className = "competitive-landscape-header";
  
  const heading = document.createElement("h2");
  heading.className = "competitive-landscape-title";
  heading.textContent = "Competitive landscape";
  
  const subheading = document.createElement("p");
  subheading.className = "competitive-landscape-subtitle";
  subheading.textContent = "Detailed analysis of your competitive landscape";

  headerWrapper.appendChild(heading);
  headerWrapper.appendChild(subheading);
  section.appendChild(headerWrapper);

  if (!competitors || competitors.length === 0) {
    const empty = document.createElement("p");
    empty.className = "rounded-2xl border border-slate-200/80 bg-white/95 backdrop-blur-sm p-8 text-base text-slate-500 shadow-md text-center";
    empty.textContent =
      "No close competitors found. Try running the analysis with another target company.";
    section.appendChild(empty);
    return section;
  }

  // Create tabs container - removed separator line above tabs
  const tabsContainer = document.createElement("div");
  tabsContainer.className = "competitor-tabs-container mb-6";
  
  const tabsList = document.createElement("div");
  // Removed border-b (separator line) above tabs for cleaner look
  tabsList.className = "flex flex-wrap gap-2 justify-center pb-4";
  
  competitors.forEach((competitor, index) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `competitor-tab transition-all duration-200 ${
      index === 0
        ? "bg-indigo-600 text-white shadow-lg"
        : "bg-slate-200 text-slate-800"
    }`;
    tab.dataset.competitorIndex = index;
    tab.setAttribute("aria-selected", index === 0 ? "true" : "false");
    tab.setAttribute("role", "tab");

    const tabName = document.createElement("span");
    tabName.textContent = competitor.company_name || `Competitor ${index + 1}`;
    tab.appendChild(tabName);

    // Add competitor type badge to tab
    const competitorType = (competitor.competitor_type || "").toLowerCase();
    if (competitorType) {
      const typeBadge = document.createElement("span");
      const badgeColors = {
        direct: "bg-red-100 text-red-700",
        adjacent: "bg-amber-100 text-amber-700",
        aspirational: "bg-blue-100 text-blue-700",
      };
      const badgeColor = badgeColors[competitorType] || "bg-slate-100 text-slate-500";
      typeBadge.className = `ml-1.5 text-xs font-medium px-1.5 py-0.5 rounded-full ${badgeColor}`;
      typeBadge.textContent = competitorType;
      tab.appendChild(typeBadge);
    }
    
    tab.addEventListener("click", () => {
      // Update tab states
      tabsList.querySelectorAll(".competitor-tab").forEach((t, i) => {
        if (i === index) {
          t.classList.remove("bg-slate-200", "text-slate-800");
          t.classList.add("bg-indigo-600", "text-white", "shadow-lg");
          t.setAttribute("aria-selected", "true");
        } else {
          t.classList.remove("bg-indigo-600", "text-white", "shadow-lg");
          t.classList.add("bg-slate-200", "text-slate-800");
          t.setAttribute("aria-selected", "false");
        }
      });
      
      // Show/hide competitor cards
      section.querySelectorAll(".competitor-card").forEach((card, i) => {
        if (i === index) {
          card.classList.remove("hidden");
        } else {
          card.classList.add("hidden");
        }
      });
    });
    
    tabsList.appendChild(tab);
  });
  
  tabsContainer.appendChild(tabsList);
  section.appendChild(tabsContainer);

  // Create competitor cards grid
  const grid = document.createElement("div");
  grid.className = "grid grid-cols-1 gap-8";
  competitors.forEach((competitor, index) => {
    grid.appendChild(createCompetitorCard(competitor, index, index === 0));
  });

  section.appendChild(grid);
  return section;
};

const renderBattlecards = (data, companyUrl = null) => {
  if (!selectors.results || !selectors.resultsContent) return;

  // Clear previous content
  selectors.resultsContent.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = "space-y-12";

  wrapper.appendChild(
    createTargetCard(data.target_company ?? {}, data.market_summary ?? ""),
  );
  wrapper.appendChild(createCompetitorGrid(data.competitors ?? []));

  selectors.resultsContent.appendChild(wrapper);
  toggleClass(selectors.results, "hidden", false);

  // Restart fade-in animation
  selectors.results.classList.remove("fade-in");
  // Trigger reflow
  void selectors.results.offsetWidth;
  selectors.results.classList.add("fade-in");

  // Initialize next steps (sales playbook) feature
  initializeNextSteps(data);

  // Save battlecard to localStorage and update current battlecard state
  if (typeof normalizeBattlecardData !== 'undefined') {
    const normalized = normalizeBattlecardData(data, companyUrl || selectors.urlInput?.value || "");
    currentBattlecard = normalized;

    // Save to localStorage
    if (typeof saveBattlecard !== 'undefined') {
      saveBattlecard(normalized);
      updateSavedBattlecardsUI();
    }
    
    // Show PDF download button
    toggleClass(selectors.pdfDownloadContainer, "hidden", false);

    // Initialize Next Steps section for sales playbook generation
    initializeNextSteps(currentBattlecard);
  }
};

/**
 * Updates the saved battlecards UI
 */
const updateSavedBattlecardsUI = () => {
  if (!selectors.savedBattlecardsContainer || !selectors.savedBattlecardsList) return;
  
  if (typeof getSavedBattlecards === 'undefined') return;
  
  const saved = getSavedBattlecards();
  
  if (saved.length === 0) {
    toggleClass(selectors.savedBattlecardsContainer, "hidden", true);
    return;
  }
  
  // Clear existing buttons
  selectors.savedBattlecardsList.innerHTML = "";
  
  // Create buttons for each saved battlecard
  saved.forEach((battlecard) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-all duration-200 hover:bg-slate-50 hover:border-slate-400 hover:shadow";
    button.textContent = battlecard.companyName;
    button.dataset.battlecardId = battlecard.id;
    
    // Add click handler to load battlecard
    button.addEventListener("click", () => {
      loadSavedBattlecard(battlecard.id);
    });
    
    // Add delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "ml-1 text-slate-400 hover:text-red-500 transition-colors";
    deleteBtn.innerHTML = "×";
    deleteBtn.setAttribute("aria-label", "Delete battlecard");
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm(`Delete battlecard for ${battlecard.companyName}?`)) {
        if (typeof deleteBattlecard !== 'undefined') {
          deleteBattlecard(battlecard.id);
          updateSavedBattlecardsUI();
        }
      }
    });
    
    button.appendChild(deleteBtn);
    selectors.savedBattlecardsList.appendChild(button);
  });
  
  toggleClass(selectors.savedBattlecardsContainer, "hidden", false);
};

/**
 * Loads a saved battlecard and renders it
 * @param {string} battlecardId - ID of the battlecard to load
 */
const loadSavedBattlecard = (battlecardId) => {
  if (typeof getSavedBattlecards === 'undefined') return;
  
  const saved = getSavedBattlecards();
  const battlecard = saved.find(b => b.id === battlecardId);
  
  if (!battlecard) {
    showError("Battlecard not found.");
    return;
  }
  
  // Set current battlecard
  currentBattlecard = battlecard;
  
  // Load the raw data and render it
  if (battlecard.rawData) {
    renderBattlecards(battlecard.rawData, battlecard.companyUrl);
    // Scroll to results
    selectors.results?.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    showError("Battlecard data is incomplete.");
  }
};

/**
 * Handles PDF download
 */
const handlePdfDownload = () => {
  if (!currentBattlecard) {
    showError("No battlecard available to download.");
    return;
  }
  
  if (typeof generateBattlecardPdf === 'undefined') {
    showError("PDF generation is not available. Please refresh the page.");
    return;
  }
  
  try {
    generateBattlecardPdf(currentBattlecard);
  } catch (error) {
    console.error("Error generating PDF:", error);
    showError("Failed to generate PDF. Please try again.");
  }
};

const handleSubmit = async (event) => {
  event.preventDefault();

  clearError();
  toggleClass(selectors.validationHint, "hidden", true);

  const normalizedInput = normalizeCompanyUrl(selectors.urlInput.value);
  if (normalizedInput) {
    selectors.urlInput.value = normalizedInput;
  }

  const inputValue = normalizedInput;

  if (!inputValue || !isValidUrl(inputValue)) {
    toggleClass(selectors.validationHint, "hidden", false);
    return;
  }

  setLoading(true);
  // Hide PDF button while loading
  toggleClass(selectors.pdfDownloadContainer, "hidden", true);
  currentBattlecard = null;
  
  try {
    const response = await fetch(`${BACKEND_BASE_URL}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ company_url: inputValue }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const detail = payload.detail;

      if (detail && typeof detail === "string") {
        throw new Error(detail);
      }

      if (Array.isArray(detail)) {
        const message = detail
          .map((item) => item?.msg || item?.detail || "")
          .filter(Boolean)
          .join(" ");
        throw new Error(message || "Analysis failed.");
      }

      throw new Error("Analysis failed. Please try again later.");
    }

    const data = await response.json();
    renderBattlecards(data, inputValue);
  } catch (error) {
    console.error(error);
    const msg =
      error?.message === "Failed to fetch" || error?.name === "TypeError"
        ? "Could not reach the analysis server. Check BACKEND_BASE_URL or try again later."
        : error?.message || "Something went wrong. Please try again later.";
    showError(msg);
  } finally {
    setLoading(false);
  }
};

// Handle URL input with auto-correction and domain suggestions
if (selectors.urlInput) {
  let suggestionTimeout = null;
  
  selectors.urlInput.addEventListener("input", (e) => {
    const value = e.target.value;
    
    // Clear any existing timeout
    if (suggestionTimeout) {
      clearTimeout(suggestionTimeout);
    }
    
    // Hide suggestion when input is empty
    if (!value.trim()) {
      toggleClass(selectors.domainSuggestion, "hidden", true);
      return;
    }
    
    // Check for domain completion suggestion after a short delay
    suggestionTimeout = setTimeout(() => {
      const suggestion = suggestDomainCompletion(value);
      if (suggestion && selectors.domainSuggestion && selectors.suggestionButton) {
        const suggestedUrl = value.endsWith(".") 
          ? `${value}com` 
          : `${value}${suggestion}`;
        selectors.suggestionButton.textContent = suggestedUrl;
        selectors.suggestionButton.onclick = () => {
          selectors.urlInput.value = suggestedUrl;
          toggleClass(selectors.domainSuggestion, "hidden", true);
        };
        toggleClass(selectors.domainSuggestion, "hidden", false);
      } else {
        toggleClass(selectors.domainSuggestion, "hidden", true);
      }
    }, 500);
  });
  
  // Hide suggestion on blur (after a short delay to allow clicking the suggestion)
  selectors.urlInput.addEventListener("blur", () => {
    setTimeout(() => {
      toggleClass(selectors.domainSuggestion, "hidden", true);
    }, 200);
  });
}

// ====== NEXT STEPS / SALES PLAYBOOK SECTION ======

const initializeNextSteps = (battlecard) => {
  if (!battlecard || !battlecard.competitors || battlecard.competitors.length === 0) return;

  const nextStepsContainer = document.getElementById("next-steps-container");
  const competitorSelect = document.getElementById("playbook-competitor-select");
  const generateBtn = document.getElementById("generate-playbook-btn");

  if (!nextStepsContainer || !competitorSelect || !generateBtn) return;

  // Populate competitor dropdown
  battlecard.competitors.forEach((competitor, index) => {
    const option = document.createElement("option");
    option.value = competitor.company_name || `Competitor ${index + 1}`;
    option.textContent = competitor.company_name || `Competitor ${index + 1}`;
    competitorSelect.appendChild(option);
  });

  // Show next steps container
  toggleClass(nextStepsContainer, "hidden", false);

  // Set up generate button handler
  generateBtn.addEventListener("click", async () => {
    const targetUrl = document.getElementById("playbook-target-url")?.value?.trim() || "";
    const targetContext = document.getElementById("playbook-target-context")?.value?.trim() || "";
    const selectedCompetitorName = competitorSelect.value;

    if (!selectedCompetitorName) {
      alert("Please select a competitor");
      return;
    }

    if (!targetUrl && !targetContext) {
      alert("Please enter a target company URL or context");
      return;
    }

    generateBtn.disabled = true;
    const originalText = generateBtn.innerHTML;
    generateBtn.innerHTML = `<svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg> Generating...`;

    try {
      await generateSalesPlaybook(
        { url: targetUrl, context: targetContext },
        selectedCompetitorName,
        battlecard
      );
    } finally {
      generateBtn.disabled = false;
      generateBtn.innerHTML = originalText;
    }
  });
};

const generateSalesPlaybook = async (targetCompany, selectedCompetitorName, battlecard) => {
  const resultsContainer = document.getElementById("playbook-results");
  if (!resultsContainer) return;

  try {
    // Find the selected competitor in battlecard
    const competitor = battlecard.competitors.find(c => c.company_name === selectedCompetitorName);
    if (!competitor) {
      alert("Competitor not found");
      return;
    }

    // Call backend to generate playbook
    const response = await fetch(`${BACKEND_BASE_URL}/next-steps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target_company: {
          url: targetCompany.url,
          context: targetCompany.context
        },
        competitor: competitor,
        your_company: {
          name: battlecard.target_company?.company_name || "Our Company",
          how_we_win: battlecard.target_company?.how_we_win || [],
          pricing: battlecard.target_company?.pricing || []
        }
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `Failed to generate playbook (${response.status})`);
    }

    const data = await response.json();
    renderSalesPlaybook(data, resultsContainer);
  } catch (error) {
    console.error("Error generating sales playbook:", error);
    resultsContainer.innerHTML = `<div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><strong>Error:</strong> ${error.message}</div>`;
    toggleClass(resultsContainer, "hidden", false);
  }
};

const renderSalesPlaybook = (data, container) => {
  container.innerHTML = "";

  // Create collapsible sections for each part of the playbook
  const sections = [];

  // Objection Handling Section
  if (data.objection_handling?.common_objections) {
    const objectionSection = document.createElement("details");
    objectionSection.className = "rounded-2xl border border-slate-200/80 bg-white/95 backdrop-blur-sm shadow-md overflow-hidden mb-4";
    objectionSection.open = true;

    const summary = document.createElement("summary");
    summary.className = "flex items-center justify-between px-6 py-4 cursor-pointer select-none list-none font-semibold text-slate-700 hover:bg-slate-50 transition-colors";
    summary.innerHTML = `<span class="flex items-center gap-2">🎯 Objection Handling (${data.objection_handling.common_objections.length} objections)</span>`;

    const content = document.createElement("div");
    content.className = "px-6 pb-6 pt-1 space-y-4";

    data.objection_handling.common_objections.forEach((obj, idx) => {
      const objDiv = document.createElement("div");
      objDiv.className = "pb-4 border-b border-slate-200 last:border-0";

      let objContent = `<div class="font-medium text-slate-700 mb-2">❓ ${obj.objection}</div>`;
      objContent += `<div class="text-xs text-slate-500 mb-2">Category: ${obj.objection_category}</div>`;

      if (obj.responses && obj.responses.length > 0) {
        objContent += `<div class="space-y-2 mb-2">`;
        obj.responses.forEach((resp, respIdx) => {
          objContent += `<div class="text-sm bg-indigo-50 rounded p-2 border-l-2 border-indigo-300">
            <span class="font-semibold text-indigo-700">${resp.framework}:</span>
            <p class="text-slate-600 mt-1">${resp.response}</p>
          </div>`;
        });
        objContent += `</div>`;
      }

      if (obj.success_rate_note) {
        objContent += `<div class="text-xs text-emerald-600">✓ ${obj.success_rate_note}</div>`;
      }

      objDiv.innerHTML = objContent;
      content.appendChild(objDiv);
    });

    // Add ROI Calculator if available
    if (data.objection_handling.roi_calculator) {
      const roiDiv = document.createElement("div");
      roiDiv.className = "mt-4 pt-4 border-t border-slate-200";
      roiDiv.innerHTML = `
        <div class="font-medium text-slate-700 mb-2">💰 ROI Calculator</div>
        <div class="text-sm space-y-1 bg-emerald-50 rounded p-3">
          <div><span class="font-medium">Current State Cost:</span> ${data.objection_handling.roi_calculator.current_state_cost}</div>
          <div><span class="font-medium">Future Savings:</span> ${data.objection_handling.roi_calculator.future_state_savings}</div>
          <div><span class="font-medium">Cost of Delay:</span> ${data.objection_handling.roi_calculator.cost_of_delay}</div>
        </div>
      `;
      content.appendChild(roiDiv);
    }

    objectionSection.appendChild(summary);
    objectionSection.appendChild(content);
    sections.push(objectionSection);
  }

  // Competitive Narrative Section
  if (data.competitive_narrative) {
    const narrativeSection = document.createElement("details");
    narrativeSection.className = "rounded-2xl border border-slate-200/80 bg-white/95 backdrop-blur-sm shadow-md overflow-hidden mb-4";
    narrativeSection.open = true;

    const summary = document.createElement("summary");
    summary.className = "flex items-center justify-between px-6 py-4 cursor-pointer select-none list-none font-semibold text-slate-700 hover:bg-slate-50 transition-colors";
    summary.innerHTML = `<span class="flex items-center gap-2">📖 Competitive Narrative</span>`;

    const content = document.createElement("div");
    content.className = "px-6 pb-6 pt-1 space-y-4";

    if (data.competitive_narrative.positioning_angle) {
      const angleDiv = document.createElement("div");
      angleDiv.className = "pb-4 border-b border-slate-200";
      angleDiv.innerHTML = `
        <div class="font-medium text-slate-700 mb-2">🎯 Positioning Angle</div>
        <p class="text-sm text-slate-600">${data.competitive_narrative.positioning_angle}</p>
      `;
      content.appendChild(angleDiv);
    }

    if (data.competitive_narrative.buyer_aligned_story) {
      const storyDiv = document.createElement("div");
      storyDiv.className = "pb-4 border-b border-slate-200";
      storyDiv.innerHTML = `
        <div class="font-medium text-slate-700 mb-2">💬 Buyer-Aligned Story</div>
        <p class="text-sm text-slate-600">${data.competitive_narrative.buyer_aligned_story}</p>
      `;
      content.appendChild(storyDiv);
    }

    // Persona-specific narratives
    if (data.competitive_narrative.personas && data.competitive_narrative.personas.length > 0) {
      const personasDiv = document.createElement("div");
      personasDiv.className = "pb-4 border-b border-slate-200";
      personasDiv.innerHTML = `<div class="font-medium text-slate-700 mb-3">👥 By Stakeholder Type</div>`;

      data.competitive_narrative.personas.forEach(persona => {
        const personaDiv = document.createElement("div");
        personaDiv.className = "mb-3 p-3 rounded bg-slate-50 border-l-2 border-slate-300";
        personaDiv.innerHTML = `
          <div class="font-semibold text-slate-700">${persona.persona}</div>
          <p class="text-sm text-slate-600 mt-1">${persona.narrative}</p>
          ${persona.key_points ? `<div class="text-xs text-slate-500 mt-2"><strong>Key points:</strong> ${persona.key_points.join(", ")}</div>` : ""}
        `;
        personasDiv.appendChild(personaDiv);
      });

      content.appendChild(personasDiv);
    }

    narrativeSection.appendChild(summary);
    narrativeSection.appendChild(content);
    sections.push(narrativeSection);
  }

  // Add all sections to container
  sections.forEach(section => container.appendChild(section));
  toggleClass(container, "hidden", false);
};

if (selectors.form) {
  selectors.form.addEventListener("submit", handleSubmit);
}

// Add keyboard navigation for competitors (arrow keys)
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

  const tabs = Array.from(document.querySelectorAll(".competitor-tab"));
  if (tabs.length === 0) return;

  const activeTab = Array.from(document.querySelectorAll(".competitor-tab")).find(t => t.classList.contains("active"));
  if (!activeTab) return;

  const currentIndex = tabs.indexOf(activeTab);
  if (currentIndex === -1) return;

  if (e.key === "ArrowRight" && currentIndex < tabs.length - 1) {
    e.preventDefault();
    tabs[currentIndex + 1].click();
  } else if (e.key === "ArrowLeft" && currentIndex > 0) {
    e.preventDefault();
    tabs[currentIndex - 1].click();
  }
});

// Initialize saved battlecards UI on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    updateSavedBattlecardsUI();
  });
} else {
  updateSavedBattlecardsUI();
}

// Set up PDF download button
if (selectors.downloadPdfBtn) {
  selectors.downloadPdfBtn.addEventListener("click", handlePdfDownload);
}


window.renderBattlecards = renderBattlecards;

