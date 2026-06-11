# SmartHire AI - Candidate Discovery & Ranking System

SmartHire AI is an explainable candidate discovery and ranking system designed for the **Senior AI Engineer (Founding Team)** role at Redrob. It identifies the top 100 candidates from a pool of 100,000 candidates using a hybrid semantic-behavioral approach.

## Key Features

1. **Logical Profile Validator (Honeypot Filter)**: Automatically filters out candidates with impossible profile configurations (e.g., starting at a company before it was founded, years of experience mismatches, or claiming advanced proficiency in multiple skills with zero months of usage).
2. **Hybrid Scoring Engine**: Combines semantic similarity scores (using a local Sentence-Transformers `all-MiniLM-L6-v2` model) with explicit skill matching, target experience alignment, and behavioral multipliers (notice period, location, recruiter responsiveness, and platform activity).
3. **MERN Recruiter Dashboard**: A premium, responsive dark-mode dashboard (React + Express + Node.js + MongoDB/Filesystem fallback) to search, filter, and inspect recommended candidates. Includes Explainable AI summaries and visual Skill Gap analyses.

---

## Folder Structure

```
.
├── ai-engine/
│   ├── embeddings.py       # Candidate embeddings precomputation script
│   └── scorer.py           # Core candidate scoring and filtering logic
├── backend/
│   ├── db.js               # MongoDB connector and FS fallback seeder
│   └── server.js           # Node.js/Express backend API server
├── data/
│   ├── candidate_embeddings.npy  # Precomputed candidate embeddings (generated)
│   └── ranked_candidates_details.json # Scored top candidate cache (generated)
├── frontend/               # React Vite dashboard application
├── output/
│   └── ranked_candidates.csv # Generated submission CSV (identical to root)
├── rank.py                 # Primary ranker entry point script
├── README.md               # Setup and documentation
├── requirements.txt        # Python dependencies
├── submission_metadata.yaml # Challenge submission metadata
└── validate_submission.py  # Provided challenge validation script
```

---

## Setup & Run Instructions

### 1. Python Environment Setup & Precomputation

To initialize the virtual environment and install dependencies:

```bash
# Create virtual environment
python -m venv .venv

# Activate virtual environment
# Windows (PowerShell):
.venv\Scripts\Activate.ps1
# Unix/macOS:
source .venv/bin/activate

# Install requirements
pip install -r requirements.txt
```

### 2. Candidate Embeddings Precomputation

The candidates pool has 100k records. Generating embeddings on CPU takes around 15 minutes. To generate the embeddings (organizers can skip this if `data/candidate_embeddings.npy` is already present):

```bash
python ai-engine/embeddings.py
```

### 3. Generate Submission CSV

To rank the candidates and output the final `submission.csv` (this completes in **under 5 seconds** when precomputed embeddings exist):

```bash
python rank.py --candidates ./candidates.jsonl --out ./submission.csv
```

To validate the CSV file:

```bash
python validate_submission.py submission.csv
```

---

## Recruiter Dashboard Setup (Optional)

The dashboard displays candidate ranks, match subscores, strengths, weaknesses, timelines, and skill gaps. It runs in two modes: **MongoDB Mode** (reads/seeds database) or **File-System Fallback Mode** (reads JSONL directly on-demand, no DB installation required).

### 1. Start Backend Server

From the root directory, navigate to `backend` and run:

```bash
cd backend
npm install
npm start
```

### 2. Start Frontend Server

Open a new terminal, navigate to `frontend` and run:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL displayed (e.g. `http://localhost:5173`) in your browser to view the interactive recruiter dashboard.
