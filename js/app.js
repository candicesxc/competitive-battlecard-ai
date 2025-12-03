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
  progressValue: document.getElementById("progress-value"),
  progressMessage: document.getElementById("progress-message"),
  results: document.getElementById("results"),
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
  if (selectors.progressValue) {
    selectors.progressValue.textContent = `${Math.round(progress)}%`;
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
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  try {
    const url = new URL(normalized);
    const isSimpleDomain = url.hostname.split(".").length === 2;
    if (!/^www\./i.test(url.hostname) && isSimpleDomain) {
      url.hostname = `www.${url.hostname}`;
    }
    return url.toString();
  } catch (error) {
    console.warn("Unable to normalize URL", error);
    return normalized;
  }
};

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

// createScoreBar function removed - competitive score no longer displayed in UI

const createTargetCard = (target, marketSummary) => {
  const section = document.createElement("section");
  section.className =
    "space-y-8 rounded-3xl border border-indigo-100/80 bg-gradient-to-br from-indigo-50/80 via-white to-cyan-50/60 backdrop-blur-sm p-8 lg:p-10 shadow-xl";

  if (marketSummary) {
    const summary = document.createElement("div");
    summary.className =
      "market-snapshot-section rounded-2xl border-2 border-blue-300/60 bg-gradient-to-br from-blue-50/90 via-cyan-50/80 to-sky-50/90 backdrop-blur-sm p-6 lg:p-8 shadow-lg mb-8";
    const heading = document.createElement("h2");
    heading.className = "text-2xl font-semibold text-blue-800 mb-4";
    heading.textContent = "Market snapshot";
    const body = document.createElement("p");
    body.className = "mt-2 text-base leading-7 text-slate-800 font-medium";
    body.textContent = marketSummary;
    summary.append(heading, body);
    section.insertBefore(summary, section.firstChild);
  }

  const header = document.createElement("header");
  header.className =
    "flex flex-col gap-6 md:flex-row md:items-center md:justify-between pb-4 border-b border-slate-200/60";

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
  grid.className = "card-grid";
  grid.append(
    createSection("Company overview", [target.overview].filter(Boolean), "text-blue-600"),
    createSection("Products", target.products, "text-blue-600"),
    createSection("Pricing", target.pricing, "text-blue-600"),
  );

  const strengthsWeaknesses = document.createElement("div");
  strengthsWeaknesses.className = "card-grid";
  strengthsWeaknesses.append(
    createSection("Strengths", target.strengths, "text-emerald-600"),
    createSection("Weaknesses", target.weaknesses, "text-slate-500"),
  );

  section.append(grid, strengthsWeaknesses);
  return section;
};

const createCompetitorCard = (competitor) => {
  const article = document.createElement("article");
  article.className =
    "group rounded-3xl border border-slate-200/80 bg-white/95 backdrop-blur-sm p-8 lg:p-10 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:border-slate-300/80";

  const header = document.createElement("header");
  header.className = "mb-6 pb-6 border-b border-slate-200/60";

  const info = document.createElement("div");
  const title = document.createElement("h3");
  title.className = "text-2xl font-bold text-slate-900 mb-2";
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
  header.append(info);

  const grid = document.createElement("div");
  grid.className = "card-grid";
  grid.append(
    createSection("Company overview", [competitor.overview].filter(Boolean), "text-blue-600"),
    createSection("Products", competitor.products, "text-blue-600"),
    createSection("Pricing", competitor.pricing, "text-blue-600"),
    createSection("Strengths", competitor.strengths, "text-emerald-600"),
    createSection("Weaknesses", competitor.weaknesses, "text-slate-500"),
    createSection("Key Differentiators", competitor.how_we_win, "text-red-500"),
    createSection(
      "Potential landmines",
      competitor.potential_landmines,
      "text-purple-500",
    ),
  );

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

  const grid = document.createElement("div");
  grid.className = "grid grid-cols-1 gap-8";
  competitors.forEach((competitor) => {
    grid.appendChild(createCompetitorCard(competitor));
  });

  section.appendChild(grid);
  return section;
};

const renderBattlecards = (data) => {
  if (!selectors.results) return;

  selectors.results.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = "space-y-12";

  wrapper.appendChild(
    createTargetCard(data.target_company ?? {}, data.market_summary ?? ""),
  );
  wrapper.appendChild(createCompetitorGrid(data.competitors ?? []));

  selectors.results.appendChild(wrapper);
  toggleClass(selectors.results, "hidden", false);

  // Restart fade-in animation
  selectors.results.classList.remove("fade-in");
  // Trigger reflow
  void selectors.results.offsetWidth;
  selectors.results.classList.add("fade-in");
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
    renderBattlecards(data);
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

if (selectors.form) {
  selectors.form.addEventListener("submit", handleSubmit);
}

window.renderBattlecards = renderBattlecards;

