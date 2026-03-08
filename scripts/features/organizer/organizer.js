import { state } from '../../shared/state.js';
import { showToast, populateSidebarUserInfo } from '../../shared/utils.js';

// ─── Shared Helpers ───────────────────────────────────────────────────────────

function getCurrentUser() {
    const str = localStorage.getItem('currentUser');
    return str ? JSON.parse(str) : null;
}

function formatCurrency(amount) {
    return '₹' + Number(amount).toLocaleString('en-IN');
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

function getOrganizerEvents(user) {
    return state.events.filter(e => e.organizer && e.organizer.id === user.id);
}

function getEventRegistrations(events) {
    const eventIds = new Set(events.map(e => e.id));
    return state.registrations.filter(r => eventIds.has(r.eventId));
}

function getTicketsSoldForEvent(event) {
    return event.tickets.reduce((sum, t) => sum + (t.totalQuantity - t.availableQuantity), 0);
}

function getRevenueFromRegistrations(registrations) {
    return registrations
        .filter(r => r.status === 'CONFIRMED')
        .reduce((sum, r) => sum + (r.price * r.quantity), 0);
}

function downloadCSV(rows, filename) {
    const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function getStatusBadge(status) {
    if (status === 'PUBLISHED') return '<span class="badge rounded-pill bg-success text-white px-3 py-2 fw-bold" style="font-size:11px;">Published</span>';
    if (status === 'PENDING') return '<span class="badge rounded-pill px-3 py-2 fw-bold" style="font-size:11px;background:#FEF9C3;color:#854D0E;">Pending</span>';
    return '<span class="badge rounded-pill px-3 py-2 fw-bold" style="font-size:11px;background:#F1F5F9;color:#475569;">Draft</span>';
}

function setupPagination(items, itemsPerPage, containerId, renderFn) {
    let currentPage = 1;
    let paginationContainer = document.getElementById(containerId);

    if (!paginationContainer) return;

    // Reset container with a clone to remove old listeners
    const newContainer = paginationContainer.cloneNode(false);
    paginationContainer.parentNode.replaceChild(newContainer, paginationContainer);
    paginationContainer = newContainer;

    const renderPage = (page) => {
        const start = (page - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const pageItems = items.slice(start, end);

        renderFn(pageItems);
        renderControls(page);
    };

    const renderControls = (page) => {
        const totalPages = Math.ceil(items.length / itemsPerPage);
        if (totalPages <= 1) {
            paginationContainer.innerHTML = '';
            return;
        }

        let html = '';
        html += `<button class="pagination-btn" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}><i data-lucide="chevron-left" width="16" height="16"></i></button>`;

        // Simple pagination: 1, 2, 3...
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
                html += `<button class="pagination-btn ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`;
            } else if (i === page - 3 || i === page + 3) {
                html += `<span class="px-2">...</span>`;
            }
        }

        html += `<button class="pagination-btn" data-page="${page + 1}" ${page === totalPages ? 'disabled' : ''}><i data-lucide="chevron-right" width="16" height="16"></i></button>`;
        paginationContainer.innerHTML = html;
        if (window.initIcons) window.initIcons({ root: paginationContainer });
    };

    paginationContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.pagination-btn');
        if (btn && !btn.disabled && !btn.classList.contains('active')) {
            const newPage = parseInt(btn.dataset.page);
            if (newPage && newPage !== currentPage) {
                currentPage = newPage;
                renderPage(currentPage);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    });

    renderPage(1);
}

// ─── Organizer Signup Form (existing, preserved) ──────────────────────────────

export function setupOrganizerForm() {
    const form = document.getElementById('organizerForm');
    if (!form) return;

    const orgEventsCount = document.getElementById('org-events-count');
    if (orgEventsCount) orgEventsCount.textContent = '24+';

    const orgAttendeesCount = document.getElementById('org-attendees-count');
    if (orgAttendeesCount) orgAttendeesCount.textContent = '10k+';

    const organizerSignupForm = document.getElementById('organizerSignupForm');
    if (organizerSignupForm) {
        import('../../shared/utils.js').then(m => {
            m.setupRealtimeValidation('organizerSignupForm');
        });

        organizerSignupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (organizerSignupForm.checkValidity()) {
                const btn = organizerSignupForm.querySelector('button[type="submit"]');
                const origText = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Submitting...';

                // Mocking the backend POST to /users for organizer signup
                const firstName = organizerSignupForm.querySelector('[name="firstName"]')?.value || 'New';
                const lastName = organizerSignupForm.querySelector('[name="lastName"]')?.value || 'Organizer';
                const email = organizerSignupForm.querySelector('[name="email"]')?.value || 'org@example.com';
                const phone = organizerSignupForm.querySelector('[name="phone"]')?.value || '';
                const orgName = organizerSignupForm.querySelector('[name="organizationName"]')?.value || 'Acme';

                const newUser = {
                    id: 'USR-' + Date.now(),
                    password: 'mocked-otp-user',
                    profile: {
                        fullName: `${firstName} ${lastName}`,
                        email: email,
                        phone: phone,
                        avatar: `https://ui-avatars.com/api/?name=${firstName}+${lastName}&background=random`,
                        organizationName: orgName
                    },
                    role: {
                        id: "ROLE-3",
                        name: "ORGANIZER",
                        permissions: ["CREATE_EVENT", "MANAGE_EVENTS", "VIEW_REPORTS"]
                    },
                    accountStatus: {
                        status: "PENDING",
                        joinDate: new Date().toISOString().split('T')[0]
                    }
                };

                fetch('http://localhost:3000/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newUser)
                }).then(() => {
                    import('../../shared/utils.js').then(m => {
                        m.showToast('Application Submitted', 'Your application is under review. We will notify you once approved.', 'success');
                        document.getElementById('formContainer')?.classList.add('d-none');
                        document.getElementById('successState')?.classList.remove('d-none');
                    });
                }).finally(() => {
                    btn.disabled = false;
                    btn.innerHTML = origText;
                    organizerSignupForm.reset();
                });
            }
        });
    }

    const step1 = document.getElementById('step1');
    if (step1) {
        const passwordInputs = step1.querySelectorAll('input[type="password"]');
        if (passwordInputs.length >= 2) {
            const password = passwordInputs[0];
            const confirm = passwordInputs[1];
            const validateMatch = () => {
                if (confirm.value && password.value !== confirm.value) {
                    confirm.setCustomValidity("Passwords do not match");
                } else {
                    confirm.setCustomValidity("");
                }
            };
            password.addEventListener('input', validateMatch);
            confirm.addEventListener('input', validateMatch);
        }
    }

    const showStep = (step) => {
        document.getElementById('step1').classList.add('d-none');
        document.getElementById('step2').classList.add('d-none');
        document.getElementById('step3').classList.add('d-none');
        document.getElementById('step' + step).classList.remove('d-none');

        const progress = document.getElementById('stepperProgress');
        const ind1 = document.getElementById('stepIndicator1');
        const ind2 = document.getElementById('stepIndicator2');
        const ind3 = document.getElementById('stepIndicator3');
        const subtext = document.getElementById('stepSubtext');

        [ind1, ind2, ind3].forEach(el => el.classList.remove('active', 'completed'));

        if (step === 1) {
            progress.style.width = '0%';
            ind1.classList.add('active');
            subtext.innerText = 'Apply to host and manage events on SyncEvent.';
        } else if (step === 2) {
            progress.style.width = '50%';
            ind1.classList.add('completed');
            ind2.classList.add('active');
            subtext.innerText = 'Tell us about your organization';
        } else if (step === 3) {
            progress.style.width = '100%';
            ind1.classList.add('completed');
            ind2.classList.add('completed');
            ind3.classList.add('active');
            subtext.innerText = 'Help us verify your organization';
        }
    };

    const validateStep = (stepId) => {
        const stepEl = document.getElementById(stepId);
        const inputs = stepEl.querySelectorAll('input, select, textarea');
        let valid = true;
        inputs.forEach(input => {
            if (!input.checkValidity()) {
                input.classList.add('is-invalid');
                valid = false;
            } else {
                input.classList.remove('is-invalid');
            }
            input.addEventListener('input', () => input.classList.remove('is-invalid'));
            input.addEventListener('change', () => input.classList.remove('is-invalid'));
        });
        return valid;
    };

    const btnNext1 = document.getElementById('orgBtnNext1');
    const btnNext2 = document.getElementById('orgBtnNext2');
    const btnBack1 = document.getElementById('orgBtnBack1');
    const btnBack2 = document.getElementById('orgBtnBack2');

    if (btnNext1) btnNext1.addEventListener('click', () => validateStep('step1') ? showStep(2) : showToast('Almost there!', 'Please fill out all the required fields to continue.', 'warning'));
    if (btnNext2) btnNext2.addEventListener('click', () => validateStep('step2') ? showStep(3) : showToast('Missing details', 'Please complete everything in this section before moving on.', 'warning'));
    if (btnBack1) btnBack1.addEventListener('click', () => showStep(1));
    if (btnBack2) btnBack2.addEventListener('click', () => showStep(2));

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (validateStep('step3')) {
            const confirmCheckbox = document.getElementById('confirmDetails');
            if (!confirmCheckbox.checked) {
                showToast('Just one more thing', 'Please confirm that the details provided are accurate.', 'warning');
                return;
            }
            document.getElementById('formContainer').classList.add('d-none');
            document.getElementById('successState').classList.remove('d-none');
            showToast('Success', 'Application submitted safely!', 'success');
        } else {
            showToast('Missing documents', 'Please attach your verification documents to proceed.', 'danger');
        }
    });
}

