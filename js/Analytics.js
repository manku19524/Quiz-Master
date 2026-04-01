export default class Analytics {
  constructor() {
  }

  analyzeSession(player) {
    // Input: player.answers = [{ questionId, isCorrect, timeSpent, topic? }]
    // Note: We need to ensure 'topic' is available in the answers or look it up.
    // Currently Player.recordAnswer only stores ID. We should pass topic or look it up.
    // For simplicity, let's assume we pass the full question object or look it up in QuizManager.
    // Refactoring: QuizManager should pass the full history including topic.

    // However, Player.js stores: { questionId, isCorrect, timeSpent }
    // We will maintain a map in this function or expect the input to be enriched.
    // Let's assume QuizManager passes an enriched array of results: 
    // [{ topic: "Math", isCorrect: true, timeSpent: 10 }, ...]

    return {
      score: player.score,
      weakAreas: [] // logical placeholder if called with empty
    };
  }

  // Static helper or instance method
  generateReport(answerHistory) {
    const topicStats = {};

    answerHistory.forEach(record => {
      const topic = record.topic;
      if (!topicStats[topic]) {
        topicStats[topic] = { total: 0, correct: 0, time: 0 };
      }
      topicStats[topic].total++;
      topicStats[topic].time += record.timeSpent;
      if (record.isCorrect) topicStats[topic].correct++;
    });

    const weakAreas = [];
    for (const [topic, stats] of Object.entries(topicStats)) {
      const accuracy = (stats.correct / stats.total) * 100;
      const avgTime = stats.time / stats.total;

      if (accuracy < 60) {
        weakAreas.push({
          topic,
          reason: "Concept Weakness",
          accuracy: Math.round(accuracy) + "%",
          suggestion: "Review basic concepts."
        });
      } else if (avgTime > 60) {
        weakAreas.push({
          topic,
          reason: "Slow Execution",
          avgTime: Math.round(avgTime) + "s",
          suggestion: "Practice timed problems."
        });
      }
    }

    return weakAreas;
  }
}
