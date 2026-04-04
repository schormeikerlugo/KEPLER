/**
 * Mobile Menu Module
 * Handles hamburger menu toggle, navigation, and mobile-specific interactions
 */

import { auth } from '../../../../js/auth.js';

export function initMobileMenu(user, missionModal) {
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const mobileNav = document.getElementById('mobile-nav');
    const mobileNavOverlay = document.getElementById('mobile-nav-overlay');
    const mobileNavClose = document.getElementById('mobile-nav-close');

    const openMobileMenu = () => {
        if (mobileNav) mobileNav.classList.add('active');
        if (mobileNavOverlay) mobileNavOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    const closeMobileMenu = () => {
        if (mobileNav) mobileNav.classList.remove('active');
        if (mobileNavOverlay) mobileNavOverlay.classList.remove('active');
        document.body.style.overflow = '';
    };

    // Toggle button
    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', openMobileMenu);
    }

    // Close button
    if (mobileNavClose) {
        mobileNavClose.addEventListener('click', closeMobileMenu);
    }

    // Overlay click to close
    if (mobileNavOverlay) {
        mobileNavOverlay.addEventListener('click', closeMobileMenu);
    }

    // Update mobile user info
    if (user) {
        const mobileUserName = document.getElementById('mobile-user-name');
        const mobileUserEmail = document.getElementById('mobile-user-email');
        const mobileUserAvatar = document.getElementById('mobile-user-avatar');

        if (mobileUserName) mobileUserName.textContent = user.email.split('@')[0];
        if (mobileUserEmail) mobileUserEmail.textContent = user.email;
        if (mobileUserAvatar) mobileUserAvatar.textContent = user.email[0].toUpperCase();

        // Handle profile click
        const mobileNavUser = document.getElementById('mobile-nav-user');
        if (mobileNavUser) {
            mobileNavUser.addEventListener('click', () => {
                window.kepler?.navigate?.('/profile') || (window.location.href = '/src/features/profile/profile.html');
            });
        }
    }

    // Mobile menu button handlers
    const mobileBtnStartMission = document.getElementById('mobile-btn-start-mission');
    const mobileBtnArchives = document.getElementById('mobile-btn-archives');
    const mobileBtnTaxonomia = document.getElementById('mobile-btn-taxonomia');
    const mobileBtnLogout = document.getElementById('mobile-btn-logout');

    if (mobileBtnStartMission) {
        mobileBtnStartMission.addEventListener('click', () => {
            closeMobileMenu();
            if (missionModal) missionModal.style.display = 'flex';
        });
    }

    if (mobileBtnArchives) {
        mobileBtnArchives.addEventListener('click', () => {
            closeMobileMenu();
            window.kepler.navigate('/archives');
        });
    }

    if (mobileBtnTaxonomia) {
        mobileBtnTaxonomia.addEventListener('click', () => {
            closeMobileMenu();
            window.kepler.navigate('/taxonomia');
        });
    }

    if (mobileBtnLogout) {
        mobileBtnLogout.addEventListener('click', async () => {
            await auth.logout();
            window.location.href = '/';
        });
    }

    // Mobile notifications button - toggle Bitácora
    const mobileBtnNotifications = document.getElementById('mobile-btn-notifications');
    if (mobileBtnNotifications) {
        mobileBtnNotifications.addEventListener('click', () => {
            closeMobileMenu();
            if (window.kepler && window.kepler.notify) {
                window.kepler.notify.toggleLog();
            }
        });
    }

    // Mobile map button - open map view
    const mobileBtnMap = document.getElementById('mobile-btn-map');
    console.log('📱 Mobile menu: map button found?', !!mobileBtnMap);

    if (mobileBtnMap) {
        mobileBtnMap.addEventListener('click', () => {
            console.log('📱 Mobile map button clicked');
            closeMobileMenu();

            console.log('📱 window.kepler:', window.kepler);
            console.log('📱 window.kepler.map:', window.kepler?.map);

            if (window.kepler && window.kepler.map) {
                console.log('📱 Calling openMap...');
                window.kepler.map.openMap();
            } else {
                console.error('📱 ERROR: window.kepler.map not available!');
            }
        });
    }

    // Mobile routes button
    const mobileBtnRoutes = document.getElementById('mobile-btn-routes');
    if (mobileBtnRoutes) {
        mobileBtnRoutes.addEventListener('click', () => {
            closeMobileMenu();
            window.location.href = '/routes';
        });
    }
}
