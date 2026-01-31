#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PLUGIN_NAME="openclaw-ringcentral"
OPENCLAW_CONFIG="$HOME/.openclaw/openclaw.json"
OPENCLAW_EXTENSIONS="$HOME/.openclaw/extensions"

cd "$PROJECT_DIR"

# Get current version from package.json
CURRENT_VERSION=$(node -p "require('./package.json').version")
TARBALL="${PLUGIN_NAME}-${CURRENT_VERSION}.tgz"

echo "=== Installing $PLUGIN_NAME locally ==="
echo "Version: $CURRENT_VERSION"
echo ""

# Check if tarball exists, if not pack it
if [ ! -f "$TARBALL" ]; then
    echo "Tarball not found, packing..."
    pnpm pack
fi

if [ ! -f "$TARBALL" ]; then
    echo "Error: Failed to create tarball"
    exit 1
fi

echo "Using tarball: $TARBALL"
echo ""

# Remove existing plugin installation
if [ -d "$OPENCLAW_EXTENSIONS/$PLUGIN_NAME" ]; then
    echo "Removing existing plugin installation..."
    rm -rf "$OPENCLAW_EXTENSIONS/$PLUGIN_NAME"
fi

# Backup credentials from config if they exist
CREDENTIALS_BACKUP=""
if [ -f "$OPENCLAW_CONFIG" ]; then
    CREDENTIALS_BACKUP=$(node -e "
        const fs = require('fs');
        const cfg = JSON.parse(fs.readFileSync('$OPENCLAW_CONFIG', 'utf8'));
        if (cfg.channels?.ringcentral?.credentials) {
            console.log(JSON.stringify(cfg.channels.ringcentral.credentials));
        }
    " 2>/dev/null || echo "")
fi

# Remove plugin references from config to allow clean install
if [ -f "$OPENCLAW_CONFIG" ]; then
    echo "Cleaning up config for reinstall..."
    node -e "
        const fs = require('fs');
        const cfg = JSON.parse(fs.readFileSync('$OPENCLAW_CONFIG', 'utf8'));
        
        // Remove plugin entries and installs
        if (cfg.plugins?.entries?.['$PLUGIN_NAME']) {
            delete cfg.plugins.entries['$PLUGIN_NAME'];
        }
        if (cfg.plugins?.installs?.['$PLUGIN_NAME']) {
            delete cfg.plugins.installs['$PLUGIN_NAME'];
        }
        
        // Temporarily remove ringcentral channel config
        const rcChannel = cfg.channels?.ringcentral;
        if (rcChannel) {
            delete cfg.channels.ringcentral;
        }
        
        fs.writeFileSync('$OPENCLAW_CONFIG', JSON.stringify(cfg, null, 2));
    "
fi

# Install plugin
echo "Installing plugin..."
openclaw plugins install "$PROJECT_DIR/$TARBALL"

# Restore ringcentral channel config with credentials
if [ -n "$CREDENTIALS_BACKUP" ] && [ "$CREDENTIALS_BACKUP" != "" ]; then
    echo "Restoring RingCentral credentials..."
    node -e "
        const fs = require('fs');
        const cfg = JSON.parse(fs.readFileSync('$OPENCLAW_CONFIG', 'utf8'));
        const credentials = $CREDENTIALS_BACKUP;
        
        if (!cfg.channels) cfg.channels = {};
        cfg.channels.ringcentral = {
            enabled: true,
            credentials: credentials
        };
        
        fs.writeFileSync('$OPENCLAW_CONFIG', JSON.stringify(cfg, null, 2));
    "
fi

echo ""
echo "=== Installation complete ==="
echo "Installed: $PLUGIN_NAME@$CURRENT_VERSION"
echo ""
echo "To load the new plugin, restart the gateway:"
echo "  openclaw gateway restart"
