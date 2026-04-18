import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc, deleteDoc, doc, updateDoc, onSnapshot, query, where, orderBy, limit, serverTimestamp, collectionGroup } from "firebase/firestore";
import { firebaseConfig } from "./firebase-config.js";

export default class FirestoreService {
  constructor() {
    this.db = null;
    this.isInitialized = false;
    this.quizDocRefCache = new Map(); // Cache: quizId -> docRef

    try {
      if (firebaseConfig.apiKey !== "YOUR_API_KEY_HERE") {
        // Reuse existing Firebase app if already initialized, otherwise create new
        const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
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

  async submitQuestionAnswer(quizId, player, questionId, isCorrect, timeSpent, pointsEarned, avgTimeSoFar) {
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
              avgTimeSoFar: avgTimeSoFar || 0,
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
          
          // Sort by score (highest first), then by average time (lowest first)
          leaderboard.sort((a, b) => {
              if (b.scoreSoFar !== a.scoreSoFar) {
                  return b.scoreSoFar - a.scoreSoFar;
              }
              return (a.avgTimeSoFar || 9999) - (b.avgTimeSoFar || 9999);
          });
          
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
      
      // Sort by score (highest first), then by average time (lowest first)
      leaderboard.sort((a, b) => {
          if (b.score !== a.score) {
              return b.score - a.score;
          }
          const avgTimeA = (a.totalQuestions && a.totalQuestions > 0) ? (a.time || 0) / a.totalQuestions : 9999;
          const avgTimeB = (b.totalQuestions && b.totalQuestions > 0) ? (b.time || 0) / b.totalQuestions : 9999;
          return avgTimeA - avgTimeB;
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

  // --- USER ACCOUNT FUNCTIONS ---

  async createUser(username, password) {
    if (!this.isInitialized) {
      console.warn("Firebase not init. Cannot create user.");
      return { success: false, error: "Database not available" };
    }

    try {
      // Check if username already exists
      const usersRef = collection(this.db, "users");
      const q = query(usersRef, where("username", "==", username));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        return { success: false, error: "Username already taken. Please choose another." };
      }

      await addDoc(collection(this.db, "users"), {
        username: username,
        password: password,
        createdAt: serverTimestamp()
      });

      console.log("User created:", username);
      return { success: true };
    } catch (error) {
      console.error("Error creating user:", error);
      return { success: false, error: "Failed to create account. Please try again." };
    }
  }

  async loginUser(username, password) {
    if (!this.isInitialized) {
      console.warn("Firebase not init. Cannot login.");
      return { success: false, error: "Database not available" };
    }

    try {
      const usersRef = collection(this.db, "users");
      const q = query(usersRef, where("username", "==", username));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return { success: false, error: "Account not found. Please create an account first." };
      }

      const userData = snapshot.docs[0].data();
      if (userData.password !== password) {
        return { success: false, error: "Incorrect password." };
      }

      console.log("Login successful:", username);
      return { success: true, user: { username: userData.username } };
    } catch (error) {
      console.error("Error logging in:", error);
      return { success: false, error: "Login failed. Please try again." };
    }
  }

  // --- SAVED QUIZ FUNCTIONS ---

  async saveQuizDraft(username, quizData) {
    if (!this.isInitialized) {
      console.warn("Firebase not init. Cannot save quiz.");
      return { success: false, error: "Database not available" };
    }

    try {
      const docRef = await addDoc(collection(this.db, "savedQuizzes"), {
        owner: username,
        title: quizData.title,
        password: quizData.password,
        timeLimit: quizData.timeLimit,
        questions: quizData.questions,
        savedAt: serverTimestamp()
      });

      console.log("Quiz draft saved:", docRef.id);
      return { success: true, docId: docRef.id };
    } catch (error) {
      console.error("Error saving quiz draft:", error);
      return { success: false, error: "Failed to save quiz. Please try again." };
    }
  }

  async getSavedQuizzes(username) {
    if (!this.isInitialized) return [];

    try {
      const ref = collection(this.db, "savedQuizzes");
      // Note: only using where() without orderBy() to avoid requiring a composite index
      const q = query(ref, where("owner", "==", username));
      const snapshot = await getDocs(q);

      const quizzes = [];
      snapshot.forEach(docSnap => {
        quizzes.push({ id: docSnap.id, ...docSnap.data() });
      });

      // Sort client-side (newest first) to avoid needing a Firestore composite index
      quizzes.sort((a, b) => {
        const timeA = a.savedAt?.seconds || 0;
        const timeB = b.savedAt?.seconds || 0;
        return timeB - timeA;
      });

      return quizzes;
    } catch (error) {
      console.error("Error fetching saved quizzes:", error);
      return [];
    }
  }

  async deleteSavedQuiz(docId) {
    if (!this.isInitialized) return false;

    try {
      await deleteDoc(doc(this.db, "savedQuizzes", docId));
      console.log("Saved quiz deleted:", docId);
      return true;
    } catch (error) {
      console.error("Error deleting saved quiz:", error);
      return false;
    }
  }

  async getSavedQuizById(docId) {
    if (!this.isInitialized) return null;

    try {
      const ref = collection(this.db, "savedQuizzes");
      const snapshot = await getDocs(ref);
      let found = null;
      snapshot.forEach(docSnap => {
        if (docSnap.id === docId) {
          found = { id: docSnap.id, ...docSnap.data() };
        }
      });
      return found;
    } catch (error) {
      console.error("Error fetching saved quiz:", error);
      return null;
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
