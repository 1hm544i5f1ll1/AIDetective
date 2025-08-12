import React, { useState, useRef, useEffect } from 'react';
import { Send, Search, Download, Settings, AlertTriangle, CheckCircle, Clock, User, Image, MapPin, Shield, FileText, Loader2 } from 'lucide-react';
import { useForensicsInvestigation } from './hooks/useForensicsInvestigation';
import { exportInvestigationReport } from './services/forensicsApi';

interface Message {
  id: string;
  type: 'user' | 'system' | 'result';
  content: string;
  timestamp: Date;
}

import type { Pipeline } from './hooks/useForensicsInvestigation';

function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'system',
      content: 'AI Forensics Assistant ready. Enter your investigation query to begin analysis.',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [humanReviewEnabled, setHumanReviewEnabled] = useState(true);
  
  // Use the forensics investigation hook
  const {
    currentInvestigation,
    isLoading,
    error: investigationError,
    startNewInvestigation,
    getInvestigationSummary
  } = useForensicsInvestigation();
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, newMessage]);
    
    // Start investigation
    startInvestigationWithPipelines(inputValue);
    setInputValue('');
  };

  const startInvestigationWithPipelines = async (query: string) => {
    const pipelines: Pipeline[] = [
      {
        id: 'alias',
        name: 'Alias Mapping',
        status: 'running',
        progress: 0,
        icon: <User className="w-4 h-4" />,
      },
      {
        id: 'metadata',
        name: 'Metadata Extraction',
        status: 'pending',
        progress: 0,
        icon: <FileText className="w-4 h-4" />,
      },
      {
        id: 'image',
        name: 'Image & Face Analysis',
        status: 'pending',
        progress: 0,
        icon: <Image className="w-4 h-4" />,
      },
      {
        id: 'geo',
        name: 'Geo/IP Lookup',
        status: 'pending',
        progress: 0,
        icon: <MapPin className="w-4 h-4" />,
      },
      {
        id: 'deepfake',
        name: 'Deepfake Detection',
        status: 'pending',
        progress: 0,
        icon: <Shield className="w-4 h-4" />,
      }
    ];

    // Add system message
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      type: 'system',
      content: `Investigation started: "${query}"\nRunning ${pipelines.length} analysis pipelines...`,
      timestamp: new Date()
    }]);

    // Start the investigation using the hook
    await startNewInvestigation(query, pipelines);
  };

  const exportReport = async () => {
    if (!currentInvestigation) return;
    
    try {
      const blob = await exportInvestigationReport(currentInvestigation.id, 'json');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `forensics-report-${currentInvestigation.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export report:', error);
      // Add error message
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        type: 'system',
        content: '❌ Failed to export investigation report. Please try again.',
        timestamp: new Date()
      }]);
    }
  };

  // Add messages when pipeline status changes
  useEffect(() => {
    if (!currentInvestigation) return;

    currentInvestigation.pipelines.forEach(pipeline => {
      if (pipeline.status === 'completed' && pipeline.results) {
        const resultCount = pipeline.results.data.length;
        const confidence = Math.round(pipeline.results.metadata.confidence * 100);
        
        setMessages(prev => {
          // Check if we already added a message for this pipeline completion
          const existingMessage = prev.find(msg => 
            msg.content.includes(pipeline.name) && msg.content.includes('completed')
          );
          
          if (existingMessage) return prev;
          
          return [...prev, {
            id: `${pipeline.id}-${Date.now()}`,
            type: 'result',
            content: `✅ ${pipeline.name} completed - ${resultCount} results found (${confidence}% confidence)`,
            timestamp: new Date()
          }];
        });
      } else if (pipeline.status === 'error') {
        setMessages(prev => {
          const existingMessage = prev.find(msg => 
            msg.content.includes(pipeline.name) && msg.content.includes('failed')
          );
          
          if (existingMessage) return prev;
          
          return [...prev, {
            id: `${pipeline.id}-error-${Date.now()}`,
            type: 'system',
            content: `❌ ${pipeline.name} failed: ${pipeline.error || 'Unknown error'}`,
            timestamp: new Date()
          }];
        });
      }
    });

    // Add completion message when all pipelines are done
    if (currentInvestigation.status === 'completed') {
      const summary = getInvestigationSummary();
      if (summary) {
        setMessages(prev => {
          const existingMessage = prev.find(msg => 
            msg.content.includes('Investigation completed successfully')
          );
          
          if (existingMessage) return prev;
          
          return [...prev, {
            id: `completion-${Date.now()}`,
            type: 'system',
            content: `🎉 Investigation completed successfully. ${summary.completedPipelines}/${summary.totalPipelines} pipelines finished with ${summary.totalResults} total results.`,
            timestamp: new Date()
          }];
        });
      }
    }
  }, [currentInvestigation, getInvestigationSummary]);

  // Show investigation errors
  useEffect(() => {
    if (investigationError) {
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        type: 'system',
        content: `❌ Investigation error: ${investigationError}`,
        timestamp: new Date()
      }]);
    }
  }, [investigationError]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-400';
      case 'running': return 'text-blue-400';
      case 'error': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4" />;
      case 'running': return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'error': return <AlertTriangle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  return (
    <div className="h-screen bg-slate-950 text-white flex">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-slate-900 border-b border-slate-800 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <Search className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">AI Forensics Assistant</h1>
                <p className="text-sm text-gray-400">Advanced investigation & analysis platform</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setHumanReviewEnabled(!humanReviewEnabled)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  humanReviewEnabled 
                    ? 'bg-green-600 text-white' 
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
              >
                Human Review: {humanReviewEnabled ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={exportReport}
                disabled={!currentInvestigation}
                className="flex items-center space-x-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Export</span>
              </button>
              <button className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-2xl px-4 py-3 rounded-2xl ${
                  message.type === 'user'
                    ? 'bg-blue-600 text-white'
                    : message.type === 'result'
                    ? 'bg-green-900/30 border border-green-700/50 text-green-100'
                    : 'bg-slate-800 text-gray-100'
                }`}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                <p className={`text-xs mt-2 ${
                  message.type === 'user' ? 'text-blue-100' : 'text-gray-400'
                }`}>
                  {message.timestamp.toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-slate-800 p-4">
          <div className="flex space-x-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder='e.g., "Investigate user@example.com: map aliases, extract EXIF from images/, face-match, lookup IP, flag deepfakes."'
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoading}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all duration-200 font-medium"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Pipeline Status Panel */}
      <div className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col">
        <div className="p-4 border-b border-slate-800">
          <h2 className="text-lg font-semibold">Pipeline Status</h2>
          <p className="text-sm text-gray-400">Live analysis progress</p>
        </div>

        <div className="flex-1 p-4">
          {currentInvestigation ? (
            <div className="space-y-4">
              <div className="bg-slate-800 rounded-lg p-3">
                <h3 className="font-medium text-green-400 mb-1">Active Investigation</h3>
                <p className="text-sm text-gray-300 mb-2">"{currentInvestigation.query}"</p>
                <p className="text-xs text-gray-400">
                  Started: {currentInvestigation.startTime.toLocaleString()}
                </p>
              </div>

              <div className="space-y-3">
                {currentInvestigation.pipelines.map((pipeline) => (
                  <div key={pipeline.id} className="bg-slate-800 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <div className={getStatusColor(pipeline.status)}>
                          {pipeline.icon}
                        </div>
                        <span className="text-sm font-medium">{pipeline.name}</span>
                      </div>
                      <div className={`${getStatusColor(pipeline.status)}`}>
                        {getStatusIcon(pipeline.status)}
                      </div>
                    </div>
                    
                    {pipeline.status === 'running' && (
                      <div className="w-full bg-slate-700 rounded-full h-2 mb-2">
                        <div
                          className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${pipeline.progress}%` }}
                        ></div>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${getStatusColor(pipeline.status)}`}>
                        {pipeline.status === 'running' 
                          ? `${Math.round(pipeline.progress)}%`
                          : pipeline.status.charAt(0).toUpperCase() + pipeline.status.slice(1)
                        }
                      </span>
                      {pipeline.results && (
                        <span className="text-xs text-green-400">
                          {pipeline.results.length} results
                        </span>
                      )}
                    </div>

                    {pipeline.results && pipeline.results.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {pipeline.results.data.slice(0, 2).map((result, index) => (
                          <div key={index} className="text-xs text-gray-400 bg-slate-700 rounded px-2 py-1">
                            {typeof result === 'string' ? result : `${result.type}: ${result.value || result.file || 'Data found'}`}
                          </div>
                        ))}
                        {pipeline.results.data.length > 2 && (
                          <div className="text-xs text-blue-400">
                            +{pipeline.results.data.length - 2} more results
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-400 mt-8">
              <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No active investigation</p>
              <p className="text-sm mt-1">Start a query to begin analysis</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;