import React, { useState, useEffect } from "react";
import "./App.css";
import axios from "axios";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { Badge } from "./components/ui/badge";
import { Progress } from "./components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Upload, FileText, Brain, TrendingUp, Search, Zap, Target, UserPlus, LogIn, LogOut, User } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "./components/ui/sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
// Determine API base: prefer explicit env; otherwise try to infer a sensible default for deployed apps
const API = (() => {
  if (BACKEND_URL) return `${BACKEND_URL.replace(/\/$/, "")}/api`;
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    // If app is hosted (fly.dev, render.com, localhost) assume backend lives at same origin under /api
    if (origin.includes('fly.dev') || origin.includes('render.com') || origin.includes('localhost')) {
      return `${origin}/api`;
    }
  }
  // Fallback to relative API root (works with CRA proxy or when backend served from same host)
  return "/api";
})();
console.info('API base set to:', API);
// Configure axios defaults to use the API root and a reasonable timeout
axios.defaults.baseURL = API;
axios.defaults.timeout = 10000;
// Do not send cookies by default; avoid CORS credential issues unless explicitly needed
axios.defaults.withCredentials = false;

// Log and surface axios errors for easier debugging in deployed environments
axios.interceptors.response.use(
  (res) => res,
  (err) => {
    console.error('Axios error:', {
      message: err?.message,
      config: err?.config && { url: err.config.url, method: err.config.method, baseURL: err.config.baseURL },
      responseStatus: err?.response?.status,
      responseData: err?.response?.data
    });
    return Promise.reject(err);
  }
);

// Helper to consistently format axios errors for logging and UI
function formatAxiosError(err) {
  try {
    return {
      message: err?.message || String(err),
      isAxiosError: !!err?.isAxiosError,
      status: err?.response?.status,
      data: err?.response?.data,
      config: err?.config && { url: err.config.url, method: err.config.method, baseURL: err.config.baseURL }
    };
  } catch (e) {
    return { message: String(err) };
  }
}

