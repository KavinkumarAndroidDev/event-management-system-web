import { state } from '../../shared/state.js';
import { showToast, setupGenericPagination } from '../../shared/utils.js';

function getPaymentActivityDate(payment) {
    // Use refund timestamp as latest activity for refunded transactions.
    const sourceDate = payment.status === 'Refunded' ? (payment.refundDate || payment.date) : payment.date;
    const parsed = new Date(sourceDate);
    return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

export function initProfilePage() {
    const userStr = localStorage.getItem('currentUser');
    const user = userStr ? JSON.parse(userStr) : null;

    if (user && user.role && user.role.name !== 'ATTENDEE') {
        // Safe return, app.js now filters this correctly
        return;
    }

    const hideProfileLoader = () => {
        const overlay = document.getElementById('profile-loading-overlay');
        const contentArea = document.getElementById('profile-content-area');
        if (overlay) overlay.style.opacity = '0';
        setTimeout(() => {
            if (overlay) overlay.remove();
            if (contentArea) contentArea.classList.remove('opacity-0');
        }, 400);
    };

    if (!user) {
        // Handle Guest View
        const logoutBtn = document.getElementById('profileLogoutBtn');
        if (logoutBtn) logoutBtn.classList.add('d-none');

        document.getElementById('sidebar-avatar').textContent = 'GU';
        document.getElementById('sidebar-name').textContent = 'Guest User';
        document.getElementById('sidebar-email').textContent = 'Please log in to sync.';

        ['view-overview', 'view-profile', 'view-registrations', 'view-past-events', 'view-payments'].forEach(s => {
            const el = document.getElementById(s);
            if (el) {
                el.innerHTML = `
                <div class="d-flex flex-column align-items-center justify-content-center py-5 h-100 container" style="max-width: 400px;">
                    <div class="bg-neutral-100 rounded-circle d-flex align-items-center justify-content-center mb-3" style="width: 80px; height: 80px;">
                        <i data-lucide="lock" width="40" class="text-neutral-400"></i>
                    </div>
                    <h5 class="fw-bold text-neutral-900 mb-2">Login Required</h5>
                    <p class="text-neutral-400 mb-4 text-center">Log in to view your tickets, payments, and settings.</p>

                    <div id="profile-login-form-container-${s}" class="w-100 mt-2"></div>
                    <div class="text-center mt-3">
                        <span class="text-neutral-400 small">New here? <a href="../auth/signup.html" class="text-primary text-decoration-none fw-medium">Create an account</a></span>
                    </div>
                </div>`;

                setTimeout(() => {
                    import('../auth/login.js').then(m => {
                        m.setupLoginForm(`profile-login-form-container-${s}`, false, {
                            action: () => {
                                window.location.reload();
                            },
                            message: 'Redirecting you back...'
                        });
                    });
                }, 0);
            }
        });

        if (window.initIcons) window.initIcons();
        hideProfileLoader();
        return; // Halt further profile initialization
    }

    // Populate Sidebar
    const initials = user.profile.fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    document.getElementById('sidebar-avatar').textContent = initials;
    document.getElementById('sidebar-name').textContent = user.profile.fullName;
    document.getElementById('sidebar-email').textContent = user.profile.email;

    // Populate Profile Settings View
    document.getElementById('profile-settings-avatar').src = user.profile.profileImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.profile.fullName)}&background=17B978&color=fff`;
    document.getElementById('profile-settings-name').textContent = user.profile.fullName;
    document.getElementById('profile-settings-email-display').textContent = user.profile.email;

    document.getElementById('profile-email').value = user.profile.email;
    document.getElementById('profile-email').readOnly = true;
    document.getElementById('profile-email').classList.add('form-control-readonly');
    document.getElementById('profile-email').style.backgroundColor = '#F3F4F6';
    document.getElementById('profile-email').style.color = '#4B5563';
    document.getElementById('profile-email').style.cursor = 'not-allowed';
    document.getElementById('profile-email').style.borderStyle = 'dashed';

    document.getElementById('profile-phone').value = user.profile.phone || '';
    document.getElementById('profile-phone').readOnly = false;
    document.getElementById('profile-phone').disabled = false;
    document.getElementById('profile-phone').classList.remove('form-control-readonly');
    document.getElementById('profile-fullname').value = user.profile.fullName;
    document.getElementById('profile-dob').value = user.profile.dateOfBirth || '';

    // Initialize Gender Radios
    if (user.profile.gender) {
        const genderRadio = document.querySelector(`input[name="profile-gender"][value="${user.profile.gender}"]`);
        if (genderRadio) genderRadio.checked = true;
    }

    // Initialize Preferences
    if (user.preferences) {
        if (user.preferences.language) document.getElementById('pref-language').value = user.preferences.language;
        if (user.preferences.notifications) {
            document.getElementById('notify-email').checked = user.preferences.notifications.email;
            document.getElementById('notify-sms').checked = user.preferences.notifications.sms;
            document.getElementById('notify-push').checked = user.preferences.notifications.push;
        }
        if (user.preferences.interestedCategories) {
            user.preferences.interestedCategories.forEach(cat => {
                const check = document.querySelector(`input[value="${cat}"]`);
                if (check) check.checked = true;
            });
        }
    }

    // Profile Completion Calculation
    const fieldsToTrack = ['fullName', 'email', 'phone', 'dateOfBirth', 'gender', 'profileImage'];
    const completedFields = fieldsToTrack.filter(field => {
        const val = user.profile[field];
        return val && String(val).trim() !== '' && val !== 'null' && val !== 'undefined';
    });
    const completionPercentage = Math.round((completedFields.length / fieldsToTrack.length) * 100);

    const completionWidget = document.getElementById('profile-completion-widget');
    const completionTitle = document.getElementById('profile-completion-title');
    if (completionWidget) {
        if (completionPercentage === 100) {
            completionWidget.classList.add('d-none'); // Hide if complete as per requirement
            if (completionTitle) completionTitle.textContent = "Profile 100% Complete";
        } else {
            completionWidget.classList.remove('d-none');
            completionWidget.classList.remove('completed-state');
            if (completionTitle) completionTitle.textContent = "Complete Your Profile";
            const percentText = document.getElementById('profile-completion-text');
            const progressBar = document.getElementById('profile-completion-bar');
            if (percentText) percentText.textContent = `${completionPercentage}%`;
            if (progressBar) progressBar.style.width = `${completionPercentage}%`;
        }
    }

    // Hide loader and show content
    setupAvatarUpload();

    // Attach Filter Listeners for Profile Views
    attachPastEventsFilters();
    attachPaymentsFilters();

    // Sidebar Navigation
    const navLinks = document.querySelectorAll('.sidebar-item[data-section]');
    function switchSection(section) {
        navLinks.forEach(link => {
            if (link.dataset.section === section) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });

        ['overview', 'profile', 'registrations', 'past-events', 'payments'].forEach(s => {
            document.getElementById(`view-${s}`)?.classList.add('d-none');
        });

        if (section === 'overview') document.getElementById('view-overview').classList.remove('d-none');
        if (section === 'profile') document.getElementById('view-profile').classList.remove('d-none');
        if (section === 'registrations') renderRegistrations();
        if (section === 'past-events') renderPastEvents();
        if (section === 'payments') renderPayments();
    }

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            switchSection(link.dataset.section);
        });
    });

    // Overview "See All" Buttons
    const viewAllRegistrationsBtn = document.getElementById('btn-view-all-registrations');
    if (viewAllRegistrationsBtn) {
        viewAllRegistrationsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            switchSection('registrations');
        });
    }

    const completeProfileBtn = document.getElementById('btn-complete-profile');
    if (completeProfileBtn) {
        completeProfileBtn.addEventListener('click', (e) => {
            e.preventDefault();
            switchSection('profile');
        });
    }

    const viewAllPaymentsBtn = document.getElementById('btn-view-all-payments');
    if (viewAllPaymentsBtn) {
        viewAllPaymentsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            switchSection('payments');
        });
    }

    // Logout handlers
    const profileLogoutBtn = document.getElementById('profileLogoutBtn');
    if (profileLogoutBtn) {
        profileLogoutBtn.addEventListener('click', () => {
            const modalEl = document.getElementById('signOutModal');
            if (modalEl) new window.bootstrap.Modal(modalEl).show();
        });
    }

    function attachPastEventsFilters() {
        const search = document.getElementById('past-events-search');
        const year = document.getElementById('past-events-year');
        const sort = document.getElementById('past-events-sort');

        if (search) search.addEventListener('input', renderPastEvents);
        if (year) year.addEventListener('change', renderPastEvents);
        if (sort) sort.addEventListener('change', renderPastEvents);
    }

    function attachPaymentsFilters() {
        const search = document.getElementById('payments-search');
        const status = document.getElementById('payments-status');
        const sort = document.getElementById('payments-sort');

        if (search) search.addEventListener('input', renderPayments);
        if (status) status.addEventListener('change', renderPayments);
        if (sort) sort.addEventListener('change', renderPayments);
    }
    // Simplified: injectSignOutModal handles the confirm button

    // Populate Upcoming Events
    const container = document.getElementById('profile-upcoming-events');
    if (container && state.events && state.registrations) {
        const userRegistrations = state.registrations.filter(r => r.userId === user.id);
        const now = new Date();
        const upcomingData = userRegistrations
            .map(reg => ({ reg, event: state.events.find(e => e.id === reg.eventId) }))
            .filter(item => item.event && item.reg.status !== 'CANCELLED' && new Date(item.event.schedule.startDateTime) > now)
            .sort((a, b) => new Date(a.event.schedule.startDateTime) - new Date(b.event.schedule.startDateTime))
            .slice(0, 3);

        if (upcomingData.length === 0) {
            container.innerHTML = '<div class="text-neutral-400 py-3">No upcoming events.</div>';
        } else {
            container.innerHTML = upcomingData.map(({ reg, event }) => {
                const date = new Date(event.schedule.startDateTime);
                const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                return `
                    <div class="card-custom p-3">
                        <div class="d-flex gap-3">
                            <img src="${event.media.thumbnail}" class="rounded-3 object-fit-cover" style="width: 120px; height: 80px;" alt="${event.title}">
                            <div class="flex-grow-1">
                                <div class="d-flex justify-content-between align-items-start">
                                    <div>
                                        <h6 class="fw-bold mb-1">${event.title}</h6>
                                        <div class="small text-neutral-400 mb-0">
                                            <i data-lucide="calendar" width="14" class="me-1"></i> ${dateStr} • ${event.venue.address.city}
                                        </div>
                                    </div>
                                    <button class="btn btn-outline-primary btn-sm rounded-pill btn-view-ticket" data-reg-id="${reg.id}">
                                        View Ticket
                                    </button>
                                </div>
                                <div class="d-flex align-items-center justify-content-between mt-1 pt-2 border-top border-neutral-100">
                                    <div class="small text-neutral-600">${reg.quantity} Ticket${reg.quantity > 1 ? 's' : ''} • ${reg.ticketType}</div>
                                    <div class="fw-bold text-primary">₹${reg.price}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            // View Ticket button handler
            container.querySelectorAll('.btn-view-ticket').forEach(btn => {
                btn.addEventListener('click', () => {
                    const regId = btn.dataset.regId;
                    const reg = state.registrations.find(r => r.id === regId);
                    if (reg) openRegistrationModal(reg);
                });
            });
        }
    }

    // Populate Recent Payments (overview widget)
    const paymentsContainer = document.getElementById('profile-recent-payments');
    if (paymentsContainer && state.payments) {
        const recentPayments = state.payments
            .filter(p => p.userId === user.id)
            .sort((a, b) => getPaymentActivityDate(b) - getPaymentActivityDate(a))
            .slice(0, 4);
        if (recentPayments.length === 0) {
            paymentsContainer.innerHTML = '<div class="text-neutral-400 py-3">No recent payments.</div>';
        } else {
            paymentsContainer.innerHTML = recentPayments.map(pay => {
                let badgeClass = '';
                if (pay.status === 'Confirmed') badgeClass = 'border-success text-success';
                else if (pay.status === 'Refunded') badgeClass = 'border-danger text-danger';
                else if (pay.status === 'Failed') badgeClass = 'border-danger text-danger';

                return `
                <div class="col-md-6">
                    <div class="card-custom p-3">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <div>
                                <div class="fw-bold text-truncate" style="max-width: 150px;">${pay.eventTitle}</div>
                                <div class="small text-neutral-400">Order #${pay.id.split('-')[1]}</div>
                            </div>
                            <span class="badge bg-transparent border ${badgeClass} rounded-pill px-3">${pay.status}</span>
                        </div>
                        <div class="fw-bold">₹${pay.amount}</div>
                    </div>
                </div>`;
            }).join('');

            // Wire up clicking the card to immediately launch the Payment Details Modal
            recentPayments.forEach((pay, index) => {
                const col = paymentsContainer.children[index];
                if (col) {
                    const card = col.querySelector('.card-custom');
                    if (card) {
                        card.style.cursor = 'pointer';
                        card.addEventListener('click', () => {
                            openPaymentModal(pay);
                        });
                    }
                }
            });
        }
    }

    // Profile Update Handler
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
        profileForm.addEventListener('submit', (e) => {
            e.preventDefault();

            // Get current values
            const fullName = document.getElementById('profile-fullname').value;
            const phone = document.getElementById('profile-phone').value;
            const dob = document.getElementById('profile-dob').value;
            const gender = document.querySelector('input[name="profile-gender"]:checked')?.value;

            // Update user object
            user.profile.fullName = fullName;
            user.profile.phone = phone;
            user.profile.dateOfBirth = dob;
            user.profile.gender = gender;

            // Get Preferences
            const language = document.getElementById('pref-language').value;
            const notifyEmail = document.getElementById('notify-email').checked;
            const notifySms = document.getElementById('notify-sms').checked;
            const notifyPush = document.getElementById('notify-push').checked;
            const interestedCategories = Array.from(document.querySelectorAll('#pref-categories input:checked')).map(cb => cb.value);

            user.preferences = {
                language,
                notifications: {
                    email: notifyEmail,
                    sms: notifySms,
                    push: notifyPush
                },
                interestedCategories
            };

            // Save to localStorage
            localStorage.setItem('currentUser', JSON.stringify(user));

            // Update UI elements immediately
            document.getElementById('sidebar-name').textContent = fullName;
            document.getElementById('profile-settings-name').textContent = fullName;

            // Update initials
            const initials = fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            document.getElementById('sidebar-avatar').textContent = initials;

            // Patch DB
            fetch(`http://localhost:3000/users/${user.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    profile: user.profile,
                    preferences: user.preferences
                })
            }).then(res => {
                if (res.ok) {
                    showToast('Success', 'Profile and preferences updated successfully!', 'success');
                } else {
                    showToast('Error', 'Failed to save changes to server.', 'danger');
                }
            }).catch(err => {
                console.error("Error updating profile", err);
                showToast('Success', 'Profile saved locally.', 'success');
            });
        });
    }

    // Change Password Logic
    const cpNewPass = document.getElementById('cpNewPassword');
    const cpConfirmPass = document.getElementById('cpConfirmPassword');

    if (cpNewPass && cpConfirmPass) {
        cpNewPass.addEventListener('input', () => {
            const val = cpNewPass.value;
            const hasLength = val.length >= 8;
            const hasUpper = /[A-Z]/.test(val);
            const hasNumber = /[0-9]/.test(val);

            const updateReq = (id, valid) => {
                const el = document.getElementById(id);
                if (!el) return;
                if (valid) { el.classList.remove('text-neutral-400'); el.classList.add('text-success'); }
                else { el.classList.remove('text-success'); el.classList.add('text-neutral-400'); }
            };
            updateReq('cp-req-length', hasLength);
            updateReq('cp-req-upper', hasUpper);
            updateReq('cp-req-number', hasNumber);

            let strength = 0;
            if (hasLength) strength += 33;
            if (hasUpper) strength += 33;
            if (hasNumber) strength += 34;

            const bar = document.querySelector('#cpPasswordStrength .progress-bar');
            if (bar) {
                bar.style.width = strength + '%';
                if (strength < 50) bar.className = 'progress-bar bg-danger';
                else if (strength < 100) bar.className = 'progress-bar bg-warning';
                else bar.className = 'progress-bar bg-success';
            }
        });

        cpConfirmPass.addEventListener('input', () => {
            cpConfirmPass.setCustomValidity(
                cpConfirmPass.value && cpNewPass.value !== cpConfirmPass.value ? "Passwords do not match" : ""
            );
        });

        const changePasswordForm = document.getElementById('changePasswordForm');
        if (changePasswordForm) {
            import('../../shared/utils.js').then(m => {
                m.setupRealtimeValidation('changePasswordForm');
            });
            changePasswordForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const form = e.target;
                if (form.checkValidity()) {
                    const modalEl = document.getElementById('changePasswordModal');
                    const modal = bootstrap.Modal.getInstance(modalEl);
                    if (modal) modal.hide();
                    form.reset();
                    showToast('Success', 'Password changed successfully.', 'success');
                }
            });
        }
    }

    if (window.initIcons) window.initIcons();
}

// ─── Registrations ────────────────────────────────────────────────

function renderRegistrations() {
    const view = document.getElementById('view-registrations');
    if (!view) return;
    view.classList.remove('d-none');

    const userStr = localStorage.getItem('currentUser');
    const user = userStr ? JSON.parse(userStr) : null;
    const userId = user ? user.id : null;

    // Order: upcoming confirmed registrations first, cancelled after that.
    let registrations = state.registrations
        .filter(r => r.userId === userId && r.status !== 'COMPLETED');

    // Search and Filter Handling
    const searchInput = document.querySelector('#view-registrations input[type="text"]');
    const venueFilter = document.querySelector('#view-registrations .filter-select:nth-of-type(1)');
    const categoryFilter = document.querySelector('#view-registrations .filter-select:nth-of-type(2)');
    const sortFilter = document.querySelector('#view-registrations .filter-select:nth-of-type(3)');

    const applyFilters = () => {
        const searchTerm = searchInput?.value.toLowerCase() || '';
        const venueTerm = venueFilter?.value || 'All Venues';
        const categoryTerm = categoryFilter?.value || 'All Categories';

        let filtered = registrations.filter(r => {
            const matchesSearch = r.eventName.toLowerCase().includes(searchTerm) || r.id.includes(searchTerm);
            const matchesVenue = venueTerm === 'All Venues' || r.location.includes(venueTerm);
            const matchesCategory = categoryTerm === 'All Categories' || (r.category && r.category === categoryTerm);
            return matchesSearch && matchesVenue && matchesCategory;
        });

        // Sort
        const sortVal = sortFilter?.value || 'Sort by: Date';
        filtered.sort((a, b) => {
            if (sortVal.includes('Date')) return new Date(a.date) - new Date(b.date);
            if (sortVal.includes('Price')) return b.price - a.price;
            return 0;
        });

        // Separate confirmed and cancelled
        filtered.sort((a, b) => {
            const aCancelled = a.status === 'CANCELLED';
            const bCancelled = b.status === 'CANCELLED';
            if (aCancelled !== bCancelled) return aCancelled ? 1 : -1;
            return 0;
        });

        return filtered;
    };

    const attachFilterListeners = () => {
        if (!searchInput.dataset.listener) {
            searchInput.addEventListener('input', () => renderLimited());
            venueFilter.addEventListener('change', () => renderLimited());
            categoryFilter.addEventListener('change', () => renderLimited());
            sortFilter.addEventListener('change', () => renderLimited());
            searchInput.dataset.listener = 'true';
        }
    };

    const renderLimited = () => {
        const filtered = applyFilters();
        setupGenericPagination({
            items: filtered,
            containerId: 'registrations-list',
            paginationId: 'registrations-pagination',
            itemsPerPage: 5,
            renderItem: renderRegistrationItem,
            onRender: attachActionListeners
        });
    };

    const renderRegistrationItem = (reg) => {
        const date = new Date(reg.date);
        const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' • ' +
            date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const isCancelled = reg.status === 'CANCELLED';
        return `
        <div class="card card-custom border-0 shadow-sm mb-3 registration-card ${isCancelled ? 'opacity-75' : ''}" data-id="${reg.id}" style="border-radius: 16px; transition: transform 0.2s, box-shadow 0.2s;">
                <div class="card-body p-3">
                    <div class="d-flex flex-column flex-md-row gap-3">
                        <div class="position-relative">
                            <img src="${reg.img}" class="rounded-3 object-fit-cover" style="width: 140px; height: 100px; aspect-ratio: 1.4;" alt="${reg.eventName}">
                                ${isCancelled ? '<div class="position-absolute top-50 start-50 translate-middle badge bg-dark bg-opacity-50 px-2 py-1 rounded-pill">Cancelled</div>' : ''}
                        </div>
                        <div class="flex-grow-1">
                            <div class="d-flex justify-content-between align-items-start mb-1">
                                <h6 class="fw-bold mb-0 text-neutral-900 fs-5">${reg.eventName}</h6>
                                ${!isCancelled ? '<span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-3 py-1 fw-medium" style="font-size: 0.75rem;">Confirmed</span>' : ''}
                            </div>

                            <div class="d-flex flex-wrap gap-3 mb-3">
                                <span class="small text-neutral-400 d-flex align-items-center gap-1">
                                    <i data-lucide="calendar" width="14"></i> ${dateStr}
                                </span>
                                <span class="small text-neutral-400 d-flex align-items-center gap-1">
                                    <i data-lucide="map-pin" width="14"></i> ${reg.location}
                                </span>
                                <span class="small text-neutral-500 fw-medium bg-neutral-100 px-2 py-0.5 rounded">${reg.quantity} x ${reg.ticketType}</span>
                            </div>

                            <div class="d-flex align-items-center justify-content-between pt-3 border-top border-neutral-100">
                                <div class="fw-bold text-neutral-900 fs-5">₹${reg.price}</div>
                                <div class="d-flex align-items-center gap-3">
                                    ${!isCancelled ? `
                                    <button class="btn btn-link text-danger p-0 small text-decoration-none btn-cancel-reg" data-id="${reg.id}" style="font-size: 0.85rem;">Cancel Booking</button>
                                    <button class="btn btn-primary rounded-pill px-4 py-2 btn-view-pass d-flex align-items-center gap-2" data-id="${reg.id}" style="font-size: 0.9rem;">
                                        View Pass <i data-lucide="external-link" width="16"></i>
                                    </button>
                                ` : `
                                    <span class="small text-neutral-400 italic">Reference: #${reg.id.substring(0, 8).toUpperCase()}</span>
                                `}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
        </div > `;
    };

    const attachActionListeners = () => {
        if (window.initIcons) window.initIcons();
        document.querySelectorAll('.btn-cancel-reg').forEach(btn => {
            btn.addEventListener('click', () => {
                const reg = state.registrations.find(r => r.id === btn.dataset.id);
                if (reg) openCancelModal(reg);
            });
        });

        document.querySelectorAll('.btn-view-pass').forEach(btn => {
            btn.addEventListener('click', () => {
                const reg = state.registrations.find(r => r.id == btn.dataset.id);
                if (reg) openRegistrationModal(reg);
            });
        });
    };

    attachFilterListeners();
    renderLimited();
}


function openRegistrationModal(reg) {
    const modalEl = document.getElementById('registrationDetailsModal');
    if (!modalEl) return;

    document.getElementById('reg-modal-event').textContent = reg.eventName;
    document.getElementById('reg-modal-id').textContent = `#${reg.id.substring(0, 8).toUpperCase()} `;

    // date
    const date = new Date(reg.date);
    document.getElementById('reg-modal-date').textContent = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

    document.getElementById('reg-modal-venue').textContent = reg.location;
    document.getElementById('reg-modal-ticket-type').textContent = `${reg.ticketType} (${reg.quantity}x)`;
    document.getElementById('reg-modal-amount').textContent = `₹${reg.price} `;

    const statusBadge = document.getElementById('reg-modal-status');
    if (reg.status === 'CANCELLED') {
        statusBadge.className = 'badge bg-danger text-white mb-2';
        statusBadge.textContent = 'CANCELLED';
    } else {
        statusBadge.className = 'badge bg-white text-neutral-900 mb-2';
        statusBadge.textContent = 'CONFIRMED';
    }

    // update mock QR
    const qrImg = document.getElementById('reg-modal-qr');
    if (qrImg) qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${reg.id}`;

    const downloadBtn = document.getElementById('btn-download-ticket');
    if (downloadBtn) {
        // clear old listeners by cloning
        const newBtn = downloadBtn.cloneNode(true);
        downloadBtn.parentNode.replaceChild(newBtn, downloadBtn);
        newBtn.addEventListener('click', () => {
            showToast('Download Started', 'Your ticket is downloading...', 'info');
        });
    }

    const bsModal = new window.bootstrap.Modal(modalEl);
    bsModal.show();
}

function openCancelModal(reg) {
    const modalEl = document.getElementById('cancelBookingModal');
    const modal = new window.bootstrap.Modal(modalEl);

    document.getElementById('cancel-event-name').textContent = reg.eventName;
    document.getElementById('cancel-original-price').textContent = `₹${reg.price}`;
    const fee = Math.round(reg.price * 0.20);
    const refund = Math.round(reg.price - fee);
    document.getElementById('cancel-fee').textContent = `-₹${fee}`;
    document.getElementById('cancel-refund').textContent = `₹${refund}`;

    const confirmBtn = document.getElementById('confirmCancelBtn');
    const newBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
    newBtn.addEventListener('click', () => {
        reg.status = 'CANCELLED';

        // Update Backend for Registration
        fetch(`http://localhost:3000/registrations/${reg.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'CANCELLED' })
        }).catch(err => console.error("Error updating local db", err));

        // Correlate and Process Refund on Payment
        const payment = state.payments.find(p => p.userId == reg.userId && p.eventId == reg.eventId && p.status === 'Confirmed');
        if (payment) {
            payment.status = 'Refunded';
            payment.refundDate = new Date().toISOString();
            fetch(`http://localhost:3000/payments/${payment.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'Refunded', refundDate: payment.refundDate })
            })
                .then(res => {
                    if (!res.ok) throw new Error("Payment update failed");
                    console.log("Payment marked as refunded in DB");
                })
                .catch(err => console.error("Error updating local db", err));
        }

        modal.hide();
        showToast('Success', `Booking cancelled. A refund of ₹${refund} has been processed.`, 'success');
        renderRegistrations();
        if (typeof renderPayments === 'function') renderPayments();
    });
    modal.show();
}

// ─── Past Events ──────────────────────────────────────────────────

function renderPastEvents() {
    const view = document.getElementById('view-past-events');
    if (!view) return;
    view.classList.remove('d-none');

    const userStr = localStorage.getItem('currentUser');
    const user = userStr ? JSON.parse(userStr) : null;
    const userId = user ? user.id : null;

    const searchQuery = document.getElementById('past-events-search')?.value.toLowerCase() || '';
    const yearFilter = document.getElementById('past-events-year')?.value || 'All Years';
    const sortBy = document.getElementById('past-events-sort')?.value || 'Sort by: Date';

    // Filter for past events and deduplicate by eventId
    const seenEventIds = new Set();
    let pastEvents = state.registrations
        .filter(r => r.userId === userId && (r.status === 'COMPLETED' || r.status === 'CANCELLED'))
        .filter(r => {
            const matchesSearch = r.eventName.toLowerCase().includes(searchQuery);
            const matchesYear = yearFilter === 'All Years' || new Date(r.date).getFullYear().toString() === yearFilter;

            if (matchesSearch && matchesYear) {
                if (seenEventIds.has(r.eventId)) return false;
                seenEventIds.add(r.eventId);
                return true;
            }
            return false;
        });

    if (sortBy === 'Sort by: Rating') {
        pastEvents.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else {
        pastEvents.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    setupGenericPagination({
        items: pastEvents,
        containerId: 'past-events-list',
        paginationId: 'past-events-pagination',
        itemsPerPage: 5,
        renderItem: (evt) => {
            // ... (rest of the renderItem logic)
            const date = new Date(evt.date);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const hasFeedback = evt.feedback && evt.rating > 0;
            return `
            <div class="card card-custom border-0 shadow-sm mb-3 past-event-card" style="border-radius: 12px; transition: all 0.2s;">
                <div class="card-body p-3">
                    <div class="d-flex flex-column flex-sm-row align-items-center align-items-sm-start gap-4">
                        <div class="flex-shrink-0">
                            <img src="${evt.img}" class="rounded-3 object-fit-cover" style="width: 140px; height: 110px; min-width: 140px; filter: grayscale(40%);" alt="${evt.eventName}">
                        </div>
                        <div class="flex-grow-1 overflow-hidden w-100">
                            <div class="d-flex justify-content-between align-items-start mb-1">
                                <h6 class="fw-bold mb-0 text-neutral-900 text-truncate" style="font-size: 1rem;">${evt.eventName}</h6>
                                <span class="badge bg-neutral-100 text-neutral-500 rounded-pill px-2 py-1 fw-medium" style="font-size: 0.7rem;">Completed</span>
                            </div>
                            <div class="d-flex flex-wrap gap-2 mb-2">
                                <span class="small text-neutral-400 d-flex align-items-center gap-1">
                                    <i data-lucide="calendar" width="12"></i> ${dateStr}
                                </span>
                                <span class="small text-neutral-500 fw-medium bg-neutral-50 px-2 rounded" style="font-size: 0.75rem;">${evt.quantity} x ${evt.ticketType}</span>
                            </div>

                            <div class="d-flex align-items-center justify-content-between pt-2 border-top border-neutral-50">
                                <div class="small fw-bold text-neutral-800">Total: ₹${evt.price}</div>
                                ${evt.feedbackSubmitted ? `
                                    <div class="d-flex align-items-center text-warning gap-1 small">
                                        <i data-lucide="star" class="fill-warning" width="12"></i>
                                        <span class="fw-bold">${evt.rating}</span>
                                    </div>
                                ` : `
                                    <button class="btn btn-outline-primary btn-sm rounded-pill px-3 py-1 btn-feedback" data-id="${evt.id}" style="font-size: 0.75rem;">
                                        Review Event
                                    </button>
                                `}
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
        },
        onRender: () => {
            document.querySelectorAll('.btn-feedback').forEach(btn => {
                btn.addEventListener('click', () => {
                    const evt = state.registrations.find(e => e.id == btn.dataset.id);
                    if (evt) openFeedbackModal(evt);
                });
            });
        }
    });
}

