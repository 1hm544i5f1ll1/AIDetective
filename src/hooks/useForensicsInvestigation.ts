// Custom React Hook for Forensics Investigation Management
import { useState, useCallback, useEffect } from 'react';
import {
  ForensicsQuery,
  InvestigationResponse,
  PipelineResult,
  startInvestigation,
  getInvestigationStatus,
  executeAliasMappingPipeline,
  executeMetadataExtractionPipeline,
  executeImageFaceAnalysisPipeline,
  executeGeoIpLookupPipeline,
  executeDeepfakeDetectionPipeline,
  parseForensicsQuery,
  ForensicsWebSocket
} from '../services/forensicsApi';

export interface Pipeline {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  progress: number;
  icon: React.ReactNode;
  results?: PipelineResult;
  error?: string;
}

export interface Investigation {
  id: string;
  query: string;
  status: 'active' | 'completed' | 'paused' | 'error';
  startTime: Date;
  endTime?: Date;
  pipelines: Pipeline[];
  summary?: string;
}

export function useForensicsInvestigation() {
  const [currentInvestigation, setCurrentInvestigation] = useState<Investigation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wsConnection, setWsConnection] = useState<ForensicsWebSocket | null>(null);

  // Start a new investigation
  const startNewInvestigation = useCallback(async (naturalLanguageQuery: string, initialPipelines: Pipeline[]) => {
    try {
      setIsLoading(true);
      setError(null);

      // Parse the natural language query
      const parsedQuery = parseForensicsQuery(naturalLanguageQuery);
      
      // Start investigation on backend
      const investigationId = await startInvestigation(parsedQuery);
      
      // Create investigation object
      const investigation: Investigation = {
        id: investigationId,
        query: naturalLanguageQuery,
        status: 'active',
        startTime: new Date(),
        pipelines: initialPipelines.map(p => ({ ...p, status: 'pending', progress: 0 }))
      };

      setCurrentInvestigation(investigation);

      // Set up WebSocket connection for real-time updates
      const ws = new ForensicsWebSocket();
      ws.connect(investigationId);
      setWsConnection(ws);

      // Start pipeline execution
      executePipelines(investigation, parsedQuery);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start investigation');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Execute pipelines sequentially
  const executePipelines = useCallback(async (investigation: Investigation, query: ForensicsQuery) => {
    const pipelineExecutors = {
      'alias-mapping': executeAliasMappingPipeline,
      'metadata-extraction': executeMetadataExtractionPipeline,
      'image-face-analysis': executeImageFaceAnalysisPipeline,
      'geo-ip-lookup': executeGeoIpLookupPipeline,
      'deepfake-detection': executeDeepfakeDetectionPipeline
    };

    for (let i = 0; i < investigation.pipelines.length; i++) {
      const pipeline = investigation.pipelines[i];
      
      // Update pipeline status to running
      setCurrentInvestigation(prev => {
        if (!prev) return prev;
        const updatedPipelines = [...prev.pipelines];
        updatedPipelines[i] = { ...pipeline, status: 'running', progress: 0 };
        return { ...prev, pipelines: updatedPipelines };
      });

      try {
        // Simulate progress updates
        const progressInterval = setInterval(() => {
          setCurrentInvestigation(prev => {
            if (!prev) return prev;
            const updatedPipelines = [...prev.pipelines];
            const currentPipeline = updatedPipelines[i];
            if (currentPipeline.status === 'running' && currentPipeline.progress < 90) {
              updatedPipelines[i] = { 
                ...currentPipeline, 
                progress: Math.min(90, currentPipeline.progress + Math.random() * 15) 
              };
            }
            return { ...prev, pipelines: updatedPipelines };
          });
        }, 500);

        // Execute the actual pipeline
        const executor = pipelineExecutors[pipeline.id as keyof typeof pipelineExecutors];
        let result: PipelineResult;

        if (executor) {
          // Pass appropriate targets based on pipeline type
          if (pipeline.id === 'alias-mapping') {
            result = await executor(query.targets[0] || 'unknown');
          } else if (pipeline.id === 'metadata-extraction' || pipeline.id === 'geo-ip-lookup') {
            result = await executor(query.targets);
          } else {
            result = await executor(query.targets);
          }
        } else {
          throw new Error(`Unknown pipeline: ${pipeline.id}`);
        }

        clearInterval(progressInterval);

        // Update pipeline with results
        setCurrentInvestigation(prev => {
          if (!prev) return prev;
          const updatedPipelines = [...prev.pipelines];
          updatedPipelines[i] = { 
            ...pipeline, 
            status: 'completed', 
            progress: 100,
            results: result
          };
          return { ...prev, pipelines: updatedPipelines };
        });

      } catch (err) {
        // Handle pipeline error
        setCurrentInvestigation(prev => {
          if (!prev) return prev;
          const updatedPipelines = [...prev.pipelines];
          updatedPipelines[i] = { 
            ...pipeline, 
            status: 'error', 
            progress: 0,
            error: err instanceof Error ? err.message : 'Pipeline execution failed'
          };
          return { ...prev, pipelines: updatedPipelines };
        });
      }
    }

    // Mark investigation as completed
    setCurrentInvestigation(prev => {
      if (!prev) return prev;
      const completedPipelines = prev.pipelines.filter(p => p.status === 'completed').length;
      const totalPipelines = prev.pipelines.length;
      
      return {
        ...prev,
        status: completedPipelines === totalPipelines ? 'completed' : 'error',
        endTime: new Date(),
        summary: `Investigation completed. ${completedPipelines}/${totalPipelines} pipelines successful.`
      };
    });
  }, []);

  // Pause/Resume investigation
  const toggleInvestigationStatus = useCallback(() => {
    setCurrentInvestigation(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        status: prev.status === 'active' ? 'paused' : 'active'
      };
    });
  }, []);

  // Stop investigation
  const stopInvestigation = useCallback(() => {
    if (wsConnection) {
      wsConnection.disconnect();
      setWsConnection(null);
    }
    
    setCurrentInvestigation(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        status: 'paused',
        endTime: new Date()
      };
    });
  }, [wsConnection]);

  // Get investigation summary
  const getInvestigationSummary = useCallback(() => {
    if (!currentInvestigation) return null;

    const completedPipelines = currentInvestigation.pipelines.filter(p => p.status === 'completed');
    const totalResults = completedPipelines.reduce((acc, pipeline) => {
      return acc + (pipeline.results?.data.length || 0);
    }, 0);

    const averageConfidence = completedPipelines.reduce((acc, pipeline) => {
      return acc + (pipeline.results?.metadata.confidence || 0);
    }, 0) / completedPipelines.length;

    return {
      totalPipelines: currentInvestigation.pipelines.length,
      completedPipelines: completedPipelines.length,
      totalResults,
      averageConfidence: isNaN(averageConfidence) ? 0 : averageConfidence,
      duration: currentInvestigation.endTime 
        ? currentInvestigation.endTime.getTime() - currentInvestigation.startTime.getTime()
        : Date.now() - currentInvestigation.startTime.getTime()
    };
  }, [currentInvestigation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsConnection) {
        wsConnection.disconnect();
      }
    };
  }, [wsConnection]);

  return {
    currentInvestigation,
    isLoading,
    error,
    startNewInvestigation,
    toggleInvestigationStatus,
    stopInvestigation,
    getInvestigationSummary
  };
}