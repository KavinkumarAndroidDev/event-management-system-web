import { state } from '../../shared/state.js';
import { showLoading, hideLoading } from '../../shared/utils.js';

export function initializeEvents() {
    const events = state.events;

    // Show loading for main grid if it exists
    const eventsGrid = document.getElementById('events-grid');
    if (eventsGrid) {
        if (!events || events.length === 0) {
            showLoading('events-grid', 'Fetching the latest events...');
        } else {
            hideLoading('events-grid');
        }
    }

    // Homepage: Featured Events
    const featuredContainer = document.getElementById('featured-events');
    if (featuredContainer && events) {
        const featured = events.filter(e => e.status.isFeatured).slice(0, 5);
        featuredContainer.innerHTML = '';
        featured.forEach(e => {
            featuredContainer.appendChild(createEventCard(e));
        });
    }

    // Top Organizers (Homepage)
    const organizersGrid = document.getElementById('top-organizers-grid');
    if (organizersGrid && events) {
        // Extract unique organizers from events and sort by rating
        const uniqueOrganizersMap = new Map();
        events.forEach(e => {
            if (e.organizer && !uniqueOrganizersMap.has(e.organizer.id)) {
                uniqueOrganizersMap.set(e.organizer.id, e.organizer);
            }
        });
        const topOrganizers = Array.from(uniqueOrganizersMap.values())
            .sort((a, b) => b.rating - a.rating)
            .slice(0, 3);

        organizersGrid.innerHTML = '';
        topOrganizers.forEach(org => {
            const col = document.createElement('div');
            col.className = 'col';
            col.innerHTML = `
                <div class="card card-custom border-0 shadow-sm p-4 h-100 text-center rounded-4 d-flex flex-column align-items-center">
                    <div class="org-avatar bg-primary bg-opacity-10 text-primary rounded-circle d-flex align-items-center justify-content-center fw-bold mb-3 flex-shrink-0" style="width: 72px; height: 72px; font-size: 2rem;"></div>
                    <div class="mt-auto w-100">
                        <div class="org-name fw-bold text-neutral-900 fs-5 mb-1"></div>
                        <div class="d-flex align-items-center justify-content-center gap-2 mb-3">
                            <span class="badge bg-primary bg-opacity-10 text-primary rounded-pill px-2 py-1 fw-medium d-flex align-items-center gap-1" style="font-size: 0.75rem;">
                                <i data-lucide="check-circle" width="12"></i> Verified
                            </span>
                            <span class="d-flex align-items-center text-warning fw-semibold bg-warning bg-opacity-10 px-2 py-1 rounded-pill" style="font-size: 0.75rem;">
                                <i data-lucide="star" class="fill-warning me-1" width="12"></i> <span class="org-rating"></span>
                            </span>
                        </div>
                        <a href="#" class="org-contact btn btn-outline-primary rounded-pill w-100 btn-sm">Contact Organizer</a>
                    </div>
                </div>
            `;
            col.querySelector('.org-avatar').textContent = org.name.charAt(0);
            col.querySelector('.org-name').textContent = org.name;
            col.querySelector('.org-rating').textContent = org.rating;
            col.querySelector('.org-contact').href = `mailto:${org.contactEmail}`;
            organizersGrid.appendChild(col);
        });

        if (window.lucide) {
            if (window.initIcons) window.initIcons({ root: organizersGrid });
        }
    }

    // Events Page: All Events
    if (eventsGrid && events) {
        setupPagination(events);
    }
}


