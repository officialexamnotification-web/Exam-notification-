import React, { useState, useEffect, useMemo } from 'react';
import { Trash2, Edit, Save, X, Search, LogOut, ChevronLeft, ChevronRight, Eye, Code, Check, Share2, Plus, Lock, RefreshCw, Upload, Cpu, Zap } from 'lucide-react';
import WhatsAppBroadcastAssistant from './WhatsAppBroadcastAssistant';

interface Job {
  id: string;
  title: string;
  path: string;
  updatedAt: string;
}

export function AdminPanel() {
  const [adminKey, setAdminKey] = useState(localStorage.getItem('adminKey') || '');
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('adminKey'));
  const [loginInput, setLoginInput] = useState('');
  
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Editing state
  const [editingJob, setEditingJob] = useState<any>(null);
  const [editingJobId, setEditingJobId] = useState<string>(''); // Store original ID
  const [editContent, setEditContent] = useState('');
  const [previewMode, setPreviewMode] = useState(false);
  
  // Add new job state
  const [showAddJobForm, setShowAddJobForm] = useState(false);
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newJobPath, setNewJobPath] = useState('');
  const [newJobContent, setNewJobContent] = useState('');
  const [newJobPreviewMode, setNewJobPreviewMode] = useState(false);
  const [newJobCategory, setNewJobCategory] = useState('latest-job');
  const [broadcastJob, setBroadcastJob] = useState<{title: string, path: string} | null>(null);
  
  // APK upload state
  const [showApkUpload, setShowApkUpload] = useState(false);
  const [apkFile, setApkFile] = useState<File | null>(null);
  const [apkUploading, setApkUploading] = useState(false);
  const [apkUploadError, setApkUploadError] = useState('');
  const [apkVersionCode, setApkVersionCode] = useState('1');
  const [apkVersionName, setApkVersionName] = useState('1.0');
  const [apkReleaseNotes, setApkReleaseNotes] = useState('');
  const [apkIsMandatory, setApkIsMandatory] = useState(false);

  // Auto-scrape state
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [scrapeStatus, setScrapeStatus] = useState<{type: 'success' | 'error', message: string} | null>(null);

  useEffect(() => {
    if (isAuthenticated) fetchJobs();
  }, [isAuthenticated]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginInput.trim()) {
      localStorage.setItem('adminKey', loginInput);
      setAdminKey(loginInput);
      setIsAuthenticated(true);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminKey');
    setAdminKey('');
    setIsAuthenticated(false);
    setJobs([]);
  };

  const authFetch = async (url: string, options: any = {}) => {
    console.log('[AUTH FETCH] Request:', url, options.method || 'GET');
    console.log('[AUTH FETCH] Admin key present:', !!adminKey);
    const headers: any = {
      'x-admin-key': adminKey,
      ...(options.headers || {})
    };
    // Only set Content-Type for non-FormData requests
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(url, {
      ...options,
      headers
    });
    console.log('[AUTH FETCH] Response status:', res.status);
    if (res.status === 403) {
      handleLogout();
      throw new Error("Invalid Admin Key. Please login again.");
    }
    return res;
  };

  const fetchJobs = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await authFetch('/api/admin/jobs');
      const data = await res.json();
      if (data.success) {
        setJobs(data.jobs);
        setCurrentPage(1); // Reset to first page
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return;
    try {
      setLoading(true);
      setError('');
      const res = await authFetch(`/api/admin/job?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setJobs(jobs.filter(j => j.id !== id));
        alert(data.message || 'Job deleted successfully!');
      } else {
        alert(data.error || 'Delete failed. Please try again.');
      }
    } catch (err: any) {
      alert(err.message || 'Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };



  const startEdit = async (id: string) => {
    try {
      setLoading(true);
      // Use query param because ID contains slashes
      const res = await authFetch(`/api/admin/job?id=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (data.success) {
        setEditingJobId(id); // Store original ID
        setEditingJob(data.job);
        setEditContent(data.job.content);
        setPreviewMode(false);
      } else {
        alert(data.error);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const saveEdit = async () => {
    if (!editingJob) return;
    try {
      setLoading(true);
      setError('');
      console.log('[SAVE] Attempting to save job:', editingJobId);
      console.log('[SAVE] Using original ID from list:', editingJobId);
      // Use PUT body to send ID - use original ID from list, not from server response
      const res = await authFetch(`/api/admin/job`, {
        method: 'PUT',
        body: JSON.stringify({ id: editingJobId, content: editContent, title: editingJob.title, path: editingJob.path })
      });
      console.log('[SAVE] Response status:', res.status);
      const data = await res.json();
      console.log('[SAVE] Response data:', data);
      if (data.success) {
        alert(data.message || "Saved successfully!");
        setEditingJob(null);
        setEditingJobId('');
        fetchJobs(); // Refresh list after save
      } else {
        alert(data.error || "Save failed. Please try again.");
      }
    } catch (err: any) {
      console.error('[SAVE ERROR]', err);
      alert(err.message || "Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleApkUpload = async () => {
    if (!apkFile) {
      setApkUploadError('Please select an APK file');
      return;
    }
    
    if (!apkFile.name.endsWith('.apk')) {
      setApkUploadError('Only APK files are allowed');
      return;
    }
    
    if (apkFile.size > 50 * 1024 * 1024) {
      setApkUploadError('File size must be less than 50MB');
      return;
    }
    
    try {
      setApkUploading(true);
      setApkUploadError('');
      
      const formData = new FormData();
      formData.append('apk', apkFile);
      formData.append('versionCode', apkVersionCode);
      formData.append('versionName', apkVersionName);
      formData.append('releaseNotes', apkReleaseNotes);
      formData.append('isMandatory', apkIsMandatory.toString());
      
      const res = await fetch('/api/admin/upload-apk', {
        method: 'POST',
        headers: {
          'x-admin-key': adminKey
        },
        body: formData
      });
      
      const responseText = await res.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        console.error('APK Upload: Server returned non-JSON response:', responseText.substring(0, 200));
        setApkUploadError('Server error: APK upload is not supported on this hosting platform. Please check server logs.');
        return;
      }
      
      if (data.success) {
        alert('APK file uploaded successfully!');
        setShowApkUpload(false);
        setApkFile(null);
        setApkVersionCode('1');
        setApkVersionName('1.0');
        setApkReleaseNotes('');
        setApkIsMandatory(false);
      } else {
        setApkUploadError(data.error || 'Upload failed');
      }
    } catch (err: any) {
      setApkUploadError(err.message || 'Network error during upload. Please try again.');
    } finally {
      setApkUploading(false);
    }
  };

  const handleAutoScrape = async () => {
    if (!scrapeUrl.trim()) {
      alert('Please enter a valid URL');
      return;
    }

    try {
      setScraping(true);
      setScrapeStatus(null);
      
      const res = await authFetch('/api/admin/auto-scrape', {
        method: 'POST',
        body: JSON.stringify({ url: scrapeUrl })
      });
      
      const data = await res.json();
      if (data.success) {
        setScrapeStatus({
          type: 'success',
          message: data.message || `Job scraped and published successfully!`
        });
        setScrapeUrl('');
        fetchJobs(); // Refresh job listings table
      } else {
        setScrapeStatus({
          type: 'error',
          message: data.error || 'Failed to auto-scrape the job post.'
        });
      }
    } catch (err: any) {
      setScrapeStatus({
        type: 'error',
        message: err.message || 'Network error occurred. Please check your connection.'
      });
    } finally {
      setScraping(false);
    }
  };

  const handleAddNewJob = async () => {
    if (!newJobTitle.trim() || !newJobPath.trim() || !newJobContent.trim()) {
      alert('Please fill in all fields');
      return;
    }
    
    // Check for similar titles to prevent duplicates
    const similarJobs = jobs.filter(job => {
      const existingTitle = job.title.toLowerCase();
      const newTitle = newJobTitle.toLowerCase();
      return existingTitle.includes(newTitle.split(' ')[0]) || // Check first word match
             newTitle.includes(existingTitle.split(' ')[0]) ||
             existingTitle.includes('recruitment') && newTitle.includes('recruitment') ||
             existingTitle.includes('2026') && newTitle.includes('2026');
    });
    
    if (similarJobs.length > 0) {
      const confirmMsg = `Similar job(s) already exist:\n${similarJobs.map(j => `- ${j.title}`).join('\n')}\n\nStill add this job?`;
      if (!confirm(confirmMsg)) {
        return;
      }
    }
    
    try {
      setLoading(true);
      setError('');
      const res = await authFetch('/api/admin/job', {
        method: 'POST',
        body: JSON.stringify({ 
          title: newJobTitle, 
          path: newJobPath, 
          content: newJobContent,
          category: newJobCategory
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'New job added successfully!');
        setShowAddJobForm(false);
        setNewJobTitle('');
        setNewJobPath('');
        setNewJobContent('');
        setNewJobPreviewMode(false);
        fetchJobs(); // Refresh list
      } else {
        alert(data.error || 'Failed to add job. Please try again.');
      }
    } catch (err: any) {
      alert(err.message || 'Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  // Pagination logic
  const filteredJobs = useMemo(() => {
    return jobs.filter(j => j.title.toLowerCase().includes(search.toLowerCase()) || j.path.toLowerCase().includes(search.toLowerCase()));
  }, [jobs, search]);

  const totalPages = Math.ceil(filteredJobs.length / itemsPerPage);
  const currentJobs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredJobs.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredJobs, currentPage]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 font-sans">
        <form onSubmit={handleLogin} className="bg-white p-10 rounded-2xl shadow-2xl w-full max-w-md border border-gray-100">
          <div className="flex justify-center mb-8">
            <div className="p-4 bg-blue-50 rounded-2xl">
              <Lock className="w-10 h-10 text-blue-600" />
            </div>
          </div>
          <h2 className="text-3xl font-extrabold text-center text-gray-900 mb-2">Secure Admin</h2>
          <p className="text-center text-gray-500 mb-8">Enter your secret key to access the portal</p>
          
          <input
            type="password"
            value={loginInput}
            onChange={(e) => setLoginInput(e.target.value)}
            placeholder="Enter Admin Secret Key"
            className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl mb-6 focus:bg-white focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-gray-700"
            required
          />
          <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg shadow-blue-500/30">
            Access Dashboard
          </button>
        </form>
      </div>
    );
  }

  if (editingJob) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 font-sans">
        <div className="max-w-7xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col h-[90vh] border border-gray-200">
          <div className="bg-white border-b border-gray-200 p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex-1 max-w-xl">
              <h2 className="font-bold text-xl text-gray-900 mb-2">Editing Post</h2>
              <input
                type="text"
                value={editingJob.title}
                onChange={(e) => setEditingJob({...editingJob, title: e.target.value})}
                className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg outline-none text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-sm mb-2"
                placeholder="Job Title"
              />
              <input
                type="text"
                value={editingJob.path || ''}
                onChange={(e) => setEditingJob({...editingJob, path: e.target.value})}
                className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg outline-none text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-sm"
                placeholder="Job Path/URL"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPreviewMode(!previewMode)} className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 font-medium transition">
                {previewMode ? <Code className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {previewMode ? 'View HTML Code' : 'Live Preview'}
              </button>
              <button onClick={saveEdit} className="flex items-center gap-2 bg-green-600 text-white px-5 py-2 rounded-lg hover:bg-green-700 font-bold transition shadow-sm">
                <Check className="w-4 h-4" /> Save
              </button>
              <button onClick={() => setEditingJob(null)} className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 font-medium transition">
                <X className="w-4 h-4" /> Cancel
              </button>
            </div>
          </div>
          
          <div className="flex-1 p-0 overflow-hidden bg-gray-50">
            {previewMode ? (
              <div className="h-full w-full overflow-y-auto p-4 md:p-8 job-content-view bg-white" dangerouslySetInnerHTML={{ __html: editContent }} />
            ) : (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full h-full p-6 font-mono text-sm leading-relaxed bg-[#1e1e1e] text-[#d4d4d4] outline-none resize-none"
                spellCheck={false}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  if (showAddJobForm) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 font-sans">
        <div className="max-w-7xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col h-[90vh] border border-gray-200">
          <div className="bg-white border-b border-gray-200 p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="font-bold text-xl text-gray-900">Add New Job Post</h2>
              <p className="text-sm text-gray-500">Create a new job posting manually</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setNewJobPreviewMode(!newJobPreviewMode)} className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 font-medium transition">
                {newJobPreviewMode ? <Code className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {newJobPreviewMode ? 'View HTML Code' : 'Live Preview'}
              </button>
              <button onClick={handleAddNewJob} className="flex items-center gap-2 bg-green-600 text-white px-5 py-2 rounded-lg hover:bg-green-700 font-bold transition shadow-sm">
                <Check className="w-4 h-4" /> Add Job
              </button>
              <button onClick={() => {
                setShowAddJobForm(false);
                setNewJobTitle('');
                setNewJobPath('');
                setNewJobContent('');
                setNewJobPreviewMode(false);
              }} className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 font-medium transition">
                <X className="w-4 h-4" /> Cancel
              </button>
            </div>
          </div>
          
          <div className="p-5 border-b border-gray-100 bg-gray-50 flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Job Title</label>
              <input
                type="text"
                value={newJobTitle}
                onChange={(e) => setNewJobTitle(e.target.value)}
                placeholder="e.g., UPSC IAS 2026 Recruitment"
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl outline-none text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-semibold text-gray-700 mb-2">URL Path</label>
              <input
                type="text"
                value={newJobPath}
                onChange={(e) => setNewJobPath(e.target.value)}
                placeholder="e.g., /upsc-ias-2026"
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl outline-none text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Category</label>
              <select
                value={newJobCategory}
                onChange={(e) => setNewJobCategory(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl outline-none text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
              >
                <option value="latest-job">Latest Jobs</option>
                <option value="result">Results</option>
                <option value="admit-card">Admit Card</option>
                <option value="answer-key">Answer Key</option>
                <option value="syllabus">Syllabus</option>
                <option value="admission">Admission</option>
              </select>
            </div>
          </div>
          
          <div className="flex-1 p-0 overflow-hidden bg-gray-50">
            {newJobPreviewMode ? (
              <div className="h-full w-full overflow-y-auto p-4 md:p-8 job-content-view bg-white" dangerouslySetInnerHTML={{ __html: newJobContent }} />
            ) : (
              <textarea
                value={newJobContent}
                onChange={(e) => setNewJobContent(e.target.value)}
                placeholder="Paste or write HTML content here..."
                className="w-full h-full p-6 font-mono text-sm leading-relaxed bg-[#1e1e1e] text-[#d4d4d4] outline-none resize-none"
                spellCheck={false}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">Job Management Portal</h1>
            <p className="text-gray-500 mt-1">Manage, edit, and re-scrape job postings securely.</p>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <button onClick={() => setShowAddJobForm(true)} className="flex-1 md:flex-none flex justify-center items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl hover:bg-blue-700 shadow-sm transition-all font-medium">
              <Plus className="w-4 h-4" /> Add New Job
            </button>
            <button onClick={() => setShowApkUpload(true)} className="flex-1 md:flex-none flex justify-center items-center gap-2 bg-green-600 text-white px-5 py-2.5 rounded-xl hover:bg-green-700 shadow-sm transition-all font-medium">
              <Upload className="w-4 h-4" /> Upload APK
            </button>
            <button onClick={fetchJobs} className="flex-1 md:flex-none flex justify-center items-center gap-2 bg-white text-gray-700 px-5 py-2.5 border border-gray-300 rounded-xl hover:bg-gray-50 hover:text-gray-900 shadow-sm transition-all font-medium">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} /> Refresh
            </button>
            <button onClick={handleLogout} className="flex-1 md:flex-none flex justify-center items-center gap-2 bg-red-50 text-red-600 px-5 py-2.5 border border-red-100 rounded-xl hover:bg-red-100 font-medium transition-all">
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </div>

        {error && <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-r-xl shadow-sm">{error}</div>}

        {/* Auto-Scrape Panel */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-blue-600 animate-pulse" /> Auto-Scrape & AI Rewrite (Groq-Powered)
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Paste a job detail URL from <code className="bg-gray-100 px-1 py-0.5 rounded text-blue-600 font-medium">sarkariresult.com.cm</code> to automatically scrape, rewrite in clean English, purge unwanted channels, and publish to the correct category.
          </p>
          <div className="flex flex-col md:flex-row gap-3">
            <input 
              type="url"
              placeholder="e.g., https://sarkariresult.com.cm/mp-cpct-online-form-2026/"
              value={scrapeUrl}
              onChange={(e) => setScrapeUrl(e.target.value)}
              className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none text-gray-700 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm font-medium"
            />
            <button 
              onClick={handleAutoScrape}
              disabled={scraping || !scrapeUrl.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-xl shadow-md shadow-blue-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-sm cursor-pointer"
            >
              {scraping ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Scraping & Rewriting...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 text-yellow-300 fill-yellow-300" /> Scrape & AI Publish
                </>
              )}
            </button>
          </div>
          {scrapeStatus && (
            <div className={`mt-4 text-sm p-4 rounded-xl border ${
              scrapeStatus.type === 'success' 
                ? 'bg-green-50/50 border-green-200 text-green-800' 
                : 'bg-red-50/50 border-red-200 text-red-800'
            } flex items-center gap-2 animate-fade-in`}>
              <div className={`w-2.5 h-2.5 rounded-full ${scrapeStatus.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
              <p className="font-medium">{scrapeStatus.message}</p>
            </div>
          )}
        </div>

        {/* Search & Table Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-5 border-b border-gray-100 bg-white flex items-center">
            <div className="relative w-full max-w-md">
              <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Search jobs by title or URL path..." 
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1); // Reset page on search
                }}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none text-gray-700 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 text-gray-500 text-sm border-b border-gray-100 uppercase tracking-wider">
                  <th className="p-5 font-semibold">Title & Path</th>
                  <th className="p-5 font-semibold hidden md:table-cell">Last Updated</th>
                  <th className="p-5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {currentJobs.length === 0 ? (
                  <tr><td colSpan={3} className="text-center p-12 text-gray-500">No jobs found matching your criteria.</td></tr>
                ) : (
                  currentJobs.map((job) => (
                    <tr key={job.id} className="hover:bg-blue-50/30 transition-colors group">
                      <td className="p-5">
                        <div className="font-bold text-gray-900 text-sm md:text-base mb-1">{job.title}</div>
                        <div className="text-xs font-mono text-gray-500 bg-gray-100 inline-block px-2 py-1 rounded truncate max-w-[200px] md:max-w-md mb-1">{job.path}</div>
                        <a href={job.path} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-800 hover:underline">View Post →</a>
                      </td>
                      <td className="p-5 hidden md:table-cell text-sm text-gray-600">
                        <div className="font-medium">{new Date(job.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                        <div className="text-xs text-gray-400">{new Date(job.updatedAt).toLocaleTimeString()}</div>
                      </td>
                      <td className="p-5 text-right align-middle">
                        <div className="flex justify-end gap-2.5 opacity-100 md:opacity-40 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setBroadcastJob({title: job.title, path: job.path})} title="WhatsApp Broadcast" className="p-2.5 text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-600 hover:text-white transition-all shadow-sm">
                            <Share2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => startEdit(job.id)} title="Edit HTML Content" className="p-2.5 text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-600 hover:text-white transition-all shadow-sm">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(job.id, job.title)} title="Delete Job" className="p-2.5 text-red-600 bg-red-50 rounded-lg hover:bg-red-600 hover:text-white transition-all shadow-sm">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="p-5 border-t border-gray-100 bg-white flex flex-col sm:flex-row justify-between items-center gap-4">
              <span className="text-sm text-gray-500">
                Showing <span className="font-medium text-gray-900">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium text-gray-900">{Math.min(currentPage * itemsPerPage, filteredJobs.length)}</span> of <span className="font-medium text-gray-900">{filteredJobs.length}</span> jobs
              </span>
              <div className="flex gap-2">
                <button 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-600" />
                </button>
                <div className="flex gap-1 items-center px-2">
                  {[...Array(totalPages)].map((_, i) => {
                    const p = i + 1;
                    // Show current page, first, last, and neighbors
                    if (p === 1 || p === totalPages || (p >= currentPage - 1 && p <= currentPage + 1)) {
                      return (
                        <button 
                          key={p} 
                          onClick={() => setCurrentPage(p)}
                          className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-colors ${currentPage === p ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 text-gray-700'}`}
                        >
                          {p}
                        </button>
                      );
                    }
                    if (p === currentPage - 2 || p === currentPage + 2) {
                      return <span key={p} className="text-gray-400">...</span>;
                    }
                    return null;
                  })}
                </div>
                <button 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>
          )}
        </div>
        
        {broadcastJob && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-md animate-in zoom-in-95 duration-200">
              <WhatsAppBroadcastAssistant 
                postTitle={broadcastJob.title} 
                currentPath={broadcastJob.path} 
                onClose={() => setBroadcastJob(null)} 
              />
            </div>
          </div>
        )}
        
        {showApkUpload && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="bg-white border-b border-gray-200 p-5 flex justify-between items-center">
                <div>
                  <h2 className="font-bold text-xl text-gray-900">Upload Android APK</h2>
                  <p className="text-sm text-gray-500">Update the mobile app file</p>
                </div>
                <button 
                  onClick={() => {
                    setShowApkUpload(false);
                    setApkFile(null);
                    setApkUploadError('');
                    setApkVersionCode('1');
                    setApkVersionName('1.0');
                    setApkReleaseNotes('');
                    setApkIsMandatory(false);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              
              <div className="p-6">
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-500 transition-colors">
                    <input
                      type="file"
                      accept=".apk"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setApkFile(file);
                          setApkUploadError('');
                        }
                      }}
                      className="hidden"
                      id="apk-upload"
                    />
                    <label 
                      htmlFor="apk-upload"
                      className="cursor-pointer flex flex-col items-center gap-3"
                    >
                      <Upload className="w-12 h-12 text-gray-400" />
                      <div className="text-gray-600">
                        <p className="font-medium">Click to upload APK file</p>
                        <p className="text-sm text-gray-400 mt-1">Maximum size: 50MB</p>
                      </div>
                    </label>
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Version Code</label>
                      <input
                        type="number"
                        value={apkVersionCode}
                        onChange={(e) => setApkVersionCode(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., 2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Version Name</label>
                      <input
                        type="text"
                        value={apkVersionName}
                        onChange={(e) => setApkVersionName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., 1.1"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Release Notes</label>
                      <textarea
                        value={apkReleaseNotes}
                        onChange={(e) => setApkReleaseNotes(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., Bug fixes and performance improvements."
                        rows={3}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isMandatory"
                        checked={apkIsMandatory}
                        onChange={(e) => setApkIsMandatory(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="isMandatory" className="text-sm text-gray-700">Mandatory Update</label>
                    </div>
                  </div>
                </div>
                
                {apkFile && (
                  <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Upload className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-green-800">{apkFile.name}</span>
                      <span className="text-xs text-green-600">({(apkFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                    </div>
                    <button 
                      onClick={() => setApkFile(null)}
                      className="text-green-600 hover:text-green-800"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                
                {apkUploadError && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    {apkUploadError}
                  </div>
                )}
              </div>
              
              <div className="p-5 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                <button 
                  onClick={() => {
                    setShowApkUpload(false);
                    setApkFile(null);
                    setApkUploadError('');
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleApkUpload}
                  disabled={!apkFile || apkUploading}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {apkUploading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Upload APK
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
