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
│   └── battlecardPdf.js # PDF generation utility
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
| **Frontend** | HTML, JavaScript, Tailwind CSS, jsPDF |
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
5. View, save, or download the results as PDF

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

### Competitor Discovery
- Uses Exa search API to find relevant competitors
- Scores competitors based on similarity and relevance
- Filters and ranks results for the most relevant matches

---

## 🔧 Development

### Backend API Endpoints

- `POST /analyze` - Analyze a company URL and generate battlecards
  - Request body: `{ "url": "https://example.com" }`
  - Returns: Battlecard data with competitors and analysis

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
