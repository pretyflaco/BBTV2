import { useEffect, useRef } from 'react';

// Sound theme configuration
const SOUND_THEMES = {
  success: {
    nfc: '/connect.mp3',
    payment: '/success.mp3',
  },
  zelda: {
    nfc: '/botw_connect.mp3',
    payment: '/botw_shrine.mp3',
  },
  free: {
    nfc: '/free_connect.mp3',
    payment: '/free_success.mp3',
  },
  retro: {
    nfc: '/retro_connect.mp3',
    payment: '/retro_success.mp3',
  },
};

export default function PaymentAnimation({ show, payment, onHide, soundEnabled = true, soundTheme = 'success' }) {
  const audioRef = useRef(null);

  // Play sound when animation shows
  useEffect(() => {
    if (show && soundEnabled) {
      try {
        const themeConfig = SOUND_THEMES[soundTheme] || SOUND_THEMES.success;
        
        // Create or reuse audio element
        if (!audioRef.current || audioRef.current.src !== themeConfig.payment) {
          audioRef.current = new Audio(themeConfig.payment);
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
  }, [show, soundEnabled, soundTheme]);

  if (!show) return null;

  const handleDone = (e) => {
    console.log('🎬 Payment animation dismissed by Done button');
    e.stopPropagation();
    onHide();
  };

  const handleOverlayClick = (e) => {
    // Only dismiss if clicking the overlay itself, not the button
    // This prevents accidental dismissals while still allowing Done button to work
    e.stopPropagation();
  };

  const handleTouchStart = (e) => {
    // Block touch events from reaching elements underneath
    e.stopPropagation();
  };

  return (
    <div 
      className={`payment-overlay ${show ? 'active' : ''}`}
      onClick={handleOverlayClick}
      onTouchStart={handleTouchStart}
      style={{ 
        backgroundColor: 'rgba(34, 197, 94, 0.95)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch'
      }}
    >
      {/* Main content area */}
      <div className="flex-1 flex flex-col items-center justify-center">
        {/* Checkmark */}
        <img 
          src="/checkmark.png" 
          alt="Success" 
          className="w-[123px] h-[123px] mb-8"
        />
        
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
        </div>
      </div>

      {/* Done Button */}
      <div className="px-6 pb-10 pt-6 w-full">
        <button
          onClick={handleDone}
          className="w-full h-14 bg-white hover:bg-gray-100 text-green-600 rounded-lg text-xl font-semibold transition-colors shadow-lg"
          style={{fontFamily: "'Source Sans Pro', sans-serif"}}
        >
          Done
        </button>
      </div>
    </div>
  );
}
