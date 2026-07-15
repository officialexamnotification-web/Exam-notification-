import React from 'react';
import { Category } from '../types';
import { ChevronRight } from 'lucide-react';

interface CategoryBlockProps {
  category: Category;
  key?: React.Key;
  isFullHeight?: boolean;
}

export default function CategoryBlock({ category, isFullHeight }: CategoryBlockProps) {
  const handleViewAllClick = () => {
    // Generate proper category URL based on category title (matching sitemap URLs)
    let categoryPath = '';
    const titleLower = category.title.toLowerCase();
    if (titleLower.includes('latest job')) categoryPath = '/latest-jobs';
    else if (titleLower.includes('result')) categoryPath = '/results';
    else if (titleLower.includes('admit card')) categoryPath = '/admit-cards';
    else if (titleLower.includes('answer key')) categoryPath = '/answer-keys';
    else if (titleLower.includes('syllabus')) categoryPath = '/syllabus';
    else if (titleLower.includes('admission')) categoryPath = '/admission';
    else if (titleLower.includes('calendar')) categoryPath = '/calendar';
    else if (titleLower.includes('document')) categoryPath = '/documents';
    else categoryPath = category.viewAllUrl || '#';
    
    // Navigate using the same format as NavBar
    if (categoryPath && categoryPath !== '#') {
      window.location.href = '/?path=' + encodeURIComponent(categoryPath);
    }
  };

  return (
    <div className={`bg-white border text-gray-800 border-gray-200 rounded shadow-sm flex flex-col ${isFullHeight ? 'h-auto' : 'h-[400px] overflow-hidden'}`}>
      <div className="bg-[#104ba6] px-4 py-3 flex items-center shadow-sm">
        <h3 className="font-extrabold text-white text-[17px] tracking-wide flex items-center uppercase drop-shadow-sm text-center w-full justify-center">
          {category.title}
        </h3>
      </div>
      <ul className={`divide-none px-1 py-1 ${isFullHeight ? 'flex-1' : 'flex-1 overflow-y-auto'}`}>
        {category.links.length === 0 && (
          <li className="px-5 py-8 text-center text-gray-500 italic">No updates available currently.</li>
        )}
        {category.links.map((link, index) => (
          <li key={`${link.id || link.url || link.path || index}-${index}`} className="group relative border-b border-dashed border-gray-200 last:border-0 border-opacity-70">
            <a href={link.url} className="flex px-2 py-2.5 hover:bg-blue-50 active:bg-blue-100 active:scale-[0.98] transition-all duration-75 items-start gap-1">
              <span className="text-[#104ba6] text-[12px] flex-shrink-0 mt-0.5 px-0.5"><ChevronRight size={14} strokeWidth={3} /></span>
              <div className="flex-1">
                <span className="text-[#104ba6] group-hover:text-blue-800 font-semibold text-[14.5px] leading-snug inline">
                  {link.title}
                  {link.isOut ? (
                    <span className="inline-flex ml-1.5 items-center justify-center bg-red-600 text-white text-[9.5px] uppercase font-black px-1.5 py-[0.5px] rounded-[3px] animate-pulse whitespace-nowrap align-baseline translate-y-[-1px]">
                      OUT
                    </span>
                  ) : link.isNew ? (
                    <span className="inline-flex ml-1.5 items-center justify-center bg-red-600 text-white text-[9.5px] uppercase font-black px-1.5 py-[0.5px] rounded-[3px] animate-pulse whitespace-nowrap align-baseline translate-y-[-1px]">
                      NEW
                    </span>
                  ) : null}
                </span>
              </div>
            </a>
          </li>
        ))}
      </ul>
      {!isFullHeight && (
        <div className="mt-auto border-t border-gray-100 bg-white p-3">
          <button 
            onClick={handleViewAllClick}
            className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded text-white bg-[#104ba6] hover:bg-[#0b3b85] font-semibold text-[14.5px] transition-all group shadow-sm"
          >
            View All {category.title} <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      )}
    </div>
  );
}
