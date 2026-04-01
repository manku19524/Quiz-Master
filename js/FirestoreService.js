import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc, deleteDoc, doc, updateDoc, onSnapshot, query, where, orderBy, limit, serverTimestamp, collectionGroup } from "firebase/firestore";
import { firebaseConfig } from "./firebase-config.js";

export default class FirestoreService {
  constructor() {
    this.db = null;
    this.isInitialized = false;
    this.quizDocRefCache = new Map(); // Cache: quizId -> docRef

    try {
      if (firebaseConfig.apiKey !== "YOUR_API_KEY_HERE") {
        const app = initializeApp(firebaseConfig);
        this.db = getFirestore(app);
        this.isInitialized = true;
        console.log("Firebase Initialized Successfully");
      } else {
        console.warn("Firebase Config missing. Using Mock Data mode.");
      }
    } catch (error) {
      console.error("Error initializing Firebase:", error);
    }
  }

  // --- CACHED DOCUMENT REFERENCE RESOLVER ---
  // Instead of querying Firestore every time to find the quiz document,
  // we cache the reference after the first lookup. This cuts reads roughly in half.

  async resolveQuizDocRef(quizId) {
    if (this.quizDocRefCache.has(quizId)) {
      return this.quizDocRefCache.get(quizId);
    }

    const qRef = collection(this.db, "quizzes");
    const q = query(qRef, where("quizId", "==", quizId));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const docRef = querySnapshot.docs[0].ref;
      this.quizDocRefCache.set(quizId, docRef);
      return docRef;
    }

