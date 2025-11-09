const form = document.getElementById("analyze-form");
const statusCard = document.getElementById("status-card");
const statusMessage = document.getElementById("status-message");
const errorCard = document.getElementById("error-card");
const errorMessage = document.getElementById("error-message");
const resultsCard = document.getElementById("results-card");
const battlecardContainer = document.getElementById("battlecard-container");

const showStatus = (message) => {
  statusMessage.textContent = message;
  statusCard.classList.remove("hidden");
};

const hideStatus = () => {
  statusCard.classList.add("hidden");
};

const showError = (message) => {
  errorMessage.textContent = message;
  errorCard.classList.remove("hidden");
};

const hideError = () => {
  errorCard.classList.add("hidden");
};

const attachBattlecardActions = () => {
  const container = battlecardContainer;
  if (!container) return;

  container.querySelectorAll("[data-battlecard-action='copy']").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(container.innerText.trim());
        button.classList.add("bg-green-500", "text-white");
        button.textContent = "Copied!";
        setTimeout(() => {
          button.classList.remove("bg-green-500", "text-white");
          button.textContent = "Copy to Clipboard";
        }, 2000);
      } catch (error) {
        console.error("Clipboard copy failed", error);
        button.textContent = "Copy failed";
      }
    });
  });

  container.querySelectorAll("[data-battlecard-action='download']").forEach((button) => {
    button.addEventListener("click", () => {
      const htmlContent = container.innerHTML;
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        button.textContent = "Pop-up blocked";
        return;
      }

      printWindow.document.write(`
        <html>
          <head>
            <title>Battlecard Download</title>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tailwindcss@3.4.4/dist/tailwind.min.css">
            <link rel="stylesheet" href="/static/styles.css">
          </head>
          <body class="bg-white">
            <main class="mx-auto max-w-6xl p-8">
              ${htmlContent}
            </main>
            <script>
              window.onload = () => {
                window.print();
                window.close();
              };
            <\/script>
          </body>
        </html>
      `);
      printWindow.document.close();
    });
  });
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const rawUrl = (formData.get("company_url") || "").toString().trim();

  hideError();
  hideStatus();
  resultsCard.classList.add("hidden");
  battlecardContainer.innerHTML = "";

  if (!rawUrl) {
    showError("Please enter a company URL.");
    return;
  }

  const normalizedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  let companyUrl;

  try {
    companyUrl = new URL(normalizedUrl).toString();
  } catch (error) {
    console.error("Invalid URL provided", error);
    showError("Please enter a valid company URL.");
    return;
  }

  showStatus("Gathering competitive intelligence…");

  try {
    const response = await fetch("/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ company_url: companyUrl }),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      const detail = errorPayload.detail;
      let message = "Failed to generate battlecard.";
      if (typeof detail === "string") {
        message = detail;
      } else if (Array.isArray(detail)) {
        message = detail.map((item) => item.msg || item.detail || "").filter(Boolean).join(" ");
      }
      throw new Error(message);
    }

    const data = await response.json();
    hideStatus();

    if (!data.html) {
      showError("The designer failed to produce a layout. Please try again.");
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "fade-in";
    wrapper.innerHTML = data.html;

    battlecardContainer.innerHTML = "";
    battlecardContainer.appendChild(wrapper);

    resultsCard.classList.remove("hidden");
    attachBattlecardActions();
  } catch (error) {
    hideStatus();
    console.error(error);
    showError(error.message || "Something went wrong. Try again later.");
  }
});

