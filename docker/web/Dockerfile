# Dev-образ: исходники монтируются через compose (./:/app).

# Пересборка нужна только при смене package.json / package-lock.json.

FROM node:20-alpine



WORKDIR /app



COPY package.json package-lock.json* ./

RUN --mount=type=cache,target=/root/.npm npm ci



COPY docker/web/entrypoint.sh /entrypoint.sh

RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh



ENV NEXT_TELEMETRY_DISABLED=1

ENV HOSTNAME=0.0.0.0

ENV PORT=3000



EXPOSE 3000

CMD ["/entrypoint.sh"]

