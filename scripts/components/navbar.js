export function injectComponents() {
  const path = window.location.pathname;
  const isNestedPage = path.includes('/pages/');

  // Calculate relative path to root based on directory depth
  let rootPath = './';
  if (isNestedPage) {
    // If we are at /pages/auth/login.html, we need to go up two directories
    rootPath = '../../';
  }

  const userStr = localStorage.getItem('currentUser');
  const user = userStr ? JSON.parse(userStr) : null;

  injectHeader(rootPath, user, path);
  injectOrganizerCTA(rootPath);
  injectFooter(rootPath);

  if (window.initIcons) window.initIcons();
}

function injectHeader(rootPath, user, currentPath) {
  const header = document.querySelector('.site-header');
  if (!header) return;

  const isHome = currentPath === '/' || (currentPath.endsWith('/index.html') && !currentPath.includes('/pages/'));
  const isEvents = currentPath.includes('/pages/events/');
  const isAbout = currentPath.includes('/pages/about/index.html');
  const isContact = currentPath.includes('/pages/about/contact.html');

  let rightContent = '';

  if (user) {
    const initials = user.profile.fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const firstName = user.profile.fullName.split(' ')[0];

    let profileUrl = `${rootPath}pages/profile/index.html`;
    if (user.role && user.role.name === 'ADMIN') {
      profileUrl = `${rootPath}pages/admin/profile.html`;
    } else if (user.role && user.role.name === 'ORGANIZER') {
      profileUrl = `${rootPath}pages/organizer/profile.html`;
    }

    rightContent = `
            <a href="${rootPath}pages/notifications/index.html" class="icon-circle btn p-0 me-2 text-decoration-none d-inline-flex align-items-center justify-content-center">
                <i data-lucide="bell" width="20" height="20"></i>
            </a>
            <div class="dropdown d-inline-block">
                <div class="d-flex align-items-center gap-2 cursor-pointer" data-bs-toggle="dropdown" aria-expanded="false" style="cursor: pointer;">
                    <span class="avatar-circle">${initials}</span>
                    <span class="welcome-text d-none d-sm-inline-block">Welcome, ${firstName}</span>
                </div>
                <ul class="dropdown-menu dropdown-menu-end">
                    <li><a class="dropdown-item" href="${profileUrl}">My Profile</a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><button class="dropdown-item text-danger" id="logoutBtn">Logout</button></li>
                </ul>
            </div>
        `;
  } else {
    rightContent = `
            <div id="guestState" class="auth-state">
                <a href="${rootPath}pages/auth/login.html" class="btn btn-link text-white text-decoration-none">Login</a>
                <a href="${rootPath}pages/auth/signup.html" class="btn btn-primary">
                    <span>Signup</span>
                    <svg class="btn-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                </a>
            </div>
        `;
  }

  // Role-based home redirection
  let homeUrl = `${rootPath}index.html`;
  if (user) {
    if (user.role.name === 'ORGANIZER') homeUrl = `${rootPath}pages/organizer/dashboard.html`;
    else if (user.role.name === 'ADMIN') homeUrl = `${rootPath}pages/admin/dashboard.html`;
  }

  header.innerHTML = `
    <nav class="navbar navbar-expand-lg py-3">
      <div class="container-custom w-100 px-0 d-flex align-items-center justify-content-between">
        
        <!-- Logo -->
        <a class="navbar-brand py-0 m-0" href="${homeUrl}">
          <img src="${rootPath}assets/Light logo.SVG" alt="SyncEvent" height="40">
        </a>
        
        <!-- Actions & Hamburger (Right) -->
        <div class="d-flex align-items-center gap-2 gap-lg-3 order-lg-last">
            <!-- Desktop Right Content -->
            <div class="d-none d-lg-flex align-items-center gap-3">
                ${rightContent}
            </div>
            
            <!-- Hamburger Toggle -->
            <button class="navbar-toggler border-0 shadow-none px-2" type="button" data-bs-toggle="collapse" data-bs-target="#navbarContent" aria-controls="navbarContent" aria-expanded="false" aria-label="Toggle navigation">
                <i data-lucide="menu" width="28" height="28" class="text-white"></i>
            </button>
        </div>
        
        <!-- Collapsible Content -->
        <div class="collapse navbar-collapse" id="navbarContent" style="background: transparent;">
            
            <!-- Centered Links -->
            <ul class="navbar-nav mx-auto mb-3 mb-lg-0 gap-1 gap-lg-3 text-center mt-3 mt-lg-0">
                <li class="nav-item">
                    <a href="${homeUrl}" class="nav-link fw-medium ${isHome ? 'active' : ''}">Home</a>
                </li>
                <li class="nav-item">
                    <a href="${rootPath}pages/events/index.html" class="nav-link fw-medium ${isEvents ? 'active' : ''}">Events</a>
                </li>
                <li class="nav-item">
                    <a href="${rootPath}pages/about/index.html" class="nav-link fw-medium ${isAbout ? 'active' : ''}">About</a>
                </li>
                <li class="nav-item">
                    <a href="${rootPath}pages/about/contact.html" class="nav-link fw-medium ${isContact ? 'active' : ''}">Contact</a>
                </li>
            </ul>
            
            <!-- Mobile Right Content (inside collapse) -->
            <div class="d-flex d-lg-none align-items-center justify-content-center gap-3 pb-3 mt-2">
                ${rightContent}
            </div>

        </div>
      </div>
    </nav>`;

  // Handle Logout Logic
  setTimeout(() => {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        const modalEl = document.getElementById('signOutModal');
        if (modalEl) new window.bootstrap.Modal(modalEl).show();
      });
    }
  }, 0);
}

