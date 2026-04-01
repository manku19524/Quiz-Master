# Quiz Master - Microproject 2

A premium, web-based quiz application mimicking professional learning platforms. Built for Class 9 & 10 students with real-time leaderboard capabilities using Firebase.

## Features
- **Subject & Grade Filtering**: Math, Science, History for Classes 9 & 10.
- **Real-time Leaderboard**: Compete with others and see live rankings.
- **Analytics**: "Weak Areas" detection based on performance (Accuracy & Speed).
- **Premium UI**: Glassmorphism design, animated backgrounds, and smooth transitions.
- **Security**: Basic client-side obfuscation and session management.

## Setup Instructions

### 1. Configure Firebase
1.  Go to `js/firebase-config.js`.
2.  Ensure your **Firebase Project Keys** are pasted in the `firebaseConfig` object.
    *   *If you haven't set this up:* Go to [Firebase Console](https://console.firebase.google.com/), create a project, adds a Web App, and copy the config.
    *   **enable Firestore Database** in "Test Mode" in the Firebase Console.

### 2. Seeding Data (First Time Only)
To populate the database with questions:
1.  Run the application (see below).
2.  Open the Browser Console (`F12`).
3.  Type `seedDatabase()` and hit Enter.
4.  Wait for the success alert.

## How to Run Locally

⚠️ **Important**: This project uses JavaScript Modules (`import` / `export`). You **cannot** simply double-click `index.html`. You must use a local web server.

### Option A: VS Code "Live Server" (Recommended)
1.  Install the **Live Server** extension by Ritwick Dey in VS Code.
2.  Right-click `index.html` in the file explorer.
3.  Select **"Open with Live Server"**.
4.  The app will open automatically in your browser.

### Option B: Python HTTP Server
If you have Python installed, run this terminal command in the project folder:
```bash
python -m http.server
```
Then open `http://localhost:8000` in your browser.

### Option C: Node.js http-server
If you have Node.js installed:
```bash
npx http-server .
```

## Technologies
- **Frontend**: HTML5, CSS3 (Modern/Glassmorphism), Vanilla JS (ES6+).
- **Backend**: Firebase Firestore (NoSQL Database).
