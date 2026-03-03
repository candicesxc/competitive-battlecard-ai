# 🧠 Competitive Battlecard AI

**Competitive Battlecard AI** is a web-based intelligence tool built for **product marketers** and **go-to-market teams**.  
It automatically analyzes a company URL, finds its key competitors, and generates structured **battlecards** — complete with strengths, weaknesses, pricing, positioning, and visual summaries.  

This project combines **FastAPI + CrewAI + OpenAI + Exa** for analysis, and a sleek **Tailwind CSS + JavaScript frontend** for interactive visualization.

---

## 🌐 Live Demo

**🔗 [Try it live →](https://candiceshen.com/competitive-battlecard-ai/)**

The tool is fully deployed and ready to use. Simply paste a company URL to generate comprehensive competitive battlecards in minutes.

---

## 🧩 Features

- 🕵️‍♀️ **Automatic Competitor Discovery** — Type a company URL, and the AI finds its competitors using advanced search algorithms.
- 💡 **AI-Powered Battlecards** — Each competitor gets a concise battlecard with:
  - Overview
  - Products
  - Pricing
  - Strengths / Weaknesses
  - "How We Win" & "Potential Landmines"
- 📊 **Market Insights Summary** — Summarized view of the target company's position in the landscape.
- 🖼️ **Visual Logos & Company Info** — Each card displays company information and website URLs.
- 💾 **Save & Reload Battlecards** — Save generated battlecards to your browser and reload them anytime.
- 📄 **PDF Export** — Download battlecards as formatted PDFs for sharing and documentation.
- 📊 **PowerPoint Export** — Download battlecards as `.pptx` files (fully native OOXML — no library required, opens in Microsoft PowerPoint without any repair prompts):
  - Title slide with company name, URL, and generation date
  - Company overview slide with market snapshot, products, and strengths
  - One dedicated slide per competitor with a 7-panel grid layout (Overview, Products, Strengths, Pricing, Weaknesses, Key Differentiators, Potential Landmines)
- 🎯 **Sales Playbook Generator** — Generate comprehensive sales enablement resources for each competitor:
  - **Objection Handling** — Common objections with multiple response frameworks (FEEL-FELT-FOUND, FIA)
  - **Talk Tracks** — Sales stage-specific conversation flows (discovery, demo, close)
  - **ROI Calculator** — Current state costs, future savings, and cost of delay metrics
  - **Competitive Narratives** — Buyer-aligned positioning stories by persona (Executive, Technical, Financial)
  - **B2B & B2C Support** — Target specific companies (B2B) or audience personas (B2C)
- 💬 **CrewAI Integration** — Coordinates multiple agents (research, analysis, summarization).
- 🌈 **Modern UI** — Beautiful interface styled with Tailwind CSS and smooth animations.

---

## 🏗️ Architecture

```
frontend/
├── index.html          # UI + Tailwind styles
├── app.js              # Frontend logic, handles API calls
├── battlecardTypes.js  # Type definitions and data utilities
├── utils/
│   ├── battlecardPdf.js # PDF generation utility (jsPDF)
│   └── battlecardPpt.js # PowerPoint generation utility (pure OOXML/ZIP, no library)
├── css/
│   └── styles.css      # Custom styles
└── img/                # Fallback and sample logos

backend/
├── app.py              # FastAPI entry point + CORS setup
├── config.py           # Configuration management
├── crew_agents.py      # CrewAI agent orchestration
├── services/
│   ├── analysis_service.py
│   ├── competitor_discovery.py  # Competitor discovery via Exa
│   ├── competitor_scoring.py    # Competitor similarity scoring
│   ├── competitor_pipeline.py
│   ├── exa_client.py
│   ├── exa_competitor_search.py
│   ├── layout_service.py
│   ├── search_service.py
│   ├── sales_playbook_service.py # Sales playbook generation
│   └── cache.py
└── models/
    └── company_profile.py

requirements.txt        # Python dependencies
runtime.txt            # Python runtime version
.env.example           # API keys for OpenAI and Exa
```

---

## 🧠 Tech Stack

| Layer | Tools / Frameworks |
|-------|--------------------|
| **Frontend** | HTML, JavaScript, Tailwind CSS, jsPDF (PDF), native OOXML/ZIP (PPTX) |
| **Backend** | FastAPI, Uvicorn |
| **AI & Agents** | CrewAI, OpenAI API |
| **Search** | Exa (for competitor discovery and web search) |
| **Deployment** | Render (backend) + Custom domain (frontend) |

---

## 🚀 Getting Started

### Prerequisites

- Python 3.11+
- OpenAI API key
- Exa API key

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd competitive-battlecard-ai
   ```

2. **Set up the backend**
   ```bash
   cd backend
   pip install -r ../requirements.txt
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your API keys:
   ```
   OPENAI_API_KEY=your_openai_key_here
   EXA_API_KEY=your_exa_key_here
   ```

4. **Run the backend server**
   ```bash
   uvicorn app:app --reload
   ```

5. **Set up the frontend**
   - Open `index.html` in a browser, or
   - Serve it using a local web server (e.g., `python -m http.server`)

### Usage

1. Open the frontend in your browser
2. Paste a company URL (e.g., `https://www.example.com`)
3. Click "Generate Battlecard"
4. Wait for the AI to analyze and generate battlecards
5. View, save, or download the results as PDF or PowerPoint

---

## 📦 Key Features Explained

### Saved Battlecards
- Battlecards are automatically saved to browser localStorage after generation
- Access saved battlecards from the dropdown below the input field
- Delete saved battlecards individually
- No backend calls needed when loading saved battlecards

### PDF Export
- Generate formatted PDFs from any battlecard
- Includes all sections: overview, products, pricing, strengths, weaknesses
- Clean formatting with proper headers and bullet points
- Multi-page support for longer battlecards

### PowerPoint Export
- Generate `.pptx` files entirely in the browser — **zero server calls, zero external libraries**
- Built with native OOXML/ZIP (ECMA-376 standard), so files open in Microsoft PowerPoint without any repair prompts
- Slide structure:
  1. **Title slide** — company name, website, and generation date on a branded dark background
  2. **Company overview** — market snapshot, company description, products, and strengths
  3. **One slide per competitor** — 7-panel grid layout with Overview, Products, Strengths, Pricing, Weaknesses, Key Differentiators, and Potential Landmines
- Download via the "Download PPT" button after generating a battlecard

### Competitor Discovery
- Uses Exa search API to find relevant competitors
- Scores competitors based on similarity and relevance
- Filters and ranks results for the most relevant matches

### Sales Playbook Generator
After generating a battlecard, you can create comprehensive sales enablement resources:

**How to Use:**
1. Generate a battlecard for a company
2. Click "Generate Sales Playbook" button at the bottom of results
3. Choose your selling approach:
   - **B2B**: Enter the target company URL (or just context)
   - **B2C**: Enter the audience persona you're targeting
4. Select a competitor from the dropdown
5. Click "Generate Playbook" and wait for AI-powered content (5-10 seconds)

**What You Get:**
- **Objection Handling** (5-7 common objections with 2-3 response frameworks each)
- **Talk Tracks** (discovery, demo, close stage scripts)
- **ROI Calculator** (current state cost, future savings, cost of delay)
- **Competitive Narratives** (positioning angles for Executive, Technical, and Financial personas)
- **Case Study Recommendations** (which case studies to use for this scenario)

All content is copy-paste ready for Slack, email, or real-time sales conversations.

---

## 🔧 Development

### Backend API Endpoints

- `POST /analyze` - Analyze a company URL and generate battlecards
  - Request body: `{ "url": "https://example.com" }`
  - Returns: Battlecard data with competitors and analysis

- `POST /next-steps` - Generate comprehensive sales playbook for a competitor vs. target
  - Request body (B2B):
    ```json
    {
      "target_company": { "url": "https://target.com", "context": "optional context" },
      "competitor": { "company_name": "...", "weaknesses": [...], "pricing": [...] },
      "your_company": { "name": "...", "how_we_win": [...] }
    }
    ```
  - Request body (B2C):
    ```json
    {
      "target_company": { "persona_name": "Marketing Manager", "persona_context": "SMB..." },
      "competitor": { "company_name": "...", "weaknesses": [...] },
      "your_company": { "name": "...", "how_we_win": [...] }
    }
    ```
  - Returns: Comprehensive playbook with objections, narratives, ROI, and case studies

### Frontend Structure

- `app.js` - Main application logic and API integration
- `battlecardTypes.js` - Data type definitions and localStorage utilities
- `utils/battlecardPdf.js` - PDF generation using jsPDF

---

## 📝 License

This project is open source and available for use.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## 🔗 Links

- **Live Tool**: [https://candiceshen.com/competitive-battlecard-ai/](https://candiceshen.com/competitive-battlecard-ai/)
- **CrewAI**: [https://www.crewai.com/](https://www.crewai.com/)
- **Exa**: [https://exa.ai/](https://exa.ai/)

---

Built with ❤️ for competitive intelligence and go-to-market teams.
