import type { Metadata } from "next";
import LegalBackLink from "@/app/components/LegalBackLink";

export const metadata: Metadata = {
  title: "Пользовательское соглашение",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-3 py-12 text-neutral-800 sm:px-4">
      <LegalBackLink />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Пользовательское соглашение</h1>
      <p className="mt-2 text-sm text-neutral-500">Редакция от 6 сентября 2026 г.</p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-neutral-600">
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-neutral-900">1. Предмет</h2>
          <p>
            Соглашение регулирует доступ к сайтам mini-kbp.site, lk.mini-kbp.site, panel.mini-kbp.site, к
            мобильному приложению и Desktop (Windows/Linux) Мини КБиП. Пользуясь сервисом, вы принимаете эти
            условия.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-neutral-900">2. Неофициальный статус</h2>
          <p>
            Мини КБиП не является официальным ресурсом Колледжа бизнеса и права и не связан с администрацией
            колледжа. Расписание, замены и оценки могут отличаться от kbp.by и бумажного журнала. При
            расхождении ориентируйтесь на официальные данные колледжа.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-neutral-900">3. Аккаунт и доступ</h2>
          <p>
            Вход возможен по почте, Google, Telegram или коду приглашения. Вы отвечаете за сохранность
            устройства и сессии. Запрещено передавать коды доступа посторонним, подбирать чужие пароли и
            обходить ограничения панели персонала.
          </p>
          <p>
            Панель преподавателя (panel.mini-kbp.site) доступна только сотрудникам с соответствующей ролью.
            Студенческий кабинет на панели не открывается: при отсутствии прав показывается отказ.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-neutral-900">4. Журнал преподавателя</h2>
          <p>
            Оценки, опоздания, зачёты и лабораторные, которые выставляет преподаватель, хранятся в учебной
            системе Мини КБиП. Искажать чужие данные, массово удалять журнал без необходимости или выдавать
            сервис за официальный журнал колледжа запрещено.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-neutral-900">5. Приложение и веб</h2>
          <p>
            Android- и Desktop-сборки публикуются «как есть». iOS пока не поддерживается. Веб-версия может
            отличаться от приложений. Мы можем менять функции, ограничивать доступ или отключать части
            сервиса.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-neutral-900">6. Запрещено</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>взлом, сканирование уязвимостей без согласования, DDoS;</li>
            <li>парсинг чужих журналов и массовый сбор персональных данных;</li>
            <li>выдавать Мини КБиП за официальный сайт колледжа;</li>
            <li>размещать вредоносный контент в профиле.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-neutral-900">7. Ответственность</h2>
          <p>
            Сервис предоставляется «как есть», без гарантии бесперебойности. Мы не отвечаем за решения,
            принятые только на основании оценок или расписания в Мини КБиП, и за сбои сети или сторонних
            входов (Google, Telegram).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-neutral-900">8. Изменения</h2>
          <p>
            Новая редакция публикуется на этой странице. Продолжая пользоваться сервисом после обновления, вы
            принимаете изменения.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-neutral-900">9. Контакты</h2>
          <p>
            <a href="https://t.me/meowhiks" className="text-[#3390ec] hover:underline">
              @meowhiks
            </a>
            {" · "}
            <a href="https://t.me/mini_kbp" className="text-[#3390ec] hover:underline">
              @mini_kbp
            </a>
            {" · "}
            <a href="https://github.com/meowhiks/mini-kbp" className="text-[#3390ec] hover:underline">
              GitHub
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
