// Production environment. Replace `firebaseConfig` placeholder values with the
// real config from the Firebase console before deploying.
//
// Read this from a real config when running locally: `npm start` enables the
// emulator suite (see `environment.development.ts`).
export const environment = {
  production: true,
  useEmulators: false,
  firebaseConfig: {
    apiKey: 'AIzaSyBpiW4qp6tuG38vTlSgArM-sWn8fGjJhSY',
    authDomain: 'billeasy-prd.firebaseapp.com',
    projectId: 'billeasy-prd',
    storageBucket: 'billeasy-prd.firebasestorage.app',
    messagingSenderId: '144545327216',
    appId: '1:144545327216:web:6c3271a3f1b3c1f1bc2cb5',
    measurementId: 'G-ED5EP76T1W'
  }
};
