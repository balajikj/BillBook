// Development environment — wires the app to the Firebase emulator suite.
// The firebaseConfig values can be dummy strings; the emulator ignores them
// other than `projectId`, which must match `.firebaserc`.
export const environment = {
  production: false,
  useEmulators: true,
  firebaseConfig: {
    apiKey: 'demo-api-key',
    authDomain: 'localhost',
    projectId: 'billeasy-mvp',
    storageBucket: 'billeasy-mvp.appspot.com',
    messagingSenderId: '0',
    appId: '0:0:web:0'
  },
  emulatorHosts: {
    auth: 'http://127.0.0.1:9099',
    firestore: { host: '127.0.0.1', port: 8080 }
  }
};
