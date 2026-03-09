import { state, getCategory, getVenue, getEvent, getUser } from '../../shared/state.js';
import { showToast, populateSidebarUserInfo } from '../../shared/utils.js';

// ─── Shared Helpers ───────────────────────────────────────────────────────────
const API_BASE = 'http://localhost:3000';

function normalizeLegacyEventStatus(event) {
    if (!event || !event.status || typeof event.status !== 'object') return event;
    if (event.status.current === 'ACTIVE') event.status.current = 'APPROVED';
    if (Array.isArray(event.status.history)) {
        event.status.history = event.status.history.map((s) => s === 'ACTIVE' ? 'APPROVED' : s);
    }
    return event;
}

async function apiFetch(endpoint) {
    const res = await fetch(`${API_BASE}/${endpoint}`);
    if (!res.ok) throw new Error(`Fetch failed: ${endpoint}`);
    const data = await res.json();
    if (endpoint === 'events') {
        if (Array.isArray(data)) return data.map(normalizeLegacyEventStatus);
        return normalizeLegacyEventStatus(data);
    }
    return data;
}

async function apiPost(endpoint, data) {
    const res = await fetch(`${API_BASE}/${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`Post failed: ${endpoint}`);
    return res.json();
}

async function apiPatch(endpoint, id, data) {
    const res = await fetch(`${API_BASE}/${endpoint}/${id}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`Patch failed: ${endpoint}`);
    return res.json();
}

async function apiDelete(endpoint, id) {
    const res = await fetch(`${API_BASE}/${endpoint}/${id}`, {
        method: 'DELETE'
    });
    if (!res.ok) throw new Error(`Delete failed: ${endpoint}`);
    return res.json();
}

function buildStatusPayload(event, nextStatus, extra = {}) {
    const currentStatus = event?.status?.current || 'DRAFT';
    const history = Array.isArray(event?.status?.history) ? [...event.status.history] : [currentStatus];
    if (history[history.length - 1] !== currentStatus) history.push(currentStatus);
    if (history[history.length - 1] !== nextStatus) history.push(nextStatus);

    const status = { current: nextStatus, history };
    Object.keys(extra).forEach((k) => {
        if (extra[k] !== undefined && extra[k] !== null && extra[k] !== '') {
            status[k] = extra[k];
        }
    });
    if (nextStatus !== 'REJECTED') delete status.reason;
    return status;
}

async function patchEventStatus(event, nextStatus, extra = {}) {
    const status = buildStatusPayload(event, nextStatus, extra);
    await apiPatch('events', event.id, { status });
    event.status = status;
}

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
    if (!user) return [];
    return state.events
        .filter(e => e.organizerId === user.id)
        .map(normalizeLegacyEventStatus);
}

function getEventRegistrations(events) {
    const eventIds = new Set(events.map(e => e.id));
    const eventMap = new Map(events.map(e => [e.id, e.title]));
    return state.registrations
        .filter(r => eventIds.has(r.eventId))
        .map(r => ({
            ...r,
            eventName: eventMap.get(r.eventId) || 'Unknown Event'
        }));
}

function getTicketsSoldForEvent(event) {
    return event.tickets.reduce((sum, t) => sum + (t.totalQuantity - t.availableQuantity), 0);
}

