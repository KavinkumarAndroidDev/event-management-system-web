import { setGlobalData } from './shared/state.js';
import { injectToastContainer, initializeBootstrapComponents, injectSignOutModal, injectBackToTopButton, showRestrictedAccessModal, checkPageAccess } from './shared/utils.js';
import { injectComponents } from './components/navbar.js';

// Safe Lucide initializer
window.initIcons = () => {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    console.log('SyncEvent App Initialized');

    const path = window.location.pathname;
    const userStr = localStorage.getItem('currentUser');
    const user = userStr ? JSON.parse(userStr) : null;
    const role = user?.role?.name;

    // 0. Global Role-Based Access Control (ENFORCED IMMEDIATELY)
    const access = checkPageAccess();
    if (!access.hasAccess) {
        showRestrictedAccessModal(access.redirect);
        return;
    }

    // 1. Fetch Data from API Endpoints - Wrap in a promise we can await later
    const dataPromise = Promise.all([
        fetch('http://localhost:3000/users').then(res => res.json()),
        fetch('http://localhost:3000/events').then(res => res.json()),
        fetch('http://localhost:3000/registrations').then(res => res.json()),
        fetch('http://localhost:3000/payments').then(res => res.json())
    ])
        .then(([users, events, registrations, payments]) => {
            const data = { users, events, registrations, payments };
            setGlobalData(data);
            // Dispatch custom event for legacy compatibility
            document.dispatchEvent(new CustomEvent('dataLoaded', { detail: data }));
            return data;
        })
        .catch(err => {
            console.log('API fetch error:', err);
            return null;
        });

    // Helper: Execute logic only when data is fully loaded and state is ready
    const whenDataReady = async (callback) => {
        const data = await dataPromise;
        if (data && typeof callback === 'function') {
            callback(data);
        }
    };

    // Dynamic Imports Based on Path & Role

    // Admin Logic
    if (path.includes('/pages/admin/')) {
        const { initAdminPage, initOrganizerApprovals } = await import('./features/admin/admin.js');
        initAdminPage();

        if (path.includes('organizer-approval.html')) {
            whenDataReady(() => initOrganizerApprovals());
        }
    }

    // Organizer Logic
    if (path.includes('/pages/organizer/') && !path.includes('signup.html')) {
        const { initAdminPage } = await import('./features/admin/admin.js');
        initAdminPage();

        const {
            initOrganizerDashboard,
            initMyEvents,
            initRegistrations,
            initTicketManagement,
            initReports,
            initOrganizerProfile,
            initOrganizerNotifications
        } = await import('./features/organizer/organizer.js');

        if (path.includes('dashboard.html')) {
            whenDataReady(() => initOrganizerDashboard());
        } else if (path.includes('my-events.html')) {
            whenDataReady(() => initMyEvents());
        } else if (path.includes('registrations.html')) {
            whenDataReady(() => initRegistrations());
        } else if (path.includes('ticket-management.html')) {
            whenDataReady(() => initTicketManagement());
        } else if (path.includes('reports.html')) {
            whenDataReady(() => initReports());
        } else if (path.includes('profile.html')) {
            whenDataReady(() => initOrganizerProfile());
        } else if (path.includes('notifications.html')) {
            whenDataReady(() => initOrganizerNotifications());
        }
    }

    // Guest/Common logic for Organizer Signup
    if (path.includes('/organizer/signup')) {
        const { setupOrganizerForm, setupFileUploads } = await import('./features/organizer/organizer.js');
        setupOrganizerForm();
        setupFileUploads();
    }

    // Events (Common & Attendee Specific)
    if (path.includes('/events') && !path.includes('details') && !path.includes('booking')) {
        const { initializeEvents, setupGlobalInteractions } = await import('./features/events/events.js');
        whenDataReady(() => initializeEvents());
        setupGlobalInteractions();
    } else if (path.includes('/events/details')) {
        const { initializeDetails } = await import('./features/events/details.js');
        const { validateBookingAccess } = await import('./features/attendee/attendee.js');
        whenDataReady(() => {
            initializeDetails();
            validateBookingAccess(role);
        });
    } else if (path.includes('/events/booking')) {
        const { initBookingPage } = await import('./features/events/booking.js');
        whenDataReady(() => initBookingPage());
    }

    // Index (Homepage includes featured events)
    if (path === '/' || path.endsWith('/index.html') || path === '') {
        const { initializeEvents } = await import('./features/events/events.js');
        whenDataReady(() => initializeEvents());
    }

    // Profile (Attendee Only)
    // Only run attendee profile logic for the main attendee profile page
    if (path.includes('/pages/profile/')) {
        const { initProfilePage } = await import('./features/profile/profile.js');
        whenDataReady(() => initProfilePage());
    }

    // Auth
    if (path.includes('/auth/login')) {
        const { setupLoginForm } = await import('./features/auth/login.js');
        setupLoginForm();
    } else if (path.includes('/auth/signup')) {
        const { setupSignupForm } = await import('./features/auth/signup.js');
        setupSignupForm();
    }

    // Common feature logic
    if (path.includes('/about/contact')) {
        const { setupContactForm } = await import('./features/about/about.js');
        setupContactForm();
    }

    // Globals
    injectComponents();
    injectToastContainer();
    injectSignOutModal();
    injectBackToTopButton();
    window.initIcons();
    initializeBootstrapComponents();
});