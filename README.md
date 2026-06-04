# mark1_seance

A minimal text-to-image web app. Type a prompt, press Enter, and Replicate generates a full-screen background image with spiral text and sound effects.

## Requirements

- Python 3.9+
- A [Replicate API token](https://replicate.com/account/api-tokens)

## Setup

1. Clone the repo and enter the project directory:

   ```bash
   cd seance-interface
   ```

2. Create a virtual environment (recommended):

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

4. Add your Replicate token:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set:

   ```
   REPLICATE_API_TOKEN=r8_your_token_here
   ```

## Run

Start the Flask server:

```bash
python3 server.py
```

Or:

```bash
flask --app server run
```

Open **http://localhost:3000** in your browser (do not open `index.html` directly — the app needs the server to proxy Replicate and avoid CORS).

On startup you should see `Replicate API token OK.` If you see a token warning, check `.env` and restart.

## Usage

- Type a prompt in the box at the bottom and press **Enter** to generate.
- **Shift+Enter** adds a new line in the prompt.
- While generating: spiral text animation, shimmer audio, and a pulsing fade overlay.
- When the image is ready: it becomes the full-screen background and conjuring audio plays.

## Project layout

| File | Purpose |
|------|---------|
| `index.html` | Frontend UI |
| `server.py` | Flask app — serves the page and proxies `/api/generate` to Replicate |
| `.env` | Your API token (not committed) |
