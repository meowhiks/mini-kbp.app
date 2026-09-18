# Email и Postfix (Docker)

Django шлёт письма через SMTP. В `docker-compose.yml` сервис **`postfix`** (образ `boky/postfix`) принимает почту от **`api`** на порту **25** внутри docker-сети (без TLS).

## Быстрый старт

В `.env`:

```env
APP_EMAIL_ENABLED=1
EMAIL_HOST=postfix
EMAIL_PORT=25
EMAIL_USE_TLS=0
EMAIL_USE_SSL=0
DEFAULT_FROM_EMAIL=MiniKBP <noreply@mini-kbp.site>
POSTFIX_HOSTNAME=mail.mini-kbp.site
POSTFIX_ALLOWED_SENDER_DOMAINS=mini-kbp.site,lk.mini-kbp.site
```

Перезапуск:

```bash
docker compose up -d postfix api
```

Проверка из контейнера api:

```bash
docker compose exec api python manage.py shell -c "from django.core.mail import send_mail; send_mail('Test','body','MiniKBP <noreply@mini-kbp.site>',['you@example.com'])"
```

Логи доставки:

```bash
docker compose logs postfix --tail 30
```

## Delivery: no в проверках (noreply@…)

Чекеры смотрят **входящую** доставку на MX `mail.mini-kbp.site`. Чтобы было **yes**:

1. **DNS:** A или CNAME `mail.mini-kbp.site` → tunnel/сервер (см. `docker/cloudflare/config.yml`, ingress `tcp://postfix:25`).
2. **MX** `@` → `mail.mini-kbp.site` (priority 10) — у вас уже есть.
3. **SPF** TXT `@`: `v=spf1 include:_spf.mx.cloudflare.net ~all` (если SMTP через tunnel) или `v=spf1 ip4:ВАШ_IP ~all`.
4. **Исходящие** письма Django (регистрация, сброс пароля) без relay часто **не доходят** — см. relay ниже.

`noreply@` обычно **не принимает** почту; «Delivery: no» не мешает отправке кодов, если настроен **relay**.

## Почему письма не доходят до Gmail/Yandex

1. **Порт 25 заблокирован** у провайдера или на Windows/Docker — прямой MX-доступ (`gmail-smtp-in.l.google.com:25`) даёт `Connection refused`.
2. **Нет SPF/DKIM** с IP отправителя — даже при открытом 25 письма часто попадают в спам.
3. **IPv6 в Docker** на Windows часто недоступен — в compose включён `POSTFIX_inet_protocols=ipv4`.

**Решение:** SMTP relay на порту **587** (или прямой SMTP из Django, минуя postfix).

### Вариант A — relay через postfix (рекомендуется)

В `.env`:

```env
EMAIL_RELAYHOST=[smtp.yandex.ru]:587
EMAIL_RELAYHOST_USER=noreply@mini-kbp.site
EMAIL_RELAYHOST_PASSWORD=пароль-приложения
```

Для Gmail:

```env
EMAIL_RELAYHOST=[smtp.gmail.com]:587
EMAIL_RELAYHOST_USER=you@gmail.com
EMAIL_RELAYHOST_PASSWORD=app-password-16-chars
```

После изменений:

```bash
docker compose up -d --force-recreate postfix api
```

### Вариант B — внешний SMTP напрямую из Django

Обойти postfix, если relay не нужен:

```env
EMAIL_HOST=smtp.yandex.ru
EMAIL_PORT=587
EMAIL_USE_TLS=1
EMAIL_USE_SSL=0
EMAIL_HOST_USER=noreply@mini-kbp.site
EMAIL_HOST_PASSWORD=...
```

`api` может работать без сервиса `postfix`, но `depends_on: postfix` в compose можно оставить.

## DNS (продакшен)

Для отправки с `noreply@mini-kbp.site` с VPS `46.53.243.31`:

| Запись | Значение |
|--------|----------|
| A `mail` | `46.53.243.31` |
| MX `@` | `mail.mini-kbp.site` |
| TXT `@` SPF | `v=spf1 ip4:46.53.243.31 ~all` |

Если relay — другой хост (Yandex, Gmail), SPF должен включать **их** серверы, а не только ваш IP.

## Что уходит на почту

- Подтверждение регистрации и сброс пароля (`accounts/app_email.py`)
- Смена email в профиле
- **Изменение отметки** в журнале (если у студента есть `AppAccount` с email)

Повторная регистрация с той же почтой **разрешена**, пока email не подтверждён — письмо отправится снова.

## Telegram

При изменении отметки дублируется сообщение в Telegram, если у `AppAccount` заполнен `telegram_id` и задан `TELEGRAM_BOT_TOKEN`.