function injectOrganizerCTA(rootPath) {
  const ctaSections = document.querySelectorAll('.organizercta-neutral-900');
  ctaSections.forEach(cta => {
    cta.innerHTML = `
        <div class="container-custom">
            <div class="d-flex flex-column flex-md-row justify-content-between align-items-center gap-3">
                <div class="d-flex align-items-center gap-3">
                    <i data-lucide="ticket" width="22" height="22" class="cta-icon"></i>
                    <div class="d-flex align-items-center flex-wrap gap-2">
                        <h6 class="mb-0 fw-semibold">List your Show</h6>
                        <span class="text-white-50 small">Got a show, event, activity or a great experience? Partner with us & get listed on SyncEvent</span>
                    </div>
                </div>
                <button class="btn btn-success rounded-pill px-4 d-flex align-items-center gap-2" onclick="window.location.href='${rootPath}pages/organizer/signup.html'">
                    Register now! <i data-lucide="arrow-right" width="18" height="18"></i>
                </button>
            </div>
        </div>`;
  });
}

function injectFooter(rootPath) {
  const footer = document.querySelector('.footer-main');
  if (!footer) return;

  footer.innerHTML = `
    <div class="container-custom">
      <div class="footer-grid">
        <div>
          <a class="brand footer-brand" href="${rootPath}index.html"><img src="${rootPath}assets/Light logo.SVG" alt="SyncEvent"></a>
          <p class="mb-0" style="max-width: 300px;">Lorem ipsum dolor sit amet. Et neque atque est architecto quia quo excepturi pariatur est sunt aperiam. Ab vero veniam ea consequatur quod nam optio voluptate.</p>
        </div>
        <div>
          <h4 class="footer-col-title">Navigation</h4>
          <div class="footer-links">
            <a class="footer-link" href="${rootPath}index.html">Home</a>
            <a class="footer-link" href="${rootPath}pages/events/index.html">Events</a>
            <a class="footer-link" href="${rootPath}pages/about/index.html">About</a>
            <a class="footer-link" href="${rootPath}pages/about/contact.html" target="_blank">FAQ</a>
            <a class="footer-link" href="${rootPath}pages/about/contact.html" target="_blank">Contact</a>
          </div>
        </div>
        <div>
          <h4 class="footer-col-title">Contact</h4>
          <div class="footer-contact-item">
            <svg class="social-icon" viewBox="0 0 16 16" fill="none"><path d="M8 14s5-3.8 5-8A5 5 0 0 0 3 6c0 4.2 5 8 5 8z" stroke="currentColor" stroke-width="1.3"></path><circle cx="8" cy="6" r="1.7" stroke="currentColor" stroke-width="1.3"></circle></svg>
            <span>303 RS Puram, Coimbatore, Tn</span>
          </div>
          <div class="footer-contact-item">
            <svg class="social-icon" viewBox="0 0 16 16" fill="none"><path d="M2.8 2.8h2.2l1.1 2.7-1.3 1.2a9 9 0 0 0 4.5 4.5l1.2-1.3 2.7 1.1v2.2A1.6 1.6 0 0 1 11.6 15 10.8 10.8 0 0 1 1 4.4 1.6 1.6 0 0 1 2.8 2.8z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"></path></svg>
            <span>89036 73410</span>
          </div>
          <div class="footer-contact-item">
            <svg class="social-icon" viewBox="0 0 16 16" fill="none"><rect x="1.8" y="3" width="12.4" height="10" rx="1.6" stroke="currentColor" stroke-width="1.2"></rect><path d="M2.5 4l5.5 4 5.5-4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>
            <span>contact@ems.com</span>
          </div>
        </div>
      </div>
      <hr class="footer-divider">
      <div class="footer-bottom">
        <p class="footer-legal mb-0">By accessing this page, you confirm that you have read, understood, and agreed to our Terms of Service, Cookie Policy, Privacy Policy, and Content Guidelines. All rights reserved.</p>
        <div class="social-list">
          <a class="footer-link" href="#" aria-label="Facebook" target="_blank"><svg class="social-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M9.3 15V8.6h2.1l.3-2.5H9.3V4.6c0-.7.2-1.2 1.2-1.2h1.3V1.2c-.2 0-1-.1-1.8-.1-1.8 0-3.1 1.1-3.1 3.2V6H4.8v2.5h2.1V15h2.4z"></path></svg></a>
          <a class="footer-link" href="#" aria-label="Instagram" target="_blank"><svg class="social-icon" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="3" stroke="currentColor" stroke-width="1.3"></rect><circle cx="8" cy="8" r="2.5" stroke="currentColor" stroke-width="1.3"></circle><circle cx="11.7" cy="4.3" r=".7" fill="currentColor"></circle></svg></a>
          <a class="footer-link" href="#" aria-label="X" target="_blank"><svg class="social-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M1 1h3.4L7.5 5l3.1-4H14l-4.8 6.1L14.5 15H11l-3.5-4.4L3.9 15H1l5-6.4L1 1z"></path></svg></a>
          <a class="footer-link" href="#" aria-label="YouTube" target="_blank"><svg class="social-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M8.051 1.999h.089c.822.003 4.987.033 6.11.335a2.01 2.01 0 0 1 1.415 1.42c.101.38.172.883.22 1.402l.01.104.022.26.008.104c.065.914.073 1.77.074 1.957v.075c-.001.194-.01 1.108-.082 2.06l-.008.105-.009.104c-.05.572-.124 1.14-.235 1.558a2.007 2.007 0 0 1-1.415 1.42c-1.16.312-5.569.334-6.18.335h-.142c-.309 0-1.587-.006-2.927-.052l-.17-.006-.087-.004-.171-.007-.171-.007c-1.11-.049-2.167-.128-2.654-.26a2.007 2.007 0 0 1-1.415-1.419c-.111-.417-.185-.986-.235-1.558L.09 9.82l-.008-.104A31.4 31.4 0 0 1 0 7.68v-.123c.002-.215.01-.958.064-1.778l.007-.103.003-.052.008-.104.022.26.01-.104c.048-.519.119-1.023.22-1.402a2.007 2.007 0 0 1 1.415-1.42c.487-.13 1.544-.21 2.654-.26l.17-.007.172-.006.086-.003.171-.007A99.788 99.788 0 0 1 7.858 2h.193zM6.4 5.209v4.818l4.157-2.408L6.4 5.209z"/></svg></a>
        </div>
      </div>
    </div>`;
}