export function setupFileUploads() {
    document.querySelectorAll('.upload-box').forEach(box => {
        const wrapper = box.closest('.position-relative');
        if (!wrapper) return;

        const input = wrapper.querySelector('input[type="file"]');
        if (!input) return;

        const originalContent = box.innerHTML;

        input.addEventListener('change', () => {
            const file = input.files[0];
            if (file) {
                box.classList.add('border-success', 'bg-success-subtle');
                input.classList.remove('is-invalid');

                box.innerHTML = `
                    <div class="d-flex flex-column align-items-center justify-content-center position-relative" style="z-index: 10;">
                        <i data-lucide="file-check" class="text-success mb-2" width="32" height="32"></i>
                        <p class="upload-filename fw-medium text-neutral-900 mb-1 text-break text-center" style="max-width: 200px; font-size: 0.9rem;"></p>
                        <p class="upload-filesize small text-neutral-500 mb-3"></p>
                        <div class="d-flex gap-2">
                            <button type="button" class="btn btn-sm btn-outline-danger btn-remove-file">Remove</button>
                            <button type="button" class="btn btn-sm btn-outline-primary btn-change-file">Change</button>
                        </div>
                    </div>
                `;

                box.querySelector('.upload-filename').textContent = file.name;
                box.querySelector('.upload-filesize').textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;

                if (window.initIcons) window.initIcons({ root: box });

                box.querySelector('.btn-remove-file').addEventListener('click', (e) => {
                    e.preventDefault();
                    input.value = '';
                    box.innerHTML = originalContent;
                    box.classList.remove('border-success', 'bg-success-subtle');
                    if (window.initIcons) window.initIcons({ root: box });
                });

                box.querySelector('.btn-change-file').addEventListener('click', () => input.click());
            }
        });
    });
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function initOrganizerDashboard() {
    const user = getCurrentUser();
    if (!user) return;

    populateSidebarUserInfo();

    const myEvents = getOrganizerEvents(user);
    const myRegs = getEventRegistrations(myEvents);

    // Calculate stats
    const totalEvents = myEvents.length;
    const ticketsSold = myEvents.reduce((sum, e) => sum + getTicketsSoldForEvent(e), 0);
    const revenue = getRevenueFromRegistrations(myRegs);
    const pendingApprovals = myEvents.filter(e => e.status.current === 'PENDING').length;

    // Update stat cards - target the h2 elements in each stat card
    const statCards = document.querySelectorAll('.col-sm-6.col-xl-3 .h2');
    if (statCards[0]) statCards[0].textContent = totalEvents;
    if (statCards[1]) statCards[1].textContent = ticketsSold.toLocaleString('en-IN');
    if (statCards[2]) statCards[2].textContent = formatCurrency(revenue);
    if (statCards[3]) statCards[3].textContent = pendingApprovals;

    // Recent Events Table
    const tbody = document.querySelector('.table tbody');
    if (tbody) {
        const recent = [...myEvents]
            .sort((a, b) => new Date(b.schedule.startDateTime) - new Date(a.schedule.startDateTime))
            .slice(0, 5);

        tbody.innerHTML = recent.map(evt => {
            const sold = getTicketsSoldForEvent(evt);
            const capacity = evt.venue.capacity;
            return `
                <tr>
                    <td class="ps-4 fw-bold text-neutral-900">${evt.title}</td>
                    <td class="text-neutral-400 small">${formatDate(evt.schedule.startDateTime)}</td>
                    <td>${getStatusBadge(evt.status.current)}</td>
                    <td class="text-neutral-900 small">${sold} / ${capacity}</td>
                    <td class="pe-4 text-end">
                        <div class="dropdown">
                            <button class="btn btn-sm btn-icon border p-2 rounded-3 text-neutral-900 shadow-none" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                                <i data-lucide="more-vertical" style="width:16px;height:16px;"></i>
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0 py-2" style="font-size: 13px; min-width: 140px;">
                                <li><a class="dropdown-item d-flex align-items-center gap-2" href="../events/details.html?id=${evt.id}"><i data-lucide="eye" width="14"></i> View Details</a></li>
                                <li><a class="dropdown-item d-flex align-items-center gap-2 text-danger" href="#" onclick="this.closest('tr').remove()"><i data-lucide="trash-2" width="14"></i> Delete</a></li>
                            </ul>
                        </div>
                    </td>
                </tr>`;
        }).join('');
        if (window.initIcons) window.initIcons({ root: tbody });
    }

    // Recent Notifications panel
    const notifPanel = document.querySelector('.col-lg-5 .p-4.flex-1');
    if (notifPanel) {
        const recentRegs = [...myRegs]
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 3);

        if (recentRegs.length > 0) {
            notifPanel.innerHTML = recentRegs.map(r => `
                <div class="mb-4">
                    <div class="fw-bold text-neutral-900 small">New registration for ${r.eventName}</div>
                    <div class="text-neutral-400" style="font-size: 11px;">${timeAgo(r.date)}</div>
                </div>`).join('');
        }
    }

    // Revenue snapshot stats
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const monthRevenue = myRegs
        .filter(r => r.status === 'CONFIRMED' && new Date(r.date) >= startOfMonth)
        .reduce((sum, r) => sum + r.price * r.quantity, 0);
    const todayRevenue = myRegs
        .filter(r => r.status === 'CONFIRMED' && new Date(r.date) >= startOfDay)
        .reduce((sum, r) => sum + r.price * r.quantity, 0);

    const revCols = document.querySelectorAll('.row.g-3.mb-4 .col-6');
    if (revCols[0]) {
        const h3 = revCols[0].querySelector('.h3');
        if (h3) h3.textContent = formatCurrency(monthRevenue);
    }
    if (revCols[1]) {
        const h3 = revCols[1].querySelector('.h3');
        if (h3) h3.textContent = formatCurrency(todayRevenue);
    }

    if (window.initIcons) window.initIcons();
}

