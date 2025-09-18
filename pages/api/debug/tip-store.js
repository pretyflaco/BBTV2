const tipStore = require('../../../lib/tip-store');

export default function handler(req, res) {
  if (req.method === 'GET') {
    // Return tip store stats for debugging
    const stats = tipStore.getStats();
    res.status(200).json(stats);
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
