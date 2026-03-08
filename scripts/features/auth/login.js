import { state } from '../../shared/state.js';
import { showToast } from '../../shared/utils.js';

export function performLogin(loginId, otp, onRedirect = null) {
    const loginValidation = validateLoginId(loginId);
    if (!loginValidation.valid) {
        showToast('Hold on', 'Oops, that email or phone number doesn\'t look quite right.', 'danger');
        return false;
    }
    if (!state.users || state.users.length === 0) {
        showToast('Just a moment', 'We\'re still loading things up on our end. Please try again.', 'warning');
        return false;
    }

    if (!otp || otp.length !== 6) {
        showToast('Check OTP', 'Please double-check your OTP. It should be 6 digits.', 'danger');
        return false;
    }

    const user = state.users.find(u => u.profile.email === loginId || u.profile.phone === loginId);

    if (user) {
        if (user.accountStatus && user.accountStatus.status !== 'ACTIVE') {
            // Create the suspended modal dynamically if it doesn't exist
            let modalEl = document.getElementById('suspendedAccountModal');
            if (!modalEl) {
                modalEl = document.createElement('div');
                modalEl.id = 'suspendedAccountModal';
                modalEl.className = 'modal fade';
                modalEl.tabIndex = -1;
                modalEl.innerHTML = `
                    <div class="modal-dialog modal-dialog-centered">
                        <div class="modal-content border-0 shadow-lg rounded-4">
                            <div class="modal-header border-0 pb-0">
                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body text-center pt-0 pb-4 px-4">
                                <div class="bg-danger bg-opacity-10 text-danger rounded-circle d-inline-flex p-3 mb-3">
                                    <i data-lucide="ban" width="32" height="32"></i>
                                </div>
                                <h4 class="fw-bold mb-2">Account Suspended</h4>
                                <p class="text-neutral-600 mb-4">Your account is currently suspended. Please contact support to resolve this issue.</p>
                                <button type="button" class="btn btn-primary w-100 rounded-pill mb-2" data-bs-dismiss="modal">Close</button>
                                <a href="../about/contact.html" class="btn btn-outline-dark w-100 rounded-pill">Contact Support</a>
                            </div>
                        </div>
                    </div>
                `;
                document.body.appendChild(modalEl);
                if (window.initIcons) window.initIcons();
            }
            const bsModal = new window.bootstrap.Modal(modalEl);
            bsModal.show();
            return false;
        }

        if (!user.accountInfo) user.accountInfo = {};
        user.accountInfo.lastLogin = new Date().toISOString();

        localStorage.setItem('currentUser', JSON.stringify(user));

        // Update Last Login in DB
        fetch(`http://localhost:3000/users/${user.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountInfo: user.accountInfo })
        }).catch(err => console.error("Error updating last login", err));
        // Create success modal
        let modalEl = document.getElementById('loginSuccessModal');
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = 'loginSuccessModal';
            modalEl.className = 'modal fade';
            modalEl.tabIndex = -1;
            modalEl.style.zIndex = '1060';
            modalEl.innerHTML = `
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content border-0 shadow-lg rounded-4 text-center p-4">
                        <div class="modal-body">
                            <i data-lucide="check-circle" class="text-success mb-3 mx-auto" width="48" height="48"></i>
                            <h4 class="fw-bold text-neutral-900 mb-2">Login Successful!</h4>
                            <p class="text-neutral-500 mb-0">Welcome back, ${user.profile.fullName}. Redirecting to your dashboard...</p>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modalEl);
            if (window.initIcons) window.initIcons();
        }

        let redirectMsg = 'Redirecting to your dashboard...';
        if (typeof onRedirect === 'object' && onRedirect !== null && onRedirect.message) {
            redirectMsg = onRedirect.message;
        } else if (onRedirect) {
            redirectMsg = 'Redirecting you back...';
        }

        modalEl.querySelector('p').textContent = `Welcome back, ${user.profile.fullName}. ${redirectMsg}`;

        const bsModal = new window.bootstrap.Modal(modalEl);
        bsModal.show();

        setTimeout(() => {
            if (typeof onRedirect === 'function') {
                onRedirect(user);
            } else if (typeof onRedirect === 'object' && onRedirect !== null && onRedirect.action) {
                onRedirect.action(user);
            } else {
                const redirectUrl = sessionStorage.getItem('postLoginRedirect');
                if (redirectUrl) {
                    sessionStorage.removeItem('postLoginRedirect');
                    window.location.href = redirectUrl;
                } else if (user.role && user.role.name === 'ORGANIZER') {
                    window.location.href = '../organizer/dashboard.html';
                } else if (user.role && user.role.name === 'ADMIN') {
                    window.location.href = '../admin/dashboard.html';
                } else {
                    window.location.href = '../profile/index.html';
                }
            }
        }, 2000);
        return true;
    } else {
        showToast('Login Failed', 'Hmm, we couldn\'t match those details. Please try again.', 'danger');
        return false;
    }
}
export function setupLoginForm(containerId = 'login-form-container', isModal = false, onSuccess = null) {
    const container = document.getElementById(containerId);
    if (!container) return; // Silent return if not on login page or modal isn't ready

    const formId = isModal ? 'modalLoginForm' : 'loginForm';
    const emailInputId = isModal ? 'modalEmailInput' : 'emailInput';
    const phoneInputId = isModal ? 'modalPhoneInput' : 'phoneInput';
    const otpInputId = isModal ? 'modalOtp' : 'otp';
    const btnSendOtpId = isModal ? 'modalBtnSendOtp' : 'btnSendOtp';
    const otpSentMsgId = isModal ? 'modalOtpSentMsg' : 'otpSentMsg';
    const submitBtnId = isModal ? 'modalBtnLogin' : 'btnLoginSubmit';

    container.innerHTML = `
        <ul class="nav nav-tabs border-0 flex-nowrap mb-4 justify-content-center" id="${isModal ? 'modalLoginTabs' : 'loginTabs'}" role="tablist" style="border-bottom: 1px solid #e5e5e5 !important; margin-bottom: 24px;">
            <li class="nav-item" role="presentation">
                <button class="nav-link active bg-transparent border-0 rounded-0 fw-bold px-2 py-2 mx-3 text-primary" id="${isModal ? 'modal-email-tab' : 'email-tab'}" data-bs-toggle="pill" data-bs-target="#${isModal ? 'modal-email-pane' : 'email-pane'}" type="button" role="tab" aria-controls="${isModal ? 'modal-email-pane' : 'email-pane'}" aria-selected="true" style="border-bottom: 2px solid var(--bs-primary) !important; font-size: 0.95rem;">Email Address</button>
            </li>
            <li class="nav-item" role="presentation">
                <button class="nav-link bg-transparent border-0 rounded-0 fw-medium px-2 py-2 mx-3 text-neutral-400" id="${isModal ? 'modal-phone-tab' : 'phone-tab'}" data-bs-toggle="pill" data-bs-target="#${isModal ? 'modal-phone-pane' : 'phone-pane'}" type="button" role="tab" aria-controls="${isModal ? 'modal-phone-pane' : 'phone-pane'}" aria-selected="false" style="border-bottom: 2px solid transparent !important; font-size: 0.95rem;">Phone Number</button>
            </li>
        </ul>
        
        <form id="${formId}" novalidate>
            <div class="tab-content w-100" id="${isModal ? 'modalLoginTabContent' : 'loginTabContent'}">
            <!-- Email Tab -->
            <div class="tab-pane fade show active" id="${isModal ? 'modal-email-pane' : 'email-pane'}" role="tabpanel" aria-labelledby="${isModal ? 'modal-email-tab' : 'email-tab'}" tabindex="0">
                <div class="mb-3 px-1">
                    <label for="${emailInputId}" class="form-label text-neutral-900 fw-medium small">Email Address</label>
                    <input type="email" class="form-control px-3 py-2 bg-neutral-100 border-neutral-100 text-neutral-900 focus-ring" id="${emailInputId}" placeholder="name@example.com" style="border-radius: 8px;" required>
                    <div class="invalid-feedback text-danger small mt-1">Please enter a valid email address.</div>
                </div>
            </div>
            
            <!-- Phone Tab -->
            <div class="tab-pane fade" id="${isModal ? 'modal-phone-pane' : 'phone-pane'}" role="tabpanel" aria-labelledby="${isModal ? 'modal-phone-tab' : 'phone-tab'}" tabindex="0">
                <div class="mb-3 px-1">
                    <label for="${phoneInputId}" class="form-label text-neutral-900 fw-medium small">Phone Number</label>
                    <div class="input-group">
                        <span class="input-group-text bg-neutral-100 border-neutral-100 text-neutral-500 pe-2" style="border-radius: 8px 0 0 8px;">+91</span>
                        <input type="tel" class="form-control px-3 py-2 bg-neutral-100 border-neutral-100 text-neutral-900 focus-ring" id="${phoneInputId}" placeholder="98765 43210" pattern="[0-9]{10}" style="border-radius: 0 8px 8px 0;" disabled required>
                        <div class="invalid-feedback text-danger small mt-1">Please enter a valid 10-digit phone number.</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="mb-4 px-1">
            <label for="${otpInputId}" class="form-label text-neutral-900 fw-medium small d-flex justify-content-between">
                <span>Verification Code</span>
                <a href="#" class="text-primary text-decoration-none fw-medium" id="${btnSendOtpId}">Get Code</a>
            </label>
            <input type="text" class="form-control px-3 py-2 bg-neutral-100 border-neutral-100 text-neutral-900 focus-ring text-center letter-spacing-lg" id="${otpInputId}" placeholder="• • • • • •" maxlength="6" pattern="[0-9]{6}" style="border-radius: 8px;" required>
            <div class="form-text text-success small mt-1 d-none" id="${otpSentMsgId}"><i data-lucide="check" width="14" class="me-1"></i>Code sent successfully!</div>
            <div class="invalid-feedback text-danger small mt-1">Please enter the 6-digit code.</div>
        </div>

            <button type="submit" class="btn btn-primary btn-lg w-100 rounded-pill ${isModal ? 'mb-3' : 'mb-0'}" id="${submitBtnId}" style="font-size: 1rem; font-weight: 600;">${isModal ? 'Login to Continue' : 'Log In'}</button>
        </form>
    `;

    const form = document.getElementById(formId);
    const emailInput = document.getElementById(emailInputId);
    const phoneInput = document.getElementById(phoneInputId);
    const otpInput = document.getElementById(otpInputId);
    const submitBtn = document.getElementById(submitBtnId);
    const phoneTab = document.getElementById(isModal ? 'modal-phone-tab' : 'phone-tab');
    const emailTab = document.getElementById(isModal ? 'modal-email-tab' : 'email-tab');

    // Disable inactive tab input so checkValidity works correctly
    phoneInput.disabled = true;

    if (emailTab) {
        emailTab.addEventListener('shown.bs.tab', () => {
            emailTab.classList.add('text-primary', 'fw-bold');
            emailTab.classList.remove('text-neutral-400', 'fw-medium');
            emailTab.style.setProperty('border-bottom', '2px solid var(--bs-primary)', 'important');

            phoneTab.classList.remove('text-primary', 'fw-bold');
            phoneTab.classList.add('text-neutral-400', 'fw-medium');
            phoneTab.style.setProperty('border-bottom', '2px solid transparent', 'important');

            emailInput.disabled = false;
            emailInput.required = true;
            phoneInput.disabled = true;
            phoneInput.required = false;
            phoneInput.value = '';
            form.classList.remove('was-validated');
        });
    }

    if (phoneTab) {
        phoneTab.addEventListener('shown.bs.tab', () => {
            phoneTab.classList.add('text-primary', 'fw-bold');
            phoneTab.classList.remove('text-neutral-400', 'fw-medium');
            phoneTab.style.setProperty('border-bottom', '2px solid var(--bs-primary)', 'important');

            emailTab.classList.remove('text-primary', 'fw-bold');
            emailTab.classList.add('text-neutral-400', 'fw-medium');
            emailTab.style.setProperty('border-bottom', '2px solid transparent', 'important');

            phoneInput.disabled = false;
            phoneInput.required = true;
            emailInput.disabled = true;
            emailInput.required = false;
            emailInput.value = '';

            // Clear prior validation states
            form.querySelectorAll('.is-invalid, .is-valid').forEach(el => {
                el.classList.remove('is-invalid', 'is-valid');
            });
        });
    }

    import('../../shared/utils.js').then(m => {
        m.setupRealtimeValidation(formId);
    });

    const btnSendOtp = document.getElementById(btnSendOtpId);
    const otpSentMsg = document.getElementById(otpSentMsgId);

    if (btnSendOtp) {
        btnSendOtp.addEventListener('click', (e) => {
            e.preventDefault();
            const activeInput = emailInput.disabled ? phoneInput : emailInput;
            const loginId = activeInput.value.trim();

            if (!loginId) {
                showToast('Warning', 'Please enter your email or phone number first.', 'warning');
                return;
            }

            if (!activeInput.checkValidity()) {
                showToast('Error', 'Please enter a valid ' + (emailInput.disabled ? 'phone number' : 'email address') + '.', 'danger');
                return;
            }

            // Check if user is registered!
            if (!state.users || state.users.length === 0) {
                showToast('System Error', 'User data not loaded yet.', 'warning');
                return;
            }

            const user = state.users.find(u => u.profile.email === loginId || u.profile.phone === loginId);
            if (!user) {
                showToast('Not Registered', 'This ' + (emailInput.disabled ? 'phone' : 'email') + ' is not registered. Please sign up first.', 'warning');
                return;
            }

            if (otpSentMsg) otpSentMsg.classList.remove('d-none');

            showToast(
                'OTP Sent',
                `Mock OTP (123456) sent to your ${emailInput.disabled ? 'phone' : 'email'}.`,
                'success'
            );
        });
    }

    form.addEventListener('submit', (e) => {
        console.log('[Signup] RAW submit event detected');

        e.preventDefault();
        e.stopPropagation();
        form.classList.add('was-validated');

        if (form.checkValidity()) {
            const isEmailFlow = document.getElementById(isModal ? 'modal-email-pane' : 'email-pane').classList.contains('active');
            const loginId = isEmailFlow ? emailInput.value : phoneInput.value;
            const otpCode = otpInput.value;

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Logging in...';

            const success = performLogin(loginId, otpCode, onSuccess);
            if (!success) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = isModal ? 'Login to Continue' : 'Log In';
                otpInput.value = '';
                otpInput.classList.remove('is-valid');
                // The realtime logic will pick up the empty required field and mark it invalid
            }
        }
    });

    window.addEventListener('beforeunload', () => {
        console.log('[Signup] PAGE IS RELOADING');
    });
}
export function setupForgotPassword() {
    const form = document.getElementById('forgotPasswordForm');
    if (!form) return;

    const newPassInput = document.getElementById('fpNewPassword');
    const confirmPassInput = document.getElementById('fpConfirmPassword');

    const validateMatch = () => {
        if (confirmPassInput.value && newPassInput.value !== confirmPassInput.value) {
            confirmPassInput.setCustomValidity("Passwords do not match");
        } else {
            confirmPassInput.setCustomValidity("");
        }
    };
    newPassInput.addEventListener('input', validateMatch);
    confirmPassInput.addEventListener('input', validateMatch);

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        e.stopPropagation();
        form.classList.add('was-validated');

        if (form.checkValidity()) {
            const email = document.getElementById('fpEmail').value;
            const oldPass = document.getElementById('fpOldPassword').value;
            const newPass = document.getElementById('fpNewPassword').value;

            const user = state.users.find(u => u.profile.email === email && u.password === oldPass);

            if (!user) {
                showToast('Error', 'Invalid email or old password.', 'danger');
                return;
            }

            const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*])(?=.{6,})/;
            if (!passwordRegex.test(newPass)) {
                showToast('Error', 'Password must be at least 6 chars, contain 1 uppercase, 1 lowercase, and 1 special char.', 'warning');
                return;
            }

            if (newPass === oldPass) {
                showToast('Error', 'New password cannot be the same as the old password.', 'warning');
                return;
            }

            showToast('Success', 'Password reset successfully! You can now login.', 'success');
            const modalEl = document.getElementById('forgotPasswordModal');
            const modal = window.bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
            form.reset();
            form.classList.remove('was-validated');
        }
    });
}
function validateLoginId(loginId) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[6-9]\d{9}$/; // Indian 10 digit mobile number

    if (emailRegex.test(loginId)) {
        return { valid: true, type: 'email' };
    }

    if (phoneRegex.test(loginId)) {
        return { valid: true, type: 'phone' };
    }

    return { valid: false };
}