function openFeedbackModal(evt) {
    const modalEl = document.getElementById('feedbackModal');
    const modal = new window.bootstrap.Modal(modalEl);
    document.getElementById('feedback-event-name').textContent = evt.eventName;

    const oldBtn = document.getElementById('submitFeedbackBtn');
    const submitBtn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(submitBtn, oldBtn);
    submitBtn.disabled = true;

    let selectedRating = 0;
    const options = document.querySelectorAll('.emoji-option');
    options.forEach(opt => {
        opt.classList.remove('selected');
        opt.onclick = () => {
            options.forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            selectedRating = parseInt(opt.dataset.value);
            submitBtn.disabled = false;
        };
    });

    submitBtn.addEventListener('click', () => {
        evt.feedbackSubmitted = true;
        evt.rating = selectedRating;
        evt.feedback = document.getElementById('feedback-text').value;

        // Update Backend
        fetch(`http://localhost:3000/registrations/${evt.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                feedbackSubmitted: true,
                rating: selectedRating,
                feedback: evt.feedback
            })
        }).catch(err => console.error("Error saving feedback", err));

        modal.hide();
        showToast('Thank You', 'Your feedback has been submitted.', 'success');
        renderPastEvents();
    });

    // Character Counter
    const feedbackText = document.getElementById('feedback-text');
    const charCount = document.getElementById('feedback-char-count');
    if (feedbackText && charCount) {
        feedbackText.value = ''; // Reset for new feedback
        charCount.textContent = '0/500';
        feedbackText.addEventListener('input', () => {
            const count = feedbackText.value.length;
            charCount.textContent = `${count}/500`;
            if (count >= 500) charCount.classList.add('text-danger');
            else charCount.classList.remove('text-danger');
        });
    }
    modal.show();
}

// ─── Payments ─────────────────────────────────────────────────────

function renderPayments() {
    const view = document.getElementById('view-payments');
    if (!view) return;
    view.classList.remove('d-none');

    const userStr = localStorage.getItem('currentUser');
    const user = userStr ? JSON.parse(userStr) : null;
    const userId = user ? user.id : null;

    const searchQuery = document.getElementById('payments-search')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('payments-status')?.value || 'All Statuses';
    const sortBy = document.getElementById('payments-sort')?.value || 'Sort by: Date';

    let payments = state.payments
        .filter(p => p.userId === userId)
        .filter(p => {
            const matchesSearch = p.orderId.toLowerCase().includes(searchQuery) || p.eventName.toLowerCase().includes(searchQuery);
            const matchesStatus = statusFilter === 'All Statuses' || p.status === statusFilter;
            return matchesSearch && matchesStatus;
        });

    if (sortBy === 'Sort by: Amount') {
        payments.sort((a, b) => b.amount - a.amount);
    } else {
        payments.sort((a, b) => getPaymentActivityDate(b) - getPaymentActivityDate(a));
    }

    setupGenericPagination({
        items: payments,
        containerId: 'payments-list',
        paginationId: 'payments-pagination',
        itemsPerPage: 5,
        renderItem: (pay) => {
            const date = getPaymentActivityDate(pay);
            const dateStr = date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

            let badgeClass = '';
            let statusText = pay.status;
            if (pay.status === 'Confirmed') {
                badgeClass = 'bg-success-subtle text-success border-success-subtle';
            } else if (pay.status === 'Refunded') {
                badgeClass = 'bg-warning-subtle text-warning border-warning-subtle fw-bold';
            } else {
                badgeClass = 'bg-danger-subtle text-danger border-danger-subtle';
            }

            return `
            <div class="card card-custom border-0 shadow-sm mb-3 payment-card" style="border-radius: 12px; transition: all 0.2s;">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <div class="d-flex align-items-center gap-2">
                            <div class="bg-primary bg-opacity-10 text-primary rounded-3 d-flex align-items-center justify-content-center" style="width: 36px; height: 36px;">
                                <i data-lucide="credit-card" width="18"></i>
                            </div>
                            <div>
                                <h6 class="fw-bold mb-0 text-neutral-900" style="font-size: 0.95rem;">${pay.eventName || pay.eventTitle}</h6>
                                <small class="text-neutral-400">ID: #${pay.id.toUpperCase().substring(0, 8)}</small>
                            </div>
                        </div>
                        <span class="badge ${badgeClass} border rounded-pill px-2 py-1 fw-medium" style="font-size: 0.7rem;">${statusText}</span>
                    </div>

                    <div class="d-flex align-items-center justify-content-between mt-3 pt-2 border-top border-neutral-50">
                        <div>
                            <div class="small text-neutral-400">Amount Paid</div>
                            <div class="fw-bold text-neutral-900 fs-5">₹${pay.amount}</div>
                        </div>
                        <div class="text-end">
                            <div class="small text-neutral-400">${dateStr}</div>
                            <button class="btn btn-link text-primary p-0 small text-decoration-none btn-view-invoice mt-1" data-id="${pay.id}">
                                View Invoice <i data-lucide="chevron-right" width="14"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;
        },
        onRender: () => {
            if (window.initIcons) window.initIcons();
            document.querySelectorAll('.btn-view-invoice').forEach(btn => {
                btn.addEventListener('click', () => {
                    const pay = state.payments.find(p => p.id == btn.dataset.id);
                    if (pay) openPaymentModal(pay);
                });
            });
        }
    });

}

