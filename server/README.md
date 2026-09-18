# kbp_server — Python-бэкенд MiniKBP

Django + DRF + SimpleJWT бэкенд для веб-приложения MiniKBP.
**Мобильное приложение (Capacitor / Android) этот сервис не использует.**

## Назначение

Хранит:
- учителей (с авторизацией через `auth.User`),
- студентов,
- группы и предметы,
- зачисления студентов в группы,
- назначения «учитель → группа → предмет» с типом занятия, семестром и часами.

## Запуск

```bash
# 1. Создать venv (один раз)
python -m venv venv

# 2. Активировать
# Windows (bash):
source venv/Scripts/activate
# Windows (cmd):
venv\Scripts\activate.bat
# Linux / macOS:
source venv/bin/activate

# 3. Зависимости
pip install -r requirements.txt

# 4. Миграции
python manage.py migrate

# 5. Создать суперюзера для /admin (опционально)
python manage.py createsuperuser

# 6. Запустить
python manage.py runserver 8000
```

## Тесты

```bash
python manage.py test
```

Покрывают модели, уникальные ограничения, логин, защиту эндпоинтов,
CRUD-операции через API.

## API

Все эндпоинты ниже (кроме login/refresh) требуют JWT в заголовке:
```
Authorization: Bearer <access_token>
```

### Аутентификация

| Метод | URL                       | Описание                          |
|-------|---------------------------|-----------------------------------|
| POST  | `/api/auth/login/`        | Логин учителя → JWT               |
| POST  | `/api/auth/refresh/`      | Обновление access-токена          |

Логин принимает `{"username", "password"}`, возвращает
`{"access", "refresh", "teacher_id", "full_name"}`.

### CRUD

| Ресурс       | URL                        |
|--------------|----------------------------|
| Учителя      | `/api/teachers/`           |
| Студенты     | `/api/students/`           |
| Группы       | `/api/groups/`             |
| Предметы     | `/api/subjects/`           |
| Зачисления   | `/api/enrollments/`        |
| Назначения   | `/api/assignments/`        |

### Доп. экшены

| Метод | URL                                            | Описание                            |
|-------|------------------------------------------------|-------------------------------------|
| GET   | `/api/teachers/me/`                            | Профиль текущего учителя            |
| GET   | `/api/groups/{id}/students/`                   | Активные студенты группы            |
| GET   | `/api/groups/{id}/assignments/`                | Назначения в группе                 |
| GET   | `/api/assignments/by-teacher/{teacher_id}/`    | Все назначения учителя              |
| GET   | `/api/grades/`                                 | Список отметок (фильтры: assignment, student, group) |
| GET   | `/api/grades/by-assignment/{assignment_id}/`   | Отметки по назначению               |
| POST  | `/api/auth/admin-login/`                       | Логин администратора (is_staff)     |

## Структура БД

```
auth.User
  └─< Teacher            (1:1)
         └─< TeachingAssignment (1:N)
              ├─> Group
              └─> Subject

auth.User (опц.)
  └─< Student           (1:1)
         └─< Enrollment    (1:N)
              └─> Group
```

См. `accounts/models.py` и `academics/models.py`.