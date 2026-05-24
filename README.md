# Cerebro
-A stylus-native AI tutor that watches how you think and not just what you get right.

Cerebro is a stylus-native learning OS that transforms how students interact with their own study materials. It is a web app that helps student solve math problems, checks every step in real time and builds a personal mistake graph which keeps a record of every error made and how similar it is to past errors. Moreover it never gives the full answer but only the next step allowing the student to learn.

---

## What it does

- **Watches the pen** — real-time handwriting recognition using Google ML Kit Digital Ink
- **Checks every step** — SymPy verifies algebra and derivatives symbolically and the AI is only called when SymPy is ambiguous
- **Ghosts the next step** — when you're wrong you get one hint and never the full solution
- **Remembers every mistake** — each error is embedded with sentence-transformers and stored in a local vector db
- **Surfaces similar past errors** — cosine similarity search finds the time you made the same mistake days ago
- **Exposes a Mistake Graph MCP server** — connect MCP client to query your learning data in plain English

---

## Tech stack

**Stack:** FastAPI + SQLite + LangGraph + Claude API · React + Vite + Tailwind + Fabric.js + Google ML Kit Digital Ink

---

## Repo structure

```
cerebro/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── db.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── agents/
│   │   │   ├── __init__.py
│   │   │   └── step_checker.py
│   │   ├── llm/
│   │   │   ├── __init__.py
│   │   │   ├── client.py
│   │   │   └── prompts/
│   │   │       ├── step_checker_v1.xml
│   │   │       ├── error_classifier_v1.xml
│   │   │       └── next_step_hint_v1.xml
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── mistakes.py
│   │   │   ├── notes.py
│   │   │   └── practice.py
│   │   └── services/
│   │       ├── __init__.py
│   │       ├── ocr.py
│   │       ├── embeddings.py
│   │       ├── mistake_graph.py
│   │       ├── sympy_parser.py
│   │       ├── problem_bank.py
│   │       └── error_types.py
│   ├── mcp_servers/
│   │   └── mistake_graph_mcp.py
│   ├── eval/
│   │   ├── regression_set.json
│   │   └── run_eval.py
│   ├── pyproject.toml
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── public/
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── postcss.config.js
├── docs/
├── .gitignore
├── README.md
└── docker-compose.yml
```

---

