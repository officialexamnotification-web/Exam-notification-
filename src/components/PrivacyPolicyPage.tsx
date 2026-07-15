import React from 'react';
import { ShieldCheck, Info, EyeOff, Lock, HelpCircle } from 'lucide-react';

export default function PrivacyPolicyPage() {
  return (
    <div className="bg-white border border-gray-200 shadow-lg rounded-2xl overflow-hidden mb-12 animate-fade-in">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-8 md:p-10 text-white flex flex-col md:flex-row items-center gap-6">
        <div className="flex-shrink-0">
          <img src="/icon.svg" alt="Privacy Policy" className="w-16 h-16 md:w-20 md:h-20 object-contain drop-shadow-md" />
        </div>
        <div className="text-center md:text-left">
          <h1 className="text-2xl md:text-3xl font-black tracking-tight uppercase">Privacy Policy</h1>
          <p className="text-emerald-100 text-sm md:text-base mt-2 font-medium">
            We value your privacy and security. Learn how we handle information on our portal.
          </p>
        </div>
      </div>

      <div className="p-6 md:p-10 space-y-10">
        {/* Quick Highlights Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-xl flex items-start gap-3">
            <EyeOff className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h5 className="font-bold text-emerald-950 text-sm">No Sensitive Data</h5>
              <p className="text-emerald-900 text-xs mt-0.5 leading-relaxed">
                We never store or request Aadhaar, PAN, or passwords.
              </p>
            </div>
          </div>
          <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-xl flex items-start gap-3">
            <Lock className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h5 className="font-bold text-emerald-950 text-sm">Safe Transitions</h5>
              <p className="text-emerald-900 text-xs mt-0.5 leading-relaxed">
                All official application links route directly to secure government sites.
              </p>
            </div>
          </div>
          <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-xl flex items-start gap-3">
            <HelpCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h5 className="font-bold text-emerald-950 text-sm">Help & Queries</h5>
              <p className="text-emerald-900 text-xs mt-0.5 leading-relaxed">
                We use emails solely to reply to user inquiries.
              </p>
            </div>
          </div>
        </div>

        {/* English Privacy Content */}
        <div className="space-y-4">
          <h3 className="text-xl font-extrabold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-2">
            <span className="w-2.5 h-6 bg-emerald-600 rounded-sm"></span>
            Privacy Policy Statement
          </h3>
          <div className="text-gray-600 text-sm md:text-base leading-relaxed space-y-4">
            <p>
              At <strong>GOVEXAM NOTIFICATION</strong>, accessible from our official application, one of our main priorities is the privacy of our visitors. This Privacy Policy document outlines the types of information we compile, how it is recorded, and our clear stance on transparency.
            </p>
            <h4 className="font-bold text-gray-800 text-base mt-6">1. Information We Do NOT Collect</h4>
            <p>
              We act as a public job-portal bulletin. We do <strong>NOT</strong> collect, save, or prompt users to submit private documents, banking credentials, or personal identification keys (such as Aadhaar, voter card, or credit cards). All recruitments happen outside our platform on respective boards.
            </p>
            <h4 className="font-bold text-gray-800 text-base">2. Cookies and Server Log Files</h4>
            <p>
              Our hosting containers may utilize standard server log files which record IP addresses, browser types, internet service provider (ISP) references, dates/times, and exit pages. This data is purely for analyzing general website traffic, diagnostic logging, and prevents fraudulent security attacks. None of this data is linked to personally identifiable details.
            </p>
            <h4 className="font-bold text-gray-800 text-base">3. Third-party External Links</h4>
            <p>
              Our articles contain external hyperlinks redirecting you to government agency portals (e.g., `.gov.in`, `.nic.in` sites). Please be aware that once you exit our website, we have no authority over the cookies, security rules, or privacy practices of those external destinations. We advise you to read their policy declarations separately.
            </p>
          </div>
        </div>

        {/* Hindi Privacy Content */}
        <div className="space-y-4">
          <h3 className="text-xl font-extrabold text-[#104ba6] flex items-center gap-2 border-b border-gray-100 pb-2">
            <span className="w-2.5 h-6 bg-emerald-600 rounded-sm"></span>
            गोपनीयता नीति (Privacy Policy)
          </h3>
          <div className="text-gray-600 text-sm md:text-base leading-relaxed space-y-4">
            <p>
              <strong>GOVEXAM NOTIFICATION</strong> पर आपकी गोपनीयता (प्राइवेसी) हमारे लिए अत्यंत महत्वपूर्ण है। यह नीति विवरण आपको स्पष्ट करता है कि हम किस प्रकार की जानकारी प्रबंधित करते हैं और पारदर्शिता के प्रति हमारी क्या प्रतिज्ञाएं हैं।
            </p>
            <h4 className="font-bold text-gray-800 text-base mt-6">1. जानकारी जिसे हम एकत्र नहीं करते</h4>
            <p>
              हम पूरी तरह से एक समाचार और जानकारी प्रदान करने वाली साइट हैं। हम कभी भी उपयोगकर्ताओं से आधार नंबर, पैन नंबर, बैंक खाता विवरण, या कोई संवेदनशील व्यक्तिगत दस्तावेज नहीं मांगते हैं और न ही अपने सर्वर पर सुरक्षित करते हैं।
            </p>
            <h4 className="font-bold text-gray-800 text-base">2. कुकीज़ और सर्वर लॉग्स</h4>
            <p>
              यह वेबसाइट सामान्य ट्रैफ़िक का आकलन करने, वेबसाइट के तकनीकी स्वास्थ्य की जांच करने और सुरक्षा खतरों से सुरक्षा के लिए मानक सर्वर लॉग फाइलों का उपयोग करती है। इसमें आईपी एड्रेस, ब्राउज़र प्रकार, विज़िट का समय और देखे गए पेजों जैसी बुनियादी जानकारियां शामिल होती हैं, जिनका कोई व्यक्तिगत दुरुपयोग नहीं किया जा सकता।
            </p>
            <h4 className="font-bold text-gray-800 text-base">3. बाहरी लिंक</h4>
            <p>
              हमारे पोस्ट में दी गई लिंक उम्मीदवारों को सरकारी भर्ती विभागों (जैसे `.gov.in` या `.nic.in`) की वेबसाइट पर भेजती हैं। एक बार जब आप हमारे पोर्टल से बाहर किसी अन्य वेबसाइट पर जाते हैं, तो उस साइट की अपनी गोपनीयता नीतियां लागू होंगी। हम आपको सलाह देते हैं कि उन साइटों के नियमों को भी अवश्य पढ़ें।
            </p>
          </div>
        </div>

        {/* Dynamic Update Note */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-xs font-semibold text-gray-500">
            Last Updated: July 2026 | Compliant with standard SEO and user safety guidelines.
          </span>
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-700 uppercase tracking-wider"
          >
            Go Back Home &rarr;
          </a>
        </div>
      </div>
    </div>
  );
}
