import FirestoreService from './FirestoreService.js';

export default class HostManager {
  constructor() {
    this.db = new FirestoreService();
    this.questions = [];
    
    // UI Elements
    this.views = {
      landing: document.getElementById('landing-view'),
      host: document.getElementById('host-view'),
      dashboard: document.getElementById('host-dashboard-view'),
      presenter: document.getElementById('host-presenter-view'),
      leaderboard: document.getElementById('host-question-leaderboard-view')
    };

    this.form = document.getElementById('create-quiz-form');
    this.questionsList = document.getElementById('questions-list');
    this.addBtn = document.getElementById('add-question-btn');
    
    // Presenter State
    this.currentQuizId = null;
    this.quizQuestions = [];
    this.timeLimitPerQuestion = 10;
    this.currentQuestionIndex = 0;
    this.presenterTimerInterval = null;
    this.timeLeft = 0;
    
    // Bind Methods
    this.handleAddQuestion = this.handleAddQuestion.bind(this);
    this.handleCreate = this.handleCreate.bind(this);
  }

  init() {
    if (!this.addBtn || !this.form) return;

    this.addBtn.addEventListener('click', this.handleAddQuestion);
    this.form.addEventListener('submit', this.handleCreate);
    
    // Add one empty question to start
    this.handleAddQuestion();
  }

  handleAddQuestion() {
    const qIndex = this.questionsList.children.length;
    const qId = Date.now(); // Temporary unique ID for DOM element

    const div = document.createElement('div');
    div.className = 'question-builder-item slide-in';
    div.dataset.id = qId;

    div.innerHTML = `
      <div class="input-group">
        <label>Question ${qIndex + 1}</label>
        <input type="text" name="q_text_${qId}" placeholder="Enter question text..." required>
      </div>
      
      <div class="options-inputs">
        <input type="text" name="q_opt0_${qId}" placeholder="Option A" required>
        <input type="text" name="q_opt1_${qId}" placeholder="Option B" required>
        <input type="text" name="q_opt2_${qId}" placeholder="Option C" required>
        <input type="text" name="q_opt3_${qId}" placeholder="Option D" required>
      </div>

      <div class="input-group correct-select">
        <label>Correct Answer</label>
        <select name="q_correct_${qId}" required>
          <option value="0">Option A</option>
          <option value="1">Option B</option>
          <option value="2">Option C</option>
          <option value="3">Option D</option>
        </select>
      </div>

      <button type="button" class="remove-q-btn" onclick="this.parentElement.remove()">
        ✕
      </button>
    `;

    this.questionsList.appendChild(div);
  }

  async handleCreate(e) {
    e.preventDefault();
    
    const title = document.getElementById('new-quiz-title').value;
    const password = document.getElementById('new-quiz-pass').value;
    const timerMinutes = document.getElementById('new-quiz-timer').value || "10";
    
    // Parse Questions from DOM
    const questionItems = this.questionsList.querySelectorAll('.question-builder-item');
    const questionsData = [];

    questionItems.forEach((item, index) => {
      const qId = item.dataset.id;
      const text = item.querySelector(`[name="q_text_${qId}"]`).value;
      
      // Fix: Structure options as objects to match Question.js expected format
      const options = [
        { id: "0", text: item.querySelector(`[name="q_opt0_${qId}"]`).value },
        { id: "1", text: item.querySelector(`[name="q_opt1_${qId}"]`).value },
        { id: "2", text: item.querySelector(`[name="q_opt2_${qId}"]`).value },
        { id: "3", text: item.querySelector(`[name="q_opt3_${qId}"]`).value }
      ];
      
      const correctVal = item.querySelector(`[name="q_correct_${qId}"]`).value;

      questionsData.push({
        id: index + 1,
        questionText: text,
        options: options,
        correctAnswerHash: correctVal, // Matches option.id
        topic: "General", 
        difficulty: "Medium"
      });
    });

    if (questionsData.length === 0) {
      alert("Please add at least one question.");
      return;
    }

    const quizId = this.generateQuizId();
    
    const quizPayload = {
      quizId: quizId,
      password: password,
      title: title,
      questions: questionsData,
      timeLimit: parseInt(timerMinutes) || 10, // Now represents seconds per question
      status: 'OPEN',
      currentQuestionIndex: -1,
      questionStatus: 'WAITING'
    };

    const success = await this.db.createQuiz(quizPayload);

    if (success) {
      this.showLobby(quizId, password);
    } else {
      alert("Error creating quiz. Please try again.");
    }
  }

