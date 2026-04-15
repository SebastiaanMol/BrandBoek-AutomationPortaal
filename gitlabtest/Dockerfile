# syntax=docker/dockerfile:1

FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /code

COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-editable

COPY ./app /code/app

ENV PYTHONPATH=/code
ENV PYTHONUNBUFFERED=1

ENTRYPOINT ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "80", "--log-level", "info"]
