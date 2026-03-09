import { injectSignOutModal, populateSidebarUserInfo, showToast } from '../../shared/utils.js';

// ─────────────────────────────────────────────────────────────────────────────
// API BASE URL
// ─────────────────────────────────────────────────────────────────────────────
const API = 'http://localhost:3000';

function normalizeLegacyEventStatus(event) {
    if (!event || !event.status || typeof event.status !== 'object') return event;
    if (event.status.current === 'ACTIVE') event.status.current = 'APPROVED';
    if (Array.isArray(event.status.history)) {
        event.status.history = event.status.history.map((s) => s === 'ACTIVE' ? 'APPROVED' : s);
    }
    return event;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function fmt(date) {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtCurrency(amount) {
    if (amount == null) return '₹0';
    return '₹' + Number(amount).toLocaleString('en-IN');
}

function statusBadge(status) {
    const map = {
        DRAFT: 'background:#F1F5F9;color:#475569;',
        PENDING: 'background:#F1F5F9;color:#475569;',
        APPROVED: 'background:#ccfbf1;color:#0f766e;',
        PUBLISHED: 'background:#dcfce7;color:#16a34a;',
        REJECTED: 'background:#fee2e2;color:#dc2626;',
        CANCELLED: 'background:#fee2e2;color:#dc2626;',
        COMPLETED: 'background:#dcfce7;color:#16a34a;',
        INACTIVE: 'background:#F1F5F9;color:#475569;',
        SUSPENDED: 'background:#fff7ed;color:#c2410c;',
        CONFIRMED: 'background:#dcfce7;color:#16a34a;',
        REFUNDED: 'background:#ede9fe;color:#7c3aed;',
        PAID: 'background:#dcfce7;color:#16a34a;',
        UNPAID: 'background:#fee2e2;color:#dc2626;',
        DISABLED: 'background:#F1F5F9;color:#475569;',
    };

    // Handle status as object (e.g. { status: 'PENDING' } or { current: 'ACTIVE' })
    let s = 'UNKNOWN';
    if (typeof status === 'string') s = status;
    else if (status && typeof status === 'object') {
        s = status.status || status.current || status.name || 'UNKNOWN';
    }

    const display = (s || 'Unknown').toString();
    const key = display.toUpperCase();
    const style = map[key] || 'background:#F1F5F9;color:#475569;';
    return `<span class="badge rounded-pill px-3 py-2 fw-medium" style="font-size:11px;${style}">${display}</span>`;
}

function emptyRow(colspan, message) {
    const msg = message || 'No records found.';
    return `<tr><td colspan="${colspan}" class="text-center py-5 text-neutral-400">
        <i data-lucide="inbox" width="32" height="32" class="mb-2 d-block mx-auto"></i>
        <p class="mb-0">${msg}</p>
    </td></tr>`;
}

async function apiFetch(endpoint) {
    try {
        const res = await fetch(`${API}/${endpoint}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (endpoint === 'events') {
            if (Array.isArray(data)) return data.map(normalizeLegacyEventStatus);
            return normalizeLegacyEventStatus(data);
        }
        return data;
    } catch (err) {
        console.error(`Failed to fetch ${endpoint}:`, err);
        return [];
    }
}

async function apiPatch(endpoint, id, body) {
    const res = await fetch(`${API}/${endpoint}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

async function apiPost(endpoint, body) {
    const res = await fetch(`${API}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

async function apiDelete(endpoint, id) {
    const res = await fetch(`${API}/${endpoint}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
}

function buildEventStatus(event, nextStatus, extra = {}) {
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

async function updateEventStatus(event, nextStatus, extra = {}) {
    const status = buildEventStatus(event, nextStatus, extra);
    await apiPatch('events', event.id, { status });
    event.status = status;
}

async function notifyOrganizerForEvent(event, title, message, type) {
    const targetUserId = event.organizerId || event.organizer?.id || '';
    if (!targetUserId) return;
    await apiPost('notifications', {
        id: `notif-${Date.now()}`,
        title,
        message,
        type: type || 'INFO',
        targetRole: 'ORGANIZER',
        targetUserId,
        read: false,
        createdAt: new Date().toISOString()
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIRMATION MODAL HELPER
// ─────────────────────────────────────────────────────────────────────────────
function showConfirmModal(opts) {
    const title = opts.title || 'Confirm';
    const message = opts.message || '';
    const confirmLabel = opts.confirmLabel || 'Confirm';
    const confirmClass = opts.confirmClass || 'btn-primary';
    const onConfirm = opts.onConfirm || (() => { });
    const extraHtml = opts.extraHtml || '';

    document.getElementById('_adminConfirmModal')?.remove();

    const html = `
    <div class="modal fade" id="_adminConfirmModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content border-0 shadow-lg" style="border-radius:1rem;">
                <div class="modal-body p-4">
                    <h5 class="fw-bold mb-2">${title}</h5>
                    <p class="text-neutral-400 small mb-3">${message}</p>
                    ${extraHtml}
                    <div class="d-flex justify-content-end gap-2 mt-4">
                        <button type="button" class="btn btn-outline-secondary rounded-pill px-4" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn ${confirmClass} rounded-pill px-4 fw-medium" id="_adminConfirmBtn">${confirmLabel}</button>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const modal = new bootstrap.Modal(document.getElementById('_adminConfirmModal'));
    modal.show();
    document.getElementById('_adminConfirmBtn').onclick = function () {
        modal.hide();
        onConfirm();
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGINATION HELPER
// ─────────────────────────────────────────────────────────────────────────────
function renderPagination(containerId, totalItems, itemsPerPage, currentPage, onPageChange) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    container.className = 'd-flex justify-content-center align-items-center gap-2 mt-4';

    let html = `<button class="pagination-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}><i data-lucide="chevron-left" width="16" height="16"></i></button>`;

    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }

    html += `<button class="pagination-btn" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}><i data-lucide="chevron-right" width="16" height="16"></i></button>`;

    container.innerHTML = html;
    if (window.initIcons) window.initIcons({ root: container });

    container.querySelectorAll('.pagination-btn').forEach(btn => {
        btn.onclick = () => {
            const p = parseInt(btn.dataset.page);
            if (p && p !== currentPage && p > 0 && p <= totalPages) {
                onPageChange(p);
            }
        };
    });
}

function showTableLoading(tbody, colspan) {
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="text-center py-5">
        <div class="spinner-border text-primary spinner-border-sm mb-2" role="status"></div>
        <p class="text-neutral-400 small mb-0">Loading data...</p>
    </td></tr>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL ADMIN INITIALIZATION
// ─────────────────────────────────────────────────────────────────────────────
export function initAdminPage() {
    injectSignOutModal();
    populateSidebarUserInfo();

    const pendingBadge = document.getElementById('pending-org-count');
    if (pendingBadge) {
        fetch(`${API}/users`)
            .then(function (r) { return r.json(); })
            .then(function (users) {
                const count = users.filter(function (u) {
                    return u.role && u.role.name === 'ORGANIZER' &&
                        u.accountStatus && u.accountStatus.status === 'PENDING';
                }).length;
                pendingBadge.textContent = count;
                pendingBadge.style.display = count > 0 ? 'inline-block' : 'none';
            })
            .catch(function () {
                pendingBadge.style.display = 'none';
            });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
export async function initAdminDashboard() {
    const statsContainer = document.querySelector('.row.g-4.mb-5');
    const activityList = document.querySelector('.list-group');
    const tbody = document.querySelector('.table tbody');
    const colspan = 6;

    if (tbody) showTableLoading(tbody, colspan);

    const [events, users, payments] = await Promise.all([
        apiFetch('events'), apiFetch('users'), apiFetch('payments')
    ]);

    // Stat Cards
    if (statsContainer) {
        const paidPayments = payments.filter(p => p.status === 'CONFIRMED');
        const revenue = paidPayments.reduce((s, p) => s + (p.amount || 0), 0);
        const activeOrgs = users.filter(u => u.role && u.role.name === 'ORGANIZER' && u.accountStatus && u.accountStatus.status === 'ACTIVE');

        const setVal = (label, val) => {
            document.querySelectorAll('.card-custom').forEach(card => {
                const l = card.querySelector('.text-neutral-400.small.fw-medium');
                if (l && l.innerText.includes(label)) {
                    const h2 = card.querySelector('.h2');
                    if (h2) h2.innerText = val;
                }
            });
        };

        setVal('Total Users', users.length.toLocaleString('en-IN'));
        setVal('Total Organizers', activeOrgs.length.toLocaleString('en-IN'));
        setVal('Total Events', events.length.toLocaleString('en-IN'));
        setVal('Total Revenue', fmtCurrency(revenue));
    }

    // Recent Activity
    if (activityList) {
        const recent = [...events].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
        activityList.innerHTML = recent.map(ev => {
            const statusStr = (ev.status && ev.status.current) || 'Draft';
            return `<div class="list-group-item border-0 px-0 py-3">
                <div class="d-flex align-items-center gap-3">
                    <div class="bg-neutral-100 rounded-3 p-2 text-neutral-600"><i data-lucide="calendar" width="20"></i></div>
                    <div class="flex-grow-1">
                        <div class="fw-medium text-neutral-900 small">${ev.title || ev.name}</div>
                        <div class="text-neutral-400" style="font-size:11px;">${statusStr} • ${fmt(ev.createdAt)}</div>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    // Pending Approvals
    if (tbody) {
        const pending = events.filter(e => e.status && e.status.current === 'PENDING').slice(0, 5);
        if (pending.length === 0) {
            tbody.innerHTML = emptyRow(colspan, 'No pending event approvals.');
        } else {
            tbody.innerHTML = pending.map(ev => {
                const org = users.find(u => u.id === ev.organizerId);
                const orgName = (org && org.profile && org.profile.fullName) || 'Unknown';
                const evName = ev.title || ev.name || 'Untitled';
                return `<tr>
                    <td class="ps-4 fw-medium text-neutral-900">${evName}</td>
                    <td class="text-neutral-400 small">${orgName}</td>
                    <td class="text-neutral-400 small">${fmt(ev.createdAt)}</td>
                    <td class="text-neutral-400 small">${fmt(ev.schedule ? ev.schedule.startDateTime : null)}</td>
                    <td>${statusBadge('PENDING')}</td>
                    <td class="pe-4 text-end">
                        <div class="dropdown">
                            <button class="btn btn-sm btn-icon border-0 p-0 text-neutral-400 shadow-none" type="button" data-bs-toggle="dropdown">
                                <span style="font-size: 1.2rem; font-weight: bold; line-height: 1;">&#8942;</span>
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0 py-2" style="font-size:13px;min-width:140px;">
                                <li><button class="dropdown-item d-flex align-items-center gap-2 text-success btn-approve-dash" data-id="${ev.id}" data-org-id="${ev.organizerId || ''}" data-name="${evName.replace(/"/g, '&quot;')}"><i data-lucide="check-circle" width="14"></i> Approve</button></li>
                                <li><button class="dropdown-item d-flex align-items-center gap-2 text-danger btn-reject-dash" data-id="${ev.id}" data-org-id="${ev.organizerId || ''}" data-name="${evName.replace(/"/g, '&quot;')}"><i data-lucide="x-circle" width="14"></i> Reject</button></li>
                            </ul>
                        </div>
                    </td>
                </tr>`;
            }).join('');

            tbody.querySelectorAll('.btn-approve-dash').forEach(btn => {
                btn.onclick = () => {
                    showConfirmModal({
                        title: 'Approve Event', message: `Approve "${btn.dataset.name}"?`,
                        confirmLabel: 'Approve', confirmClass: 'btn-success',
                        onConfirm: async () => {
                            try {
                                const event = events.find(e => e.id === btn.dataset.id);
                                if (!event) throw new Error('Event not found');
                                await updateEventStatus(event, 'APPROVED');
                                await notifyOrganizerForEvent(event, 'Event Approved', `Your event "${btn.dataset.name}" has been approved.`, 'SUCCESS');
                                showToast('Approved', 'Event is now approved.', 'success');
                                initAdminDashboard();
                            } catch (e) { showToast('Error', 'Failed.', 'danger'); }
                        }
                    });
                };
            });
            tbody.querySelectorAll('.btn-reject-dash').forEach(btn => {
                btn.onclick = () => {
                    showConfirmModal({
                        title: 'Reject Event', message: `Reject "${btn.dataset.name}"?`,
                        confirmLabel: 'Reject', confirmClass: 'btn-danger',
                        extraHtml: '<textarea class="form-control mt-2" id="_rejectReason" rows="3" placeholder="Rejection reason..."></textarea>',
                        onConfirm: async () => {
                            try {
                                const reason = document.getElementById('_rejectReason')?.value?.trim() || '';
                                const event = events.find(e => e.id === btn.dataset.id);
                                if (!event) throw new Error('Event not found');
                                await updateEventStatus(event, 'REJECTED', { reason });
                                await notifyOrganizerForEvent(
                                    event,
                                    'Event Rejected',
                                    `Your event "${btn.dataset.name}" has been rejected.${reason ? ` Reason: ${reason}` : ''}`,
                                    'DANGER'
                                );
                                showToast('Rejected', 'Event application rejected.', 'warning');
                                initAdminDashboard();
                            } catch (e) { showToast('Error', 'Failed.', 'danger'); }
                        }
                    });
                };
            });
        }
    }
    if (window.initIcons) window.initIcons({ root: document.body });
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT APPROVALS
// ─────────────────────────────────────────────────────────────────────────────
export async function initEventApprovals() {
    const tbody = document.querySelector('.table tbody');
    const colspan = 6;
    if (tbody) showTableLoading(tbody, colspan);

    const [events, categories] = await Promise.all([apiFetch('events'), apiFetch('categories')]);
    const searchInput = document.querySelector('.form-control[placeholder="Search events..."]');

    function render(list) {
        if (!tbody) return;
        const pending = list.filter(e => e.status && e.status.current === 'PENDING');
        if (pending.length === 0) {
            tbody.innerHTML = emptyRow(colspan, 'No pending event approvals found.');
        } else {
            tbody.innerHTML = pending.map(ev => {
                const orgName = (ev.organizer && ev.organizer.name) || 'Unknown';
                const category = categories.find((c) => c.id === ev.categoryId);
                const evName = ev.title || ev.name || 'Untitled';
                return `<tr>
                    <td class="ps-4 fw-medium text-neutral-900">${evName}</td>
                    <td class="text-neutral-400 small">${orgName}</td>
                    <td class="text-neutral-400 small">${(category && category.name) || (ev.category && ev.category.name) || '—'}</td>
                    <td class="text-neutral-400 small">${fmt(ev.createdAt)}</td>
                    <td class="text-neutral-400 small">${fmt(ev.schedule ? ev.schedule.startDateTime : null)}</td>
                    <td>${statusBadge('PENDING')}</td>
                    <td class="pe-4 text-end">
                        <div class="dropdown">
                            <button class="btn btn-sm btn-icon border-0 p-0 text-neutral-400 shadow-none" type="button" data-bs-toggle="dropdown">
                                <span style="font-size: 1.2rem; font-weight: bold; line-height: 1;">&#8942;</span>
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0 py-2" style="font-size:13px;min-width:140px;">
                                <li><button class="dropdown-item d-flex align-items-center gap-2 text-success btn-approve-event" data-id="${ev.id}" data-org-id="${ev.organizer?.id || ''}" data-name="${evName.replace(/"/g, '&quot;')}"><i data-lucide="check-circle" width="14"></i> Approve</button></li>
                                <li><button class="dropdown-item d-flex align-items-center gap-2 text-danger btn-reject-event" data-id="${ev.id}" data-org-id="${ev.organizer?.id || ''}" data-name="${evName.replace(/"/g, '&quot;')}"><i data-lucide="x-circle" width="14"></i> Reject</button></li>
                            </ul>
                        </div>
                    </td>
                </tr>`;
            }).join('');

            tbody.querySelectorAll('.btn-approve-event').forEach(btn => {
                btn.onclick = async () => {
                    try {
                        const event = events.find(e => e.id === btn.dataset.id);
                        if (!event) throw new Error('Event not found');
                        await updateEventStatus(event, 'APPROVED');
                        await notifyOrganizerForEvent(event, 'Event Approved', `Your event "${btn.dataset.name}" has been approved.`, 'SUCCESS');
                        showToast('Approved', 'Event approved.', 'success');
                        initEventApprovals();
                    } catch (e) { showToast('Error', 'Failed.', 'danger'); }
                };
            });
            tbody.querySelectorAll('.btn-reject-event').forEach(btn => {
                btn.onclick = async () => {
                    showConfirmModal({
                        title: 'Reject Event', message: `Reject "${btn.dataset.name}"?`,
                        confirmLabel: 'Reject', confirmClass: 'btn-danger',
                        extraHtml: '<textarea class="form-control mt-2" id="_rejectReason" rows="3" placeholder="Rejection reason..."></textarea>',
                        onConfirm: async () => {
                            try {
                                const reason = document.getElementById('_rejectReason')?.value?.trim() || '';
                                const event = events.find(e => e.id === btn.dataset.id);
                                if (!event) throw new Error('Event not found');
                                await updateEventStatus(event, 'REJECTED', { reason });
                                await notifyOrganizerForEvent(
                                    event,
                                    'Event Rejected',
                                    `Your event "${btn.dataset.name}" has been rejected.${reason ? ` Reason: ${reason}` : ''}`,
                                    'DANGER'
                                );
                                showToast('Rejected', 'Event rejected.', 'warning');
                                initEventApprovals();
                            } catch (e) { showToast('Error', 'Failed.', 'danger'); }
                        }
                    });
                };
            });
        }
        if (window.initIcons) window.initIcons({ root: tbody });
    }

    function applyFilters() {
        const search = (searchInput ? searchInput.value : '').toLowerCase();
        const filtered = events.filter(e => (e.title || e.name || '').toLowerCase().includes(search));
        render(filtered);
    }
    if (searchInput) searchInput.addEventListener('input', applyFilters);
    render(events);
}

// ─────────────────────────────────────────────────────────────────────────────
// ORGANIZER APPROVALS
// ─────────────────────────────────────────────────────────────────────────────
export async function initOrganizerApprovals() {
    const tbody = document.getElementById('approvalList');
    if (!tbody) return;
    const colspan = 6;
    showTableLoading(tbody, colspan);

    const users = await apiFetch('users');
    const pendingOrgs = users.filter(u => u.role && u.role.name === 'ORGANIZER' && u.accountStatus && u.accountStatus.status === 'PENDING');

    function render(list) {
        if (list.length === 0) {
            tbody.innerHTML = emptyRow(colspan, 'No pending organizer applications.');
            return;
        }
        tbody.innerHTML = list.map(org => {
            const name = (org.profile && org.profile.fullName) || '—';
            const orgName = (org.profile && org.profile.organizationName) || 'N/A';
            const email = (org.profile && org.profile.email) || org.email || '—';
            return `<tr>
                <td class="ps-4 fw-medium text-neutral-900">${orgName}</td>
                <td class="text-neutral-900 fw-medium">${name}</td>
                <td class="text-neutral-400 small">${email}</td>
                <td>${statusBadge('PENDING')}</td>
                <td class="text-neutral-400 small text-end pe-5">${fmt(org.accountStatus && org.accountStatus.createdAt)}</td>
                    <td class="pe-4 text-end">
                        <div class="dropdown">
                            <button class="btn btn-sm btn-icon border-0 p-0 text-neutral-400 shadow-none" type="button" data-bs-toggle="dropdown">
                                <span style="font-size: 1.2rem; font-weight: bold; line-height: 1;">&#8942;</span>
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0 py-2" style="font-size:13px;min-width:140px;">
                                <li><button class="dropdown-item d-flex align-items-center gap-2 btn-view-org" data-id="${org.id}"><i data-lucide="eye" width="14"></i> View Details</button></li>
                                <li><hr class="dropdown-divider"></li>
                                <li><button class="dropdown-item d-flex align-items-center gap-2 text-success btn-approve-org" data-id="${org.id}" data-name="${name.replace(/"/g, '&quot;')}"><i data-lucide="check-circle" width="14"></i> Approve</button></li>
                                <li><button class="dropdown-item d-flex align-items-center gap-2 text-danger btn-reject-org" data-id="${org.id}" data-name="${name.replace(/"/g, '&quot;')}"><i data-lucide="x-circle" width="14"></i> Reject</button></li>
                            </ul>
                        </div>
                    </td>
            </tr>`;
        }).join('');
        if (window.initIcons) window.initIcons({ root: tbody });
        bindOrgActions(list);
    }

    function bindOrgActions(list) {
        tbody.querySelectorAll('.btn-approve-org').forEach(btn => {
            btn.onclick = () => {
                showConfirmModal({
                    title: 'Approve Organizer', message: `Approve "${btn.dataset.name}"?`,
                    confirmLabel: 'Approve', confirmClass: 'btn-success',
                    onConfirm: async () => {
                        try {
                            await apiPatch('users', btn.dataset.id, { accountStatus: { status: 'ACTIVE' } });
                            showToast('Approved', 'Organizer application approved.', 'success');
                            initOrganizerApprovals();
                        } catch (e) { showToast('Error', 'Failed.', 'danger'); }
                    }
                });
            };
        });
        tbody.querySelectorAll('.btn-reject-org').forEach(btn => {
            btn.onclick = () => {
                showConfirmModal({
                    title: 'Reject Application', message: `Reject "${btn.dataset.name}"?`,
                    confirmLabel: 'Reject', confirmClass: 'btn-danger',
                    onConfirm: async () => {
                        try {
                            await apiPatch('users', btn.dataset.id, { accountStatus: { status: 'REJECTED' } });
                            showToast('Rejected', 'Application rejected.', 'warning');
                            initOrganizerApprovals();
                        } catch (e) { showToast('Error', 'Failed.', 'danger'); }
                    }
                });
            };
        });
        tbody.querySelectorAll('.btn-view-org').forEach(btn => {
            btn.onclick = () => {
                const org = list.find(u => u.id === btn.dataset.id);
                if (org) showOrganizerDetailsModal(org);
            };
        });
    }

    render(pendingOrgs);

    // Wire global modal buttons if they exist
    const modalApprove = document.getElementById('approveBtn');
    const modalReject = document.getElementById('rejectBtn');
    if (modalApprove) {
        modalApprove.onclick = () => {
            const id = modalApprove.dataset.targetId;
            const btn = tbody.querySelector(`.btn-approve-org[data-id="${id}"]`);
            if (btn) btn.click();
            const modal = bootstrap.Modal.getInstance(document.getElementById('requestDetailsModal'));
            if (modal) modal.hide();
        };
    }
    if (modalReject) {
        modalReject.onclick = () => {
            const id = modalReject.dataset.targetId;
            const btn = tbody.querySelector(`.btn-reject-org[data-id="${id}"]`);
            if (btn) btn.click();
            const modal = bootstrap.Modal.getInstance(document.getElementById('requestDetailsModal'));
            if (modal) modal.hide();
        };
    }
}

function showOrganizerDetailsModal(org) {
    const modalEl = document.getElementById('requestDetailsModal');
    const body = document.getElementById('modal-content-body');
    const approveBtn = document.getElementById('approveBtn');
    const rejectBtn = document.getElementById('rejectBtn');
    if (!modalEl || !body) return;

    const name = (org.profile && org.profile.fullName) || 'Unknown';
    const initials = name.split(' ').map(function (n) { return n[0]; }).join('').substring(0, 2).toUpperCase();
    body.innerHTML = `
        <div class="p-4">
            <div class="d-flex align-items-center gap-3 mb-4">
                <div class="avatar-circle flex-shrink-0" style="font-size:1.1rem;">${initials}</div>
                <div>
                    <h5 class="mb-0 fw-bold">${name}</h5>
                    <div class="text-neutral-400 small">${(org.profile && org.profile.email) || org.email || '—'}</div>
                </div>
            </div>
            <div class="row g-3">
                <div class="col-6"><div class="text-neutral-400 small">Organization</div><div class="fw-medium">${(org.profile && org.profile.organizationName) || '—'}</div></div>
                <div class="col-6"><div class="text-neutral-400 small">Phone</div><div class="fw-medium">${(org.profile && org.profile.phone) || '—'}</div></div>
                <div class="col-6"><div class="text-neutral-400 small">Type</div><div class="fw-medium">${(org.profile && org.profile.organizationType) || '—'}</div></div>
                <div class="col-6"><div class="text-neutral-400 small">Applied</div><div class="fw-medium">${fmt(org.accountStatus && org.accountStatus.createdAt)}</div></div>
                ${org.profile && org.profile.bio ? `<div class="col-12"><div class="text-neutral-400 small">Bio</div><div class="small">${org.profile.bio}</div></div>` : ''}
            </div>
        </div>`;
    if (approveBtn) approveBtn.dataset.targetId = org.id;
    if (rejectBtn) rejectBtn.dataset.targetId = org.id;
    new bootstrap.Modal(modalEl).show();
}

// ─────────────────────────────────────────────────────────────────────────────
// USER MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────
export async function initUserManagement() {
    const tbody = document.querySelector('.table tbody');
    const container = document.getElementById('admin-users-card');
    const colspan = 7;

    // Loading state
    showTableLoading(tbody, colspan);

    let users = await apiFetch('users');
    const searchInput = document.querySelector('.form-control[placeholder="Search by name or email..."]');
    const selects = document.querySelectorAll('.form-select');
    const roleSelect = selects[0], statusSelect = selects[1];

    let currentPage = 1;
    const itemsPerPage = 8;
    let filteredUsers = users;

    // Ensure pagination container exists
    let pagContainer = document.getElementById('users-pagination');
    if (!pagContainer && container) {
        pagContainer = document.createElement('div');
        pagContainer.id = 'users-pagination';
        container.after(pagContainer);
    }

    function render() {
        if (!tbody) return;

        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const pageItems = filteredUsers.slice(start, end);

        if (filteredUsers.length === 0) {
            tbody.innerHTML = emptyRow(colspan, 'No users found.');
            if (pagContainer) pagContainer.innerHTML = '';
        } else {
            tbody.innerHTML = pageItems.map(function (u) {
                const name = (u.profile && u.profile.fullName) || u.name || '—';
                const email = (u.profile && u.profile.email) || u.email || '—';
                const role = (u.role && u.role.name) || '—';
                const status = (u.accountStatus && u.accountStatus.status) || 'ACTIVE';
                const initials = name.split(' ').map(function (n) { return n[0]; }).join('').substring(0, 2).toUpperCase();
                const totalEvents = (u.statistics && u.statistics.eventsCreated) || 0;
                const isActive = status === 'ACTIVE' || status === 'APPROVED';

                return `<tr>
                    <td class="ps-4">
                        <div class="d-flex align-items-center gap-2">
                            <span class="avatar-circle flex-shrink-0" style="width:32px;height:32px;font-size:0.75rem;">${initials}</span>
                            <span class="fw-medium text-neutral-900 small">${name}</span>
                        </div>
                    </td>
                    <td class="text-neutral-400 small">${email}</td>
                    <td class="text-neutral-400 small">${role}</td>
                    <td>${statusBadge(status)}</td>
                    <td class="text-neutral-400 small">${fmt(u.accountStatus && u.accountStatus.createdAt)}</td>
                    <td class="text-neutral-900 small">${totalEvents}</td>
                    <td class="pe-4 text-end">
                        <div class="dropdown">
                            <button class="btn btn-sm btn-icon border-0 p-0 text-neutral-400 shadow-none" type="button" data-bs-toggle="dropdown">
                                <span style="font-size: 1.2rem; font-weight: bold; line-height: 1;">&#8942;</span>
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0 py-2" style="font-size:13px;min-width:160px;">
                                ${isActive
                        ? `<li><button class="dropdown-item d-flex align-items-center gap-2 text-warning btn-suspend-user" data-id="${u.id}" data-name="${name.replace(/"/g, '&quot;')}"><i data-lucide="pause-circle" width="14"></i> Suspend</button></li>`
                        : `<li><button class="dropdown-item d-flex align-items-center gap-2 text-success btn-activate-user" data-id="${u.id}" data-name="${name.replace(/"/g, '&quot;')}"><i data-lucide="check-circle" width="14"></i> Activate</button></li>`
                    }
                                <li><hr class="dropdown-divider"></li>
                                <li><button class="dropdown-item d-flex align-items-center gap-2 text-danger btn-delete-user" data-id="${u.id}" data-name="${name.replace(/"/g, '&quot;')}"><i data-lucide="trash-2" width="14"></i> Delete User</button></li>
                            </ul>
                        </div>
                    </td>
                </tr>`;
            }).join('');

            renderPagination('users-pagination', filteredUsers.length, itemsPerPage, currentPage, (p) => {
                currentPage = p;
                render();
            });
        }
        if (window.initIcons) window.initIcons({ root: tbody });
        bindUserActions(tbody, users, applyFilters);
    }

    function applyFilters() {
        const search = (searchInput ? searchInput.value : '').toLowerCase();
        const role = roleSelect ? roleSelect.value : 'All Roles';
        const status = statusSelect ? statusSelect.value : 'All Status';

        filteredUsers = users.filter(function (u) {
            const name = ((u.profile && u.profile.fullName) || u.name || '').toLowerCase();
            const email = ((u.profile && u.profile.email) || u.email || '').toLowerCase();
            const matchSearch = !search || name.includes(search) || email.includes(search);
            const matchRole = role === 'All Roles' || ((u.role && u.role.name) || '').toLowerCase() === role.toLowerCase();
            const matchStatus = status === 'All Status' || ((u.accountStatus && u.accountStatus.status) || '').toLowerCase() === status.toLowerCase();
            return matchSearch && matchRole && matchStatus;
        });

        currentPage = 1;
        render();
    }

    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (roleSelect) roleSelect.addEventListener('change', applyFilters);
    if (statusSelect) statusSelect.addEventListener('change', applyFilters);

    render();
}

function bindUserActions(tbody, users, applyFilters) {
    tbody.querySelectorAll('.btn-suspend-user').forEach(function (btn) {
        btn.addEventListener('click', function () {
            showConfirmModal({
                title: 'Suspend User', message: `Suspend "${btn.dataset.name}"?`,
                confirmLabel: 'Suspend', confirmClass: 'btn-warning',
                onConfirm: async function () {
                    try {
                        await apiPatch('users', btn.dataset.id, { accountStatus: { status: 'SUSPENDED' } });
                        const u = users.find(function (u) { return u.id === btn.dataset.id; });
                        if (u) u.accountStatus = Object.assign({}, u.accountStatus, { status: 'SUSPENDED' });
                        showToast('Done', `"${btn.dataset.name}" suspended.`, 'warning');
                        applyFilters();
                    } catch (e) { showToast('Error', 'Failed.', 'danger'); }
                }
            });
        });
    });
    tbody.querySelectorAll('.btn-activate-user').forEach(function (btn) {
        btn.addEventListener('click', async function () {
            try {
                await apiPatch('users', btn.dataset.id, { accountStatus: { status: 'ACTIVE' } });
                const u = users.find(function (u) { return u.id === btn.dataset.id; });
                if (u) u.accountStatus = Object.assign({}, u.accountStatus, { status: 'ACTIVE' });
                showToast('Success', `"${btn.dataset.name}" activated.`, 'success');
                applyFilters();
            } catch (e) { showToast('Error', 'Failed.', 'danger'); }
        });
    });
    tbody.querySelectorAll('.btn-delete-user').forEach(function (btn) {
        btn.addEventListener('click', function () {
            showConfirmModal({
                title: 'Delete User', message: `Permanently delete "${btn.dataset.name}"?`,
                confirmLabel: 'Delete', confirmClass: 'btn-danger',
                onConfirm: async function () {
                    try {
                        await apiDelete('users', btn.dataset.id);
                        const idx = users.findIndex(function (u) { return u.id === btn.dataset.id; });
                        if (idx > -1) users.splice(idx, 1);
                        showToast('Deleted', `"${btn.dataset.name}" deleted.`, 'danger');
                        applyFilters();
                    } catch (e) { showToast('Error', 'Failed.', 'danger'); }
                }
            });
        });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// ALL EVENTS (events.html - admin view)
// ─────────────────────────────────────────────────────────────────────────────
export async function initAdminEvents() {
    const tbody = document.querySelector('.table tbody');
    const container = document.getElementById('admin-events-card');
    const colspan = 7;

    showTableLoading(tbody, colspan);

    const [events, users, categories, venues] = await Promise.all([
        apiFetch('events'), apiFetch('users'), apiFetch('categories'), apiFetch('venues')
    ]);
    const searchInput = document.querySelector('.form-control[placeholder="Search by event name..."]');
    const statusSelect = document.querySelector('.form-select');

    let currentPage = 1;
    const itemsPerPage = 8;
    let filteredEvents = events;

    let pagContainer = document.getElementById('events-pagination');
    if (!pagContainer && container) {
        pagContainer = document.createElement('div');
        pagContainer.id = 'events-pagination';
        container.after(pagContainer);
    }

    function render() {
        if (!tbody) return;
        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const pageItems = filteredEvents.slice(start, end);

        if (filteredEvents.length === 0) {
            tbody.innerHTML = emptyRow(colspan, 'No events found.');
            if (pagContainer) pagContainer.innerHTML = '';
        } else {
            tbody.innerHTML = pageItems.map(function (ev) {
                const org = users.find(u => u.id === ev.organizerId);
                const orgName = (org && org.profile && org.profile.fullName) || 'Unknown';
                const category = categories.find(c => c.id === ev.categoryId);
                const catName = category ? category.name : '—';
                const venue = venues.find(v => v.id === ev.venueId);
                const locName = venue ? venue.name : '—';
                const evTitle = ev.title || ev.name || 'Untitled';
                return `<tr>
                    <td class="ps-4 fw-medium text-neutral-900">${evTitle}</td>
                    <td class="text-neutral-400 small">${orgName}</td>
                    <td class="text-neutral-400 small">${catName}</td>
                    <td class="text-neutral-400 small">${fmt(ev.schedule ? ev.schedule.startDateTime : null)}</td>
                    <td class="text-neutral-400 small">${locName}</td>
                    <td>${statusBadge(ev.status)}</td>
                    <td class="pe-4 text-end">
                        <div class="dropdown">
                            <button class="btn btn-sm btn-icon border-0 p-0 text-neutral-400 shadow-none" type="button" data-bs-toggle="dropdown">
                                <span style="font-size: 1.2rem; font-weight: bold; line-height: 1;">&#8942;</span>
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0 py-2" style="font-size:13px;min-width:160px;">
                                <li><a class="dropdown-item d-flex align-items-center gap-2" href="#"><i data-lucide="eye" width="14"></i> View Event</a></li>
                                ${ev.status?.current === 'PENDING' ? `
                                    <li><button class="dropdown-item d-flex align-items-center gap-2 btn-status-change" data-id="${ev.id}" data-next="APPROVED">
                                        <i data-lucide="check-circle" width="14" class="text-success"></i> Approve
                                    </button></li>
                                    <li><button class="dropdown-item d-flex align-items-center gap-2 btn-status-change text-warning" data-id="${ev.id}" data-next="REJECTED">
                                        <i data-lucide="x-circle" width="14"></i> Reject
                                    </button></li>
                                ` : ev.status?.current === 'APPROVED' ? `
                                    <li><button class="dropdown-item d-flex align-items-center gap-2 btn-status-change text-danger" data-id="${ev.id}" data-next="CANCELLED">
                                        <i data-lucide="slash" width="14"></i> Cancel Event
                                    </button></li>
                                ` : ev.status?.current === 'PUBLISHED' ? `
                                    <li><button class="dropdown-item d-flex align-items-center gap-2 btn-status-change" data-id="${ev.id}" data-next="COMPLETED">
                                        <i data-lucide="check-check" width="14" class="text-success"></i> Mark Completed
                                    </button></li>
                                    <li><button class="dropdown-item d-flex align-items-center gap-2 btn-status-change text-danger" data-id="${ev.id}" data-next="CANCELLED">
                                        <i data-lucide="slash" width="14"></i> Cancel Event
                                    </button></li>
                                ` : ''}
                                <li><hr class="dropdown-divider"></li>
                                <li><button class="dropdown-item d-flex align-items-center gap-2 text-danger btn-delete-event" data-id="${ev.id}" data-name="${evTitle.replace(/"/g, '&quot;')}"><i data-lucide="trash-2" width="14"></i> Delete</button></li>
                            </ul>
                        </div>
                    </td>
                </tr>`;
            }).join('');

            renderPagination('events-pagination', filteredEvents.length, itemsPerPage, currentPage, (p) => {
                currentPage = p;
                render();
            });
        }
        if (window.initIcons) window.initIcons({ root: tbody });
        bindEventsActions(tbody, events, applyFilters);
    }

    function applyFilters() {
        const search = (searchInput ? searchInput.value : '').toLowerCase();
        const status = statusSelect ? statusSelect.value : 'All Status';
        filteredEvents = events.filter(function (ev) {
            const name = (ev.title || ev.name || '').toLowerCase();
            const matchSearch = !search || name.includes(search);
            const currentStatus = (ev.status && ev.status.current) || '';
            const normalized = currentStatus.toLowerCase();
            const statusFilter = status.toLowerCase();
            const matchStatus = status === 'All Status' ||
                (statusFilter === 'completed' && normalized === 'completed') ||
                (statusFilter === 'cancelled' && normalized === 'cancelled') ||
                normalized === statusFilter;
            return matchSearch && matchStatus;
        });
        currentPage = 1;
        render();
    }

    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (statusSelect) statusSelect.addEventListener('change', applyFilters);
    render();
}

function bindEventsActions(tbody, events, applyFilters) {
    tbody.querySelectorAll('.btn-status-change').forEach(function (btn) {
        btn.addEventListener('click', async function () {
            const id = btn.dataset.id;
            const next = btn.dataset.next;
            const ev = events.find(function (e) { return e.id === id; });
            if (!ev) return;

            if (next === 'REJECTED') {
                showConfirmModal({
                    title: 'Reject Event',
                    message: `Reject "${ev.title || ev.name || 'this event'}"?`,
                    confirmLabel: 'Reject',
                    confirmClass: 'btn-danger',
                    extraHtml: '<textarea class="form-control mt-2" id="_rejectReason" rows="3" placeholder="Rejection reason..."></textarea>',
                    onConfirm: async function () {
                        try {
                            const reason = document.getElementById('_rejectReason')?.value?.trim() || '';
                            await updateEventStatus(ev, 'REJECTED', { reason });
                            await notifyOrganizerForEvent(
                                ev,
                                'Event Rejected',
                                `Your event "${ev.title || ev.name || ev.id}" has been rejected.${reason ? ` Reason: ${reason}` : ''}`,
                                'DANGER'
                            );
                            showToast('Success', 'Event status set to REJECTED.', 'success');
                            applyFilters();
                        } catch (e) { showToast('Error', 'Failed to update status.', 'danger'); }
                    }
                });
                return;
            }

            try {
                await updateEventStatus(ev, next);
                if (next === 'APPROVED') {
                    await notifyOrganizerForEvent(ev, 'Event Approved', `Your event "${ev.title || ev.name || ev.id}" has been approved.`, 'SUCCESS');
                } else if (next === 'CANCELLED') {
                    await notifyOrganizerForEvent(ev, 'Event Cancelled', `Your event "${ev.title || ev.name || ev.id}" has been cancelled by admin.`, 'WARNING');
                } else if (next === 'COMPLETED') {
                    await notifyOrganizerForEvent(ev, 'Event Completed', `Your event "${ev.title || ev.name || ev.id}" has been marked as completed.`, 'INFO');
                }
                showToast('Success', `Event status set to ${next}.`, 'success');
                applyFilters();
            } catch (e) { showToast('Error', 'Failed to update status.', 'danger'); }
        });
    });
    tbody.querySelectorAll('.btn-delete-event').forEach(function (btn) {
        btn.addEventListener('click', function () {
            showConfirmModal({
                title: 'Delete Event', message: `Delete "${btn.dataset.name}"?`,
                confirmLabel: 'Delete', confirmClass: 'btn-danger',
                onConfirm: async function () {
                    try {
                        await apiDelete('events', btn.dataset.id);
                        const idx = events.findIndex(function (e) { return e.id === btn.dataset.id; });
                        if (idx > -1) events.splice(idx, 1);
                        showToast('Deleted', `"${btn.dataset.name}" deleted.`, 'danger');
                        applyFilters();
                    } catch (e) { showToast('Error', 'Failed.', 'danger'); }
                }
            });
        });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORIES
// ─────────────────────────────────────────────────────────────────────────────
export async function initAdminCategories() {
    const tbody = document.querySelector('.table tbody');
    const colspan = 4;

    showTableLoading(tbody, colspan);

    let categories = await apiFetch('categories');
    const events = await apiFetch('events');

    function getEventCount(catId, catName) {
        return events.filter(function (e) {
            return e.categoryId === catId || (e.category && (e.category.id === catId || e.category.name === catName));
        }).length;
    }

    function render() {
        if (!tbody) return;
        if (categories.length === 0) {
            tbody.innerHTML = emptyRow(colspan, 'No categories found.');
        } else {
            tbody.innerHTML = categories.map(function (cat) {
                const count = getEventCount(cat.id, cat.name);
                const isActive = (cat.status || '').toUpperCase() === 'ACTIVE';
                return `<tr>
                    <td class="ps-4 fw-medium text-neutral-900">${cat.name || '—'}</td>
                    <td class="text-neutral-900 small text-end pe-5">${count}</td>
                    <td>${statusBadge(isActive ? 'ACTIVE' : 'DISABLED')}</td>
                    <td class="pe-4 text-end">
                        <div class="dropdown">
                            <button class="btn btn-sm btn-icon border-0 p-0 text-neutral-400 shadow-none" type="button" data-bs-toggle="dropdown">
                                <span style="font-size: 1.2rem; font-weight: bold; line-height: 1;">&#8942;</span>
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0 py-2" style="font-size:13px;min-width:140px;">
                                <li><button class="dropdown-item d-flex align-items-center gap-2 btn-edit-cat" data-id="${cat.id}" data-name="${(cat.name || '').replace(/"/g, '&quot;')}" data-status="${cat.status || 'Active'}"><i data-lucide="edit-2" width="14"></i> Edit</button></li>
                                <li><button class="dropdown-item d-flex align-items-center gap-2 ${isActive ? 'text-warning' : 'text-success'} btn-toggle-cat" data-id="${cat.id}" data-active="${isActive}"><i data-lucide="${isActive ? 'eye-off' : 'eye'}" width="14"></i> ${isActive ? 'Disable' : 'Enable'}</button></li>
                                <li><hr class="dropdown-divider"></li>
                                <li><button class="dropdown-item d-flex align-items-center gap-2 text-danger btn-delete-cat" data-id="${cat.id}" data-name="${(cat.name || '').replace(/"/g, '&quot;')}"><i data-lucide="trash-2" width="14"></i> Delete</button></li>
                            </ul>
                        </div>
                    </td>
                </tr>`;
            }).join('');
        }
        if (window.initIcons) window.initIcons({ root: tbody });
        bindCategoryActions(tbody, categories, render);
    }

    render();

    // Add Category in modal
    const addModal = document.getElementById('addCategoryModal');
    if (addModal) {
        const saveBtn = addModal.querySelector('.btn-primary[data-bs-dismiss]');
        if (saveBtn) {
            saveBtn.removeAttribute('data-bs-dismiss');
            saveBtn.addEventListener('click', async function () {
                const nameInput = addModal.querySelector('input[type="text"]');
                const statusSel = addModal.querySelector('select');
                const name = nameInput ? nameInput.value.trim() : '';
                if (!name) { showToast('Error', 'Category name is required.', 'danger'); return; }
                try {
                    const newCat = await apiPost('categories', { name, status: statusSel ? statusSel.value : 'ACTIVE' });
                    categories.push(newCat);
                    render();
                    const modalInst = bootstrap.Modal.getInstance(addModal);
                    if (modalInst) modalInst.hide();
                    if (nameInput) nameInput.value = '';
                    showToast('Added', `Category "${name}" added.`, 'success');
                } catch (e) { showToast('Error', 'Failed to add category.', 'danger'); }
            });
        }
    }
}

function bindCategoryActions(tbody, categories, render) {
    tbody.querySelectorAll('.btn-edit-cat').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const id = btn.dataset.id, name = btn.dataset.name, status = btn.dataset.status;
            showConfirmModal({
                title: 'Edit Category', message: 'Update category details:',
                confirmLabel: 'Save', confirmClass: 'btn-primary',
                extraHtml: `
                    <div class="mb-2"><label class="form-label small fw-medium">Name</label><input type="text" class="form-control" id="_editCatName" value="${name}"></div>
                    <div class="mb-2"><label class="form-label small fw-medium">Status</label>
                        <select class="form-select" id="_editCatStatus">
                            <option value="ACTIVE" ${(status === 'Active' || status === 'ACTIVE') ? 'selected' : ''}>Active</option>
                            <option value="INACTIVE" ${(status === 'Disabled' || status === 'DISABLED' || status === 'INACTIVE') ? 'selected' : ''}>Inactive</option>
                        </select>
                    </div>`,
                onConfirm: async function () {
                    const newName = (document.getElementById('_editCatName') || {}).value || '';
                    const newStatus = (document.getElementById('_editCatStatus') || {}).value || 'ACTIVE';
                    if (!newName.trim()) { showToast('Error', 'Name required.', 'danger'); return; }
                    try {
                        await apiPatch('categories', id, { name: newName.trim(), status: newStatus });
                        const cat = categories.find(function (c) { return c.id === id; });
                        if (cat) { cat.name = newName.trim(); cat.status = newStatus; }
                        render();
                        showToast('Updated', 'Category updated.', 'success');
                    } catch (e) { showToast('Error', 'Failed.', 'danger'); }
                }
            });
        });
    });
    tbody.querySelectorAll('.btn-toggle-cat').forEach(function (btn) {
        btn.addEventListener('click', async function () {
            const id = btn.dataset.id;
            const isActive = btn.dataset.active === 'true';
            const newStatus = isActive ? 'INACTIVE' : 'ACTIVE';
            try {
                await apiPatch('categories', id, { status: newStatus });
                const cat = categories.find(function (c) { return c.id === id; });
                if (cat) cat.status = newStatus;
                render();
                showToast('Done', `Category ${newStatus === 'ACTIVE' ? 'enabled' : 'disabled'}.`, 'success');
            } catch (e) { showToast('Error', 'Failed.', 'danger'); }
        });
    });
    tbody.querySelectorAll('.btn-delete-cat').forEach(function (btn) {
        btn.addEventListener('click', function () {
            showConfirmModal({
                title: 'Delete Category', message: `Delete "${btn.dataset.name}"?`,
                confirmLabel: 'Delete', confirmClass: 'btn-danger',
                onConfirm: async function () {
                    try {
                        await apiDelete('categories', btn.dataset.id);
                        const idx = categories.findIndex(function (c) { return c.id === btn.dataset.id; });
                        if (idx > -1) categories.splice(idx, 1);
                        render();
                        showToast('Deleted', `"${btn.dataset.name}" deleted.`, 'danger');
                    } catch (e) { showToast('Error', 'Failed.', 'danger'); }
                }
            });
        });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// VENUES
// ─────────────────────────────────────────────────────────────────────────────
export async function initAdminVenues() {
    const tbody = document.querySelector('.table tbody');
    const container = document.getElementById('admin-venues-card');
    const colspan = 6;

    showTableLoading(tbody, colspan);

    let venues = await apiFetch('venues');
    const searchInput = document.querySelector('.form-control[placeholder="Search venues..."]');

    let currentPage = 1;
    const itemsPerPage = 8;
    let filteredVenues = venues;

    let pagContainer = document.getElementById('venues-pagination');
    if (!pagContainer && container) {
        pagContainer = document.createElement('div');
        pagContainer.id = 'venues-pagination';
        container.appendChild(pagContainer);
    }

    function render() {
        if (!tbody) return;
        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const pageItems = filteredVenues.slice(start, end);

        if (filteredVenues.length === 0) {
            tbody.innerHTML = emptyRow(colspan, 'No venues found.');
            if (pagContainer) pagContainer.innerHTML = '';
        } else {
            tbody.innerHTML = pageItems.map(function (v) {
                const addressStr = v.address ? `${v.address.street || ''}, ${v.address.city || ''}`.replace(/^, /, '') : (v.location || '—');
                return `<tr>
                    <td class="ps-4 fw-medium text-neutral-900">${v.name || '—'}</td>
                    <td class="text-neutral-400 small">${addressStr}</td>
                    <td class="text-neutral-900 small">${v.capacity ? Number(v.capacity).toLocaleString('en-IN') : '—'}</td>
                    <td class="text-neutral-900 small">${v.totalEvents || 0}</td>
                    <td>${statusBadge(v.status || 'ACTIVE')}</td>
                    <td class="pe-4 text-end">
                        <div class="dropdown">
                            <button class="btn btn-sm btn-icon border-0 p-0 text-neutral-400 shadow-none" type="button" data-bs-toggle="dropdown">
                                <span style="font-size: 1.2rem; font-weight: bold; line-height: 1;">&#8942;</span>
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0 py-2" style="font-size:13px;min-width:140px;">
                                <li><button class="dropdown-item d-flex align-items-center gap-2 btn-edit-venue" data-id="${v.id}" data-name="${(v.name || '').replace(/"/g, '&quot;')}" data-location="${(v.address ? v.address.city : v.location || '').replace(/"/g, '&quot;')}" data-capacity="${v.capacity || ''}"><i data-lucide="edit-2" width="14"></i> Edit</button></li>
                                <li><hr class="dropdown-divider"></li>
                                <li><button class="dropdown-item d-flex align-items-center gap-2 text-danger btn-delete-venue" data-id="${v.id}" data-name="${(v.name || '').replace(/"/g, '&quot;')}""><i data-lucide="trash-2" width="14"></i> Delete</button></li>
                            </ul>
                        </div>
                    </td>
                </tr>`;
            }).join('');

            renderPagination('venues-pagination', filteredVenues.length, itemsPerPage, currentPage, (p) => {
                currentPage = p;
                render();
            });
        }
        if (window.initIcons) window.initIcons({ root: tbody });
        bindVenueActions(tbody, venues, render, applyFilters);
    }

    function applyFilters() {
        const search = (searchInput ? searchInput.value : '').toLowerCase();
        filteredVenues = venues.filter(function (v) {
            const loc = v.address ? (v.address.city || '') : (v.location || '');
            return !search || (v.name || '').toLowerCase().includes(search) || loc.toLowerCase().includes(search);
        });
        currentPage = 1;
        render();
    }

    if (searchInput) searchInput.addEventListener('input', applyFilters);
    render();

    const addModal = document.getElementById('addVenueModal');
    if (addModal) {
        const saveBtn = addModal.querySelector('.btn-primary[data-bs-dismiss]');
        if (saveBtn) {
            saveBtn.removeAttribute('data-bs-dismiss');
            saveBtn.addEventListener('click', async function () {
                const inputs = addModal.querySelectorAll('input');
                const name = inputs[0] ? inputs[0].value.trim() : '';
                const location = inputs[1] ? inputs[1].value.trim() : '';
                const capacity = parseInt((inputs[2] || {}).value) || 0;
                if (!name) { showToast('Error', 'Venue name required.', 'danger'); return; }
                try {
                    const newV = await apiPost('venues', { name, address: { city: location }, capacity, status: 'ACTIVE' });
                    venues.push(newV);
                    applyFilters();
                    const modalInst = bootstrap.Modal.getInstance(addModal);
                    if (modalInst) modalInst.hide();
                    inputs.forEach(function (i) { i.value = ''; });
                    showToast('Added', `Venue "${name}" added.`, 'success');
                } catch (e) { showToast('Error', 'Failed.', 'danger'); }
            });
        }
    }
}

function bindVenueActions(tbody, venues, render, applyFilters) {
    tbody.querySelectorAll('.btn-edit-venue').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const id = btn.dataset.id;
            showConfirmModal({
                title: 'Edit Venue', message: 'Update venue details:',
                confirmLabel: 'Save', confirmClass: 'btn-primary',
                extraHtml: `
                    <div class="mb-2"><label class="form-label small fw-medium">Name</label><input type="text" class="form-control" id="_editVName" value="${btn.dataset.name}"></div>
                    <div class="mb-2"><label class="form-label small fw-medium">Location</label><input type="text" class="form-control" id="_editVLocation" value="${btn.dataset.location}"></div>
                    <div class="mb-2"><label class="form-label small fw-medium">Capacity</label><input type="number" class="form-control" id="_editVCapacity" value="${btn.dataset.capacity}"></div>`,
                onConfirm: async function () {
                    const name = (document.getElementById('_editVName') || {}).value || '';
                    const location = (document.getElementById('_editVLocation') || {}).value || '';
                    const capacity = parseInt((document.getElementById('_editVCapacity') || {}).value) || 0;
                    if (!name.trim()) { showToast('Error', 'Name required.', 'danger'); return; }
                    try {
                        await apiPatch('venues', id, { name: name.trim(), address: { city: location }, capacity });
                        const v = venues.find(function (v) { return v.id === id; });
                        if (v) {
                            v.name = name.trim();
                            v.address = v.address || {};
                            v.address.city = location;
                            v.capacity = capacity;
                        }
                        applyFilters();
                        showToast('Updated', 'Venue updated.', 'success');
                    } catch (e) { showToast('Error', 'Failed.', 'danger'); }
                }
            });
        });
    });
    tbody.querySelectorAll('.btn-delete-venue').forEach(function (btn) {
        btn.addEventListener('click', function () {
            showConfirmModal({
                title: 'Delete Venue', message: `Delete "${btn.dataset.name}"?`,
                confirmLabel: 'Delete', confirmClass: 'btn-danger',
                onConfirm: async function () {
                    try {
                        await apiDelete('venues', btn.dataset.id);
                        const idx = venues.findIndex(function (v) { return v.id === btn.dataset.id; });
                        if (idx > -1) venues.splice(idx, 1);
                        render(venues);
                        showToast('Deleted', `"${btn.dataset.name}" deleted.`, 'danger');
                    } catch (e) { showToast('Error', 'Failed.', 'danger'); }
                }
            });
        });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// TICKETS & REGISTRATIONS
// ─────────────────────────────────────────────────────────────────────────────
export async function initAdminTickets() {
    const tbody = document.querySelector('.table tbody');
    const container = document.getElementById('admin-tickets-card');
    const colspan = 7;

    showTableLoading(tbody, colspan);

    const [registrations, events, users] = await Promise.all([
        apiFetch('registrations'), apiFetch('events'), apiFetch('users')
    ]);
    const selects = document.querySelectorAll('.form-select');
    const eventSelect = selects[0], statusSelect = selects[1];

    let currentPage = 1;
    const itemsPerPage = 10;
    let filteredRegs = registrations;

    let pagContainer = document.getElementById('tickets-pagination');
    if (!pagContainer && container) {
        pagContainer = document.createElement('div');
        pagContainer.id = 'tickets-pagination';
        container.appendChild(pagContainer);
    }

    if (eventSelect) {
        eventSelect.innerHTML = '<option value="">All Events</option>';
        events.forEach(function (ev) {
            const opt = document.createElement('option');
            opt.value = ev.id;
            opt.textContent = ev.title || ev.name || `Event ${ev.id}`;
            eventSelect.appendChild(opt);
        });
    }

    function render() {
        if (!tbody) return;
        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const pageItems = filteredRegs.slice(start, end);

        if (filteredRegs.length === 0) {
            tbody.innerHTML = emptyRow(colspan, 'No registrations found.');
            if (pagContainer) pagContainer.innerHTML = '';
        } else {
            tbody.innerHTML = pageItems.map(function (r) {
                const ev = events.find(function (e) { return e.id === r.eventId; });
                const u = users.find(function (u) { return u.id === r.userId || u.id === r.attendeeId; });
                const evName = (ev && (ev.title || ev.name)) || r.eventName || 'Unknown Event';
                const uName = (u && u.profile && u.profile.fullName) || (u && u.name) || r.attendeeName || 'Unknown';
                const uEmail = (u && u.profile && u.profile.email) || (u && u.email) || r.attendeeEmail || '—';
                return `<tr>
                    <td class="ps-4 fw-medium text-neutral-900 small">${evName}</td>
                    <td class="text-neutral-900 small">${uName}<div class="text-neutral-400" style="font-size:11px;">${uEmail}</div></td>
                    <td class="text-neutral-400 small">${r.ticketType || r.ticketClass || '—'}</td>
                    <td class="text-neutral-900 small">${r.quantity || 1}</td>
                    <td>${statusBadge(r.status || 'CONFIRMED')}</td>
                    <td class="text-neutral-400 small">${fmt(r.registeredAt || r.createdAt)}</td>
                    <td class="pe-4 text-end">
                        <div class="dropdown">
                            <button class="btn btn-sm btn-icon border-0 p-0 text-neutral-400 shadow-none" type="button" data-bs-toggle="dropdown">
                                <span style="font-size: 1.2rem; font-weight: bold; line-height: 1;">&#8942;</span>
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0 py-2" style="font-size:13px;min-width:140px;">
                                <li><button class="dropdown-item d-flex align-items-center gap-2 text-warning btn-refund-reg" data-id="${r.id}"><i data-lucide="refresh-cw" width="14"></i> Process Refund</button></li>
                                <li><hr class="dropdown-divider"></li>
                                <li><button class="dropdown-item d-flex align-items-center gap-2 text-danger btn-cancel-reg" data-id="${r.id}"><i data-lucide="x" width="14"></i> Cancel</button></li>
                            </ul>
                        </div>
                    </td>
                </tr>`;
            }).join('');

            renderPagination('tickets-pagination', filteredRegs.length, itemsPerPage, currentPage, (p) => {
                currentPage = p;
                render();
            });
        }
        if (window.initIcons) window.initIcons({ root: tbody });
        bindRegActions(tbody, registrations, applyFilters);
    }

    function applyFilters() {
        const evId = eventSelect ? eventSelect.value : '';
        const status = statusSelect ? statusSelect.value : '';
        filteredRegs = registrations.filter(function (r) {
            const matchEvent = !evId || r.eventId === evId;
            const matchStatus = !status || status === 'All Status' || (r.status || 'CONFIRMED').toLowerCase() === status.toLowerCase();
            return matchEvent && matchStatus;
        });
        currentPage = 1;
        render();
    }

    if (eventSelect) eventSelect.addEventListener('change', applyFilters);
    if (statusSelect) statusSelect.addEventListener('change', applyFilters);
    render();
}

function bindRegActions(tbody, registrations, applyFilters) {
    tbody.querySelectorAll('.btn-refund-reg').forEach(function (btn) {
        btn.addEventListener('click', function () {
            showConfirmModal({
                title: 'Process Refund', message: 'Process refund for this registration?',
                confirmLabel: 'Process', confirmClass: 'btn-warning',
                onConfirm: async function () {
                    try {
                        await apiPatch('registrations', btn.dataset.id, { status: 'REFUNDED' });
                        const r = registrations.find(function (r) { return r.id === btn.dataset.id; });
                        if (r) r.status = 'REFUNDED';
                        applyFilters();
                        showToast('Done', 'Refund processed.', 'success');
                    } catch (e) { showToast('Error', 'Failed.', 'danger'); }
                }
            });
        });
    });
    tbody.querySelectorAll('.btn-cancel-reg').forEach(function (btn) {
        btn.addEventListener('click', function () {
            showConfirmModal({
                title: 'Cancel Registration', message: 'Cancel this registration?',
                confirmLabel: 'Cancel', confirmClass: 'btn-danger',
                onConfirm: async function () {
                    try {
                        await apiPatch('registrations', btn.dataset.id, { status: 'CANCELLED' });
                        const r = registrations.find(function (r) { return r.id === btn.dataset.id; });
                        if (r) r.status = 'CANCELLED';
                        applyFilters();
                        showToast('Cancelled', 'Registration cancelled.', 'warning');
                    } catch (e) { showToast('Error', 'Failed.', 'danger'); }
                }
            });
        });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENTS & REVENUE
// ─────────────────────────────────────────────────────────────────────────────
export async function initAdminPayments() {
    const allTbodies = document.querySelectorAll('.table tbody');
    const revenueTbody = allTbodies[0];
    const refundTbody = allTbodies[1];
    const revenueCard = document.querySelectorAll('.card-custom')[4]; // Index might vary, but usually cards are sequential
    const refundCard = document.querySelectorAll('.card-custom')[5];

    if (revenueTbody) showTableLoading(revenueTbody, 9);
    if (refundTbody) showTableLoading(refundTbody, 7);

    const [payments, events, users, registrations, refundRequests] = await Promise.all([
        apiFetch('payments'), 
        apiFetch('events'), 
        apiFetch('users'), 
        apiFetch('registrations'), 
        apiFetch('refund-requests') || Promise.resolve([])
    ]);

    // Revenue Overview Logic
    // Group payments by event
    const revenueData = events.map(ev => {
        const evPayments = payments.filter(p => p.eventId === ev.id && (p.status === 'PAID' || p.status === 'CONFIRMED' || p.status === 'COMPLETED'));
        const evRegs = registrations.filter(r => r.eventId === ev.id);
        const org = users.find(u => u.id === ev.organizerId);
        
        const ticketsSold = evRegs.reduce((sum, r) => sum + (r.quantity || 0), 0);
        const gross = evPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const platformPercent = 10; // Mock platform fee
        const platformFee = Math.round(gross * (platformPercent / 100));
        const net = gross - platformFee;

        return {
            event: ev,
            organizer: org,
            ticketsSold,
            gross,
            platformPercent,
            platformFee,
            net,
            status: gross > 0 ? 'PAID' : 'PENDING'
        };
    }).filter(d => d.gross > 0 || d.ticketsSold > 0);

    function renderRevenueOverview() {
        if (!revenueTbody) return;
        if (revenueData.length === 0) {
            revenueTbody.innerHTML = emptyRow(9, 'No revenue data found.');
        } else {
            revenueTbody.innerHTML = revenueData.map(function (d) {
                return `<tr>
                    <td class="ps-4 fw-medium text-neutral-900 small">${d.event.title || '—'}</td>
                    <td class="text-neutral-400 small">${(d.organizer && d.organizer.profile && d.organizer.profile.fullName) || '—'}</td>
                    <td class="text-neutral-900 small">${d.ticketsSold}</td>
                    <td class="text-neutral-900 small fw-medium">${fmtCurrency(d.gross)}</td>
                    <td class="text-neutral-400 small">${d.platformPercent}%</td>
                    <td class="text-neutral-900 small">${fmtCurrency(d.platformFee)}</td>
                    <td class="text-neutral-900 small fw-bold">${fmtCurrency(d.net)}</td>
                    <td>${statusBadge(d.status)}</td>
                    <td class="pe-4 text-end">
                        <button class="btn btn-sm btn-outline-neutral-900 rounded-pill px-3">View</button>
                    </td>
                </tr>`;
            }).join('');
        }
    }

    // Refund Requests Logic
    function renderRefundRequests() {
        if (!refundTbody) return;
        
        // Mock refund requests if none exist for demonstration/test
        const displayRefunds = refundRequests.length > 0 ? refundRequests : [];

        if (displayRefunds.length === 0) {
            refundTbody.innerHTML = emptyRow(7, 'No refund requests.');
        } else {
            refundTbody.innerHTML = displayRefunds.map(function (req) {
                const ev = events.find(e => e.id === req.eventId) || {};
                const u = users.find(u => u.id === req.userId) || {};
                return `<tr>
                    <td class="ps-4 fw-medium text-neutral-900 small">${ev.title || '—'}</td>
                    <td class="text-neutral-400 small">${(u.profile && u.profile.fullName) || u.name || '—'}</td>
                    <td class="text-neutral-900 small fw-medium">${fmtCurrency(req.amount)}</td>
                    <td class="text-neutral-400 small">${req.reason || '—'}</td>
                    <td class="text-neutral-400 small">${fmt(req.requestedAt)}</td>
                    <td><span class="badge rounded-pill px-3 py-1 fw-medium" style="font-size:11px; background:#F1F5F9;color:#475569;">PENDING</span></td>
                    <td class="pe-4 text-end">
                        <div class="dropdown">
                            <button class="btn btn-sm btn-icon border-0 p-0 text-neutral-400 shadow-none" type="button" data-bs-toggle="dropdown">
                                <span style="font-size: 1.2rem; font-weight: bold; line-height: 1;">&#8942;</span>
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0 py-2" style="font-size:13px;min-width:160px;">
                                <li><button class="dropdown-item d-flex align-items-center gap-2 text-success btn-approve-refund" data-id="${req.id}"><i data-lucide="check-circle" width="14"></i> Approve Refund</button></li>
                                <li><button class="dropdown-item d-flex align-items-center gap-2 text-danger btn-reject-refund" data-id="${req.id}"><i data-lucide="x-circle" width="14"></i> Reject</button></li>
                            </ul>
                        </div>
                    </td>
                </tr>`;
            }).join('');
        }
        if (window.initIcons) window.initIcons({ root: refundTbody });
    }

    renderRevenueOverview();
    renderRefundRequests();
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORTS & ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────
export async function initAdminReports() {
    const [events, users, registrations, payments, categories] = await Promise.all([
        apiFetch('events'), apiFetch('users'), apiFetch('registrations'), apiFetch('payments'), apiFetch('categories')
    ]);

    const paidPayments = payments.filter(function (p) { return p.status === 'CONFIRMED'; });
    const totalRevenue = paidPayments.reduce(function (s, p) { return s + (p.amount || 0); }, 0);

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();

    // Revenue Chart
    const revenueCanvas = document.getElementById('revenueChart');
    if (revenueCanvas && window.Chart) {
        const ec = window.Chart.getChart(revenueCanvas); if (ec) ec.destroy();
        const monthlyRevenue = months.map(function (_, idx) {
            return paidPayments.filter(function (p) {
                const d = new Date(p.createdAt || p.date);
                return d.getFullYear() === now.getFullYear() && d.getMonth() === idx;
            }).reduce(function (s, p) { return s + (p.amount || 0); }, 0);
        });
        new window.Chart(revenueCanvas, {
            type: 'bar',
            data: { labels: months, datasets: [{ label: 'Revenue', data: monthlyRevenue, backgroundColor: 'rgba(23,185,120,0.7)', borderRadius: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { font: { size: 10 } } }, x: { ticks: { font: { size: 10 } } } } }
        });
    }

    // Category Chart
    const catCanvas = document.getElementById('categoryChart');
    if (catCanvas && window.Chart) {
        const ec = window.Chart.getChart(catCanvas); if (ec) ec.destroy();
        const catCounts = {};
        events.forEach(function (ev) {
            const category = categories.find(c => c.id === ev.categoryId);
            const cat = category ? category.name : 'Other';
            catCounts[cat] = (catCounts[cat] || 0) + 1;
        });
        const catLabels = Object.keys(catCounts);
        const catData = catLabels.map(function (k) { return catCounts[k]; });
        const colors = ['#17b978', '#22c55e', '#f59e0b', '#16a34a', '#8b5cf6', '#ec4899', '#ef4444', '#06b6d4'];
        new window.Chart(catCanvas, {
            type: 'doughnut',
            data: { labels: catLabels, datasets: [{ data: catData, backgroundColor: colors }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } }
        });
    }

    // Organizers Chart
    const orgsCanvas = document.getElementById('organizersChart');
    if (orgsCanvas && window.Chart) {
        const ec = window.Chart.getChart(orgsCanvas); if (ec) ec.destroy();
        const orgSignups = months.map(function (_, idx) {
            return users.filter(function (u) {
                if (u.role && u.role.name !== 'ORGANIZER') return false;
                const d = new Date(u.accountStatus && u.accountStatus.createdAt);
                return d.getFullYear() === now.getFullYear() && d.getMonth() === idx;
            }).length;
        });
        new window.Chart(orgsCanvas, {
            type: 'line',
            data: { labels: months, datasets: [{ label: 'New Organizers', data: orgSignups, borderColor: '#17b978', backgroundColor: 'rgba(23,185,120,0.12)', fill: true, tension: 0.4, pointRadius: 3 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { font: { size: 10 } } }, x: { ticks: { font: { size: 10 } } } } }
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// FEEDBACK MODERATION
// ─────────────────────────────────────────────────────────────────────────────
export async function initAdminFeedback() {
    const tbody = document.querySelector('.table tbody');
    const container = document.getElementById('admin-feedback-card');
    const colspan = 6;

    showTableLoading(tbody, colspan);

    const [feedbacks, events, users] = await Promise.all([
        apiFetch('feedbacks'), apiFetch('events'), apiFetch('users')
    ]);

    const searchInput = document.querySelector('.form-control[placeholder="Search feedback..."]');
    const selects = document.querySelectorAll('.form-select');
    const ratingSelect = selects[0], statusSelect = selects[1];

    let currentPage = 1;
    const itemsPerPage = 8;
    let filteredFBs = feedbacks;

    let pagContainer = document.getElementById('feedback-pagination');
    if (!pagContainer && container) {
        pagContainer = document.createElement('div');
        pagContainer.id = 'feedback-pagination';
        container.after(pagContainer);
    }

    function renderStars(rating) {
        let s = '';
        for (let i = 1; i <= 5; i++) {
            s += `<i data-lucide="star" width="12" height="12" style="color:${i <= rating ? '#f59e0b' : '#d1d5db'};fill:${i <= rating ? '#f59e0b' : 'none'};"></i>`;
        }
        return s;
    }

    function render() {
        if (!tbody) return;
        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const pageItems = filteredFBs.slice(start, end);

        if (filteredFBs.length === 0) {
            tbody.innerHTML = emptyRow(colspan, 'No feedback found.');
            if (pagContainer) pagContainer.innerHTML = '';
        } else {
            tbody.innerHTML = pageItems.map(function (fb) {
                const ev = events.find(function (e) { return e.id === fb.eventId; });
                const u = users.find(function (u) { return u.id === fb.userId; });
                const evName = (ev && ev.title) || '—';
                const uName = (u && u.profile && u.profile.fullName) || 'Anonymous';
                return `<tr>
                    <td class="ps-4 fw-medium text-neutral-900 small">${uName}</td>
                    <td class="text-neutral-400 small">${evName}</td>
                    <td><div class="d-flex gap-1">${renderStars(fb.rating || 0)}</div><div class="text-neutral-400" style="font-size:11px;">${fb.rating || 0}/5</div></td>
                    <td class="text-neutral-400 small" style="max-width:200px;"><span class="text-truncate d-block">${fb.comment || '—'}</span></td>
                    <td class="text-neutral-400 small">${fmt(fb.createdAt)}</td>
                    <td class="pe-4 text-end">
                        <div class="dropdown">
                            <button class="btn btn-sm btn-icon border-0 p-0 text-neutral-400 shadow-none" type="button" data-bs-toggle="dropdown">
                                <span style="font-size: 1.2rem; font-weight: bold; line-height: 1;">&#8942;</span>
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0 py-2" style="font-size:13px;min-width:140px;">
                                <li><button class="dropdown-item d-flex align-items-center gap-2"><i data-lucide="eye" width="14"></i> View Full</button></li>
                                <li><hr class="dropdown-divider"></li>
                                <li><button class="dropdown-item d-flex align-items-center gap-2 text-danger btn-delete-fb" data-id="${fb.id}"><i data-lucide="trash-2" width="14"></i> Remove</button></li>
                            </ul>
                        </div>
                    </td>
                </tr>`;
            }).join('');

            renderPagination('feedback-pagination', filteredFBs.length, itemsPerPage, currentPage, (p) => {
                currentPage = p;
                render();
            });
        }
        if (window.initIcons) window.initIcons({ root: tbody });
        bindFeedbackActions(tbody, feedbacks, applyFilters);
    }

    function applyFilters() {
        const search = (searchInput ? searchInput.value : '').toLowerCase();
        filteredFBs = feedbacks.filter(function (fb) {
            const comment = (fb.comment || fb.review || fb.commenttext || '').toLowerCase();
            return !search || comment.includes(search);
        });
        currentPage = 1;
        render();
    }

    if (searchInput) searchInput.addEventListener('input', applyFilters);
    render();
}

function bindFeedbackActions(tbody, feedbacks, applyFilters) {
    tbody.querySelectorAll('.btn-delete-fb').forEach(function (btn) {
        btn.addEventListener('click', function () {
            showConfirmModal({
                title: 'Remove Feedback', message: 'Remove this feedback permanently?',
                confirmLabel: 'Remove', confirmClass: 'btn-danger',
                onConfirm: async function () {
                    try {
                        await apiDelete('feedbacks', btn.dataset.id);
                        const idx = feedbacks.findIndex(function (f) { return f.id === btn.dataset.id; });
                        if (idx > -1) feedbacks.splice(idx, 1);
                        applyFilters();
                        showToast('Removed', 'Feedback removed.', 'warning');
                    } catch (e) { showToast('Error', 'Failed.', 'danger'); }
                }
            });
        });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────
export async function initAdminOffers() {
    const tableBody = document.getElementById('offersTableBody');
    const card = document.getElementById('admin-offers-card');
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

    let events = await apiFetch('events');
    let currentPage = 1;
    const itemsPerPage = 8;
    let editing = null;

    let pagContainer = document.getElementById('offers-pagination');
    if (!pagContainer) {
        pagContainer = document.createElement('div');
        pagContainer.id = 'offers-pagination';
        card.after(pagContainer);
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
            eventFilter.innerHTML = '<option value="all">All Events</option>' +
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
                showConfirmModal({
                    title: 'Delete Offer',
                    message: `Delete offer "${code}"?`,
                    confirmLabel: 'Delete',
                    confirmClass: 'btn-danger',
                    onConfirm: async () => {
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
                    }
                });
            };
        });
    };

    const render = () => {
        const rows = applyFilters();
        const start = (currentPage - 1) * itemsPerPage;
        const pageRows = rows.slice(start, start + itemsPerPage);

        if (rows.length === 0) {
            tableBody.innerHTML = emptyRow(4, 'No offers found.');
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

            renderPagination('offers-pagination', rows.length, itemsPerPage, currentPage, (p) => {
                currentPage = p;
                render();
            });
            bindRowActions();
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

        const unique = validateUniqueForEvent(eventId, code);
        codeInput.classList.toggle('is-invalid', !unique);
        if (!unique) {
            if (codeFeedback) codeFeedback.textContent = 'Offer code already exists for this event.';
            return;
        }

        try {
            const targetEvent = events.find((ev) => ev.id === eventId);
            if (!targetEvent || !isPublished(targetEvent)) {
                showToast('Error', 'Offers can be created only for published events.', 'danger');
                return;
            }

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

export async function initAdminNotifications() {
    const events = await apiFetch('events');
    const container = document.getElementById('notifications-list');

    // Load and Render Notifications
    const loadNotifications = async () => {
        if (!container) return;
        const notifs = await apiFetch('notifications');
        const sorted = notifs.sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));

        if (sorted.length === 0) {
            container.innerHTML = `<div class="p-5 text-center text-neutral-400">No notifications found.</div>`;
            return;
        }

        container.innerHTML = sorted.map(n => {
            const isUnread = !n.read;
            const iconMap = {
                SUCCESS: { icon: 'check-circle', bg: 'rgba(23,185,120,0.12)', color: '#17b978' },
                DANGER: { icon: 'calendar-x', bg: 'rgba(239,68,68,0.10)', color: '#ef4444' },
                WARNING: { icon: 'alert-circle', bg: 'rgba(245,158,11,0.12)', color: '#f59e0b' },
                INFO: { icon: 'shield', bg: 'rgba(23,185,120,0.12)', color: '#17b978' }
            };
            const theme = iconMap[n.type] || iconMap.INFO;

            return `
            <div class="notification-item ${isUnread ? 'unread' : ''} px-4 py-4 d-flex align-items-start gap-3" data-id="${n.id}">
                <div class="icon-container flex-shrink-0" style="background:${theme.bg};color:${theme.color};width:40px;height:40px;min-width:40px;">
                    <i data-lucide="${theme.icon}" style="width:18px;height:18px;"></i>
                </div>
                <div class="flex-grow-1">
                    <div class="d-flex align-items-center gap-2 mb-1">
                        <span class="fw-medium text-neutral-900 small">${n.title}</span>
                        ${isUnread ? '<span class="badge rounded-pill px-2" style="background:#111827;color:#fff;font-size:10px;">New</span>' : ''}
                    </div>
                    <p class="text-neutral-400 small mb-1">${n.message}</p>
                    <span class="text-neutral-400" style="font-size:11px;">${fmt(n.createdAt)}</span>
                </div>
                <button class="btn btn-sm btn-outline-neutral-900 rounded-pill flex-shrink-0 btn-dismiss-notif" style="font-size:12px;">
                    ${isUnread ? 'Mark as Read' : 'Dismiss'}
                </button>
            </div>`;
        }).join('');

        if (window.initIcons) window.initIcons({ root: container });

        container.querySelectorAll('.btn-dismiss-notif').forEach(btn => {
            btn.addEventListener('click', async function () {
                const item = btn.closest('.notification-item');
                const id = item.dataset.id;
                try {
                    const notif = sorted.find(x => x.id === id);
                    if (notif && !notif.read) {
                        await apiPatch('notifications', id, { read: true });
                        loadNotifications();
                    } else {
                        await apiDelete('notifications', id);
                        item.remove();
                    }
                } catch (e) { showToast('Error', 'Action failed.', 'danger'); }
            });
        });
    };

    loadNotifications();

    const sendModal = document.getElementById('sendNotificationModal');
    if (sendModal) {
        const eventSelGroup = document.getElementById('eventSelectionGroup');
        const audienceSelect = sendModal.querySelector('select');
        const eventSelect = eventSelGroup ? eventSelGroup.querySelector('select') : null;

        if (audienceSelect && eventSelGroup) {
            audienceSelect.addEventListener('change', function () {
                eventSelGroup.style.display = audienceSelect.value.toLowerCase().includes('event') ? 'block' : 'none';
            });
        }

        if (eventSelect) {
            events.forEach(function (ev) {
                const opt = document.createElement('option');
                opt.value = ev.id;
                opt.textContent = ev.title || ev.name || `Event ${ev.id}`;
                eventSelect.appendChild(opt);
            });
        }

        const btns = sendModal.querySelectorAll('.btn-primary');
        const sendBtn = btns[btns.length - 1];
        if (sendBtn) {
            sendBtn.removeAttribute('data-bs-dismiss');
            sendBtn.addEventListener('click', async function () {
                const subjectInput = sendModal.querySelector('input[type="text"]');
                const msgArea = sendModal.querySelector('textarea');
                const subject = subjectInput ? subjectInput.value.trim() : '';
                const message = msgArea ? msgArea.value.trim() : '';

                if (!subject || !message) { showToast('Error', 'Subject and message required.', 'danger'); return; }

                try {
                    await apiPost('notifications', {
                        id: `notif-${Date.now()}`,
                        title: subject,
                        message: message,
                        type: 'INFO',
                        read: false,
                        createdAt: new Date().toISOString()
                    });
                    showToast('Sent', 'Notification sent!', 'success');
                    const modalInst = bootstrap.Modal.getInstance(sendModal);
                    if (modalInst) modalInst.hide();
                    if (subjectInput) subjectInput.value = '';
                    if (msgArea) msgArea.value = '';
                    loadNotifications();
                } catch (e) { showToast('Error', 'Failed to send.', 'danger'); }
            });
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN PROFILE
// ─────────────────────────────────────────────────────────────────────────────
export function initAdminProfile() {
    const userStr = localStorage.getItem('currentUser');
    const user = userStr ? JSON.parse(userStr) : null;
    if (!user) return;

    const profileCard = Array.from(document.querySelectorAll('.card-custom')).find(c => {
        const h3 = c.querySelector('h3');
        return h3 && h3.textContent.includes('Admin Information');
    }) || document.querySelector('.card-custom');
    const inputs = profileCard ? profileCard.querySelectorAll('input') : [];

    // Fallback: search by label if card-custom is ambiguous
    const findInputByLabel = (text) => {
        const labels = Array.from(document.querySelectorAll('label'));
        const label = labels.find(l => l.textContent.includes(text));
        return label ? label.nextElementSibling : null;
    };

    const nameInput = findInputByLabel('Full Name') || inputs[0];
    const emailInput = findInputByLabel('Email Address') || inputs[1];
    const phoneInput = findInputByLabel('Phone Number') || inputs[2];

    if (nameInput) nameInput.value = (user.profile && user.profile.fullName) || user.name || '';
    if (emailInput) emailInput.value = (user.profile && user.profile.email) || user.email || '';
    if (phoneInput) phoneInput.value = (user.profile && user.profile.phone) || '';

    const saveBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Save Changes'));
    if (saveBtn) {
        saveBtn.addEventListener('click', async function () {
            const newName = nameInput ? nameInput.value.trim() : '';
            const newPhone = phoneInput ? phoneInput.value.trim() : '';
            if (!newName) { showToast('Error', 'Name is required.', 'danger'); return; }
            try {
                await apiPatch('users', user.id, { profile: Object.assign({}, user.profile, { fullName: newName, phone: newPhone }) });
                if (!user.profile) user.profile = {};
                user.profile.fullName = newName;
                user.profile.phone = newPhone;
                localStorage.setItem('currentUser', JSON.stringify(user));
                populateSidebarUserInfo();
                showToast('Saved', 'Profile updated.', 'success');
            } catch (e) { showToast('Error', 'Failed to save.', 'danger'); }
        });
    }
    const pwdBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Update Password'));
    if (pwdBtn) {
        pwdBtn.addEventListener('click', function () {
            showConfirmModal({
                title: 'Update Password', message: 'Enter your new password:',
                confirmLabel: 'Update', confirmClass: 'btn-primary',
                extraHtml: `
                    <div class="mb-2"><input type="password" class="form-control" id="_newPwd1" placeholder="New password (min 6 chars)"></div>
                    <div class="mb-2"><input type="password" class="form-control" id="_newPwd2" placeholder="Confirm new password"></div>`,
                onConfirm: async function () {
                    const p1 = (document.getElementById('_newPwd1') || {}).value || '';
                    const p2 = (document.getElementById('_newPwd2') || {}).value || '';
                    if (p1.length < 6) { showToast('Error', 'Min 6 characters.', 'danger'); return; }
                    if (p1 !== p2) { showToast('Error', 'Passwords do not match.', 'danger'); return; }
                    try {
                        await apiPatch('users', user.id, { password: p1 });
                        showToast('Updated', 'Password updated.', 'success');
                    } catch (e) { showToast('Error', 'Failed.', 'danger'); }
                }
            });
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY GLOBALS for inline onclick= in HTML
// ─────────────────────────────────────────────────────────────────────────────
export function showApproveModal(name, onConfirm) {
    showConfirmModal({
        title: 'Approve Event', message: `Approve "${name}"?`,
        confirmLabel: 'Approve', confirmClass: 'btn-success',
        onConfirm: onConfirm || function () { showToast('Approved', `"${name}" approved.`, 'success'); }
    });
}

export function showRejectModal(name, onConfirm) {
    showConfirmModal({
        title: 'Reject Event', message: `Reject "${name}"?`,
        confirmLabel: 'Reject', confirmClass: 'btn-danger',
        extraHtml: '<textarea class="form-control mt-2" id="_rejectReason" rows="3" placeholder="Rejection reason..."></textarea>',
        onConfirm: onConfirm || function () { showToast('Rejected', `"${name}" rejected.`, 'warning'); }
    });
}

window.showApproveModal = showApproveModal;
window.showRejectModal = showRejectModal;