function openPaymentModal(pay) {
    const modalEl = document.getElementById('paymentDetailsModal');
    if (!modalEl) return;

    document.getElementById('pay-modal-id').textContent = `#${pay.id.substring(0, 8).toUpperCase()}`;
    document.getElementById('pay-modal-amount').textContent = `₹${pay.amount}`;

    const date = getPaymentActivityDate(pay);
    document.getElementById('pay-modal-date').textContent = date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

    // Find event title from state if missing in pay object
    let eventTitle = pay.eventTitle || pay.eventName;
    if (!eventTitle && pay.eventId) {
        const evt = state.events.find(e => String(e.id) === String(pay.eventId));
        if (evt) eventTitle = evt.title;
    }
    document.getElementById('pay-modal-event').textContent = eventTitle || 'Event Details';

    document.getElementById('pay-modal-method').textContent = pay.method || 'Credit/Debit Card';
    document.getElementById('pay-modal-booking').textContent = pay.bookingId ? `#${String(pay.bookingId).toUpperCase().substring(0, 8)}` : 'N/A';

    const statusBadge = document.getElementById('pay-modal-status');
    if (pay.status === 'Confirmed') {
        statusBadge.className = 'badge bg-success bg-opacity-10 text-success fw-medium px-3 py-1';
        statusBadge.textContent = 'SUCCESSFUL';
    } else if (pay.status === 'Refunded') {
        statusBadge.className = 'badge bg-warning bg-opacity-10 text-warning fw-medium px-3 py-1';
        statusBadge.textContent = 'REFUNDED';
    } else {
        statusBadge.className = 'badge bg-danger bg-opacity-10 text-danger fw-medium px-3 py-1';
        statusBadge.textContent = 'FAILED';
    }

    const downloadBtn = document.getElementById('btn-download-invoice');
    if (downloadBtn) {
        const newBtn = downloadBtn.cloneNode(true);
        downloadBtn.parentNode.replaceChild(newBtn, downloadBtn);
        newBtn.addEventListener('click', () => {
            showToast('Download Started', 'Your invoice is downloading...', 'info');
        });
    }

    const bsModal = new window.bootstrap.Modal(modalEl);
    bsModal.show();
}
