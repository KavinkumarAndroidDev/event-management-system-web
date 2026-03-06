export function injectToastContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container position-fixed top-0 end-0 p-3';
    container.style.zIndex = '1100';
    document.body.appendChild(container);
}

/**
 * Back to Top Button Logic
 */
export function injectBackToTopButton() {
    if (document.getElementById('back-to-top-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'back-to-top-btn';
    btn.className = 'back-to-top';
    btn.innerHTML = '<i data-lucide="arrow-up" width="24" height="24"></i>';
    btn.setAttribute('aria-label', 'Back to Top');
    document.body.appendChild(btn);

    if (window.initIcons) window.initIcons({ root: btn });

    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            btn.classList.add('visible');
        } else {
            btn.classList.remove('visible');
        }
    });

    btn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

/**
 * Global Loading Indicators
 */
export function showLoading(containerId, message = 'Loading content...') {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.setAttribute('data-previous-html', container.innerHTML);
    container.innerHTML = `
        <div class="loading-container">
            <div class="spinner-circle"></div>
            <p class="text-neutral-500 small mb-0">${message}</p>
        </div>
    `;
}

export function hideLoading(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Optional: restore previous HTML if needed, but usually we overwrite with new data
    // container.innerHTML = container.getAttribute('data-previous-html') || '';
}

export function showToast(title, message, type = 'primary') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const id = 'toast-' + Date.now();
    const bgClass = type === 'danger' ? 'text-bg-danger' :
        type === 'success' ? 'text-bg-success' :
            type === 'warning' ? 'text-bg-warning' : 'text-bg-primary';

    const html = `
        <div id="${id}" class="toast align-items-center ${bgClass} border-0" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="d-flex">
                <div class="toast-body">
                    <strong>${title}</strong><br>
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        </div>
    `;

    // Remove existing toast before showing new one to prevent stacking
    container.innerHTML = html;

    const toastEl = document.getElementById(id);
    const toast = new window.bootstrap.Toast(toastEl, { delay: 3000 });
    toast.show();

    toastEl.addEventListener('hidden.bs.toast', () => {
        toastEl.remove();
    });
}

export function injectSignOutModal() {
    if (document.getElementById('signOutModal')) return;

    const html = `
    <div class="modal fade" id="signOutModal" tabindex="-1" aria-labelledby="signOutModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content border-0 shadow-lg rounded-4 p-4 text-center" style="max-width: 480px;">
                <div class="modal-body p-0">
                    <h4 class="fw-bold text-neutral-900 mb-2" id="signOutModalLabel">Sign out</h4>
                    <p class="text-neutral-600 mb-4">Do you want to sign out your current account from SyncEvent?</p>
                    
                    <div class="d-flex justify-content-center gap-3 mt-4">
                        <button type="button" class="btn btn-outline-dark rounded-pill" style="width: 160px;" data-bs-dismiss="modal">
                            Cancel
                        </button>
                        <button type="button" class="btn btn-danger rounded-pill d-flex align-items-center justify-content-center gap-2" style="width: 200px;" id="globalConfirmSignOutBtn">
                            Signout
                            <i data-lucide="arrow-right" width="18"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper.firstElementChild);

    const confirmBtn = document.getElementById('globalConfirmSignOutBtn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            localStorage.removeItem('currentUser');
            let path = window.location.pathname;
            if (path.includes('/features/events/')) {
                window.location.href = '../../index.html';
            } else if (path.includes('/features/')) {
                window.location.href = '../../index.html';
            } else {
                window.location.href = 'index.html';
            }
        });
    }
}

export function initializeBootstrapComponents() {
    if (typeof bootstrap === 'undefined') return;
    const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
    [...tooltipTriggerList].map(tooltipTriggerEl => new window.bootstrap.Tooltip(tooltipTriggerEl));

    const popoverTriggerList = document.querySelectorAll('[data-bs-toggle="popover"]');
    [...popoverTriggerList].map(popoverTriggerEl => new window.bootstrap.Popover(popoverTriggerEl));
}

export function setupGenericPagination({ items, containerId, paginationId, renderItem, itemsPerPage = 5, onRender }) {
    let currentPage = 1;
    let paginationContainer = document.getElementById(paginationId);

    if (!paginationContainer) return;

    // Reset container to remove existing listeners
    const newContainer = paginationContainer.cloneNode(false);
    paginationContainer.parentNode.replaceChild(newContainer, paginationContainer);
    paginationContainer = newContainer;

    if (items.length === 0) {
        const listContainer = document.getElementById(containerId);
        if (listContainer) {
            listContainer.innerHTML = '<div class="text-center py-5 text-neutral-400">No records found.</div>';
        }
        paginationContainer.innerHTML = '';
        return;
    }

    const renderPage = (page) => {
        const start = (page - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const pageItems = items.slice(start, end);

        const listContainer = document.getElementById(containerId);
        if (listContainer) {
            listContainer.innerHTML = ''; // safe clear
            pageItems.forEach(item => {
                const nodeOrString = renderItem(item);
                if (typeof nodeOrString === 'string') {
                    // Backwards compatibility for templates not yet refactored
                    listContainer.insertAdjacentHTML('beforeend', nodeOrString);
                } else if (nodeOrString instanceof Node) {
                    listContainer.appendChild(nodeOrString);
                }
            });
            if (window.initIcons) window.initIcons({ root: listContainer });
            if (onRender) onRender(pageItems);
        }

        renderControls(page);
    };

    const renderControls = (page) => {
        const totalPages = Math.ceil(items.length / itemsPerPage);
        let html = '';

        if (totalPages <= 1) {
            paginationContainer.innerHTML = '';
            return;
        }

        // Prev
        html += `<button class="pagination-btn" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}><i data-lucide="chevron-left" width="16" height="16"></i></button>`;

        // Numbers
        for (let i = 1; i <= totalPages; i++) {
            html += `<button class="pagination-btn ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }

        // Next
        html += `<button class="pagination-btn" data-page="${page + 1}" ${page === totalPages ? 'disabled' : ''}><i data-lucide="chevron-right" width="16" height="16"></i></button>`;

        paginationContainer.innerHTML = html;
        if (window.initIcons) window.initIcons({ root: paginationContainer });
        else if (window.lucide) window.lucide.createIcons({ root: paginationContainer });
    };

    paginationContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.pagination-btn');
        if (btn && !btn.disabled && !btn.classList.contains('active')) {
            const newPage = parseInt(btn.dataset.page);
            if (newPage && newPage !== currentPage) {
                currentPage = newPage;
                renderPage(currentPage);
                document.getElementById(containerId).scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    });

    renderPage(1);
}

