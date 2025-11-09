# 🧠 Competitive Battlecard AI

**Competitive Battlecard AI** is a web-based intelligence tool built for **product marketers** and **go-to-market teams**.  
It automatically analyzes a company URL, finds its key competitors, and generates structured **battlecards** — complete with strengths, weaknesses, pricing, positioning, and visual summaries.  

This project combines **FastAPI + CrewAI + OpenAI + Serper API** for analysis, and a sleek **Tailwind CSS + JavaScript frontend** for interactive visualization.

---

## 🚀 Demo

🌐 **Frontend:** [https://candicesxc.github.io/competitive-battlecard-ai/](https://candicesxc.github.io/competitive-battlecard-ai/)  
⚙️ **Backend (Render):** [https://competitive-battlecard-ai.onrender.com](https://competitive-battlecard-ai.onrender.com)

---

## 🧩 Features

- 🕵️‍♀️ **Automatic Competitor Discovery** — Type a company URL, and the AI finds its competitors.
- 💡 **AI-Powered Battlecards** — Each competitor gets a concise battlecard with:
  - Overview
  - Products
  - Pricing
  - Strengths / Weaknesses
  - “How We Win” & “Potential Landmines”
- 📊 **Market Insights Summary** — Summarized view of the target company’s position in the landscape.
- 🖼️ **Visual Logos & Scoring Bars** — Each card displays company logos and a competitive score.
- 💬 **CrewAI Integration** — Coordinates multiple agents (research, analysis, summarization).
- 🌈 **Vibe-Coded Frontend** — Modern UI styled with Tailwind and subtle animations.

---

## 🏗️ Architecture

frontend/
├── index.html # UI + Tailwind styles
├── app.js # Frontend logic, handles API calls
└── img/ # Fallback and sample logos

backend/
├── app.py # FastAPI entry point + CORS setup
├── crew_agents.py # CrewAI agent orchestration
├── services/
│ ├── analysis_service.py
│ ├── layout_service.py
│ └── search_service.py
├── models/
└── utils/

.env.example # API keys for OpenAI and Serper
requirements.txt # Python dependencies

yaml
Copy code

---

## 🧠 Tech Stack

| Layer | Tools / Frameworks |
|-------|--------------------|
| **Frontend** | HTML, JavaScript, Tailwind CSS |
| **Backend** | FastAPI, Uvicorn |
| **AI & Agents** | CrewAI, OpenAI API |
| **Search** | Serper API |
| **Deployment** | Render (backend) + GitHub Pages (frontend) |

---

## ⚙️ Local Development

### 1️⃣ Clone the repository

```bash
git clone https://github.com/<your-username>/competitive-battlecard-ai.git
cd competitive-battlecard-ai
2️⃣ Backend setup
bash
Copy code
cd backend
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
3️⃣ Environment variables
Create a .env file in the backend directory:

bash
Copy code
OPENAI_API_KEY=your_openai_key
SERPER_API_KEY=your_serper_key
4️⃣ Run the server
bash
Copy code
uvicorn backend.app:app --reload
Now your backend is live at:
👉 http://localhost:8000

5️⃣ Run the frontend
Open index.html directly or use a simple local server:

bash
Copy code
python -m http.server 5500
Then visit:
👉 http://localhost:5500

🌍 Deployment
🔹 Backend (Render)
Create a new Web Service on Render.com

Connect your GitHub repo

Set the start command:

nginx
Copy code
uvicorn backend.app:app --host 0.0.0.0 --port 10000
Add environment variables:

ini
Copy code
OPENAI_API_KEY=your_openai_key
SERPER_API_KEY=your_serper_key
Wait for deployment success.

🔹 Frontend (GitHub Pages)
Push your code to the main branch.

Go to your GitHub repo → Settings → Pages

Set “Deploy from branch” → main → /root

Your live site will appear at:

arduino
Copy code
https://<username>.github.io/competitive-battlecard-ai/
🧰 Troubleshooting
Problem	Fix
CORS error in browser	Add your GitHub Pages URL to allow_origins in backend/app.py.
“Not Found” when testing /health	Add a small health route in FastAPI: @app.get("/health") def health(): return {"status": "ok"}
Render deploy fails (SyntaxError)	Make sure from __future__ import annotations is the first line in your file.
“Failed to fetch” in frontend	Check that backend is live and CORS is configured correctly.

✨ Future Enhancements
AI-powered chart visualizations (market positioning maps)

CSV export for sales enablement

Multi-company comparison mode

Login & custom saved battlecards

🪪 License
MIT License © 2025 Candice Shen
Feel free to fork, remix, and build upon it — attribution appreciated.

💬 Credits
Developed by Candice Shen, Yale SOM MBA (2026),
exploring the intersection of marketing, AI, and creative coding.

