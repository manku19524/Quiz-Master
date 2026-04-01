export default class Question {
  constructor(data) {
    this.id = data.id;
    this.text = data.questionText;
    this.options = data.options;
    this.topic = data.topic;
    this.difficulty = data.difficulty;

    // Private field for correct answer would be ideal in a real build environment,
    // but for now we store the hash.
    this.correctAnswerHash = data.correctAnswerHash;
  }

  verifyAnswer(selectedOptionId) {
    // For Mock data, the correctAnswerHash is just the ID (e.g., "b")
    return selectedOptionId === this.correctAnswerHash;
  }

  render() {
    // Returns HTML string or element for this question
    return `
            <div class="question-card" data-id="${this.id}">
                <h2>${this.text}</h2>
                <div class="options-grid">
                    ${this.options.map(opt => `
                        <button class="option-btn" data-id="${opt.id}">${opt.text}</button>
                    `).join('')}
                </div>
            </div>
        `;
  }
}
