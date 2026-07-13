"""AI-powered snippet suggestions using Groq API."""

import json
import logging
import httpx

from backend.config import GROQ_API_KEY, GROQ_MODEL

logger = logging.getLogger("orchestrator")

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"


def generate_snippets(
    workplace_name: str,
    workplace_description: str,
    unit_name: str,
    unit_description: str,
    step_name: str,
    existing_steps: list[dict],
) -> list[dict]:
    """Generate contextual Python snippet suggestions using Groq.

    Returns a list of snippets: [{"title": "...", "description": "...", "code": "..."}]
    """
    if not GROQ_API_KEY:
        return _fallback_snippets(step_name)

    # Build context for the AI
    steps_context = ""
    if existing_steps:
        steps_context = "\n".join(
            f"  - Step {s.get('order', i+1)}: '{s.get('name', '')}' ({s.get('mode', 'independent')})"
            + (f" — script preview: {s.get('script', '')[:100]}..." if s.get('script') else "")
            for i, s in enumerate(existing_steps)
        )
        steps_context = f"\nExisting steps in this unit:\n{steps_context}"

    prompt = f"""You are an expert Python developer helping build data pipelines and automation workflows.

Context:
- Workspace: "{workplace_name}" — {workplace_description or 'No description'}
- Unit (Job): "{unit_name}" — {unit_description or 'No description'}
- Step being created: "{step_name}"{steps_context}

Generate exactly 4 Python code snippets that would be useful for this step, given the context of the workspace and unit. Each snippet should be practical, production-ready, and relevant to data engineering / data pipelines.

Consider:
- If this step name suggests scraping: provide scraping snippets (requests, BeautifulSoup, etc.)
- If it suggests data transformation: provide pandas/data processing snippets
- If it suggests loading/storing: provide database insert, CSV write, API POST snippets
- If it suggests API calls: provide HTTP request snippets
- If there are existing steps, suggest code that naturally follows them (e.g., if previous step scrapes, suggest transform/clean code)
- For chained steps, show how to use INPUT_DATA variable

Return a JSON array with exactly 4 objects, each with "title", "description", and "code" fields.
The "code" field should be a complete, runnable Python script (with imports).
Keep each snippet under 30 lines.

Return ONLY the JSON array, no markdown, no explanation."""

    try:
        response = httpx.post(
            GROQ_API_URL,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": GROQ_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.4,
                "max_tokens": 2000,
            },
            timeout=15.0,
        )
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"].strip()

        # Parse JSON — handle markdown code blocks
        if content.startswith("```"):
            content = content.split("\n", 1)[1]  # remove ```json
            content = content.rsplit("```", 1)[0]  # remove trailing ```

        snippets = json.loads(content)

        if isinstance(snippets, list) and len(snippets) > 0:
            return snippets[:6]  # cap at 6

    except Exception as e:
        logger.warning(f"Groq snippet generation failed: {e}")

    return _fallback_snippets(step_name)