    return null;
  }

  // --- HOST FUNCTIONS ---

  async createQuiz(quizData) {
    if (!this.isInitialized) {
      console.warn("Firebase not init. Cannot create quiz.");
      return null;
    }

    try {
      const docRef = await addDoc(collection(this.db, "quizzes"), {
        ...quizData,
        createdAt: serverTimestamp()
      });
      // Pre-cache the newly created document reference
      this.quizDocRefCache.set(quizData.quizId, docRef);
      console.log("Quiz Created:", quizData.quizId);
      return true;
    } catch (error) {
      console.error("Error creating quiz:", error);
      return false;
    }
  }

  // --- PLAYER FUNCTIONS ---

  async getQuizById(quizId, password) {
    if (!this.isInitialized) {
      console.log("Mock Mode: Returning mock quiz if ID matches '1234'");
      if (quizId === '1234' && password === 'pass') {
        return {
          title: "Mock Quiz",
          timeLimit: 300, 
          questions: [
            { id: 1, questionText: "Is this a mock question?", options: [{id:"0",text:"Yes"},{id:"1",text:"No"}], correctAnswerHash: "0" }
          ]
        };
      }
      throw new Error("Invalid ID or Password (Mock Mode)"); 
    }

    try {
      const qRef = collection(this.db, "quizzes");
      const q = query(qRef, where("quizId", "==", quizId));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        throw new Error("Quiz ID not found");
      }

      const docSnap = querySnapshot.docs[0];
      const docData = docSnap.data();

      // Cache the doc ref for future use
      this.quizDocRefCache.set(quizId, docSnap.ref);

      if (docData.password !== password) {
        throw new Error("Incorrect Password");
      }

      return docData;

    } catch (error) {
      console.error("Error fetching quiz:", error);
      throw error;
    }
  }

  async submitScore(quizId, player, correctCount = 0, totalQuestions = 0) {
    if (!this.isInitialized) return;

    try {
      await addDoc(collection(this.db, "leaderboard"), {
        quizId: quizId,
        username: player.username,
        score: player.score,
        correctCount: correctCount,
        totalQuestions: totalQuestions,
        time: player.totalTimeTaken || 0,
        timestamp: serverTimestamp()
      });
      console.log(`Score submitted for Quiz ${quizId}`);
    } catch (error) {
      console.error("Error submitting score:", error);
    }
  }

  async submitQuestionAnswer(quizId, player, questionId, isCorrect, timeSpent, pointsEarned) {
      if (!this.isInitialized) return;
      try {
          const quizDocRef = await this.resolveQuizDocRef(quizId);
          if (!quizDocRef) return;

          const perQuestionLbRef = collection(quizDocRef, `question_${questionId}_leaderboard`);
          
          await addDoc(perQuestionLbRef, {
              username: player.username,
              isCorrect: isCorrect,
              timeSpent: timeSpent,
              points: pointsEarned,
              scoreSoFar: player.score,
              timestamp: serverTimestamp()
          });
      } catch (error) {
          console.error("Error submitting question answer:", error);
      }
  }

  async getQuestionLeaderboard(quizId, questionId) {
      if (!this.isInitialized) return [];

      try {
          const quizDocRef = await this.resolveQuizDocRef(quizId);
          if (!quizDocRef) return [];

          const perQuestionLbRef = collection(quizDocRef, `question_${questionId}_leaderboard`);
          
          const qLb = query(perQuestionLbRef, limit(50));
          const lbSnapshot = await getDocs(qLb);
          
          const leaderboard = [];
          lbSnapshot.forEach(doc => leaderboard.push(doc.data()));
          
          leaderboard.sort((a, b) => b.scoreSoFar - a.scoreSoFar);
          
          return leaderboard;
      } catch(error) {
          console.error("Error getting question leaderboard", error);
      }
      return [];
  }

  async getLeaderboard(quizId) {
    if (!this.isInitialized) return [];

    try {
      const lbRef = collection(this.db, "leaderboard");
      const q = query(
        lbRef, 
        where("quizId", "==", quizId),
        limit(50) 
      );

      const querySnapshot = await getDocs(q);
      const leaderboard = [];
      querySnapshot.forEach((doc) => {
        leaderboard.push(doc.data());
      });
      
      leaderboard.sort((a, b) => {
          if (b.score !== a.score) {
              return b.score - a.score;
          } else {
              return (a.time || 9999) - (b.time || 9999);
          }
      });

      return leaderboard;
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      return [];
    }
  }

  async deleteQuiz(quizId) {
    if (!this.isInitialized) return false;

    try {
        // 1. Delete Leaderboard entries for this quiz
        const lbRef = collection(this.db, "leaderboard");
        const lbQuery = query(lbRef, where("quizId", "==", quizId));
        const lbSnapshot = await getDocs(lbQuery);
        let lbCount = 0;
        for (const docSnap of lbSnapshot.docs) {
            await deleteDoc(docSnap.ref);
            lbCount++;
        }
        console.log(`Deleted ${lbCount} leaderboard entries for quiz ${quizId}.`);

        // 2. Find the Quiz Document (use cache if available)
        const docRef = await this.resolveQuizDocRef(quizId);
        if (!docRef) {
            console.warn(`Quiz ${quizId} not found.`);
            return false;
        }

        // 3. Delete 'players' subcollection
        const playersRef = collection(docRef, "players");
        const playersSnapshot = await getDocs(playersRef);
        let playersCount = 0;
        for (const pSnap of playersSnapshot.docs) {
            await deleteDoc(pSnap.ref);
            playersCount++;
        }
        console.log(`Deleted ${playersCount} players for quiz ${quizId}.`);

        // 4. Delete the quiz document itself
        await deleteDoc(docRef);
        this.quizDocRefCache.delete(quizId); // Clear from cache
        console.log(`Quiz ${quizId} deleted completely.`);
        return true;
    } catch (error) {
        console.error("Error deleting quiz:", error);
        return false;
    }
  }

  async deleteAllData() {
    if (!this.isInitialized) return false;
    try {
        const playersGroupRef = collectionGroup(this.db, "players");
        const playersSnapshot = await getDocs(playersGroupRef);
        let playersCount = 0;
        for (const pSnap of playersSnapshot.docs) {
            await deleteDoc(pSnap.ref);
            playersCount++;
        }
        console.log(`Deleted ${playersCount} orphaned player documents.`);

        const collectionsToClear = ["quizzes", "questions", "leaderboard"];
        for (const collName of collectionsToClear) {
            const qRef = collection(this.db, collName);
            const snapshot = await getDocs(qRef);
            if (!snapshot.empty) {
                let count = 0;
                for (const docSnapshot of snapshot.docs) {
                    await deleteDoc(docSnapshot.ref);
                    count++;
                }
                console.log(`Deleted ${count} documents from ${collName} collection.`);
            } else {
                console.log(`${collName} collection is already empty.`);
            }
        }
        this.quizDocRefCache.clear(); // Clear entire cache
        console.log("All data cleared.");
        return true;
    } catch (error) {
        console.error("Error deleting all data:", error);
        return false;
    }
  }

  // --- LOBBY & REAL-TIME FUNCTIONS ---

  async updateQuizStatus(quizId, status, additionalData = {}) {
    if (!this.isInitialized) return false;
    try {
      const docRef = await this.resolveQuizDocRef(quizId);
      if (!docRef) return false;

      const payload = { ...additionalData };
      if (status) payload.status = status;
      await updateDoc(docRef, payload);
      return true;
    } catch (error) {
      console.error("Error updating status:", error);
    }
    return false;
  }

  async updateGameState(quizId, stateObj) {
      return this.updateQuizStatus(quizId, stateObj.status, stateObj);
  }

  async checkPlayerExists(quizId, username) {
      if (!this.isInitialized) return false;
      try {
          const quizDocRef = await this.resolveQuizDocRef(quizId);
          if (!quizDocRef) return false;

          const playersRef = collection(quizDocRef, "players");
          const pq = query(playersRef, where("username", "==", username));
          const pSnapshot = await getDocs(pq);
          
          return !pSnapshot.empty;
      } catch (error) {
          console.error("Error checking player:", error);
          return false;
      }
  }

  async addPlayerToLobby(quizId, player) {
    if (!this.isInitialized) return;
    try {
      const quizDocRef = await this.resolveQuizDocRef(quizId);
      if (!quizDocRef) return;

      await addDoc(collection(quizDocRef, "players"), {
          username: player.username,
          joinedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error adding player to lobby:", error);
    }
  }

  listenToPlayers(quizId, callback) {
    if (!this.isInitialized) return null;
    
    let unsubscribe = null;

    const findAndListen = async () => {
        const quizDocRef = await this.resolveQuizDocRef(quizId);
        if (!quizDocRef) return;

        const playersRef = collection(quizDocRef, "players");
        
        unsubscribe = onSnapshot(playersRef, (snapshot) => {
            const players = [];
            snapshot.forEach(doc => players.push(doc.data()));
            callback(players);
        });
    };

    findAndListen();
    return () => { if (unsubscribe) unsubscribe(); };
  }

  listenToQuiz(quizId, callback) {
    if (!this.isInitialized) return null;

    let unsubscribe = null;
    
    const startListener = async () => {
         const qRef = collection(this.db, "quizzes");
         const q = query(qRef, where("quizId", "==", quizId));
         
         unsubscribe = onSnapshot(q, (snapshot) => {
             snapshot.forEach((doc) => {
                 // Cache the ref on first snapshot if not already cached
                 if (!this.quizDocRefCache.has(quizId)) {
                     this.quizDocRefCache.set(quizId, doc.ref);
                 }
                 callback(doc.data());
             });
         });
    };
    
    startListener();
    return () => { if (unsubscribe) unsubscribe(); };
  }

  async seedDatabase() {
      console.log("Seeding is disabled in Host/Join mode.");
  }
}
