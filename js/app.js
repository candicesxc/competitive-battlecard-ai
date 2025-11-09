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

const getProgressMessage = (value) => {
  if (value < 30) return "Analyzing company website…";
  if (value < 60) return "Searching for relevant competitors…";
  if (value < 90) return "Scoring and ranking competitors…";
  if (value < 100) return "Generating final battlecard…";
  return "Generating final battlecard…";
};

const updateProgressUI = () => {
  if (selectors.progressFill) {
    selectors.progressFill.style.width = `${progress}%`;
  }
  if (selectors.progressValue) {
    selectors.progressValue.textContent = `${Math.round(progress)}%`;
  }
  if (selectors.progressMessage) {
    selectors.progressMessage.textContent = getProgressMessage(progress);
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
  progressTimer = window.setInterval(() => {
    if (!isLoading) {
      stopProgressTimer();
      return;
    }
    if (progress >= 95) {
      return;
    }
    let increment = 0.5;
    if (progress < 30) {
      increment = 3;
    } else if (progress < 60) {
      increment = 2;
    } else if (progress < 80) {
      increment = 1.5;
    } else {
      increment = 0.75;
    }
    setProgress(Math.min(progress + increment, 95));
  }, 500);
};

const setLoading = (loading) => {
  if (loading) {
    if (isLoading) return;
    isLoading = true;
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
    "rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm";

  const heading = document.createElement("h3");
  heading.className = `section-title mb-2 ${accentClass}`;
  heading.textContent = title;
  section.appendChild(heading);

  if (!items || items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "text-sm text-slate-400";
    empty.textContent = "No data available.";
    section.appendChild(empty);
    return section;
  }

  const list = document.createElement("ul");
  list.className = "space-y-1 text-sm text-slate-700 list-disc list-inside";

  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  });

  section.appendChild(list);
  return section;
};

const createScoreBar = (score) => {
  const clamped = Math.max(0, Math.min(Number(score) || 0, 10));

  const wrapper = document.createElement("div");
  wrapper.className = "mt-4";

  const labelRow = document.createElement("div");
  labelRow.className =
    "flex items-center justify-between text-xs font-medium text-slate-500";

  const label = document.createElement("span");
  label.textContent = "Competitive score";
  const value = document.createElement("span");
  value.className = "text-slate-700";
  value.textContent = `${clamped}/10`;

  labelRow.append(label, value);

  const bar = document.createElement("div");
  bar.className = "mt-1 h-2 rounded-full bg-slate-200";
  const fill = document.createElement("div");
  fill.className = "h-2 rounded-full bg-indigo-500 transition-all";
  fill.style.width = `${clamped * 10}%`;
  bar.appendChild(fill);

  wrapper.append(labelRow, bar);
  return wrapper;
};

const createTargetCard = (target, marketSummary) => {
  const section = document.createElement("section");
  section.className =
    "space-y-6 rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 p-8 shadow";

  if (marketSummary) {
    const summary = document.createElement("div");
    summary.className =
      "rounded-2xl border border-indigo-100 bg-white/70 p-6 shadow-sm";
    const heading = document.createElement("h2");
    heading.className = "text-lg font-semibold text-indigo-600";
    heading.textContent = "Market snapshot";
    const body = document.createElement("p");
    body.className = "mt-2 text-sm leading-6 text-slate-600";
    body.textContent = marketSummary;
    summary.append(heading, body);
    section.appendChild(summary);
  }

  const header = document.createElement("header");
  header.className =
    "flex flex-col gap-6 md:flex-row md:items-center md:justify-between";

  const companyInfo = document.createElement("div");
  companyInfo.className = "flex flex-col gap-1";

  const titleWrapper = document.createElement("div");
  const title = document.createElement("h1");
  title.className = "text-2xl font-bold text-slate-900";
  title.textContent = target.company_name || "Target company";
  const category = document.createElement("p");
  category.className = "text-sm text-slate-500";
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
    "group rounded-3xl border border-slate-200 bg-white/95 p-6 shadow transition hover:-translate-y-1 hover:shadow-lg";

  const header = document.createElement("header");
  header.className = "mb-5";

  const info = document.createElement("div");
  const title = document.createElement("h3");
  title.className = "text-lg font-semibold text-slate-900";
  title.textContent = competitor.company_name || "Competitor";
  const category = document.createElement("p");
  category.className = "text-xs uppercase tracking-wide text-slate-500";
  category.textContent = competitor.category || "Market competitor";

  info.append(title, category);
  header.append(info);

  const grid = document.createElement("div");
  grid.className = "card-grid";
  grid.append(
    createSection("Company overview", [competitor.overview].filter(Boolean), "text-blue-600"),
    createSection("Products", competitor.products, "text-blue-600"),
    createSection("Pricing", competitor.pricing, "text-blue-600"),
    createSection("Strengths", competitor.strengths, "text-emerald-600"),
    createSection("Weaknesses", competitor.weaknesses, "text-slate-500"),
    createSection("How we win", competitor.how_we_win, "text-red-500"),
    createSection(
      "Potential landmines",
      competitor.potential_landmines,
      "text-purple-500",
    ),
  );

  article.append(header, grid, createScoreBar(competitor.score_vs_target));
  return article;
};

const createCompetitorGrid = (competitors) => {
  const section = document.createElement("section");
  section.className = "space-y-6";

  const heading = document.createElement("h2");
  heading.className = "text-xl font-semibold text-slate-800";
  heading.textContent = "Competitive landscape";

  section.appendChild(heading);

  if (!competitors || competitors.length === 0) {
    const empty = document.createElement("p");
    empty.className = "rounded-2xl border border-slate-200 bg-white/90 p-6 text-sm text-slate-500 shadow-sm";
    empty.textContent =
      "No close competitors found. Try running the analysis with another target company.";
    section.appendChild(empty);
    return section;
  }

  const grid = document.createElement("div");
  grid.className = "grid grid-cols-1 gap-6 xl:grid-cols-2";
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