function getRevenueFromRegistrations(registrations) {
    return registrations
        .filter(r => r.status === 'CONFIRMED')
        .reduce((sum, r) => sum + (r.totalAmount || 0), 0);
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

function injectRegistrationModal() {
    if (document.getElementById('registrationDetailModal')) return;
    const modalHtml = `
    <div class="modal fade" id="registrationDetailModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered modal-lg">
            <div class="modal-content border-0 shadow-lg rounded-4">
                <div class="modal-header border-bottom border-light px-4 py-3">
                    <h5 class="modal-title fw-bold text-neutral-900">Registration Details</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body p-4" id="registration-modal-body">
                    <!-- Dynamic Content -->
                </div>
                <div class="modal-footer border-top border-light px-4 py-3">
                    <button type="button" class="btn btn-outline-neutral-900 rounded-pill px-4 fw-medium" data-bs-dismiss="modal">Close</button>
                    <button type="button" class="btn btn-primary rounded-pill px-4 fw-medium" onclick="window.print()">Print Receipt</button>
                </div>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

window.viewRegistrationDetails = (id) => {
    const reg = state.registrations.find(r => r.id === id);
    if (!reg) {
        showToast('Error', 'Registration details not found.', 'danger');
        return;
    }

    const event = getEvent(reg.eventId);
    const user = state.users.find(u => u.id === reg.userId);
    const payment = state.payments.find(p => p.registrationId === reg.id || p.id === reg.paymentId);

    const body = document.getElementById('registration-modal-body');
    if (!body) return;

    let participantsHtml = '';
    if (reg.participants && reg.participants.length > 0) {
        participantsHtml = `
            <div class="mt-4">
                <h6 class="fw-bold text-neutral-900 mb-3">Participant Details</h6>
                <div class="table-responsive">
                    <table class="table table-sm table-bordered small">
                        <thead class="bg-light">
                            <tr>
                                <th class="ps-3">Name</th>
                                <th>Email</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${reg.participants.map(p => `
                                <tr>
                                    <td class="ps-3 fw-medium">${p.name}</td>
                                    <td>${p.email}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    body.innerHTML = `
        <div class="row g-4">
            <div class="col-md-6">
                <div class="mb-4">
                    <label class="text-neutral-400 small fw-bold text-uppercase mb-1" style="font-size: 10px;">Attendee Information</label>
                    <div class="d-flex align-items-center gap-3">
                        <div class="avatar-circle bg-primary bg-opacity-10 text-primary fw-bold" style="width: 48px; height: 48px; font-size: 1.2rem;">
                            ${user ? user.profile.fullName.charAt(0) : '?'}
                        </div>
                        <div>
                            <div class="fw-bold text-neutral-900">${user ? user.profile.fullName : 'Unknown'}</div>
                            <div class="text-neutral-400 small">${user ? user.profile.email : '—'}</div>
                        </div>
                    </div>
                </div>
                <div class="mb-4">
                    <label class="text-neutral-400 small fw-bold text-uppercase mb-1" style="font-size: 10px;">Event Details</label>
                    <div class="fw-bold text-neutral-900">${event ? event.title : 'Event'}</div>
                    <div class="text-neutral-400 small">${formatDate(reg.date)}</div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card-custom bg-light border-0 p-3 mb-4">
                    <div class="d-flex justify-content-between mb-2">
                        <span class="text-neutral-500 small">Ticket Type</span>
                        <span class="badge rounded-pill bg-white text-neutral-900 border fw-bold px-3" style="font-size: 10px;">${reg.ticketType.toUpperCase()}</span>
                    </div>
                    <div class="d-flex justify-content-between mb-2">
                        <span class="text-neutral-500 small">Quantity</span>
                        <span class="fw-bold text-neutral-900">${reg.quantity}</span>
                    </div>
                    <div class="d-flex justify-content-between mb-2">
                        <span class="text-neutral-500 small">Amount Paid</span>
                        <span class="fw-bold text-primary">${formatCurrency(reg.totalAmount || reg.price)}</span>
                    </div>
                    <div class="d-flex justify-content-between pt-2 border-top border-neutral-200">
                        <span class="text-neutral-500 small">Status</span>
                        <span class="text-success fw-bold small">${reg.status}</span>
                    </div>
                </div>
                <div>
                    <label class="text-neutral-400 small fw-bold text-uppercase mb-1" style="font-size: 10px;">Transaction Info</label>
                    <div class="text-neutral-900 small fw-medium">ID: <span class="text-neutral-500">${reg.id}</span></div>
                    <div class="text-neutral-900 small fw-medium">Payment Ref: <span class="text-neutral-500">${payment ? payment.razorpayId || payment.id : 'N/A'}</span></div>
                </div>
            </div>
        </div>
        ${participantsHtml}
    `;

    const modal = new window.bootstrap.Modal(document.getElementById('registrationDetailModal'));
    modal.show();
};

function getStatusBadge(status) {
    if (status === 'PUBLISHED') return '<span class="badge rounded-pill bg-success text-white px-3 py-2 fw-bold" style="font-size:11px;">Published</span>';
    if (status === 'APPROVED') return '<span class="badge rounded-pill bg-info text-white px-3 py-2 fw-bold" style="font-size:11px;">Approved</span>';
    if (status === 'PENDING') return '<span class="badge rounded-pill px-3 py-2 fw-bold" style="font-size:11px;background:#FEF9C3;color:#854D0E;">Pending</span>';
    if (status === 'REJECTED') return '<span class="badge rounded-pill px-3 py-2 fw-bold" style="font-size:11px;background:#FEE2E2;color:#991B1B;">Rejected</span>';
    if (status === 'COMPLETED') return '<span class="badge rounded-pill bg-primary text-white px-3 py-2 fw-bold" style="font-size:11px;">Completed</span>';
    if (status === 'CANCELLED') return '<span class="badge rounded-pill bg-danger text-white px-3 py-2 fw-bold" style="font-size:11px;">Cancelled</span>';
    return `<span class="badge rounded-pill px-3 py-2 fw-bold" style="font-size:11px;background:#F1F5F9;color:#475569;">${status || 'Draft'}</span>`;
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
                        profileImage: `https://ui-avatars.com/api/?name=${firstName}+${lastName}&background=random`,
                        organizationName: orgName,
                        organizationType: organizerSignupForm.querySelector('[name="organizationType"]')?.value || 'OTHER',
                        bio: organizerSignupForm.querySelector('[name="bio"]')?.value || '',
                        gender: "UNKNOWN",
                        dateOfBirth: "",
                        website: "",
                        address: ""
                    },
                    role: {
                        id: "ROLE-3",
                        name: "ORGANIZER",
                        permissions: ["CREATE_EVENT", "MANAGE_EVENT", "VIEW_ANALYTICS", "MANAGE_TICKETS"]
                    },
                    accountStatus: {
                        status: "PENDING",
                        isEmailVerified: false,
                        isPhoneVerified: false,
                        failedLoginAttempts: 0,
                        lastLogin: new Date().toISOString(),
                        createdAt: new Date().toISOString()
                    },
                    statistics: {
                        eventsCreated: 0,
                        eventsAttended: 0,
                        totalSpent: 0,
                        averageRatingGiven: 0
                    },
                    preferences: {
                        notifications: { email: true, push: true, sms: false },
                        language: "en"
                    },
                    savedEvents: []
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
            const venue = getVenue(evt.venueId);
            const capacity = venue ? venue.capacity : 0;
            return `
                <tr>
                    <td class="ps-4 fw-medium text-neutral-900">${evt.title}</td>
                    <td class="text-neutral-400 small">${formatDate(evt.schedule.startDateTime)}</td>
                    <td>${getStatusBadge(evt.status.current)}</td>
                    <td class="text-neutral-900 small">${sold} / ${capacity}</td>
                    <td class="pe-4 text-end">
                        <div class="dropdown">
                            <button class="btn btn-sm btn-icon border p-2 rounded-3 text-neutral-900 shadow-none" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                                <span style="font-size: 1.2rem; font-weight: bold; line-height: 1;">&#8942;</span>
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
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 3);

        if (recentRegs.length > 0) {
            notifPanel.innerHTML = recentRegs.map(r => `
                <div class="mb-4">
                    <div class="fw-bold text-neutral-900 small">New registration for ${r.eventName}</div>
                    <div class="text-neutral-400" style="font-size: 11px;">${timeAgo(r.createdAt)}</div>
                </div>`).join('');
        }
    }

    // Revenue snapshot stats
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const monthRevenue = myRegs
        .filter(r => r.status === 'CONFIRMED' && new Date(r.createdAt) >= startOfMonth)
        .reduce((sum, r) => sum + (r.totalAmount || 0), 0);
    const todayRevenue = myRegs
        .filter(r => r.status === 'CONFIRMED' && new Date(r.createdAt) >= startOfDay)
        .reduce((sum, r) => sum + (r.totalAmount || 0), 0);

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
            const venue = getVenue(evt.venueId);
            const capacity = venue ? venue.capacity : 0;
            const pct = capacity > 0 ? Math.min(100, Math.round((sold / capacity) * 100)) : 0;
            const evtRevenue = myRegs
                .filter(r => r.eventId === evt.id && (r.status === 'CONFIRMED' || r.status === 'PAID'))
                .reduce((sum, r) => sum + (r.totalAmount || 0), 0);
            const statusBgMap = {
                DRAFT: 'bg-secondary',
                PENDING: 'bg-warning text-dark',
                APPROVED: 'bg-info',
                PUBLISHED: 'bg-success',
                REJECTED: 'bg-danger',
                CANCELLED: 'bg-danger',
                COMPLETED: 'bg-primary'
            };
            
            // Always render the persisted status; avoid deriving COMPLETED only in UI.
            const displayStatus = (evt.status && evt.status.current) ? evt.status.current : 'DRAFT';
            const statusBg = statusBgMap[displayStatus] || 'bg-secondary';
            const rejectionReason = displayStatus === 'REJECTED' ? (evt.status?.reason || '').trim() : '';

            return `
            <div class="col-md-6 col-xl-4">
                <div class="card-custom p-0 overflow-hidden h-100">
                    <div class="position-relative">
                        <img src="${evt.media.thumbnail}" class="w-100" style="height: 180px; object-fit: cover;" alt="${evt.title}">
                        <span class="badge rounded-pill ${statusBg} px-3 py-2 fw-bold position-absolute" style="top:12px; right:12px; font-size: 11px;">${displayStatus}</span>
                    </div>
                    <div class="p-4">
                        <h6 class="fw-bold text-neutral-900 mb-2">${evt.title}</h6>
                        <div class="d-flex align-items-center gap-2 text-neutral-400 small mb-1">
                            <i data-lucide="calendar" style="width:14px; height:14px;"></i> ${formatDate(evt.schedule.startDateTime)}
                        </div>
                        <div class="d-flex align-items-center gap-2 text-neutral-400 small mb-1">
                            <i data-lucide="map-pin" style="width:14px; height:14px;"></i> ${venue ? venue.name : 'Various'}
                        </div>
                        <div class="d-flex align-items-center gap-2 text-neutral-400 small mb-3">
                            <i data-lucide="users" style="width:14px; height:14px;"></i> ${sold} / ${capacity} sold
                        </div>
                        ${rejectionReason ? `<div class="small mb-3 px-2 py-1 rounded-2" style="background:#FEF2F2;color:#991B1B;">Rejection reason: ${rejectionReason}</div>` : ''}
                        <div class="progress mb-3" style="height: 6px; border-radius: 3px;">
                            <div class="progress-bar bg-primary" style="width: ${pct}%;"></div>
                        </div>
                        <div class="d-flex justify-content-between align-items-center">
                            <span class="fw-bold text-primary small">${formatCurrency(evtRevenue)}</span>
                            <div class="dropdown">
                                <button class="btn btn-sm btn-icon border p-2 rounded-3 text-neutral-900 shadow-none" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                                    <span style="font-size: 1.2rem; font-weight: bold; line-height: 1;">&#8942;</span>
                                </button>
                                <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0 py-2" style="font-size: 13px; min-width: 140px;">
                                    <li><a class="dropdown-item d-flex align-items-center gap-2" href="../events/details.html?id=${evt.id}"><i data-lucide="eye" width="14"></i> View Details</a></li>
                                    ${displayStatus === 'DRAFT' ? `
                                        <li><button class="dropdown-item d-flex align-items-center gap-2 btn-submit-review" data-id="${evt.id}"><i data-lucide="send" width="14" class="text-primary"></i> Submit for Review</button></li>
                                    ` : ''}
                                    ${displayStatus === 'APPROVED' ? `
                                        <li><button class="dropdown-item d-flex align-items-center gap-2 btn-publish-event" data-id="${evt.id}"><i data-lucide="send" width="14" class="text-success"></i> Publish Now</button></li>
                                    ` : ''}
                                    ${displayStatus === 'REJECTED' ? `
                                        <li><button class="dropdown-item d-flex align-items-center gap-2 btn-resubmit-event" data-id="${evt.id}"><i data-lucide="rotate-ccw" width="14"></i> Edit & Resubmit</button></li>
                                    ` : ''}
                                    ${displayStatus === 'DRAFT' ? `
                                        <li><a class="dropdown-item d-flex align-items-center gap-2" href="#"><i data-lucide="pencil" width="14"></i> Edit Event</a></li>
                                    ` : ''}
                                    <li><a class="dropdown-item d-flex align-items-center gap-2" href="reports.html"><i data-lucide="bar-chart-2" width="14"></i> Sales Report</a></li>
                                    ${displayStatus === 'APPROVED' ? `
                                        <li><hr class="dropdown-divider"></li>
                                        <li><button class="dropdown-item d-flex align-items-center gap-2 text-warning btn-cancel-event" data-id="${evt.id}" data-name="${evt.title.replace(/"/g, '&quot;')}"><i data-lucide="slash" width="14"></i> Cancel Event</button></li>
                                    ` : ''}
                                    ${displayStatus === 'PUBLISHED' ? `
                                        <li><hr class="dropdown-divider"></li>
                                        <li><button class="dropdown-item d-flex align-items-center gap-2 text-warning btn-request-cancel" data-id="${evt.id}" data-name="${evt.title.replace(/"/g, '&quot;')}"><i data-lucide="flag" width="14"></i> Request Cancellation</button></li>
                                    ` : ''}
                                    ${displayStatus === 'DRAFT' || displayStatus === 'REJECTED' ? `
                                        <li><hr class="dropdown-divider"></li>
                                        <li><button class="dropdown-item d-flex align-items-center gap-2 text-danger btn-delete-event" data-id="${evt.id}" data-name="${evt.title.replace(/"/g, '&quot;')}"><i data-lucide="trash-2" width="14"></i> Delete</button></li>
                                    ` : ''}
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');

        if (window.initIcons) window.initIcons({ root: eventsGrid });

        // Bind Actions
        eventsGrid.querySelectorAll('.btn-publish-event').forEach(btn => {
            btn.onclick = async (e) => {
                e.preventDefault();
                const id = btn.dataset.id;
                const ev = myEvents.find(x => x.id === id);
                if (!ev) return;
                try {
                    await patchEventStatus(ev, 'PUBLISHED');
                    showToast('Published', 'Event is now visible to everyone!', 'success');
                    initMyEvents(); // Refresh
                } catch (err) {
                    showToast('Error', 'Failed to publish event.', 'danger');
                }
            };
        });

        eventsGrid.querySelectorAll('.btn-delete-event').forEach(btn => {
            btn.onclick = async (e) => {
                e.preventDefault();
                const id = btn.dataset.id;
                const name = btn.dataset.name;
                if (confirm(`Are you sure you want to delete "${name}"?`)) {
                    try {
                        await apiDelete('events', id);
                        showToast('Deleted', 'Event has been removed.', 'success');
                        initMyEvents(); // Refresh
                    } catch (err) {
                        showToast('Error', 'Failed to delete event.', 'danger');
                    }
                }
            };
        });

        eventsGrid.querySelectorAll('.btn-submit-review').forEach(btn => {
            btn.onclick = async (e) => {
                e.preventDefault();
                const id = btn.dataset.id;
                const ev = myEvents.find(x => x.id === id);
                if (!ev) return;
                try {
                    await patchEventStatus(ev, 'PENDING');
                    showToast('Submitted', 'Event sent for admin review.', 'success');
                    initMyEvents(); // Refresh
                } catch (err) {
                    showToast('Error', 'Failed to submit event.', 'danger');
                }
            };
        });

        eventsGrid.querySelectorAll('.btn-cancel-event').forEach(btn => {
            btn.onclick = async (e) => {
                e.preventDefault();
                const id = btn.dataset.id;
                const name = btn.dataset.name;
                const ev = myEvents.find(x => x.id === id);
                if (!ev) return;
                if (confirm(`Are you sure you want to cancel "${name}"?`)) {
                    try {
                        await patchEventStatus(ev, 'CANCELLED');
                        showToast('Cancelled', 'Event has been cancelled.', 'success');
                        initMyEvents(); // Refresh
                    } catch (err) {
                        showToast('Error', 'Failed to cancel event.', 'danger');
                    }
                }
            };
        });

        eventsGrid.querySelectorAll('.btn-resubmit-event').forEach(btn => {
            btn.onclick = async (e) => {
                e.preventDefault();
                const id = btn.dataset.id;
                const ev = myEvents.find(x => x.id === id);
                if (!ev) return;
                try {
                    await patchEventStatus(ev, 'PENDING');
                    showToast('Resubmitted', 'Event was resubmitted for review.', 'success');
                    initMyEvents();
                } catch (err) {
                    showToast('Error', 'Failed to resubmit event.', 'danger');
                }
            };
        });

        eventsGrid.querySelectorAll('.btn-request-cancel').forEach(btn => {
            btn.onclick = async (e) => {
                e.preventDefault();
                const id = btn.dataset.id;
                const name = btn.dataset.name;
                const ev = myEvents.find(x => x.id === id);
                if (!ev) return;
                if (!confirm(`Send cancellation request for "${name}" to admin?`)) return;

                try {
                    await apiPatch('events', id, {
                        cancellationRequest: {
                            requestedBy: user.id,
                            requestedAt: new Date().toISOString(),
                            status: 'PENDING'
                        }
                    });
                    await apiPost('notifications', {
                        id: `notif-${Date.now()}`,
                        title: 'Cancellation Request',
                        message: `Organizer requested cancellation for "${name}".`,
                        type: 'WARNING',
                        targetRole: 'ADMIN',
                        targetUserId: 'ALL_ADMINS',
                        read: false,
                        createdAt: new Date().toISOString()
                    });
                    showToast('Requested', 'Cancellation request sent to admin.', 'success');
                } catch (err) {
                    showToast('Error', 'Failed to send cancellation request.', 'danger');
                }
            };
        });
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
                const venue = getVenue(evt.venueId);
                const matchQ = !q || evt.title.toLowerCase().includes(q) || (venue && venue.name.toLowerCase().includes(q));
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
    injectRegistrationModal();

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
                        r.totalAmount,
                        r.status,
                        formatDate(r.createdAt)
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
                <td class="ps-4 fw-medium text-neutral-900">${getEvent(r.eventId)?.title || 'Event'}</td>
                <td class="text-neutral-900">${name}</td>
                <td class="text-neutral-400 small">${email}</td>
                <td><span class="badge rounded-pill bg-light text-neutral-900 border fw-medium" style="font-size: 10px;">${r.ticketType.toUpperCase()}</span></td>
                <td><span class="${isPaid ? 'text-success' : 'text-warning'} fw-medium small">${isPaid ? 'Paid' : r.status}</span></td>
                <td class="text-neutral-400 small">${formatDate(r.createdAt || r.date)}</td>
                <td class="pe-4 text-end">
                    <button class="btn btn-sm text-primary p-0" title="View Details" onclick="viewRegistrationDetails('${r.id}')">
                        <i data-lucide="eye" width="16"></i>
                    </button>
                </td>
            </tr>`;
        }).join('');
    };

    setupPagination(filtered, 10, 'pagination-controls', renderTable);

    const applyFilters = () => {
        const eventId = eventSelect ? eventSelect.value : '';
        const q = searchInput ? searchInput.value.toLowerCase() : '';

        const newFiltered = allRegs.filter(r => {
            const matchEvent = !eventId || r.eventId === eventId;
            const event = getEvent(r.eventId);
            const u = state.users.find(u => u.id === r.userId);
            const name = u ? u.profile.fullName.toLowerCase() : '';
            const email = u ? u.profile.email.toLowerCase() : '';
            const eventTitle = event ? event.title.toLowerCase() : '';
            const matchQ = !q || name.includes(q) || email.includes(q) || eventTitle.includes(q);
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

    // const updateStats = () => {
    //     const rows = Array.from(tbody.querySelectorAll('tr'));
    //     const totalCapacity = rows.reduce((sum, row) => {
    //         const qtyInput = row.querySelector('input[type="number"]:nth-of-type(2)') || row.querySelector('td:nth-child(3)');
    //         const qty = qtyInput ? parseInt(qtyInput.value || qtyInput.textContent) || 0 : 0;
    //         return sum + qty;
    //     }, 0);

    //     const totalSold = currentEvent.tickets.reduce((sum, t) => sum + (t.totalQuantity - t.availableQuantity), 0);
    //     const potentialRevenue = rows.reduce((sum, row) => {
    //         const priceInput = row.querySelector('input[type="number"]:nth-of-type(1)') || row.querySelector('td:nth-child(2)');
    //         const price = priceInput ? parseFloat(priceInput.value || priceInput.textContent.replace(/[^\d.-]/g, '')) || 0 : 0;
    //         const qtyInput = row.querySelector('input[type="number"]:nth-of-type(2)') || row.querySelector('td:nth-child(3)');
    //         const qty = qtyInput ? parseInt(qtyInput.value || qtyInput.textContent) || 0 : 0;
    //         return sum + (price * qty);
    //     }, 0);

    //     const statsRow = document.querySelector('.row.g-4:last-of-type');
    //     if (statsRow) {
    //         const nums = statsRow.querySelectorAll('.h3');
    //         if (nums[0]) nums[0].textContent = totalCapacity.toLocaleString('en-IN');
    //         if (nums[1]) nums[1].textContent = totalSold.toLocaleString('en-IN');
    //         if (nums[2]) nums[2].textContent = formatCurrency(potentialRevenue);
    //     }
    // };

    const updateStats = () => {
    const rows = Array.from(tbody.querySelectorAll('tr'));
    let totalCapacity = 0, potentialRevenue = 0;

    rows.forEach(row => {
        const tds = row.querySelectorAll('td');
        const priceEl = tds[1]?.querySelector('input') || tds[1];
        const qtyEl = tds[2]?.querySelector('input') || tds[2];
        const price = parseFloat(priceEl?.value ?? priceEl?.textContent?.replace(/[^\d.-]/g, '')) || 0;
        const qty = parseInt(qtyEl?.value ?? qtyEl?.textContent) || 0;
        totalCapacity += qty;
        potentialRevenue += price * qty;
    });

    const totalSold = currentEvent.tickets.reduce(
        (sum, t) => sum + (t.totalQuantity - t.availableQuantity), 0
    );

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
            <tr data-ticket-type="${ticket.type}">
                <td class="ps-4">
                    <span class="fw-medium text-neutral-900">${ticket.type.replace(/_/g, ' ')}</span>
                    ${lowStock ? '<span class="badge bg-warning text-dark ms-2" style="font-size:9px;">Low Stock</span>' : ''}
                </td>
                <td><input type="number" class="form-control form-control-sm border-0 bg-light ticket-price-input" min="0" value="${Number(ticket.price || 0)}"></td>
                <td class="text-neutral-900">${ticket.totalQuantity}</td>
                <td class="text-neutral-900">${sold}</td>
                <td class="text-neutral-900">${available}</td>
                <td class="pe-4 text-end">
                    <span class="text-neutral-400 small">Price only</span>
                </td>
            </tr>`;
        }).join('');

        tbody.querySelectorAll('.ticket-price-input').forEach((input) => {
            input.addEventListener('input', updateStats);
        });

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
        addBtn.disabled = true;
        addBtn.classList.add('d-none');
    }

    window.updateTicketStats = updateStats;

    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const rows = Array.from(tbody.querySelectorAll('tr'));
            const updatedTickets = currentEvent.tickets.map((ticket) => {
                const row = rows.find((r) => r.dataset.ticketType === ticket.type);
                const priceInput = row ? row.querySelector('.ticket-price-input') : null;
                const nextPrice = priceInput ? parseFloat(priceInput.value) : ticket.price;
                return Object.assign({}, ticket, {
                    price: Number.isFinite(nextPrice) ? nextPrice : ticket.price
                });
            });

            try {
                await apiPatch('events', currentEvent.id, { tickets: updatedTickets });
                currentEvent.tickets = updatedTickets;
                showToast('Saved', 'Ticket prices updated successfully.', 'success');
                renderTickets(currentEvent);
            } catch (e) { showToast('Error', 'Failed to save changes.', 'danger'); }
        });
    }

    renderTickets(myEvents[0]);
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export function initReports() {
    const user = getCurrentUser();
    if (!user) return;

    populateSidebarUserInfo();
    injectRegistrationModal();

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
                    rows.push([r.eventName, r.ticketType, r.quantity, r.totalAmount, formatDate(r.createdAt)]);
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
            const d = new Date(r.createdAt);
            const key = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
            months[key] = (months[key] || 0) + (r.totalAmount || 0);
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

    // Mapping fields
    const fields = {
        name: document.getElementById('profileName'),
        email: document.getElementById('profileEmail'),
        orgName: document.getElementById('profileOrgName'),
        orgType: document.getElementById('profileOrgType'),
        address: document.getElementById('profileAddress'),
        bio: document.getElementById('profileBio'),
        website: document.getElementById('profileWebsite'),
        twitter: document.getElementById('profileTwitter'),
        linkedIn: document.getElementById('profileLinkedIn')
    };

    // Populate data
    if (fields.name) fields.name.value = user.profile.fullName || '';
    if (fields.email) fields.email.value = user.profile.email || '';
    if (fields.orgName) fields.orgName.value = user.profile.organizationName || '';
    if (fields.orgType) fields.orgType.value = user.profile.organizationType || '';
    if (fields.address) fields.address.value = user.profile.address || '';
    if (fields.bio) fields.bio.value = user.profile.bio || '';
    if (fields.website) fields.website.value = user.profile.website || '';
    if (fields.twitter) fields.twitter.value = user.profile.twitter || '';
    if (fields.linkedIn) fields.linkedIn.value = user.profile.linkedIn || '';

    // Profile Avatar
    const profileAvatar = document.querySelector('.mb-4.text-center .avatar-circle');
    if (profileAvatar) {
        if (user.profile.profileImage) {
            profileAvatar.style.backgroundImage = `url(${user.profile.profileImage})`;
            profileAvatar.style.backgroundSize = 'cover';
            profileAvatar.style.backgroundPosition = 'center';
            profileAvatar.textContent = '';
        } else {
            const initials = user.profile.fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            profileAvatar.textContent = initials;
        }
    }

    // Save Basic Info
    const saveBasicBtn = document.getElementById('saveBasicInfoBtn');
    if (saveBasicBtn) {
        saveBasicBtn.addEventListener('click', async () => {
            user.profile.fullName = fields.name.value;
            user.profile.organizationName = fields.orgName.value;
            user.profile.organizationType = fields.orgType.value;
            user.profile.address = fields.address.value;

            localStorage.setItem('currentUser', JSON.stringify(user));
            populateSidebarUserInfo();
            
            try {
                await apiPatch('users', user.id, { profile: user.profile });
                showToast('Saved', 'Basic information updated.', 'success');
            } catch (e) {
                showToast('Error', 'Failed to save changes.', 'danger');
            }
        });
    }

    // Save Public Profile
    const savePublicBtn = document.getElementById('savePublicProfileBtn');
    if (savePublicBtn) {
        savePublicBtn.addEventListener('click', async () => {
            user.profile.bio = fields.bio.value;
            user.profile.website = fields.website.value;
            user.profile.twitter = fields.twitter.value;
            user.profile.linkedIn = fields.linkedIn.value;

            localStorage.setItem('currentUser', JSON.stringify(user));
            
            try {
                await apiPatch('users', user.id, { profile: user.profile });
                showToast('Updated', 'Public profile updated.', 'success');
            } catch (e) {
                showToast('Error', 'Failed to update profile.', 'danger');
            }
        });
    }

    const allCards = document.querySelectorAll('.card-custom');
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

export async function initOrganizerNotifications() {
    const user = getCurrentUser();
    if (!user) return;

    populateSidebarUserInfo();

    const myEvents = getOrganizerEvents(user);
    const myRegs = getEventRegistrations(myEvents);
    let currentFilter = 'all';
    let notifications = [];

    const loadNotifications = async () => {
        const container = document.querySelector('.list-group.list-group-flush');
        if (!container) return;

        try {
            // 1. Fetch Server Notifications
            const serverNotifs = await apiFetch('notifications');
            const myServerNotifs = serverNotifs.filter(n => n.targetUserId === user.id || n.targetUserId === 'ALL_ORGANIZERS');

            // Map server notifs to our UI structure
            const mappedServer = myServerNotifs.map(n => {
                let icon = 'bell';
                let iconColor = 'text-primary';
                let bgColor = 'bg-primary bg-opacity-10';

                if (n.type === 'SUCCESS' || n.type === 'BOOKING_CONFIRMED') {
                    icon = 'check-circle';
                    iconColor = 'text-success';
                    bgColor = 'bg-success bg-opacity-10';
                } else if (n.type === 'EVENT_APPROVAL') {
                    icon = 'clock';
                    iconColor = 'text-warning';
                    bgColor = 'bg-warning bg-opacity-10';
                } else if (n.type === 'REFUND') {
                    icon = 'refresh-ccw';
                    iconColor = 'text-danger';
                    bgColor = 'bg-danger bg-opacity-10';
                }

                return {
                    id: n.id,
                    isServer: true,
                    type: n.type.toLowerCase(),
                    icon: icon,
                    iconColor: iconColor,
                    bgColor: bgColor,
                    title: n.title || 'Notification',
                    message: n.message || 'No message content',
                    time: n.createdAt || new Date().toISOString(),
                    read: n.read
                };
            });

            // 2. Generate Local Notifications (Registrations & Inventory)
            const localNotifs = [];
            let readSet = new Set(JSON.parse(localStorage.getItem('org-notif-read') || '[]'));

            // Registrations
            [...myRegs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10).forEach(r => {
                const nid = `reg-${r.id}`;
                localNotifs.push({
                    id: nid,
                    isServer: false,
                    type: 'registration',
                    icon: 'user-plus',
                    iconColor: 'text-primary',
                    bgColor: 'bg-primary bg-opacity-10',
                    title: 'New Registration',
                    message: `A new registration was made for <strong class="text-neutral-900">${r.eventName}</strong>`,
                    time: r.createdAt,
                    read: readSet.has(nid)
                });
            });

            // Low inventory
            myEvents.forEach(evt => {
                evt.tickets.forEach(ticket => {
                    if (ticket.availableQuantity <= 20 && ticket.availableQuantity > 0) {
                        const nid = `inv-${evt.id}-${ticket.type}`;
                        localNotifs.push({
                            id: nid,
                            isServer: false,
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

            notifications = [...mappedServer, ...localNotifs].sort((a, b) => {
                if (a.read !== b.read) return a.read ? 1 : -1;
                return new Date(b.time) - new Date(a.time);
            });

            renderUI();
        } catch (e) { console.error('Error loading notifs', e); }
    };

    const renderUI = () => {
        const container = document.querySelector('.list-group.list-group-flush');
        const toShow = currentFilter === 'unread' ? notifications.filter(n => !n.read) : notifications;

        updateTabs();

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
                <div class="d-flex flex-column gap-2 align-items-end">
                    ${!n.read ? '<div class="bg-primary rounded-circle" style="width:8px; height:8px;"></div>' : ''}
                    <button class="btn btn-link text-neutral-400 p-0 btn-mark-read" data-id="${n.id}" title="${n.read ? 'Dismiss' : 'Mark as read'}">
                        <i data-lucide="${n.read ? 'x' : 'check'}" style="width:16px;height:16px;"></i>
                    </button>
                </div>
            </div>`).join('');

        if (window.initIcons) window.initIcons({ root: container });

        container.querySelectorAll('.btn-mark-read').forEach(btn => {
            btn.onclick = async () => {
                const nid = btn.dataset.id;
                const notif = notifications.find(x => x.id === nid);
                if (!notif) return;

                if (!notif.read) {
                    if (notif.isServer) {
                        await apiPatch('notifications', nid, { read: true });
                    } else {
                        let readSet = new Set(JSON.parse(localStorage.getItem('org-notif-read') || '[]'));
                        readSet.add(nid);
                        localStorage.setItem('org-notif-read', JSON.stringify([...readSet]));
                    }
                    loadNotifications();
                } else {
                    if (notif.isServer) {
                        await apiDelete('notifications', nid);
                    }
                    // For local ones, we just don't show them if they aren't in the generated list next time?
                    // Or we could have a hiddenSet. 
                    loadNotifications();
                }
            };
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
        header.querySelectorAll('.btn-group button').forEach((btn, i) => {
            btn.onclick = () => {
                header.querySelectorAll('.btn-group button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilter = i === 0 ? 'all' : 'unread';
                renderUI();
            };
        });

        const markAllBtn = header.querySelector('.btn-link');
        if (markAllBtn) {
            markAllBtn.onclick = async () => {
                for (const n of notifications.filter(x => !x.read)) {
                    if (n.isServer) await apiPatch('notifications', n.id, { read: true });
                    else {
                        let readSet = new Set(JSON.parse(localStorage.getItem('org-notif-read') || '[]'));
                        readSet.add(n.id);
                        localStorage.setItem('org-notif-read', JSON.stringify([...readSet]));
                    }
                }
                loadNotifications();
                showToast('Done', 'All marked as read.', 'success');
            };
        }
    }

    // Send Update Logic
    const sendUpdateModal = document.getElementById('sendUpdateModal');
    if (sendUpdateModal) {
        const sendBtn = sendUpdateModal.querySelector('.btn-primary');
        const eventSelect = sendUpdateModal.querySelector('select');
        const subjectInput = sendUpdateModal.querySelector('input');
        const messageInput = sendUpdateModal.querySelector('textarea');

        // Populate event select
        if (eventSelect) {
            eventSelect.innerHTML = '<option value="ALL">All My Events</option>' +
                myEvents.map(e => `<option value="${e.id}">${e.title}</option>`).join('');
        }

        if (sendBtn) {
            sendBtn.onclick = async () => {
                const subject = subjectInput.value;
                const message = messageInput.value;
                const eventId = eventSelect.value;

                if (!subject || !message) {
                    showToast('Error', 'Please fill in all fields.', 'danger');
                    return;
                }

                try {
                    await apiPost('notifications', {
                        title: subject,
                        message: message,
                        createdAt: new Date().toISOString(),
                        type: 'INFO',
                        targetUserId: eventId === 'ALL' ? 'ALL_ATTENDEES' : `EVENT_${eventId}`,
                        read: false
                    });
                    showToast('Sent', 'Update sent to all registrants.', 'success');
                    subjectInput.value = '';
                    messageInput.value = '';
                } catch (e) { showToast('Error', 'Failed to send update.', 'danger'); }
            };
        }
    }

    loadNotifications();
}

// ─── Create Event Flow ────────────────────────────────────────────────────────

export function initCreateEventWizard() {
    const user = getCurrentUser();
    if (!user) return;

    populateSidebarUserInfo();

    // Critical: Gate event creation on ACTIVE status
    if (user.accountStatus?.status !== 'ACTIVE') {
        const mainContent = document.querySelector('.col-lg-9');
        if (mainContent) {
            mainContent.innerHTML = `
                <div class="card-custom p-5 text-center">
                    <div class="mb-4 text-warning">
                        <i data-lucide="shield-alert" width="64" height="64"></i>
                    </div>
                    <h2 class="fw-bold mb-3">Account Pending Approval</h2>
                    <p class="text-neutral-500 mb-4">Your organizer account is currently being reviewed by our administration team. You will be able to create and publish events once your profile is approved.</p>
                    <a href="dashboard.html" class="btn btn-primary rounded-pill px-4">Back to Dashboard</a>
                </div>
            `;
            if (window.initIcons) window.initIcons({ root: mainContent });
        }
        return;
    }

    let currentStep = 1;
    const eventData = {
        id: `evt-${Date.now()}`,
        organizerId: user.id,
        status: { current: 'DRAFT', history: ['DRAFT'] },
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

    // Premium Live Character Counters
    const setupCounters = () => {
        const titleInput = document.getElementById('eventTitle');
        const titleCounter = document.getElementById('titleCounter');
        const titleFeedback = document.getElementById('titleFeedback');

        if (titleInput && titleCounter) {
            const updateTitle = () => {
                const len = titleInput.value.length;
                titleCounter.textContent = `${len} / 35`;
                if (len > 0 && (len < 15 || len > 35)) {
                    titleCounter.classList.add('text-danger');
                    titleInput.classList.add('is-invalid');
                    if (titleFeedback) {
                        titleFeedback.textContent = len < 15 ? 'Title too short (min 15 chars)' : 'Title too long (max 35 chars)';
                    }
                } else {
                    titleCounter.classList.remove('text-danger');
                    titleInput.classList.remove('is-invalid');
                    if (titleFeedback) titleFeedback.textContent = '';
                }
            };
            titleInput.addEventListener('input', updateTitle);
            updateTitle();
        }

        const descInput = document.getElementById('eventDesc');
        const descCounter = document.getElementById('descCounter');
        const descFeedback = document.getElementById('descFeedback');

        if (descInput && descCounter) {
            const updateDesc = () => {
                const len = descInput.value.length;
                descCounter.textContent = `${len} / 300`;
                if (len > 0 && (len < 150 || len > 300)) {
                    descCounter.classList.add('text-danger');
                    descInput.classList.add('is-invalid');
                    if (descFeedback) {
                        descFeedback.textContent = len < 150 ? 'Description too short (min 150 chars)' : 'Description too long (max 300 chars)';
                    }
                } else {
                    descCounter.classList.remove('text-danger');
                    descInput.classList.remove('is-invalid');
                    if (descFeedback) descFeedback.textContent = '';
                }
            };
            descInput.addEventListener('input', updateDesc);
            updateDesc();
        }
    };
    setupCounters();

    window.nextStep = (n) => {
        if (n > currentStep) {
            // Validation for Step 1
            if (currentStep === 1) {
                let s1Valid = true;

                const titleInput = document.getElementById('eventTitle');
                const titleFeedback = document.getElementById('titleFeedback');
                const title = titleInput ? titleInput.value.trim() : '';
                
                if (!title) {
                    titleInput?.classList.add('is-invalid');
                    if (titleFeedback) titleFeedback.textContent = 'Event Title is required.';
                    s1Valid = false;
                } else if (title.length < 15 || title.length > 35) {
                    titleInput?.classList.add('is-invalid');
                    s1Valid = false;
                }

                const catInput = document.getElementById('eventCategory');
                const catFeedback = document.getElementById('categoryFeedback');
                if (!catInput || !catInput.value) {
                    catInput?.classList.add('is-invalid');
                    if (catFeedback) catFeedback.textContent = 'Please select a category.';
                    s1Valid = false;
                }

                const descInput = document.getElementById('eventDesc');
                const descFeedback = document.getElementById('descFeedback');
                const desc = descInput ? descInput.value.trim() : '';
                if (!desc) {
                    descInput?.classList.add('is-invalid');
                    if (descFeedback) descFeedback.textContent = 'Description is required.';
                    s1Valid = false;
                } else if (desc.length < 150 || desc.length > 300) {
                    descInput?.classList.add('is-invalid');
                    s1Valid = false;
                }

                const bannerImg = document.getElementById('bannerPrev');
                const bannerHb = document.getElementById('bannerFeedback');
                if (!bannerImg || bannerImg.classList.contains('d-none')) {
                    if (bannerHb) {
                        bannerHb.textContent = 'Banner Image is required.';
                        bannerHb.classList.remove('d-none');
                        document.getElementById('bannerUpload')?.classList.add('border-danger');
                    }
                    s1Valid = false;
                }

                const policiesInput = document.getElementById('eventPolicies');
                const policiesFeedback = document.getElementById('policiesFeedback');
                if (!policiesInput || !policiesInput.value.trim()) {
                    policiesInput?.classList.add('is-invalid');
                    if (policiesFeedback) policiesFeedback.classList.add('d-block');
                    s1Valid = false;
                } else {
                    policiesInput?.classList.remove('is-invalid');
                    if (policiesFeedback) policiesFeedback.classList.remove('d-block');
                }

                if (!s1Valid) {
                    showToast('Validation Error', 'Please resolve all errors in Step 1.', 'danger');
                    return;
                }
            }
            // Validation for Step 2
            if (currentStep === 2) {
                let s2Valid = true;

                const isPhysical = document.getElementById('vt-physical').checked;
                if (isPhysical) {
                    const vs = document.getElementById('venueSelect');
                    const vFeedback = document.getElementById('venueFeedback');
                    if (!vs || !vs.value) {
                        vs?.classList.add('is-invalid');
                        if (vFeedback) vFeedback.textContent = 'Please select a venue.';
                        s2Valid = false;
                    }
                } else {
                    const eu = document.getElementById('eventUrl');
                    let euv = eu ? eu.value.trim() : '';
                    if (!euv || !/^https?:\/\//i.test(euv)) {
                        eu?.classList.add('is-invalid');
                        s2Valid = false;
                    }
                }

                const startInput = document.getElementById('startDate');
                const endInput = document.getElementById('endDate');
                const sFeedback = document.getElementById('startDateFeedback');
                const eFeedback = document.getElementById('endDateFeedback');

                if (!startInput?.value) {
                    startInput?.classList.add('is-invalid');
                    if (sFeedback) sFeedback.textContent = 'Start date is required.';
                    s2Valid = false;
                } else if (new Date(startInput.value) < new Date()) {
                    startInput?.classList.add('is-invalid');
                    if (sFeedback) sFeedback.textContent = 'Cannot schedule in the past.';
                    s2Valid = false;
                }

                if (!endInput?.value) {
                    endInput?.classList.add('is-invalid');
                    if (eFeedback) eFeedback.textContent = 'End date is required.';
                    s2Valid = false;
                } else if (startInput?.value && new Date(endInput.value) <= new Date(startInput.value)) {
                    endInput?.classList.add('is-invalid');
                    if (eFeedback) eFeedback.textContent = 'End must be after start.';
                    s2Valid = false;
                }

                if (!s2Valid) {
                    showToast('Validation Error', 'Please resolve all errors in Step 2.', 'danger');
                    return;
                }
            }
        }

        if (n === 4 && currentStep === 3) {
            let s3Valid = true;
            const ticketRows = document.getElementById('ticketRows').querySelectorAll('.p-3.border');
            if (ticketRows.length === 0) {
                showToast('No Tickets', 'Please add at least one ticket type.', 'warning');
                return;
            }
            let totalTicketCount = 0;
            ticketRows.forEach(row => {
                const nameInput = row.querySelector('input[type="text"]');
                const priceInput = row.querySelectorAll('input[type="number"]')[0];
                const qtyInput = row.querySelectorAll('input[type="number"]')[1];

                if (!nameInput.value.trim()) { nameInput.classList.add('is-invalid'); nameInput.classList.remove('border-0'); s3Valid = false; } else { nameInput.classList.remove('is-invalid'); nameInput.classList.add('border-0'); }
                if (!priceInput.value || priceInput.value < 0) { priceInput.classList.add('is-invalid'); priceInput.classList.remove('border-0'); s3Valid = false; } else { priceInput.classList.remove('is-invalid'); priceInput.classList.add('border-0'); }
                if (!qtyInput.value || qtyInput.value <= 0) { qtyInput.classList.add('is-invalid'); qtyInput.classList.remove('border-0'); s3Valid = false; } else { qtyInput.classList.remove('is-invalid'); qtyInput.classList.add('border-0'); }

                totalTicketCount += (parseInt(qtyInput.value) || 0);
            });

            if (!s3Valid) {
                showToast('Validation Error', 'Please complete all ticket fields correctly.', 'danger');
                return;
            }

            const isPhysical = document.querySelector('input[name="venueType"]:checked').value === 'PHYSICAL';
            if (isPhysical) {
                const venueCap = parseInt(document.getElementById('venueCapacity').value) || 0;
                if (totalTicketCount !== venueCap) {
                    showToast('Capacity Mismatch', `Total tickets (${totalTicketCount}) must equal venue capacity (${venueCap}).`, 'warning');
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

        const title = document.getElementById('eventTitle') ? document.getElementById('eventTitle').value : '';
        const catSelect = document.getElementById('eventCategory');
        const cat = catSelect && catSelect.selectedIndex > -1 ? catSelect.options[catSelect.selectedIndex].text : '';
        const vtElement = document.querySelector('input[name="venueType"]:checked');
        const vt = vtElement ? vtElement.value : 'VIRTUAL';
        const start = document.getElementById('startDate') ? document.getElementById('startDate').value : '';

        let venue = 'Virtual';
        if (vt === 'PHYSICAL') {
            const venueSelect = document.getElementById('venueSelect');
            venue = venueSelect && venueSelect.selectedIndex > -1 ? venueSelect.options[venueSelect.selectedIndex].text : '';
        }

        const policies = document.getElementById('eventPolicies') ? document.getElementById('eventPolicies').value : '';

        reviewContent.innerHTML = `
            <div class="row g-3">
                <div class="col-md-6">
                    <div class="small text-neutral-400 mb-1">Title</div>
                    <div class="fw-bold text-neutral-900">${title}</div>
                </div>
                <div class="col-md-6">
                    <div class="small text-neutral-400 mb-1">Category</div>
                    <div class="fw-bold text-neutral-900">${cat}</div>
                </div>
                <div class="col-md-6">
                    <div class="small text-neutral-400 mb-1">Date & Time</div>
                    <div class="fw-bold text-neutral-900">${new Date(start).toLocaleString('en-IN')}</div>
                </div>
                <div class="col-md-6">
                    <div class="small text-neutral-400 mb-1">Venue</div>
                    <div class="fw-bold text-neutral-900">${venue} (${vt})</div>
                </div>
                <div class="col-12 mt-3 pt-3 border-top">
                    <div class="small text-neutral-400 mb-1">Event Policies</div>
                    <div class="small text-neutral-600" style="white-space: pre-wrap;">${policies || 'No specific policies provided.'}</div>
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
        div.className = 'p-3 border rounded-3 d-flex flex-column gap-2 bg-white';
        div.innerHTML = `
            <div class="row g-2 align-items-start">
                <div class="col-6">
                    <input type="text" class="form-control form-control-sm border-0 bg-light ticket-name-input" placeholder="Ticket Name (e.g. VIP)" maxlength="15">
                    <div class="d-flex justify-content-between mt-1 px-1">
                        <div class="invalid-feedback d-block ticket-name-feedback" style="font-size: 10px;"></div>
                        <small class="text-neutral-400 ticket-name-counter" style="font-size: 10px;">0 / 15</small>
                    </div>
                </div>
                <div class="col-3">
                    <input type="number" class="form-control form-control-sm border-0 bg-light" placeholder="Price (₹)">
                </div>
                <div class="col-2">
                    <input type="number" class="form-control form-control-sm border-0 bg-light" placeholder="Qty">
                </div>
                <div class="col-1 pt-1">
                    <button class="btn btn-sm text-danger p-0" onclick="this.closest('.p-3').remove()">
                        <i data-lucide="trash-2" width="16"></i>
                    </button>
                </div>
            </div>
        `;
        
        const nameInput = div.querySelector('.ticket-name-input');
        const nameCounter = div.querySelector('.ticket-name-counter');
        nameInput.addEventListener('input', () => {
            nameCounter.textContent = `${nameInput.value.length} / 15`;
        });

        rowCont.appendChild(div);
        if (window.initIcons) window.initIcons({ root: div });
    };

    // Load Categories (Filtered by ACTIVE)
    const loadCategories = async () => {
        const select = document.getElementById('eventCategory');
        if (!select) return;

        // Show loading state
        select.innerHTML = '<option value="">Category (Loading...)</option>';
        select.disabled = true;

        try {
            // First check if already in state
            let cats = state.categories;
            if (cats.length === 0) {
                const res = await fetch('http://localhost:3000/categories');
                cats = await res.json();
            }
            const activeCats = cats.filter(c => c.status === 'ACTIVE');

            select.innerHTML = '<option value="">Select a Category</option>' + activeCats.map(c => `
                <option value="${c.id}" style="color: #0f172a; background-color: #ffffff;">${c.name}</option>
            `).join('');
            select.disabled = false;
        } catch (e) {
            console.error('Error loading categories', e);
            select.innerHTML = '<option value="">Failed to load categories</option>';
        }
    };

    // Load Venues
    const loadVenues = async () => {
        const select = document.getElementById('venueSelect');
        if (!select) return;

        select.innerHTML = '<option value="">Venues (Loading...)</option>';
        select.disabled = true;

        try {
            let venues = state.venues;
            if (venues.length === 0) {
                const res = await fetch('http://localhost:3000/venues');
                venues = await res.json();
            }
            const activeVenues = venues.filter(v => v.status === 'ACTIVE');

            select.innerHTML = '<option value="">Select a Venue</option>' + activeVenues.map(v => `
                <option value="${v.id}" data-city="${v.address.city}" data-capacity="${v.capacity}" style="color: #0f172a; background-color: #ffffff;">${v.name}</option>
            `).join('');
            select.disabled = false;

            select.addEventListener('change', () => {
                const opt = select.options[select.selectedIndex];
                if (opt.value) {
                    eventData.venueId = opt.value;
                    const vNameInput = document.getElementById('venueName');
                    if (vNameInput) vNameInput.value = opt.text;
                    
                    document.getElementById('venueCity').value = opt.dataset.city || '';
                    document.getElementById('venueCapacity').value = opt.dataset.capacity || '';
                    
                    // Trigger validation hide
                    select.classList.remove('is-invalid');
                } else {
                    eventData.venueId = null;
                    const vNameInput = document.getElementById('venueName');
                    if (vNameInput) vNameInput.value = '';
                    
                    document.getElementById('venueCity').value = '';
                    document.getElementById('venueCapacity').value = '';
                }
            });
        } catch (e) {
            console.error('Error loading venues', e);
            select.innerHTML = '<option value="">Failed to load venues</option>';
        }
    };

    loadCategories();
    loadVenues();

    const saveEvent = async (published = false) => {
        const user = getCurrentUser();
        if (!user) return;

        const title = document.getElementById('eventTitle').value;
        const catId = document.getElementById('eventCategory').value;
        const desc = document.getElementById('eventDesc').value;
        const policies = document.getElementById('eventPolicies').value;
        const vt = document.querySelector('input[name="venueType"]:checked').value;
        const start = document.getElementById('startDate').value;
        const end = document.getElementById('endDate').value;

        const categoryMap = {
            'tech': 'Technology',
            'entertainment': 'Entertainment',
            'professional': 'Professional',
            'creative': 'Creative arts'
        };

        // Map data
        eventData.title = title;
        eventData.category = {
            id: catId,
            name: categoryMap[catId] || catId
        };
        eventData.description = desc;
        eventData.policies = policies;
        eventData.schedule = {
            startDateTime: start,
            endDateTime: end,
            timeZone: "Asia/Kolkata",
            createdAt: new Date().toISOString()
        };
        eventData.location = {
            type: vt,
            venueId: vt === 'PHYSICAL' ? (eventData.venueId || document.getElementById('venueSelect').value) : null,
            name: vt === 'PHYSICAL' ? (document.getElementById('venueName') ? document.getElementById('venueName').value : '') : 'Virtual Link',
            address: {
                city: vt === 'PHYSICAL' ? document.getElementById('venueCity').value : 'Online'
            },
            capacity: vt === 'PHYSICAL' ? parseInt(document.getElementById('venueCapacity').value) || 0 : 9999
        };
        if (vt === 'VIRTUAL') eventData.location.url = document.getElementById('eventUrl').value;

        // Tickets
        const ticketRows = document.getElementById('ticketRows').children;
        eventData.tickets = Array.from(ticketRows).map((row, i) => {
            const inputs = row.querySelectorAll('input');
            const qty = parseInt(inputs[2].value) || 0;
            return {
                type: (inputs[0].value || 'GENERAL').replace(/\s+/g, '_').toUpperCase(),
                price: parseFloat(inputs[1].value) || 0,
                totalQuantity: qty,
                availableQuantity: qty,
                benefits: []
            };
        });

        eventData.organizer = {
            id: user.id,
            name: user.profile.fullName,
            email: user.profile.email,
            avatar: user.profile.profileImage || `https://ui-avatars.com/api/?name=${user.profile.fullName}`,
            rating: user.statistics?.rating || 4.5
        };

        eventData.status.current = published ? 'PENDING' : 'DRAFT';
        eventData.status.history = published ? ['DRAFT', 'PENDING'] : ['DRAFT'];

        try {
            await apiPost('events', eventData);
            showToast(published ? 'Submitted' : 'Saved',
                published ? 'Your event has been submitted for admin approval.' : 'Event draft saved locally.',
                'success');

            setTimeout(() => {
                window.location.href = 'my-events.html';
            }, 1000);
        } catch (err) {
            showToast('Error', 'Failed to save event.', 'danger');
        }
    };

    const draftBtn = document.getElementById('saveDraftBtn');
    const submitBtn = document.getElementById('submitEventBtn');

    if (draftBtn) draftBtn.onclick = () => saveEvent(false);
    if (submitBtn) submitBtn.onclick = () => saveEvent(true);

    if (window.initIcons) window.initIcons();
}

export async function initOrganizerOffers() {
    const user = getCurrentUser();
    if (!user) return;

    populateSidebarUserInfo();

    const tableBody = document.getElementById('offersTableBody');
    const card = document.getElementById('organizer-offers-card');
    const searchInput = document.getElementById('offerSearch');
    const eventFilter = document.getElementById('eventFilter');
    const addBtn = document.getElementById('addOfferBtn');
    const modalEl = document.getElementById('offerModal');
    const form = document.getElementById('offerForm');
    const modalTitle = document.getElementById('modalTitle');
    const eventSelect = document.getElementById('offerEventSelect');
    const codeInput = document.getElementById('offerCodeInput');
    const discountInput = document.getElementById('offerDiscountInput');
    const codeFeedback = codeInput ? codeInput.parentElement.querySelector('.invalid-feedback') : null;
    const bsModal = modalEl ? new bootstrap.Modal(modalEl) : null;

    if (!tableBody || !card || !form || !eventSelect || !codeInput || !discountInput) return;

    let events = (await apiFetch('events')).filter((ev) => ev.organizerId === user.id);
    let currentPage = 1;
    const itemsPerPage = 8;
    let editing = null;

    let pagContainer = document.getElementById('offers-pagination');
    if (!pagContainer) {
        pagContainer = document.createElement('div');
        pagContainer.id = 'offers-pagination';
        card.appendChild(pagContainer);
    }

    const isPublished = (ev) => {
        const status = (ev.status && ev.status.current) || '';
        return status === 'PUBLISHED' || status === 'APPROVED';
    };

    const toOfferRows = () => events.flatMap((ev) => {
        const offers = (ev.pricing && Array.isArray(ev.pricing.offers)) ? ev.pricing.offers : [];
        return offers.map((offer) => ({
            eventId: ev.id,
            eventTitle: ev.title || ev.name || `Event ${ev.id}`,
            code: (offer.code || '').toUpperCase(),
            discountPercentage: Number(offer.discountPercentage || 0)
        }));
    });

    const populateFilters = () => {
        if (eventFilter) {
            eventFilter.innerHTML = '<option value="all">All My Events</option>' +
                events.map((ev) => `<option value="${ev.id}">${ev.title || ev.name || ev.id}</option>`).join('');
        }
        eventSelect.innerHTML = events
            .filter(isPublished)
            .map((ev) => `<option value="${ev.id}">${ev.title || ev.name || ev.id}</option>`)
            .join('');
    };

    const applyFilters = () => {
        const q = (searchInput ? searchInput.value : '').trim().toLowerCase();
        const selectedEvent = eventFilter ? eventFilter.value : 'all';
        return toOfferRows().filter((row) => {
            const matchEvent = selectedEvent === 'all' || row.eventId === selectedEvent;
            const matchSearch = !q || row.code.toLowerCase().includes(q) || row.eventTitle.toLowerCase().includes(q);
            return matchEvent && matchSearch;
        });
    };

    const resetForm = () => {
        editing = null;
        modalTitle.textContent = 'Create New Offer';
        form.reset();
        codeInput.classList.remove('is-invalid');
        if (codeFeedback) codeFeedback.textContent = 'Code must be unique for this event.';
        if (eventSelect.options.length > 0) eventSelect.selectedIndex = 0;
    };

    const validateUniqueForEvent = (eventId, code) => {
        const normalized = code.trim().toUpperCase();
        const ev = events.find((x) => x.id === eventId);
        if (!ev) return false;
        const offers = (ev.pricing && Array.isArray(ev.pricing.offers)) ? ev.pricing.offers : [];
        return !offers.some((offer) => {
            const sameCode = (offer.code || '').toUpperCase() === normalized;
            if (!sameCode) return false;
            if (!editing) return true;
            return !(editing.eventId === eventId && editing.code === normalized);
        });
    };

    const openForCreate = () => {
        resetForm();
        if (bsModal) bsModal.show();
    };

    const openForEdit = (eventId, code, discount) => {
        resetForm();
        editing = { eventId, code: code.toUpperCase() };
        modalTitle.textContent = 'Edit Offer';
        eventSelect.value = eventId;
        codeInput.value = code.toUpperCase();
        discountInput.value = discount;
        if (bsModal) bsModal.show();
    };

    const bindRowActions = () => {
        tableBody.querySelectorAll('.btn-edit-offer').forEach((btn) => {
            btn.onclick = () => openForEdit(btn.dataset.eventId, btn.dataset.code, btn.dataset.discount);
        });

        tableBody.querySelectorAll('.btn-delete-offer').forEach((btn) => {
            btn.onclick = () => {
                const eventId = btn.dataset.eventId;
                const code = btn.dataset.code.toUpperCase();
                if (!window.confirm(`Delete offer "${code}"?`)) return;
                (async () => {
                    try {
                        const ev = events.find((x) => x.id === eventId);
                        if (!ev) return;
                        const offers = (ev.pricing && Array.isArray(ev.pricing.offers)) ? ev.pricing.offers : [];
                        const updatedOffers = offers.filter((o) => (o.code || '').toUpperCase() !== code);
                        await apiPatch('events', eventId, { pricing: Object.assign({}, ev.pricing, { offers: updatedOffers }) });
                        ev.pricing = Object.assign({}, ev.pricing, { offers: updatedOffers });
                        showToast('Deleted', `Offer "${code}" removed.`, 'warning');
                        render();
                    } catch (e) {
                        showToast('Error', 'Failed to delete offer.', 'danger');
                    }
                })();
            };
        });
    };

    const render = () => {
        const rows = applyFilters();
        const start = (currentPage - 1) * itemsPerPage;
        const pageRows = rows.slice(start, start + itemsPerPage);

        if (rows.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-5 text-neutral-400">No offers found.</td></tr>';
            pagContainer.innerHTML = '';
        } else {
            tableBody.innerHTML = pageRows.map((row) => `
                <tr>
                    <td class="ps-4 fw-medium text-neutral-900 small">${row.code}</td>
                    <td class="text-neutral-400 small">${row.eventTitle}</td>
                    <td class="text-neutral-900 small fw-medium">${row.discountPercentage}%</td>
                    <td class="pe-4 text-end">
                        <div class="dropdown">
                            <button class="btn btn-sm btn-icon border-0 p-0 text-neutral-400 shadow-none" type="button" data-bs-toggle="dropdown">
                                <span style="font-size:1.2rem;font-weight:bold;line-height:1;">&#8942;</span>
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0 py-2" style="font-size:13px;min-width:140px;">
                                <li><button class="dropdown-item d-flex align-items-center gap-2 btn-edit-offer" data-event-id="${row.eventId}" data-code="${row.code}" data-discount="${row.discountPercentage}"><i data-lucide="edit-2" width="14"></i> Edit</button></li>
                                <li><hr class="dropdown-divider"></li>
                                <li><button class="dropdown-item d-flex align-items-center gap-2 text-danger btn-delete-offer" data-event-id="${row.eventId}" data-code="${row.code}"><i data-lucide="trash-2" width="14"></i> Delete</button></li>
                            </ul>
                        </div>
                    </td>
                </tr>
            `).join('');

            setupPagination(rows, itemsPerPage, 'offers-pagination', (items) => {
                tableBody.innerHTML = items.map((row) => `
                    <tr>
                        <td class="ps-4 fw-medium text-neutral-900 small">${row.code}</td>
                        <td class="text-neutral-400 small">${row.eventTitle}</td>
                        <td class="text-neutral-900 small fw-medium">${row.discountPercentage}%</td>
                        <td class="pe-4 text-end">
                            <div class="dropdown">
                                <button class="btn btn-sm btn-icon border-0 p-0 text-neutral-400 shadow-none" type="button" data-bs-toggle="dropdown">
                                    <span style="font-size:1.2rem;font-weight:bold;line-height:1;">&#8942;</span>
                                </button>
                                <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0 py-2" style="font-size:13px;min-width:140px;">
                                    <li><button class="dropdown-item d-flex align-items-center gap-2 btn-edit-offer" data-event-id="${row.eventId}" data-code="${row.code}" data-discount="${row.discountPercentage}"><i data-lucide="edit-2" width="14"></i> Edit</button></li>
                                    <li><hr class="dropdown-divider"></li>
                                    <li><button class="dropdown-item d-flex align-items-center gap-2 text-danger btn-delete-offer" data-event-id="${row.eventId}" data-code="${row.code}"><i data-lucide="trash-2" width="14"></i> Delete</button></li>
                                </ul>
                            </div>
                        </td>
                    </tr>
                `).join('');
                bindRowActions();
                if (window.initIcons) window.initIcons({ root: card });
            });
            return;
        }

        if (window.initIcons) window.initIcons({ root: card });
    };

    if (addBtn) addBtn.addEventListener('click', openForCreate);
    if (searchInput) searchInput.addEventListener('input', () => {
        currentPage = 1;
        render();
    });
    if (eventFilter) eventFilter.addEventListener('change', () => {
        currentPage = 1;
        render();
    });

    codeInput.addEventListener('input', () => {
        codeInput.value = codeInput.value.toUpperCase().replace(/\s+/g, '');
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const eventId = eventSelect.value;
        const code = codeInput.value.trim().toUpperCase();
        const discountPercentage = Number(discountInput.value);

        if (!eventId || !code || !(discountPercentage > 0 && discountPercentage <= 100)) return;

        const targetEvent = events.find((ev) => ev.id === eventId);
        if (!targetEvent || targetEvent.organizerId !== user.id || !isPublished(targetEvent)) {
            showToast('Error', 'You can create offers only for your published events.', 'danger');
            return;
        }

        const unique = validateUniqueForEvent(eventId, code);
        codeInput.classList.toggle('is-invalid', !unique);
        if (!unique) {
            if (codeFeedback) codeFeedback.textContent = 'Offer code already exists for this event.';
            return;
        }

        try {
            if (editing && (editing.eventId !== eventId || editing.code !== code)) {
                const oldEvent = events.find((ev) => ev.id === editing.eventId);
                if (oldEvent) {
                    const oldOffers = (oldEvent.pricing && Array.isArray(oldEvent.pricing.offers)) ? oldEvent.pricing.offers : [];
                    const cleaned = oldOffers.filter((o) => (o.code || '').toUpperCase() !== editing.code);
                    await apiPatch('events', oldEvent.id, { pricing: Object.assign({}, oldEvent.pricing, { offers: cleaned }) });
                    oldEvent.pricing = Object.assign({}, oldEvent.pricing, { offers: cleaned });
                }
            }

            const currentOffers = (targetEvent.pricing && Array.isArray(targetEvent.pricing.offers)) ? targetEvent.pricing.offers : [];
            const withoutCurrent = currentOffers.filter((o) => {
                if (!editing || editing.eventId !== eventId) return true;
                return (o.code || '').toUpperCase() !== editing.code;
            });
            const updatedOffers = [...withoutCurrent, { code, discountPercentage }];
            await apiPatch('events', eventId, { pricing: Object.assign({}, targetEvent.pricing, { offers: updatedOffers }) });
            targetEvent.pricing = Object.assign({}, targetEvent.pricing, { offers: updatedOffers });

            showToast('Saved', editing ? 'Offer updated successfully.' : 'Offer created successfully.', 'success');
            if (bsModal) bsModal.hide();
            resetForm();
            currentPage = 1;
            render();
        } catch (err) {
            showToast('Error', 'Failed to save offer.', 'danger');
        }
    });

    populateFilters();
    render();
}

export function initOrganizerPayments() {
    const user = getCurrentUser();
    if (!user) return;

    populateSidebarUserInfo();
    injectRegistrationModal();

    const myEvents = getOrganizerEvents(user);
    const allRegs = getEventRegistrations(myEvents);
    let filtered = [...allRegs];

    // Stats calculation
    const calcStats = (regs) => {
        const totalRevenue = regs.reduce((sum, r) => sum + (r.totalAmount || r.price), 0);
        
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayRevenue = regs
            .filter(r => new Date(r.createdAt || r.date) >= startOfDay)
            .reduce((sum, r) => sum + (r.totalAmount || r.price), 0);

        const confirmedCount = regs.filter(r => r.status === 'CONFIRMED' || r.status === 'PAID').length;
        const pendingCount = regs.filter(r => r.status === 'PENDING').length;

        const trEl = document.getElementById('totalRevenue');
        const drEl = document.getElementById('todayRevenue');
        const cpEl = document.getElementById('confirmedPayments');
        const ppEl = document.getElementById('pendingPayments');

        if (trEl) trEl.textContent = formatCurrency(totalRevenue);
        if (drEl) drEl.textContent = formatCurrency(todayRevenue);
        if (cpEl) cpEl.textContent = confirmedCount.toLocaleString('en-IN');
        if (ppEl) ppEl.textContent = pendingCount.toLocaleString('en-IN');
    };

    // Populate Event Filter
    const eventFilter = document.getElementById('eventFilter');
    if (eventFilter) {
        eventFilter.innerHTML = '<option value="">All Events</option>' +
            myEvents.map(e => `<option value="${e.id}">${e.title}</option>`).join('');
    }

    const renderTable = (regs) => {
        const tbody = document.querySelector('#paymentsTable tbody');
        if (!tbody) return;

        if (regs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-5 text-neutral-400">No payments found.</td></tr>';
            return;
        }

        tbody.innerHTML = regs.map(r => {
            const u = state.users.find(u => u.id === r.userId);
            const event = getEvent(r.eventId);
            const isPaid = r.status === 'CONFIRMED' || r.status === 'PAID';

            return `
            <tr>
                <td class="ps-4 fw-medium text-neutral-900">${event ? event.title : 'Event'}</td>
                <td>
                    <div class="fw-medium text-neutral-900">${u ? u.profile.fullName : 'Guest'}</div>
                    <div class="text-neutral-400 small">${u ? u.profile.email : '—'}</div>
                </td>
                <td class="fw-bold text-primary">${formatCurrency(r.totalAmount || r.price)}</td>
                <td class="text-neutral-400 small">${formatDate(r.createdAt || r.date)}</td>
                <td><span class="badge rounded-pill ${isPaid ? 'bg-success' : 'bg-warning'} px-3 py-2 fw-bold" style="font-size: 10px;">${r.status}</span></td>
                <td class="pe-4 text-end">
                    <button class="btn btn-sm text-primary p-0" title="View Details" onclick="viewRegistrationDetails('${r.id}')">
                        <i data-lucide="eye" width="16"></i>
                    </button>
                </td>
            </tr>`;
        }).join('');

        if (window.initIcons) window.initIcons({ root: tbody });
    };

    const applyFilters = () => {
        const eventId = eventFilter ? eventFilter.value : '';
        const q = document.getElementById('paymentSearch')?.value.toLowerCase() || '';

        const newFiltered = allRegs.filter(r => {
            const matchEvent = !eventId || r.eventId === eventId;
            const u = state.users.find(u => u.id === r.userId);
            const userEmail = u ? u.profile.email.toLowerCase() : '';
            const userName = u ? u.profile.fullName.toLowerCase() : '';
            const matchQ = !q || r.id.toLowerCase().includes(q) || userEmail.includes(q) || userName.includes(q);
            return matchEvent && matchQ;
        });
        filtered = newFiltered;
        setupPagination(filtered, 10, 'pagination-controls', renderTable);
        calcStats(filtered);
    };

    if (eventFilter) eventFilter.addEventListener('change', applyFilters);
    const searchInput = document.getElementById('paymentSearch');
    if (searchInput) searchInput.addEventListener('input', applyFilters);

    // Export CSV
    const exportBtn = document.getElementById('exportPaymentsBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const rows = [['Transaction ID', 'Event', 'Customer', 'Email', 'Amount', 'Date', 'Status']];
            filtered.forEach(r => {
                const u = state.users.find(u => u.id === r.userId);
                rows.push([
                    r.id,
                    getEvent(r.eventId)?.title || 'Event',
                    u ? u.profile.fullName : 'Guest',
                    u ? u.profile.email : '—',
                    r.totalAmount || r.price,
                    formatDate(r.createdAt || r.date),
                    r.status
                ]);
            });
            downloadCSV(rows, 'organizer-payments.csv');
            showToast('Exported', 'Payments data exported to CSV.', 'success');
        });
    }

    setupPagination(filtered, 10, 'pagination-controls', renderTable);
    calcStats(filtered);

    if (window.initIcons) window.initIcons();
}
