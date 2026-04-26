#!/bin/bash
# Script to fix nginx 413 error on EC2 server
# Run this script on your EC2 server: bash deploy-nginx-fix.sh

set -e

echo "🔧 Fixing nginx configuration for large file uploads..."

# Find nginx config file for the API
NGINX_CONFIG=""
if [ -f "/etc/nginx/sites-available/api.nomadictownies.com" ]; then
    NGINX_CONFIG="/etc/nginx/sites-available/api.nomadictownies.com"
elif [ -f "/etc/nginx/sites-available/default" ]; then
    NGINX_CONFIG="/etc/nginx/sites-available/default"
elif [ -f "/etc/nginx/conf.d/api.conf" ]; then
    NGINX_CONFIG="/etc/nginx/conf.d/api.conf"
else
    echo "❌ Could not find nginx configuration file"
    echo "Please manually edit your nginx config and add:"
    echo "  client_max_body_size 500M;"
    echo "  client_body_buffer_size 500M;"
    echo "  client_body_timeout 300s;"
    echo "  send_timeout 300s;"
    echo "  proxy_buffering off;"
    echo "  proxy_request_buffering off;"
    exit 1
fi

echo "📝 Found nginx config: $NGINX_CONFIG"

# Backup the original config
BACKUP_FILE="${NGINX_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"
sudo cp "$NGINX_CONFIG" "$BACKUP_FILE"
echo "✅ Backup created: $BACKUP_FILE"

# Check if settings already exist
if grep -q "client_max_body_size" "$NGINX_CONFIG"; then
    echo "⚠️  client_max_body_size already exists, updating..."
    # Update existing value
    sudo sed -i 's/client_max_body_size.*/client_max_body_size 500M;/' "$NGINX_CONFIG"
else
    echo "➕ Adding client_max_body_size..."
    # Add after server_name line
    sudo sed -i '/server_name/a\    client_max_body_size 500M;' "$NGINX_CONFIG"
fi

# Add or update other settings
if ! grep -q "client_body_buffer_size" "$NGINX_CONFIG"; then
    sudo sed -i '/client_max_body_size/a\    client_body_buffer_size 500M;' "$NGINX_CONFIG"
fi

if ! grep -q "client_body_timeout" "$NGINX_CONFIG"; then
    sudo sed -i '/client_body_buffer_size/a\    client_body_timeout 300s;' "$NGINX_CONFIG"
fi

if ! grep -q "send_timeout" "$NGINX_CONFIG"; then
    sudo sed -i '/client_body_timeout/a\    send_timeout 300s;' "$NGINX_CONFIG"
fi

# Update proxy settings in location block
if grep -q "proxy_pass.*127.0.0.1:5000" "$NGINX_CONFIG"; then
    if ! grep -q "proxy_buffering off" "$NGINX_CONFIG"; then
        sudo sed -i '/proxy_pass.*127.0.0.1:5000/a\        proxy_buffering off;\n        proxy_request_buffering off;' "$NGINX_CONFIG"
    fi
fi

# Test nginx configuration
echo "🧪 Testing nginx configuration..."
if sudo nginx -t; then
    echo "✅ Nginx configuration is valid"
    
    # Reload nginx
    echo "🔄 Reloading nginx..."
    sudo systemctl reload nginx
    
    echo "✅ Nginx has been updated and reloaded successfully!"
    echo ""
    echo "📋 Summary of changes:"
    echo "  - client_max_body_size: 500M"
    echo "  - client_body_buffer_size: 500M"
    echo "  - client_body_timeout: 300s"
    echo "  - send_timeout: 300s"
    echo "  - proxy_buffering: off"
    echo "  - proxy_request_buffering: off"
else
    echo "❌ Nginx configuration test failed!"
    echo "Restoring backup..."
    sudo cp "$BACKUP_FILE" "$NGINX_CONFIG"
    echo "Backup restored. Please check the configuration manually."
    exit 1
fi

