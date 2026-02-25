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
  downloadPdfBtnSidebar: document.getElementById("download-pdf-btn-sidebar"),
  expandPlaybookBtnSidebar: document.getElementById("expand-playbook-btn-sidebar"),
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
// createScoreBar function removed - competitive score no longer displayed in UI

// Filter out irrelevant news (listicles, comparison articles, etc.)

// Simplified target card - removed heavy borders and boxes
// Market snapshot is now clearly its own separate section
const createTargetCard = (target, marketSummary) => {
  const section = document.createElement("section");
  // Removed border, rounded corners, background gradient, and shadow for cleaner look
  section.className = "space-y-12 py-6";

  // Market snapshot moved to sidebar tabs — not rendered in main content

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
  const resultsSection = document.getElementById("results");
  const targetHeader = document.getElementById("target-company-header");
  const competitorsList = document.getElementById("competitors-list");
  const scrollContainer = document.getElementById("competitors-scroll-container");
  const nextStepsSection = document.getElementById("next-steps-section");

  if (!resultsSection || !targetHeader || !competitorsList || !scrollContainer) return;

  // Render simple header: just "Battlecard for [company]"
  const target = data.target_company ?? {};
  targetHeader.textContent = `Battlecard for ${target.company_name || "Company"}`;

  // Set market tab label to "Competitive landscape"
  const marketCategory = document.getElementById("market-category");
  if (marketCategory) {
    marketCategory.textContent = "Competitive landscape";
  }

  // Set company tab label to "About [company name]"
  const companyTabLabel = document.getElementById("company-tab-label");
  if (companyTabLabel) {
    companyTabLabel.textContent = `About ${target.company_name || "Company"}`;
  }

  // Render Market Overview (shown in right panel when nav link clicked)
  const marketOverviewContent = document.getElementById("market-overview-content");
  if (marketOverviewContent) {
    let html = data.market_summary
      ? `<p class="text-slate-300 leading-relaxed mb-8">${data.market_summary}</p>`
      : `<p class="text-slate-500 mb-8">No market summary available.</p>`;

    // Add competitive landscape comparison matrix
    if (data.competitors && data.competitors.length > 0) {
      html += buildCompetitiveMatrix(data.target_company, data.competitors);
    }

    marketOverviewContent.innerHTML = html;
  }

  // Render Target Company Profile
  // Update company panel title and nav label
  const companyPanelTitle = document.getElementById("company-panel-title");
  if (companyPanelTitle) companyPanelTitle.textContent = `About ${target.company_name || "Company"}`;

  const targetProfileContent = document.getElementById("target-profile-content");
  if (targetProfileContent) {
    const hasData = target.overview || target.products?.length || target.strengths?.length || target.weaknesses?.length || target.pricing?.length;
    if (hasData) {
      // Build full-width layout matching competitor cards structure
      let html = ``;

      // 1. Overview (full width)
      if (target.overview) {
        html += `
          <div class="section-block mt-4">
            <div class="section-title mb-2">📋 Overview</div>
            <div class="overview-text text-slate-300">${target.overview}</div>
          </div>`;
      }

      // 2. Products (full width)
      if (target.products && target.products.length > 0) {
        html += `
          <div class="section-block mt-4">
            <div class="section-header">
              <h3 class="section-title">📦 Products</h3>
            </div>
            <div class="section-content space-y-2">
              ${target.products.map(item => `<div class="text-slate-300">• ${item}</div>`).join("")}
            </div>
          </div>`;
      }

      // 3 & 4. Strengths + Weaknesses (two columns)
      if ((target.strengths && target.strengths.length > 0) || (target.weaknesses && target.weaknesses.length > 0)) {
        html += `<div class="competitor-sections">`;

        if (target.strengths && target.strengths.length > 0) {
          html += `
            <div class="section-block">
              <div class="section-header">
                <h3 class="section-title">💪 Strengths</h3>
              </div>
              <ul class="section-content">
                ${target.strengths.map(item => `<li>${item}</li>`).join("")}
              </ul>
            </div>`;
        }

        if (target.weaknesses && target.weaknesses.length > 0) {
          html += `
            <div class="section-block">
              <div class="section-header">
                <h3 class="section-title">⚠️ Weaknesses</h3>
              </div>
              <ul class="section-content">
                ${target.weaknesses.map(item => `<li>${item}</li>`).join("")}
              </ul>
            </div>`;
        }

        html += `</div>`;
      }

      // 5. Pricing (full width)
      if (target.pricing && target.pricing.length > 0) {
        html += `
          <div class="section-block mt-4">
            <div class="section-header">
              <h3 class="section-title">💰 Pricing</h3>
            </div>
            <div class="section-content space-y-2">
              ${target.pricing.map(item => `<div class="text-slate-300">• ${item}</div>`).join("")}
            </div>
          </div>`;
      }

      targetProfileContent.innerHTML = html;
    } else {
      targetProfileContent.innerHTML = `<p class="text-slate-500">No company profile available.</p>`;
    }
  }

  // Render competitors list in sidebar
  const competitors = data.competitors ?? [];
  competitorsList.innerHTML = "";

  competitors.forEach((competitor, index) => {
    const { level: threatLevel, reason: threatReason } = calculateThreatLevel(competitor);
    const item = document.createElement("div");
    item.className = `competitor-sidebar-item ${index === 0 ? "active" : ""}`;
    item.dataset.competitorIndex = index;
    item.innerHTML = `
      <span class="name">${competitor.company_name || `Competitor ${index + 1}`}</span>
      <span class="threat-badge ${threatLevel.toLowerCase()}" data-threat-reason="${threatReason}">${threatLevel}</span>
    `;
    item.addEventListener("click", () => {
      // Update active state
      competitorsList.querySelectorAll(".competitor-sidebar-item").forEach(el => {
        el.classList.remove("active");
      });
      item.classList.add("active");

      // Ensure competitor cards are visible (hide any open panels)
      showCompetitorCards();

      // Scroll to competitor card
      const card = scrollContainer.querySelector(`[data-competitor-index="${index}"]`);
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    competitorsList.appendChild(item);
  });

  // Render competitor cards in main area
  scrollContainer.innerHTML = "";
  competitors.forEach((competitor, index) => {
    const card = createNewCompetitorCard(competitor, index);
    scrollContainer.appendChild(card);
  });

  // Show results section
  resultsSection.classList.remove("hidden");

  // Setup scroll tracking to update active sidebar item
  const mainArea = document.querySelector("main");
  if (mainArea) {
    mainArea.addEventListener("scroll", () => {
      const cards = scrollContainer.querySelectorAll("[data-competitor-index]");
      let currentIndex = 0;

      cards.forEach((card, idx) => {
        const rect = card.getBoundingClientRect();
        if (rect.top < window.innerHeight / 2) {
          currentIndex = idx;
        }
      });

      // Update sidebar active state
      competitorsList.querySelectorAll(".competitor-sidebar-item").forEach((item, idx) => {
        if (idx === currentIndex) {
          item.classList.add("active");
        } else {
          item.classList.remove("active");
        }
      });
    });
  }

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

    // Initialize Next Steps section for sales playbook generation
    initializeNextSteps(currentBattlecard);
  }
};

// Build competitive landscape matrix visualization — dynamic dimensions derived from profile data
const buildCompetitiveMatrix = (targetCompany, competitors) => {
  if (!competitors || competitors.length === 0) return "";

  const targetName = targetCompany?.company_name || "Your Company";
  const allCompanies = [targetCompany, ...competitors].filter(c => c);

  // ── Step 1: derive dimensions dynamically from what matters across profiles ──
  // Collect all text from profiles to find recurring themes
  const allText = allCompanies.flatMap(c => [
    c.overview || "",
    ...(c.strengths || []),
    ...(c.weaknesses || []),
    ...(c.how_we_win || []),
    ...(c.products || []),
  ]).join(" ").toLowerCase();

  // Candidate dimension pools — pick those with signal in the profile data
  const candidateDimensions = [
    {
      key: "pricing_transparency",
      label: "Pricing Transparency",
      keywords: ["pricing", "price", "cost", "affordable", "free tier", "enterprise pricing", "transparent"],
    },
    {
      key: "ease_of_use",
      label: "Ease of Use",
      keywords: ["easy", "simple", "intuitive", "no-code", "low-code", "drag", "onboard", "user-friendly"],
    },
    {
      key: "integration",
      label: "Integrations",
      keywords: ["integrat", "api", "connect", "plugin", "ecosystem", "sync", "webhook", "embed"],
    },
    {
      key: "ai_capability",
      label: "AI / Automation",
      keywords: ["ai", "artificial intelligence", "machine learning", "automat", "genai", "gpt", "llm", "ml"],
    },
    {
      key: "customization",
      label: "Customization",
      keywords: ["custom", "configur", "flexible", "tailor", "white-label", "branded"],
    },
    {
      key: "enterprise_readiness",
      label: "Enterprise Readiness",
      keywords: ["enterprise", "scale", "sso", "saml", "soc 2", "security", "compliance", "audit", "role-based"],
    },
    {
      key: "support",
      label: "Support & Community",
      keywords: ["support", "community", "documentation", "helpdesk", "onboarding", "success manager", "forum"],
    },
    {
      key: "content_depth",
      label: "Content / Curriculum",
      keywords: ["content", "curriculum", "course", "learning path", "certificate", "module", "lesson"],
    },
    {
      key: "analytics",
      label: "Analytics & Reporting",
      keywords: ["analytic", "reporting", "dashboard", "insight", "track", "metric", "progress"],
    },
    {
      key: "mobile",
      label: "Mobile Experience",
      keywords: ["mobile", "app", "ios", "android", "offline", "responsive"],
    },
    {
      key: "data_privacy",
      label: "Data & Privacy",
      keywords: ["privacy", "gdpr", "data residency", "hipaa", "data control", "own your data"],
    },
    {
      key: "speed_to_value",
      label: "Speed to Value",
      keywords: ["fast", "quick", "minutes", "instant", "time-to-value", "rapid deploy", "launch quickly"],
    },
  ];

  // Only keep dimensions that appear in the actual profile data
  const activeDimensions = candidateDimensions
    .filter(d => d.keywords.some(kw => allText.includes(kw)))
    .slice(0, 7); // cap at 7 for readability

  // Fall back to three generic ones if nothing matches
  if (activeDimensions.length < 3) {
    activeDimensions.push(
      { key: "strengths_breadth", label: "Feature Breadth", keywords: [] },
      { key: "pricing_transparency", label: "Pricing Transparency", keywords: ["pricing"] },
      { key: "ease_of_use", label: "Ease of Use", keywords: ["easy"] },
    );
  }

  // ── Step 2: score each company per active dimension ──
  // Returns { score: 1-5 | null, rationale: string }
  const scoreCompany = (company, dim) => {
    const allFields = [
      company.overview || "",
      ...(company.strengths || []),
      ...(company.weaknesses || []),
      ...(company.how_we_win || []),
      ...(company.products || []),
    ];
    const joined = allFields.join(" ").toLowerCase();

    const hitInStrength = (company.strengths || []).some(s =>
      dim.keywords.some(kw => s.toLowerCase().includes(kw))
    );
    const hitInWin = (company.how_we_win || []).some(s =>
      dim.keywords.some(kw => s.toLowerCase().includes(kw))
    );
    const hitInWeakness = (company.weaknesses || []).some(s =>
      dim.keywords.some(kw => s.toLowerCase().includes(kw))
    );
    const hitInOverview = dim.keywords.some(kw => (company.overview || "").toLowerCase().includes(kw));
    const anyHit = dim.keywords.some(kw => joined.includes(kw));

    if (!anyHit && dim.keywords.length > 0) {
      return { score: null, rationale: "Not mentioned in profile — needs verification" };
    }

    if (hitInWeakness && !hitInStrength && !hitInWin) {
      return { score: 2, rationale: "Listed as a weakness in the profile" };
    }
    if (hitInStrength && hitInWin) {
      return { score: 5, rationale: "Mentioned in both strengths and key differentiators" };
    }
    if (hitInStrength || hitInWin) {
      return { score: 4, rationale: hitInStrength ? "Listed as a strength in the profile" : "Called out as a key differentiator" };
    }
    if (hitInOverview) {
      return { score: 3, rationale: "Referenced in overview — depth unclear" };
    }
    return { score: 3, rationale: "Mentioned in profile but not highlighted" };
  };

  // Compute scores for all companies × dimensions
  const scores = {};
  allCompanies.forEach(c => {
    const name = c.company_name || "Company";
    scores[name] = {};
    activeDimensions.forEach(dim => {
      scores[name][dim.key] = scoreCompany(c, dim);
    });
  });

  // ── Step 3: build the HTML table ──
  let html = `
    <div class="mt-8 pt-8 border-t border-slate-700/30">
      <h3 class="text-base font-semibold text-slate-100 mb-1">Competitive Landscape Matrix</h3>
      <p class="text-xs text-slate-500 mb-5">Scores derived from battlecard profile data. Hover a cell for rationale. Cells marked <span class="font-semibold text-amber-400">NEEDS DATA</span> indicate gaps not covered by the current profile.</p>
      <div class="overflow-x-auto">
        <table class="w-full border-collapse text-sm">
          <thead>
            <tr class="border-b border-slate-700/50">
              <th class="text-left py-3 px-4 font-semibold text-slate-400 bg-slate-900/50 text-xs uppercase tracking-wider">Dimension</th>`;

  allCompanies.forEach(company => {
    const name = company.company_name || "Company";
    const isTarget = name === targetName;
    html += `<th class="text-center py-3 px-4 font-semibold text-xs ${isTarget ? 'bg-indigo-950/40 text-indigo-300 border-l-2 border-indigo-500' : 'text-slate-300'}">${name}</th>`;
  });

  html += `</tr></thead><tbody>`;

  activeDimensions.forEach(dim => {
    html += `<tr class="border-b border-slate-700/20 hover:bg-slate-900/30">
      <td class="py-3 px-4 font-medium text-slate-300 text-xs">${dim.label}</td>`;

    allCompanies.forEach(company => {
      const name = company.company_name || "Company";
      const isTarget = name === targetName;
      const { score, rationale } = scores[name][dim.key];
      const tdClass = `py-3 px-4 text-center ${isTarget ? 'bg-indigo-950/20 border-l-2 border-indigo-500' : ''}`;

      if (score === null) {
        html += `<td class="${tdClass}" title="${rationale}">
          <span class="text-xs font-semibold text-amber-400 cursor-help" title="${rationale}">NEEDS DATA</span>
        </td>`;
      } else {
        const barWidth = (score / 5) * 100;
        const color = score >= 4 ? "bg-emerald-600/60" : score >= 3 ? "bg-amber-600/60" : "bg-rose-600/50";
        html += `<td class="${tdClass}">
          <div class="flex items-center justify-center gap-2 group relative cursor-help" title="${rationale}">
            <div class="w-12 h-5 bg-slate-800/50 rounded border border-slate-700/50 overflow-hidden flex-shrink-0">
              <div class="${color} h-full transition-all" style="width: ${barWidth}%"></div>
            </div>
            <span class="text-xs font-semibold text-slate-300">${score}/5</span>
          </div>
        </td>`;
      }
    });

    html += `</tr>`;
  });

  html += `
    </tbody>
    </table>
  </div>

  <div class="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
    <span>🟢 Strong (4–5) — explicitly in strengths or differentiators</span>
    <span>🟡 Moderate (3) — mentioned but not highlighted</span>
    <span>🔴 Weak (1–2) — listed as weakness</span>
    <span class="text-amber-400">NEEDS DATA — not in current profile</span>
  </div>
`;

  return html;
};

// Calculate threat level based on competitor data
// Returns { level: "HIGH"|"MEDIUM"|"LOW", reason: string }
const calculateThreatLevel = (competitor) => {
  const strengthCount = competitor.strengths?.length || 0;
  const weaknessCount = competitor.weaknesses?.length || 0;
  const pricingCount  = competitor.pricing?.length || 0;
  const score = strengthCount + pricingCount;

  if (score >= 5) {
    return {
      level: "HIGH",
      reason: `${strengthCount} documented strengths with ${pricingCount > 0 ? "defined pricing tiers" : "broad feature coverage"} — strong competitive overlap`,
    };
  }
  if (score >= 2) {
    return {
      level: "MEDIUM",
      reason: `${strengthCount} documented strength${strengthCount !== 1 ? "s" : ""} — partial overlap; monitor closely`,
    };
  }
  return {
    level: "LOW",
    reason: weaknessCount > strengthCount
      ? `More weaknesses (${weaknessCount}) than strengths (${strengthCount}) — limited competitive threat`
      : "Insufficient data to fully assess; treat as low risk for now",
  };
};

// New function to create competitor card with sidebar layout styling
const createNewCompetitorCard = (competitor, index) => {
  const cardDiv = document.createElement("div");
  cardDiv.className = "competitor-card";
  cardDiv.dataset.competitorIndex = index;

  const { level: threatLevel, reason: threatReason } = calculateThreatLevel(competitor);
  const threatLevelClass = threatLevel.toLowerCase();

  // Card header with name, company details, and threat level
  const header = document.createElement("div");
  header.className = "competitor-card-header";

  const info = document.createElement("div");
  info.className = "competitor-card-info";

  // Name and details (no logo box)
  const details = document.createElement("div");
  const nameEl = document.createElement("div");
  nameEl.className = "competitor-name";
  nameEl.textContent = competitor.company_name || `Competitor ${index + 1}`;
  details.appendChild(nameEl);

  // Add company URL if available
  if (competitor.website || competitor.company_url) {
    const urlEl = document.createElement("div");
    urlEl.className = "competitor-url";
    urlEl.textContent = competitor.website || competitor.company_url;
    details.appendChild(urlEl);
  }

  // Add brief description if available
  if (competitor.description) {
    const descEl = document.createElement("div");
    descEl.className = "competitor-description";
    descEl.textContent = competitor.description;
    details.appendChild(descEl);
  }

  // Show adjacent competitor and similar metrics
  const metricsDiv = document.createElement("div");
  metricsDiv.className = "competitor-metrics";

  const realMetrics = [];
  if (competitor.adjacent_competitor !== undefined) {
    realMetrics.push({ label: "Adjacent Competitor", value: competitor.adjacent_competitor ? "Yes" : "No" });
  }
  if (competitor.is_similar !== undefined) {
    realMetrics.push({ label: "Similar", value: competitor.is_similar ? "Yes" : "No" });
  }
  if (competitor.similarity_score) {
    realMetrics.push({ label: "Similarity", value: `${competitor.similarity_score}%` });
  }

  if (realMetrics.length > 0) {
    realMetrics.forEach(metric => {
      const metricDiv = document.createElement("div");
      metricDiv.className = "metric";
      metricDiv.innerHTML = `
        <span class="metric-label">${metric.label}</span>
        <span class="metric-value">${metric.value}</span>
      `;
      metricsDiv.appendChild(metricDiv);
    });
    details.appendChild(metricsDiv);
  }
  info.appendChild(details);
  header.appendChild(info);

  // Threat level on the right
  const threatDiv = document.createElement("div");
  threatDiv.className = "threat-level";
  threatDiv.innerHTML = `<div class="threat-level-badge ${threatLevelClass}" data-threat-reason="${threatReason}">${threatLevel}</div>`;
  header.appendChild(threatDiv);

  cardDiv.appendChild(header);

  // 1. Overview (full width)
  if (competitor.overview) {
    const overviewSection = document.createElement("div");
    overviewSection.className = "section-block mt-4";
    const overviewTitle = document.createElement("div");
    overviewTitle.className = "section-title mb-2";
    overviewTitle.textContent = "📋 Overview";
    const overviewContent = document.createElement("div");
    overviewContent.className = "overview-text";
    overviewContent.textContent = competitor.overview;
    overviewSection.appendChild(overviewTitle);
    overviewSection.appendChild(overviewContent);
    cardDiv.appendChild(overviewSection);
  }

  // 2. Products (full width)
  if (competitor.products && competitor.products.length > 0) {
    cardDiv.appendChild(createSectionBlock("📦 Products", competitor.products, "", true));
  }

  // 3 & 4. Strengths + Weaknesses (two columns)
  const swContainer = document.createElement("div");
  swContainer.className = "competitor-sections";

  const leftCol = document.createElement("div");
  leftCol.className = "space-y-4";
  if (competitor.strengths && competitor.strengths.length > 0) {
    leftCol.appendChild(createSectionBlock("💪 Strengths", competitor.strengths));
  }

  const rightCol = document.createElement("div");
  rightCol.className = "space-y-4";
  if (competitor.weaknesses && competitor.weaknesses.length > 0) {
    rightCol.appendChild(createSectionBlock("⚠️ Weaknesses", competitor.weaknesses, "weakness"));
  }

  if (leftCol.children.length > 0 || rightCol.children.length > 0) {
    swContainer.appendChild(leftCol);
    swContainer.appendChild(rightCol);
    cardDiv.appendChild(swContainer);
  }

  // 5. Key Differentiators (full width)
  if (competitor.how_we_win && competitor.how_we_win.length > 0) {
    cardDiv.appendChild(createSectionBlock("🎯 Key Differentiators", competitor.how_we_win, "", true));
  }

  // 6. Potential Landmines (full width)
  if (competitor.potential_landmines && competitor.potential_landmines.length > 0) {
    cardDiv.appendChild(createSectionBlock("🚩 Potential Landmines", competitor.potential_landmines, "weakness", true));
  }

  // 7. Pricing (full width)
  if (competitor.pricing && competitor.pricing.length > 0) {
    cardDiv.appendChild(createPricingSection(competitor.pricing));
  }

  return cardDiv;
};

// Helper to create section blocks with copy functionality
const createSectionBlock = (title, items, itemClass = "", fullWidth = false) => {
  const section = document.createElement("div");
  section.className = `section-block ${fullWidth ? "col-span-2" : ""}`;

  const header = document.createElement("div");
  header.className = "section-header";

  const titleEl = document.createElement("div");
  titleEl.className = "section-title";
  titleEl.textContent = title;

  const copyBtn = document.createElement("button");
  copyBtn.className = "copy-btn";
  copyBtn.type = "button";
  copyBtn.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg> Copy`;

  copyBtn.addEventListener("click", async (e) => {
    const text = items.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.classList.add("copied");
      copyBtn.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Copied!`;
      setTimeout(() => {
        copyBtn.classList.remove("copied");
        copyBtn.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg> Copy`;
      }, 2000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  });

  header.appendChild(titleEl);
  header.appendChild(copyBtn);
  section.appendChild(header);

  const content = document.createElement("ul");
  content.className = "section-content";

  items.forEach(item => {
    const li = document.createElement("li");
    if (itemClass) li.className = itemClass;
    li.textContent = item;
    content.appendChild(li);
  });

  section.appendChild(content);
  return section;
};

// Helper to create pricing section with special styling
const createPricingSection = (pricing) => {
  const section = document.createElement("div");
  section.className = "section-block col-span-2";

  const header = document.createElement("div");
  header.className = "section-header";
  const titleEl = document.createElement("div");
  titleEl.className = "section-title";
  titleEl.textContent = "💰 Pricing";

  const copyBtn = document.createElement("button");
  copyBtn.className = "copy-btn";
  copyBtn.type = "button";
  copyBtn.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg> Copy`;

  copyBtn.addEventListener("click", async (e) => {
    const text = pricing.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.classList.add("copied");
      copyBtn.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Copied!`;
      setTimeout(() => {
        copyBtn.classList.remove("copied");
        copyBtn.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg> Copy`;
      }, 2000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  });

  header.appendChild(titleEl);
  header.appendChild(copyBtn);
  section.appendChild(header);

  const content = document.createElement("ul");
  content.className = "pricing-content";
  pricing.forEach(item => {
    const priceItem = document.createElement("li");
    priceItem.className = "pricing-item";
    priceItem.textContent = item;
    content.appendChild(priceItem);
  });

  section.appendChild(content);
  return section;
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
  // Handle normalized battlecard that stores raw data in rawData property
  const data = (battlecard && battlecard.rawData) ? battlecard.rawData : battlecard;

  if (!data || !data.competitors || data.competitors.length === 0) {
    console.log("initializeNextSteps: No competitors found");
    return;
  }

  const nextStepsSection = document.getElementById("next-steps-section");
  const competitorSelect = document.getElementById("playbook-competitor-select");
  const generateBtn = document.getElementById("generate-playbook-btn");
  const collapseBtn = document.getElementById("collapse-playbook-btn");
  const segmentToggles = document.querySelectorAll(".segment-toggle");

  if (!competitorSelect || !generateBtn) {
    console.error("initializeNextSteps: missing required elements");
    return;
  }

  console.log("Initializing next steps with", data.competitors.length, "competitors");

  // Helper: show the playbook section and scroll to it
  const showPlaybookSection = () => {
    if (nextStepsSection) {
      nextStepsSection.classList.remove("hidden");
      nextStepsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Sidebar "Generate Playbook" button
  const expandPlaybookBtnSidebar = document.getElementById("expand-playbook-btn-sidebar");
  if (expandPlaybookBtnSidebar && !expandPlaybookBtnSidebar.dataset.initialized) {
    expandPlaybookBtnSidebar.addEventListener("click", showPlaybookSection);
    expandPlaybookBtnSidebar.dataset.initialized = "true";
  }

  // Close button inside the form
  if (collapseBtn && !collapseBtn.dataset.initialized) {
    collapseBtn.addEventListener("click", () => {
      if (nextStepsSection) nextStepsSection.classList.add("hidden");
      const resultsContainer = document.getElementById("playbook-results");
      if (resultsContainer) {
        resultsContainer.innerHTML = "";
        resultsContainer.classList.add("hidden");
      }
    });
    collapseBtn.dataset.initialized = "true";
  }

  // Set up B2B/B2C toggle handlers
  segmentToggles.forEach(toggle => {
    if (!toggle.dataset.initialized) {
      toggle.addEventListener("change", (e) => {
        const b2bSection = document.getElementById("b2b-section");
        const b2cSection = document.getElementById("b2c-section");

        if (e.target.value === "b2b") {
          b2bSection?.classList.remove("hidden");
          b2cSection?.classList.add("hidden");
        } else if (e.target.value === "b2c") {
          b2bSection?.classList.add("hidden");
          b2cSection?.classList.remove("hidden");
        }
      });
      toggle.dataset.initialized = "true";
    }
  });

  // Clear any existing options (except the first placeholder)
  while (competitorSelect.options.length > 1) {
    competitorSelect.removeChild(competitorSelect.lastChild);
  }

  // Populate competitor dropdown
  data.competitors.forEach((competitor, index) => {
    const option = document.createElement("option");
    option.value = competitor.company_name || `Competitor ${index + 1}`;
    option.textContent = competitor.company_name || `Competitor ${index + 1}`;
    competitorSelect.appendChild(option);
  });

  // Set up generate button handler (only once to avoid duplicate handlers)
  if (!generateBtn.dataset.initialized) {
    generateBtn.addEventListener("click", () => {
      // Detect B2B vs B2C mode
      const segmentType = document.querySelector("input[name='segment-type']:checked")?.value || "b2b";
      let targetCompanyData = {};

      if (segmentType === "b2b") {
        const targetUrl = document.getElementById("playbook-target-url")?.value?.trim() || "";
        const targetContext = document.getElementById("playbook-target-context")?.value?.trim() || "";

        if (!targetUrl && !targetContext) {
          alert("Please enter a target company URL or context");
          return;
        }
        targetCompanyData = { url: targetUrl, context: targetContext, type: "b2b" };
      } else {
        const personaName = document.getElementById("playbook-persona-name")?.value?.trim() || "";
        const personaContext = document.getElementById("playbook-persona-context")?.value?.trim() || "";

        if (!personaName && !personaContext) {
          alert("Please enter a persona name or details");
          return;
        }
        targetCompanyData = { persona_name: personaName, persona_context: personaContext, type: "b2c" };
      }

      const selectedCompetitorName = competitorSelect.value;
      if (!selectedCompetitorName || selectedCompetitorName === "") {
        alert("Please select a competitor");
        return;
      }

      generateSalesPlaybook(targetCompanyData, selectedCompetitorName, data);
    });
    generateBtn.dataset.initialized = "true";
  }
};

// ─── Playbook: build entirely from existing battlecard data, no API call ─────

const extractDomain = (url = "") => {
  try { return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace("www.", ""); }
  catch { return url; }
};

// ── Context relevance helpers ──────────────────────────────────────────────
const getContextKeywords = (text) => {
  const stop = new Set(["a","an","the","in","on","at","to","for","of","and","or","but","with",
    "that","this","is","are","was","were","be","been","have","has","do","does","did","will",
    "would","could","should","may","might","can","from","by","as","into","their","they","it",
    "its","my","our","your","his","her","we","i","you","he","she","who","what","which","when",
    "where","how","very","just","also","more","most","some","any","all","both","each","than","so"]);
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter(w => w.length > 3 && !stop.has(w));
};

const scoreRelevance = (text, keywords) =>
  keywords.filter(kw => text.toLowerCase().includes(kw)).length;

// Return items sorted most-relevant-to-persona/company first
const rankByContext = (items, keywords) => {
  if (!keywords.length) return items;
  return [...items]
    .map((item, i) => ({ item, score: scoreRelevance(item, keywords), i }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(o => o.item);
};

// Short first-clause of context for inline use: "mid-career professional switching into tech"
const firstClause = (text) => text.split(/[.,;]/)[0].trim().toLowerCase();

// ── Per-section builders — every one takes contextLabel + contextDetails ──

// 1. Positioning angle — incorporate research pain points & priorities
const buildPositioningAngle = (differentiators, theirWeaknesses, theirName, ourName, contextLabel, contextDetails, isB2C, painPoints = []) => {
  const d1 = differentiators[0] || "";
  const d2 = differentiators[1] || "";
  const w1 = theirWeaknesses[0] || "";

  const forWhom = isB2C && contextDetails
    ? `For someone ${firstClause(contextDetails)}`
    : `For ${contextLabel}`;

  // If we have pain points, frame the angle around what matters to them
  let angle = `${forWhom}, ${ourName} beats ${theirName} where it counts.`;

  if (painPoints.length > 0) {
    // Find differentiators that address the top pain point
    const relevantDiff = differentiators.find(d =>
      painPoints.some(p => d.toLowerCase().includes(p.toLowerCase().split(" ")[0]))
    ) || d1;
    angle += ` When ${painPoints[0]} is the priority, ${relevantDiff.replace(/\.$/, "").toLowerCase()}.`;
  } else if (d1) {
    angle += ` ${d1.replace(/\.$/, "")}.`;
  }

  if (w1) angle += ` ${theirName}'s gap: ${w1.charAt(0).toLowerCase() + w1.slice(1).replace(/\.$/, "")}.`;
  if (d2 && d2 !== d1) angle += ` ${d2.replace(/\.$/, "")}.`;
  return angle;
};

// 2. Opening hook — enhanced with pain points if available
const buildOpeningHook = (theirName, contextLabel, contextDetails, isB2C, painPoints = []) => {
  const topPain = painPoints.length > 0 ? painPoints[0] : null;

  if (isB2C && contextDetails) {
    const situation = firstClause(contextDetails);
    if (topPain) {
      return `"You mentioned you're ${situation}, and ${topPain.toLowerCase()} is critical. Here's the hard truth about ${theirName}: they optimize for scale, not for that specific challenge. Let's talk about what actually solves it."`;
    }
    return `"You mentioned you're ${situation}. The question isn't whether ${theirName} has content — it's whether what you get from them actually achieves that goal. Let's start there."`;
  }

  if (!isB2C && contextLabel && contextLabel !== "the prospect") {
    if (topPain) {
      return `"For ${contextLabel}, ${topPain.toLowerCase()} is likely your biggest constraint. ${theirName} isn't built to solve that. Here's why we are."`;
    }
    return `"For a company like ${contextLabel}, the evaluation shouldn't stop at feature comparison against ${theirName}. What matters is which option moves the metric you care about. Let's dig into that."`;
  }

  if (topPain) {
    return `"${topPain} is what's keeping you up at night. ${theirName} won't solve it. Here's why, and what actually will."`;
  }

  return `"${theirName} is a known name — but let's compare outcomes, not just features. What does success actually look like for you?"`;
};

// 3. Lead-withs — each differentiator reframed around the audience
const buildLeadWiths = (differentiators, contextLabel, contextDetails, isB2C) => {
  const prefix = isB2C && contextDetails
    ? `For someone ${firstClause(contextDetails)}`
    : `For ${contextLabel}`;
  return differentiators.map(d => `${prefix}: ${d.replace(/\.$/, "")}`);
};

// 4. Watch Out For — landmine + audience-specific counter
const buildWatchOutFor = (landmines, differentiators, contextLabel, contextDetails, isB2C) => {
  const audience = isB2C && contextDetails ? firstClause(contextDetails) : contextLabel;
  return landmines.map((landmine, i) => {
    const base = differentiators[i % Math.max(differentiators.length, 1)] || "";
    const counter = base
      ? `${base.replace(/\.$/, "")} — especially relevant for ${audience}.`
      : `Keep the conversation focused on what matters most for ${audience}.`;
    return { landmine, counter };
  });
};

// 5. Discovery questions — persona/company prefix + pain point context
const differentiatorToQuestion = (diff, theirName, contextLabel, contextDetails, isB2C, painPoints = []) => {
  const l = diff.toLowerCase();
  let q;
  if (l.includes("accredit") || l.includes("recogni") || l.includes("verif"))
    q = "Does the credential need to be verifiable by an employer — or is personal development enough?";
  else if (l.includes("certif") || l.includes("certificate"))
    q = "Are the certifications recognized by the specific employers or institutions you're targeting?";
  else if (l.includes("degree") || l.includes("universit") || l.includes("academic"))
    q = "Is a university-backed credential on the table, or are you looking for something shorter-term?";
  else if (l.includes("employer") || l.includes("hire") || l.includes("hir") || l.includes("job pipeline"))
    q = "Are you measuring success by the role change you land — or just by completing the course?";
  else if (l.includes("ai") || l.includes("deepfake") || l.includes("phish") || l.includes("threat"))
    q = "Is the training built for today's threats — or is it curriculum that hasn't changed in years?";
  else if (l.includes("adaptive") || l.includes("personaliz") || l.includes("tailor"))
    q = "Does the platform adapt to each learner, or does everyone get the same experience regardless?";
  else if (l.includes("price") || l.includes("cost") || l.includes("roi") || l.includes("invest"))
    q = "When comparing costs, are you looking at the outcome delivered — not just the price tag?";
  else if (l.includes("support") || l.includes("integrat") || l.includes("onboard"))
    q = "What does support look like after you sign — and how quickly do you see measurable results?";
  else if (l.includes("partner") || l.includes("google") || l.includes("ibm") || l.includes("microsoft"))
    q = "Are the companies behind this curriculum ones your buyers or employers would actually recognize?";
  else {
    const core = diff.replace(/^[^a-zA-Z]*/, "").split(" ").slice(0, 7).join(" ").toLowerCase();
    q = `Does "${core}" actually move the needle on what you're trying to accomplish?`;
  }

  // Add pain point context if available
  if (painPoints.length > 0 && !q.includes("?")) {
    // Ensure q ends with ?
    q = q.replace(/\?$/, "") + "?";
  }

  // Prefix with persona or company
  if (isB2C && contextDetails)
    return `Given that you're ${firstClause(contextDetails)}: ${q}`;
  if (!isB2C && contextLabel && contextLabel !== "the prospect")
    return `For a company like ${contextLabel}: ${q}`;
  return q;
};

// 6. Pricing — persona/company-specific ROI framing first
const buildPricingNarrative = (theirPricing, ourPricing, theirName, ourName, contextLabel, contextDetails, isB2C) => {
  const theirLine = theirPricing[0] || null;
  const ourLine   = ourPricing[0]   || null;
  if (!theirLine && !ourLine) return null;

  const roiAngle = isB2C && contextDetails
    ? `For someone ${firstClause(contextDetails)}: the ROI question isn't which is cheaper — it's which one actually gets you to your goal.`
    : `For ${contextLabel}: total cost of ownership matters more than list price. Factor in time-to-value, not just the monthly fee.`;

  let out = roiAngle + "\n\n";
  if (theirLine) out += `**${theirName}:** ${theirLine}`;
  if (theirLine && ourLine) out += `\n**${ourName}:** ${ourLine}`;
  else if (ourLine) out += `**${ourName}:** ${ourLine}`;
  const extras = [
    ...theirPricing.slice(1).map(p => `${theirName}: ${p}`),
    ...ourPricing.slice(1).map(p =>   `${ourName}: ${p}`)
  ];
  if (extras.length) out += `\n${extras.join("  ·  ")}`;
  return out;
};

// ── Main builder ───────────────────────────────────────────────────────────
const buildPlaybookFromBattlecard = (competitor, yourCompany, targetContext) => {
  const isB2C          = targetContext.type === "b2c";
  const contextLabel   = isB2C
    ? (targetContext.persona_name || "your prospect")
    : (targetContext.url ? extractDomain(targetContext.url) : "the prospect");
  const contextDetails = isB2C
    ? (targetContext.persona_context || "")
    : (targetContext.context || "");

  // Extract research data (pain points, priorities, etc)
  const painPoints     = targetContext.painPoints || [];
  const priorities     = targetContext.priorities || [];
  const industry       = targetContext.industry || null;
  const companySize    = targetContext.companySize || null;

  // Rank all battlecard lists by relevance to the persona/company context
  const keywords        = getContextKeywords(`${contextLabel} ${contextDetails}`);
  const ourName         = yourCompany.company_name || "Us";
  const theirName       = competitor.company_name  || "Competitor";
  const differentiators = rankByContext(competitor.how_we_win         || [], keywords);
  const landmines       = rankByContext(competitor.potential_landmines || [], keywords);
  const theirWeaknesses = rankByContext(competitor.weaknesses          || [], keywords);
  const theirPricing    = competitor.pricing   || [];
  const ourPricing      = yourCompany.pricing  || [];

  // Pass pain points to all builders for richer context
  const positioningAngle   = buildPositioningAngle(differentiators, theirWeaknesses, theirName, ourName, contextLabel, contextDetails, isB2C, painPoints);
  const openingHook        = buildOpeningHook(theirName, contextLabel, contextDetails, isB2C, painPoints);
  const leadWith           = buildLeadWiths(differentiators, contextLabel, contextDetails, isB2C);
  const watchOutFor        = buildWatchOutFor(landmines, differentiators, contextLabel, contextDetails, isB2C);
  const rawQuestions       = differentiators.slice(0, 4)
    .map(d => differentiatorToQuestion(d, theirName, contextLabel, contextDetails, isB2C, painPoints));
  const discoveryQuestions = [...new Set(rawQuestions)];
  const pricingFrame       = buildPricingNarrative(theirPricing, ourPricing, theirName, ourName, contextLabel, contextDetails, isB2C);

  return { competitorName: theirName, yourName: ourName, contextLabel, contextDetails, isB2C,
           positioningAngle, openingHook, leadWith, watchOutFor, discoveryQuestions, pricingFrame, theirWeaknesses,
           painPoints, priorities, industry, companySize };
};

// Render the cheat-sheet playbook
const renderSalesPlaybook = (playbook, container) => {
  const { competitorName, yourName, contextLabel, positioningAngle, openingHook,
          leadWith, watchOutFor, discoveryQuestions, pricingFrame, theirWeaknesses,
          painPoints = [], priorities = [], industry = null } = playbook;

  const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

  const sectionHTML = (emoji, title, body) => `
    <div class="mb-6 rounded-xl border border-slate-200/60 bg-white/95 shadow-sm overflow-hidden">
      <div class="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50/80">
        <span class="text-base">${emoji}</span>
        <span class="text-sm font-semibold text-slate-700">${title}</span>
      </div>
      <div class="px-5 py-4 text-sm text-slate-600 space-y-2">${body}</div>
    </div>`;

  let html = `<div class="space-y-1 mb-5 text-xs text-slate-500">
    <span class="font-medium text-slate-600">vs ${esc(competitorName)}</span>
    <span class="mx-1.5">·</span>
    <span>${esc(contextLabel)}</span>`;
    if (industry) {
      html += `<span class="mx-1.5">·</span><span>${esc(industry)}</span>`;
    }
  html += `</div>`;

  // 0. Research Context (if available)
  if (painPoints.length > 0) {
    const painBody = `<ul class="space-y-1">` +
      painPoints.slice(0, 3).map(p => `<li class="flex items-start gap-1.5"><span class="text-red-500 mt-0.5">•</span><span>${esc(p)}</span></li>`).join("") +
      `</ul><p class="mt-2 text-xs text-slate-400 italic">Use this context to frame your messaging.</p>`;
    html += sectionHTML("🎯", "What Matters Most", painBody);
  }

  // 1. Positioning Angle
  html += sectionHTML("🎯", "Positioning Angle", `<p class="leading-relaxed">${esc(positioningAngle)}</p>`);

  // 2. How to Open the Conversation
  let openBody = `<p class="italic text-slate-700 border-l-2 border-indigo-300 pl-3 mb-3">${esc(openingHook)}</p>`;
  if (leadWith.length) {
    openBody += `<p class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Lead with:</p>
      <ul class="space-y-1">` +
      leadWith.map(d => `<li class="flex items-start gap-1.5"><span class="text-indigo-400 mt-0.5">•</span><span>${esc(d)}</span></li>`).join("") +
      `</ul>`;
  }
  html += sectionHTML("🚀", "How to Open the Conversation", openBody);

  // 3. Watch Out For
  if (watchOutFor.length) {
    let watchBody = `<table class="w-full text-xs border-collapse">
      <thead><tr class="text-left border-b border-slate-200">
        <th class="pb-2 pr-3 font-semibold text-slate-500 w-2/5">Landmine to watch for</th>
        <th class="pb-2 font-semibold text-slate-500">Your counter</th>
      </tr></thead>
      <tbody class="divide-y divide-slate-100">` +
      watchOutFor.map(({ landmine, counter }) =>
        `<tr>
          <td class="py-2.5 pr-3 text-slate-600 align-top">${esc(landmine)}</td>
          <td class="py-2.5 text-slate-600 align-top">${esc(counter)}</td>
        </tr>`
      ).join("") +
      `</tbody></table>`;
    html += sectionHTML("⚠️", "Watch Out For (Potential Landmines)", watchBody);
  }

  // 4. Discovery Questions
  if (discoveryQuestions.length) {
    const qBody = `<ul class="space-y-2">` +
      discoveryQuestions.map(q => `<li class="flex items-start gap-1.5">
        <span class="text-emerald-500 font-bold mt-0.5">?</span>
        <span>${esc(q)}</span></li>`).join("") +
      `</ul>`;
    html += sectionHTML("🔍", "Discovery Questions", qBody);
  }

  // 5. Objection Responses (from their weaknesses)
  if (theirWeaknesses.length) {
    const objBody = `<ul class="space-y-2.5">` +
      theirWeaknesses.map(w => `<li class="flex items-start gap-2">
        <span class="text-amber-500 mt-0.5 flex-shrink-0">▶</span>
        <span><span class="font-medium text-slate-700">If they bring up a ${esc(competitorName)} strength —</span> ${esc(w)}</span>
      </li>`).join("") +
      `</ul>`;
    html += sectionHTML("💬", "Objection Responses", objBody);
  }

  // 6. Pricing / ROI
  if (pricingFrame) {
    const rows = pricingFrame.split("\n").map(line => {
      const bold = line.replace(/\*\*(.+?)\*\*/g, '<span class="font-semibold text-slate-700">$1</span>');
      return `<p class="leading-relaxed">${bold}</p>`;
    }).join("");
    const pricingBody = rows +
      `<p class="mt-3 text-xs text-slate-400 italic">Don't just echo the number — frame it as value delivered per dollar.</p>`;
    html += sectionHTML("💰", "Pricing / ROI Framing", pricingBody);
  }

  container.innerHTML = html;
  container.classList.remove("hidden");
};

const generateSalesPlaybook = async (targetCompany, selectedCompetitorName, data) => {
  const resultsContainer = document.getElementById("playbook-results");
  if (!resultsContainer) return;

  const competitor = data.competitors.find(c => c.company_name === selectedCompetitorName);
  if (!competitor) {
    resultsContainer.innerHTML = `<p class="text-red-500 text-sm">Competitor "${selectedCompetitorName}" not found in battlecard data.</p>`;
    resultsContainer.classList.remove("hidden");
    return;
  }

  // Show loading state while researching target company/persona
  resultsContainer.innerHTML = `
    <div class="text-slate-300 text-sm flex items-center gap-2">
      <div class="loader" style="width: 16px; height: 16px;"></div>
      Researching target ${targetCompany.type === "b2c" ? "audience" : "company"}...
    </div>
  `;
  resultsContainer.classList.remove("hidden");

  // Research the target company or persona to get rich context
  let enrichedTargetData = { ...targetCompany };
  try {
    const researchPayload = {
      research_type: targetCompany.type === "b2c" ? "persona" : "company",
      query: targetCompany.type === "b2c"
        ? `${targetCompany.persona_name}: ${targetCompany.persona_context}`
        : targetCompany.url,
    };

    const response = await fetch(`${BACKEND_BASE_URL}/research`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(researchPayload),
    });

    if (response.ok) {
      const research = await response.json();
      enrichedTargetData.research = research;
      enrichedTargetData.painPoints = research.pain_points || [];
      enrichedTargetData.priorities = research.priorities || [];
      enrichedTargetData.industry = research.industry || null;
      enrichedTargetData.companySize = research.company_size || null;
      console.log("Successfully researched target:", enrichedTargetData);
    } else {
      console.warn("Research request failed with status:", response.status);
    }
  } catch (err) {
    console.warn("Target research failed, proceeding with basic data", err);
  }

  const yourCompany = data.target_company || {};
  const playbook = buildPlaybookFromBattlecard(competitor, yourCompany, enrichedTargetData);
  renderSalesPlaybook(playbook, resultsContainer);
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

// Set up PDF download button (sidebar only now)
if (selectors.downloadPdfBtnSidebar) {
  selectors.downloadPdfBtnSidebar.addEventListener("click", handlePdfDownload);
}

// Sidebar nav links → show/hide right-panel content
const navLinks = document.querySelectorAll(".sidebar-nav-link");
const competitorScrollContainer = document.getElementById("competitors-scroll-container");

function showMainPanel(panelId) {
  // Hide all content panels and competitors
  ["main-market-panel", "main-company-panel"].forEach(id => {
    document.getElementById(id)?.classList.add("hidden");
  });
  competitorScrollContainer?.classList.add("hidden");

  // Show target panel
  document.getElementById(panelId)?.classList.remove("hidden");

  // Update nav link active styles
  navLinks.forEach(l => {
    const isActive = l.dataset.panel === panelId;
    l.classList.toggle("active", isActive);
  });
}

function showCompetitorCards() {
  ["main-market-panel", "main-company-panel"].forEach(id => {
    document.getElementById(id)?.classList.add("hidden");
  });
  competitorScrollContainer?.classList.remove("hidden");

  // Clear active state on nav links
  navLinks.forEach(l => {
    l.classList.remove("active");
  });
}

navLinks.forEach(link => {
  link.addEventListener("click", () => {
    const panelId = link.dataset.panel;
    const panel = document.getElementById(panelId);
    // Toggle: if already visible, go back to competitor cards
    if (panel && !panel.classList.contains("hidden")) {
      showCompetitorCards();
    } else {
      showMainPanel(panelId);
    }
  });
});

// Close (✕) buttons inside panels
document.querySelectorAll(".panel-close-btn").forEach(btn => {
  btn.addEventListener("click", () => showCompetitorCards());
});

window.renderBattlecards = renderBattlecards;

