import type { NextApiRequest, NextApiResponse } from "next"

import tipStore from "../../../lib/tip-store"

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    // Return tip store stats for debugging
    const stats = tipStore.getStats()
    res.status(200).json(stats)
  } else {
    res.status(405).json({ error: "Method not allowed" })
  }
}