def _fallback_snippets(step_name: str) -> list[dict]:
    """Return generic data pipeline snippets when Groq is unavailable."""
    name_lower = step_name.lower()

    snippets = []

    if any(w in name_lower for w in ["scrape", "crawl", "fetch", "extract", "download"]):
        snippets = [
            {
                "title": "HTTP GET with requests",
                "description": "Fetch data from a URL and print the response",
                "code": 'import requests\n\nurl = "https://api.example.com/data"\nresponse = requests.get(url, timeout=30)\nresponse.raise_for_status()\ndata = response.json()\nprint(f"Fetched {len(data)} records")\nprint(data)',
            },
            {
                "title": "Web scraper with BeautifulSoup",
                "description": "Scrape HTML page and extract data",
                "code": 'import requests\nfrom bs4 import BeautifulSoup\n\nurl = "https://example.com"\nresp = requests.get(url, timeout=30)\nsoup = BeautifulSoup(resp.text, "html.parser")\n\nresults = []\nfor item in soup.select(".item"):\n    results.append({\n        "title": item.select_one("h2").text.strip(),\n        "price": item.select_one(".price").text.strip(),\n    })\n\nimport json\nprint(json.dumps(results))',
            },
            {
                "title": "Paginated API fetch",
                "description": "Fetch all pages from a paginated API",
                "code": 'import requests\nimport json\n\nall_data = []\npage = 1\n\nwhile True:\n    resp = requests.get(\n        "https://api.example.com/items",\n        params={"page": page, "per_page": 100},\n        timeout=30\n    )\n    resp.raise_for_status()\n    data = resp.json()\n    if not data:\n        break\n    all_data.extend(data)\n    page += 1\n\nprint(f"Total records: {len(all_data)}")\nprint(json.dumps(all_data))',
            },
        ]
    elif any(w in name_lower for w in ["transform", "clean", "process", "parse", "convert"]):
        snippets = [
            {
                "title": "JSON transform with pandas",
                "description": "Parse JSON input, transform with pandas, output as JSON",
                "code": 'import json\nimport pandas as pd\n\n# For chained steps, INPUT_DATA contains previous output\nimport os\nraw = os.environ.get("__CRON_INPUT_DATA__", "[]")\ndata = json.loads(raw)\n\ndf = pd.DataFrame(data)\n# Transform\ndf.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]\ndf = df.dropna()\n\nprint(df.to_json(orient="records"))',
            },
            {
                "title": "Data cleaning pipeline",
                "description": "Clean and validate data records",
                "code": 'import json\nimport os\n\nraw = os.environ.get("__CRON_INPUT_DATA__", "[]")\nrecords = json.loads(raw)\n\ncleaned = []\nfor r in records:\n    # Skip invalid\n    if not r.get("name"):\n        continue\n    cleaned.append({\n        "name": r["name"].strip().title(),\n        "value": float(r.get("value", 0)),\n        "category": r.get("category", "unknown").lower(),\n    })\n\nprint(f"Cleaned {len(cleaned)}/{len(records)} records")\nprint(json.dumps(cleaned))',
            },
        ]
    elif any(w in name_lower for w in ["load", "store", "save", "insert", "upload", "write"]):
        snippets = [
            {
                "title": "Save to SQLite",
                "description": "Insert records into a SQLite database",
                "code": 'import json\nimport sqlite3\nimport os\n\nraw = os.environ.get("__CRON_INPUT_DATA__", "[]")\nrecords = json.loads(raw)\n\nconn = sqlite3.connect("data.db")\nc = conn.cursor()\nc.execute("CREATE TABLE IF NOT EXISTS items (name TEXT, value REAL, updated_at TEXT)")\n\nfor r in records:\n    c.execute("INSERT INTO items VALUES (?, ?, datetime(\'now\'))", (r["name"], r["value"]))\n\nconn.commit()\nprint(f"Inserted {len(records)} records")\nconn.close()',
            },
            {
                "title": "Save to CSV file",
                "description": "Write data to a CSV file",
                "code": 'import csv\nimport json\nimport os\n\nraw = os.environ.get("__CRON_INPUT_DATA__", "[]")\nrecords = json.loads(raw)\n\nif records:\n    with open("output.csv", "w", newline="") as f:\n        writer = csv.DictWriter(f, fieldnames=records[0].keys())\n        writer.writeheader()\n        writer.writerows(records)\n    print(f"Wrote {len(records)} rows to output.csv")\nelse:\n    print("No records to write")',
            },
        ]
    else:
        snippets = [
            {
                "title": "Basic script template",
                "description": "A simple Python script template with output",
                "code": 'import json\n\n# Your logic here\nresult = {"status": "ok", "message": "Hello from step"}\n\nprint(json.dumps(result))',
            },
            {
                "title": "Process chained input",
                "description": "Read INPUT_DATA from previous step and process it",
                "code": 'import json\nimport os\n\n# Get input from previous step (chained mode)\nraw = os.environ.get("__CRON_INPUT_DATA__", "{}")\ndata = json.loads(raw)\n\n# Process\nresult = {\n    "received": len(data) if isinstance(data, list) else 1,\n    "processed": True,\n}\n\nprint(json.dumps(result))',
            },
            {
                "title": "HTTP POST to webhook",
                "description": "Send data to an external webhook",
                "code": 'import requests\nimport json\nimport os\n\nraw = os.environ.get("__CRON_INPUT_DATA__", "{}")\npayload = json.loads(raw)\n\nresponse = requests.post(\n    "https://webhook.example.com/endpoint",\n    json=payload,\n    timeout=30,\n)\nresponse.raise_for_status()\nprint(f"Sent: {response.status_code}")',
            },
        ]

    return snippets
