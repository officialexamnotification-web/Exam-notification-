import React, { useState } from 'react';
import { MessageCircle, Copy, Check, Share2, Sparkles, LogOut } from 'lucide-react';

interface WhatsAppBroadcastAssistantProps {
  postTitle: string | null;
  currentPath: string;
  onClose: () => void;
}

export default function WhatsAppBroadcastAssistant({ postTitle, currentPath, onClose }: WhatsAppBroadcastAssistantProps) {
  const [category, setCategory] = useState('Latest Jobs');
  const [postName, setPostName] = useState(postTitle || 'Exam Notification');
  const [lastDate, setLastDate] = useState('');
  const [copied, setCopied] = useState(false);

  const getFullLink = () => {
    const baseUrl = window.location.origin;
    // Use clean URLs
    return `${baseUrl}${currentPath}`;
  };

  const generateWhatsAppMessage = () => {
    const link = getFullLink();
    
    // Category-based templates
    const templates: { [key: string]: string } = {
      'Latest Jobs': `🚨 *NEW JOB ALERT* 🚨

📌 *Post Name:* ${postName}

📅 *Last Date:* ${lastDate || 'Check Official Website'}

🔗 *Apply Online & Full Details:*
👉 ${link}

━━━━━━━━━━━━━━━━━━━

🌐 *Exam Notification*
👉 https://govexamnotification.online

👉 *Please Share this with your friends!* 🙏`,
      
      'Results': `🏆 *RESULT OUT* 🏆

📌 *Post Name:* ${postName}

🔗 *Check Result:*
👉 ${link}

━━━━━━━━━━━━━━━━━━━

🌐 *Exam Notification*
👉 https://govexamnotification.online

👉 *Please Share this with your friends!* 🙏`,
      
      'Admit Cards': `🎫 *ADMIT CARD OUT* 🎫

📌 *Post Name:* ${postName}

🔗 *Download Admit Card:*
👉 ${link}

━━━━━━━━━━━━━━━━━━━

🌐 *Exam Notification*
👉 https://govexamnotification.online

👉 *Please Share this with your friends!* 🙏`,
      
      'Answer Key': `📝 *ANSWER KEY OUT* 📝

📌 *Post Name:* ${postName}

🔗 *Check Answer Key:*
👉 ${link}

━━━━━━━━━━━━━━━━━━━

🌐 *Exam Notification*
👉 https://govexamnotification.online

👉 *Please Share this with your friends!* 🙏`,
      
      'Documents': `📚 *IMPORTANT DOCUMENT UPDATE* 📚

📌 *Post Name:* ${postName}

🔗 *View Full Details:*
👉 ${link}

━━━━━━━━━━━━━━━━━━━

🌐 *Exam Notification*
👉 https://govexamnotification.online

👉 *Please Share this with your friends!* 🙏`,
      
      'Admission': `🎓 *ADMISSION UPDATE* 🎓

📌 *Post Name:* ${postName}

📅 *Last Date:* ${lastDate || 'Check Official Website'}

🔗 *Apply Online & Full Details:*
👉 ${link}

━━━━━━━━━━━━━━━━━━━

🌐 *Exam Notification*
👉 https://govexamnotification.online

👉 *Please Share this with your friends!* 🙏`
    };

    return templates[category] || templates['Latest Jobs'];
  };

  const handleCopy = async () => {
    const message = generateWhatsAppMessage();
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleShare = async () => {
    const message = generateWhatsAppMessage();
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleLogout = () => {
    window.location.href = '/?admin_key=logout';
  };

  return (
    <div className="bg-gradient-to-r from-[#25D366] to-[#128C7E] text-white p-4 md:p-5 rounded-xl shadow-lg mb-6 border border-green-400/30">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 md:w-6 md:h-6" />
          <h3 className="font-bold text-sm md:text-base uppercase tracking-wide">WhatsApp Broadcast Assistant</h3>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleLogout}
            className="text-white/80 hover:text-white hover:bg-white/20 p-1.5 rounded-full transition-colors"
            title="Logout Admin"
          >
            <LogOut className="w-4 h-4" />
          </button>
          <button 
            onClick={onClose}
            className="text-white/80 hover:text-white hover:bg-white/20 p-1.5 rounded-full transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold mb-1.5 text-white/90 uppercase tracking-wide">
            Category (श्रेणी)
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-gray-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white/50"
          >
            <option value="Latest Jobs">Latest Jobs</option>
            <option value="Results">Results</option>
            <option value="Admit Cards">Admit Cards</option>
            <option value="Answer Key">Answer Key</option>
            <option value="Documents">Documents</option>
            <option value="Admission">Admission</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1.5 text-white/90 uppercase tracking-wide">
            Post Name (वैकेंसी का नाम)
          </label>
          <input
            type="text"
            value={postName}
            onChange={(e) => setPostName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-gray-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white/50"
            placeholder="e.g., Civil Services, Group D"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1.5 text-white/90 uppercase tracking-wide">
            Last Date (अंतिम तिथि) - Optional
          </label>
          <input
            type="text"
            value={lastDate}
            onChange={(e) => setLastDate(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-gray-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white/50"
            placeholder="e.g., 15/07/2026 (leave blank if not applicable)"
          />
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/20">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-white/80 uppercase tracking-wide">
            <Sparkles className="w-4 h-4" />
            Preview
          </div>
          <pre className="text-xs md:text-sm whitespace-pre-wrap font-mono leading-relaxed text-white/95 bg-black/20 p-3 rounded-lg overflow-x-auto">
            {generateWhatsAppMessage()}
          </pre>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="flex-1 flex items-center justify-center gap-2 bg-white text-green-700 font-bold py-2.5 px-4 rounded-lg hover:bg-green-50 transition-all active:scale-[0.98] shadow-md text-sm md:text-base"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy Message'}
          </button>
          <button
            onClick={handleShare}
            className="flex-1 flex items-center justify-center gap-2 bg-[#128C7E] hover:bg-[#075E54] text-white font-bold py-2.5 px-4 rounded-lg transition-all active:scale-[0.98] shadow-md text-sm md:text-base border border-white/30"
          >
            <Share2 className="w-4 h-4" />
            Share on WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
