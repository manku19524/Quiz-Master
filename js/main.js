import QuizManager from './QuizManager.js';
import HostManager from './HostManager.js';
import Player from './Player.js';
import FirestoreService from './FirestoreService.js';
import AuthManager from './AuthManager.js';

// DOM Elements
const views = {
    auth: document.getElementById('auth-view'),
    landing: document.getElementById('landing-view'),
    join: document.getElementById('join-view'),
    host: document.getElementById('host-view'),
    hostDashboard: document.getElementById('host-dashboard-view'),
    savedQuizzes: document.getElementById('saved-quizzes-view')
};

const buttons = {
    hostMode: document.getElementById('btn-mode-host'),
    joinMode: document.getElementById('btn-mode-join'),
    myQuizzes: document.getElementById('btn-my-quizzes')
};

const forms = {
    join: document.getElementById('join-form')
};

// Initialize Managers
console.log("Initializing Quiz Application...");
const quizApp = new QuizManager();
const hostApp = new HostManager();
const db = new FirestoreService(); // For Join Validation
const auth = new AuthManager();

quizApp.init();
hostApp.init();

// --- AUTH FLOW ---
auth.init((user) => {
    if (user) {
        // User is logged in
        console.log("User logged in:", user.username);
        hostApp.currentUser = user.username;
        switchView('landing');
    } else {
        // User is not logged in
        console.log("No user session");
        switchView('auth');
    }
});

// Auto-reconnect player if session exists
window.addEventListener('DOMContentLoaded', async () => {
    const savedQuizId = localStorage.getItem('activeQuizId');
    const savedPass = localStorage.getItem('activeQuizPass');
    const savedPlayerName = localStorage.getItem('playerName');
    
    if (savedQuizId && savedPlayerName && !window.location.hash.includes('host')) {
        console.log("Attempting auto-reconnect...");
        try {
            await db.getQuizById(savedQuizId, savedPass || '');
            quizApp.currentPlayer = new Player(savedPlayerName, "General", "Any");
            switchView('waiting');
            await quizApp.joinQuiz(savedQuizId, savedPass || '', quizApp.currentPlayer);
        } catch (e) {
            console.warn("Auto-reconnect failed:", e);
            localStorage.removeItem('activeQuizId');
            localStorage.removeItem('activeQuizPass');
            localStorage.removeItem('playerName');
        }
    }
});
// EXPOSE DEBUG TOOLS
window.deleteQuiz = (quizId) => db.deleteQuiz(quizId);
console.log("Debug Tool: Run 'deleteQuiz(ID)' in console to remove a quiz.");
window.deleteAllData = () => db.deleteAllData();
console.log("Debug Tool: Run 'deleteAllData()' in console to completely clear the database (quizzes, questions, leaderboard).");

// --- NAVIGATION LOGIC (Global Delegation) ---

document.body.addEventListener('click', (e) => {
    // Helper to find button even if clicking internal icon/span
    const target = e.target.closest('button');
    if (!target) return;

    const id = target.id;

    // 1. Landing -> Host
    if (id === 'btn-mode-host') {
        switchView('host');
        return;
    }

    // 2. Landing -> Join
    if (id === 'btn-mode-join') {
        switchView('join');
        return;
    }

    // 3. Landing -> My Saved Quizzes
    if (id === 'btn-my-quizzes') {
        switchView('savedQuizzes');
        loadSavedQuizzes();
        return;
    }

    // 4. Back Buttons & Cancel
    if (target.classList.contains('back-btn')) {
        const targetView = target.dataset.target;
        if (targetView) {
            switchView(targetView.replace('-view', ''));
        }
        return;
    }

    // 5. Host Dashboard -> Home
    if (id === 'host-home-btn') {
        location.reload(); 
        return;
    }
});


// --- JOIN LOGIC (PLAYER) ---

// --- JOIN LOGIC (Global Delegation) ---

