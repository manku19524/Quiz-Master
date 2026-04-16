import Question from './Question.js';
import Player from './Player.js';
import Analytics from './Analytics.js';
import FirestoreService from './FirestoreService.js';

export default class QuizManager {
  constructor() {
    this.currentPlayer = null;
    this.quizQuestions = [];
    this.currentQuestionIndex = -1;
    this.analytics = new Analytics();
    this.db = new FirestoreService();
    this.currentQuizId = null;

    // DOM Elements
    this.views = {
      landing: document.getElementById('landing-view'),
      join: document.getElementById('join-view'),
      host: document.getElementById('host-view'),
      hostDashboard: document.getElementById('host-dashboard-view'),
      quiz: document.getElementById('quiz-view'),
      waiting: document.getElementById('waiting-view'),
      result: document.getElementById('result-view'),
      leaderboard: document.getElementById('leaderboard-view'),
      'student-leaderboard-view': document.getElementById('student-leaderboard-view')
    };

    this.ui = {
      questionContainer: document.getElementById('question-container'),
      currentQNum: document.getElementById('q-current'),
      totalQNum: document.getElementById('q-total'),
      restartBtn: document.getElementById('restart-btn'),
      backHomeBtn: document.getElementById('back-home-btn'),
      leaderboardList: document.getElementById('leaderboard-list'),
      studentResultCard: document.getElementById('student-result-card'),
      studentResultTitle: document.getElementById('student-result-title'),
      studentResultPoints: document.getElementById('student-result-points'),
      playerScoreDisplay: document.getElementById('player-score-display')
    };

    // State
    this.hasAnsweredCurrent = false;
  }

  init() {
    this.setupEventListeners();
    // Expose seeder for user convenience
    window.seedDatabase = () => this.db.seedDatabase();
  }

  setupEventListeners() {
    // Navigation
    if (this.ui.restartBtn) this.ui.restartBtn.addEventListener('click', () => location.reload());
    if (this.ui.backHomeBtn) this.ui.backHomeBtn.addEventListener('click', () => location.reload());

    // Host final leaderboard trigger
    window.addEventListener('showFinalLeaderboard', async (e) => {
        const quizId = e.detail;
        if (quizId) this.currentQuizId = quizId;
        await this.showLeaderboard();
    });
  }

  async joinQuiz(quizId, password, player) {
    this.currentPlayer = player;
    this.currentQuizId = quizId;

    // 1. Add player to "Lobby" in DB
    await this.db.addPlayerToLobby(quizId, player);

    // 2. Show Waiting Room
    this.switchView('waiting'); 
    
    // 3. Listen for Game Start and State Changes
    this.quizUnsubscribe = this.db.listenToQuiz(quizId, (quizData) => {
        if (!quizData) return;
        
        // Cache questions
        if (!this.quizQuestions.length && quizData.questions) {
            this.quizQuestions = quizData.questions;
        }

        this.handleGameStateChange(quizData);
    });
  }

  handleGameStateChange(quizData) {
      const state = quizData.questionStatus;
      const qIndex = quizData.currentQuestionIndex;

      switch(state) {
          case 'WAITING':
              this.switchView('waiting');
              document.getElementById('waiting-message').textContent = "Waiting for host to start...";
              break;
          case 'SHOWING_QUESTION':
              if (this.currentQuestionIndex !== qIndex) {
                  this.currentQuestionIndex = qIndex;
                  this.hasAnsweredCurrent = false;
                  this.showStudentOptions();
              } else if (!this.hasAnsweredCurrent) {
                  this.switchView('quiz');
              }
              break;
          case 'SHOWING_RESULT':
              if (!this.hasAnsweredCurrent) {
                  // Time ran out and they didn't answer
                  this.showStudentResult(false, 0, "Time's Up!");
              } else {
                  this.highlightStudentResult();
              }
              break;
          case 'SHOWING_LEADERBOARD':
              this.showStudentLeaderboard();
              break;
          case 'FINISHED':
              // Clear player session on finish
              localStorage.removeItem('activeQuizId');
              localStorage.removeItem('activeQuizPass');
              localStorage.removeItem('playerName');
              this.endQuiz();
              break;
      }
  }

