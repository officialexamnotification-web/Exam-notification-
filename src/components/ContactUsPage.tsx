import React, { useState } from 'react';
import { Mail, MessageCircle, Send, CheckCircle2, User, HelpCircle, FileText } from 'lucide-react';

export default function ContactUsPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.message) return;
    
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setSubmitted(true);
        setFormData({ name: '', email: '', subject: '', message: '' });
      } else {
        setError(data.error || 'Something went wrong. Please try again.');
      }
    } catch (err: any) {
      setError('Network error. Please check your internet connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 shadow-lg rounded-2xl overflow-hidden mb-12 animate-fade-in">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-[#104ba6] to-blue-800 px-6 py-8 md:p-10 text-white flex flex-col md:flex-row items-center gap-6">
        <div className="flex-shrink-0">
          <img src="/icon.svg" alt="Contact Us" className="w-16 h-16 md:w-20 md:h-20 object-contain drop-shadow-md" />
        </div>
        <div className="text-center md:text-left">
          <h1 className="text-2xl md:text-3xl font-black tracking-tight uppercase">Contact Us</h1>
          <p className="text-blue-100 text-sm md:text-base mt-2 font-medium">
            Have questions or feedback? We would love to hear from you.
          </p>
        </div>
      </div>

      <div className="p-6 md:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-12">
        {/* Contact Info Panel */}
        <div className="lg:col-span-5 space-y-8">
          <div className="space-y-4">
            <h2 className="text-xl font-extrabold text-gray-900 uppercase tracking-tight">Get in touch</h2>
            <p className="text-gray-600 text-sm md:text-[14.5px] leading-relaxed">
              If you have any feedback regarding government job updates, face issues downloading our application, or want to collaborate, please contact us. We respond within 24-48 hours.
            </p>
          </div>

          <div className="space-y-4">
            {/* Email Support Card */}
            <div className="flex items-center gap-4 p-4 border border-gray-150 rounded-xl bg-gray-50/50 hover:bg-white hover:shadow-md transition-all">
              <div className="p-3 bg-blue-50 rounded-lg text-[#104ba6]">
                <Mail className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Official Email</span>
                <a href="mailto:official.examnotification@gmail.com" className="text-sm font-extrabold text-[#104ba6] hover:underline block truncate">
                  official.examnotification@gmail.com
                </a>
              </div>
            </div>

            {/* WhatsApp Support Card */}
            <a 
              href="https://whatsapp.com/channel/0029Vb8PnI3JENy63JF6DG3d" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="flex items-center gap-4 p-4 border border-gray-150 rounded-xl bg-emerald-50/20 hover:bg-emerald-50/45 hover:shadow-md transition-all block"
            >
              <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block">Join & Message Channel</span>
                <span className="text-sm font-extrabold text-emerald-950 block">
                  Official WhatsApp Channel
                </span>
              </div>
            </a>

            {/* Telegram Support Card */}
            <a 
              href="https://telegram.me/Gov_exam_notification" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="flex items-center gap-4 p-4 border border-gray-150 rounded-xl bg-sky-50/20 hover:bg-sky-50/45 hover:shadow-md transition-all block"
            >
              <div className="p-3 bg-sky-50 rounded-lg text-sky-600">
                <Send className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-bold text-sky-600 uppercase tracking-wider block">Official Telegram Group</span>
                <span className="text-sm font-extrabold text-sky-950 block">
                  Join Telegram Channel
                </span>
              </div>
            </a>
          </div>

          <div className="p-4 bg-[#104ba6]/5 rounded-xl border border-[#104ba6]/10 text-[12px] text-slate-700 leading-relaxed font-medium">
            <strong>नोट:</strong> हम किसी सरकारी विभाग के प्रतिनिधि नहीं हैं और न ही किसी उम्मीदवार का सीधा चयन करते हैं। भर्ती से जुड़े सभी सवालों के लिए कृपया संबंधित आधिकारिक विभाग की वेबसाइट पर ही संपर्क करें।
          </div>
        </div>

        {/* Form Panel */}
        <div className="lg:col-span-7 bg-gray-50/50 rounded-2xl border border-gray-150 p-6 md:p-8">
          {submitted ? (
            <div className="text-center py-12 px-4 space-y-4 animate-scale-in">
              <div className="inline-flex p-4 bg-emerald-100 rounded-full text-emerald-600 mb-2">
                <CheckCircle2 className="w-12 h-12" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Message Sent Successfully!</h3>
              <p className="text-gray-600 text-sm max-w-sm mx-auto leading-relaxed">
                Thank you for reaching out to us. We have received your query and our team will get back to you shortly.
              </p>
              <button 
                onClick={() => setSubmitted(false)}
                className="mt-6 px-6 py-2.5 bg-[#104ba6] hover:bg-[#0b3b85] text-white text-sm font-bold rounded-full transition-colors shadow-md"
              >
                Send Another Message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <User className="w-5 h-5 text-[#104ba6]" />
                Write Your Query
              </h3>

              {error && (
                <div className="bg-red-50 border border-red-150 text-red-800 text-xs md:text-sm px-4 py-3 rounded-xl font-medium leading-relaxed">
                  <strong className="text-red-950 block mb-0.5">Notification Error:</strong>
                  {error}
                </div>
              )}
              
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5" htmlFor="name">Full Name *</label>
                <input 
                  type="text" 
                  id="name"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="John Doe" 
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#104ba6]/20 focus:border-[#104ba6] outline-none text-sm transition-all bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5" htmlFor="email">Email Address *</label>
                <input 
                  type="email" 
                  id="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="john@example.com" 
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#104ba6]/20 focus:border-[#104ba6] outline-none text-sm transition-all bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5" htmlFor="subject">Subject</label>
                <input 
                  type="text" 
                  id="subject"
                  value={formData.subject}
                  onChange={(e) => setFormData({...formData, subject: e.target.value})}
                  placeholder="App feedback, Job notification, etc." 
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#104ba6]/20 focus:border-[#104ba6] outline-none text-sm transition-all bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5" htmlFor="message">Your Message *</label>
                <textarea 
                  id="message"
                  required
                  rows={4}
                  value={formData.message}
                  onChange={(e) => setFormData({...formData, message: e.target.value})}
                  placeholder="Please describe your message or query here..." 
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#104ba6]/20 focus:border-[#104ba6] outline-none text-sm transition-all bg-white resize-none"
                />
              </div>

              <button 
                type="submit" 
                disabled={loading}
                className="w-full py-3 bg-[#104ba6] hover:bg-[#0b3b85] text-white font-extrabold text-sm uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Sending...
                  </>
                ) : (
                  'Send Message'
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