export function createEventCard(event) {
    const minPrice = Math.min(...event.tickets.map(t => t.price));
    const date = new Date(event.schedule.startDateTime);
    const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    const path = window.location.pathname;
    let link = 'pages/events/details.html?id=' + event.id;

    if (path.includes('/pages/events/')) {
        link = 'details.html?id=' + event.id;
    } else if (path.includes('/pages/')) {
        link = '../events/details.html?id=' + event.id;
    }

    const col = document.createElement('div');
    col.className = 'col';
    col.innerHTML = `
        <div class="card border-0 shadow-sm h-100 event-card" style="border-radius:16px; overflow:hidden;">
            <img src="" class="card-img-top ec-img" style="height:200px; object-fit:cover;" alt="Event Image">
            <div class="card-body p-3 d-flex flex-column">
                <div class="ec-datetime text-primary fw-semibold small mb-2"></div>
                <h6 class="ec-title fw-semibold text-neutral-900 mb-2" style="line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;"></h6>
                <p class="ec-location text-neutral-400 small text-truncate mb-2"></p>
                <div class="ec-price fw-semibold text-neutral-900 small mt-auto"></div>
            </div>
            <a href="" class="stretched-link ec-link"></a>
        </div>
    `;

    col.querySelector('.ec-img').src = event.media.thumbnail;
    col.querySelector('.ec-img').alt = event.title;
    col.querySelector('.ec-datetime').textContent = `${dateStr} • ${timeStr}`;
    col.querySelector('.ec-title').textContent = event.title;
    col.querySelector('.ec-location').textContent = `${event.venue.name}, ${event.venue.address.city}`;
    col.querySelector('.ec-price').textContent = minPrice === 0 ? 'Free' : '₹' + minPrice + ' onwards';
    col.querySelector('.ec-link').href = link;

    return col;
}


