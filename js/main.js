import QuizManager from './QuizManager.js';
import HostManager from './HostManager.js';
import Player from './Player.js';
import FirestoreService from './FirestoreService.js';

// DOM Elements
const views = {
    landing: document.getElementById('landing-view'),
    join: document.getElementById('join-view'),
    host: document.getElementById('host-view'),
    hostDashboard: document.getElementById('host-dashboard-view')
};

const buttons = {
    hostMode: document.getElementById('btn-mode-host'),
    joinMode: document.getElementById('btn-mode-join')
};

const forms = {
    join: document.getElementById('join-form')
};

// Initialize Managers
console.log("Initializing Quiz Application...");
const quizApp = new QuizManager();
const hostApp = new HostManager();
const db = new FirestoreService(); // For Join Validation

quizApp.init();
hostApp.init();

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

// --- NAVIGATION LOGIC ---

// 1. Landing -> Host
if (buttons.hostMode) {
    buttons.hostMode.addEventListener('click', () => {
        console.log("Switching to Host View");
        switchView('host');
    });
} else {
    console.error("Host Button not found!");
}

// --- NAVIGATION LOGIC (Global Delegation) ---

document.body.addEventListener('click', (e) => {
    // Helper to find button even if clicking internal icon/span
    const target = e.target.closest('button');
    if (!target) return;

    const id = target.id;
    console.log(`Click detected on: ${id}`);

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

    // 3. Back Buttons & Cancel
    if (target.classList.contains('back-btn')) {
        const targetView = target.dataset.target;
        if (targetView) {
            switchView(targetView.replace('-view', ''));
        }
        return;
    }

    // 4. Host Dashboard -> Home
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
