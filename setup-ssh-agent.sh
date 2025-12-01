#!/bin/bash
# Helper script to start SSH agent and add key
# Run this in your terminal or add to ~/.bashrc

if [ -z "$SSH_AUTH_SOCK" ]; then
    eval "$(ssh-agent -s)"
    ssh-add ~/.ssh/id_ed25519 2>/dev/null
    echo "✅ SSH agent started and key added"
else
    echo "✅ SSH agent already running"
fi

