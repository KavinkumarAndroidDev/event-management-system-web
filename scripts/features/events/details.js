import { state } from '../../shared/state.js';
import { showLoading, showToast } from '../../shared/utils.js';

export function initializeDetails() {
    const events = state.events;
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('id');

    if (!eventId) return;

    if (!events || events.length === 0) {
        showLoading('event-details-container', 'Loading event details...');
    } else {
        const event = events.find(e => e.id === eventId);
        if (event) {
            populateSingleEvent(event);
        }
    }
}

export function populateSingleEvent(event) {
    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    setText('event-title', event.title);
    if (event.category) {
        setText('event-category', event.category.name);
        const iconEl = document.getElementById('event-category-icon');
        if (iconEl) {
            const newIcon = document.createElement('i');
            newIcon.id = 'event-category-icon';
            newIcon.setAttribute('data-lucide', event.category.icon);
            newIcon.className = iconEl.getAttribute('class') || '';
            iconEl.replaceWith(newIcon);
            if (window.initIcons) window.initIcons({ root: newIcon.parentElement });
        }
    }

    const startDate = new Date(event.schedule.startDateTime);
    const endDate = new Date(event.schedule.endDateTime);
    const dateStr = `${startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}, ${startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – ${endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    setText('event-date', dateStr);
    setText('event-location', `${event.venue.name}, ${event.venue.address.city}`);

    const minPrice = Math.min(...event.tickets.map(t => t.price));
    setText('event-price', minPrice === 0 ? 'Free' : `₹${minPrice}`);

    setText('event-description', event.fullDescription);
    setupShowMore('event-description', 300); // 300 chars limit

    setText('venue-name', event.venue.name);
    setText('venue-address', `${event.venue.address.street}, ${event.venue.address.city}, ${event.venue.address.pincode}`);

    const heroImg = document.getElementById('event-hero-image');
    if (heroImg) heroImg.src = event.media.thumbnail;

    // Populate Organizer
    const organizerCard = document.getElementById('event-organizer-card');
    if (organizerCard && event.organizer) {
        organizerCard.innerHTML = `
            <div class="card-custom p-4 border border-1 border-neutral-100 shadow-sm bg-white w-100" style="border-radius: 16px;">
                <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-4">
                    <div class="d-flex align-items-center gap-3">
                        <div class="bg-primary bg-opacity-10 text-primary rounded-circle d-flex align-items-center justify-content-center fw-bold flex-shrink-0" style="width: 64px; height: 64px; font-size: 1.5rem;" id="org-avatar"></div>
                        <div>
                            <h5 class="fw-bold mb-1 text-neutral-900 d-flex align-items-center gap-2">
                                <span id="org-name"></span>
                                <i data-lucide="badge-check" class="text-primary" width="18" height="18"></i>
                            </h5>
                            <div class="d-flex align-items-center text-neutral-500 small mt-1">
                                <span class="d-flex align-items-center text-warning fw-semibold gap-1 me-3">
                                    <i data-lucide="star" class="fill-warning" width="14" height="14"></i>
                                    <span id="org-rating"></span>
                                </span>
                                <span class="d-flex align-items-center gap-1">
                                    <i data-lucide="calendar-days" width="14" height="14"></i>
                                    <span id="org-events-count"></span>
                                </span>
                            </div>
                        </div>
                    </div>
                    <div>
                        <a href="#" class="btn btn-outline-primary rounded-pill px-4 py-2 d-inline-flex align-items-center justify-content-center gap-2 w-100" id="org-contact">
                            <i data-lucide="mail" width="16" height="16"></i> Contact Organizer
                        </a>
                    </div>
                </div>
            </div>
        `;
        organizerCard.querySelector('#org-avatar').textContent = event.organizer.name.charAt(0);
        organizerCard.querySelector('#org-name').textContent = event.organizer.name;
        organizerCard.querySelector('#org-rating').textContent = `${event.organizer.rating} Rating`;
        organizerCard.querySelector('#org-events-count').textContent = '10+ Past Events';
        organizerCard.querySelector('#org-contact').href = `mailto:${event.organizer.contactEmail}`;
        if (window.initIcons) window.initIcons({ root: organizerCard });
    }

    // Populate Policies
    const policiesList = document.getElementById('event-policies-list');
    if (policiesList && event.policies) {
        policiesList.innerHTML = `
            <div class="col-md-6">
                <div class="card-custom h-100 p-4 border-0 shadow-sm bg-white d-flex flex-column gap-3" style="border-radius: 16px; transition: transform 0.2s; cursor: default;">
                    <i data-lucide="rotate-ccw" width="32" class="text-danger flex-shrink-0"></i>
                    <div>
                        <h5 class="fw-bold mb-2 text-neutral-900">Refund Policy</h5>
                        <p class="text-neutral-500 small mb-0 lh-lg" id="policy-refund"></p>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card-custom h-100 p-4 border-0 shadow-sm bg-white d-flex flex-column gap-3" style="border-radius: 16px; transition: transform 0.2s; cursor: default;">
                    <i data-lucide="file-check-2" width="32" class="text-success flex-shrink-0"></i>
                    <div>
                        <h5 class="fw-bold mb-2 text-neutral-900">Terms & Conditions</h5>
                        <p class="text-neutral-500 small mb-0 lh-lg" id="policy-terms"></p>
                    </div>
                </div>
            </div>
        `;
        policiesList.querySelector('#policy-refund').textContent = event.policies.refundPolicy;
        policiesList.querySelector('#policy-terms').textContent = event.policies.termsAndConditions;
        if (window.initIcons) window.initIcons({ root: policiesList });
    }

    // Populate Event Guide
    const guideList = document.getElementById('event-guide-list');
    if (guideList) {
        let durationHrs = 0;
        if (event.schedule && event.schedule.startDateTime && event.schedule.endDateTime) {
            durationHrs = Math.round((new Date(event.schedule.endDateTime) - new Date(event.schedule.startDateTime)) / (1000 * 60 * 60));
        }
        const capacity = event.venue && event.venue.capacity ? event.venue.capacity : 0;
        const categoryName = event.category ? event.category.name : 'General';

        const guideItems = [
            { icon: 'clock', title: 'Duration', text: `${durationHrs} Hours`, bg: 'primary' },
            { icon: 'users', title: 'Capacity', text: `${capacity} People`, bg: 'success' },
            { icon: 'tag', title: 'Category', text: categoryName, bg: 'warning' }
        ];

        guideList.innerHTML = ''; // Clear existing content
        guideItems.forEach(item => {
            const col = document.createElement('div');
            col.className = 'col-md-4';
            const card = document.createElement('div');
            card.className = 'card-custom h-100 d-flex align-items-center gap-3 p-3 border-0 shadow-sm';
            card.style.cssText = 'border-radius: 12px; background: white;';
            const iconDiv = document.createElement('div');
            iconDiv.className = `bg-${item.bg} bg-opacity-10 text-${item.bg} rounded-circle d-flex align-items-center justify-content-center flex-shrink-0`;
            iconDiv.style.cssText = 'width: 48px; height: 48px;';
            iconDiv.innerHTML = `<i data-lucide="${item.icon}" width="24"></i>`;
            card.appendChild(iconDiv);
            const textContentDiv = document.createElement('div');
            const captionDiv = document.createElement('div');
            captionDiv.className = 'caption text-neutral-400 small fw-medium mb-1';
            captionDiv.textContent = item.title;
            textContentDiv.appendChild(captionDiv);
            const valueDiv = document.createElement('div');
            valueDiv.className = 'fw-bold text-neutral-900';
            valueDiv.textContent = item.text;
            textContentDiv.appendChild(valueDiv);
            card.appendChild(textContentDiv);
            col.appendChild(card);
            guideList.appendChild(col);
        });
        if (window.lucide) {
            if (window.initIcons) window.initIcons({ root: guideList });
        }
    }

    // Populate Tickets Count Only
    const ticketsCount = document.getElementById('event-ticket-count');
    if (ticketsCount && event.tickets && event.tickets.length > 0) {
        let totalAvailable = 0;
        event.tickets.forEach(ticket => {
            totalAvailable += ticket.availableQuantity || 0;
        });
        ticketsCount.textContent = totalAvailable > 0 ? `${totalAvailable} tickets remaining` : 'Sold out';
        if (totalAvailable <= 0) {
            ticketsCount.classList.add('text-danger');
            ticketsCount.classList.remove('text-neutral-400');
            const bookBtn = document.querySelector('.btn-primary');
            if (bookBtn && bookBtn.textContent.includes('Book tickets')) {
                bookBtn.disabled = true;
                bookBtn.textContent = 'Sold Out';
            }
        }
    }

    setText('breadcrumb-active', event.title);
    document.title = `${event.title} - SyncEvent`;

    const shareBtn = document.getElementById('btn-share-event');
    if (shareBtn) {
        shareBtn.onclick = async () => {
            const shareUrl = window.location.href;
            const shareData = {
                title: event.title,
                text: `Check out this event: ${event.title}`,
                url: shareUrl
            };

            try {
                if (navigator.share) {
                    await navigator.share(shareData);
                    return;
                }
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(shareUrl);
                    showToast('Link Copied', 'Event page link copied to clipboard.', 'success');
                    return;
                }
                showToast('Share Unavailable', 'Sharing is not supported on this browser.', 'warning');
            } catch (error) {
                if (error && error.name !== 'AbortError') {
                    showToast('Share Failed', 'Unable to share this event link right now.', 'danger');
                }
            }
        };
    }

    const bookBtn = document.getElementById('btn-book-tickets');
    if (bookBtn) {
        const userStr = localStorage.getItem('currentUser');
        const user = userStr ? JSON.parse(userStr) : null;

        if (user && user.role && user.role.name !== 'ATTENDEE') {
            bookBtn.classList.add('opacity-75');
            bookBtn.title = 'Only attendees can book events';
        }

        bookBtn.onclick = (e) => {
            e.preventDefault();
            if (!user) {
                showEventLoginModal(event.id);
            } else if (user.role && user.role.name !== 'ATTENDEE') {
                showToast('Action Restricted', 'Only attendees can book events.', 'warning');
            } else {
                window.location.href = `booking.html?id=${event.id}`;
            }
        };
    }
}

function showEventLoginModal(eventId) {
    let modalEl = document.getElementById('eventLoginModal');
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'eventLoginModal';
        modalEl.className = 'modal fade';
        modalEl.tabIndex = -1;
        modalEl.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content border-0 shadow-lg rounded-4 p-2">
                    <div class="modal-header border-0 pb-0">
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body pt-0 pb-4 px-4 text-center">
                        <div class="bg-primary bg-opacity-10 text-primary rounded-circle d-inline-flex p-3 mb-3">
                            <i data-lucide="lock" width="32" height="32"></i>
                        </div>
                        <h4 class="fw-bold mb-2">Login Required</h4>
                        <p class="text-neutral-500 mb-4">Please login or enter your details to continue booking.</p>
                        <div id="modal-login-form-container-events" class="text-start w-100"></div>
                        <div class="text-center mt-3">
                            <span class="text-neutral-400 small">New here? <a href="../auth/signup.html" onclick="sessionStorage.setItem('postLoginRedirect', window.location.href)" class="text-primary text-decoration-none fw-medium">Create an account</a></span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalEl);
        if (window.initIcons) window.initIcons();

        import('../auth/login.js').then(m => {
            m.setupLoginForm('modal-login-form-container-events', true, {
                action: (user) => {
                    localStorage.setItem('currentUser', JSON.stringify(user));
                    setTimeout(() => {
                        const currentUrl = window.location.href;
                        window.location.href = currentUrl;
                    }, 2000); // Wait for the success modal animation
                },
                message: 'Redirecting you back...'
            });
        });
    }

    const bsModal = new window.bootstrap.Modal(modalEl);
    bsModal.show();
}

function setupShowMore(elementId, limit) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const fullText = el.textContent;
    if (fullText.length <= limit) return;

    const truncatedText = fullText.substring(0, limit) + '...';
    el.textContent = truncatedText;

    const btn = document.getElementById('btn-show-more');
    if (btn) {
        btn.classList.remove('d-none');
        btn.onclick = () => {
            if (btn.getAttribute('data-expanded') === 'true') {
                el.textContent = truncatedText;
                btn.innerHTML = 'Show More <i data-lucide="chevron-down" width="18"></i>';
                btn.setAttribute('data-expanded', 'false');
            } else {
                el.textContent = fullText;
                btn.innerHTML = 'Show Less <i data-lucide="chevron-up" width="18"></i>';
                btn.setAttribute('data-expanded', 'true');
            }
            if (window.initIcons) window.initIcons({ root: btn });
        };
    }
}
