import type { Metadata } from "next";
import LegalBackLink from "@/app/components/LegalBackLink";

export const metadata: Metadata = {
  title: "Политика конфиденциальности",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-3 py-12 text-neutral-800 sm:px-4">
      <LegalBackLink />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Политика конфиденциальности</h1>
      <p className="mt-2 text-sm text-neutral-500">Редакция от 6 сентября 2026 г. Оператор: проект Мини КБиП.</p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-neutral-600">
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-neutral-900">1. Кто мы и зачем эта политика</h2>
          <p>
            Мини КБиП — неофициальный сервис расписания, журнала и кабинета преподавателя на доменах
            mini-kbp.site, lk.mini-kbp.site, panel.mini-kbp.site и связанных API. Сервис не является сайтом
            Колледжа бизнеса и права и не заменяет kbp.by.
          </p>
          <p>
            Политика описывает, какие данные обрабатываются в веб-кабинете, Android-приложении и Desktop
            (Windows/Linux). Мы не продаём персональные данные и не размещаем стороннюю рекламу.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-neutral-900">2. Какие данные обрабатываются</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              учётная запись: почта, имя, ник, телефон и поля профиля (если указали), аватар, пол, «о себе»,
              источник регистрации;
            </li>
            <li>
              идентификаторы входа: Google (<span className="whitespace-nowrap">google_sub</span>), Telegram
              (id и username), хеш пароля при регистрации по почте;
            </li>
            <li>
              учебные сведения: группа, связка со студентом/преподавателем, оценки, посещаемость, опоздания,
              зачёты, лабораторные, служебные аудиты журнала;
            </li>
            <li>
              сессии: cookie и JWT, тип устройства, IP, User-Agent, время визита и срок жизни сессии;
            </li>
            <li>
              push: токен устройства (FCM), platform, выбранная сущность расписания для уведомлений;
            </li>
            <li>
              на устройстве: тема и настройки, кэш журнала/расписания, офлайн-архивы, черновики операций
              журнала (IndexedDB / Preferences / localStorage).
            </li>
          </ul>
          <p>
            В приложениях доступен гостевой режим без аккаунта: можно смотреть расписание и часть настроек;
            профиль и безопасность при этом недоступны.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-neutral-900">3. Вход и cookie</h2>
          <p>
            Вход возможен по почте и паролю, через Google, Telegram или код приглашения. Cookie с доменом{" "}
            <span className="whitespace-nowrap">.mini-kbp.site</span> (сессия, паспорт профиля, access и
            refresh) нужны, чтобы кабинет, панель и главная узнавали вас без повторного входа. Они не
            используются для рекламных трекеров.
          </p>
          <p>
            В Android и Desktop вход через Google/Telegram открывается во внешнем браузере: сервис связывает
            завершённый вход с приложением по короткоживущему одноразовому токену (хранится во временном
            кэше, обычно Redis), без передачи пароля сторонним сайтам.
          </p>
          <p>
            Срок сессии: около 7 дней в мобильном приложении; в вебе и Desktop — по настройке аккаунта (по
            умолчанию 30 дней, до 365). Выйти можно из текущей сессии; отдельные устройства отзываются по
            одному в списке сессий.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-neutral-900">4. Зачем обрабатываем</h2>
          <p>
            Чтобы вы входили в кабинет, видели журнал и расписание, получали уведомления, а преподаватели
            вели журнал группы. Технические логи и ограничение частоты запросов нужны для защиты от злоупотреблений.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-neutral-900">5. Кому передаём</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Google и Telegram — как провайдеры входа (по их политикам);</li>
            <li>Firebase Cloud Messaging — доставка push на Android;</li>
            <li>почтовый провайдер (Resend или SMTP) — письма подтверждения и коды;</li>
            <li>Cloudflare — CDN/туннель перед сервером;</li>
            <li>Redis (или локальный кэш) — временные коды, OAuth-связки, служебные статусы;</li>
            <li>
              kbp.by — при запросах расписания/замен через наш прокси; отдельное согласие на браузерный релей
              (расширение) действует только для запросов к kbp.by.
            </li>
          </ul>
          <p>Журнал и оценки не передаём третьим лицам для маркетинга. Опционально может использоваться API распознавания для сканов замен — только для этой функции.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-neutral-900">6. Аналитика</h2>
          <p>
            Рекламных трекеров в приложении нет. Внутренняя админ-аналитика считает служебные показатели для
            операторов. Веб-аналитика Vercel включается только при явной настройке окружения и не обязательна.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-neutral-900">7. Срок хранения и ваши права</h2>
          <p>
            Данные аккаунта хранятся, пока аккаунт активен. Временные коды и OAuth-связки живут минуты или
            часы. В кабинете можно править профиль, отзывать отдельные сессии и удалить аккаунт самостоятельно
            (с подтверждением; при включённой 2FA — с кодом). Учётка персонала самоудалением через тот же
            сценарий не закрывается.
          </p>
          <p>
            После удаления аккаунта связка со студентом снимается, но учебные записи журнала (оценки и т.п.),
            внесённые преподавателями, могут остаться в системе учёта группы. Локальный кэш на устройстве
            можно очистить в настройках приложения.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-neutral-900">8. Дети и безопасность</h2>
          <p>
            Сервис рассчитан на учащихся колледжа. Нельзя пытаться получить доступ к чужим оценкам или ломать
            сервис. Мы применяем HTTPS, проверку сессий, отзыв токенов и ограничение запросов.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-neutral-900">9. Изменения и контакты</h2>
          <p>
            Новая редакция публикуется на этой странице. Вопросы по данным:{" "}
            <a href="https://t.me/meowhiks" className="text-[#3390ec] hover:underline">
              Telegram разработчика
            </a>
            . Канал обновлений:{" "}
            <a href="https://t.me/mini_kbp" className="text-[#3390ec] hover:underline">
              @mini_kbp
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
