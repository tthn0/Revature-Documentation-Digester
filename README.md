# Documentation Digester

## Todo

- [ ] Restructure the project files.
- [ ] Dockerize the entire repo (including frontend and Ollama).

## About

This repository holds the final project for our Revature Java Full Stack Engineering training. This is a simple RAG application that integrates a FastAPI backend, an Angular frontend, a Chroma vector database, and a local Ollama server.

### Features

- Document uploading.
- Different chunking strategies (by character count or by semantic meaning).
- Chat answers with source chunks. Each chat keeps its own history in Postgres.

### Limitations

- The LLM doesn't have access to the internet.

### Tech Stack

- Python
- FastAPI
- LangChain
- Chroma
- PostgreSQL
- Angular
- Ollama

## Local Development Setup

### Frontend Setup

Make sure you have [Node.js](https://nodejs.org/en/download) installed first. Then run the following in your terminal:

```bash
cd frontend
npm i
npm start
```

### Backend Setup

Make sure you have [uv](https://docs.astral.sh/uv/getting-started/installation/) installed first. Then run the following in your terminal:

```bash
cd backend
uv run start
```

> [!IMPORTANT]
>
> <details>
>
> <summary><strong>If you have an Intel-based Mac</strong></summary>
>
> The Python dependencies resolve just fine on Windows, Linux, and Apple Silicon Macs. Intel-based Macs aren't compatible for some reason. A (not-so-ideal) workaround is to run the backend in a Docker container. The first step is to create a new environment file at `./backend/.env` with the following:
>
> ```env
> DATABASE_URL=postgresql+psycopg://postgres:postgres@host.docker.internal:5432/documentation_digester
> OLLAMA_BASE_URL=http://host.docker.internal:11434
> ```
>
> `host.docker.internal` is the machine running Docker. `localhost` inside the container is the container itself, so the API cannot reach Postgres or Ollama that way.
>
> Next, make sure your Docker daemon is running by opening the Docker app. Then run the following commands:
>
> ```bash
> cd backend
> docker compose up --build --watch
> ```
>
> </details>

> [!TIP]
> If your linter isn't picking up the installed dependencies properly in VS Code, try opening up the `backend` folder directly instead of the project root. (Unfortunately this trick still won't work for Intel-based Macs because you won't be able to install the dependencies in the first place.)

### Postgres Setup

User stories are stored in Postgres. `backend/db/schema.sql` creates the `user_stories` table and `backend/db/seed.sql` fills it with example stories (signals, nodes, scenes). Both are safe to re-run.

Make sure Docker is running, then run:

```bash
cd backend/db
docker compose up -d
```

The first start creates the database and loads both files. Then copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL` to:

```env
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/documentation_digester
```

> [!TIP]
> If port 5432 is already in use, set `POSTGRES_PORT` (for example `5434`) before `docker compose up -d` and use that port in `DATABASE_URL`. To reset the data, run `docker compose down -v`.
>
> Without Docker, load the files into your own Postgres with `psql -U postgres -d documentation_digester -f backend/db/schema.sql` and then the same for `seed.sql`.

### Ollama Setup

Make sure you have [Ollama](https://ollama.com/download) installed first. Then run the following in your terminal:

```bash
ollama serve
```

While keeping the previous terminal open, run the following in a separate terminal:

```bash
ollama pull nomic-embed-text:latest
ollama pull qwen2.5:1.5b
```

Not that these are just the models that have worked best for us. They are relatively small and pretty fast, even on older hardware. They might not be as smart, but they are still good for testing. If you'd like to use different models, pull them from Ollama, and make a new `./backend/.env` file with the following structure:

```env
OLLAMA_LLM_MODEL=qwen2.5:1.5b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text:latest
```
