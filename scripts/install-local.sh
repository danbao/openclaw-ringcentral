#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PLUGIN_NAME="openclaw-ringcentral"
OPENCLAW_CONFIG="$HOME/.openclaw/openclaw.json"
OPENCLAW_EXTENSIONS="$HOME/.openclaw/extensions"

# Parse arguments
USE_NPM=false
NPM_VERSION=""

print_usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --npm [version]   Install from npm registry (default: latest)"
    echo "  --local           Install from local tarball (default)"
    echo "  -h, --help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                      # Install from local tarball"
    echo "  $0 --local              # Install from local tarball"
    echo "  $0 --npm                # Install latest from npm"
    echo "  $0 --npm 2026.1.30      # Install specific version from npm"
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --npm)
            USE_NPM=true
            if [[ -n "$2" && ! "$2" =~ ^- ]]; then
                NPM_VERSION="$2"
                shift
            fi
            shift
            ;;
        --local)
            USE_NPM=false
            shift
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            print_usage
            exit 1
            ;;
    esac
done

cd "$PROJECT_DIR"

echo "=== Installing $PLUGIN_NAME ==="

# Determine install source
if [ "$USE_NPM" = true ]; then
    if [ -n "$NPM_VERSION" ]; then
        INSTALL_SOURCE="${PLUGIN_NAME}@${NPM_VERSION}"
        echo "Source: npm registry (version: $NPM_VERSION)"
    else
        INSTALL_SOURCE="$PLUGIN_NAME"
        echo "Source: npm registry (latest)"
    fi
else
    # Get current version from package.json
    CURRENT_VERSION=$(node -p "require('./package.json').version")
    TARBALL="${PLUGIN_NAME}-${CURRENT_VERSION}.tgz"
    
    echo "Source: local tarball"
    echo "Version: $CURRENT_VERSION"
    
    # Check if tarball exists, if not pack it
    if [ ! -f "$TARBALL" ]; then
        echo "Tarball not found, packing..."
        pnpm pack
    fi

    if [ ! -f "$TARBALL" ]; then
        echo "Error: Failed to create tarball"
        exit 1
    fi

    INSTALL_SOURCE="$PROJECT_DIR/$TARBALL"
    echo "Using tarball: $TARBALL"
fi

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
openclaw plugins install "$INSTALL_SOURCE"

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
if [ "$USE_NPM" = true ]; then
    if [ -n "$NPM_VERSION" ]; then
        echo "Installed: $PLUGIN_NAME@$NPM_VERSION (from npm)"
    else
        echo "Installed: $PLUGIN_NAME@latest (from npm)"
    fi
else
    echo "Installed: $PLUGIN_NAME@$CURRENT_VERSION (local)"
fi
echo ""
echo "To load the new plugin, restart the gateway:"
echo "  openclaw gateway restart"
