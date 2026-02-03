/**
 * ProgressStepper - Reusable progress indicator component
 * 
 * Shows a vertical list of steps with status indicators:
 * - complete: green checkmark
 * - current: spinning purple indicator
 * - waiting: amber pulsing indicator (for user action required)
 * - pending: gray empty circle
 * - error: red X
 * 
 * Used by:
 * - NostrConnectModal (NIP-46 connection flow)
 * - SessionEstablishmentModal (extension sign-in flow)
 */

/**
 * @param {Object} props
 * @param {Array<{id: string, label: string}>} props.stages - List of stages to display
 * @param {string} props.currentStage - Current active stage id (or 'complete' or 'error')
 * @param {string|null} props.errorStage - Stage where error occurred (optional)
 * @param {boolean} props.waitingForApproval - Show waiting indicator on 'connected' stage
 */
export default function ProgressStepper({ stages, currentStage, errorStage, waitingForApproval }) {
  const getStageStatus = (stageId) => {
    const stageIds = stages.map(s => s.id);
    const order = [...stageIds, 'complete'];
    const currentIndex = order.indexOf(currentStage);
    const stageIndex = order.indexOf(stageId);
    
    // If we're in error state, mark the error stage appropriately
    if (errorStage === stageId) return 'error';
    if (currentStage === 'error' && stageIndex >= order.indexOf(errorStage || stageIds[0])) return 'pending';
    
    if (stageIndex < currentIndex || currentStage === 'complete') return 'complete';
    if (stageIndex === currentIndex) return waitingForApproval && stageId === stages[0]?.id ? 'waiting' : 'current';
    return 'pending';
  };
  
  return (
    <div className="space-y-3 my-4">
      {stages.map((s) => {
        const status = getStageStatus(s.id);
        return (
          <div key={s.id} className="flex items-center gap-3">
            {/* Icon */}
            {status === 'complete' && (
              <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
            {status === 'current' && (
              <div className="w-6 h-6 rounded-full border-2 border-purple-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-purple-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            )}
            {status === 'waiting' && (
              <div className="w-6 h-6 rounded-full border-2 border-amber-500 bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-amber-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            )}
            {status === 'pending' && (
              <div className="w-6 h-6 rounded-full border-2 border-gray-300 dark:border-gray-600 flex-shrink-0" />
            )}
            {status === 'error' && (
              <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            )}
            
            {/* Label */}
            <span className={`text-sm ${
              status === 'complete' ? 'text-green-600 dark:text-green-400' :
              status === 'current' ? 'text-purple-600 dark:text-purple-400 font-medium' :
              status === 'waiting' ? 'text-amber-600 dark:text-amber-400 font-medium' :
              status === 'error' ? 'text-red-600 dark:text-red-400' :
              'text-gray-400 dark:text-gray-500'
            }`}>
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
