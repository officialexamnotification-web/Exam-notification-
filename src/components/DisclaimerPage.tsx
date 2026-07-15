import React from 'react';
import { ShieldAlert, Info, ExternalLink, RefreshCw, FileText } from 'lucide-react';

export default function DisclaimerPage() {
  return (
    <div className="bg-white border border-gray-200 shadow-lg rounded-2xl overflow-hidden mb-12 animate-fade-in">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 py-8 md:p-10 text-white flex flex-col md:flex-row items-center gap-6">
        <div className="flex-shrink-0">
          <img src="/icon.svg" alt="Disclaimer" className="w-16 h-16 md:w-20 md:h-20 object-contain drop-shadow-md" />
        </div>
        <div className="text-center md:text-left">
          <h1 className="text-2xl md:text-3xl font-black tracking-tight uppercase">Disclaimer & Terms of Use</h1>
          <p className="text-red-100 text-sm md:text-base mt-2 font-medium">
            Please read this declaration carefully before using GOVEXAM NOTIFICATION.
          </p>
        </div>
      </div>

      <div className="p-6 md:p-10 space-y-10">
        {/* Warning Callout Box */}
        <div className="bg-red-50 border-l-4 border-red-500 p-5 rounded-r-xl">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-red-950 text-base">Important Public Clarification</h4>
              <p className="text-red-900 text-sm mt-1 leading-relaxed">
                GOVEXAM NOTIFICATION is an independent educational news aggregator. We do <strong>NOT</strong> represent any government body, ministry, or department. The official website for all direct applications is always provided inside the notifications, and candidates should always verify details on those primary platforms.
              </p>
            </div>
          </div>
        </div>

        {/* English Section */}
        <div className="space-y-4">
          <h3 className="text-xl font-extrabold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-2">
            <span className="w-2.5 h-6 bg-[#104ba6] rounded-sm"></span>
            English Version (disclaimer)
          </h3>
          <div className="text-gray-600 text-sm md:text-base leading-relaxed space-y-4">
            <p>
              The information provided by <strong>GOVEXAM NOTIFICATION</strong> on this website is for general educational and informational purposes only. All information on the site is provided in good faith, compiled from various official publications, news agencies, and public domain notices.
            </p>
            <p>
              While we make every effort to maintain absolute accuracy, completeness, and timeliness of the job notices, we cannot guarantee there won't be temporary human errors, printing mistakes, or updates in external applications. Therefore:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-600">
              <li>
                <strong>No Affiliation:</strong> We are a private entity. We are not associated with Union Public Service Commission (UPSC), Staff Selection Commission (SSC), Railway Recruitment Board (RRB), State PSCs, or any other government recruitment board.
              </li>
              <li>
                <strong>Verification Advised:</strong> Candidates are strictly advised to cross-verify all details, dates, fees, and eligibility conditions from the official advertised PDF or official department website before making payment or submitting any registration forms.
              </li>
              <li>
                <strong>Liability:</strong> GOVEXAM NOTIFICATION, its administrators, or owners will not be held liable for any loss, damage, or inconvenience caused by reliance on any information found on this platform.
              </li>
              <li>
                <strong>No Financial Transactions:</strong> We never ask for any money, bank account details, or registration fees. Any official recruitment application fees should only be paid through the official portals of the respective department.
              </li>
            </ul>
          </div>
        </div>

        {/* Hindi Section */}
        <div className="space-y-4">
          <h3 className="text-xl font-extrabold text-[#104ba6] flex items-center gap-2 border-b border-gray-100 pb-2">
            <span className="w-2.5 h-6 bg-red-600 rounded-sm"></span>
            हिंदी संस्करण (अस्वीकरण)
          </h3>
          <div className="text-gray-600 text-sm md:text-base leading-relaxed space-y-4 Hindi-text">
            <p>
              <strong>GOVEXAM NOTIFICATION</strong> द्वारा इस वेबसाइट पर दी गई सभी जानकारी केवल सामान्य शैक्षिक और सूचनात्मक उद्देश्यों के लिए है। साइट पर उपलब्ध सामग्री विभिन्न सरकारी राजपत्रों, आधिकारिक समाचार विज्ञप्तियों और सार्वजनिक डोमेन सूचनाओं से पूरी सावधानी के साथ संकलित की जाती है।
            </p>
            <p>
              यद्यपि हम सभी नौकरी सूचनाओं की सटीकता, पूर्णता और समयबद्धता सुनिश्चित करने का पूरा प्रयास करते हैं, फिर भी हम किसी भी मानवीय भूल, मुद्रण त्रुटि या बाद के बदलावों के लिए जिम्मेदारी नहीं ले सकते। कृपया निम्नलिखित बातों का विशेष ध्यान रखें:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-600">
              <li>
                <strong>कोई संबद्धता नहीं:</strong> हम एक पूरी तरह से निजी और स्वतंत्र पोर्टल हैं। हमारा किसी भी सरकारी आयोग (जैसे UPSC, SSC, RRB, State PSCs) या अन्य सरकारी भर्ती बोर्डों से कोई प्रत्यक्ष या अप्रत्यक्ष संबंध नहीं है।
              </li>
              <li>
                <strong>स्वतंत्र सत्यापन आवश्यक:</strong> उम्मीदवारों को दृढ़ता से सलाह दी जाती है कि वे कोई भी फॉर्म भरने, आवेदन शुल्क का भुगतान करने या कोई निर्णय लेने से पहले संबंधित विभाग की आधिकारिक वेबसाइट पर जारी मूल विज्ञापन (Official PDF) को ध्यानपूर्वक पढ़ें और जानकारी का मिलान करें।
              </li>
              <li>
                <strong>दायित्व सीमा:</strong> इस वेबसाइट पर मौजूद किसी भी जानकारी पर भरोसा करने के कारण होने वाले किसी भी प्रकार के नुकसान, असुविधा या वित्तीय क्षति के लिए GOVEXAM NOTIFICATION या इसके संचालक उत्तरदायी नहीं होंगे।
              </li>
              <li>
                <strong>कोई वित्तीय लेनदेन नहीं:</strong> हमारी टीम कभी भी आपसे किसी भी प्रकार के शुल्क, पासवर्ड या बैंकिंग विवरण की मांग नहीं करती है। सरकारी नौकरी के आवेदन शुल्क का भुगतान केवल और केवल आधिकारिक सरकारी वेबसाइट के सुरक्षित पेमेंट गेटवे पर ही करें।
              </li>
            </ul>
          </div>
        </div>

        {/* Source Verification Badge */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <RefreshCw className="w-5 h-5 text-[#104ba6]" />
            <span className="text-sm font-bold text-gray-700">Latest revision: July 2026</span>
          </div>
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#104ba6] hover:text-[#0b3b85] uppercase tracking-wider"
          >
            Go Back Home &rarr;
          </a>
        </div>
      </div>
    </div>
  );
}
