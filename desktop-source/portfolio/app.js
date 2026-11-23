(() => {
  "use strict";

  const tours = {
    home: {
      image: "assets/01-home.png",
      width: 2880,
      height: 1800,
      alt: "Главный экран IT English Lab: маршрут дня, очередь повторения и цель",
      url: "IT English Lab · #/home",
      kicker: "01 · Главная",
      title: "Один экран — следующий шаг",
      text: "Продолжить юнит, открыть материалы, увидеть очередь повторения и цель дня.",
      tag: "Стартовый экран",
      mobile: false,
    },
    materials: {
      image: "assets/02-textbook.png",
      width: 2880,
      height: 1800,
      alt: "Каталог из 15 юнитов с прогрессом и количеством материалов",
      url: "IT English Lab · #/textbook",
      kicker: "02 · Материалы",
      title: "15 юнитов как карта",
      text: "Поиск по темам, прогресс и количество материалов на каждом юните. Видно, что уже пройдено, а что ждёт.",
      tag: "Учебник",
      mobile: false,
    },
    qa: {
      image: "assets/05-unit-qa.png",
      width: 2880,
      height: 1800,
      alt: "Экран Q&A: английский ответ и русский перевод под вопросом",
      url: "IT English Lab · #/unit/3/qa",
      kicker: "03 · Q&A",
      title: "Ответы, которые можно произнести",
      text: "60 вопросов к экзамену. Английский ответ A2–B1 и русский перевод — сразу, без скрытых аккордеонов.",
      tag: "Экзаменационный банк",
      mobile: false,
    },
    study: {
      image: "assets/06-study.png",
      width: 2880,
      height: 1800,
      alt: "Центр учёбы: readiness, дневные лимиты, FSRS-очередь и план",
      url: "IT English Lab · #/study",
      kicker: "04 · Учёба",
      title: "Учёба без перегрузки",
      text: "Readiness, дневные лимиты, FSRS-очередь, leech-колода и план на неделю. Система показывает, что делать дальше.",
      tag: "FSRS",
      mobile: false,
    },
    trainer: {
      image: "assets/07-trainer.png",
      width: 2880,
      height: 1800,
      alt: "Тренажёр: выбор режима практики",
      url: "IT English Lab · #/trainer",
      kicker: "05 · Тренажёр",
      title: "Тренажёр под задачу",
      text: "Карточки, выбор, ввод, mixed и cloze из реальных текстов. Ошибки уходят в тетрадь и возвращаются в очередь.",
      tag: "Пять режимов",
      mobile: false,
    },
    exam: {
      image: "assets/10-exam-runner.png",
      width: 2880,
      height: 1800,
      alt: "Экзаменационный режим: карта вопросов, таймер и флаги",
      url: "IT English Lab · #/exam",
      kicker: "06 · Экзамен",
      title: "Экзамен как репетиция",
      text: "Карта вопросов, таймер, флаги, precheck и разбор ошибок после попытки — без сюрпризов в день экзамена.",
      tag: "Режим репетиции",
      mobile: false,
    },
    speaking: {
      image: "assets/13-speaking.png",
      width: 2880,
      height: 1800,
      alt: "Speaking-практика: промпт, запись и self-assessment",
      url: "IT English Lab · #/speaking",
      kicker: "07 · Речь",
      title: "Слушать и говорить",
      text: "141 промпт, запись, self-assessment и пять локальных WAV-уроков с заданиями. Можно тренироваться без сети.",
      tag: "Speaking",
      mobile: false,
    },
    mobile: {
      image: "assets/19-mobile-qa.png",
      width: 780,
      height: 1688,
      alt: "Мобильный экран Q&A с английским и русским ответом",
      url: "IT English Lab · mobile · #/unit/14/qa",
      kicker: "08 · Мобильный",
      title: "Тот же маршрут. В кармане.",
      text: "390 и 360 px, нижняя навигация, safe-area и те же Q&A. Читать и повторять можно с телефона.",
      tag: "390 / 360 px",
      mobile: true,
    },
  };

  const tabs = Array.from(document.querySelectorAll("[data-tour]"));
  const panel = document.getElementById("tour-panel");
  const image = document.getElementById("tour-image");
  const url = document.getElementById("tour-url");
  const kicker = document.getElementById("tour-kicker");
  const captionTitle = document.getElementById("tour-caption-title");
  const captionText = document.getElementById("tour-caption-text");
  const tag = document.getElementById("tour-tag");
  let activeTour = "home";

  const setTour = (key, focusTab) => {
    const data = tours[key];
    if (!data || key === activeTour) {
      if (focusTab) {
        const tab = tabs.find((item) => item.dataset.tour === key);
        tab?.focus();
      }
      return;
    }
    activeTour = key;

    tabs.forEach((tab) => {
      const active = tab.dataset.tour === key;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });

    panel.classList.toggle("is-mobile", Boolean(data.mobile));
    image.classList.add("is-loading");
    image.onload = () => image.classList.remove("is-loading");
    image.onerror = () => image.classList.remove("is-loading");
    image.src = data.image;
    image.alt = data.alt;
    image.setAttribute("width", String(data.width));
    image.setAttribute("height", String(data.height));
    url.textContent = data.url;
    kicker.textContent = data.kicker;
    captionTitle.textContent = data.title;
    captionText.textContent = data.text;
    tag.textContent = data.tag;

    if (focusTab) {
      const tab = tabs.find((item) => item.dataset.tour === key);
      tab?.focus();
    }
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => setTour(tab.dataset.tour, false));
    tab.addEventListener("keydown", (event) => {
      const index = tabs.indexOf(tab);
      let nextIndex = index;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        nextIndex = (index + 1) % tabs.length;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        nextIndex = (index - 1 + tabs.length) % tabs.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = tabs.length - 1;
      } else {
        return;
      }
      event.preventDefault();
      setTour(tabs[nextIndex].dataset.tour, true);
    });
  });

  // Preload tour images after the first paint so switching feels instant.
  const preload = () => {
    Object.values(tours).forEach((item) => {
      const img = new Image();
      img.src = item.image;
    });
  };
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(preload, { timeout: 2200 });
  } else {
    window.setTimeout(preload, 700);
  }

  const reveals = Array.from(document.querySelectorAll(".reveal"));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduceMotion || !("IntersectionObserver" in window)) {
    reveals.forEach((item) => item.classList.add("is-visible"));
  } else {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -36px" }
    );
    reveals.forEach((item) => observer.observe(item));
  }

  // Keep the demo download honest when the local build is not next to the portfolio.
  const demoLink = document.querySelector('a[href$="it-english-lab.exe"]');
  if (demoLink) {
    demoLink.addEventListener("click", () => {
      const note = document.querySelector(".demo-copy .micro");
      if (note) {
        note.textContent =
          "Если файл не скачался, сборка ещё не лежит в dist/ рядом с портфолио. Официальный подписанный релиз готовится отдельно; ИИ — опция.";
      }
    });
  }
})();
