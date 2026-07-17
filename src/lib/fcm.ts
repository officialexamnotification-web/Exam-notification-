import { initializeApp } from "firebase/app";
import { getMessaging, getToken } from "firebase/messaging";
//import defaultConfig from "../../firebase-applet-config.json";

const config = {
  apiKey: (import.meta as any).env?.VITE_FIREBASE_API_KEY,
  authDomain: (import.meta as any).env?.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: (import.meta as any).env?.VITE_FIREBASE_PROJECT_ID,
  storageBucket: (import.meta as any).env?.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: (import.meta as any).env?.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: (import.meta as any).env?.VITE_FIREBASE_APP_ID,
};
if ((import.meta as any).env?.VITE_FIREBASE_PROJECT_ID) config.projectId = (import.meta as any).env.VITE_FIREBASE_PROJECT_ID;
if ((import.meta as any).env?.VITE_FIREBASE_API_KEY) config.apiKey = (import.meta as any).env.VITE_FIREBASE_API_KEY;
if ((import.meta as any).env?.VITE_FIREBASE_APP_ID) config.appId = (import.meta as any).env.VITE_FIREBASE_APP_ID;
if ((import.meta as any).env?.VITE_FIREBASE_MESSAGING_SENDER_ID) config.messagingSenderId = (import.meta as any).env.VITE_FIREBASE_MESSAGING_SENDER_ID;
if ((import.meta as any).env?.VITE_FIREBASE_AUTH_DOMAIN) config.authDomain = (import.meta as any).env.VITE_FIREBASE_AUTH_DOMAIN;
if ((import.meta as any).env?.VITE_FIREBASE_STORAGE_BUCKET) config.storageBucket = (import.meta as any).env.VITE_FIREBASE_STORAGE_BUCKET;

let isRequesting = false;

export async function silentPushSubscription() {
  if (typeof window === 'undefined') return;
  const isSupported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  if (!isSupported) return;

  const performSubscription = async () => {
    if (isRequesting) return;
    isRequesting = true;
    
    try {
      // Browsers often require a user gesture for this. By calling this on a user click, it respects the requirement.
      if (Notification.permission === 'default') {
          await Notification.requestPermission();
      }
      
      if (Notification.permission === 'granted') {
        const app = initializeApp(config);
        const messaging = getMessaging(app);
        
        const registration = await navigator.serviceWorker.ready;
        const vapidKey = (import.meta as any).env?.VITE_VAPID_KEY;
        
        if (!vapidKey) {
            console.warn('VITE_VAPID_KEY is missing from environment variables. Push notifications cannot be registered.');
            return; 
        }

        const currentToken = await getToken(messaging, { 
           vapidKey,
           serviceWorkerRegistration: registration
        });
        
        if (currentToken) {
          // Fire and forget
          fetch('/api/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: currentToken })
          }).catch(() => {}); // silent fail to not disturb UI
        }
      }
    } catch (err) {
      console.warn('FCM subscription skipped:', err);
    } finally {
      isRequesting = false;
    }
  };

  if (Notification.permission === 'granted') {
     // If already granted, we can do this silently immediately
     performSubscription();
  } else if (Notification.permission === 'default') {
     // Wait for any global user interaction to prompt for permission
     const handleInteraction = () => {
         performSubscription();
         window.removeEventListener('click', handleInteraction);
         window.removeEventListener('touchstart', handleInteraction);
     };
     window.addEventListener('click', handleInteraction);
     window.addEventListener('touchstart', handleInteraction);
  }
}
