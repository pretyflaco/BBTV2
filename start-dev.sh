#!/bin/bash
# Clean start script for BlinkPOS
echo "🧹 Cleaning..."
rm -rf .next
echo "🚀 Starting server..."
NODE_ENV=development npm run dev
