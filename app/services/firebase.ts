import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB3qmChPT8XzA8jQV5P2AFy-QZ3WMle56A",
  authDomain: "retouch-41e15.firebaseapp.com",
  projectId: "retouch-41e15",
  storageBucket: "retouch-41e15.firebasestorage.app",
  messagingSenderId: "27295969078",
  appId: "1:27295969078:web:b1cd7ac014df53b9304d97",
  measurementId: "G-C35HNMEY1W"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, db, storage };
