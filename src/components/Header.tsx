import React from 'react';
import { Menu, X, Download } from 'lucide-react';

interface HeaderProps {
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (val: boolean) => void;
}

export default function Header({ isMobileMenuOpen, setIsMobileMenuOpen }: HeaderProps) {
  return (
    <header className="bg-[#104ba6] py-3 px-4 shadow-[0_2px_4px_rgba(0,0,0,0.1)] relative z-50">
      <div className="max-w-7xl mx-auto sm:px-6 lg:px-8">
        <div className="flex flex-col justify-center">
          <div className="w-full flex justify-between items-center bg-[#104ba6]">
            {/* Logo area */}
             <a href="/" className="flex items-center gap-0 cursor-pointer hover:opacity-90 transition-opacity">
              <img 
                src="/icon.svg" 
                alt="GOVEXAM Logo" 
                className="w-18 h-18 md:w-26 md:h-26 -mr-1.5 md:-mr-3 object-contain"
                referrerPolicy="no-referrer"
              />
              <div className="flex flex-col sm:flex-row sm:items-center gap-1">
                <span className="text-2xl md:text-[32px] font-black text-white tracking-tighter uppercase font-sans drop-shadow-sm leading-none">
                  GOVEXAM
                </span>
                <span className="bg-[#eb1414] text-white text-[14px] md:text-[18px] font-black px-2 py-[2px] rounded tracking-wide uppercase shadow-sm w-fit leading-none">
                  NOTIFICATION
                </span>
              </div>
            </a>
            
            {/* Download App & Mobile Menu Icons */}
            <div className="flex items-center gap-3.5">
              <a 
                href="/govexam-app.apk"
                download="govexam-app.apk"
                className="hidden md:flex bg-[#eb1414] hover:bg-[#c90d0d] text-white text-[12.5px] md:text-[14px] font-black px-3.5 py-2 rounded items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer uppercase transition-all"
                title="Download Android App"
              >
                <Download className="w-4 h-4 text-white stroke-[3px]" />
                <span>Download App</span>
              </a>

              <div className="md:hidden flex items-center">
                 <button className="p-1" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} aria-label="Toggle Menu">
                   {isMobileMenuOpen ? <X className="w-7 h-7 text-white" /> : <Menu className="w-7 h-7 text-white" />}
                 </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