function setupPagination(events) {
    const itemsPerPage = 9;
    let currentPage = 1;
    let paginationContainer = document.getElementById('pagination-controls');

    if (!paginationContainer) return;

    const newContainer = paginationContainer.cloneNode(false);
    paginationContainer.parentNode.replaceChild(newContainer, paginationContainer);
    paginationContainer = newContainer;

    const renderPage = (page) => {
        const start = (page - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const pageEvents = events.slice(start, end);

        renderPaginatedEvents(pageEvents);
        renderControls(page);
    };

    function renderPaginatedEvents(pageEvents) {
        const eventsGrid = document.getElementById('events-grid');
        if (eventsGrid) {
            eventsGrid.innerHTML = '';
            pageEvents.forEach(e => {
                eventsGrid.appendChild(createEventCard(e));
            });
            if (window.initIcons) window.initIcons({ root: eventsGrid });
        }
    }

    const renderControls = (page) => {
        const totalPages = Math.ceil(events.length / itemsPerPage);
        let html = '';
        html += `<button class="pagination-btn" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}><i data-lucide="chevron-left" width="16" height="16"></i></button>`;
        for (let i = 1; i <= totalPages; i++) {
            html += `<button class="pagination-btn ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }
        html += `<button class="pagination-btn" data-page="${page + 1}" ${page === totalPages ? 'disabled' : ''}><i data-lucide="chevron-right" width="16" height="16"></i></button>`;
        paginationContainer.innerHTML = html;
        if (window.initIcons) window.initIcons();
    };

    paginationContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.pagination-btn');
        if (btn && !btn.disabled && !btn.classList.contains('active')) {
            const newPage = parseInt(btn.dataset.page);
            if (newPage && newPage !== currentPage) {
                currentPage = newPage;
                renderPage(currentPage);
                document.getElementById('events-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    });

    renderPage(1);
}

export function setupGlobalInteractions() {
    // Search Inputs
    document.querySelectorAll('input[type="search"]').forEach(input => {
        input.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            if (document.getElementById('events-grid')) {
                filterEvents(query);
            }
        });
    });

    // Clear Filters Logic
    const clearFilters = (e) => {
        e.preventDefault();
        // Uncheck all checkboxes
        document.querySelectorAll('.filter-sidebar input[type="checkbox"]').forEach(box => {
            box.checked = false;
        });
        // Clear Search
        const searchInput = document.querySelector('input[type="search"]');
        if (searchInput) searchInput.value = '';

        // Reset Pills
        document.querySelectorAll('.filter-pill').forEach(pill => pill.classList.remove('active'));
        const todayPill = document.querySelector('.filter-pill');
        if (todayPill) todayPill.classList.add('active');

        const bsCollapseElements = document.querySelectorAll('.collapse.show');
        bsCollapseElements.forEach(el => {
            const toggle = document.querySelector(`[data-bs-target="#${el.id}"]`);
            if (toggle) toggle.classList.add('collapsed');
        });

        if (document.getElementById('events-grid')) filterEvents();
    };

    const clearDesktop = document.getElementById('clear-filters-desktop');
    if (clearDesktop) clearDesktop.addEventListener('click', clearFilters);

    const clearMobile = document.getElementById('clear-filters-mobile');
    if (clearMobile) clearMobile.addEventListener('click', clearFilters);

    // Pre-select category from URL if present
    const urlParams = new URLSearchParams(window.location.search);
    const categoryParam = urlParams.get('category');
    if (categoryParam) {
        document.querySelectorAll('#collapseCategories input[type="checkbox"]').forEach(box => {
            if (box.nextElementSibling.textContent.trim().toLowerCase() === categoryParam.toLowerCase()) {
                box.checked = true;
                const bsCollapseEl = document.getElementById('collapseCategories');
                if (bsCollapseEl) {
                    bsCollapseEl.classList.add('show');
                    const toggle = document.querySelector('[data-bs-target="#collapseCategories"]');
                    if (toggle) toggle.classList.remove('collapsed');
                }
            }
        });
        if (document.getElementById('events-grid')) filterEvents();
    }

    // Filter Pills (Visual Toggle)
    document.querySelectorAll('.filter-pill').forEach(pill => {
        pill.addEventListener('click', function () {
            const group = this.closest('.d-flex');
            if (group) {
                group.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
                this.classList.add('active');
            }
            if (document.getElementById('events-grid')) filterEvents();
        });
    });

    // Sidebar Checkboxes
    document.querySelectorAll('.filter-sidebar input[type="checkbox"]').forEach(box => {
        box.addEventListener('change', () => {
            if (document.getElementById('events-grid')) filterEvents();
        });
    });
}

function filterEvents(query) {
    if (!state.events) return;

    let filtered = state.events;

    // 1. Search Query
    if (typeof query !== 'string') {
        const searchInput = document.querySelector('input[type="search"]');
        query = searchInput ? searchInput.value.toLowerCase() : '';
    }

    if (query) {
        filtered = filtered.filter(e =>
            e.title.toLowerCase().includes(query) ||
            e.venue.address.city.toLowerCase().includes(query) ||
            (e.category && e.category.name.toLowerCase().includes(query))
        );
    }

    // 2. City Filters
    const cityCheckboxes = document.querySelectorAll('#collapseCity input[type="checkbox"]');
    if (cityCheckboxes.length > 0) {
        const selectedCities = Array.from(cityCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.nextElementSibling.textContent.trim().toLowerCase());

        if (selectedCities.length > 0) {
            filtered = filtered.filter(e => selectedCities.includes(e.venue.address.city.toLowerCase()));
        }
    }

    // 3. Category Filters
    const categoryCheckboxes = document.querySelectorAll('#collapseCategories input[type="checkbox"]');
    if (categoryCheckboxes.length > 0) {
        const selectedCategories = Array.from(categoryCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.nextElementSibling.textContent.trim().toLowerCase());

        if (selectedCategories.length > 0) {
            filtered = filtered.filter(e => e.category && selectedCategories.includes(e.category.name.toLowerCase()));
        }
    }

    if (filtered.length === 0) {
        const grid = document.getElementById('events-grid');
        grid.innerHTML = `
            <div class="col-12 text-center py-5">
                <div class="text-neutral-400 mb-3">
                    <i data-lucide="search-x" width="48" height="48"></i>
                </div>
                <h5 class="text-neutral-600">No events found matching your filters</h5>
                <p class="text-neutral-400 small">Try clearing some filters to see more events.</p>
                <button class="btn btn-outline-primary rounded-pill btn-sm mt-3" onclick="document.getElementById('clear-filters-desktop').click()">Clear All Filters</button>
            </div>
        `;
        if (window.initIcons) window.initIcons({ root: grid });
    } else {
        setupPagination(filtered);
    }

    // Update dynamic heading if it exists
    const heading = document.getElementById('events-title-heading');
    if (heading) {
        const checkedCities = Array.from(cityCheckboxes).filter(cb => cb.checked);
        if (checkedCities.length === 1) {
            heading.textContent = `Events in ${checkedCities[0].nextElementSibling.textContent}`;
        } else if (checkedCities.length > 1) {
            heading.textContent = 'Events in Multiple Cities';
        } else {
            heading.textContent = 'All Events';
        }
    }
}

