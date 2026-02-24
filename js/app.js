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
  const estimatedTotal = 120; // Estimated total time in seconds (2 minutes)
  const remaining = Math.max(0, estimatedTotal - elapsedSeconds);
  const remainingMinutes = Math.floor(remaining / 60);
  const remainingSeconds = Math.floor(remaining % 60);
  const timeEstimate = remaining > 30 
    ? ` (~${remainingMinutes}m ${remainingSeconds}s remaining)`
    : remaining > 0
    ? ` (~${remainingSeconds}s remaining)`
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
const isRelevantNews = (newsItem) => {
  if (!newsItem || !newsItem.title) return false;
  const title = (newsItem.title + " " + (newsItem.snippet || "")).toLowerCase();
  const irrelevantKeywords = [
    "alternatives",
    "competitors",
    "best X for",
    " vs ",
    "compared to",
    "instead of",
    "replace",
    "switch from",
  ];
  return !irrelevantKeywords.some((keyword) => title.includes(keyword));
};

// Section with copy-to-clipboard button (used for Key Differentiators and Potential Landmines)
const createCopyableSection = (title, items, accentClass) => {
  const section = document.createElement("div");
  section.className =
    "rounded-2xl border border-slate-200/80 bg-white/95 backdrop-blur-sm p-6 shadow-md transition-all duration-200 hover:shadow-lg";

  const titleRow = document.createElement("div");
  titleRow.className = "flex items-center justify-between mb-3";

  const heading = document.createElement("h3");
  heading.className = `section-title ${accentClass}`;
  heading.textContent = title;
  titleRow.appendChild(heading);

  // Copy button
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
  
  const category = document.createElement("p");
  category.className = "text-xs uppercase tracking-wider text-indigo-600 font-semibold mt-2";
  category.textContent = competitor.category || "Market competitor";

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

    const tooltipHTML = `
      <div class="font-semibold mb-1.5 text-white">
        ${competitorType.toUpperCase()} COMPETITOR
      </div>
      <div class="mb-2 text-slate-300">${typeDesc}</div>
      <div class="grid grid-cols-2 gap-1 text-slate-400 text-xs mb-2 border-t border-slate-700 pt-1.5">
        <div>• Industry: <span class="text-slate-200 font-medium">${industry}%</span></div>
        <div>• Product: <span class="text-slate-200 font-medium">${product}%</span></div>
        <div>• Audience: <span class="text-slate-200 font-medium">${audience}%</span></div>
        <div>• Size: <span class="text-slate-200 font-medium">${size}%</span></div>
        <div>• Business model: <span class="text-slate-200 font-medium">${model}%</span></div>
      </div>
      ${reason ? `<div class="border-t border-slate-700 pt-1.5 text-slate-300 italic">"${reason}"</div>` : ""}
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
    createCopyableSection("Key Differentiators", competitor.how_we_win, "text-red-500"),
    createCopyableSection(
      "Potential landmines",
      competitor.potential_landmines,
      "text-purple-500",
    ),
  );

  // Add pricing section at the end with full width (2 columns)
  const pricingSection = createPricingSection("Pricing", competitor.pricing, "text-blue-600");
  grid.appendChild(pricingSection);

  // Recent news section (collapsible, only shown if relevant news exists)
  const allNewsItems = Array.isArray(competitor.news) ? competitor.news.filter(n => n && n.title) : [];
  const newsItems = allNewsItems.filter(isRelevantNews);
  if (newsItems.length > 0) {
    const newsWrapper = document.createElement("div");
    newsWrapper.className = "col-span-full mt-2";

    const details = document.createElement("details");
    details.className = "rounded-2xl border border-slate-200/80 bg-white/95 backdrop-blur-sm shadow-md overflow-hidden";

    const summary = document.createElement("summary");
    summary.className = "flex items-center justify-between gap-2 px-6 py-4 cursor-pointer select-none list-none text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors";
    summary.innerHTML = `<span class="flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg>Recent news <span class="text-slate-400 font-normal">(${newsItems.length})</span></span><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="details-chevron text-slate-400 transition-transform"><polyline points="6 9 12 15 18 9"/></svg>`;
    details.appendChild(summary);

    const newsBody = document.createElement("div");
    newsBody.className = "px-6 pb-5 pt-1 space-y-3";

    newsItems.forEach((item) => {
      const newsItem = document.createElement("div");
      newsItem.className = "flex flex-col gap-0.5";

      const titleEl = document.createElement("a");
      titleEl.href = item.link || "#";
      titleEl.target = "_blank";
      titleEl.rel = "noopener noreferrer";
      titleEl.className = "text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:underline leading-snug transition-colors";
      titleEl.textContent = item.title;
      newsItem.appendChild(titleEl);

      if (item.snippet) {
        const snippetEl = document.createElement("p");
        snippetEl.className = "text-xs text-slate-500 leading-relaxed line-clamp-2";
        snippetEl.textContent = item.snippet.substring(0, 150);
        newsItem.appendChild(snippetEl);
      }

      newsBody.appendChild(newsItem);
    });

    details.appendChild(newsBody);
    newsWrapper.appendChild(details);
    grid.appendChild(newsWrapper);
  }

  // Add competitor navigation buttons
  const competitors = document.querySelectorAll('[data-competitor-index]') ?
    Array.from(document.querySelectorAll('[data-competitor-index]')) : [];
  const competitorCount = competitors.length;

  if (competitorCount > 1) {
    const navWrapper = document.createElement("div");
    navWrapper.className = "col-span-full mt-4 flex items-center justify-center gap-4";

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "flex items-center gap-1 px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
    prevBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg> Previous`;
    prevBtn.dataset.direction = "prev";

    const counterSpan = document.createElement("span");
    counterSpan.className = "text-sm font-semibold text-slate-600 whitespace-nowrap";
    counterSpan.textContent = `${index + 1} of ${competitorCount}`;

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "flex items-center gap-1 px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
    nextBtn.innerHTML = `Next <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
    nextBtn.dataset.direction = "next";

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

if (selectors.form) {
  selectors.form.addEventListener("submit", handleSubmit);
}

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

