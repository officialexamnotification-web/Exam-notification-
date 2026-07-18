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
    { label: 'About Us', href: '/about-us' },
    { label: 'Contact Us', href: '/contact-us' },
    { label: 'Disclaimer', href: '/disclaimer' },
    { label: 'Privacy Policy', href: '/privacy-policy' }
  ];

  return (
    <nav className={`${isMobileMenuOpen ? 'block' : 'hidden'} md:block bg-[#104ba6] z-40 relative shadow-sm border-t border-[#0b3b85]`}>
      <div className="max-w-7xl mx-auto md:px-3 lg:px-6 xl:px-8 w-full">
        <ul className="flex flex-col md:flex-row items-stretch md:items-center justify-start overflow-x-auto no-scrollbar">
          {navItems.map((item) => {
             const isActive = activeTab === item.label;
             const unifiedClass = `flex items-center justify-center md:justify-start w-full md:w-auto h-12 px-6 md:px-2 lg:px-3.5 xl:px-5 transition-all text-[14px] md:text-[12px] lg:text-[13.5px] xl:text-[14.5px] font-bold text-white uppercase tracking-wider outline-none select-none cursor-pointer border-none whitespace-nowrap ${
               isActive ? 'bg-[#0b3b85]' : 'hover:bg-[#0b3b85]'
             }`;
             
             return (
              <li key={item.label} className="relative group flex-shrink-0 border-b border-[#0b3b85] md:border-none last:border-none">
                {item.onClick ? (
                  <button onClick={() => { item.onClick!(); setIsMobileMenuOpen(false); }} className={unifiedClass}>
                    {item.label}
                  </button>
                ) : item.isTab ? (
                  <button 
                     onClick={() => { onNavClick?.(item.label); setIsMobileMenuOpen(false); }} 
                     className={unifiedClass}
                  >
                    {item.label}
                  </button>
                ) : (
                  <a href={item.href} onClick={() => setIsMobileMenuOpen(false)} className={unifiedClass}>
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
