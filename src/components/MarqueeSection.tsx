import React, { useState } from 'react';
import { Bell } from 'lucide-react';

export default function MarqueeSection({ trendingLinks }: { trendingLinks: any[] }) {
  const [rotate, setRotate] = useState(0);

  if (!trendingLinks || trendingLinks.length === 0) return null;

  return (
    <div className="bg-white py-1.5 px-4 mb-4 border-b border-gray-100 flex items-center shadow-sm">
      <div className="max-w-7xl mx-auto w-full flex items-center text-[15px] relative">
        
        {/* JOB ALERT Label */}
        <div 
           className="bg-red-600 text-white font-bold tracking-widest px-3 py-1 flex items-center gap-1.5 z-10 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.1)] cursor-pointer"
           onClick={() => setRotate(r => r + 360)}
           style={{ perspective: '1000px' }}
        >
           <div 
             className="flex items-center gap-1.5"
             style={{
               transform: `rotateY(${rotate}deg)`,
               transformStyle: 'preserve-3d',
               transition: 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)'
             }}
           >
             <Bell className="w-4 h-4 text-white hover:animate-ping" style={{ animation: 'ring 2s infinite' }} />
             <span className="text-[14px] mt-0.5" style={{ transform: 'translateZ(10px)' }}>JOB ALERT</span>
           </div>
        </div>
        
        {/* Ticker Content */}
        <div className="overflow-hidden flex-1 relative flex items-center bg-gray-50 h-full border border-gray-100 border-l-0">
          <style>{`
            @keyframes ring {
              0% { transform: rotate(0); }
              5% { transform: rotate(15deg); }
              10% { transform: rotate(-10deg); }
              15% { transform: rotate(20deg); }
              20% { transform: rotate(-15deg); }
              25% { transform: rotate(10deg); }
              30% { transform: rotate(-5deg); }
              35% { transform: rotate(0); }
              100% { transform: rotate(0); }
            }
          `}</style>
          <marquee className="text-[14.5px] font-semibold text-gray-800 py-1" scrollamount="6" onMouseOver={(e: any) => e.currentTarget.stop()} onMouseOut={(e: any) => e.currentTarget.start()}>
            {trendingLinks.map((link, index) => (
              <span key={link.id || link.url || link.path || index} className="inline-flex items-center px-4">
                {link.isOut ? (
                  <span className="animate-pulse shrink-0 text-[9px] bg-red-600 text-white px-1.5 py-[1px] rounded uppercase font-black tracking-widest mr-2 leading-none shadow-sm">OUT</span>
                ) : link.isNew ? (
                  <span className="animate-pulse shrink-0 text-[9px] bg-red-600 text-white px-1.5 py-[1px] rounded uppercase font-black tracking-widest mr-2 leading-none shadow-sm">NEW</span>
                ) : null}
                <a href={link.url} className="hover:text-[#104ba6] active:scale-[0.96] active:text-blue-800 transition-all duration-75 inline-block">
                  {link.title}
                </a>
              </span>
            ))}
          </marquee>
        </div>

      </div>
    </div>
  );
}
