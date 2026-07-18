/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import NavBar from './components/NavBar';
import MarqueeSection from './components/MarqueeSection';
import CategoryBlock from './components/CategoryBlock';
import FeaturedJobs from './components/FeaturedJobs';
import WhatsAppBroadcastAssistant from './components/WhatsAppBroadcastAssistant';
import { MessageCircle, Send, Download, Smartphone, Laptop, X } from 'lucide-react';
import { silentPushSubscription } from './lib/fcm';
import { useSearchParams, useLocation } from 'react-router-dom';
import { AdminPanel } from './components/AdminPanel';
import AboutUsPage from './components/AboutUsPage';
import ContactUsPage from './components/ContactUsPage';
import DisclaimerPage from './components/DisclaimerPage';
import PrivacyPolicyPage from './components/PrivacyPolicyPage';

export default function App() {
  const [content, setContent] = useState<string | null>(null);
  const [postTitle, setPostTitle] = useState<string | null>(null);
  const [homeData, setHomeData] = useState<any[] | null>(null);
  const [trendingData, setTrendingData] = useState<any[] | null>(null);
  const [featuredData, setFeaturedData] = useState<any[] | null>(null);
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
    const pathParam = searchParams.get('path');
    const cleanPath = location.pathname;
    const path = pathParam || cleanPath || '/';
    
    if (path.includes('search')) return 'Search';
    if (path.includes('latest-job')) return 'Latest Jobs';
    if (path.includes('result')) return 'Results';
    if (path.includes('admit-card')) return 'Admit Card';
    if (path.includes('answer-key')) return 'Answer Key';
    if (path.includes('syllabus')) return 'Syllabus';
    if (path.includes('admission')) return 'Admission';
    if (path.includes('about-us')) return 'About Us';
    if (path.includes('contact-us')) return 'Contact Us';
    if (path.includes('disclaimer')) return 'Disclaimer';
    if (path.includes('privacy-policy')) return 'Privacy Policy';
    return 'Home';
  });

  useEffect(() => {
    silentPushSubscription();

    const pathParam = searchParams.get('path');
    const cleanPath = location.pathname;
    const searchQuery = searchParams.get('q');
    
    let path = pathParam || cleanPath || '/';
    
    if (searchQuery) {
      path = `/search?q=${searchQuery}`;
    }
    
    setCurrentPath(path);

    const fetchContent = async () => {
      if (path.toLowerCase().trim().replace(/\/$/, '') === '/admin-panel-secure') {
        setLoading(false);
        setError(null);
        return;
      }
      const seoPages = ['/disclaimer', '/privacy-policy', '/contact-us', '/about-us'];
      if (seoPages.includes(path)) {
        setIsHome(false);
        setLoading(false);
        setError(null);
        if (path === '/disclaimer') setPostTitle('Disclaimer & Terms');
        else if (path === '/privacy-policy') setPostTitle('Privacy Policy');
        else if (path === '/contact-us') setPostTitle('Contact Us');
        else if (path === '/about-us') setPostTitle('About Us');
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/scrape?path=${encodeURIComponent(path)}`);
        const responseText = await response.text();

        if (!response.ok) {
          if (path !== '/' && path !== '') {
            if (window.history.length > 1 && document.referrer.includes(window.location.host)) {
              window.history.back();
            } else {
              window.location.href = '/';
            }
            return;
          }
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
          const trimmed = responseText.trim();
          if (!trimmed || trimmed === 'undefined' || trimmed === 'null') {
            throw new Error("Empty or invalid response string");
          }
          data = JSON.parse(responseText);
        } catch (jsonError) {
          setError('Server se data load nahi ho paya. Please page refresh karein.');
          setLoading(false);
          return;
        }
        
        if (data.success) {
          if (data.isHome) {
            setHomeData(data.data);
            setTrendingData(data.trending || null);
            setFeaturedData(data.featured || null);
            setIsHome(true);
            setPostTitle(null);
          } else {
            // Check if this is a category page (has category data structure with links)
            if (data.data && Array.isArray(data.data) && data.data.length > 0 && data.data[0].links) {
              setHomeData(data.data);
              setIsHome(false); // Category page, not homepage
              setPostTitle(data.title || null);
            } else {
              setContent(data.content);
              setPostTitle(data.title || null);
              setIsHome(false);
            }
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

  const normalizedPath = location.pathname.toLowerCase().trim().replace(/\/$/, '');
  if (normalizedPath === '/admin-panel-secure') {
    return <AdminPanel />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <div className="sticky top-0 z-50 flex flex-col w-full shadow-md bg-white">
        <Header 
           isMobileMenuOpen={isMobileMenuOpen} 
           setIsMobileMenuOpen={setIsMobileMenuOpen} 
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
                 window.location.href = '/category/latest-job';
              } else if (tab === 'Results') {
                 window.location.href = '/category/result';
              } else if (tab === 'Admit Card') {
                 window.location.href = '/category/admit-card';
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
                <button type="submit" className="bg-[#104ba6] text-white px-4 flex items-center justify-center hover:bg-[#0b3b85] transition-colors" aria-label="Search">
                  <svg className="w-5 h-5 border-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13 5c-3.3 0-6 2.7-6 6 0 1.4.5 2.7 1.3 3.7l-3.8 3.8 1.1 1.1 3.8-3.8c1 .8 2.3 1.3 3.7 1.3 3.3 0 6-2.7 6-6S16.3 5 13 5zm0 10.5c-2.5 0-4.5-2-4.5-4.5s2-4.5 4.5-4.5 4.5 2 4.5 4.5-2 4.5-4.5 4.5z"></path>
                  </svg>
                </button>
             </form>
          </div>
        </div>
      )}

      {trendingData && <MarqueeSection trendingLinks={trendingData} />}
      
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 md:py-14">
        {featuredData && featuredData.length > 0 && <FeaturedJobs featuredJobs={featuredData} />}
        {loading && isHome && (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
             {[1, 2, 3, 4, 5, 6].map(i => (
               <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 h-[380px] p-0 flex flex-col overflow-hidden">
                 <div className="bg-gray-100 p-4 border-b border-gray-200">
                    <div className="h-6 bg-gray-300 rounded w-1/2 animate-pulse"></div>
                 </div>
                 <div className="p-4 space-y-4 flex-1">
                   {[1, 2, 3, 4, 5, 6, 7].map(j => (
                     <div key={j} className="h-4 bg-gray-200 rounded animate-pulse w-full"></div>
                   ))}
                 </div>
               </div>
             ))}
           </div>
        )}

        {!loading && !error && isHome && homeData && (
          <div className={`grid grid-cols-1 ${homeData.length === 1 ? 'md:grid-cols-1 lg:grid-cols-1' : 'md:grid-cols-2 lg:grid-cols-3'} gap-6`}>
            {homeData.map((category: any) => (
              <CategoryBlock key={category.id} category={category} isFullHeight={homeData.length === 1} showAll={false} />
            ))}
          </div>
        )}

        {!loading && !error && !isHome && homeData && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="mb-6">
              <button 
                 onClick={() => {
                    window.location.href = '/';
                 }}
                 className="flex items-center text-[#104ba6] hover:text-[#0b3b85] font-semibold transition-colors bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-full text-sm w-fit shadow-sm active:scale-[0.98] active:bg-blue-200"
              >
                 <span className="mr-2 text-lg leading-none">&larr;</span> Back to Home Page
              </button>
            </div>
            <div className={`grid grid-cols-1 ${homeData.length === 1 ? 'md:grid-cols-1 lg:grid-cols-1' : 'md:grid-cols-2 lg:grid-cols-3'} gap-6`}>
              {homeData.map((category: any) => (
                <CategoryBlock key={category.id} category={category} isFullHeight={homeData.length === 1} showAll={true} />
              ))}
            </div>
          </div>
        )}

        {loading && !isHome && (
          <div className="flex flex-col justify-center items-center py-32 px-4 text-center">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-[#104ba6] rounded-full animate-spin mb-4"></div>
            <div className="text-lg font-medium animate-pulse text-gray-500">Syncing latest updates...</div>
          </div>
        )}

        {!loading && !error && !isHome && ['/disclaimer', '/privacy-policy', '/contact-us', '/about-us'].includes(currentPath) && (
          <div className="max-w-4xl mx-auto mt-6">
            <div className="mb-6">
              <button 
                 onClick={() => {
                    window.location.href = '/';
                 }}
                 className="flex items-center text-[#104ba6] hover:text-[#0b3b85] font-semibold transition-colors bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-full text-sm w-fit shadow-sm active:scale-[0.98] active:bg-blue-200"
              >
                 <span className="mr-2 text-lg leading-none">&larr;</span> Back to Home Page
              </button>
            </div>
            {currentPath === '/disclaimer' && <DisclaimerPage />}
            {currentPath === '/privacy-policy' && <PrivacyPolicyPage />}
            {currentPath === '/contact-us' && <ContactUsPage />}
            {currentPath === '/about-us' && <AboutUsPage />}
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
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{postTitle || 'Government Job Notification'}</h1>
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
              </div>
              <div 
                className="w-full job-content-view px-5 md:px-8 py-6 text-gray-800 bg-white"
                dangerouslySetInnerHTML={{ __html: content }}
              />
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
             </div>
             <div>
                <h3 className="text-lg font-bold mb-4 text-white">Important Links</h3>
                <ul className="space-y-2 text-sm text-gray-400">
                   <li><a href="/" className="hover:text-white hover:pl-1 transition-all">Home</a></li>
                   <li><a href="/?path=%2Fcategory%2Flatest-job%2F" className="hover:text-white hover:pl-1 transition-all">Latest Jobs</a></li>
                   <li><a href="/?path=%2Fcategory%2Fresult%2F" className="hover:text-white hover:pl-1 transition-all">Results</a></li>
                   <li><a href="/about-us" className="hover:text-white hover:pl-1 transition-all">About Us</a></li>
                   <li><a href="/contact-us" className="hover:text-white hover:pl-1 transition-all">Contact Us</a></li>
                </ul>
             </div>
             <div>
                <h3 className="text-lg font-bold mb-4 text-white">Connect</h3>
                <ul className="space-y-4 text-sm text-gray-400">
                   <li><a href="https://whatsapp.com/channel/0029Vb8PnI3JENy63JF6DG3d" className="hover:text-emerald-400 transition-colors flex items-center gap-3"><MessageCircle className="w-5 h-5 text-emerald-400" /> WhatsApp Channel</a></li>
                   <li><a href="https://telegram.me/Gov_exam_notification" target="_blank" rel="noopener noreferrer" className="hover:text-sky-400 transition-colors flex items-center gap-3"><Send className="w-5 h-5 text-sky-400" /> Telegram Group</a></li>
                   <li><a href="/govexam-app.apk" download="govexam-app.apk" className="hover:text-red-400 transition-colors flex items-center gap-3"><Download className="w-5 h-5 text-red-400" /> Download Android App</a></li>
                </ul>
             </div>
         </div>
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 pt-8 border-t border-gray-800 text-sm text-gray-500 flex flex-col gap-6">
           <div className="w-full text-justify md:text-center">
             <p className="text-[11px] md:text-xs text-gray-400 leading-relaxed">
               <strong className="text-gray-300 uppercase tracking-wider">Disclaimer:</strong> GOVEXAM NOTIFICATION is an independent educational news portal and job aggregator. We are <strong>NOT</strong> associated with any government organization, board, or commission. Our mission is to provide accurate, timely, and organized employment information by aggregating data from official public notifications. All content is for informational purposes only. We advise users to verify all details on the respective official government websites before applying.
             </p>
           </div>
           <div className="flex flex-col md:flex-row justify-between items-center gap-4">
             <div className="flex flex-col md:flex-row gap-2 md:gap-4 items-center">
               <p>&copy; 2016 GOVEXAM NOTIFICATION. All rights reserved.</p>
              <span className="hidden md:inline text-gray-600">|</span>
              <p className="text-xs">Contact: official.examnotification@gmail.com</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium uppercase tracking-wider">
                <a href="/about-us" className="hover:text-gray-300 transition-colors">About Us</a>
                <a href="/contact-us" className="hover:text-gray-300 transition-colors">Contact Us</a>
                <a href="/disclaimer" className="hover:text-gray-300 transition-colors">Disclaimer</a>
                <a href="/privacy-policy" className="hover:text-gray-300 transition-colors">Privacy Policy</a>
             </div>
          </div>
        </div>
      </footer>

      {showInstallBanner && !isAppInstalled && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md bg-white border border-[#104ba6]/20 shadow-[0_10px_35px_rgba(0,0,0,0.18)] rounded-xl z-50 p-4 animate-bounce-short transition-all">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 text-left">
              <div className="p-2.5 bg-blue-50 rounded-lg text-[#104ba6]">
                <Download className="w-6 h-6 animate-pulse" />
              </div>
              <div className="flex-1">
                <h4 className="text-[15px] font-black text-gray-900 flex items-center gap-1.5 leading-tight">
                  GOVEXAM NOTIFICATION App
                  <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider">Free</span>
                </h4>
                <p className="text-[12px] text-gray-600 mt-1 leading-normal font-medium">
                  Install for instant job updates, admit cards, and results. Fast & secure!
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
              Later
            </button>
            <a
              href="/govexam-app.apk"
              download="govexam-app.apk"
              className="bg-green-600 hover:bg-green-700 text-white text-xs font-black px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer uppercase tracking-wider"
            >
              <Download className="w-4 h-4 text-white stroke-[3.5px]" />
              Download APK
            </a>
            <button 
              onClick={handleInstallApp}
              className="bg-[#eb1414] hover:bg-[#c90d0d] text-white text-xs font-black px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer uppercase tracking-wider"
            >
              <Download className="w-4 h-4 text-white stroke-[3.5px]" />
              Install Now
            </button>
          </div>
        </div>
      )}

      {showInstallGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden max-h-[85vh] border border-gray-100">
            <div className="flex items-center justify-between p-5 bg-[#104ba6] text-white">
              <h3 className="font-black text-sm md:text-md uppercase tracking-wide flex items-center gap-2 text-left">
                <Download className="w-5 h-5 text-white" />
                How to Download App
              </h3>
              <button 
                onClick={() => setShowInstallGuideModal(false)}
                className="text-white hover:bg-white/10 p-2 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5 text-white stroke-[2.5px]" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-5 text-left">
              <div className="border border-gray-100 p-4 rounded-xl bg-slate-50/50">
                <h4 className="font-bold text-gray-900 flex items-center gap-2 text-[13px] uppercase">
                  <Smartphone className="w-5 h-5 text-[#104ba6]" />
                  For iPhone & iPad Users (iOS Safari)
                </h4>
                <ol className="mt-2.5 ml-5 list-decimal text-xs text-gray-600 space-y-1.5 font-medium">
                  <li>Open <span className="font-black text-[#104ba6]">GOVEXAM-NOTIFICATION</span> in Safari Browser.</li>
                  <li>Tap the <span className="font-black bg-gray-200 px-1 py-0.5 rounded text-gray-800">Share</span> button at the bottom navigation bar.</li>
                  <li>Scroll down and select <span className="font-black text-[#104ba6]">Add to Home Screen</span>.</li>
                  <li>Tap <span className="font-black text-red-600">Add</span> on the top-right corner.</li>
                </ol>
              </div>

              <div className="border border-gray-100 p-4 rounded-xl bg-slate-50/50">
                <h4 className="font-bold text-gray-900 flex items-center gap-2 text-[13px] uppercase">
                  <Smartphone className="w-5 h-5 text-emerald-600" />
                  For Android Users (Chrome / Firefox)
                </h4>
                <ol className="mt-2.5 ml-5 list-decimal text-xs text-gray-600 space-y-1.5 font-medium">
                  <li>Click the browser's menu (three dots <span className="bg-gray-200 px-1.5 py-0.5 rounded font-black text-gray-800">⋮</span>) icon at the top corner.</li>
                  <li>Click <span className="font-black text-[#104ba6]">Install App</span> or <span className="font-black text-[#104ba6]">Add to Home screen</span>.</li>
                  <li>Confirm the prompt to install direct and add layout onto your native screen.</li>
                </ol>
              </div>

              <div className="border border-gray-100 p-4 rounded-xl bg-slate-50/50">
                <h4 className="font-bold text-gray-900 flex items-center gap-2 text-[13px] uppercase">
                  <Laptop className="w-5 h-5 text-amber-600" />
                  For Desktop / Computer Users (Chrome / Edge)
                </h4>
                <ol className="mt-2.5 ml-5 list-decimal text-xs text-gray-600 space-y-1.5 font-medium">
                  <li>In your browser address bar at the top, click the <span className="font-black text-[#104ba6]">Install</span> computer-style icon.</li>
                  <li>Click <span className="font-black text-red-600">Install</span> button to save as a desktop application!</li>
                </ol>
              </div>
            </div>
            
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button 
                onClick={() => setShowInstallGuideModal(false)}
                className="bg-[#104ba6] hover:bg-[#0b3b85] text-white font-bold text-xs px-5 py-2.5 rounded-lg uppercase tracking-wider shadow-sm active:scale-95 transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