  async showLeaderboard() {
    this.switchView('leaderboard');
    this.ui.leaderboardList.innerHTML = '<p class="loading-text">Loading...</p>';

    // Use currentQuizId for fetch
    if (!this.currentQuizId) {
       this.ui.leaderboardList.innerHTML = '<p>Please join a quiz first to see leaderboards.</p>';
       return;
    }

    const data = await this.db.getLeaderboard(this.currentQuizId);

    if (data.length === 0) {
      this.ui.leaderboardList.innerHTML = '<p>No scores yet. Be the first!</p>';
      return;
    }

    this.ui.leaderboardList.innerHTML = `
      <div class="leaderboard-header">
        <span style="min-width: 40px; text-align: center;">Rank</span>
        <span style="flex: 1; margin-left: 0.75rem;">Name</span>
        <span style="min-width: 50px; text-align: center;">Marks</span>
        <span style="min-width: 55px; text-align: right;">Time</span>
      </div>
    ` + data.map((entry, index) => `
      <div class="leaderboard-row">
        <span class="rank">#${index + 1}</span>
        <div class="player-info">
          <strong>${entry.username}</strong>
        </div>
        <span class="player-marks">${entry.correctCount || 0}/${entry.totalQuestions || '?'}</span>
        <span class="player-time">${(entry.time || 0).toFixed(1)}s</span>
      </div>
    `).join('');
  }

  switchView(viewName) {
    Object.values(this.views).forEach(el => {
        if (el) el.classList.add('hidden');
    });
    // Dynamically get the view if not in this.views map (like student-question-result-view)
    const view = this.views[viewName] || document.getElementById(`${viewName}-view`);
    if (view) view.classList.remove('hidden');
  }

