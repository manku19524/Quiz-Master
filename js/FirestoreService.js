import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc, deleteDoc, doc, updateDoc, onSnapshot, query, where, orderBy, limit, serverTimestamp, collectionGroup } from "firebase/firestore";
import { firebaseConfig } from "./firebase-config.js";
// import { mockQuestions } from "./MockData.js"; // Removed

export default class FirestoreService {
  constructor() {
    this.db = null;
    this.isInitialized = false;

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

  // --- HOST FUNCTIONS ---

  async createQuiz(quizData) {
    if (!this.isInitialized) {
      console.warn("Firebase not init. Cannot create quiz.");
      return null;
    }

    try {
      // Check if ID exists (Optional, for now assuming random is unique enough or handle error)
      // quizData should contain: { quizId, password, title, questions: [] }
      await addDoc(collection(this.db, "quizzes"), {
        ...quizData,
        createdAt: serverTimestamp()
      });
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

      // Should only be one quiz with this ID
      const docData = querySnapshot.docs[0].data();

      // Verify Password
      if (docData.password !== password) {
        throw new Error("Incorrect Password");
      }

      return docData; // Returns { title, questions: [], ... }

    } catch (error) {
      console.error("Error fetching quiz:", error);
      throw error; // Propagate error to UI
    }
  }

  async submitScore(quizId, player) {
    if (!this.isInitialized) return;

    try {
      await addDoc(collection(this.db, "leaderboard"), {
        quizId: quizId,
        username: player.username,
        score: player.score,
        time: player.totalTimeTaken || 0, // Save time taken
        subject: player.subject || "General",
        grade: player.grade || "Any",     
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
          const qRef = collection(this.db, "quizzes");
          const q = query(qRef, where("quizId", "==", quizId));
          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
              const quizDocRef = querySnapshot.docs[0].ref;
              const perQuestionLbRef = collection(quizDocRef, `question_${questionId}_leaderboard`);
              
              await addDoc(perQuestionLbRef, {
                  username: player.username,
                  isCorrect: isCorrect,
                  timeSpent: timeSpent,
                  points: pointsEarned,
                  scoreSoFar: player.score, // Snapshot of their total score at this point
                  timestamp: serverTimestamp()
              });
          }
      } catch (error) {
          console.error("Error submitting question answer:", error);
      }
  }

  async getQuestionLeaderboard(quizId, questionId) {
      if (!this.isInitialized) return [];

      try {
          const qRef = collection(this.db, "quizzes");
          const q = query(qRef, where("quizId", "==", quizId));
          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
              const quizDocRef = querySnapshot.docs[0].ref;
              const perQuestionLbRef = collection(quizDocRef, `question_${questionId}_leaderboard`);
              
              const qLb = query(perQuestionLbRef, limit(50));
              const lbSnapshot = await getDocs(qLb);
              
              const leaderboard = [];
              lbSnapshot.forEach(doc => leaderboard.push(doc.data()));
              
              // Sort by points for this question, then reverse time, OR sort by total score
              // We'll sort by total score so far to match Kahoot's cumulative leaderboard
              leaderboard.sort((a, b) => b.scoreSoFar - a.scoreSoFar);
              
              return leaderboard;
          }
      } catch(error) {
          console.error("Error getting question leaderboard", error);
      }
      return [];
  }

  async getLeaderboard(quizId) {
    if (!this.isInitialized) return [];

    try {
      const lbRef = collection(this.db, "leaderboard");
      // SIMPLIFIED QUERY: Query only by quizId to avoid Firestore Index creation requirement.
      // We will sort in JavaScript (fine for small apps).
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
      
      // Client-side Sort: Score Descending, then Time Ascending
      leaderboard.sort((a, b) => {
          if (b.score !== a.score) {
              return b.score - a.score; // Higher score first
          } else {
              return (a.time || 9999) - (b.time || 9999); // Lower time better
          }
      });

      return leaderboard;
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      return [];
    }
  }

  async deleteQuiz(quizId, password) {
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

        // 2. Find the Quiz Document
        const qRef = collection(this.db, "quizzes");
        const q = query(qRef, where("quizId", "==", quizId));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            console.warn(`Quiz ${quizId} not found. (It might have been deleted already)`);
            return false;
        }

        const docRef = querySnapshot.docs[0].ref;

        // 3. Delete 'players' subcollection if any exists
        const playersRef = collection(docRef, "players");
        const playersSnapshot = await getDocs(playersRef);
        let playersCount = 0;
        for (const pSnap of playersSnapshot.docs) {
            await deleteDoc(pSnap.ref);
            playersCount++;
        }
        console.log(`Deleted ${playersCount} players from subcollection for quiz ${quizId}.`);

        // 4. Finally, delete the quiz document itself
        await deleteDoc(docRef);
        console.log(`Quiz document ${quizId} deleted completely.`);
        return true;
    } catch (error) {
        console.error("Error completely deleting quiz:", error);
        return false;
    }
  }

  async deleteAllData() {
    if (!this.isInitialized) return false;
    try {
        // First delete all 'players' documents via collection group
        // This ensures we get orphaned subcollections
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
        console.log("All specified collections have been cleared from the database.");
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
      const qRef = collection(this.db, "quizzes");
      const q = query(qRef, where("quizId", "==", quizId));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const docRef = querySnapshot.docs[0].ref;
        const payload = { ...additionalData };
        if (status) payload.status = status;
        await updateDoc(docRef, payload);
        return true;
      }
    } catch (error) {
      console.error("Error updating status:", error);
    }
    return false;
  }

  async updateGameState(quizId, stateObj) {
      // Wrapper for clarity
      return this.updateQuizStatus(quizId, stateObj.status, stateObj);
  }

  async addPlayerToLobby(quizId, player) {
    if (!this.isInitialized) return;
    try {
      // Add to sub-collection 'players' inside the quiz document
      // First get the quiz doc ref
      const qRef = collection(this.db, "quizzes");
      const q = query(qRef, where("quizId", "==", quizId));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const quizDocRef = querySnapshot.docs[0].ref;
        await addDoc(collection(quizDocRef, "players"), {
            username: player.username,
            joinedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error("Error adding player to lobby:", error);
    }
  }

  listenToPlayers(quizId, callback) {
    if (!this.isInitialized) return null;
    
    // We need the document ID to listen to subcollection
    // For simplicity in this structure, we'll need to query for the doc first
    // ideally we would store the auto-generated Doc ID, but we use quizId.
    // So we will do a query listener.
    
    // Listener for players requires knowing the parent doc. 
    // Optimization: We will query collection group or find the doc first.
    // Let's use a workaround: Query 'quizzes' to find doc, then listen.
    
    let unsubscribe = null;

    const findAndListen = async () => {
        const qRef = collection(this.db, "quizzes");
        const q = query(qRef, where("quizId", "==", quizId));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const quizDocRef = querySnapshot.docs[0].ref;
            const playersRef = collection(quizDocRef, "players");
            
            unsubscribe = onSnapshot(playersRef, (snapshot) => {
                const players = [];
                snapshot.forEach(doc => players.push(doc.data()));
                callback(players);
            });
        }
    };

    findAndListen();
    // Return a function to unsubscribe when needed (async constraint ignored for now)
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
                 callback(doc.data());
             });
         });
    };
    
    startListener();
    return () => { if (unsubscribe) unsubscribe(); };
  }

  // Helper to upload mock questions (Deprecated but kept for reference if needed, or repurposed)
  async seedDatabase() {
      // Legacy seeder, no longer relevant for dynamic quizzes unless updated
      console.log("Seeding is disabled in Host/Join mode.");
  }
}
