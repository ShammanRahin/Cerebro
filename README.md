# Cerebro

**A stylus-native AI study notebook that watches how you think — not just whether you got the answer.**

Cerebro is a web app you write in with a stylus (or mouse). As you work, it reads your
handwriting, and depending on the mode either **improves your class notes** or **checks
your problem-solving steps** in real time. Every mistake is embedded into a personal
**Mistake Graph** so it can spot when you're repeating an error you made days ago — and
visualise the whole thing as a living force-directed tree.

---

## What it does

- **Two notebook modes** — toggle per page:
  - **📝 Note mode** — while taking notes, the AI suggests improvements (complete a
    trailing-off idea, add a key fact, tighten the wording) and fixes factual errors.
    It's *mistake-graph aware*: it pulls your related past mistakes so the suggestion
    fills the exact gaps you keep missing. One tap adds the suggestion onto the page.
  - **✎ Practice mode** — checks each step, returns a verdict + a nudge toward the
    answer, and reveals the correct answer on demand. You write your own problem; there
    are no auto-generated questions.
- **Math-aware OCR** — handwriting (including ∫, Σ, exponents, Greek letters) is read by
  a vision LLM, so integrals and equations survive transcription.
- **Symbolic step checking** — algebra and definite integrals are verified exactly with
  **SymPy** (instant, no API call). The LLM is only used when SymPy can't decide.
- **Personal Mistake Graph** — every wrong step is embedded with sentence-transformers
  and stored locally. Cosine-similarity search surfaces related past mistakes.
- **Mistake Tree** — a force-directed graph of your mistake embeddings, clustered by
  similarity and coloured by subject. Drag nodes, hover for details, filter by similarity.

---

## Tech stack

| Layer     | Tech |
|-----------|------|
| Frontend  | React 18 · Vite · Tailwind CSS · Fabric.js (canvas) |
| Backend   | FastAPI · SQLAlchemy · SQLite |
| AI        | Groq (Llama 4 Scout vision for OCR, Llama 3.3 70B for verification/notes) |
| Math      | SymPy (symbolic verification) |
| Embeddings| sentence-transformers `all-MiniLM-L6-v2` (local, CPU) |

You only need **one free API key** (Groq). Everything else runs locally.

---

## Quick start

You need a free Groq API key first — grab one at <https://console.groq.com/keys>.

### Option A — Docker (recommended, one command)

```bash
git clone <your-repo-url> cerebro
cd cerebro

# add your key
cp backend/.env.example backend/.env      # then edit backend/.env and set GROQ_API_KEY

docker compose up --build
```

Open **http://localhost:5173**. The SQLite database and the embedding model are cached in
Docker volumes, so they persist across restarts. (First start downloads PyTorch + the
embedding model, so give it a few minutes.)

### Option B — Run locally without Docker

**Backend** (Python 3.10 or 3.11):

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate

pip install -r requirements.txt

cp .env.example .env        # then edit .env and set GROQ_API_KEY

uvicorn app.main:app --reload --port 8000
```

> **Heads-up (Windows):** make sure `uvicorn` runs from the **same** environment where you
> ran `pip install`. If `uvicorn` resolves to a different Python, embeddings will fail to
> load. Running `python -m uvicorn app.main:app --reload --port 8000` avoids that.

**Frontend** (Node 18+), in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api` to the backend on port 8000.

---

## Using it

1. Open the app → you land on **Notebooks**. Create one and open a page.
2. You start in **📝 Note mode**. Write a note and pause ~1.5s (or press Enter). A card
   suggests an improvement — click **➕ Add to page** to stamp it in.
3. Switch to **✎ Practice mode** to get step verdicts + hints instead.
4. Visit **Mistakes → 🌳 Tree** to see your mistake graph. If older mistakes were logged
   before embeddings were available, click **↻ Sync past mistakes** to embed them.

The app degrades gracefully: if `GROQ_API_KEY` is missing, OCR and AI suggestions are
disabled but the rest of the app still runs; if embeddings can't load, the Mistake Tree
is simply empty.

---

## Mistake Graph MCP server

Cerebro ships an **[MCP](https://modelcontextprotocol.io) server** that exposes your
mistake graph (the same SQLite DB) to any MCP client — Claude Desktop, Cursor, etc. — so
you can query your learning data in plain English:

> *"What's my most common calculus mistake?"*
> *"Have I made this mistake before: the nucleus is the powerhouse of the cell?"*
> *"Summarise my weak areas and what I should review."*

**Tools exposed:** `mistake_overview`, `list_mistakes`, `weak_concepts`, `subject_stats`,
`find_similar_mistakes` (semantic search over the embeddings).

Run it (stdio transport):

```bash
cd backend
python -m mcp_servers.mistake_graph_mcp
```

Register it with **Claude Desktop** — add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cerebro": {
      "command": "python",
      "args": ["-m", "mcp_servers.mistake_graph_mcp"],
      "cwd": "<absolute path>/cerebro/backend"
    }
  }
}
```

Or inspect it interactively with the MCP dev tool: `mcp dev mcp_servers/mistake_graph_mcp.py`.

---

## Configuration

`backend/.env` (copy from `backend/.env.example`):

| Variable               | Default                      | Purpose |
|------------------------|------------------------------|---------|
| `GROQ_API_KEY`         | _(required for AI features)_ | Groq API key |
| `DATABASE_URL`         | `sqlite:///./cerebro.db`     | DB connection string |
| `CONFIDENCE_THRESHOLD` | `0.75`                       | Below this, a verdict is "needs review" |

`*.db` and `.env` are gitignored — your data and key never get committed.

---

## Project structure

```
cerebro/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app + router wiring
│   │   ├── db.py              # engine, session, lightweight migrations
│   │   ├── models.py          # SQLAlchemy models
│   │   ├── config.py          # settings (.env)
│   │   ├── agents/
│   │   │   └── step_checker.py    # subject classifier + SymPy + Groq verifier
│   │   ├── routers/
│   │   │   ├── ocr.py             # Groq vision OCR
│   │   │   ├── verify.py          # step verification (+ mistake logging)
│   │   │   ├── notes.py           # note-coach suggestions
│   │   │   ├── mistakes.py        # mistake list, stats, graph, backfill
│   │   │   └── notebooks.py       # notebooks & pages
│   │   └── services/
│   │       ├── embeddings.py      # sentence-transformers wrapper
│   │       └── mistake_graph.py   # embed + cosine-similarity retrieval
│   ├── mcp_servers/
│   │   └── mistake_graph_mcp.py   # MCP server (query mistakes from any MCP client)
│   ├── scripts/seed_problems.py   # optional: seed practice problems
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/CanvasEditor.jsx   # the stylus canvas + modes
│   │   ├── components/MistakeTree.jsx    # force-directed mistake graph
│   │   ├── pages/                        # Notebooks, Dashboard, Mistakes, Settings
│   │   ├── hooks/                        # ink capture, step-boundary detection
│   │   └── lib/api.js                    # API client
│   ├── Dockerfile
│   └── nginx.conf
├── docker-compose.yml
└── README.md
```

---

## Notes

- The Mistake Tree needs the embedding model (`all-MiniLM-L6-v2`, ~90 MB) which downloads
  on first use and needs ~1 GB RAM at runtime.
- SQLite is the default store — zero setup. Point `DATABASE_URL` at Postgres if you want.
