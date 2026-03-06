import { setGlobalData } from './shared/state.js';
import { injectToastContainer, initializeBootstrapComponents, injectSignOutModal, injectBackToTopButton, showRestrictedAccessModal } from './shared/utils.js';
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

    // 0. Global Role-Based Access Control
    if (path.includes('/pages/organizer/') && !path.includes('signup.html')) {
        if (role !== 'ORGANIZER') {
            showRestrictedAccessModal('../../index.html');
            return;
        }
    }

    if (path.includes('/pages/admin/')) {
        if (role !== 'ADMIN') {
            showRestrictedAccessModal('../../index.html');
            return;
        }
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

    // Booking RBAC
    if (path.includes('/events/booking') && role !== 'ATTENDEE') {
        showRestrictedAccessModal('../../index.html');
        return;
    }

    // Dynamic Imports Based on Path

    // About/Contact
    if (path.includes('/about/contact')) {
        const { setupContactForm } = await import('./features/about/about.js');
        setupContactForm();
    }

    // Auth
    if (path.includes('/auth/login')) {
        const { setupLoginForm } = await import('./features/auth/login.js');
        setupLoginForm();
    } else if (path.includes('/auth/signup')) {
        const { setupSignupForm } = await import('./features/auth/signup.js');
        setupSignupForm();
    }

    // Organizer
    if (path.includes('/organizer/signup')) {
        const { setupOrganizerForm, setupFileUploads } = await import('./features/organizer/organizer.js');
        setupOrganizerForm();
        setupFileUploads();
    }

    // Events
    if (path.includes('/events') && !path.includes('details') && !path.includes('booking')) {
        const { initializeEvents, setupGlobalInteractions } = await import('./features/events/events.js');
        whenDataReady(() => initializeEvents());
        setupGlobalInteractions();
    } else if (path.includes('/events/details')) {
        const { initializeDetails } = await import('./features/events/details.js');
        whenDataReady(() => initializeDetails());
    } else if (path.includes('/events/booking')) {
        const { initBookingPage } = await import('./features/events/booking.js');
        whenDataReady(() => initBookingPage());
    }

    // Index (Homepage includes featured events)
    if (path === '/' || path.endsWith('/index.html') || path === '') {
        const { initializeEvents } = await import('./features/events/events.js');
        whenDataReady(() => initializeEvents());
    }

    // Profile
    if (path.includes('/profile')) {
        const { initProfilePage } = await import('./features/profile/profile.js');
        whenDataReady(() => initProfilePage());
    }

    // Globals
    injectComponents();
    injectToastContainer();
    injectSignOutModal();
    injectBackToTopButton();
    window.initIcons();
    initializeBootstrapComponents();
});