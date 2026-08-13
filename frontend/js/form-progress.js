(function () {
  function text(value) {
    return String(value ?? "").trim();
  }

  function sectionComplete(section) {
    const fields = [...section.querySelectorAll("input:not([type=hidden]):not([type=file]), textarea, select")];
    if (!fields.length) return false;
    return fields.some((field) => field.type === "checkbox" ? field.checked : text(field.value));
  }

  function setup(nav) {
    const links = [...nav.querySelectorAll("a[href^='#']")];
    const sections = links.map((link) => document.querySelector(link.getAttribute("href"))).filter(Boolean);
    if (!sections.length) return;

    const progress = document.createElement("div");
    progress.className = "form-progress";
    progress.innerHTML = '<div class="form-progress-heading"><strong data-form-progress-label>Secao 1</strong><span data-form-progress-count></span></div><div class="form-progress-track"><span data-form-progress-bar></span></div>';
    nav.prepend(progress);

    const update = (activeIndex = 0) => {
      const safeIndex = Math.max(0, Math.min(activeIndex, sections.length - 1));
      const completed = sections.filter(sectionComplete).length;
      progress.querySelector("[data-form-progress-label]").textContent = links[safeIndex]?.textContent.trim() || `Secao ${safeIndex + 1}`;
      progress.querySelector("[data-form-progress-count]").textContent = `${safeIndex + 1} de ${sections.length} - ${completed} preenchida${completed === 1 ? "" : "s"}`;
      progress.querySelector("[data-form-progress-bar]").style.width = `${((safeIndex + 1) / sections.length) * 100}%`;
      links.forEach((link, index) => link.classList.toggle("is-current", index === safeIndex));
    };

    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) update(sections.indexOf(visible.target));
    }, { rootMargin: "-110px 0px -55% 0px", threshold: 0 });
    sections.forEach((section) => observer.observe(section));

    const form = nav.closest("form")
      || nav.parentElement?.querySelector("form")
      || nav.parentElement?.parentElement?.querySelector("form");
    form?.addEventListener("input", () => update(sections.findIndex((section) => section.classList.contains("is-current")) || 0));
    form?.addEventListener("change", () => update(sections.findIndex((section) => section.classList.contains("is-current")) || 0));
    update(0);
  }

  document.querySelectorAll("[data-form-progress-nav]").forEach(setup);
}());
