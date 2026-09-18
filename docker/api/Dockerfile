# Dev-образ: server/ монтируется через compose.
# Пересборка нужна только при смене requirements.txt.
FROM python:3.12-slim

WORKDIR /app

COPY server/requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt

EXPOSE 8000
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
