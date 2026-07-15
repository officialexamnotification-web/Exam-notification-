import React from 'react';
import { Sparkles, Zap, CheckSquare, ExternalLink, ShieldCheck, HelpCircle } from 'lucide-react';

export default function AboutUsPage() {
  const values = [
    {
      icon: <Zap className="w-6 h-6 text-yellow-500" />,
      title: "Real-time Speed",
      desc: "Our automatic crawling pipeline captures state and central job vacancies within minutes of public releases."
    },
    {
      icon: <CheckSquare className="w-6 h-6 text-emerald-500" />,
      title: "Clean Verification",
      desc: "We manually verify the official notification PDF and structure table fields clearly so candidates don't get confused."
    },
    {
      icon: <ExternalLink className="w-6 h-6 text-[#104ba6]" />,
      title: "Direct Access",
      desc: "We never wrap or gate official link targets. Apply, Syllabus, and Result links route directly to official government portals."
    },
    {
      icon: <ShieldCheck className="w-6 h-6 text-red-500" />,
      title: "Zero Spam",
      desc: "No popup registration walls, no scam redirect banners, and no fake payment requests. Your focus remains solely on careers."
    }
  ];

  return (
    <div className="bg-white border border-gray-200 shadow-lg rounded-2xl overflow-hidden mb-12 animate-fade-in">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-700 via-blue-700 to-[#104ba6] px-6 py-8 md:p-10 text-white flex flex-col md:flex-row items-center gap-6">
        <div className="flex-shrink-0">
          <img src="/icon.svg" alt="About Us" className="w-16 h-16 md:w-20 md:h-20 object-contain drop-shadow-md" />
        </div>
        <div className="text-center md:text-left">
          <h1 className="text-2xl md:text-3xl font-black tracking-tight uppercase">About Us</h1>
          <p className="text-blue-100 text-sm md:text-base mt-2 font-medium">
            Learn more about GOVEXAM NOTIFICATION's values and mission.
          </p>
        </div>
      </div>

      <div className="p-6 md:p-10 space-y-12">
        {/* Intro Section */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          <div className="md:col-span-7 space-y-4">
            <h2 className="text-xl md:text-2xl font-black text-gray-900 uppercase">Who We Are</h2>
            <div className="text-gray-600 text-sm md:text-base space-y-4 leading-relaxed">
              <p>
                Founded in <strong>2016</strong>, <strong>GOVEXAM NOTIFICATION</strong> was born out of a simple need: to provide lakhs of hardworking candidates in India with a faster, cleaner, and completely honest bulletin for government recruitments (सरकारी नौकरी).
              </p>
              <p>
                We understand that government examinations (like UPSC, SSC, Railways, State PSC, Bank, Navy, Army, and Teaching) have rigorous timelines and overwhelming eligibility requirements. Finding the official PDF links, correct dates, syllabus criteria, and result portals shouldn't feel like a job of its own.
              </p>
              <p>
                We serve over millions of monthly active users across India through our web portal and lightweight, fast Android application.
              </p>
            </div>
          </div>
          <div className="md:col-span-5 bg-gray-50/50 p-6 rounded-2xl border border-gray-150 flex flex-col items-center justify-center text-center space-y-4">
            <div className="text-4xl md:text-5xl font-black text-[#104ba6]">10M+</div>
            <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">Successful Pageviews</div>
            <div className="w-12 h-0.5 bg-gray-200"></div>
            <div className="text-4xl md:text-5xl font-black text-[#eb1414]">100%</div>
            <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">Free & Unbiased Information</div>
          </div>
        </div>

        {/* Our Mission */}
        <div className="space-y-4">
          <h2 className="text-xl md:text-2xl font-black text-gray-900 uppercase">Our Core Mission</h2>
          <p className="text-gray-600 text-sm md:text-base leading-relaxed">
            Our mission is to democratize government employment recruitment notifications in India. We aim to break down complex eligibility tables, simplify dates, and provide direct linkages so that candidates living in rural, semi-urban, or metro areas have identical, instantaneous access to opportunities. We are dedicated to providing clear, anti-misleading material, protecting candidates from phishing sites.
          </p>
        </div>

        {/* Values Bento Grid */}
        <div className="space-y-6">
          <h2 className="text-xl md:text-2xl font-black text-gray-900 uppercase text-center md:text-left">What Makes Us Stand Out</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {values.map((v, i) => (
              <div key={i} className="p-5 border border-gray-150 rounded-2xl bg-white hover:shadow-md transition-shadow flex gap-4">
                <div className="p-3 bg-gray-50 rounded-xl h-fit shrink-0">
                  {v.icon}
                </div>
                <div className="space-y-1">
                  <h4 className="font-extrabold text-gray-900 text-base">{v.title}</h4>
                  <p className="text-gray-600 text-xs md:text-sm leading-relaxed">{v.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer CTA */}
        <div className="p-6 md:p-8 rounded-2xl bg-blue-50/50 border border-blue-100 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left space-y-1">
            <h4 className="font-bold text-blue-950 text-base">Explore all vacancies today</h4>
            <p className="text-xs md:text-sm text-blue-800 leading-normal">
              Find state and central jobs categorized perfectly in our latest listings.
            </p>
          </div>
          <a
            href="/"
            className="px-6 py-2.5 bg-[#104ba6] hover:bg-[#0b3b85] text-white font-bold rounded-full text-sm transition-colors shadow-sm"
          >
            Browse Latest Jobs
          </a>
        </div>
      </div>
    </div>
  );
}
