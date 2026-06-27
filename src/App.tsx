/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import NavBar from './components/NavBar';
import MarqueeSection from './components/MarqueeSection';
import CategoryBlock from './components/CategoryBlock';
import WhatsAppBroadcastAssistant from './components/WhatsAppBroadcastAssistant';
import { MessageCircle, Send, Instagram, Twitter, X, Download, Smartphone, Laptop, Sparkles, HelpCircle } from 'lucide-react';
import { silentPushSubscription } from './lib/fcm';
import { useSearchParams, useLocation } from 'react-router-dom';

export default function App() {
  const [content, setContent] = useState<string | null>(null);
  const [postTitle, setPostTitle] = useState<string | null>(null);
  const [homeData, setHomeData] = useState<any[] | null>(null);
  const [trendingData, setTrendingData] = useState<any[] | null>(null);
  const [isHome, setIsHome] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState('/');
  const [searchInput, setSearchInput] = useState('');
  const [activeModal, setActiveModal] = useState<'disclaimer' | 'privacy' | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // PWA installation states
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showInstallGuideModal, setShowInstallGuideModal] = useState(false);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  
  // Admin mode state
  const [isAdmin, setIsAdmin] = useState(false);
  
  // React Router hooks
  const location = useLocation();
  const [searchParams] = useSearchParams();
  
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      window.location.href = `/search?q=${encodeURIComponent(searchInput.trim())}`;
    }
  };

  const [activeTab, setActiveTab] = useState<string>(() => {
    // Support both clean URLs and old ?path= URLs
    const pathParam = searchParams.get('path');
    const cleanPath = location.pathname;
    const path = pathParam || cleanPath || '/';
    
    if (path.includes('latest-job') || path.includes('search')) return 'Latest Jobs';
    if (path.includes('result')) return 'Results';
    if (path.includes('admit-card')) return 'Admit Card';
    if (path.includes('answer-key')) return 'Answer Key';
    if (path.includes('syllabus')) return 'Syllabus';
    if (path.includes('admission')) return 'Admission';
    return 'Home';
  });

  useEffect(() => {
    // Update document title and meta tags for SEO and social media
    if (postTitle && !isHome) {
      document.title = `${postTitle} - Exam Notification`;
      
      // Update Open Graph meta tags dynamically with small icon
      const ogTitle = document.querySelector('meta[property="og:title"]');
      const ogDescription = document.querySelector('meta[property="og:description"]');
      const ogUrl = document.querySelector('meta[property="og:url"]');
      const ogImage = document.querySelector('meta[property="og:image"]');
      const twitterTitle = document.querySelector('meta[name="twitter:title"]');
      const twitterDescription = document.querySelector('meta[name="twitter:description"]');
      const twitterImage = document.querySelector('meta[name="twitter:image"]');
      
      if (ogTitle) ogTitle.setAttribute('content', `GOVEXAM NOTIFICATION - ${postTitle}`);
      if (ogDescription) ogDescription.setAttribute('content', `Apply online for ${postTitle}. Get complete details, eligibility, last date, and application process.`);
      if (ogUrl) ogUrl.setAttribute('content', `${window.location.origin}${currentPath}`);
      if (ogImage) ogImage.setAttribute('content', `${window.location.origin}/icon.svg`);
      if (twitterTitle) twitterTitle.setAttribute('content', `GOVEXAM NOTIFICATION - ${postTitle}`);
      if (twitterDescription) twitterDescription.setAttribute('content', `Apply online for ${postTitle}. Get complete details, eligibility, last date, and application process.`);
      if (twitterImage) twitterImage.setAttribute('content', `${window.location.origin}/icon.svg`);
    } else {
      document.title = 'GOVEXAM NOTIFICATION - Latest Jobs, Admit Cards, Results';
      
      // Reset meta tags for home page
      const ogTitle = document.querySelector('meta[property="og:title"]');
      const ogDescription = document.querySelector('meta[property="og:description"]');
      const ogUrl = document.querySelector('meta[property="og:url"]');
      const ogImage = document.querySelector('meta[property="og:image"]');
      const twitterTitle = document.querySelector('meta[name="twitter:title"]');
      const twitterDescription = document.querySelector('meta[name="twitter:description"]');
      const twitterImage = document.querySelector('meta[name="twitter:image"]');
      
      if (ogTitle) ogTitle.setAttribute('content', 'GOVEXAM NOTIFICATION - Latest Jobs, Admit Cards, Results');
      if (ogDescription) ogDescription.setAttribute('content', 'Get latest government job notifications, results, admit cards, and exam updates in India.');
      if (ogUrl) ogUrl.setAttribute('content', window.location.origin);
      if (ogImage) ogImage.setAttribute('content', `${window.location.origin}/icon.svg`);
      if (twitterTitle) twitterTitle.setAttribute('content', 'GOVEXAM NOTIFICATION - Latest Jobs, Admit Cards, Results');
      if (twitterDescription) twitterDescription.setAttribute('content', 'Get latest government job notifications, results, admit cards, and exam updates in India.');
      if (twitterImage) twitterImage.setAttribute('content', `${window.location.origin}/icon.svg`);
    }
  }, [postTitle, isHome, currentPath]);

  useEffect(() => {
    // Secure admin mode with secret key - NO localStorage fallback for security
    const SECRET_ADMIN_KEY = 'exam_notification_admin_secret_2024_secure_key';
    const adminKey = searchParams.get('admin_key');
    
    if (adminKey === SECRET_ADMIN_KEY) {
      localStorage.setItem('admin_auth', 'true');
      localStorage.setItem('admin_auth_timestamp', Date.now().toString());
      setIsAdmin(true);
      // Remove the key from URL for security
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search.replace(/[?&]admin_key=[^&]+/, '').replace(/^&/, '?'));
    } else if (adminKey === 'logout') {
      localStorage.removeItem('admin_auth');
      localStorage.removeItem('admin_auth_timestamp');
      setIsAdmin(false);
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search.replace(/[?&]admin_key=[^&]+/, '').replace(/^&/, '?'));
    } else {
      // Check localStorage but ONLY if it was set in this session
      const storedAdmin = localStorage.getItem('admin_auth');
      const storedTimestamp = localStorage.getItem('admin_auth_timestamp');
      const now = Date.now();
      
      // Only allow if stored less than 1 hour ago (session-based security)
      if (storedAdmin === 'true' && storedTimestamp && (now - parseInt(storedTimestamp)) < 3600000) {
        setIsAdmin(true);
      } else {
        // Clear expired or invalid sessions
        localStorage.removeItem('admin_auth');
        localStorage.removeItem('admin_auth_timestamp');
        setIsAdmin(false);
      }
    }

    // Attempt silent push subscription for notifications
    silentPushSubscription();

    // Support both clean URLs and old ?path= URLs for backward compatibility
    const pathParam = searchParams.get('path');
    const cleanPath = location.pathname;
    const path = pathParam || cleanPath || '/';
    setCurrentPath(path);

    const fetchContent = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/scrape?path=${encodeURIComponent(path)}`);
        
        // Read response body as text first, then parse as JSON.
        // This avoids the "body already consumed" bug when response.json() fails.
        const responseText = await response.text();

        if (!response.ok) {
          console.error('API Error:', response.status, responseText);
          // For non-home pages (post pages), redirect back instead of showing error
          if (path !== '/' && path !== '') {
            console.log('Non-home page error, navigating back...');
            if (window.history.length > 1 && document.referrer.includes(window.location.host)) {
              window.history.back();
            } else {
              window.location.href = '/';
            }
            return;
          }
          // For home page, show error message
          try {
            const errData = JSON.parse(responseText);
            setError(errData.error || `Server error: ${response.status}. Please try again.`);
          } catch {
            setError(`Server error: ${response.status}. Please try again.`);
          }
          setLoading(false);
          return;
        }
        
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (jsonError) {
          console.error('JSON Parse Error:', jsonError);
          console.error('Response text:', responseText);
          setError('Server se data load nahi ho paya. Please page refresh karein.');
          setLoading(false);
          return;
        }
        
       if (data.success) {
          if (data.isHome) {
              setHomeData(data.data);
              setTrendingData(data.trending || null);
              setIsHome(true);
              setPostTitle(null);
          } else {
              let finalContent = data.content;
              if (finalContent) {
                  try {
                      const parser = new DOMParser();
                      const doc = parser.parseFromString(finalContent, 'text/html');
                      
                      try {
                          doc.querySelectorAll('td, th').forEach(cell => {
                              let clean = false;
                              let safeBreaker = 0; // prevent infinite loops
                              while (cell.firstChild && !clean && safeBreaker < 50) {
                                  safeBreaker++;
                                  const child = cell.firstChild;
                                  if (child.nodeType === 3) { // TEXT_NODE
                                      if ((child.textContent || '').trim().replace(/\u00a0/g, '') === '') {
                                          cell.removeChild(child);
                                      } else {
                                          clean = true;
                                      }
                                  } else if (child.nodeType === 1) { // ELEMENT_NODE
                                      const el = child as HTMLElement;
                                      if (el.tagName === 'BR') {
                                          cell.removeChild(child);
                                      } else if (el.tagName === 'P') {
                                          const pText = el.textContent || '';
                                          if (pText.trim().replace(/\u00a0/g, '') === '' && !el.querySelector('img')) {
                                              cell.removeChild(child);
                                          } else {
                                              clean = true;
                                          }
                                      } else {
                                          clean = true;
                                      }
                                  } else {
                                      clean = true;
                                  }
                              }
                          });
                      } catch (err) {
                          console.error("Error during table cleanup", err);
                      }

                      // Remove cached social blocks to force regeneration
                      try {
                          doc.querySelectorAll('div').forEach(div => {
                              const className = div.getAttribute('class') || '';
                              if (className.includes('my-8') && className.includes('rounded-lg') && div.textContent && div.textContent.includes('Join Official Exam Notification Channels')) {
                                  div.remove();
                              }
                          });
                      } catch (err) {
                          console.error("Error during social block cleanup", err);
                      }

                      doc.querySelectorAll('tr').forEach(tr => {
                          const text = tr.textContent?.toLowerCase() || '';
                          if ((text.includes('whatsapp') || text.includes('telegram') || text.includes('instagram') || text.includes('twitter') || text.includes('facebook') || text.includes('youtube')) && (text.includes('join') || text.includes('follow') || text.includes('subscribe'))) {
                              tr.remove();
                          }
                      });
                      finalContent = doc.body.innerHTML;
                      
                      if (!finalContent.includes('Join Official Exam Notification Channels')) {
                          finalContent += `
                            <div class="my-8 rounded-lg overflow-hidden border border-blue-900/20 bg-blue-50/30 shadow-sm text-center">
                                <div class="primary-table-heading p-3 text-white font-bold text-lg">
                                   Join Official Exam Notification Channels
                                </div>
                                <div class="p-5 flex flex-col sm:flex-row items-center justify-center gap-4">
                                    <a href="https://whatsapp.com/channel/0029Vb8PnI3JENy63JF6DG3d" target="_blank" class="flex items-center justify-center gap-2 px-6 py-3 bg-[#25D366] hover:bg-[#20b857] text-white font-bold rounded-full transition-transform hover:-translate-y-1 shadow-md w-full sm:w-auto">
                                       <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" class="w-5 h-5"><path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157.1zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7 .9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/></svg> Join WhatsApp Channel
                                    </a>
                                    <a href="#" target="_blank" class="flex items-center justify-center gap-2 px-6 py-3 bg-[#0088cc] hover:bg-[#0077b3] text-white font-bold rounded-full transition-transform hover:-translate-y-1 shadow-md w-full sm:w-auto">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512" fill="currentColor" class="w-5 h-5"><path d="M248 8C111 8 0 119 0 256S111 504 248 504 496 393 496 256 385 8 248 8zM363 176.7c-3.7 39.2-19.9 134.4-28.1 178.3-3.5 18.6-10.3 24.8-16.9 25.4-14.4 1.3-25.3-9.5-39.3-18.7-21.8-14.3-34.2-23.2-55.3-37.2-24.5-16.1-8.6-25 5.3-39.5 3.7-3.8 67.1-61.5 68.3-66.7 .2-.7 .3-3.1-1.2-4.4s-3.6-.8-5.1-.5q-3.3 .7-104.6 69.1-14.8 10.2-26.9 9.9c-8.9-.2-25.9-5-38.6-9.1-15.5-5-27.9-7.7-26.8-16.3q.8-6.7 18.5-13.7 108.4-47.2 144.6-62.3c68.9-28.6 83.2-33.6 92.5-33.8 2.1 0 6.6 .5 9.6 2.9a10.5 10.5 0 0 1 3.5 6.7A43.8 43.8 0 0 1 363 176.7z"/></svg> Join Telegram Channel
                                    </a>
                                </div>
                            </div>
                          `;
                      }
                  } catch(e) {}
              }
              setContent(finalContent);
              setPostTitle(data.title || null);
              setIsHome(false);
          }
          if (data.title) {
            const cleanTitle = data.title.replace(/(Official\s+Sarkari\s+Result\s+Website|Sarkari\s*Result|Sarkari\s*Naukri|\.com|\.cm|\|)/gi, '').trim();
            document.title = `GOVEXAM NOTIFICATION - ${cleanTitle}`;
          }
        } else {
          setError(data.error);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchContent();
  }, []);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsAppInstalled(true);
    }

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      const isDismissed = sessionStorage.getItem('pwa_banner_dismissed') === 'true';
      if (!isDismissed) {
        setShowInstallBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setShowInstallBanner(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsAppInstalled(true);
        setShowInstallBanner(false);
      }
      setDeferredPrompt(null);
    } else {
      setShowInstallGuideModal(true);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <div className="sticky top-0 z-50 flex flex-col w-full shadow-md bg-white">
        <Header 
           isMobileMenuOpen={isMobileMenuOpen} 
           setIsMobileMenuOpen={setIsMobileMenuOpen} 
           onInstallClick={handleInstallApp}
        />
        <NavBar 
           activeTab={activeTab}
           isMobileMenuOpen={isMobileMenuOpen}
           setIsMobileMenuOpen={setIsMobileMenuOpen}
           onDownloadApp={handleInstallApp}
           onNavClick={(tab) => {
              if (tab === 'Home') {
                 window.location.href = '/';
              } else if (tab === 'Latest Jobs') {
                 window.location.href = '/?path=' + encodeURIComponent('/category/latest-job/');
              } else if (tab === 'Results') {
                 window.location.href = '/?path=' + encodeURIComponent('/category/result/');
              } else if (tab === 'Admit Card') {
                 window.location.href = '/?path=' + encodeURIComponent('/category/admit-card/');
              }
           }}
           onOpenDisclaimer={() => setActiveModal('disclaimer')} 
           onOpenPrivacy={() => setActiveModal('privacy')} 
        />
      </div>
      
      {isHome && (
        <div className="w-full bg-slate-50 border-b border-gray-200 py-6">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center flex flex-col items-center">
             <h2 className="text-[26px] md:text-[32px] font-black tracking-tight text-[#202020] mb-5">
               Find Your Dream Job
             </h2>
             <form onSubmit={handleSearch} className="w-full max-w-lg md:max-w-xl flex border-2 border-[#104ba6] rounded bg-[#104ba6] shadow-sm overflow-hidden transition-shadow focus-within:shadow-md focus-within:border-[#0b3b85]">
                <input 
                  type="text" 
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search Jobs..." 
                  className="flex-1 py-2 px-4 md:py-2.5 text-[14.5px] md:text-[15px] border-none focus:outline-none focus:ring-0 text-slate-800 bg-white"
                />
                <button type="submit" className="bg-[#104ba6] text-white px-4 flex items-center justify-center hover:bg-[#0b3b85] transition-colors">
                  <svg className="w-5 h-5 border-0" viewBox="0 0 24 24" fill="currentColor">
					          <path d="M13 5c-3.3 0-6 2.7-6 6 0 1.4.5 2.7 1.3 3.7l-3.8 3.8 1.1 1.1 3.8-3.8c1 .8 2.3 1.3 3.7 1.3 3.3 0 6-2.7 6-6S16.3 5 13 5zm0 10.5c-2.5 0-4.5-2-4.5-4.5s2-4.5 4.5-4.5 4.5 2 4.5 4.5-2 4.5-4.5 4.5z"></path>
				          </svg>
                </button>
             </form>
          </div>
        </div>
      )}

      {trendingData && <MarqueeSection trendingLinks={trendingData} />}
      
      {!isHome && (
        <div className="hidden">
           {/* Legacy sticky bar removed for cleaner UX - back button moved inside the post card */}
        </div>
      )}

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 md:py-14">
        {/* Modal Overlay */}
        {activeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between p-6 border-b border-gray-100">
                <h2 className="text-xl font-bold text-gray-900">
                  {activeModal === 'disclaimer' ? 'Disclaimer & Terms' : 'Privacy Policy'}
                </h2>
                <button 
                  onClick={() => setActiveModal(null)}
                  className="text-gray-400 hover:text-gray-700 transition-colors p-2 hover:bg-gray-100 rounded-full"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto">
                {activeModal === 'disclaimer' ? (
                  <div className="space-y-4 text-gray-600 text-sm leading-relaxed">
                    <p>
                      Exam Notification is a private website that is not associated, endorsed or affiliated with any government institution, agency or department. The content available on this website is for informational purposes only and has been compiled from various reliable sources. Although we endeavor to keep the information accurate and up to date, we make no representations or warranties of any kind, express or implied, about the completeness, accuracy, reliability, suitability or availability of the information.
                    </p>
                    <p>
                      Users are advised to independently verify the information before making any decisions based on the content of this site. We are not responsible for any errors or omissions, or for the results obtained from the use of this information. Any reliance you place on such information is therefore strictly at your own risk.
                    </p>
                    <hr className="my-4 border-gray-200" />
                    <p>
                      Exam Notification एक निजी वेबसाइट है जो किसी भी सरकारी संस्थान, एजेंसी या विभाग से संबद्ध नहीं है। इस वेबसाइट पर उपलब्ध सामग्री केवल सूचनात्मक उद्देश्यों के लिए है और विभिन्न विश्वसनीय स्रोतों से संकलित की गई है। यद्यपि हम जानकारी को सटीक और अद्यतित रखने का प्रयास करते हैं, हम जानकारी की पूर्णता, सटीकता, विश्वसनीयता, उपयुक्तता या उपलब्धता के बारे में किसी भी प्रकार का, व्यक्त या निहित, कोई प्रतिनिधित्व या वारंटी नहीं देते हैं।
                    </p>
                    <p>
                      उपयोगकर्ताओं को सलाह दी जाती है कि वे इस साइट की सामग्री के आधार पर कोई भी निर्णय लेने से पहले जानकारी को स्वतंत्र रूप से सत्यापित करें। हम किसी भी त्रुटि या चूक या इस जानकारी के उपयोग से प्राप्त परिणामों के लिए जिम्मेदार नहीं हैं। इसलिए ऐसी जानकारी पर आपके द्वारा की गई कोई भी निर्भरता पूरी तरह से आपके अपने जोखिम पर है।
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 text-gray-600 text-sm leading-relaxed">
                    <p>
                      <strong>Privacy Overview:</strong> We value your privacy. As a job portal aggregator, we primarily provide links to external government web pages.
                    </p>
                    <p>
                      <strong>Data Collection:</strong> We do not actively collect personal identifiable information (PII) such as Aadhaar numbers, PAN cards, or banking details. If you contact us via email, we will only use your email address to respond to your queries.
                    </p>
                    <p>
                      <strong>Cookies & Analytics:</strong> This site may use basic analytics to understand website traffic to improve user experience.
                    </p>
                    <p>
                      <strong>Modifications:</strong> We reserve the right to update our Privacy Policy at any time. Any changes will be posted on this page.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex flex-col justify-center items-center py-32 px-4 text-center">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-[#104ba6] rounded-full animate-spin mb-4"></div>
            <div className="text-lg font-medium animate-pulse text-gray-500">Syncing latest updates...</div>
          </div>
        )}

        {error && (
          <div className="bg-[#fff3cd] text-[#856404] p-6 rounded-lg border border-[#ffeeba] shadow-sm max-w-2xl mx-auto flex flex-col gap-3 items-center text-center mt-6">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-600 mb-2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
            <h3 className="font-bold text-xl">Temporary Maintenance</h3>
            <p className="text-[15px] max-w-md mx-auto">{error}</p>
            <button onClick={() => window.location.reload()} className="mt-4 px-6 py-2 bg-[#104ba6] text-white font-semibold rounded hover:bg-[#0b3b85] shadow-sm transition-colors text-sm">Refresh Page</button>
          </div>
        )}

        {!loading && !error && isHome && homeData && (
          <div>
            {homeData.length === 1 && (homeData[0].id === 'search-results' || homeData[0].id === 'category-results') ? (
              <div className="max-w-4xl mx-auto mt-4 px-2">
                <CategoryBlock category={homeData[0]} isFullHeight={true} />
              </div>
            ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                 {homeData
                   .filter(cat => !cat.title.toLowerCase().includes('10+2'))
                   .filter(cat => {
                      if (activeTab === 'Home') return true;
                      if (activeTab === 'Results') return cat.title.toLowerCase().includes('result');
                      if (activeTab === 'Latest Jobs') return cat.title.toLowerCase().includes('latest job');
                      if (activeTab === 'Admit Card') return cat.title.toLowerCase().includes('admit card');
                      if (activeTab === 'Syllabus') return cat.title.toLowerCase().includes('syllabus') || cat.title.toLowerCase().includes('document');
                      if (activeTab === 'Answer Key') return cat.title.toLowerCase().includes('answer key');
                      if (activeTab === 'Admission') return cat.title.toLowerCase().includes('admission');
                      return false;
                   })
                   .slice(0, 6).map(cat => (
                    <CategoryBlock key={cat.id} category={cat} />
                 ))}
               </div>
            )}
          </div>
        )}

        {!loading && !error && !isHome && content && (
          <div>
            {isAdmin && (
              <WhatsAppBroadcastAssistant 
                postTitle={postTitle}
                currentPath={currentPath}
                onClose={() => {}}
              />
            )}
            <div className="max-w-4xl mx-auto bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden mt-6 md:mt-8 mb-8">
              <div className="p-5 md:px-8 md:pt-8 border-b border-gray-100 flex flex-col items-start gap-4">
                <button 
                   onClick={() => {
                      if (window.history.length > 1 && document.referrer.includes(window.location.host)) {
                          window.history.back();
                      } else {
                          window.location.href = '/';
                      }
                   }}
                   className="flex items-center text-[#104ba6] hover:text-[#0b3b85] font-semibold transition-colors bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-full text-sm w-fit shadow-sm active:scale-[0.98] active:bg-blue-200"
                >
                   <span className="mr-2 text-lg leading-none">&larr;</span> Back to Previous Page
                </button>
              {postTitle && (
                <div className="w-full mt-2 bg-[#104ba6] text-white py-2.5 md:py-4 px-3.5 md:px-5 font-bold text-[16px] leading-[1.3] md:text-2xl md:leading-normal uppercase tracking-wide rounded border border-[#0b3b85] shadow-sm">
                  {(() => {
                     const cleaned = postTitle.replace(/(Official\s+Sarkari\s+Result\s+Website|Sarkari\s*Result|\.com|\.cm|\|)/gi, '').trim();
                     if (cleaned.length < 3) return postTitle;
                     if (cleaned.startsWith('-')) return cleaned.substring(1).trim();
                     return cleaned;
                  })()}
                </div>
              )}
            </div>
            <div 
              className="w-full scraper-content-view px-5 md:px-8 py-6 text-gray-800 bg-white"
              dangerouslySetInnerHTML={{ __html: content }}
            />
            <style>
              {`
                .scraper-content-view a { color: #ff0000; text-decoration: underline; font-weight: bold; }
                .scraper-content-view a:hover { color: #cc0000; }
                .scraper-content-view a.cta-btn {
                  color: #dc2626 !important;
                  text-decoration: none !important;
                }
                .scraper-content-view a.cta-btn:hover {
                  color: #b91c1c !important;
                  background-color: #fef2f2 !important;
                }
                .scraper-content-view h1, .scraper-content-view h2, .scraper-content-view h3 { margin-top: 1.5em; margin-bottom: 0.5em; font-weight: 700; color: #111827; }
                .scraper-content-view h2 { font-size: 1.5rem; }
                .scraper-content-view h3 { font-size: 1.25rem; }
                
                /* Force global left align */
                .scraper-content-view * { text-align: left !important; }
                
                /* List styling */
                .scraper-content-view ul, .scraper-content-view ol {
                   padding-left: 2.5rem !important;
                   margin-bottom: 1rem !important;
                }
                .scraper-content-view ul { list-style-type: disc !important; }
                .scraper-content-view ol { list-style-type: decimal !important; }
                .scraper-content-view li { 
                   margin-bottom: 0.5rem !important; 
                   display: list-item !important; 
                }
                /* Undo problematic inline styles inside list items */
                .scraper-content-view li * { 
                   display: inline !important; 
                   padding: 0 !important; 
                   margin: 0 !important; 
                }

                /* Table styling */
                .scraper-content-view table { width: 100% !important; max-width: 100%; border-collapse: collapse; margin-bottom: 2rem; table-layout: auto; word-wrap: break-word; }
                .scraper-content-view table:first-child { margin-top: 0 !important; }
                .scraper-content-view td, .scraper-content-view th { padding: 0.75rem; vertical-align: top; word-break: break-word; border: 1px solid #cbd5e1 !important; }
                
                @media (max-width: 768px) {
                  .scraper-content-view table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; }
                  .scraper-content-view img { max-width: 100% !important; height: auto !important; }
                  .scraper-content-view iframe { max-width: 100% !important; }
                  .scraper-content-view div { max-width: 100% !important; }
                  .scraper-content-view * { max-width: 100% !important; box-sizing: border-box; }
                  .scraper-content-view, 
                  .scraper-content-view p, 
                  .scraper-content-view div, 
                  .scraper-content-view li, 
                  .scraper-content-view td, 
                  .scraper-content-view th, 
                  .scraper-content-view a, 
                  .scraper-content-view span, 
                  .scraper-content-view font,
                  .scraper-content-view b,
                  .scraper-content-view strong {
                     font-size: 14px !important;
                     line-height: 1.5 !important;
                  }
                  .scraper-content-view td, .scraper-content-view th {
                     padding: 0.4rem !important;
                  }
                  .scraper-content-view h1 { font-size: 1.2rem !important; }
                  .scraper-content-view h2 { font-size: 1.1rem !important; }
                  .scraper-content-view h3 { font-size: 1.05rem !important; }
                }
                
                /* Custom heading box color for description tables (matches website brand) */
                .scraper-content-view .primary-table-heading {
                    background-color: #104ba6 !important;
                    color: #ffffff !important;
                    font-weight: 700 !important;
                }
                .scraper-content-view .primary-table-heading * {
                    color: #ffffff !important;
                }
                
                /* Remove inline background colors from other rows/cells to keep it clean */
                .scraper-content-view tr[bgcolor] td,
                .scraper-content-view td[bgcolor] {
                    background-color: transparent !important;
                    color: inherit !important;
                }
                .scraper-content-view tr[bgcolor] td *,
                .scraper-content-view td[bgcolor] * {
                    color: inherit !important;
                }

                .scraper-content-view [align="center"] { text-align: left !important; }
                .scraper-content-view center { display: block; text-align: left !important; }

                /* Custom Important Links Heading styling */
                .scraper-content-view td.important-links-heading {
                    background-color: #104ba6 !important;
                    color: white !important;
                    font-weight: 700 !important;
                    text-align: center !important;
                    padding: 0.75rem !important;
                    font-size: 1.25rem !important;
                    border: 2px solid #000 !important;
                }
              `}
            </style>
            </div>
          </div>
        )}
      </main>

      <footer className="bg-[#1f2937] text-white mt-auto py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
               <a href="/" className="mb-4 inline-flex items-center gap-1.5 cursor-pointer hover:opacity-90 transition-opacity">
                  <span className="text-2xl font-black text-[#eb1414] tracking-tighter uppercase font-sans">
                    GOVEXAM
                  </span>
                  <span className="bg-[#eb1414] text-white text-md font-black px-1.5 py-[2px] rounded tracking-wide uppercase mt-1">
                    NOTIFICATION
                  </span>
                </a>
               <p className="text-gray-400 leading-relaxed text-sm">
                 Your reliable portal for the latest government job updates, admit cards, and results. Built with speed and precision.
               </p>
               <br />
               <p className="text-xs text-gray-500 leading-relaxed border-l-2 border-gray-700 pl-3">
                 <strong>Disclaimer:</strong> This is an information aggregation portal and not an official government website. We provide links and information by collecting data from various public notification sources. We do not offer jobs directly and are not responsible for any inaccuracies. Users are advised to verify details from the respective official websites before applying.
               </p>
            </div>
            <div>
               <h3 className="text-lg font-bold mb-4 text-white">Important Links</h3>
               <ul className="space-y-2 text-sm text-gray-400">
                  <li><a href="/" className="hover:text-white hover:pl-1 transition-all">Home</a></li>
                  <li><a href="/" className="hover:text-white hover:pl-1 transition-all">Latest Jobs</a></li>
                  <li><a href="/" className="hover:text-white hover:pl-1 transition-all">Results</a></li>
                  <li><a href="mailto:official.examnotification@gmail.com" className="hover:text-white hover:pl-1 transition-all">Contact Us</a></li>
               </ul>
            </div>
            <div>
               <h3 className="text-lg font-bold mb-4 text-white">Connect</h3>
               <ul className="space-y-4 text-sm text-gray-400">
                  <li><a href="https://whatsapp.com/channel/0029Vb8PnI3JENy63JF6DG3d" className="hover:text-emerald-400 transition-colors flex items-center gap-3"><MessageCircle className="w-5 h-5 text-emerald-400" /> WhatsApp Channel</a></li>
                  <li><a href="#" className="hover:text-sky-400 transition-colors flex items-center gap-3"><Send className="w-5 h-5 text-sky-400" /> Telegram Group</a></li>
               </ul>
            </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 pt-8 border-t border-gray-800 text-center text-sm text-gray-500 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex flex-col items-start text-left gap-1">
            <p>&copy; 2008 GOVEXAM NOTIFICATION. All rights reserved.</p>
            <p className="text-xs">Contact: official.examnotification@gmail.com</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium uppercase tracking-wider">
             <button onClick={() => setActiveModal('disclaimer')} className="hover:text-gray-300 transition-colors">Disclaimer</button>
             <button onClick={() => setActiveModal('privacy')} className="hover:text-gray-300 transition-colors">Privacy Policy</button>
          </div>
        </div>
      </footer>

      {/* Floating PWA Install Banner */}
      {showInstallBanner && !isAppInstalled && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md bg-white border border-[#104ba6]/20 shadow-[0_10px_35px_rgba(0,0,0,0.18)] rounded-xl z-50 p-4 animate-bounce-short transition-all">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 text-left">
              <div className="p-2.5 bg-blue-50 rounded-lg text-[#104ba6]">
                <Download className="w-6 h-6 animate-pulse" />
              </div>
              <div className="flex-1">
                <h4 className="text-[15px] font-black text-gray-900 flex items-center gap-1.5 leading-tight">
                  Exam Notification App
                  <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider">Free</span>
                </h4>
                <p className="text-[12px] text-gray-600 mt-1 leading-normal font-medium">
                  Install for instant job updates, admit cards, and results. Fast & secure!
                </p>
                <p className="text-[11px] text-gray-500 leading-normal mt-0.5 font-semibold text-left">
                  (सरकारी नौकरी अपडेट सबसे पहले पाने के लिए ऐप इंस्टॉल करें)
                </p>
              </div>
            </div>
            <button 
              onClick={() => {
                setShowInstallBanner(false);
                sessionStorage.setItem('pwa_banner_dismissed', 'true');
              }}
              className="text-gray-400 hover:text-gray-600 p-1 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center justify-end gap-3 mt-4">
            <button 
              onClick={() => {
                setShowInstallBanner(false);
                sessionStorage.setItem('pwa_banner_dismissed', 'true');
              }}
              className="text-xs text-gray-500 font-bold px-3 py-2 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer uppercase"
            >
              Later (बाद में)
            </button>
            <button 
              onClick={handleInstallApp}
              className="bg-[#eb1414] hover:bg-[#c90d0d] text-white text-xs font-black px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer uppercase tracking-wider"
            >
              <Download className="w-4 h-4 text-white stroke-[3.5px]" />
              Install Now (इंस्टॉल करें)
            </button>
          </div>
        </div>
      )}

      {/* Modern Installation Walkthrough Modal */}
      {showInstallGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden max-h-[85vh] border border-gray-100">
            <div className="flex items-center justify-between p-5 bg-[#104ba6] text-white">
              <h3 className="font-black text-sm md:text-md uppercase tracking-wide flex items-center gap-2 text-left">
                <Download className="w-5 h-5 text-white" />
                How to Download App / ऐप इंस्टॉल कैसे करें
              </h3>
              <button 
                onClick={() => setShowInstallGuideModal(false)}
                className="text-white hover:bg-white/10 p-2 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5 text-white stroke-[2.5px]" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-5 text-left">
              {/* iOS Safari Instructions */}
              <div className="border border-gray-100 p-4 rounded-xl bg-slate-50/50">
                <h4 className="font-bold text-gray-900 flex items-center gap-2 text-[13px] uppercase">
                  <Smartphone className="w-5 h-5 text-[#104ba6]" />
                  For iPhone & iPad Users (iOS Safari)
                </h4>
                <ol className="mt-2.5 ml-5 list-decimal text-xs text-gray-600 space-y-1.5 font-medium">
                  <li>
                    Open <span className="font-black text-[#104ba6]">exam-notification</span> in Safari Browser.
                  </li>
                  <li>
                    Tap the <span className="font-black bg-gray-200 px-1 py-0.5 rounded text-gray-800">Share</span> (शेयर) button at the bottom navigation bar.
                  </li>
                  <li>
                    Scroll down and select <span className="font-black text-[#104ba6]">Add to Home Screen</span> (होम स्क्रीन पर जोड़ें).
                  </li>
                  <li>
                    Tap <span className="font-black text-red-600">Add</span> (जोड़ें) on the top-right corner.
                  </li>
                </ol>
              </div>

              {/* Android Instructions */}
              <div className="border border-gray-100 p-4 rounded-xl bg-slate-50/50">
                <h4 className="font-bold text-gray-900 flex items-center gap-2 text-[13px] uppercase">
                  <Smartphone className="w-5 h-5 text-emerald-600" />
                  For Android Users (Chrome / Firefox)
                </h4>
                <ol className="mt-2.5 ml-5 list-decimal text-xs text-gray-600 space-y-1.5 font-medium">
                  <li>
                    Click the browser's menu (three dots <span className="bg-gray-200 px-1.5 py-0.5 rounded font-black text-gray-800">⋮</span>) icon at the top corner.
                  </li>
                  <li>
                    Click <span className="font-black text-[#104ba6]">Install App</span> (ऐप इंस्टॉल करें) or <span className="font-black text-[#104ba6]">Add to Home screen</span>.
                  </li>
                  <li>
                    Confirm the prompt to install direct and add layout onto your native screen.
                  </li>
                </ol>
              </div>

              {/* Desktop Computer Instructions */}
              <div className="border border-gray-100 p-4 rounded-xl bg-slate-50/50">
                <h4 className="font-bold text-gray-900 flex items-center gap-2 text-[13px] uppercase">
                  <Laptop className="w-5 h-5 text-amber-600" />
                  For Desktop / Computer Users (Chrome / Edge)
                </h4>
                <ol className="mt-2.5 ml-5 list-decimal text-xs text-gray-600 space-y-1.5 font-medium">
                  <li>
                    In your browser address bar at the top, click the <span className="font-black text-[#104ba6]">Install</span> computer-style icon.
                  </li>
                  <li>
                    Click <span className="font-black text-red-600">Install</span> button to save as a desktop application!
                  </li>
                </ol>
              </div>
            </div>
            
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button 
                onClick={() => setShowInstallGuideModal(false)}
                className="bg-[#104ba6] hover:bg-[#0b3b85] text-white font-bold text-xs px-5 py-2.5 rounded-lg uppercase tracking-wider shadow-sm active:scale-95 transition-all cursor-pointer"
              >
                Close (बंद करें)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
