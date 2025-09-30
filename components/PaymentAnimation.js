import { useEffect, useRef } from 'react';

export default function PaymentAnimation({ show, payment, onHide, soundEnabled = true }) {
  const audioRef = useRef(null);

  // Play sound when animation shows
  useEffect(() => {
    if (show && soundEnabled) {
      try {
        // Create or reuse audio element
        if (!audioRef.current) {
          audioRef.current = new Audio('/chaching.mp3');
          audioRef.current.volume = 0.7; // Set volume to 70%
        }
        
        // Reset and play the sound
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(error => {
          console.log('Could not play sound (might need user interaction first):', error);
        });
      } catch (error) {
        console.log('Audio playback error:', error);
      }
    }
  }, [show, soundEnabled]);

  if (!show) return null;

  const handleClick = (e) => {
    console.log('🎬 Payment animation dismissed by click');
    e.stopPropagation();
    onHide();
  };

  const handleTouchStart = (e) => {
    // Block touch events from reaching elements underneath but allow our own handling
    e.stopPropagation();
  };

  const handleTouchEnd = (e) => {
    console.log('🎬 Payment animation dismissed by touch');
    e.stopPropagation();
    onHide();
  };

  return (
    <div 
      className={`payment-overlay ${show ? 'active' : ''} cursor-pointer`}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{ backgroundColor: 'rgba(34, 197, 94, 0.95)' }} // Green background
    >
      <div className="payment-animation-content flex flex-col items-center justify-center">
        {/* Checkmark on white circle */}
        <div className="bg-white rounded-full w-32 h-32 flex items-center justify-center mb-8 shadow-lg">
          <img 
            src="/checkmark.svg" 
            alt="Success" 
            className="w-20 h-20"
          />
        </div>
        
        {/* Payment info */}
        <div className="text-white text-center">
          <div className="text-3xl font-bold mb-4">
            Payment Received
          </div>
          
          {payment && (
            <>
              <div className="text-5xl font-bold mb-2">
                +{payment.amount}
              </div>
              <div className="text-2xl font-medium mb-6">
                {payment.currency === 'BTC' ? 'sats' : payment.currency}
              </div>
            </>
          )}
          
          {payment?.memo && (
            <div className="text-lg mt-4 opacity-90 max-w-md mx-auto">
              {payment.memo}
            </div>
          )}
          
          <div className="text-base mt-8 opacity-75">
            Tap to continue
          </div>
        </div>
      </div>
    </div>
  );
}