// ─── My Events ────────────────────────────────────────────────────────────────

export function initMyEvents() {
    const user = getCurrentUser();
    if (!user) return;

    populateSidebarUserInfo();

    // Check if organizer is approved
    if (user.accountStatus && user.accountStatus.status === 'PENDING') {
        const mainContent = document.querySelector('.col-lg-9');
        if (mainContent) {
            mainContent.innerHTML = `
                <div class="card-custom p-5 text-center">
                    <div class="icon-circle bg-warning bg-opacity-10 text-warning mx-auto mb-4" style="width: 80px; height: 80px;">
                        <i data-lucide="clock" width="40" height="40"></i>
                    </div>
                    <h3 class="fw-bold text-neutral-900 mb-2">Account Under Review</h3>
                    <p class="text-neutral-500 mb-4">Your organizer account is currently pending administrator approval. <br> You will be able to create and manage events once your account is verified.</p>
                    <div class="d-flex justify-content-center gap-3">
                        <a href="../profile/index.html" class="btn btn-primary rounded-pill px-4 fw-medium">View Profile</a>
                        <button class="btn btn-outline-neutral-900 rounded-pill px-4 fw-medium" onclick="location.reload()">Check Status</button>
                    </div>
                </div>
            `;
            if (window.initIcons) window.initIcons({ root: mainContent });
        }
        return;
    }

    const myEvents = getOrganizerEvents(user);
    const myRegs = getEventRegistrations(myEvents);

    // Stats row
    const published = myEvents.filter(e => e.status.current === 'PUBLISHED').length;
    const drafts = myEvents.filter(e => e.status.current === 'DRAFT').length;
    const revenue = getRevenueFromRegistrations(myRegs);

    const statNums = document.querySelectorAll('.row.g-4.mb-4 .h3');
    if (statNums[0]) statNums[0].textContent = myEvents.length;
    if (statNums[1]) statNums[1].textContent = published;
    if (statNums[2]) statNums[2].textContent = drafts;
    if (statNums[3]) statNums[3].textContent = formatCurrency(revenue);

    // Events grid – the last .row.g-4 in main content
    const allRows = document.querySelectorAll('.col-lg-9 .row.g-4');
    const eventsGrid = allRows[allRows.length - 1];
    if (!eventsGrid) return;

    const renderEvents = (events) => {
        if (events.length === 0) {
            eventsGrid.innerHTML = `<div class="col-12 text-center py-5 text-neutral-400">
                <p class="mb-0">No events found.</p>
            </div>`;
            return;
        }

        eventsGrid.innerHTML = events.map(evt => {
            const sold = getTicketsSoldForEvent(evt);
            const capacity = evt.venue.capacity;
            const pct = capacity > 0 ? Math.min(100, Math.round((sold / capacity) * 100)) : 0;
            const evtRevenue = myRegs
                .filter(r => r.eventId === evt.id && r.status === 'CONFIRMED')
                .reduce((sum, r) => sum + r.price * r.quantity, 0);
            const statusBg = evt.status.current === 'PUBLISHED' ? 'bg-success' : evt.status.current === 'PENDING' ? 'bg-warning' : 'bg-secondary';

            return `
            <div class="col-md-6 col-xl-4">
                <div class="card-custom p-0 overflow-hidden h-100">
                    <div class="position-relative">
                        <img src="${evt.media.thumbnail}" class="w-100" style="height: 180px; object-fit: cover;" alt="${evt.title}">
                        <span class="badge rounded-pill ${statusBg} px-3 py-2 fw-bold position-absolute" style="top:12px; right:12px; font-size: 11px;">${evt.status.current}</span>
                    </div>
                    <div class="p-4">
                        <h6 class="fw-bold text-neutral-900 mb-2">${evt.title}</h6>
                        <div class="d-flex align-items-center gap-2 text-neutral-400 small mb-1">
                            <i data-lucide="calendar" style="width:14px; height:14px;"></i> ${formatDate(evt.schedule.startDateTime)}
                        </div>
                        <div class="d-flex align-items-center gap-2 text-neutral-400 small mb-1">
                            <i data-lucide="map-pin" style="width:14px; height:14px;"></i> ${evt.venue.name}
                        </div>
                        <div class="d-flex align-items-center gap-2 text-neutral-400 small mb-3">
                            <i data-lucide="users" style="width:14px; height:14px;"></i> ${sold} / ${capacity} sold
                        </div>
                        <div class="progress mb-3" style="height: 6px; border-radius: 3px;">
                            <div class="progress-bar bg-primary" style="width: ${pct}%;"></div>
                        </div>
                        <div class="d-flex justify-content-between align-items-center">
                            <span class="fw-bold text-primary small">${formatCurrency(evtRevenue)}</span>
                            <div class="dropdown">
                                <button class="btn btn-sm btn-icon border p-2 rounded-3 text-neutral-900 shadow-none" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                                    <i data-lucide="more-vertical" style="width:16px;height:16px;"></i>
                                </button>
                                <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0 py-2" style="font-size: 13px; min-width: 140px;">
                                    <li><a class="dropdown-item d-flex align-items-center gap-2" href="../events/details.html?id=${evt.id}"><i data-lucide="eye" width="14"></i> View Details</a></li>
                                    <li><a class="dropdown-item d-flex align-items-center gap-2" href="#"><i data-lucide="pencil" width="14"></i> Edit Event</a></li>
                                    <li><a class="dropdown-item d-flex align-items-center gap-2" href="reports.html"><i data-lucide="bar-chart-2" width="14"></i> Sales Report</a></li>
                                    <li><hr class="dropdown-divider"></li>
                                    <li><a class="dropdown-item d-flex align-items-center gap-2 text-danger" href="#"><i data-lucide="trash-2" width="14"></i> Delete</a></li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');

        if (window.initIcons) window.initIcons({ root: eventsGrid });
    };

    setupPagination(myEvents, 6, 'pagination-controls', renderEvents);

    // Search & filter
    const filterCard = document.querySelector('.card-custom.mb-4');
    if (filterCard) {
        const searchInput = filterCard.querySelector('input[type="text"]');
        const statusSelect = filterCard.querySelector('select');

        const applyFilters = () => {
            const q = searchInput ? searchInput.value.toLowerCase() : '';
            const status = statusSelect ? statusSelect.value : '';

            const filtered = myEvents.filter(evt => {
                const matchQ = !q || evt.title.toLowerCase().includes(q) || evt.venue.name.toLowerCase().includes(q);
                const matchStatus = !status || status === 'All Events' || status === '' || evt.status.current === status.toUpperCase();
                return matchQ && matchStatus;
            });
            setupPagination(filtered, 6, 'pagination-controls', renderEvents);
        };

        if (searchInput) searchInput.addEventListener('input', applyFilters);
        if (statusSelect) statusSelect.addEventListener('change', applyFilters);
    }

    if (window.initIcons) window.initIcons();
}

// ─── Registrations ────────────────────────────────────────────────────────────

export function initRegistrations() {
    const user = getCurrentUser();
    if (!user) return;

    populateSidebarUserInfo();

    const myEvents = getOrganizerEvents(user);
    const allRegs = getEventRegistrations(myEvents);
    let filtered = [...allRegs];

    // Stats
    const confirmed = allRegs.filter(r => r.status === 'CONFIRMED').length;
    const revenue = getRevenueFromRegistrations(allRegs);

    const statNums = document.querySelectorAll('.row.g-4.mb-4 .h3');
    if (statNums[0]) statNums[0].textContent = allRegs.length.toLocaleString('en-IN');
    if (statNums[1]) statNums[1].textContent = allRegs.length.toLocaleString('en-IN');
    if (statNums[2]) statNums[2].textContent = confirmed.toLocaleString('en-IN');
    if (statNums[3]) statNums[3].textContent = formatCurrency(revenue);

    // Populate event filter dropdown
    const filterCard = document.querySelector('.card-custom.mb-4');
    let eventSelect = null;
    let searchInput = null;

    if (filterCard) {
        eventSelect = filterCard.querySelector('select');
        searchInput = filterCard.querySelector('input[type="text"]');
        const exportBtn = filterCard.querySelector('.btn-outline-primary');

        if (eventSelect) {
            eventSelect.innerHTML = '<option value="">All Events</option>' +
                myEvents.map(e => `<option value="${e.id}">${e.title}</option>`).join('');
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const rows = [['Event', 'Attendee', 'Email', 'Ticket Type', 'Qty', 'Amount', 'Status', 'Date']];
                filtered.forEach(r => {
                    const u = state.users.find(u => u.id === r.userId);
                    rows.push([
                        r.eventName,
                        u ? u.profile.fullName : r.userId,
                        u ? u.profile.email : '—',
                        r.ticketType,
                        r.quantity,
                        r.price,
                        r.status,
                        formatDate(r.date)
                    ]);
                });
                downloadCSV(rows, 'registrations.csv');
                showToast('Exported', 'Registrations exported to CSV.', 'success');
            });
        }
    }

    const renderTable = (regs) => {
        const tbody = document.querySelector('.table tbody');
        if (!tbody) return;

        if (regs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-neutral-400">No registrations found.</td></tr>';
            return;
        }

        tbody.innerHTML = regs.map(r => {
            const u = state.users.find(u => u.id === r.userId);
            const name = u ? u.profile.fullName : 'Unknown';
            const email = u ? u.profile.email : '—';
            const isPaid = r.status === 'CONFIRMED';

            return `
            <tr>
                <td class="ps-4 fw-bold text-neutral-900">${r.eventName}</td>
                <td class="fw-medium">${name}</td>
                <td class="text-neutral-400 small">${email}</td>
                <td><span class="badge rounded-pill bg-light text-neutral-900 border fw-bold" style="font-size: 10px;">${r.ticketType.toUpperCase()}</span></td>
                <td><span class="${isPaid ? 'text-success' : 'text-warning'} fw-bold small">${isPaid ? 'Paid' : r.status}</span></td>
                <td class="pe-4 text-end text-neutral-400 small">${formatDate(r.date)}</td>
            </tr>`;
        }).join('');
    };

    setupPagination(filtered, 10, 'pagination-controls', renderTable);

    const applyFilters = () => {
        const eventId = eventSelect ? eventSelect.value : '';
        const q = searchInput ? searchInput.value.toLowerCase() : '';

        const newFiltered = allRegs.filter(r => {
            const matchEvent = !eventId || r.eventId === eventId;
            const u = state.users.find(u => u.id === r.userId);
            const name = u ? u.profile.fullName.toLowerCase() : '';
            const email = u ? u.profile.email.toLowerCase() : '';
            const matchQ = !q || name.includes(q) || email.includes(q) || r.eventName.toLowerCase().includes(q);
            return matchEvent && matchQ;
        });
        filtered = newFiltered;
        setupPagination(filtered, 10, 'pagination-controls', renderTable);
    };

    if (eventSelect) eventSelect.addEventListener('change', applyFilters);
    if (searchInput) searchInput.addEventListener('input', applyFilters);

    if (window.initIcons) window.initIcons();
}

// ─── Ticket Management ────────────────────────────────────────────────────────

export function initTicketManagement() {
    const user = getCurrentUser();
    if (!user) return;

    populateSidebarUserInfo();

    const myEvents = getOrganizerEvents(user);
    if (myEvents.length === 0) return;

    const eventSelect = document.getElementById('event-selector');
    const tbody = document.getElementById('ticketList');
    const addBtn = document.getElementById('addTicketBtn');
    const saveBtn = document.querySelector('.p-4.border-top .btn-primary');

    let currentEvent = myEvents[0];

    const updateStats = () => {
        const rows = Array.from(tbody.querySelectorAll('tr'));
        const totalCapacity = rows.reduce((sum, row) => {
            const qtyInput = row.querySelector('input[type="number"]:nth-of-type(2)') || row.querySelector('td:nth-child(3)');
            const qty = qtyInput ? parseInt(qtyInput.value || qtyInput.textContent) || 0 : 0;
            return sum + qty;
        }, 0);

        const totalSold = currentEvent.tickets.reduce((sum, t) => sum + (t.totalQuantity - t.availableQuantity), 0);
        const potentialRevenue = rows.reduce((sum, row) => {
            const priceInput = row.querySelector('input[type="number"]:nth-of-type(1)') || row.querySelector('td:nth-child(2)');
            const price = priceInput ? parseFloat(priceInput.value || priceInput.textContent.replace(/[^\d.-]/g, '')) || 0 : 0;
            const qtyInput = row.querySelector('input[type="number"]:nth-of-type(2)') || row.querySelector('td:nth-child(3)');
            const qty = qtyInput ? parseInt(qtyInput.value || qtyInput.textContent) || 0 : 0;
            return sum + (price * qty);
        }, 0);

        const statsRow = document.querySelector('.row.g-4:last-of-type');
        if (statsRow) {
            const nums = statsRow.querySelectorAll('.h3');
            if (nums[0]) nums[0].textContent = totalCapacity.toLocaleString('en-IN');
            if (nums[1]) nums[1].textContent = totalSold.toLocaleString('en-IN');
            if (nums[2]) nums[2].textContent = formatCurrency(potentialRevenue);
        }
    };

    const renderTickets = (evt) => {
        if (!tbody) return;
        currentEvent = evt;

        tbody.innerHTML = evt.tickets.map(ticket => {
            const sold = ticket.totalQuantity - ticket.availableQuantity;
            const available = ticket.availableQuantity;
            const lowStock = available <= 20;

            return `
            <tr>
                <td class="ps-4">
                    <span class="fw-bold text-neutral-900">${ticket.type.replace(/_/g, ' ')}</span>
                    ${lowStock ? '<span class="badge bg-warning text-dark ms-2" style="font-size:9px;">Low Stock</span>' : ''}
                </td>
                <td class="fw-medium">${formatCurrency(ticket.price)}</td>
                <td class="text-neutral-900 fw-medium">${ticket.totalQuantity}</td>
                <td class="text-neutral-900 fw-medium">${sold}</td>
                <td class="text-neutral-900 fw-medium">${available}</td>
                <td class="pe-4 text-end">
                    <div class="dropdown">
                        <button class="btn btn-sm btn-icon border-0 p-0 text-neutral-400 shadow-none" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                            <i data-lucide="more-vertical" width="18"></i>
                        </button>
                        <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0 py-2" style="font-size: 13px; min-width: 140px;">
                            <li><a class="dropdown-item d-flex align-items-center gap-2" href="#"><i data-lucide="eye" width="14"></i> View Details</a></li>
                            <li><a class="dropdown-item d-flex align-items-center gap-2" href="#"><i data-lucide="copy" width="14"></i> Duplicate</a></li>
                            <li><hr class="dropdown-divider"></li>
                            <li><a class="dropdown-item d-flex align-items-center gap-2 text-danger" href="#" onclick="this.closest('tr').remove(); window.updateTicketStats();"><i data-lucide="trash-2" width="14"></i> Delete Type</a></li>
                        </ul>
                    </div>
                </td>
            </tr>`;
        }).join('');

        if (window.initIcons) window.initIcons({ root: tbody });
        updateStats();
    };

    if (eventSelect) {
        eventSelect.innerHTML = myEvents.map((e, i) =>
            `<option value="${e.id}" ${i === 0 ? 'selected' : ''}>${e.title}</option>`
        ).join('');

        eventSelect.addEventListener('change', () => {
            const evt = myEvents.find(e => e.id === eventSelect.value);
            if (evt) renderTickets(evt);
        });
    }

    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const currentTotal = Array.from(tbody.querySelectorAll('tr')).reduce((sum, row) => {
                const qtyInput = row.querySelector('input[type="number"]:nth-of-type(2)') || row.querySelector('td:nth-child(3)');
                return sum + (parseInt(qtyInput.value || qtyInput.textContent) || 0);
            }, 0);

            if (currentTotal >= currentEvent.venue.capacity) {
                showToast('Capacity Met', `Cannot add more tickets. Total capacity (${currentEvent.venue.capacity}) reached.`, 'warning');
                return;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="ps-4">
                    <input type="text" class="form-control form-control-sm fw-bold border-0 bg-light" placeholder="Ticket Name">
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm border-0 bg-light" placeholder="Price" min="0">
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm border-0 bg-light" placeholder="Qty" min="1" value="50">
                </td>
                <td class="text-neutral-900 fw-medium">0</td>
                <td class="text-neutral-900 fw-medium">50</td>
                <td class="pe-4 text-end">
                    <div class="dropdown">
                        <button class="btn btn-sm btn-icon border-0 p-0 text-neutral-400 shadow-none" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                            <i data-lucide="more-vertical" width="18"></i>
                        </button>
                        <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0 py-2" style="font-size: 13px; min-width: 140px;">
                            <li><a class="dropdown-item d-flex align-items-center gap-2 text-danger" href="#" onclick="this.closest('tr').remove(); window.updateTicketStats();"><i data-lucide="trash-2" width="14"></i> Delete</a></li>
                        </ul>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
            if (window.initIcons) window.initIcons({ root: tr });

            tr.querySelectorAll('input').forEach(input => {
                input.addEventListener('input', updateStats);
            });
            updateStats();
        });
    }

    window.updateTicketStats = updateStats;

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            showToast('Saved', 'Ticket changes saved successfully.', 'success');
        });
    }

    renderTickets(myEvents[0]);
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export function initReports() {
    const user = getCurrentUser();
    if (!user) return;

    populateSidebarUserInfo();

    const myEvents = getOrganizerEvents(user);
    const allRegs = getEventRegistrations(myEvents);

    // Stats
    const revenue = getRevenueFromRegistrations(allRegs);
    const ticketsSold = myEvents.reduce((sum, e) => sum + getTicketsSoldForEvent(e), 0);

    const statNums = document.querySelectorAll('.row.g-4.mb-4 .h3');
    if (statNums[0]) statNums[0].textContent = formatCurrency(revenue);
    if (statNums[1]) statNums[1].textContent = ticketsSold.toLocaleString('en-IN');
    if (statNums[2]) statNums[2].textContent = '—';
    if (statNums[3]) statNums[3].textContent = formatCurrency(revenue);

    // Event filter
    const filterCard = document.querySelector('.card-custom.mb-4');
    if (filterCard) {
        const eventSelect = filterCard.querySelector('select');
        if (eventSelect) {
            eventSelect.innerHTML = '<option value="">All Events</option>' +
                myEvents.map(e => `<option value="${e.id}">${e.title}</option>`).join('');
        }
    }

    // CSV Export buttons
    document.querySelectorAll('.btn-outline-primary').forEach(btn => {
        if (btn.closest('.card-custom') && btn.textContent.includes('CSV')) {
            btn.addEventListener('click', () => {
                const rows = [['Event', 'Ticket Type', 'Qty', 'Revenue', 'Date']];
                allRegs.filter(r => r.status === 'CONFIRMED').forEach(r => {
                    rows.push([r.eventName, r.ticketType, r.quantity, r.price * r.quantity, formatDate(r.date)]);
                });
                downloadCSV(rows, 'revenue-report.csv');
                showToast('Exported', 'CSV report downloaded.', 'success');
            });
        }
    });

    // Revenue Chart
    const revenueCtx = document.getElementById('revenueChart')?.getContext('2d');
    if (revenueCtx && typeof Chart !== 'undefined') {
        const months = {};
        allRegs.filter(r => r.status === 'CONFIRMED').forEach(r => {
            const d = new Date(r.date);
            const key = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
            months[key] = (months[key] || 0) + r.price * r.quantity;
        });

        // Ensure we have at least some labels
        const labels = Object.keys(months).length > 0 ? Object.keys(months).slice(-6) : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
        const values = labels.map(k => months[k] || 0);

        new Chart(revenueCtx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Revenue (₹)',
                    data: values,
                    borderColor: '#17B978',
                    backgroundColor: 'rgba(23,185,120,0.08)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#17B978'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#9CA3AF' } },
                    y: { grid: { color: '#F5F5F5' }, ticks: { font: { size: 11 }, color: '#9CA3AF' } }
                }
            }
        });
    }

    // Pie Chart – ticket type breakdown
    const pieCtx = document.getElementById('pieChart')?.getContext('2d');
    if (pieCtx && typeof Chart !== 'undefined') {
        const types = {};
        allRegs.filter(r => r.status === 'CONFIRMED').forEach(r => {
            types[r.ticketType] = (types[r.ticketType] || 0) + r.quantity;
        });

        const colors = ['#17B978', '#9333EA', '#22C55E', '#F59E0B', '#3B82F6', '#EF4444'];
        const typeKeys = Object.keys(types);

        if (typeKeys.length > 0) {
            new Chart(pieCtx, {
                type: 'doughnut',
                data: {
                    labels: typeKeys,
                    datasets: [{
                        data: typeKeys.map(k => types[k]),
                        backgroundColor: colors.slice(0, typeKeys.length),
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: true, position: 'bottom', labels: { font: { size: 11 }, color: '#9CA3AF', padding: 12 } }
                    }
                }
            });
        }
    }

    if (window.initIcons) window.initIcons();
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export function initOrganizerProfile() {
    const user = getCurrentUser();
    if (!user) return;

    populateSidebarUserInfo();

    // Populate the large profile avatar in main content
    const profileAvatar = document.querySelector('.mb-4.text-center .avatar-circle');
    if (profileAvatar) {
        const initials = user.profile.fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        profileAvatar.textContent = initials;
    }

    // Card 0 – Basic Information
    const allCards = document.querySelectorAll('.card-custom.mb-4.p-4');
    if (allCards[0]) {
        const inputs = allCards[0].querySelectorAll('input');
        if (inputs[0]) inputs[0].value = user.profile.fullName;
        if (inputs[1]) {
            inputs[1].value = user.profile.email;
            inputs[1].setAttribute('disabled', 'disabled');
            inputs[1].title = 'Email cannot be changed';
        }
        // Organization name – use bio or placeholder
        if (inputs[2]) inputs[2].value = user.profile.bio || '';

        const saveBtn = allCards[0].querySelector('.btn-primary');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                if (inputs[0]) user.profile.fullName = inputs[0].value;
                localStorage.setItem('currentUser', JSON.stringify(user));
                populateSidebarUserInfo();
                fetch(`http://localhost:3000/users/${user.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ profile: user.profile })
                }).catch(() => { });
                showToast('Saved', 'Profile updated successfully.', 'success');
            });
        }
    }

    // Card 1 – Public Profile
    if (allCards[1]) {
        const textarea = allCards[1].querySelector('textarea');
        if (textarea) textarea.value = user.profile.bio || '';

        const updateBtn = allCards[1].querySelector('.btn-primary');
        if (updateBtn) {
            updateBtn.addEventListener('click', () => {
                if (textarea) user.profile.bio = textarea.value;
                localStorage.setItem('currentUser', JSON.stringify(user));
                fetch(`http://localhost:3000/users/${user.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ profile: user.profile })
                }).catch(() => { });
                showToast('Updated', 'Public profile updated.', 'success');
            });
        }
    }

    // Card 2 – Security / Change Password
    if (allCards[2]) {
        const pwInputs = allCards[2].querySelectorAll('input[type="password"]');
        const changeBtn = allCards[2].querySelector('.btn-primary');

        if (changeBtn && pwInputs.length >= 3) {
            const [currentPw, newPw, confirmPw] = pwInputs;
            changeBtn.addEventListener('click', () => {
                if (!currentPw.value || !newPw.value || !confirmPw.value) {
                    showToast('Required', 'Please fill in all password fields.', 'warning');
                    return;
                }
                if (currentPw.value !== user.password) {
                    showToast('Incorrect', 'Current password is incorrect.', 'danger');
                    return;
                }
                if (newPw.value !== confirmPw.value) {
                    showToast('Mismatch', 'New passwords do not match.', 'danger');
                    return;
                }
                if (newPw.value.length < 6) {
                    showToast('Too Short', 'Password must be at least 6 characters.', 'warning');
                    return;
                }
                user.password = newPw.value;
                localStorage.setItem('currentUser', JSON.stringify(user));
                fetch(`http://localhost:3000/users/${user.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: user.password })
                }).catch(() => { });
                currentPw.value = '';
                newPw.value = '';
                confirmPw.value = '';
                showToast('Changed', 'Password changed successfully.', 'success');
            });
        }
    }

    // Avatar upload
    const avatarInput = document.getElementById('avatarInput');
    if (avatarInput) {
        avatarInput.addEventListener('change', () => {
            const file = avatarInput.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (profileAvatar) {
                    profileAvatar.style.backgroundImage = `url(${ev.target.result})`;
                    profileAvatar.style.backgroundSize = 'cover';
                    profileAvatar.style.backgroundPosition = 'center';
                    profileAvatar.textContent = '';
                }
                showToast('Updated', 'Profile photo updated.', 'success');
            };
            reader.readAsDataURL(file);
        });
    }

    if (window.initIcons) window.initIcons();
}

