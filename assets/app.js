/* Shark News — loads the validated digests and renders them.
   Every value that comes from a digest is written with textContent or a
   property assignment, never innerHTML: the CI schema check is the first
   XSS barrier, this is the second.

   Route lives in the hash: "#2026-07-24" or "#2026-07-24/security", so both
   the edition and the active filter are shareable. */

(function () {
  "use strict";

  var STORAGE_KEY = "shark-news-theme";
  var THEME_COLORS = { light: "#f7fafb", dark: "#0f1620" };

  var CATEGORIES = {
    ai: "IA",
    dev: "Desarrollo",
    devops: "DevOps",
    cloud: "Cloud",
    security: "Seguridad"
  };

  var el = {
    status: document.getElementById("status"),
    digest: document.getElementById("digest"),
    heading: document.getElementById("digest-heading"),
    summary: document.getElementById("digest-summary"),
    filters: document.getElementById("filters"),
    items: document.getElementById("items"),
    noMatches: document.getElementById("no-matches"),
    select: document.getElementById("day-select"),
    prev: document.getElementById("prev-day"),
    prevLabel: document.getElementById("prev-label"),
    next: document.getElementById("next-day"),
    nextLabel: document.getElementById("next-label"),
    themeToggle: document.getElementById("theme-toggle"),
    themeLabel: document.getElementById("theme-toggle-label"),
    themeColor: document.getElementById("theme-color")
  };

  var days = [];
  var current = null;
  var filter = "all";

  /* ---------- theme ---------- */

  function isDark() {
    return document.documentElement.getAttribute("data-theme") === "dark";
  }

  function paintToggle() {
    var dark = isDark();
    el.themeToggle.setAttribute("aria-pressed", String(dark));
    el.themeLabel.textContent = dark ? "Modo claro" : "Modo oscuro";
    el.themeColor.setAttribute("content", dark ? THEME_COLORS.dark : THEME_COLORS.light);
  }

  function toggleTheme() {
    var next = isDark() ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch (error) {
      /* Storage unavailable: the choice simply will not survive a reload. */
    }
    paintToggle();
  }

  /* ---------- dates ---------- */

  function toDate(iso) {
    var parts = iso.split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function toIso(date) {
    function pad(value) {
      return String(value).padStart(2, "0");
    }
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function todayIso() {
    return toIso(new Date());
  }

  function yesterdayIso() {
    var date = new Date();
    date.setDate(date.getDate() - 1);
    return toIso(date);
  }

  function longDate(iso) {
    return toDate(iso).toLocaleDateString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }

  function shortDate(iso) {
    return toDate(iso).toLocaleDateString("es-AR", {
      weekday: "short",
      day: "numeric",
      month: "short"
    });
  }

  function editionLabel(iso) {
    if (iso === todayIso()) return "Hoy — " + longDate(iso);
    if (iso === yesterdayIso()) return "Ayer — " + longDate(iso);
    return longDate(iso);
  }

  function capitalise(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  /* ---------- routing ---------- */

  function parseHash() {
    var parts = window.location.hash.slice(1).split("/");
    return {
      date: parts[0] || "",
      category: parts[1] && CATEGORIES[parts[1]] ? parts[1] : "all"
    };
  }

  function writeHash(date, category) {
    var value = date + (category && category !== "all" ? "/" + category : "");
    if (window.location.hash.slice(1) !== value) window.location.hash = value;
  }

  /* ---------- rendering ---------- */

  function say(message) {
    el.status.textContent = message;
    el.status.hidden = false;
    el.digest.hidden = true;
  }

  function buildItem(item) {
    var li = document.createElement("li");
    li.className = "item";
    li.dataset.category = item.category;

    var meta = document.createElement("p");
    meta.className = "item-meta";

    var pill = document.createElement("span");
    pill.className = "pill";
    pill.style.setProperty("--pill-bg", "var(--" + item.category + "-bg)");
    pill.style.setProperty("--pill-fg", "var(--" + item.category + "-fg)");
    pill.textContent = CATEGORIES[item.category] || item.category;
    meta.appendChild(pill);

    var source = document.createElement("span");
    source.className = "src";
    source.textContent = item.source;
    meta.appendChild(source);

    var heading = document.createElement("h3");
    var titleLink = document.createElement("a");
    titleLink.href = item.url;
    titleLink.rel = "noopener noreferrer";
    titleLink.target = "_blank";
    titleLink.textContent = item.title;
    heading.appendChild(titleLink);

    var summary = document.createElement("p");
    summary.textContent = item.summary;

    var url = document.createElement("a");
    url.className = "url";
    url.href = item.url;
    url.rel = "noopener noreferrer";
    url.target = "_blank";
    url.translate = false;
    url.textContent = item.url.replace(/^https:\/\//, "");

    li.appendChild(meta);
    li.appendChild(heading);
    li.appendChild(summary);
    li.appendChild(url);
    return li;
  }

  function applyFilter() {
    var visible = 0;
    Array.prototype.forEach.call(el.items.children, function (li) {
      var show = filter === "all" || li.dataset.category === filter;
      li.hidden = !show;
      if (show) visible += 1;
    });
    el.noMatches.hidden = visible !== 0 || el.items.children.length === 0;
  }

  function setFilter(category, updateUrl) {
    filter = CATEGORIES[category] ? category : "all";
    Array.prototype.forEach.call(el.filters.children, function (chip) {
      chip.setAttribute("aria-pressed", String(chip.dataset.category === filter));
    });
    applyFilter();
    if (updateUrl) writeHash(current, filter);
  }

  function buildFilters(items) {
    el.filters.textContent = "";
    var present = [];
    items.forEach(function (item) {
      if (present.indexOf(item.category) === -1) present.push(item.category);
    });
    if (present.length < 2) return;

    [["all", "Todas"]]
      .concat(
        present.map(function (key) {
          return [key, CATEGORIES[key] || key];
        })
      )
      .forEach(function (pair) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip";
        chip.dataset.category = pair[0];
        chip.textContent = pair[1];
        chip.setAttribute("aria-pressed", "false");
        chip.addEventListener("click", function () {
          setFilter(pair[0], true);
        });
        el.filters.appendChild(chip);
      });
  }

  function render(digest, category) {
    el.heading.textContent = "Edición del " + longDate(digest.date);
    el.summary.textContent = digest.summary;
    document.title = "Shark News · " + capitalise(longDate(digest.date));

    el.items.textContent = "";
    digest.items.forEach(function (item) {
      el.items.appendChild(buildItem(item));
    });

    buildFilters(digest.items);
    setFilter(category, false);

    el.status.hidden = true;
    el.digest.hidden = false;
  }

  /* ---------- navigation ---------- */

  function updateNav() {
    var index = days.indexOf(current);
    el.select.value = current;

    /* days[0] is the newest edition, so there is never a "next" beyond it —
       which is also why a future date can never be reached. */
    var hasNewer = index > 0;
    var hasOlder = index !== -1 && index < days.length - 1;

    el.next.disabled = !hasNewer;
    el.prev.disabled = !hasOlder;
    el.nextLabel.textContent = hasNewer ? shortDate(days[index - 1]) : "Siguiente";
    el.prevLabel.textContent = hasOlder ? shortDate(days[index + 1]) : "Anterior";
  }

  function load(date, category) {
    current = date;
    updateNav();
    say("Cargando la edición del " + longDate(date) + "…");

    fetch("data/" + date + ".json")
      .then(function (response) {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then(function (digest) {
        render(digest, category);
      })
      .catch(function () {
        say(
          "No se pudo cargar la edición del " +
            longDate(date) +
            ". Probá recargar la página."
        );
      });
  }

  function onRoute() {
    var route = parseHash();
    var date = days.indexOf(route.date) !== -1 ? route.date : days[0];

    if (date !== current) {
      load(date, route.category);
    } else {
      setFilter(route.category, false);
    }
  }

  function start(index) {
    var today = todayIso();

    /* Defensive: never surface an edition dated in the future, even if one
       somehow reached the data branch. */
    var entries = (index.days || []).filter(function (day) {
      return day.date <= today;
    });

    days = entries.map(function (day) {
      return day.date;
    });

    if (days.length === 0) {
      say("Todavía no hay ediciones publicadas. Volvé mañana a las 9.");
      el.select.disabled = true;
      return;
    }

    entries.forEach(function (day) {
      var option = document.createElement("option");
      option.value = day.date;
      option.textContent = capitalise(editionLabel(day.date)) + " · " + day.count;
      el.select.appendChild(option);
    });

    el.select.addEventListener("change", function () {
      writeHash(el.select.value, "all");
    });
    el.prev.addEventListener("click", function () {
      writeHash(days[days.indexOf(current) + 1], "all");
    });
    el.next.addEventListener("click", function () {
      writeHash(days[days.indexOf(current) - 1], "all");
    });
    window.addEventListener("hashchange", onRoute);

    document.addEventListener("keydown", function (event) {
      var tag = (event.target.tagName || "").toLowerCase();
      if (tag === "select" || tag === "input" || tag === "textarea") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "ArrowLeft" && !el.prev.disabled) el.prev.click();
      if (event.key === "ArrowRight" && !el.next.disabled) el.next.click();
    });

    onRoute();
  }

  el.themeToggle.addEventListener("click", toggleTheme);
  paintToggle();

  /* The index changes every morning, so always revalidate it. The per-day
     files are immutable once published and may be cached freely. */
  fetch("index.json", { cache: "no-cache" })
    .then(function (response) {
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    })
    .then(start)
    .catch(function () {
      say("No se pudo cargar el índice de ediciones. Probá recargar la página.");
    });
})();
