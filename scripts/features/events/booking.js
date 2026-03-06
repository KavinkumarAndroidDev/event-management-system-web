import { state } from '../../shared/state.js';
import { showToast, showLoading } from '../../shared/utils.js';

export function initBookingPage() {
    const userStr = localStorage.getItem('currentUser');
    const isGuest = !userStr;
    const isAttendee = userStr && JSON.parse(userStr).role && JSON.parse(userStr).role.name === 'ATTENDEE';

    if (userStr && !isAttendee) {
        window.location.href = '../../index.html';
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('id');

    if (!eventId) return;

    if (!state.events || state.events.length === 0) {
        showLoading('booking-page-container', 'Setting up your booking...');
        return;
    }

    const event = state.events.find(e => e.id === eventId);
    if (!event) return;

    // Update breadcrumb with icon
    const backBtn = document.querySelector('.breadcrumb-back');
    if (backBtn && !backBtn.querySelector('i')) {
        backBtn.innerHTML = `<i data-lucide="chevron-left" width="20" height="20" class="me-1" style="vertical-align: middle; margin-top: -2px;"></i>` + backBtn.innerHTML;
        if (window.initIcons) window.initIcons({ root: backBtn });
    }

    // Populate Header Info
    document.getElementById('booking-event-title').textContent = event.title;
    const date = new Date(event.schedule.startDateTime);
    document.getElementById('booking-event-date').textContent =
        date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + ' • ' + event.venue.name;
    document.getElementById('summary-event-title').textContent = event.title;
    document.getElementById('summary-event-date').textContent =
        date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' +
        date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    // Update Summary Image
    const summaryImg = document.getElementById('summary-event-img');
    if (summaryImg) {
        summaryImg.setAttribute('src', event.media.thumbnail);
        summaryImg.setAttribute('alt', event.title);
        summaryImg.style.objectFit = 'cover';
    }

    // Setup Success/Failure Modals
    function showSuccessModal(paymentId = null) {
        if (paymentId) {
            const refSpan = document.getElementById('success-ref-id');
            if (refSpan) refSpan.textContent = paymentId;
        }

        const btnViewTickets = document.getElementById('btn-success-view-tickets');
        if (btnViewTickets) {
            btnViewTickets.addEventListener('click', () => {
                window.location.href = '../profile/index.html#registrations';
            });
        }

        const modal = new window.bootstrap.Modal(document.getElementById('successModal'));
        modal.show();
    }

    function showFailureModal(message = 'There was an issue processing your booking.') {
        const msgEl = document.getElementById('failure-reason-text');
        if (msgEl) msgEl.textContent = message;

        const modal = new window.bootstrap.Modal(document.getElementById('failureModal'));
        modal.show();
    }

    if (isGuest) {
        document.getElementById('step-select-tickets').classList.add('d-none');
        document.getElementById('step-payment').classList.add('d-none');
        const blockedEl = document.getElementById('step-guest-blocked');
        if (blockedEl) blockedEl.classList.remove('d-none');

        const stepInd = document.querySelector('.step-indicator');
        if (stepInd && stepInd.parentElement) stepInd.parentElement.classList.add('d-none');

        if (window.initIcons) window.initIcons();

        // Auto-launch modal if they hit URL directly
        showEventLoginModal(eventId);
        return;
    }

    // Render Tickets
    const container = document.getElementById('tickets-container');
    const cart = {};
    let currentDiscount = 0; // Discount percentage

    event.tickets.forEach(ticket => {
        const card = document.createElement('div');
        card.className = 'card-custom mb-3';
        card.innerHTML = `
            <div class="d-flex justify-content-between align-items-start mb-3">
                <div>
                    <h4 class="ticket-name fw-bold text-neutral-900 mb-1"></h4>
                    <div class="ticket-price fs-5 fw-bold text-primary"></div>
                </div>
                <div class="ticket-action">
                    <button class="btn btn-outline-primary rounded-pill px-4 btn-add">Add</button>
                    <div class="quantity-control d-none">
                        <button class="quantity-btn btn-minus"><i data-lucide="minus" width="16"></i></button>
                        <span class="fw-bold mx-2 count">0</span>
                        <button class="quantity-btn btn-plus"><i data-lucide="plus" width="16"></i></button>
                    </div>
                </div>
            </div>
            <hr class="border-neutral-100 my-3">
            <ul class="ticket-benefits list-unstyled mb-0 text-neutral-400 small"></ul>
        `;

        card.querySelector('.ticket-name').textContent = ticket.type.replace('_', ' ');
        card.querySelector('.ticket-price').textContent = `₹${ticket.price}`;

        const actionDiv = card.querySelector('.ticket-action');
        actionDiv.dataset.id = ticket.id;
        actionDiv.dataset.price = ticket.price;

        const benefitsList = card.querySelector('.ticket-benefits');
        if (ticket.benefits && Array.isArray(ticket.benefits)) {
            ticket.benefits.forEach(b => {
                const li = document.createElement('li');
                li.className = 'mb-1';
                li.innerHTML = '<i data-lucide="check" width="14" class="me-2 text-success"></i> <span class="benefit-text"></span>';
                li.querySelector('.benefit-text').textContent = b;
                benefitsList.appendChild(li);
            });
        }

        container.appendChild(card);
    });

    if (window.initIcons) window.initIcons();

    // Event Delegation for Ticket Actions
    container.addEventListener('click', (e) => {
        const actionDiv = e.target.closest('.ticket-action');
        if (!actionDiv) return;

        const id = actionDiv.dataset.id;
        const btnAdd = actionDiv.querySelector('.btn-add');
        const qtyControl = actionDiv.querySelector('.quantity-control');
        const countSpan = actionDiv.querySelector('.count');
        const card = actionDiv.closest('.card-custom');

        // Calculate total current tickets
        const totalTickets = Object.values(cart).reduce((a, b) => a + b, 0);

        if (e.target.closest('.btn-add')) {
            if (totalTickets >= 10) {
                showToast('Limit Reached', 'You can only book up to 10 tickets at a time.', 'warning');
                return;
            }
            cart[id] = 1;
            card.classList.add('selected');
            btnAdd.classList.add('d-none');
            qtyControl.classList.remove('d-none');
            countSpan.textContent = 1;
        } else if (e.target.closest('.btn-plus')) {
            if (totalTickets >= 10) {
                showToast('Limit Reached', 'You can only book up to 10 tickets at a time.', 'warning');
                return;
            }
            cart[id] = (cart[id] || 0) + 1;
            countSpan.textContent = cart[id];
        } else if (e.target.closest('.btn-minus')) {
            cart[id] = (cart[id] || 0) - 1;
            if (cart[id] <= 0) {
                delete cart[id];
                btnAdd.classList.remove('d-none');
                qtyControl.classList.add('d-none');
                card.classList.remove('selected');
            } else {
                countSpan.textContent = cart[id];
            }
        }
        updateSummary(cart, event.tickets);
    });

    // Update Sticky Summary
    function updateSummary(cart, tickets) {
        let subtotal = 0;
        let count = 0;
        Object.keys(cart).forEach(id => {
            const ticket = tickets.find(t => t.id === id);
            if (ticket) {
                subtotal += ticket.price * cart[id];
                count += cart[id];
            }
        });

        const sticky = document.getElementById('sticky-summary');

        // Calculate financial breakdowns
        const discountAmount = (subtotal * currentDiscount) / 100;
        const subtotalAfterDiscount = subtotal - discountAmount;
        const taxAmount = subtotalAfterDiscount * 0.18; // 18% tax
        const total = subtotalAfterDiscount + taxAmount;

        const isPaymentStep = !document.getElementById('step-payment').classList.contains('d-none');

        if (count > 0) {
            if (!isPaymentStep) sticky.classList.add('visible');
            document.getElementById('sticky-total').textContent = `₹${total.toFixed(2)}`;
            document.getElementById('sticky-count').textContent = `${count} Ticket${count > 1 ? 's' : ''}`;

            // Populate Right side summary box metrics
            const subtotalEl = document.getElementById('summary-subtotal');
            if (subtotalEl) subtotalEl.textContent = `₹${subtotal.toFixed(2)}`;

            const taxEl = document.getElementById('summary-tax');
            if (taxEl) taxEl.textContent = `₹${taxAmount.toFixed(2)}`;

            const totalEl = document.getElementById('summary-total');
            if (totalEl) totalEl.textContent = `₹${total.toFixed(2)}`;

            const payBtnAmount = document.getElementById('pay-btn-amount');
            if (payBtnAmount) payBtnAmount.textContent = `₹${total.toFixed(2)}`;

            const discountRow = document.getElementById('summary-discount-row');
            if (discountRow && currentDiscount > 0) {
                discountRow.classList.remove('d-none');
                document.getElementById('summary-discount').textContent = `-₹${discountAmount.toFixed(2)}`;
            } else if (discountRow) {
                discountRow.classList.add('d-none');
            }

        } else {
            sticky.classList.remove('visible');
            currentDiscount = 0; // Reset discount if cart empty
            if (document.getElementById('summary-discount-row')) document.getElementById('summary-discount-row').classList.add('d-none');
        }
    }

    // Discount Code Logic
    const btnApplyDiscount = document.getElementById('btn-apply-discount');
    if (btnApplyDiscount) {
        btnApplyDiscount.addEventListener('click', () => {
            const codeInput = document.getElementById('discount-code').value.trim();
            if (!codeInput) return;

            // Check global or mock offers
            const mockOffers = [
                { code: 'SAVE20', discountPercentage: 20 },
                { code: 'EARLYBIRD', discountPercentage: 15 },
                { code: 'FESTIVAL50', discountPercentage: 50 },
                { code: 'WELCOME10', discountPercentage: 10 }
            ];

            let offer = null;
            if (event.pricing && event.pricing.offers) {
                offer = event.pricing.offers.find(o => o.code.toUpperCase() === codeInput.toUpperCase());
            }
            if (!offer) {
                offer = mockOffers.find(o => o.code.toUpperCase() === codeInput.toUpperCase());
            }

            if (offer) {
                currentDiscount = offer.discountPercentage;
                showToast('Success', `Offer applied! ${currentDiscount}% off.`, 'success');
                updateSummary(cart, event.tickets);
            } else {
                currentDiscount = 0;
                showToast('Invalid Code', 'The offer code entered is not valid.', 'danger');
                updateSummary(cart, event.tickets);
            }
        });
    }

    // Proceed to Payment
    const proceedBtn = document.getElementById('btn-proceed');
    if (proceedBtn) {
        proceedBtn.addEventListener('click', () => {
            document.getElementById('step-select-tickets').classList.add('d-none');
            document.getElementById('step-payment').classList.remove('d-none');
            document.getElementById('sticky-summary').classList.remove('visible');

            document.getElementById('step1-indicator').classList.remove('active');
            document.getElementById('step2-indicator').classList.add('active');

            // Render booking summary items and interactive controls
            const summaryContainer = document.getElementById('booking-summary-items');
            const controlsContainer = document.getElementById('payment-ticket-controls');

            function renderPaymentStepItems() {
                if (summaryContainer) summaryContainer.innerHTML = '';
                if (controlsContainer) controlsContainer.innerHTML = '';

                let currentTotalTickets = Object.values(cart).reduce((a, b) => a + b, 0);

                if (currentTotalTickets === 0) {
                    // Kick them back to selection if they remove everything
                    document.getElementById('btn-go-back').click();
                    return;
                }

                Object.keys(cart).forEach(id => {
                    const ticket = event.tickets.find(t => t.id === id);
                    const qty = cart[id];
                    if (qty <= 0) return;

                    // 1) Render Summary row on the right
                    if (summaryContainer) {
                        const row = document.createElement('div');
                        row.className = 'd-flex justify-content-between small';
                        row.innerHTML = `
                            <span class="summary-qty text-neutral-600">${qty} x ${ticket.type.replace('_', ' ')}</span>
                            <span class="summary-price fw-medium">₹${ticket.price * qty}</span>
                        `;
                        summaryContainer.appendChild(row);
                    }

                    // 2) Render interactive controls on the left
                    if (controlsContainer) {
                        const controlRow = document.createElement('div');
                        controlRow.className = 'd-flex justify-content-between align-items-center p-3 bg-neutral-50 rounded-3 border border-neutral-100';
                        controlRow.innerHTML = `
                            <div>
                                <h6 class="mb-0 fw-medium">${ticket.type.replace('_', ' ')}</h6>
                                <div class="text-primary small fw-medium mt-1">₹${ticket.price} each</div>
                            </div>
                            <div class="input-group input-group-sm" style="width: 110px;">
                                <button class="btn btn-outline-neutral-300 btn-minus" type="button" ${qty <= 0 ? 'disabled' : ''}>
                                    <i data-lucide="minus" width="14" height="14"></i>
                                </button>
                                <input type="text" class="form-control text-center fw-medium px-0 qty-input" value="${qty}" readonly>
                                <button class="btn btn-outline-neutral-300 btn-plus" type="button" ${currentTotalTickets >= 10 ? 'disabled' : ''}>
                                    <i data-lucide="plus" width="14" height="14"></i>
                                </button>
                            </div>
                        `;

                        // Add listeners to these specific buttons
                        const btnMinus = controlRow.querySelector('.btn-minus');
                        const btnPlus = controlRow.querySelector('.btn-plus');

                        btnMinus.addEventListener('click', () => {
                            if (cart[id] > 0) {
                                cart[id]--;
                                if (cart[id] === 0) delete cart[id];
                                updateSummary(cart, event.tickets);
                                renderPaymentStepItems(); // Re-render this view
                                if (window.initIcons) window.initIcons();
                            }
                        });

                        btnPlus.addEventListener('click', () => {
                            let total = Object.values(cart).reduce((a, b) => a + b, 0);
                            if (total < 10 && cart[id] < ticket.availableQuantity) {
                                cart[id]++;
                                updateSummary(cart, event.tickets);
                                renderPaymentStepItems(); // Re-render this view
                                if (window.initIcons) window.initIcons();
                            } else if (total >= 10) {
                                showToast('Max Limit Reached', 'You can only select up to 10 tickets per transaction', 'warning');
                            }
                        });

                        controlsContainer.appendChild(controlRow);
                    }
                });
            }

            renderPaymentStepItems();
            if (window.initIcons) window.initIcons();
        });
    }

    // Go Back Logic
    const goBackBtn = document.getElementById('btn-go-back');
    if (goBackBtn) {
        goBackBtn.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('step-payment').classList.add('d-none');
            document.getElementById('step-select-tickets').classList.remove('d-none');
            document.getElementById('step2-indicator').classList.remove('active');
            document.getElementById('step1-indicator').classList.add('active');

            // Re-evaluate sticky summary visibility
            if (Object.keys(cart).length > 0) {
                document.getElementById('sticky-summary').classList.add('visible');
            }
        });
    }

    // Handle Payment
    const payBtn = document.getElementById('btn-pay-now');
    if (payBtn) {
        payBtn.addEventListener('click', (e) => {
            e.preventDefault();

            const btn = document.getElementById('btn-pay-now');
            const originalText = btn.innerHTML;

            // Get total amount directly from dynamic calculation logic BEFORE altering DOM
            const totalText = document.getElementById('pay-btn-amount').textContent;
            const totalAmount = parseFloat(totalText.replace('₹', '').replace(',', '')) || 0;

            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Processing Securely...';

            // Get currently logged-in user details for Razorpay prefill
            const userStr = localStorage.getItem('currentUser');
            const user = userStr ? JSON.parse(userStr) : null;

            // Configure Razorpay Option
            const options = {
                "key": "rzp_test_SL5XMJTbrtdBjR",
                "amount": Math.round(totalAmount * 100), // in paise
                "currency": "INR",
                "name": "SyncEvent",
                "description": `Ticket Booking for ${event.title}`,
                "image": "https://ui-avatars.com/api/?name=S&background=17B978&color=fff",
                "handler": function (response) {
                    processSuccessfulBooking(response.razorpay_payment_id, totalAmount);
                },
                "modal": {
                    "ondismiss": function () {
                        btn.disabled = false;
                        btn.innerHTML = originalText;
                    }
                },
                "prefill": {
                    "name": user ? user.profile.fullName : "",
                    "email": user ? user.profile.email : "",
                    "contact": user ? user.profile.phone : ""
                },
                "theme": {
                    "color": "#17B978" // Using our primary color var(--bs-primary)
                }
            };

            const rzp = new window.Razorpay(options);

            rzp.on('payment.failed', function (response) {
                showToast('Payment Failed', response.error.description, 'danger');
                // We intentionally do NOT show `showFailureModal()` or reset the button here.
                // The Razorpay overlay naturally stays open after failures, allowing the user to gracefully retry 
                // the transaction completely within the gateway environment. 
                // They can close it manually to trigger the `ondismiss` handler below.
            });

            rzp.open();
        });
    }

    // Function to handle the actual backend booking creation after Razorpay completes
    function processSuccessfulBooking(paymentRefId, totalAmount) {
        import('../../shared/utils.js').then(m => {
            const userStr = localStorage.getItem('currentUser');
            const user = userStr ? JSON.parse(userStr) : null;

            // Calculate total items
            let totalTickets = 0;
            Object.values(cart).forEach(qty => totalTickets += qty);

            // Hardcode method as Razorpay since the UI selector was removed
            const method = 'RAZORPAY';

            const regId = 'REG-' + Date.now();
            const payId = 'PAY-' + Date.now();

            let firstTicketName = Object.keys(cart).length > 0 ? event.tickets.find(t => t.id === Object.keys(cart)[0]).type.replace('_', ' ') : 'General';

            const registrationData = {
                id: regId,
                userId: user.id,
                eventId: event.id,
                eventName: event.title,
                date: event.schedule.startDateTime,
                location: `${event.venue.name}, ${event.venue.address.city}`,
                ticketType: firstTicketName,
                quantity: totalTickets,
                price: totalAmount,
                status: 'CONFIRMED',
                img: event.media.thumbnail
            };

            const paymentData = {
                id: payId,
                userId: user.id,
                eventId: event.id,
                eventTitle: event.title,
                date: new Date().toISOString(),
                tickets: `${firstTicketName} x ${totalTickets}`,
                method: method,
                amount: totalAmount,
                status: 'Confirmed',
                razorpayId: paymentRefId
            };

            // 1. Deduct ticket quantities
            const updatedTickets = event.tickets.map(ticket => {
                if (cart[ticket.id]) {
                    return { ...ticket, availableQuantity: Math.max(0, ticket.availableQuantity - cart[ticket.id]) };
                }
                return ticket;
            });

            // 2. Perform all API calls in parallel
            Promise.all([
                fetch('http://localhost:3000/registrations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(registrationData)
                }).then(r => r.json()),
                fetch('http://localhost:3000/payments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(paymentData)
                }).then(r => r.json()),
                fetch(`http://localhost:3000/events/${event.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tickets: updatedTickets })
                }).then(r => r.json())
            ])
                .then(([newReg, newPay, updatedEvent]) => {
                    state.registrations.push(newReg);
                    state.payments.push(newPay);

                    // Update the global state with the new event ticket counts
                    const eventIndex = state.events.findIndex(e => e.id === event.id);
                    if (eventIndex !== -1) {
                        state.events[eventIndex] = updatedEvent;
                    }

                    showSuccessModal(paymentRefId);
                })
                .catch(err => {
                    console.error('Booking Error:', err);
                    showToast('Payment Failed', 'There was an issue committing your booking to the server.', 'danger');
                    showFailureModal('Payment succeeded but your booking failed to save. Please contact support.');
                });
        });
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
                        
                        <div id="modal-login-form-container" class="text-start"></div>
                        <div class="text-center mt-3">
                            <span class="text-neutral-400 small">New here? <a href="../auth/signup.html" onclick="sessionStorage.setItem('postLoginRedirect', window.location.href)" class="text-primary text-decoration-none fw-medium">Create an account</a></span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalEl);
        if (window.initIcons) window.initIcons();

        // Load the shared form logic
        import('../auth/login.js').then(m => {
            m.setupLoginForm('modal-login-form-container', true, {
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

    const bsModal = new window.bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
    bsModal.show();
}