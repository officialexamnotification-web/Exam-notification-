import React, { useState } from 'react';
import { MessageCircle, Copy, Check, Share2, Sparkles, LogOut } from 'lucide-react';

interface WhatsAppBroadcastAssistantProps {
  postTitle: string | null;
  currentPath: string;
  onClose: () => void;
}

export default function WhatsAppBroadcastAssistant({ postTitle, currentPath, onClose }: WhatsAppBroadcastAssistantProps) {
  const [tagline, setTagline] = useState('Sarkari Updates Sabse Pehle');
  const [copied, setCopied] = useState(false);

  const getFullLink = () => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/?path=${encodeURIComponent(currentPath)}`;
  };

  const generateWhatsAppMessage = () => {
    const link = getFullLink();
    const title = postTitle || 'Exam Notification';
    
    return `🌟 EXAM NOTIFICATION 🌟
🏆 ${tagline}

━━━━━━━━━━━━━━━━━━━━━━

📌 ${title}

━━━━━━━━━━━━━━━━━━━━━━

📅 Apply Online & Full Details here:
👉 ${link}

━━━━━━━━━━━━━━━━━━━━━━`;
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
            Website Tagline / Motto
          </label>
          <input
            type="text"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-gray-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white/50"
            placeholder="Enter tagline..."
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