// ─── Notifications ────────────────────────────────────────────────────────────

export function initOrganizerNotifications() {
    const user = getCurrentUser();
    if (!user) return;

    populateSidebarUserInfo();

    const myEvents = getOrganizerEvents(user);
    const myRegs = getEventRegistrations(myEvents);

    let readSet = new Set(JSON.parse(localStorage.getItem('org-notif-read') || '[]'));
    const notifications = [];

    // Registration notifications from most recent
    [...myRegs]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 10)
        .forEach(r => {
            const nid = `reg-${r.id}`;
            notifications.push({
                id: nid,
                type: 'registration',
                icon: 'user-plus',
                iconColor: 'text-primary',
                bgColor: 'bg-primary bg-opacity-10',
                title: 'New Registration',
                message: `A new registration was made for <strong class="text-neutral-900">${r.eventName}</strong>`,
                time: r.date,
                read: readSet.has(nid)
            });
        });

    // Low inventory warnings
    myEvents.forEach(evt => {
        evt.tickets.forEach(ticket => {
            if (ticket.availableQuantity <= 20 && ticket.availableQuantity > 0) {
                const nid = `inv-${evt.id}-${ticket.id}`;
                notifications.push({
                    id: nid,
                    type: 'warning',
                    icon: 'alert-triangle',
                    iconColor: 'text-warning',
                    bgColor: 'bg-warning bg-opacity-10',
                    title: 'Low Ticket Inventory',
                    message: `Only <strong class="text-neutral-900">${ticket.availableQuantity} ${ticket.type.replace(/_/g, ' ')}</strong> tickets remaining for ${evt.title}`,
                    time: new Date().toISOString(),
                    read: readSet.has(nid)
                });
            }
        });
    });

    // Sort: unread first, then newest
    notifications.sort((a, b) => {
        if (a.read !== b.read) return a.read ? 1 : -1;
        return new Date(b.time) - new Date(a.time);
    });

    let currentFilter = 'all';

    const getContainer = () => document.querySelector('.list-group.list-group-flush');

    const renderNotifications = (filter) => {
        const container = getContainer();
        if (!container) return;

        const toShow = filter === 'unread' ? notifications.filter(n => !n.read) : notifications;

        if (toShow.length === 0) {
            container.innerHTML = '<div class="list-group-item px-4 py-5 text-center text-neutral-400">No notifications to display.</div>';
            return;
        }

        container.innerHTML = toShow.map(n => `
            <div class="list-group-item px-4 py-3 ${n.read ? 'opacity-75' : 'bg-light bg-opacity-10'} d-flex align-items-start gap-3" data-id="${n.id}">
                <div class="icon-circle ${n.bgColor} ${n.iconColor} flex-shrink-0">
                    <i data-lucide="${n.icon}" style="width:18px; height:18px;"></i>
                </div>
                <div class="flex-grow-1">
                    <div class="d-flex justify-content-between align-items-start">
                        <h6 class="fw-bold text-neutral-900 mb-1" style="font-size: 14px;">${n.title}</h6>
                        <span class="text-neutral-400" style="font-size: 11px;">${timeAgo(n.time)}</span>
                    </div>
                    <p class="text-neutral-600 small mb-0">${n.message}</p>
                </div>
                ${!n.read ? `
                <div class="d-flex flex-column gap-2 align-items-end">
                    <div class="bg-primary rounded-circle" style="width:8px; height:8px;"></div>
                    <button class="btn btn-link text-neutral-400 p-0 btn-mark-read" data-id="${n.id}" title="Mark as read">
                        <i data-lucide="check" style="width:16px;height:16px;"></i>
                    </button>
                </div>` : ''}
            </div>`).join('');

        if (window.initIcons) window.initIcons({ root: container });

        container.querySelectorAll('.btn-mark-read').forEach(btn => {
            btn.addEventListener('click', () => {
                const nid = btn.dataset.id;
                readSet.add(nid);
                localStorage.setItem('org-notif-read', JSON.stringify([...readSet]));
                const notif = notifications.find(n => n.id === nid);
                if (notif) notif.read = true;
                updateTabs();
                renderNotifications(currentFilter);
            });
        });
    };

    const updateTabs = () => {
        const header = document.querySelector('.card-custom .px-4.py-3.border-bottom');
        if (!header) return;
        const allCount = notifications.length;
        const unreadCount = notifications.filter(n => !n.read).length;
        const btns = header.querySelectorAll('.btn-group button');
        if (btns[0]) btns[0].textContent = `All (${allCount})`;
        if (btns[1]) btns[1].textContent = `Unread (${unreadCount})`;
    };

    // Tab buttons
    const header = document.querySelector('.card-custom .px-4.py-3.border-bottom');
    if (header) {
        const tabBtns = header.querySelectorAll('.btn-group button');
        tabBtns.forEach((btn, i) => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilter = i === 0 ? 'all' : 'unread';
                renderNotifications(currentFilter);
            });
        });

        // Mark all as read button
        const markAllBtn = header.querySelector('.btn-link');
        if (markAllBtn) {
            markAllBtn.addEventListener('click', () => {
                notifications.forEach(n => {
                    n.read = true;
                    readSet.add(n.id);
                });
                localStorage.setItem('org-notif-read', JSON.stringify([...readSet]));
                updateTabs();
                renderNotifications(currentFilter);
                showToast('Done', 'All notifications marked as read.', 'success');
            });
        }
    }

    updateTabs();
    renderNotifications('all');

    if (window.initIcons) window.initIcons();
}

