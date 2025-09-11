import { useEffect } from 'react';

export default function PaymentAnimation({ show, payment, onHide }) {
  useEffect(() => {
    if (show) {
      // Auto-hide after 4 seconds
      const timer = setTimeout(() => {
        onHide();
      }, 4000);

      return () => clearTimeout(timer);
    }
  }, [show, onHide]);

  if (!show) return null;

  return (
    <div className={`payment-overlay ${show ? 'active' : ''}`}>
      <div>
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
      </div>
    </div>
  );
}
