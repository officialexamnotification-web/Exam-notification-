import React from 'react';
import { Menu, X, Download } from 'lucide-react';

interface HeaderProps {
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (val: boolean) => void;
  onInstallClick?: () => void;
}

export default function Header({ isMobileMenuOpen, setIsMobileMenuOpen, onInstallClick }: HeaderProps) {
  return (
    <header className="bg-[#104ba6] py-3 px-4 shadow-[0_2px_4px_rgba(0,0,0,0.1)] relative z-50">
      <div className="max-w-7xl mx-auto sm:px-6 lg:px-8">
        <div className="flex flex-col justify-center">
          <div className="w-full flex justify-between items-center bg-[#104ba6]">
            {/* Logo area */}
             <a href="/" className="flex items-center gap-1.5 cursor-pointer hover:opacity-90 transition-opacity">
              <span className="text-3xl md:text-[34px] font-black text-white tracking-tighter uppercase font-sans drop-shadow-sm">
                GOVEXAM
              </span>
              <span className="bg-[#eb1414] text-white text-[18px] md:text-[22px] font-black px-2.5 py-[3px] rounded tracking-wide uppercase mt-1 shadow-sm">
                NOTIFICATION
              </span>
            </a>
            
            {/* Download App & Mobile Menu Icons */}
            <div className="flex items-center gap-3.5">
              <button 
                onClick={onInstallClick}
                className="hidden md:flex bg-[#eb1414] hover:bg-[#c90d0d] text-white text-[12.5px] md:text-[14px] font-black px-3.5 py-2 rounded items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer uppercase transition-all"
                title="Download App / Install PWA"
              >
                <Download className="w-4 h-4 text-white stroke-[3px]" />
                <span>Download App</span>
              </button>

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