// Catch unhandled promise rejections to aid debugging in production
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', formatAxiosError(event.reason));
  });
}

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [question, setQuestion] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [reports, setReports] = useState([]);
  const [userStats, setUserStats] = useState(null);
  const [latestNews, setLatestNews] = useState([]);
  const [activeTab, setActiveTab] = useState("research");
  const [isInitializing, setIsInitializing] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState("login"); // "login" or "signup"
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: ""
  });

  // Initialize user on component mount
  useEffect(() => {
    const initialize = async () => {
      await Promise.all([
        checkAuthStatus(),
        fetchLatestNews()
      ]);
      setIsInitializing(false);
    };
    initialize();
  }, []);

  // Fetch user stats when user is set
  useEffect(() => {
    if (currentUser) {
      fetchUserStats();
      fetchUserReports();
    }
  }, [currentUser]);

  const checkAuthStatus = async () => {
    const isNetworkError = (err) => err && err.isAxiosError && !err.response;

    try {
      const savedUser = localStorage.getItem('researchAssistantUser');

      if (savedUser) {
        const user = JSON.parse(savedUser);
        // Verify user still exists in backend
        try {
          const response = await axios.get(`users/${user.id}`);
          setCurrentUser(response.data);
          console.log("User authenticated successfully");
          return;
        } catch (error) {
          // If network error, fall back to local user
          if (isNetworkError(error)) {
            console.warn("Backend unreachable, using local cached user");
            setCurrentUser(user);
            return;
          }
          // User doesn't exist in backend anymore
          localStorage.removeItem('researchAssistantUser');
        }
      }

      // Create new user only if no valid user exists
      const userData = {
        name: "Research User",
        email: `user_${Date.now()}@example.com`
      };

      try {
        const response = await axios.post(`users`, userData);
        setCurrentUser(response.data);
        localStorage.setItem('researchAssistantUser', JSON.stringify(response.data));
        toast.success("Welcome to Smart Research Assistant!");
        return;
      } catch (error) {
        // Network fallback: create a local ephemeral user so app remains usable offline
        if (isNetworkError(error)) {
          const localUser = {
            id: `local-${Date.now()}`,
            name: userData.name,
            email: userData.email,
            credits: 100,
            created_at: new Date().toISOString()
          };
          console.warn('Backend unreachable, created local fallback user', localUser);
          setCurrentUser(localUser);
          localStorage.setItem('researchAssistantUser', JSON.stringify(localUser));
          toast.success("Running in offline mode: local user created");
          return;
        }
        // If non-network error, show auth modal
        setShowAuth(true);
      }
    } catch (error) {
      console.error("Auth check failed:", formatAxiosError(error));
      setShowAuth(true);
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    
    if (authMode === "signup") {
      if (!authForm.name || !authForm.email || !authForm.password) {
        toast.error("Please fill in all fields");
        return;
      }
    } else {
      if (!authForm.email || !authForm.password) {
        toast.error("Please enter email and password");
        return;
      }
    }

    try {
      let response;
      
      if (authMode === "signup") {
        // Create new user
        response = await axios.post(`auth/signup`, {
          name: authForm.name,
          email: authForm.email,
          password: authForm.password
        });
        toast.success("Account created successfully!");
      } else {
        // Login user
        response = await axios.post(`auth/login`, {
          email: authForm.email,
          password: authForm.password
        });
        toast.success("Welcome back!");
      }

      setCurrentUser(response.data.user);
      localStorage.setItem('researchAssistantUser', JSON.stringify(response.data.user));
      setShowAuth(false);
      setAuthForm({ name: "", email: "", password: "" });
      
    } catch (error) {
      console.error("Auth failed:", formatAxiosError(error));
      const isNetworkError = (err) => err && err.isAxiosError && !err.response;
      if (isNetworkError(error)) {
        toast.error(`Network error: could not reach backend at ${API}. Check REACT_APP_BACKEND_URL, CORS_ORIGINS, and that the backend is running.`);
      } else if (error.response?.data?.detail) {
        toast.error(error.response.data.detail);
      } else {
        toast.error(authMode === "signup" ? "Signup failed" : "Login failed");
      }
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setUserStats(null);
    setReports([]);
    setUploadedFiles([]);
    localStorage.removeItem('researchAssistantUser');
    setShowAuth(true);
    toast.success("Logged out successfully");
  };

  const fetchUserStats = async () => {
    const isNetworkError = (err) => err && err.isAxiosError && !err.response;

    try {
      // If user is a local fallback, avoid calling backend
      if (currentUser && String(currentUser.id).startsWith('local-')) {
        setUserStats({
          credits_remaining: currentUser.credits ?? 100,
          total_questions_asked: 0,
          reports_generated: 0,
          credits_used: 0
        });
        return;
      }

      const response = await axios.get(`stats/${currentUser.id}`);
      setUserStats(response.data);
    } catch (error) {
      const isNet = isNetworkError(error);
      if (isNet) {
        // Fallback to safe defaults (suppress console error noise)
        setUserStats({
          credits_remaining: currentUser?.credits ?? 100,
          total_questions_asked: 0,
          reports_generated: 0,
          credits_used: 0
        });
      } else {
        console.error("Failed to fetch user stats:", formatAxiosError(error));
      }
    }
  };

  const fetchUserReports = async () => {
    const isNetworkError = (err) => err && err.isAxiosError && !err.response;

    try {
      // If user is local fallback, nothing to fetch
      if (currentUser && String(currentUser.id).startsWith('local-')) {
        setReports([]);
        return;
      }

      const response = await axios.get(`reports/${currentUser.id}`);
      setReports(response.data);
    } catch (error) {
      const isNet = isNetworkError(error);
      if (isNet) {
        // Suppress console error noise in offline mode
        setReports([]);
      } else {
        console.error("Failed to fetch reports:", formatAxiosError(error));
      }
    }
  };

  const fetchLatestNews = async () => {
    const isNetworkError = (err) => err && err.isAxiosError && !err.response;

    try {
      const response = await axios.get(`news`);
      setLatestNews(response.data);
    } catch (error) {
      if (isNetworkError(error)) {
        // Fallback to built-in mock news so the UI still has content when backend is unreachable
        const fallbackNews = [
          {
            id: 'local-1',
            title: 'Local News: Running in Offline Mode',
            content: 'The application is currently running without a backend connection. Some features may be limited.',
            source: 'Local',
            published_at: new Date().toISOString()
          },
          {
            id: 'local-2',
            title: 'Tip: Connect a Backend',
            content: 'To enable live data and file uploads, start the backend API or set REACT_APP_BACKEND_URL to a reachable endpoint.',
            source: 'Local',
            published_at: new Date().toISOString()
          }
        ];
        setLatestNews(fallbackNews);
      }
    }
  };

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    
    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await axios.post(`upload`, formData);
        
        setUploadedFiles(prev => [...prev, {
          id: response.data.file_id,
          name: response.data.filename,
          size: file.size
        }]);
        
        toast.success(`File "${file.name}" uploaded successfully!`);
      } catch (error) {
        const isNetworkError = (err) => err && err.isAxiosError && !err.response;
        if (isNetworkError(error)) {
          const localId = `local-file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          setUploadedFiles(prev => [...prev, {
            id: localId,
            name: file.name,
            size: file.size
          }]);
          toast.success(`Added \"${file.name}\" (local only)`);
        } else {
          console.error("File upload failed:", formatAxiosError(error));
          toast.error(`Failed to upload \"${file.name}\"`);
        }
      }
    }
  };

  const removeFile = (fileId) => {
    setUploadedFiles(prev => prev.filter(file => file.id !== fileId));
  };

  const submitResearchQuestion = async () => {
    if (!question.trim()) {
      toast.error("Please enter a research question");
      return;
    }

    if (!currentUser) {
      toast.error("Please log in to submit questions");
      return;
    }

    if (userStats && userStats.credits_remaining < 1) {
      toast.error("Insufficient credits. You need 1 credit to ask a question.");
      return;
    }

    setIsProcessing(true);

    try {
      const formData = new FormData();
      formData.append('user_id', currentUser.id);
      formData.append('question', question);
      formData.append('file_ids', JSON.stringify(uploadedFiles.map(f => f.id)));

      const response = await axios.post(`research`, formData);

      const questionId = response.data.question_id;
      toast.success("Research question submitted! Processing...");

      // Poll for results
      pollForResults(questionId);
      
      // Reset form
      setQuestion("");
      setUploadedFiles([]);

    } catch (error) {
      const isNetworkError = (err) => err && err.isAxiosError && !err.response;
      console.error("Research submission failed:", error);

      // Offline/local fallback flow
      if (isNetworkError(error) || String(currentUser.id).startsWith('local-')) {
        const now = new Date().toISOString();
        const qId = `local-q-${Date.now()}`;
        const rId = `local-r-${Date.now()}`;
        const sources = uploadedFiles.map(f => f.name);
        const reportText = `Key Findings\n- Offline mode: generated a local report.\n- Your question: ${question}\n\nSupporting Evidence\n- Files provided: ${sources.length ? sources.join(', ') : 'none'}\n\nActionable Recommendations\n- Connect the backend to generate AI-powered reports.\n\nSources Referenced\n- ${sources.length ? sources.join('\n- ') : 'No files uploaded'}`;

        const localReportItem = {
          report: {
            id: rId,
            question_id: qId,
            user_id: currentUser.id,
            report: reportText,
            citations: sources.map(s => `Source: ${s}`),
            sources_used: sources,
            live_data_included: false,
            created_at: now
          },
          question: {
            id: qId,
            user_id: currentUser.id,
            question: question,
            files: uploadedFiles.map(f => f.id),
            status: 'completed',
            created_at: now
          }
        };

        setReports(prev => [localReportItem, ...prev]);
        setIsProcessing(false);
        setActiveTab('reports');
        setQuestion("");
        setUploadedFiles([]);

        setUserStats(prev => {
          const credits = (prev?.credits_remaining ?? currentUser.credits ?? 100) - 1;
          return {
            credits_remaining: Math.max(0, credits),
            total_questions_asked: (prev?.total_questions_asked ?? 0) + 1,
            reports_generated: (prev?.reports_generated ?? 0) + 1,
            credits_used: (prev?.credits_used ?? 0) + 1
          };
        });

        toast.success("Local report generated (offline mode)");
        return;
      }

      toast.error("Failed to submit research question");
      setIsProcessing(false);
    }
  };

  const pollForResults = async (questionId) => {
    const maxAttempts = 30; // 30 seconds
    let attempts = 0;

    const poll = async () => {
      try {
        const response = await axios.get(`research/${questionId}`);
        
        if (response.data.status === "completed") {
          setIsProcessing(false);
          toast.success("Research report generated!");
          fetchUserStats();
          fetchUserReports();
          setActiveTab("reports");
        } else if (response.data.status === "failed") {
          setIsProcessing(false);
          toast.error("Research processing failed");
        } else if (attempts < maxAttempts) {
          attempts++;
          setTimeout(poll, 1000);
        } else {
          setIsProcessing(false);
          toast.error("Research processing timed out");
        }
      } catch (error) {
        // If network error, retry until timeout
        const isNetworkError = (err) => err && err.isAxiosError && !err.response;
        if (isNetworkError(error) && attempts < maxAttempts) {
          attempts++;
          setTimeout(poll, 1000);
        } else {
          setIsProcessing(false);
          toast.error("Error checking research status");
        }
      }
    };

    poll();
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Auth Screen
  if (isInitializing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-teal-50">
        <header className="bg-white/80 backdrop-blur-md border-b border-emerald-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
                  <Brain className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                    Smart Research Assistant
                  </h1>
                  <p className="text-sm text-gray-600">AI-powered research with live data</p>
                </div>
              </div>
            </div>
          </div>
        </header>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
            <p className="text-lg text-gray-600">Loading Smart Research Assistant...</p>
            <p className="text-sm text-gray-500 mt-2">Setting up your research workspace</p>
          </div>
        </div>
      </div>
    );
  }

  if (showAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-teal-50">
        <Toaster position="top-right" />
        
        <header className="bg-white/80 backdrop-blur-md border-b border-emerald-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
                  <Brain className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                    Smart Research Assistant
                  </h1>
                  <p className="text-sm text-gray-600">AI-powered research with live data</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="flex items-center justify-center min-h-[80vh] px-4">
          <Card className="w-full max-w-md bg-white/80 backdrop-blur-sm border-emerald-100">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl flex items-center justify-center space-x-2">
                {authMode === "signup" ? <UserPlus className="w-6 h-6 text-emerald-600" /> : <LogIn className="w-6 h-6 text-emerald-600" />}
                <span>{authMode === "signup" ? "Create Account" : "Welcome Back"}</span>
              </CardTitle>
              <CardDescription>
                {authMode === "signup" 
                  ? "Start your research journey with 100 free credits" 
                  : "Sign in to access your research reports and credits"
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAuthSubmit} className="space-y-4">
                {authMode === "signup" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                    <Input
                      type="text"
                      placeholder="Enter your full name"
                      value={authForm.name}
                      onChange={(e) => setAuthForm({...authForm, name: e.target.value})}
                      className="bg-white/70"
                    />
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={authForm.email}
                    onChange={(e) => setAuthForm({...authForm, email: e.target.value})}
                    className="bg-white/70"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <Input
                    type="password"
                    placeholder="Enter your password"
                    value={authForm.password}
                    onChange={(e) => setAuthForm({...authForm, password: e.target.value})}
                    className="bg-white/70"
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
                >
                  {authMode === "signup" ? (
                    <>
                      <UserPlus className="w-4 h-4 mr-2" />
                      Create Account & Get 100 Credits
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4 mr-2" />
                      Sign In
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-sm text-gray-600">
                  {authMode === "signup" ? "Already have an account?" : "Don't have an account?"}
                </p>
                <Button
                  variant="link"
                  onClick={() => {
                    setAuthMode(authMode === "signup" ? "login" : "signup");
                    setAuthForm({ name: "", email: "", password: "" });
                  }}
                  className="text-emerald-600 hover:text-emerald-700"
                >
                  {authMode === "signup" ? "Sign In" : "Create Account"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-teal-50">
      <Toaster position="top-right" />
      
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-emerald-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                  Smart Research Assistant
                </h1>
                <p className="text-sm text-gray-600">AI-powered research with live data</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {userStats ? (
                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Credits</p>
                    <p className="text-lg font-semibold text-emerald-600">{userStats.credits_remaining}</p>
                  </div>
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700">
                    {userStats.reports_generated} Reports
                  </Badge>
                </div>
              ) : (
                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Credits</p>
                    <p className="text-lg font-semibold text-emerald-600">100</p>
                  </div>
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700">
                    0 Reports
                  </Badge>
                </div>
              )}
              
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <User className="w-4 h-4" />
                  <span>{currentUser?.name}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  className="text-gray-600 hover:text-red-600 hover:border-red-200"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 bg-white/50 backdrop-blur-sm">
            <TabsTrigger value="research" className="flex items-center space-x-2">
              <Search className="w-4 h-4" />
              <span>Research</span>
            </TabsTrigger>
            <TabsTrigger value="reports" className="flex items-center space-x-2">
              <FileText className="w-4 h-4" />
              <span>Reports</span>
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4" />
              <span>Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="news" className="flex items-center space-x-2">
              <Zap className="w-4 h-4" />
              <span>Live Data</span>
            </TabsTrigger>
          </TabsList>

          {/* Research Tab */}
          <TabsContent value="research" className="space-y-6">
            <Card className="bg-white/70 backdrop-blur-sm border-emerald-100">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Target className="w-5 h-5 text-emerald-600" />
                  <span>Ask a Research Question</span>
                </CardTitle>
                <CardDescription>
                  Upload files and ask questions to generate evidence-based research reports
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* File Upload */}
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Upload Research Files (Optional)
                  </label>
                  <div className="flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-emerald-300 border-dashed rounded-lg cursor-pointer bg-emerald-50 hover:bg-emerald-100 transition-colors">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-8 h-8 mb-2 text-emerald-600" />
                        <p className="mb-2 text-sm text-emerald-700">
                          <span className="font-semibold">Click to upload</span> or drag and drop
                        </p>
                        <p className="text-xs text-emerald-600">PDFs, DOCX, Images, Videos, etc.</p>
                      </div>
                      <input
                        type="file"
                        className="hidden"
                        multiple
                        onChange={handleFileUpload}
                        accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,.mp4,.mov,.avi"
                      />
                    </label>
                  </div>
                </div>

                {/* Uploaded Files */}
                {uploadedFiles.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700">Uploaded Files:</p>
                    <div className="space-y-2">
                      {uploadedFiles.map((file) => (
                        <div key={file.id} className="flex items-center justify-between p-2 bg-emerald-50 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <FileText className="w-4 h-4 text-emerald-600" />
                            <span className="text-sm text-gray-700">{file.name}</span>
                            <span className="text-xs text-gray-500">({formatFileSize(file.size)})</span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeFile(file.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Question Input */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Research Question
                  </label>
                  <Textarea
                    placeholder="e.g., What are the latest trends in AI-powered education technology and their impact on student learning outcomes?"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    rows={4}
                    className="bg-white/70"
                  />
                </div>

                <Button
                  onClick={submitResearchQuestion}
                  disabled={isProcessing || !question.trim()}
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
                >
                  {isProcessing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Processing Research...
                    </>
                  ) : (
                    <>
                      <Brain className="w-4 h-4 mr-2" />
                      Generate Research Report (1 Credit)
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports" className="space-y-6">
            <div className="space-y-4">
              {reports.length === 0 ? (
                <Card className="bg-white/70 backdrop-blur-sm border-emerald-100">
                  <CardContent className="text-center py-12">
                    <FileText className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
                    <p className="text-gray-600">No reports generated yet. Ask your first research question!</p>
                  </CardContent>
                </Card>
              ) : (
                reports.map((item) => (
                  <Card key={item.report.id} className="bg-white/70 backdrop-blur-sm border-emerald-100">
                    <CardHeader>
                      <CardTitle className="text-emerald-800">{item.question.question}</CardTitle>
                      <CardDescription>
                        Generated on {new Date(item.report.created_at).toLocaleDateString()}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="prose prose-emerald max-w-none">
                        <div className="whitespace-pre-wrap text-gray-700">{item.report.report}</div>
                      </div>
                      
                      {item.report.sources_used.length > 0 && (
                        <div className="border-t pt-4">
                          <h4 className="font-semibold text-gray-800 mb-2">Sources Used:</h4>
                          <div className="flex flex-wrap gap-2">
                            {item.report.sources_used.map((source, index) => (
                              <Badge key={index} variant="outline" className="bg-emerald-50 text-emerald-700">
                                {source}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            {userStats ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-white/70 backdrop-blur-sm border-emerald-100">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Credits Remaining</CardTitle>
                    <Zap className="h-4 w-4 text-emerald-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-emerald-600">{userStats.credits_remaining}</div>
                    <Progress 
                      value={(userStats.credits_remaining / 100) * 100} 
                      className="mt-2"
                    />
                  </CardContent>
                </Card>

                <Card className="bg-white/70 backdrop-blur-sm border-emerald-100">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Questions Asked</CardTitle>
                    <Search className="h-4 w-4 text-emerald-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-emerald-600">{userStats.total_questions_asked}</div>
                    <p className="text-xs text-gray-600 mt-1">Total research queries</p>
                  </CardContent>
                </Card>

                <Card className="bg-white/70 backdrop-blur-sm border-emerald-100">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Reports Generated</CardTitle>
                    <FileText className="h-4 w-4 text-emerald-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-emerald-600">{userStats.reports_generated}</div>
                    <p className="text-xs text-gray-600 mt-1">Completed research reports</p>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading dashboard...</p>
              </div>
            )}
          </TabsContent>

          {/* News Tab */}
          <TabsContent value="news" className="space-y-6">
            <Card className="bg-white/70 backdrop-blur-sm border-emerald-100">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Zap className="w-5 h-5 text-emerald-600" />
                  <span>Live Data Sources</span>
                </CardTitle>
                <CardDescription>
                  Fresh data that gets automatically included in your research reports
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {latestNews.map((news) => (
                    <div key={news.id} className="border-l-4 border-emerald-500 pl-4 py-2">
                      <h4 className="font-semibold text-gray-800">{news.title}</h4>
                      <p className="text-gray-600 text-sm mt-1">{news.content}</p>
                      <div className="flex items-center justify-between mt-2">
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700">
                          {news.source}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          {new Date(news.published_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

export default App;
