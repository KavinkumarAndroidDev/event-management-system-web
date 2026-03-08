import { injectSignOutModal, populateSidebarUserInfo, showToast } from '../../shared/utils.js';
import { state } from '../../shared/state.js';

export function initAdminPage() {
    console.log('Admin Page Initialized');

    // Global Admin Initializations
    injectSignOutModal();
    populateSidebarUserInfo();

    // Update pending count in sidebar if the element exists
    const pendingCountBadge = document.getElementById('pending-org-count');
    if (pendingCountBadge && state.users) {
        const count = state.users.filter(u => u.role?.name === 'ORGANIZER' && u.accountStatus?.status === 'PENDING').length;
        pendingCountBadge.textContent = count;
        pendingCountBadge.style.display = count > 0 ? 'inline-block' : 'none';
    }

    // Setup Admin specific global listeners
    setupAdminLogout();
}

function setupAdminLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            const modalEl = document.getElementById('signOutModal');
            if (modalEl) {
                const modal = new bootstrap.Modal(modalEl);
                modal.show();
            }
        });
    }

    // Simplified: injectSignOutModal handles the confirm button
}

/**
 * Shared helper for showing approval/rejection modals across admin pages
 */
export function showApproveModal(name, onConfirm) {
    const modalText = document.getElementById('approveModalText');
    if (modalText) {
        modalText.textContent = `Are you sure you want to approve "${name}"? This event will be published and visible to all users.`;
    }
    const modalEl = document.getElementById('approveModal');
    if (modalEl) {
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    }
}

export function showRejectModal(name, onConfirm) {
    const modalText = document.getElementById('rejectModalText');
    if (modalText) {
        modalText.textContent = `Please provide a reason for rejecting "${name}":`;
    }
    const modalEl = document.getElementById('rejectModal');
    if (modalEl) {
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    }
}

/**
 * Organizer Approvals Page Logic
 */
export function initOrganizerApprovals() {
    console.log('Organizer Approvals Initialized');
    populateSidebarUserInfo();

    const tbody = document.getElementById('approvalList');
    if (!tbody) return;

    // In a real app, this would be a fetch to /users?role.name=ORGANIZER&accountStatus.status=PENDING
    // For now, we'll mock some pending organizers if they don't exist
    import('../../shared/state.js').then(m => {
        const pendingOrgs = m.state.users.filter(u => u.role.name === 'ORGANIZER' && u.accountStatus.status === 'PENDING');

        if (pendingOrgs.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-5 text-neutral-400">
                        <i data-lucide="info" class="mb-2" width="32"></i>
                        <p class="mb-0">No pending organizer applications at the moment.</p>
                    </td>
                </tr>
            `;
            if (window.initIcons) window.initIcons({ root: tbody });
            return;
        }

        renderApprovalList(pendingOrgs);
    });
}

function renderApprovalList(orgs) {
    const tbody = document.getElementById('approvalList');
    tbody.innerHTML = orgs.map(org => `
        <tr>
            <td class="ps-4 fw-medium text-neutral-900">${org.profile.organizationName || 'N/A'}</td>
            <td class="text-neutral-900 fw-medium">${org.profile.fullName}</td>
            <td class="text-neutral-400 small">${org.profile.email}</td>
            <td><span class="badge rounded-pill px-3 py-2 fw-medium bg-warning bg-opacity-10 text-warning" style="font-size:11px;">Pending Approval</span></td>
            <td class="text-neutral-400 small">${org.accountStatus.joinDate || '2025-03-08'}</td>
            <td class="pe-4 text-end">
                <div class="d-flex justify-content-end gap-2">
                    <button class="btn btn-sm btn-outline-danger btn-reject-org rounded-pill px-3" data-id="${org.id}">Reject</button>
                    <button class="btn btn-sm btn-primary btn-approve-org rounded-pill px-3" data-id="${org.id}">Approve</button>
                </div>
            </td>
        </tr>
    `).join('');

    tbody.querySelectorAll('.btn-approve-org').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            // Update on server
            fetch(`http://localhost:3000/users/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accountStatus: { status: 'ACTIVE' }
                })
            }).then(res => {
                if (res.ok) {
                    showToast('Success', 'Organizer approved successfully!', 'success');
                    btn.closest('tr').remove();
                    // Update local state if needed
                    const user = state.users.find(u => u.id === id);
                    if (user) user.accountStatus.status = 'ACTIVE';
                }
            }).catch(err => {
                console.error('Failed to approve organizer:', err);
                showToast('Error', 'Failed to update organizer status.', 'danger');
            });
        });
    });

    tbody.querySelectorAll('.btn-reject-org').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            // Update on server or delete? Rejection usually sets a REJECTED status
            fetch(`http://localhost:3000/users/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accountStatus: { status: 'REJECTED' }
                })
            }).then(res => {
                if (res.ok) {
                    showToast('Rejected', 'Application has been rejected.', 'warning');
                    btn.closest('tr').remove();
                    const user = state.users.find(u => u.id === id);
                    if (user) user.accountStatus.status = 'REJECTED';
                }
            }).catch(err => {
                console.error('Failed to reject organizer:', err);
                showToast('Error', 'Failed to update organizer status.', 'danger');
            });
        });
    });

    if (window.initIcons) window.initIcons({ root: tbody });
}