export function setupRealtimeValidation(formId) {
    const form = document.getElementById(formId);
    if (!form) return;

    // Prevent default HTML5 bubbles
    form.setAttribute('novalidate', '');

    const inputs = form.querySelectorAll('input, select, textarea');

    const updateValidationState = (input) => {
        let feedbackEl = input.nextElementSibling;
        if (!feedbackEl || !feedbackEl.classList.contains('invalid-feedback')) {
            feedbackEl = input.parentNode.querySelector('.invalid-feedback');
        }

        // Handle deeply nested radio/check structures (like in terms agreements)
        if (!feedbackEl && (input.type === 'checkbox' || input.type === 'radio')) {
            const wrapper = input.closest('.form-check');
            if (wrapper) feedbackEl = wrapper.querySelector('.invalid-feedback');
        }

        if (!feedbackEl) {
            feedbackEl = document.createElement('div');
            feedbackEl.className = 'invalid-feedback';
            if (input.type === 'checkbox' || input.type === 'radio') {
                const wrapper = input.closest('.form-check');
                if (wrapper) wrapper.appendChild(feedbackEl);
                else input.parentNode.appendChild(feedbackEl);
            } else {
                input.parentNode.appendChild(feedbackEl);
            }
        }

        if (!feedbackEl.hasAttribute('data-original-text')) {
            feedbackEl.setAttribute('data-original-text', feedbackEl.textContent.trim());
        }

        if (!input.checkValidity()) {
            input.classList.remove('is-valid');
            input.classList.add('is-invalid');

            // Generate contextual error message
            let errorMsg = feedbackEl.getAttribute('data-original-text') || 'Please provide a valid value.';

            if (input.validity.valueMissing) {
                errorMsg = feedbackEl.getAttribute('data-original-text') || 'This field is required.';
            } else if (input.validity.typeMismatch) {
                if (input.type === 'email') errorMsg = 'Please enter a valid email address.';
                else if (input.type === 'url') errorMsg = 'Please enter a valid URL.';
                else errorMsg = 'Invalid format.';
            } else if (input.validity.patternMismatch) {
                errorMsg = input.getAttribute('title') || 'Please match the format requested.';
            } else if (input.validity.tooShort) {
                errorMsg = `Minimum length is ${input.getAttribute('minlength')} characters.`;
            } else if (input.validity.tooLong) {
                errorMsg = `Maximum length is ${input.getAttribute('maxlength')} characters.`;
            } else if (input.validity.rangeUnderflow) {
                errorMsg = `Value must be greater than or equal to ${input.getAttribute('min')}.`;
            } else if (input.validity.rangeOverflow) {
                errorMsg = `Value must be less than or equal to ${input.getAttribute('max')}.`;
            }

            // Optional: fallback to browser's built-in message if we don't have a good default and original is empty
            if (!errorMsg && input.validationMessage) {
                errorMsg = input.validationMessage;
            }

            feedbackEl.textContent = errorMsg;
        } else {
            input.classList.remove('is-invalid');
            if (input.type !== 'checkbox' && input.type !== 'radio') {
                input.classList.add('is-valid');
            }
            feedbackEl.textContent = feedbackEl.getAttribute('data-original-text') || '';
        }
    };

    inputs.forEach(input => {
        const validateHandler = () => {
            if (input.value.length > 0 || input.classList.contains('is-invalid') || input.type === 'checkbox' || input.type === 'radio') {
                updateValidationState(input);
            }
        };
        // Validate on typing
        input.addEventListener('input', validateHandler);

        // Validate on change (crucial for select, checkbox, radio)
        input.addEventListener('change', validateHandler);

        // Validate on leaving field
        input.addEventListener('blur', () => {
            updateValidationState(input);
        });
    });

    // Handle form submit to validate all fields at once
    form.addEventListener('submit', (e) => {
        if (!form.checkValidity()) {
            e.preventDefault();
            e.stopPropagation();

            inputs.forEach(input => {
                updateValidationState(input);
            });

            // Focus first invalid input
            const firstInvalid = form.querySelector('.is-invalid');
            if (firstInvalid) {
                firstInvalid.focus();
            }
        }
    });
}