  showStudentOptions() {
    this.switchView('quiz');
    this.ui.currentQNum.textContent = this.currentQuestionIndex + 1;
    this.ui.totalQNum.textContent = this.quizQuestions.length;
    this.ui.playerScoreDisplay.textContent = this.currentPlayer.score;
    
    this.questionStartTime = Date.now();

    const labels = ['A', 'B', 'C', 'D'];

    // Render 4 simple letters for the student
    let html = '';
    for(let i=0; i<4; i++) {
        html += `<button class="student-option-btn" data-id="${i}">
                    <span class="option-label">Option : ${labels[i]}</span>
                 </button>`;
    }

    this.ui.questionContainer.innerHTML = html;

    this.ui.questionContainer.querySelectorAll('.student-option-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.handleStudentAnswer(e));
    });
  }

  async handleStudentAnswer(e) {
    if (this.hasAnsweredCurrent) return;
    this.hasAnsweredCurrent = true;

    const selectedBtn = e.target.closest('.student-option-btn');
    const selectedId = selectedBtn.dataset.id;

    const allBtns = this.ui.questionContainer.querySelectorAll('.student-option-btn');
    allBtns.forEach(btn => btn.classList.add('disabled'));
    selectedBtn.classList.remove('disabled');
    selectedBtn.classList.add('selected');

    const qData = this.quizQuestions[this.currentQuestionIndex];
    const questionObj = new Question(qData);
    
    const isCorrect = questionObj.verifyAnswer(selectedId);
    this.lastAnswerWasCorrect = isCorrect;
    
    // Time logic
    const timeSpent = (Date.now() - this.questionStartTime) / 1000;
    
    // Points logic (faster = more points, max 1000)
    // Assume 10s base time limit for points calculation if not provided
    const baseTimer = this.quizTimeLimit || 10;
    let points = 0;
    if (isCorrect) {
        // Linear scale from 500 to 1000 based on speed
        const timeRatio = Math.max(0, (baseTimer - timeSpent) / baseTimer);
        points = Math.round(500 + (500 * timeRatio));
        this.currentPlayer.score += points;
    }

    this.currentPlayer.recordAnswer(questionObj.id, isCorrect, timeSpent, questionObj.topic);

    // Send answer to DB immediately
    await this.db.submitQuestionAnswer(
        this.currentQuizId, 
        this.currentPlayer, 
        this.currentQuestionIndex, 
        isCorrect, 
        timeSpent,
        points
    );
  }

  highlightStudentResult() {
      const selectedBtn = this.ui.questionContainer.querySelector('.student-option-btn.selected');
      if (selectedBtn && this.lastAnswerWasCorrect !== undefined) {
          if (this.lastAnswerWasCorrect) {
              selectedBtn.classList.add('blink-correct');
          } else {
              selectedBtn.classList.add('blink-incorrect');
          }
      }
  }

  showStudentResult(isCorrect, points, customTitle) {
      this.switchView('student-question-result-view');
      this.ui.studentResultTitle.textContent = customTitle || (isCorrect ? "Correct!" : "Incorrect");
      this.ui.studentResultPoints.textContent = points;
      
      this.ui.studentResultCard.classList.add(isCorrect ? 'correct' : 'incorrect');
  }

  async showStudentLeaderboard() {
      this.switchView('student-leaderboard-view');
      const listEl = document.getElementById('student-leaderboard-list');
      if (!listEl) return;
      
      listEl.innerHTML = '<p class="loading-text">Loading...</p>';
      const scores = await this.db.getQuestionLeaderboard(this.currentQuizId, this.currentQuestionIndex);
      if (scores.length === 0) {
          listEl.innerHTML = '<p>No answers recorded.</p>';
      } else {
          const myRankIndex = scores.findIndex(s => s.username === this.currentPlayer.username);
          if (myRankIndex !== -1) {
              const myData = scores[myRankIndex];
              listEl.innerHTML = `
                  <div class="personal-rank-board" style="text-align: center; margin-top: 2rem;">
                     <h1 style="font-size: 5rem; color: hsl(var(--primary)); margin-bottom: 0;">#${myRankIndex + 1}</h1>
                     <h3 style="color: hsl(var(--text-muted)); font-weight: normal;">Your Rank</h3>
                     
                     <div style="margin-top: 2rem; padding: 1rem; background: rgba(0,0,0,0.2); border-radius: var(--radius-md);">
                         <span style="font-size: 1.2rem;">Time Taken: <strong>${myData.timeSpent.toFixed(1)}s</strong></span>
                     </div>
                  </div>
              `;
          } else {
              listEl.innerHTML = '<p>You did not answer this question.</p>';
          }
      }
  }

  async endQuiz() {
    this.switchView('result');

    // Calculate Marks & Time
    const correctCount = this.currentPlayer.answers.filter(a => a.isCorrect).length;
    const totalQuestions = this.quizQuestions.length;
    const totalTime = this.currentPlayer.answers.reduce((sum, a) => sum + a.timeSpent, 0);

    // Submit Final Score (with correctCount/totalQuestions for leaderboard)
    if (this.currentQuizId) {
      await this.db.submitScore(this.currentQuizId, this.currentPlayer, correctCount, totalQuestions);
    }

    const nameEl = document.getElementById('final-result-name');
    if (nameEl) nameEl.textContent = this.currentPlayer.username;
    
    const marksEl = document.getElementById('final-result-marks');
    if (marksEl) marksEl.textContent = `${correctCount} / ${totalQuestions}`;
    
    const timeEl = document.getElementById('final-result-time');
    if (timeEl) {
      const answeredCount = this.currentPlayer.answers.length;
      const avgTime = answeredCount > 0 ? totalTime / answeredCount : 0;
      timeEl.textContent = `${avgTime.toFixed(1)}s`;
    }
    
    // Fetch Rank
    const rankEl = document.getElementById('final-result-rank');
    if (rankEl) {
        if (this.currentQuizId) {
            const scores = await this.db.getLeaderboard(this.currentQuizId);
            const myRankIndex = scores.findIndex(s => s.username === this.currentPlayer.username);
            rankEl.textContent = myRankIndex !== -1 ? `#${myRankIndex + 1}` : "N/A";
        } else {
            rankEl.textContent = "N/A";
        }
    }
  }
}
