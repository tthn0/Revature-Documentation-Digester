# How to run Documentation Digester

The app is four pieces: PostgreSQL, a local Ollama server, the FastAPI backend, and the Angular frontend. Start them in that order. The chat page is http://localhost:4200 and the API is http://127.0.0.1:8000.

## What you need installed

- [Ollama](https://ollama.com/download)
- [uv](https://docs.astral.sh/uv/getting-started/installation/) (it installs Python 3.14 for the backend)
- [Node.js](https://nodejs.org/en/download)
- Docker Desktop, or PostgreSQL running locally

## 1. Start Ollama and pull the models

On Windows, opening a terminal and running `ollama list` starts the Ollama app if it is not already running. Then pull the two models the backend uses by default:

```powershell
ollama pull nomic-embed-text:latest
ollama pull qwen2.5:1.5b
```

Leave Ollama running. The embedding model is `nomic-embed-text:latest`. The chat model is `qwen2.5:1.5b`.

## 2. Start PostgreSQL

The backend will not start without `DATABASE_URL`. The first API start also creates LangGraph's checkpoint tables in this database. `backend/db/schema.sql` creates `user_stories`, and `backend/db/seed.sql` inserts the sample stories.

**Docker.** From the repo root, with Docker running:

```powershell
cd backend/db
docker compose up -d
```

The first start creates `documentation_digester`, loads both SQL files, and listens on port 5432 as user `postgres` with password `postgres`. If port 5432 is already in use, set `POSTGRES_PORT` (for example `5434`) in that same terminal before `docker compose up -d`, and use that port in `DATABASE_URL`.

**Local PostgreSQL.** Create the database, then load the same files. This example uses PostgreSQL 18's `psql`, run from the repo root:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE DATABASE documentation_digester;"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d documentation_digester -f backend/db/schema.sql
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d documentation_digester -f backend/db/seed.sql
```

If the database already exists, the create command reports that and you can continue. Both SQL files are safe to run more than once.

## 3. Configure the backend

In `backend/`, copy the example env file and edit it:

```powershell
cd backend
Copy-Item .env.example .env
```

`backend/.env` is gitignored. The backend loads it only when you start the app from the `backend` folder. A working file looks like this:

```env
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/documentation_digester
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_LLM_MODEL=qwen2.5:1.5b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text:latest
```

That URL matches the Docker database. If your local Postgres user has a different password, put it after `postgres:`. If it has no password, use `postgresql+psycopg://postgres@localhost:5432/documentation_digester`. Leave `OLLAMA_LLM_MODEL` out to keep the default `qwen2.5:1.5b`.

## 4. Start the backend

From `backend/`:

```powershell
uv run start
```

The first run installs Python dependencies and can take a minute. Wait until the log says `Application startup complete`. The API is then at:

- http://127.0.0.1:8000/docs
- http://127.0.0.1:8000/documents/names

Leave this terminal open. Chroma is stored in `backend/data/chroma` and is created on startup. Do not commit that folder or `backend/.env`.

## 5. Start the frontend

Open a second terminal at the repo root:

```powershell
cd frontend
npm install
npm start
```

`npm install` is only needed the first time. When the log shows `Local: http://localhost:4200/`, open that address. The page talks to `http://localhost:8000/documents`.

Type a question and press Send. A question such as “How do I use signals to communicate between nodes?” only works after `signals.txt` has been uploaded (see below). Source chips under the answer show the file name and chunk.

## 6. Load the sample Godot docs

Supported uploads are `.txt`, `.rst`, `.md`, `.pdf`, and `.docx`.

From the chat page, use **Upload text file** and pick files in `data/samples/`:

- `signals.txt`
- `instancing.md`
- `nodes_and_scenes.pdf`

Or upload with the API, from the repo root:

```powershell
curl.exe -F "file=@data/samples/signals.txt" http://127.0.0.1:8000/documents/upload
curl.exe -F "file=@data/samples/instancing.md" http://127.0.0.1:8000/documents/upload
curl.exe -F "file=@data/samples/nodes_and_scenes.pdf" http://127.0.0.1:8000/documents/upload
```

The first upload of a file embeds it through Ollama, so it can take a while. `GET http://127.0.0.1:8000/documents/names` lists what is already indexed. Files already in the local Chroma database do not need to be uploaded again.

## 7. Index user stories (only for combined search)

The chat page does not need this. `POST /documents/search` returns document chunks and user stories, and it returns 404 until those stories are embedded into Chroma. The rows come from `backend/db/seed.sql`. After the API is running, index them:

```powershell
curl.exe -X POST http://127.0.0.1:8000/user-stories/index
```

A response like `{"indexed": 12}` means the stories are in the `user_stories` Chroma collection. Search then accepts `{ "question": "...", "k": 5 }`.

## Stop

Press Ctrl+C in the frontend terminal and in the backend terminal. Ollama and PostgreSQL can keep running.
