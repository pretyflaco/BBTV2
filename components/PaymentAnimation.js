export default function PaymentAnimation({ show, payment, onHide }) {
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
    >
      <div className="payment-animation-content">
        <div className="payment-text">
          🎉 PAYMENT RECEIVED! 🎉
        </div>
        <div className="payment-text text-2xl mt-4">
          {payment ? `+${payment.amount} ${payment.currency === 'BTC' ? 'sats' : payment.currency}` : '⚡ 💰 ⚡'}
        </div>
        {payment?.memo && (
          <div className="text-white text-xl mt-2 opacity-80">
            {payment.memo}
          </div>
        )}
        <div className="text-white text-lg mt-6 opacity-75 animate-pulse">
          👆 Tap to continue
        </div>
      </div>
    </div>
  );
}
