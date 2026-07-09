#!/bin/bash
/usr/bin/sherry-service-uninstall

. /etc/os-release

if [ "$ID" = "deepin" ]; then
    if [ -f "/usr/share/applications/sherry.desktop" ]; then
        echo "Removing deepin desktop file"
        rm -vf "/usr/share/applications/sherry.desktop"
    fi
fi