document.body.addEventListener('submit', async (e) => {
    // Check if the submitted form is the join form
    if (e.target.id !== 'join-form') return;

    e.preventDefault();
    console.log("Join Form Submitted");

    const form = e.target;
    const playerName = document.getElementById('player-name').value;
    const quizId = document.getElementById('quiz-id-input').value;
    const password = document.getElementById('quiz-pass-input').value; // password input
    const errorMsg = document.getElementById('join-error');

    if (!playerName || !quizId || !password) {
        console.warn("Missing fields");
        return;
    }

    // Reset Error
    if (errorMsg) errorMsg.classList.add('hidden');
    
    // Show Loading State
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = "Verifying...";
    submitBtn.disabled = true;

    try {
        console.log(`Verifying Quiz ID: ${quizId}`);
        
        // Validate Credentials
        // Note: db access relies on 'db' being initialized in scope.
        // If strict mode prevents this, we'll need to move db to window or broader scope.
        // Assuming db is available here due to module scope hoisting/closure.
        
        const quizData = await db.getQuizById(quizId, password);
        
        // Name validation against existing lobby
        const nameExists = await db.checkPlayerExists(quizId, playerName);
        if (nameExists) {
            throw new Error(`The name "${playerName}" is already taken in this quiz. Please choose another.`);
        }
        
        console.log("Join Success:", quizData);

        // Save session
        localStorage.setItem('activeQuizId', quizId);
        localStorage.setItem('activeQuizPass', password);
        localStorage.setItem('playerName', playerName);

        // Initialize Player
        quizApp.currentPlayer = new Player(playerName, "General", "Any"); 
        
        // Enter Waiting Room (Lobby)
        await quizApp.joinQuiz(quizId, password, quizApp.currentPlayer); 

    } catch (error) {
        console.error("Join Failed:", error);
        if (errorMsg) {
            errorMsg.textContent = error.message || "Invalid ID or Password";
            errorMsg.classList.remove('hidden');
        } else {
            alert(`Error: ${error.message}`);
        }
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
});

// --- SAVED QUIZZES LOGIC ---

async function loadSavedQuizzes() {
    const listEl = document.getElementById('saved-quizzes-list');
    if (!listEl) return;

    const username = auth.getUsername();
    if (!username) {
        listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔒</div><h3>Please sign in</h3><p>You need to be signed in to see your saved quizzes.</p></div>';
        return;
    }

    listEl.innerHTML = '<div class="loading-state"><div class="loader"></div><p>Loading your quizzes...</p></div>';

    const quizzes = await db.getSavedQuizzes(username);

    if (quizzes.length === 0) {
        listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><h3>No saved quizzes yet</h3><p>Create a quiz and save it to host later!</p></div>';
        return;
    }

    listEl.innerHTML = quizzes.map(quiz => `
        <div class="saved-quiz-card" data-id="${quiz.id}">
            <div class="saved-quiz-info">
                <h3 class="saved-quiz-title">${quiz.title}</h3>
                <div class="saved-quiz-meta">
                    <span>📝 ${quiz.questions.length} question${quiz.questions.length !== 1 ? 's' : ''}</span>
                    <span>⏱️ ${quiz.timeLimit}s per question</span>
                </div>
            </div>
            <div class="saved-quiz-actions">
                <button class="btn-host-saved btn-primary" data-quiz-id="${quiz.id}">🚀 Host Now</button>
                <button class="btn-delete-saved nav-btn" data-quiz-id="${quiz.id}">🗑️ Delete</button>
            </div>
        </div>
    `).join('');

    // Attach handlers
    listEl.querySelectorAll('.btn-host-saved').forEach(btn => {
        btn.addEventListener('click', () => hostSavedQuiz(btn.dataset.quizId));
    });
    listEl.querySelectorAll('.btn-delete-saved').forEach(btn => {
        btn.addEventListener('click', () => deleteSavedQuiz(btn.dataset.quizId));
    });
}

async function hostSavedQuiz(docId) {
    const quiz = await db.getSavedQuizById(docId);
    if (!quiz) {
        showToast('Could not load quiz data.', 'error');
        return;
    }

    const quizId = Math.floor(1000 + Math.random() * 9000).toString();

    const quizPayload = {
        quizId: quizId,
        password: quiz.password,
        title: quiz.title,
        questions: quiz.questions,
        timeLimit: quiz.timeLimit,
        status: 'OPEN',
        currentQuestionIndex: -1,
        questionStatus: 'WAITING'
    };

    const success = await db.createQuiz(quizPayload);

    if (success) {
        // Hide saved quizzes view and show lobby via HostManager
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        hostApp.showLobby(quizId, quiz.password);
    } else {
        showToast('Error publishing quiz. Please try again.', 'error');
    }
}

async function deleteSavedQuiz(docId) {
    if (!confirm('Are you sure you want to delete this saved quiz?')) return;

    const success = await db.deleteSavedQuiz(docId);
    if (success) {
        showToast('Quiz deleted.');
        loadSavedQuizzes(); // Refresh the list
    } else {
        showToast('Failed to delete quiz.', 'error');
    }
}

// --- TOAST UTILITY ---

function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-message');
    if (!toast || !toastMsg) return;
    toastMsg.textContent = msg;
    toast.className = 'toast ' + (type === 'error' ? 'toast-error' : 'toast-success');
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3500);
}

// Helper to switch views (matches logic in QuizManager but global here for Landing)
function switchView(viewName) {
    console.log(`Switching view to: ${viewName}`);
    // Hides all views
    document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
    
    // Host Dashboard is special
    const target = views[viewName] || document.getElementById(viewName + '-view');
    if (target) {
        target.classList.remove('hidden');
    } else {
        console.error(`View not found: ${viewName}`);
    }
}
