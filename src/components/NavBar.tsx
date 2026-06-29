import React from 'react';

interface NavBarProps {
  activeTab?: string;
  onNavClick?: (label: string) => void;
  onOpenDisclaimer?: () => void;
  onOpenPrivacy?: () => void;
  onDownloadApp?: () => void;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (val: boolean) => void;
}

export default function NavBar({ activeTab, onNavClick, onOpenDisclaimer, onOpenPrivacy, onDownloadApp, isMobileMenuOpen, setIsMobileMenuOpen }: NavBarProps) {
  const navItems = [
    { label: 'Home', isTab: true },
    { label: 'Latest Jobs', isTab: true },
    { label: 'Results', isTab: true },
    { label: 'Admit Card', isTab: true },
    { label: 'Download App', onClick: onDownloadApp },
    { label: 'Disclaimer', onClick: onOpenDisclaimer },
    { label: 'Privacy Policy', onClick: onOpenPrivacy },
    { label: 'Contact Us', href: 'mailto:official.examnotification@gmail.com' }
  ];

  return (
    <nav className={`${isMobileMenuOpen ? 'block' : 'hidden'} md:block bg-[#104ba6] z-40 relative shadow-sm border-t border-[#0b3b85]`}>
      <div className="max-w-7xl mx-auto md:px-6 lg:px-8 w-full">
        <ul className="flex flex-col md:flex-row md:flex-wrap items-stretch md:items-center justify-start md:justify-start text-[14px] md:text-[15px] font-bold text-white uppercase tracking-wider">
          {navItems.map((item) => {
             const isActive = activeTab === item.label;
             return (
              <li key={item.label} className="relative group flex-shrink-0 border-b border-[#0b3b85] md:border-none last:border-none">
                {item.onClick ? (
                  <button onClick={() => { item.onClick!(); setIsMobileMenuOpen(false); }} className={`flex items-center w-full md:w-auto h-12 px-6 md:px-5 transition-colors ${isActive ? 'bg-[#0b3b85]' : 'hover:bg-[#0b3b85]'}`}>
                    {item.label}
                  </button>
                ) : item.isTab ? (
                  <button 
                     onClick={() => { onNavClick?.(item.label); setIsMobileMenuOpen(false); }} 
                     className={`flex items-center w-full md:w-auto h-12 px-6 md:px-5 transition-colors ${isActive ? 'bg-[#0b3b85]' : 'hover:bg-[#0b3b85]'}`}
                  >
                    {item.label}
                  </button>
                ) : (
                  <a href={item.href} onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center w-full md:w-auto h-12 px-6 md:px-5 transition-colors hover:bg-[#0b3b85]`}>
                    {item.label}
                  </a>
                )}
              </li>
             )
          })}
        </ul>
      </div>
    </nav>
  );
}
