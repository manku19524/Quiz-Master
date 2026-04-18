import FirestoreService from './FirestoreService.js';

export default class AuthManager {
  constructor() {
    this.db = new FirestoreService();
    this.currentUser = null;
    this.onAuthChange = null; // Callback: (user) => {}

    // DOM Elements
    this.authView = document.getElementById('auth-view');
    this.createForm = document.getElementById('create-account-form');
    this.signInForm = document.getElementById('sign-in-form');
    this.createPanel = document.getElementById('create-panel');
    this.signInPanel = document.getElementById('sign-in-panel');
    this.tabCreate = document.getElementById('auth-tab-create');
    this.tabSignIn = document.getElementById('auth-tab-signin');
    this.logoutBtn = document.getElementById('logout-btn');
    this.userBadge = document.getElementById('user-badge');
    this.userBadgeName = document.getElementById('user-badge-name');
  }

  init(onAuthChange) {
    this.onAuthChange = onAuthChange;

    // Tab switching
    if (this.tabCreate) {
      this.tabCreate.addEventListener('click', () => this.showTab('create'));
    }
    if (this.tabSignIn) {
      this.tabSignIn.addEventListener('click', () => this.showTab('signin'));
    }

    // Form submissions
    if (this.createForm) {
      this.createForm.addEventListener('submit', (e) => this.handleCreateAccount(e));
    }
    if (this.signInForm) {
      this.signInForm.addEventListener('submit', (e) => this.handleSignIn(e));
    }

    // Logout
    if (this.logoutBtn) {
      this.logoutBtn.addEventListener('click', () => this.logout());
    }

    // Check saved session
    this.checkSession();
  }

  showTab(tab) {
    if (tab === 'create') {
      this.createPanel.classList.remove('hidden');
      this.signInPanel.classList.add('hidden');
      this.tabCreate.classList.add('active');
      this.tabSignIn.classList.remove('active');
    } else {
      this.signInPanel.classList.remove('hidden');
      this.createPanel.classList.add('hidden');
      this.tabSignIn.classList.add('active');
      this.tabCreate.classList.remove('active');
    }
  }

  checkSession() {
    const savedUser = localStorage.getItem('quizmaster_user');
    if (savedUser) {
      this.currentUser = JSON.parse(savedUser);
      this.updateUI(true);
      if (this.onAuthChange) this.onAuthChange(this.currentUser);
    } else {
      this.updateUI(false);
      if (this.onAuthChange) this.onAuthChange(null);
    }
  }

  async handleCreateAccount(e) {
    e.preventDefault();

    const username = document.getElementById('create-username').value.trim();
    const password = document.getElementById('create-password').value;
    const errorEl = document.getElementById('create-error');
    const btn = this.createForm.querySelector('button[type="submit"]');

    if (!username || !password) return;
    if (password.length < 4) {
      this.showError(errorEl, "Password must be at least 4 characters.");
      return;
    }

    btn.textContent = "Creating...";
    btn.disabled = true;
    this.hideError(errorEl);

    const result = await this.db.createUser(username, password);

    if (result.success) {
      this.currentUser = { username };
      localStorage.setItem('quizmaster_user', JSON.stringify(this.currentUser));
      this.updateUI(true);
      if (this.onAuthChange) this.onAuthChange(this.currentUser);
    } else {
      this.showError(errorEl, result.error);
    }

    btn.textContent = "Create Account";
    btn.disabled = false;
  }

  async handleSignIn(e) {
    e.preventDefault();

    const username = document.getElementById('signin-username').value.trim();
    const password = document.getElementById('signin-password').value;
    const errorEl = document.getElementById('signin-error');
    const btn = this.signInForm.querySelector('button[type="submit"]');

    if (!username || !password) return;

    btn.textContent = "Signing In...";
    btn.disabled = true;
    this.hideError(errorEl);

    const result = await this.db.loginUser(username, password);

    if (result.success) {
      this.currentUser = result.user;
      localStorage.setItem('quizmaster_user', JSON.stringify(this.currentUser));
      this.updateUI(true);
      if (this.onAuthChange) this.onAuthChange(this.currentUser);
    } else {
      this.showError(errorEl, result.error);
    }

    btn.textContent = "Sign In";
    btn.disabled = false;
  }

  logout() {
    this.currentUser = null;
    localStorage.removeItem('quizmaster_user');
    this.updateUI(false);
    if (this.onAuthChange) this.onAuthChange(null);
  }

  updateUI(loggedIn) {
    if (loggedIn && this.currentUser) {
      // Show user badge
      if (this.userBadge) this.userBadge.classList.remove('hidden');
      if (this.userBadgeName) this.userBadgeName.textContent = this.currentUser.username;
    } else {
      if (this.userBadge) this.userBadge.classList.add('hidden');
    }
  }

  showError(el, msg) {
    if (el) {
      el.textContent = msg;
      el.classList.remove('hidden');
    }
  }

  hideError(el) {
    if (el) {
      el.classList.add('hidden');
    }
  }

  getUsername() {
    return this.currentUser ? this.currentUser.username : null;
  }
}
