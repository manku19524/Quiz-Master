export default class Player {
  constructor(username, subject = "General", grade = "Any") {
    this.username = username;
    this.subject = subject;
    this.grade = grade;
    this.score = 0;
    this.answers = []; // Log of answers for analytics
    this.totalTimeTaken = 0; // Track total seconds spent
  }

  incrementScore() {
    this.score++;
  }

  recordAnswer(questionId, isCorrect, timeSpent, topic) {
    this.totalTimeTaken += timeSpent;
    this.answers.push({
      questionId,
      isCorrect,
      timeSpent,
      topic,
      timestamp: new Date()
    });
  }
}
