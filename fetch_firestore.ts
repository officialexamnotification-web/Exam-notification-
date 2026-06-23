import { getFirestore } from "firebase-admin/firestore";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = getFirestore();

async function run() {
  const snapshot = await db.collection("jobs").where("title", ">=", "anganwadi").limit(1).get();
  if (snapshot.empty) {
    const s2 = await db.collection("jobs").limit(5).get();
    for (const doc of s2.docs) {
      const data = doc.data();
      if ((data.content || '').includes("youtube.com/results?search_query=")) {
         console.log(data.title);
         const content = data.content;
         console.log(content.match(/<div[^>]*>[\s\S]*?youtube\.com\/results\?search_query=[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/i)?.[0]);
      }
    }
  } else {
    const data = snapshot.docs[0].data();
    console.log(data.content.match(/<div[^>]*>[\s\S]*?youtube\.com\/results\?search_query=[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/i)?.[0]);
  }
}
run();
