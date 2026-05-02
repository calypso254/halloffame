(function () {
  const DATA_URL = "data/pens.json";
  const PENS_PER_PAGE = 36;
  const STORAGE_KEY = "pengemsHallOfFameCollection";

  const state = {
    allPens: [],
    displayedPens: [],
    selectedYears: new Set(),
    currentSort: "newest",
    currentPage: 1,
    totalPages: 0,
    collection: {
      have: new Set(),
      want: new Set(),
    },
  };

  const elements = {
    gallery: document.getElementById("gallery"),
    status: document.getElementById("status-message"),
    search: document.getElementById("search-input"),
    years: document.getElementById("year-options"),
    clearYears: document.getElementById("clear-years"),
    sort: document.getElementById("sort-by"),
    resultCount: document.getElementById("result-count"),
    pageInfo: document.getElementById("page-info"),
    prev: document.getElementById("prev-page"),
    next: document.getElementById("next-page"),
    exportCsv: document.getElementById("export-csv"),
    statCount: document.getElementById("stat-count"),
    statYears: document.getElementById("stat-years"),
    menuToggle: document.querySelector(".menu-toggle"),
    mobileMenu: document.getElementById("mobile-menu"),
    filterToggle: document.querySelector(".filter-toggle"),
    filters: document.getElementById("filters"),
    filtersClose: document.querySelector(".filters-close"),
    overlay: document.getElementById("overlay"),
    lightbox: document.getElementById("lightbox"),
    lightboxImg: document.getElementById("lightbox-img"),
    lightboxClose: document.querySelector(".lightbox-close"),
    copyright: document.getElementById("copyright-year"),
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    loadCollection();
    bindEvents();
    setCopyright();
    fetchPenData();
  }

  function bindEvents() {
    elements.search.addEventListener("input", applyFilters);
    elements.sort.addEventListener("change", function () {
      state.currentSort = this.value;
      applyFilters();
    });
    elements.clearYears.addEventListener("click", function () {
      state.selectedYears.clear();
      document.querySelectorAll('input[name="year"]').forEach(function (checkbox) {
        checkbox.checked = false;
      });
      applyFilters();
    });
    elements.prev.addEventListener("click", function () {
      if (state.currentPage > 1) displayPage(state.currentPage - 1);
    });
    elements.next.addEventListener("click", function () {
      if (state.currentPage < state.totalPages) displayPage(state.currentPage + 1);
    });
    elements.exportCsv.addEventListener("click", downloadCSV);
    elements.menuToggle.addEventListener("click", toggleMobileMenu);
    elements.filterToggle.addEventListener("click", openFilters);
    elements.filtersClose.addEventListener("click", closeFilters);
    elements.overlay.addEventListener("click", function () {
      closeFilters();
      closeLightbox();
    });
    elements.lightbox.addEventListener("click", function (event) {
      if (event.target === elements.lightbox) closeLightbox();
    });
    elements.lightboxClose.addEventListener("click", closeLightbox);
    elements.gallery.addEventListener("click", function (event) {
      const button = event.target.closest("[data-track]");
      if (!button) return;
      toggleTrackedPen(button.dataset.track, button.dataset.id);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeFilters();
        closeLightbox();
      }
    });
  }

  function fetchPenData() {
    fetch(DATA_URL)
      .then(function (response) {
        if (!response.ok) throw new Error("The local archive data could not be reached.");
        return response.json();
      })
      .then(function (data) {
        if (!Array.isArray(data.pens)) throw new Error("The local archive data is missing.");

        state.allPens = data.pens.map(mapPen).filter(function (pen) {
          return pen.name && pen.image;
        });

        buildYearFilters();
        updateStats();
        applyFilters();
      })
      .catch(showLoadError);
  }

  function showLoadError(error) {
    elements.status.hidden = false;
    elements.status.textContent = `Failed to load the archive: ${error.message}`;
    elements.resultCount.textContent = "Archive unavailable";
  }

  function mapPen(pen) {
    const dateValue = pen.releaseDate || "";
    const parsedDate = parseDate(dateValue);

    return {
      id: pen.id,
      name: cleanText(pen.name),
      image: cleanImage(pen.image),
      date: dateValue,
      timestamp: parsedDate ? parsedDate.getTime() : 0,
      year: pen.year || (parsedDate ? parsedDate.getFullYear() : ""),
      formattedDate: parsedDate ? formatDate(parsedDate) : "Date Unavailable",
    };
  }

  function buildYearFilters() {
    const years = Array.from(new Set(state.allPens.map(function (pen) {
      return pen.year;
    }).filter(Boolean))).sort(function (a, b) {
      return b - a;
    });

    state.selectedYears = new Set(years.map(String));
    elements.years.innerHTML = years.map(function (year) {
      return `
        <label class="filter-option">
          <input type="checkbox" name="year" value="${year}" checked>
          <span>${year}</span>
        </label>
      `;
    }).join("");

    elements.years.addEventListener("change", function (event) {
      if (event.target.name !== "year") return;
      if (event.target.checked) {
        state.selectedYears.add(event.target.value);
      } else {
        state.selectedYears.delete(event.target.value);
      }
      applyFilters();
    }, { once: false });
  }

  function updateStats() {
    const years = state.allPens.map(function (pen) {
      return pen.year;
    }).filter(Boolean);

    const minYear = years.length ? Math.min.apply(null, years) : "";
    const maxYear = years.length ? Math.max.apply(null, years) : "";

    elements.statCount.textContent = state.allPens.length.toLocaleString();
    elements.statYears.textContent = minYear && maxYear ? `${minYear}-${maxYear}` : "Years updating";
  }

  function applyFilters() {
    const searchTerm = elements.search.value.trim().toLowerCase();
    const selectedYears = Array.from(state.selectedYears);
    const availableYearCount = document.querySelectorAll('input[name="year"]').length;
    const allYearsSelected = selectedYears.length === availableYearCount;

    state.displayedPens = state.allPens.filter(function (pen) {
      const matchesYear = selectedYears.length === 0 || allYearsSelected || selectedYears.includes(String(pen.year));
      const matchesSearch = !searchTerm || pen.name.toLowerCase().includes(searchTerm);
      return matchesYear && matchesSearch;
    });

    sortPens();
    displayPage(1);
  }

  function sortPens() {
    state.displayedPens.sort(function (a, b) {
      switch (state.currentSort) {
        case "oldest":
          return a.timestamp - b.timestamp;
        case "nameAZ":
          return a.name.localeCompare(b.name);
        case "nameZA":
          return b.name.localeCompare(a.name);
        case "newest":
        default:
          return b.timestamp - a.timestamp;
      }
    });
  }

  function displayPage(page) {
    state.currentPage = page;
    state.totalPages = Math.max(1, Math.ceil(state.displayedPens.length / PENS_PER_PAGE));

    const startIndex = (state.currentPage - 1) * PENS_PER_PAGE;
    const pens = state.displayedPens.slice(startIndex, startIndex + PENS_PER_PAGE);

    updateDisplay(pens);
    updatePaginationControls();
    updateResultCount();
  }

  function updateDisplay(pens) {
    elements.status.hidden = pens.length > 0;

    if (!pens.length) {
      elements.gallery.innerHTML = "";
      elements.status.textContent = "No retired pens match those filters.";
      return;
    }

    elements.gallery.innerHTML = pens.map(renderPenCard).join("");
    elements.gallery.querySelectorAll(".pen-image-button").forEach(function (button) {
      button.addEventListener("click", function () {
        openLightbox(button.dataset.image, button.dataset.name);
      });
    });
  }

  function renderPenCard(pen) {
    const hasPen = state.collection.have.has(pen.id);
    const wantsPen = state.collection.want.has(pen.id);

    return `
      <article class="pen-card">
        <button class="pen-image-button" type="button" data-image="${escapeHtml(pen.image)}" data-name="${escapeHtml(pen.name)}">
          <span class="pen-image-frame">
            <img src="${escapeHtml(pen.image)}" alt="${escapeHtml(pen.name)} Pen" class="pen-image" loading="lazy">
          </span>
        </button>
        <div class="pen-info">
          <h3 class="pen-name">${escapeHtml(pen.name)}</h3>
          <p class="pen-date">${escapeHtml(pen.formattedDate)}</p>
          <div class="tracking-actions" aria-label="${escapeHtml(pen.name)} tracking">
            <button class="track-button${hasPen ? " is-active" : ""}" type="button" data-track="have" data-id="${escapeHtml(pen.id)}" aria-pressed="${hasPen}">Have</button>
            <button class="track-button${wantsPen ? " is-active" : ""}" type="button" data-track="want" data-id="${escapeHtml(pen.id)}" aria-pressed="${wantsPen}">Want</button>
          </div>
        </div>
      </article>
    `;
  }

  function toggleTrackedPen(type, id) {
    if (!state.collection[type] || !id) return;

    if (state.collection[type].has(id)) {
      state.collection[type].delete(id);
    } else {
      state.collection[type].add(id);
    }

    saveCollection();
    updateTrackingButtons(id);
  }

  function updateTrackingButtons(id) {
    elements.gallery.querySelectorAll(`[data-id="${cssEscape(id)}"]`).forEach(function (button) {
      const type = button.dataset.track;
      const isActive = state.collection[type].has(id);
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function loadCollection() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      state.collection.have = new Set(Array.isArray(saved.have) ? saved.have : []);
      state.collection.want = new Set(Array.isArray(saved.want) ? saved.want : []);
    } catch {
      state.collection.have = new Set();
      state.collection.want = new Set();
    }
  }

  function saveCollection() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      have: Array.from(state.collection.have),
      want: Array.from(state.collection.want),
    }));
  }

  function updateResultCount() {
    const count = state.displayedPens.length;
    const label = count === 1 ? "retired pen" : "retired pens";
    elements.resultCount.textContent = `${count.toLocaleString()} ${label}`;
  }

  function updatePaginationControls() {
    elements.pageInfo.innerHTML = "";

    const maxVisible = window.innerWidth < 500 ? 3 : window.innerWidth < 800 ? 4 : 5;
    let startPage = Math.max(1, state.currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(state.totalPages, startPage + maxVisible - 1);

    if (endPage - startPage + 1 < maxVisible) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
      addPageButton(1);
      if (startPage > 2) addPageButton(startPage - 1, "...");
    }

    for (let page = startPage; page <= endPage; page += 1) {
      addPageButton(page);
    }

    if (endPage < state.totalPages) {
      if (endPage < state.totalPages - 1) addPageButton(endPage + 1, "...");
      addPageButton(state.totalPages);
    }

    elements.prev.disabled = state.currentPage === 1;
    elements.next.disabled = state.currentPage >= state.totalPages;
  }

  function addPageButton(pageNumber, text) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text || pageNumber;
    button.className = "page-link";

    if (pageNumber === state.currentPage) {
      button.classList.add("current-page");
      button.setAttribute("aria-current", "page");
    } else {
      button.addEventListener("click", function () {
        displayPage(pageNumber);
      });
    }

    elements.pageInfo.appendChild(button);
  }

  function downloadCSV() {
    const formattedDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).replace(/,|\//g, "").replace(/ /g, "-");

    const rows = [["Pen Name", "Release Date"]].concat(state.allPens.map(function (pen) {
      return [pen.name, pen.formattedDate];
    }));
    const csv = rows.map(function (row) {
      return row.map(csvEscape).join(",");
    }).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");

    link.href = URL.createObjectURL(blob);
    link.download = `PenGems Hall of Fame (${formattedDate}).csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  function toggleMobileMenu() {
    const isOpen = elements.mobileMenu.classList.toggle("is-open");
    elements.menuToggle.setAttribute("aria-expanded", String(isOpen));
  }

  function openFilters() {
    elements.filters.classList.add("is-open");
    elements.overlay.hidden = false;
    document.body.classList.add("filters-open");
    elements.filterToggle.setAttribute("aria-expanded", "true");
  }

  function closeFilters() {
    elements.filters.classList.remove("is-open");
    elements.filterToggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("filters-open");
    if (elements.lightbox.hidden) elements.overlay.hidden = true;
  }

  function openLightbox(src, name) {
    elements.lightboxImg.src = src;
    elements.lightboxImg.alt = `${name} Pen`;
    elements.lightbox.hidden = false;
    elements.overlay.hidden = false;
  }

  function closeLightbox() {
    elements.lightbox.hidden = true;
    elements.lightboxImg.src = "";
    if (!elements.filters.classList.contains("is-open")) elements.overlay.hidden = true;
  }

  function setCopyright() {
    elements.copyright.textContent = `© ${new Date().getFullYear()} PenGems Hall of Fame Archive. All rights reserved.`;
  }

  function parseDate(value) {
    if (!value) return null;
    const googleDate = String(value).match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})\)$/);

    if (googleDate) {
      return new Date(Number(googleDate[1]), Number(googleDate[2]), Number(googleDate[3]));
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(date) {
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });
  }

  function cleanText(value) {
    return value ? String(value).trim() : "";
  }

  function cleanImage(value) {
    return cleanText(value).split(",")[0].trim();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      }[character];
    });
  }

  function csvEscape(value) {
    const text = String(value || "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }

    return String(value).replace(/"/g, '\\"');
  }
})();
