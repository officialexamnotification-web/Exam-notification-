import React, { useState } from 'react';
import { Search } from 'lucide-react';

export default function PostScraperViewer({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState('https://www.sarkariresult.com/');
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleScrape = async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    setContent(null);

    try {
      const response = await fetch(`/api/scrape/post?url=${encodeURIComponent(url)}`);
      const data = await response.json();

      if (data.success) {
        setContent(data.content);
      } else {
        setError(data.error || 'Failed to fetch content');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4">
      <div className="bg-white w-full max-w-5xl h-[90vh] rounded shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header toolbar */}
        <div className="bg-[#b40000] text-white p-4 flex items-center justify-between gap-4">
          <div className="flex-1 flex gap-2">
            <input 
              type="text" 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1 px-3 py-2 text-black rounded"
              placeholder="Paste a SarkariResult post URL here..."
            />
            <button 
              onClick={handleScrape}
              disabled={loading}
              className="bg-yellow-400 hover:bg-yellow-500 text-black px-6 py-2 rounded font-bold flex items-center gap-2 disabled:opacity-70"
            >
              {loading ? 'Scraping...' : <><Search size={18} /> Extract Data</>}
            </button>
          </div>
          <button onClick={onClose} className="font-bold border border-white px-3 py-1 hover:bg-white hover:text-[#b40000] rounded">
            Close
          </button>
        </div>

        {/* Content Viewer */}
        <div className="flex-1 overflow-auto p-6 bg-gray-50 flex flex-col items-center">
          {loading && (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-xl font-bold animate-pulse text-[#b40000]">Extracting post content flawlessly via Cheerio...</div>
            </div>
          )}
          
          {error && (
            <div className="bg-red-100 text-red-700 p-4 rounded w-full border border-red-300">
              <h3 className="font-bold">Error</h3>
              <p>{error}</p>
            </div>
          )}

          {content && !loading && (
            <div 
              className="w-full scraper-content-view bg-white p-4 border border-gray-300 shadow-sm"
              dangerouslySetInnerHTML={{ __html: content }}
            />
          )}

          {!content && !loading && !error && (
            <div className="text-center text-gray-400 mt-20">
              <p className="text-xl">Welcome to the Live Data Extractor!</p>
              <p className="text-sm mt-2">Enter a URL above and hit "Extract Data" to see how the Node.js backend safely scrapes HTML without losing table structure.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
