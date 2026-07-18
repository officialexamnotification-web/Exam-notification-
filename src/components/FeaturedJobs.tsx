import React from 'react';
import { LinkItem } from '../types';

interface FeaturedJobsProps {
  featuredJobs: LinkItem[];
}

export default function FeaturedJobs({ featuredJobs }: FeaturedJobsProps) {
  if (!featuredJobs || featuredJobs.length === 0) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl shadow-sm p-5 mb-6">
      <h2 className="text-xl font-bold text-[#104ba6] mb-4 flex items-center gap-2">
        <span className="text-2xl">🔥</span>
        Featured Jobs
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {featuredJobs.map((job, index) => (
          <a
            key={`${job.id || job.url || index}-${index}`}
            href={job.url}
            className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md hover:border-blue-300 transition-all group"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <h3 className="text-[14px] font-semibold text-gray-800 group-hover:text-[#104ba6] transition-colors leading-snug">
                  {job.title}
                </h3>
                {job.postCount && (
                  <span className="inline-block mt-1.5 text-[11px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                    {job.postCount}
                  </span>
                )}
              </div>
              {job.isNew && (
                <span className="inline-flex items-center justify-center bg-red-600 text-white text-[9px] uppercase font-black px-1.5 py-[0.5px] rounded-[3px] animate-pulse whitespace-nowrap">
                  NEW
                </span>
              )}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