  generateQuizId() {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  showLobby(id, pass) {
    // Hide Host Form
    this.views.host.classList.add('hidden');
    
    // Show Lobby
    document.getElementById('lobby-view').classList.remove('hidden');
    
    // Update Lobby Info
    document.getElementById('lobby-quiz-id').textContent = id;
    document.getElementById('lobby-quiz-pass').textContent = pass;

    // Listen for players
    const listEl = document.getElementById('lobby-player-list');
    const countEl = document.getElementById('lobby-player-count');
    const startBtn = document.getElementById('start-quiz-btn');

    // Subscribe
    this.playerUnsubscribe = this.db.listenToPlayers(id, (players) => {
        if (players.length === 0) {
            listEl.innerHTML = '<li class="waiting-text">Waiting for players...</li>';
            countEl.textContent = '0';
            startBtn.disabled = true;
        } else {
            listEl.innerHTML = players.map(p => `<li class="player-chip">${p.username}</li>`).join('');
            countEl.textContent = players.length;
            startBtn.disabled = false;
        }
    });

    // Handle Start
    startBtn.onclick = async () => {
        startBtn.textContent = "Starting...";
        startBtn.disabled = true;
        console.log("Game Started by Host!");
        if (this.playerUnsubscribe) this.playerUnsubscribe(); // Stop listening
        
        // Fetch full quiz data to keep questions in memory
        const quizData = await this.db.getQuizById(id, pass);
        this.quizQuestions = quizData.questions;
        this.timeLimitPerQuestion = quizData.timeLimit;
        this.currentQuizId = id;
        this.currentQuestionIndex = 0;

        // Transition to Presenter View
        document.getElementById('lobby-view').classList.add('hidden');
        this.views.presenter.classList.remove('hidden');
        document.getElementById('presenter-quiz-id').textContent = id;
        document.getElementById('presenter-q-total').textContent = this.quizQuestions.length;
        
        // Listen to active answers for the current question
        this.setupPresenterListeners();

        // Start first question
        this.presentQuestion();
    };
    
    // Handle Cancel
    document.getElementById('lobby-home-btn').onclick = () => {
        if (this.playerUnsubscribe) this.playerUnsubscribe();
        location.reload();
    };
  }

  setupPresenterListeners() {
      // Setup the 'Next' buttons
      document.getElementById('presenter-next-btn').onclick = () => this.showQuestionLeaderboard();
      document.getElementById('presenter-continue-btn').onclick = () => this.nextQuestion();
      document.getElementById('host-final-leaderboard-btn').onclick = () => {
         this.views.dashboard.classList.add('hidden');
         document.getElementById('leaderboard-view').classList.remove('hidden');
         // We would ideally call QuizManager's showLeaderboard, but we can do a simple reload or CustomEvent
         window.dispatchEvent(new CustomEvent('showFinalLeaderboard', { detail: this.currentQuizId }));
      };
      document.getElementById('host-home-btn').onclick = () => location.reload();
  }

  async presentQuestion() {
      this.views.leaderboard.classList.add('hidden');
      this.views.presenter.classList.remove('hidden');
      
      const q = this.quizQuestions[this.currentQuestionIndex];
      document.getElementById('presenter-q-current').textContent = this.currentQuestionIndex + 1;
      
      const questionArea = document.getElementById('presenter-question-area');
      
      const labels = ['A.', 'B.', 'C.', 'D.'];

      questionArea.innerHTML = `
          <h2>${q.questionText}</h2>
          <div class="presenter-options-grid">
              ${q.options.map((opt, i) => `
                  <div class="presenter-option" data-id="${opt.id}">
                      <span class="option-label">${labels[i]}</span>
                      <span>${opt.text}</span>
                  </div>
              `).join('')}
          </div>
      `;

      document.getElementById('presenter-answers-count').textContent = "0 Answers";
      document.getElementById('presenter-next-btn').classList.add('hidden');

      // Update Firebase State
      await this.db.updateGameState(this.currentQuizId, {
          status: 'STARTED',
          currentQuestionIndex: this.currentQuestionIndex,
          questionStatus: 'SHOWING_QUESTION',
          questionStartTime: Date.now()
      });

      this.startPresenterTimer();
  }

  startPresenterTimer() {
      this.timeLeft = this.timeLimitPerQuestion;
      const timerEl = document.getElementById('presenter-timer');
      timerEl.textContent = this.timeLeft;
      timerEl.classList.remove('warning');

      if (this.presenterTimerInterval) clearInterval(this.presenterTimerInterval);

      this.presenterTimerInterval = setInterval(() => {
          this.timeLeft--;
          timerEl.textContent = this.timeLeft;

          if (this.timeLeft <= 5) {
              timerEl.classList.add('warning');
          }

          if (this.timeLeft <= 0) {
              clearInterval(this.presenterTimerInterval);
              this.forceEndQuestion();
          }
      }, 1000);
  }

  async forceEndQuestion() {
      // Time is up. Hide next button since we auto-transition
      document.getElementById('presenter-next-btn').classList.add('hidden');
      
      // Highlight correct answer on presenter screen
      const q = this.quizQuestions[this.currentQuestionIndex];
      const options = document.querySelectorAll('.presenter-option');
      options.forEach(opt => {
          if (opt.dataset.id !== q.correctAnswerHash) {
              opt.style.opacity = '0.3';
              opt.style.filter = 'grayscale(1)';
          } else {
              opt.style.transform = 'scale(1.05)';
              opt.style.boxShadow = '0 0 20px hsl(var(--primary))';
              opt.style.zIndex = '10';
              opt.style.borderColor = 'hsl(var(--primary))';
              opt.style.background = 'hsla(var(--primary), 0.2)';
          }
      });

      await this.db.updateGameState(this.currentQuizId, {
          questionStatus: 'SHOWING_RESULT'
      });

      // Auto transition to leaderboard after 3 seconds
      setTimeout(() => {
          this.showQuestionLeaderboard();
      }, 3000);
  }

  async showQuestionLeaderboard() {
        this.views.presenter.classList.add('hidden');
        this.views.leaderboard.classList.remove('hidden');

        await this.db.updateGameState(this.currentQuizId, {
            questionStatus: 'SHOWING_LEADERBOARD'
        });

        const listEl = document.getElementById('host-question-leaderboard-list');
        listEl.innerHTML = '<p class="loading-text">Loading...</p>';

        const scores = await this.db.getQuestionLeaderboard(this.currentQuizId, this.currentQuestionIndex);
        
        if (scores.length === 0) {
            listEl.innerHTML = '<p>No answers recorded.</p>';
        } else {
            listEl.innerHTML = scores.map((s, i) => `
                <div class="leaderboard-row">
                    <span class="rank">#${i + 1}</span>
                    <div class="player-info" style="flex: 1; margin-left: 1rem;">
                        <strong>${s.username}</strong>
                    </div>
                    <div class="player-score" style="text-align: right;">
                        <span style="color: hsl(var(--primary)); font-size: 1.2rem;">${s.timeSpent.toFixed(1)}s</span>
                    </div>
                </div>
            `).join('');
        }
  }

  async nextQuestion() {
      this.currentQuestionIndex++;
      if (this.currentQuestionIndex >= this.quizQuestions.length) {
          // Quiz Over
          this.views.leaderboard.classList.add('hidden');
          this.views.dashboard.classList.remove('hidden');
          await this.db.updateGameState(this.currentQuizId, {
              status: 'FINISHED',
              questionStatus: 'FINISHED'
          });
      } else {
          this.presentQuestion();
      }
  }

  showSuccess(id, pass) {
     // Deprecated in favor of Lobby
     this.showLobby(id, pass);
  }
}