// ─── Create Event Flow ────────────────────────────────────────────────────────

export function initCreateEventWizard() {
    const user = getCurrentUser();
    if (!user) return;

    populateSidebarUserInfo();

    let currentStep = 1;
    const eventData = {
        id: `evt-${Date.now()}`,
        organizerId: user.id,
        status: { current: 'DRAFT', history: [] },
        tickets: [],
        media: { thumbnail: '../../assets/about_the_eif.jpg', gallery: [] }
    };

    const updateStepper = (step) => {
        for (let i = 1; i <= 4; i++) {
            const circle = document.getElementById(`sc${i}`);
            const label = document.getElementById(`sl${i}`);
            if (i < step) {
                circle.className = 'step-circle done';
                circle.innerHTML = '<i data-lucide="check" style="width:16px;height:16px;"></i>';
                label.className = 'small fw-bold text-success';
            } else if (i === step) {
                circle.className = 'step-circle active';
                circle.innerHTML = i;
                label.className = 'small fw-bold text-neutral-900';
            } else {
                circle.className = 'step-circle pending';
                circle.innerHTML = i;
                label.className = 'small text-neutral-400';
            }
        }
        if (window.initIcons) window.initIcons();
    };

    window.nextStep = (n) => {
        if (n > currentStep) {
            // Basic validation for Step 1
            if (currentStep === 1) {
                const title = document.getElementById('eventTitle').value;
                if (!title) {
                    showToast('Title Required', 'Please enter an event title.', 'warning');
                    return;
                }
            }
            // Validation for Step 2
            if (currentStep === 2) {
                const start = document.getElementById('startDate').value;
                if (!start) {
                    showToast('Date Required', 'Please enter a start date.', 'warning');
                    return;
                }
            }
        }

        document.getElementById(`step${currentStep}`).classList.add('d-none');
        document.getElementById(`step${n}`).classList.remove('d-none');
        currentStep = n;
        updateStepper(n);

        if (n === 4) populateReview();
    };

    const populateReview = () => {
        const reviewContent = document.getElementById('reviewContent');
        if (!reviewContent) return;

        const title = document.getElementById('eventTitle').value;
        const cat = document.getElementById('eventCategory').value;
        const vt = document.querySelector('input[name="venueType"]:checked').value;
        const start = document.getElementById('startDate').value;
        const venue = vt === 'PHYSICAL' ? document.getElementById('venueName').value : 'Virtual';

        reviewContent.innerHTML = `
            <div class="row g-3">
                <div class="col-md-6">
                    <div class="small text-neutral-400 mb-1">Title</div>
                    <div class="fw-bold">${title}</div>
                </div>
                <div class="col-md-6">
                    <div class="small text-neutral-400 mb-1">Category</div>
                    <div class="fw-bold">${cat}</div>
                </div>
                <div class="col-md-6">
                    <div class="small text-neutral-400 mb-1">Date & Time</div>
                    <div class="fw-bold">${new Date(start).toLocaleString('en-IN')}</div>
                </div>
                <div class="col-md-6">
                    <div class="small text-neutral-400 mb-1">Venue</div>
                    <div class="fw-bold">${venue} (${vt})</div>
                </div>
            </div>
        `;
    };

    // Venue type toggle
    const vtRadios = document.querySelectorAll('input[name="venueType"]');
    vtRadios.forEach(r => {
        r.addEventListener('change', () => {
            if (r.value === 'VIRTUAL') {
                document.getElementById('physical-details').classList.add('d-none');
                document.getElementById('virtual-details').classList.remove('d-none');
            } else {
                document.getElementById('physical-details').classList.remove('d-none');
                document.getElementById('virtual-details').classList.add('d-none');
            }
        });
    });

    // Banner preview
    const uploadArea = document.getElementById('bannerUpload');
    const bannerPrev = document.getElementById('bannerPrev');
    if (uploadArea) {
        uploadArea.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (rev) => {
                        bannerPrev.src = rev.target.result;
                        bannerPrev.classList.remove('d-none');
                        uploadArea.querySelector('i').classList.add('d-none');
                        uploadArea.querySelector('.fw-bold').classList.add('d-none');
                        eventData.media.thumbnail = rev.target.result;
                    };
                    reader.readAsDataURL(file);
                }
            };
            input.click();
        });
    }

    // Tickets
    window.addTicketRow = () => {
        const rowCont = document.getElementById('ticketRows');
        const div = document.createElement('div');
        div.className = 'p-3 border rounded-3 d-flex gap-3 align-items-center bg-white';
        div.innerHTML = `
            <div class="flex-grow-1">
                <input type="text" class="form-control form-control-sm border-0 bg-light fw-bold" placeholder="Ticket Name (e.g. VIP)">
            </div>
            <div style="width: 100px;">
                <input type="number" class="form-control form-control-sm border-0 bg-light" placeholder="Price">
            </div>
            <div style="width: 80px;">
                <input type="number" class="form-control form-control-sm border-0 bg-light" placeholder="Qty">
            </div>
            <button class="btn btn-sm text-danger p-0" onclick="this.closest('div').remove()">
                <i data-lucide="trash-2" width="16"></i>
            </button>
        `;
        rowCont.appendChild(div);
        if (window.initIcons) window.initIcons({ root: div });
    };

    // Initialize with one row
    window.addTicketRow();

    const saveEvent = (published = false) => {
        const title = document.getElementById('eventTitle').value;
        const cat = document.getElementById('eventCategory').value;
        const desc = document.getElementById('eventDesc').value;
        const vt = document.querySelector('input[name="venueType"]:checked').value;
        const start = document.getElementById('startDate').value;
        const end = document.getElementById('endDate').value;

        // Map data
        eventData.title = title;
        eventData.category = cat;
        eventData.description = desc;
        eventData.schedule = {
            startDateTime: start,
            endDateTime: end,
            timeZone: "Asia/Kolkata"
        };
        eventData.venue = {
            type: vt,
            name: vt === 'PHYSICAL' ? document.getElementById('venueName').value : 'Virtual Link',
            city: vt === 'PHYSICAL' ? document.getElementById('venueCity').value : 'Online',
            capacity: vt === 'PHYSICAL' ? parseInt(document.getElementById('venueCapacity').value) || 0 : 9999
        };
        if (vt === 'VIRTUAL') eventData.venue.url = document.getElementById('eventUrl').value;

        // Tickets
        const ticketRows = document.getElementById('ticketRows').children;
        eventData.tickets = Array.from(ticketRows).map((row, i) => {
            const inputs = row.querySelectorAll('input');
            const qty = parseInt(inputs[2].value) || 0;
            return {
                id: `t-${Date.now()}-${i}`,
                type: inputs[0].value.replace(/\s+/g, '_').toUpperCase() || 'GENERAL',
                price: parseFloat(inputs[1].value) || 0,
                totalQuantity: qty,
                availableQuantity: qty
            };
        });

        eventData.status.current = published ? 'PUBLISHED' : 'DRAFT';

        // Add to global state
        state.events.push(eventData);
        localStorage.setItem('events', JSON.stringify(state.events));

        showToast(published ? 'Published' : 'Saved', `Event ${title} has been ${published ? 'published' : 'saved as draft'}.`, 'success');

        setTimeout(() => {
            window.location.href = 'my-events.html';
        }, 1500);
    };

    const draftBtn = document.getElementById('saveDraftBtn');
    const submitBtn = document.getElementById('submitEventBtn');

    if (draftBtn) draftBtn.addEventListener('click', () => saveEvent(false));
    if (submitBtn) submitBtn.addEventListener('click', () => saveEvent(true));

    if (window.initIcons) window.initIcons();
}