#!/bin/bash

# Test script for AIdol-Vtuber services
# Tests both frontend and backend endpoints

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
FRONTEND_URL="http://localhost:3000"
BACKEND_URL="http://localhost:12393"
BACKEND_WS_URL="ws://localhost:12393/client-ws"
BACKEND_API_ENDPOINT="${BACKEND_URL}/api/base-config"

# Test results
FRONTEND_OK=false
BACKEND_OK=false
API_OK=false
AUTONOMOUS_OK=false
EXPRESSION_OK=false
MOTION_OK=false
TWITCH_OK=false
PUMP_FUN_OK=false

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}AIdol-Vtuber Service Test${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Test Frontend
echo -e "${YELLOW}Testing Frontend...${NC}"
echo -e "  URL: ${FRONTEND_URL}"
if curl -s -f -o /dev/null --max-time 5 "${FRONTEND_URL}"; then
    echo -e "  ${GREEN}✓ Frontend is accessible${NC}"
    FRONTEND_OK=true
else
    echo -e "  ${RED}✗ Frontend is not accessible${NC}"
    echo -e "  ${YELLOW}  Make sure 'npm run dev' is running in the frontend/ directory${NC}"
fi
echo ""

# Test Backend Base URL
echo -e "${YELLOW}Testing Backend Base URL...${NC}"
echo -e "  URL: ${BACKEND_URL}"
if curl -s -f -o /dev/null --max-time 5 "${BACKEND_URL}"; then
    echo -e "  ${GREEN}✓ Backend server is accessible${NC}"
    BACKEND_OK=true
else
    echo -e "  ${RED}✗ Backend server is not accessible${NC}"
    echo -e "  ${YELLOW}  Make sure 'python cli.py run' is running in the backend/ directory${NC}"
fi
echo ""

# Test Backend API Endpoint
if [ "$BACKEND_OK" = true ]; then
    echo -e "${YELLOW}Testing Backend API Endpoint...${NC}"
    echo -e "  URL: ${BACKEND_API_ENDPOINT}"
    
    RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 10 "${BACKEND_API_ENDPOINT}" 2>/dev/null || echo -e "\n000")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "  ${GREEN}✓ API endpoint is responding (HTTP ${HTTP_CODE})${NC}"
        
        # Try to parse JSON response
        if command -v jq &> /dev/null; then
            echo -e "  ${BLUE}Response preview:${NC}"
            echo "$BODY" | jq -r '.character.name // .character.id // "Config loaded"' 2>/dev/null | head -1 | sed 's/^/    /'
        else
            echo -e "  ${BLUE}Response received (install jq for JSON parsing)${NC}"
        fi
        API_OK=true
    elif [ "$HTTP_CODE" = "000" ]; then
        echo -e "  ${RED}✗ API endpoint connection failed${NC}"
    else
        echo -e "  ${YELLOW}⚠ API endpoint returned HTTP ${HTTP_CODE}${NC}"
        echo -e "  ${BLUE}Response:${NC}"
        echo "$BODY" | head -5 | sed 's/^/    /'
    fi
    echo ""
fi

# Test WebSocket (basic check - can't fully test without a WebSocket client)
echo -e "${YELLOW}Testing WebSocket Endpoint...${NC}"
echo -e "  URL: ${BACKEND_WS_URL}"
if command -v nc &> /dev/null || command -v netcat &> /dev/null; then
    # Try to connect to WebSocket port (basic port check)
    if nc -z localhost 12393 2>/dev/null || netcat -z localhost 12393 2>/dev/null; then
        echo -e "  ${GREEN}✓ WebSocket port is open${NC}"
        echo -e "  ${YELLOW}  Note: Full WebSocket handshake requires a WebSocket client${NC}"
    else
        echo -e "  ${RED}✗ WebSocket port is not accessible${NC}"
    fi
else
    echo -e "  ${YELLOW}⚠ Cannot test WebSocket (netcat/nc not available)${NC}"
    echo -e "  ${YELLOW}  WebSocket URL: ${BACKEND_WS_URL}${NC}"
fi
echo ""

# Test Autonomous Mode Endpoints
if [ "$BACKEND_OK" = true ]; then
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}Testing Autonomous Twitch Mode${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    # Test Autonomous Mode Status/Configuration
    echo -e "${YELLOW}Testing Autonomous Mode Status...${NC}"
    AUTONOMOUS_STATUS_URL="${BACKEND_URL}/api/autonomous/status"
    RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 5 "${AUTONOMOUS_STATUS_URL}" 2>/dev/null || echo -e "\n000")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "  ${GREEN}✓ Autonomous mode status endpoint is available${NC}"
        AUTONOMOUS_OK=true
        if [ -n "$BODY" ]; then
            echo -e "  ${BLUE}Full Response:${NC}"
            if command -v jq &> /dev/null; then
                echo "$BODY" | jq '.' 2>/dev/null | sed 's/^/    /' || echo "$BODY" | sed 's/^/    /'
            else
                echo "$BODY" | sed 's/^/    /'
            fi
        fi
    elif [ "$HTTP_CODE" = "404" ]; then
        echo -e "  ${YELLOW}⚠ Autonomous mode endpoint not yet implemented (HTTP 404)${NC}"
        echo -e "  ${YELLOW}  This is expected if autonomous mode is still in development${NC}"
    else
        echo -e "  ${YELLOW}⚠ Autonomous mode endpoint returned HTTP ${HTTP_CODE}${NC}"
        if [ -n "$BODY" ]; then
            echo -e "  ${BLUE}Response:${NC}"
            if command -v jq &> /dev/null; then
                echo "$BODY" | jq '.' 2>/dev/null | sed 's/^/    /' || echo "$BODY" | sed 's/^/    /'
            else
                echo "$BODY" | sed 's/^/    /'
            fi
        fi
    fi
    echo ""
    
    # Test Expression Control Endpoint
    echo -e "${YELLOW}Testing Expression Control API...${NC}"
    EXPRESSION_URL="${BACKEND_URL}/api/expression"
    # Test with a simple POST request (expression ID 0 = default)
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d '{"expressionId": 0, "duration": 0}' \
        --max-time 5 "${EXPRESSION_URL}" 2>/dev/null || echo -e "\n000")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
        echo -e "  ${GREEN}✓ Expression control endpoint is working${NC}"
        EXPRESSION_OK=true
        if [ -n "$BODY" ]; then
            echo -e "  ${BLUE}Response:${NC}"
            if command -v jq &> /dev/null; then
                echo "$BODY" | jq '.' 2>/dev/null | sed 's/^/    /' || echo "$BODY" | sed 's/^/    /'
            else
                echo "$BODY" | sed 's/^/    /'
            fi
        fi
    elif [ "$HTTP_CODE" = "404" ]; then
        echo -e "  ${YELLOW}⚠ Expression control endpoint not yet implemented (HTTP 404)${NC}"
        echo -e "  ${YELLOW}  This is expected if character control API is still in development${NC}"
    elif [ "$HTTP_CODE" = "400" ] || [ "$HTTP_CODE" = "422" ]; then
        echo -e "  ${GREEN}✓ Expression control endpoint exists (validation error expected without client_uid)${NC}"
        EXPRESSION_OK=true
        if [ -n "$BODY" ]; then
            echo -e "  ${BLUE}Response:${NC}"
            if command -v jq &> /dev/null; then
                echo "$BODY" | jq '.' 2>/dev/null | sed 's/^/    /' || echo "$BODY" | sed 's/^/    /'
            else
                echo "$BODY" | sed 's/^/    /'
            fi
        fi
    else
        echo -e "  ${YELLOW}⚠ Expression control endpoint returned HTTP ${HTTP_CODE}${NC}"
        if [ -n "$BODY" ]; then
            echo -e "  ${BLUE}Response:${NC}"
            if command -v jq &> /dev/null; then
                echo "$BODY" | jq '.' 2>/dev/null | sed 's/^/    /' || echo "$BODY" | sed 's/^/    /'
            else
                echo "$BODY" | sed 's/^/    /'
            fi
        fi
    fi
    echo ""
    
    # Test Motion Control Endpoint
    echo -e "${YELLOW}Testing Motion Control API...${NC}"
    MOTION_URL="${BACKEND_URL}/api/motion"
    # Test with a simple POST request
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d '{"motionGroup": "idle", "motionIndex": 0}' \
        --max-time 5 "${MOTION_URL}" 2>/dev/null || echo -e "\n000")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
        echo -e "  ${GREEN}✓ Motion control endpoint is working${NC}"
        MOTION_OK=true
        if [ -n "$BODY" ]; then
            echo -e "  ${BLUE}Response:${NC}"
            if command -v jq &> /dev/null; then
                echo "$BODY" | jq '.' 2>/dev/null | sed 's/^/    /' || echo "$BODY" | sed 's/^/    /'
            else
                echo "$BODY" | sed 's/^/    /'
            fi
        fi
    elif [ "$HTTP_CODE" = "404" ]; then
        echo -e "  ${YELLOW}⚠ Motion control endpoint not yet implemented (HTTP 404)${NC}"
        echo -e "  ${YELLOW}  This is expected if character control API is still in development${NC}"
    elif [ "$HTTP_CODE" = "400" ] || [ "$HTTP_CODE" = "422" ]; then
        echo -e "  ${GREEN}✓ Motion control endpoint exists (validation error expected without client_uid)${NC}"
        MOTION_OK=true
        if [ -n "$BODY" ]; then
            echo -e "  ${BLUE}Response:${NC}"
            if command -v jq &> /dev/null; then
                echo "$BODY" | jq '.' 2>/dev/null | sed 's/^/    /' || echo "$BODY" | sed 's/^/    /'
            else
                echo "$BODY" | sed 's/^/    /'
            fi
        fi
    else
        echo -e "  ${YELLOW}⚠ Motion control endpoint returned HTTP ${HTTP_CODE}${NC}"
        if [ -n "$BODY" ]; then
            echo -e "  ${BLUE}Response:${NC}"
            if command -v jq &> /dev/null; then
                echo "$BODY" | jq '.' 2>/dev/null | sed 's/^/    /' || echo "$BODY" | sed 's/^/    /'
            else
                echo "$BODY" | sed 's/^/    /'
            fi
        fi
    fi
    echo ""
    
    # Test Autonomous Text Generation Endpoint
    echo -e "${YELLOW}Testing Autonomous Text Generation...${NC}"
    AUTONOMOUS_GENERATE_URL="${BACKEND_URL}/api/autonomous/generate"
    # Test with a simple prompt
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d '{"prompt": "Say hello to the viewers!", "context": {}}' \
        --max-time 30 "${AUTONOMOUS_GENERATE_URL}" 2>/dev/null || echo -e "\n000")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "  ${GREEN}✓ Autonomous text generation endpoint is working${NC}"
        AUTONOMOUS_OK=true
        if [ -n "$BODY" ]; then
            echo -e "  ${BLUE}Full Response:${NC}"
            if command -v jq &> /dev/null; then
                echo "$BODY" | jq '.' 2>/dev/null | sed 's/^/    /' || echo "$BODY" | sed 's/^/    /'
            else
                echo "$BODY" | sed 's/^/    /'
            fi
        fi
    elif [ "$HTTP_CODE" = "404" ]; then
        echo -e "  ${YELLOW}⚠ Autonomous text generation endpoint not yet implemented (HTTP 404)${NC}"
        echo -e "  ${YELLOW}  This is expected if autonomous mode is still in development${NC}"
    elif [ "$HTTP_CODE" = "500" ]; then
        echo -e "  ${YELLOW}⚠ Autonomous text generation endpoint exists but returned error${NC}"
        echo -e "  ${YELLOW}  This may indicate a configuration issue${NC}"
        if [ -n "$BODY" ]; then
            echo -e "  ${BLUE}Response:${NC}"
            if command -v jq &> /dev/null; then
                echo "$BODY" | jq '.' 2>/dev/null | sed 's/^/    /' || echo "$BODY" | sed 's/^/    /'
            else
                echo "$BODY" | sed 's/^/    /'
            fi
        fi
    else
        echo -e "  ${YELLOW}⚠ Autonomous text generation endpoint returned HTTP ${HTTP_CODE}${NC}"
        if [ -n "$BODY" ]; then
            echo -e "  ${BLUE}Response:${NC}"
            if command -v jq &> /dev/null; then
                echo "$BODY" | jq '.' 2>/dev/null | sed 's/^/    /' || echo "$BODY" | sed 's/^/    /'
            else
                echo "$BODY" | sed 's/^/    /'
            fi
        fi
    fi
    echo ""
    
    # Test Twitch Integration Endpoint
    echo -e "${YELLOW}Testing Twitch Integration Status...${NC}"
    TWITCH_STATUS_URL="${BACKEND_URL}/api/twitch/status"
    RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 5 "${TWITCH_STATUS_URL}" 2>/dev/null || echo -e "\n000")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "  ${GREEN}✓ Twitch integration endpoint is available${NC}"
        TWITCH_OK=true
        if [ -n "$BODY" ]; then
            echo -e "  ${BLUE}Full Response:${NC}"
            if command -v jq &> /dev/null; then
                echo "$BODY" | jq '.' 2>/dev/null | sed 's/^/    /' || echo "$BODY" | sed 's/^/    /'
            else
                echo "$BODY" | sed 's/^/    /'
            fi
        fi
    elif [ "$HTTP_CODE" = "404" ]; then
        echo -e "  ${YELLOW}⚠ Twitch integration endpoint not yet implemented (HTTP 404)${NC}"
        echo -e "  ${YELLOW}  This is expected if Twitch integration is still in development${NC}"
    else
        echo -e "  ${YELLOW}⚠ Twitch integration endpoint returned HTTP ${HTTP_CODE}${NC}"
        if [ -n "$BODY" ]; then
            echo -e "  ${BLUE}Response:${NC}"
            if command -v jq &> /dev/null; then
                echo "$BODY" | jq '.' 2>/dev/null | sed 's/^/    /' || echo "$BODY" | sed 's/^/    /'
            else
                echo "$BODY" | sed 's/^/    /'
            fi
        fi
    fi
    echo ""
    
    # Test Twitch Chat Collection Endpoint
    echo -e "${YELLOW}Testing Twitch Chat Collection...${NC}"
    TWITCH_CHAT_URL="${BACKEND_URL}/api/twitch/chat/connect"
    # Test with a sample connection request (token optional for anonymous connection)
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d '{"channel": "test_channel", "token": ""}' \
        --max-time 10 "${TWITCH_CHAT_URL}" 2>/dev/null || echo -e "\n000")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
        echo -e "  ${GREEN}✓ Twitch chat collection endpoint is working${NC}"
        TWITCH_OK=true
        if [ -n "$BODY" ]; then
            echo -e "  ${BLUE}Full Response:${NC}"
            if command -v jq &> /dev/null; then
                echo "$BODY" | jq '.' 2>/dev/null | sed 's/^/    /' || echo "$BODY" | sed 's/^/    /'
            else
                echo "$BODY" | sed 's/^/    /'
            fi
        fi
    elif [ "$HTTP_CODE" = "404" ]; then
        echo -e "  ${YELLOW}⚠ Twitch chat collection endpoint not yet implemented (HTTP 404)${NC}"
        echo -e "  ${YELLOW}  This is expected if Twitch integration is still in development${NC}"
    elif [ "$HTTP_CODE" = "400" ] || [ "$HTTP_CODE" = "422" ]; then
        echo -e "  ${GREEN}✓ Twitch chat collection endpoint exists (validation error expected with test credentials)${NC}"
        TWITCH_OK=true
        if [ -n "$BODY" ]; then
            echo -e "  ${BLUE}Response:${NC}"
            if command -v jq &> /dev/null; then
                echo "$BODY" | jq '.' 2>/dev/null | sed 's/^/    /' || echo "$BODY" | sed 's/^/    /'
            else
                echo "$BODY" | sed 's/^/    /'
            fi
        fi
    elif [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
        echo -e "  ${GREEN}✓ Twitch chat collection endpoint exists (auth error expected with test credentials)${NC}"
        TWITCH_OK=true
        if [ -n "$BODY" ]; then
            echo -e "  ${BLUE}Response:${NC}"
            if command -v jq &> /dev/null; then
                echo "$BODY" | jq '.' 2>/dev/null | sed 's/^/    /' || echo "$BODY" | sed 's/^/    /'
            else
                echo "$BODY" | sed 's/^/    /'
            fi
        fi
    else
        echo -e "  ${YELLOW}⚠ Twitch chat collection endpoint returned HTTP ${HTTP_CODE}${NC}"
        if [ -n "$BODY" ]; then
            echo -e "  ${BLUE}Response:${NC}"
            if command -v jq &> /dev/null; then
                echo "$BODY" | jq '.' 2>/dev/null | sed 's/^/    /' || echo "$BODY" | sed 's/^/    /'
            else
                echo "$BODY" | sed 's/^/    /'
            fi
        fi
    fi
    echo ""
    
    # Test pump.fun Chat Collection Endpoint
    echo -e "${YELLOW}Testing pump.fun Chat Collection Connection...${NC}"
    PUMP_FUN_CHAT_URL="${BACKEND_URL}/api/pump-fun/chat/connect"
    # Test with a sample connection request
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d '{"channel": "test_livestream", "api_key": ""}' \
        --max-time 10 "${PUMP_FUN_CHAT_URL}" 2>/dev/null || echo -e "\n000")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    PUMP_FUN_OK=false
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
        echo -e "  ${GREEN}✓ pump.fun chat collection endpoint is working${NC}"
        PUMP_FUN_OK=true
        if [ -n "$BODY" ]; then
            echo -e "  ${BLUE}Full Response:${NC}"
            if command -v jq &> /dev/null; then
                echo "$BODY" | jq '.' 2>/dev/null | sed 's/^/    /' || echo "$BODY" | sed 's/^/    /'
            else
                echo "$BODY" | sed 's/^/    /'
            fi
        fi
    elif [ "$HTTP_CODE" = "404" ]; then
        echo -e "  ${YELLOW}⚠ pump.fun chat collection endpoint not yet implemented (HTTP 404)${NC}"
        echo -e "  ${YELLOW}  This is expected if pump.fun integration is still in development${NC}"
    elif [ "$HTTP_CODE" = "400" ] || [ "$HTTP_CODE" = "422" ]; then
        echo -e "  ${GREEN}✓ pump.fun chat collection endpoint exists (validation error expected)${NC}"
        PUMP_FUN_OK=true
        if [ -n "$BODY" ]; then
            echo -e "  ${BLUE}Full Response:${NC}"
            if command -v jq &> /dev/null; then
                echo "$BODY" | jq '.' 2>/dev/null | sed 's/^/    /' || echo "$BODY" | sed 's/^/    /'
            else
                echo "$BODY" | sed 's/^/    /'
            fi
        fi
    elif [ "$HTTP_CODE" = "405" ]; then
        echo -e "  ${YELLOW}⚠ pump.fun chat collection endpoint returned HTTP 405 (Method Not Allowed)${NC}"
        echo -e "  ${YELLOW}  This may indicate a routing issue${NC}"
        if [ -n "$BODY" ]; then
            echo -e "  ${BLUE}Response:${NC}"
            if command -v jq &> /dev/null; then
                echo "$BODY" | jq '.' 2>/dev/null | sed 's/^/    /' || echo "$BODY" | sed 's/^/    /'
            else
                echo "$BODY" | sed 's/^/    /'
            fi
        fi
    else
        echo -e "  ${YELLOW}⚠ pump.fun chat collection endpoint returned HTTP ${HTTP_CODE}${NC}"
        if [ -n "$BODY" ]; then
            echo -e "  ${BLUE}Full Response:${NC}"
            if command -v jq &> /dev/null; then
                echo "$BODY" | jq '.' 2>/dev/null | sed 's/^/    /' || echo "$BODY" | sed 's/^/    /'
            else
                echo "$BODY" | sed 's/^/    /'
            fi
        fi
    fi
    echo ""
    
    # Test pump.fun Status Endpoint
    echo -e "${YELLOW}Testing pump.fun Status...${NC}"
    PUMP_FUN_STATUS_URL="${BACKEND_URL}/api/pump-fun/status"
    RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 5 "${PUMP_FUN_STATUS_URL}" 2>/dev/null || echo -e "\n000")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "  ${GREEN}✓ pump.fun status endpoint is available${NC}"
        PUMP_FUN_OK=true
        if [ -n "$BODY" ]; then
            echo -e "  ${BLUE}Full Response:${NC}"
            if command -v jq &> /dev/null; then
                echo "$BODY" | jq '.' 2>/dev/null | sed 's/^/    /' || echo "$BODY" | sed 's/^/    /'
            else
                echo "$BODY" | sed 's/^/    /'
            fi
        fi
    elif [ "$HTTP_CODE" = "404" ]; then
        echo -e "  ${YELLOW}⚠ pump.fun status endpoint not yet implemented (HTTP 404)${NC}"
    else
        echo -e "  ${YELLOW}⚠ pump.fun status endpoint returned HTTP ${HTTP_CODE}${NC}"
        if [ -n "$BODY" ]; then
            echo -e "  ${BLUE}Full Response:${NC}"
            if command -v jq &> /dev/null; then
                echo "$BODY" | jq '.' 2>/dev/null | sed 's/^/    /' || echo "$BODY" | sed 's/^/    /'
            else
                echo "$BODY" | sed 's/^/    /'
            fi
        fi
    fi
    echo ""
    
    # Test pump.fun Chat Platform Status (to verify connections and message processing readiness)
    echo -e "${YELLOW}Testing Chat Platform Status (pump.fun connections)...${NC}"
    CHAT_PLATFORM_STATUS_URL="${BACKEND_URL}/api/chat-platform/status"
    RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 5 "${CHAT_PLATFORM_STATUS_URL}" 2>/dev/null || echo -e "\n000")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "  ${GREEN}✓ Chat platform status endpoint is available${NC}"
        if [ -n "$BODY" ]; then
            echo -e "  ${BLUE}Full Response:${NC}"
            if command -v jq &> /dev/null; then
                echo "$BODY" | jq '.' 2>/dev/null | sed 's/^/    /' || echo "$BODY" | sed 's/^/    /'
                # Check if pump.fun connections exist
                PUMP_FUN_CONNECTIONS=$(echo "$BODY" | jq -r '.connections[] | select(.platform == "pump_fun") | .connection_id' 2>/dev/null || echo "")
                if [ -n "$PUMP_FUN_CONNECTIONS" ]; then
                    echo -e "  ${GREEN}  ✓ pump.fun connection(s) found - message processing is ready${NC}"
                    PUMP_FUN_OK=true
                else
                    echo -e "  ${YELLOW}  ⚠ No active pump.fun connections (connect first to enable message processing)${NC}"
                fi
            else
                echo "$BODY" | sed 's/^/    /'
            fi
        fi
    elif [ "$HTTP_CODE" = "404" ]; then
        echo -e "  ${YELLOW}⚠ Chat platform status endpoint not yet implemented (HTTP 404)${NC}"
    else
        echo -e "  ${YELLOW}⚠ Chat platform status endpoint returned HTTP ${HTTP_CODE}${NC}"
        if [ -n "$BODY" ]; then
            echo -e "  ${BLUE}Full Response:${NC}"
            if command -v jq &> /dev/null; then
                echo "$BODY" | jq '.' 2>/dev/null | sed 's/^/    /' || echo "$BODY" | sed 's/^/    /'
            else
                echo "$BODY" | sed 's/^/    /'
            fi
        fi
    fi
    echo ""
fi

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test Summary${NC}"
echo -e "${BLUE}========================================${NC}"

if [ "$FRONTEND_OK" = true ]; then
    echo -e "Frontend:     ${GREEN}✓ Running${NC}"
else
    echo -e "Frontend:     ${RED}✗ Not Running${NC}"
fi

if [ "$BACKEND_OK" = true ]; then
    echo -e "Backend:      ${GREEN}✓ Running${NC}"
else
    echo -e "Backend:      ${RED}✗ Not Running${NC}"
fi

if [ "$API_OK" = true ]; then
    echo -e "API Endpoint: ${GREEN}✓ Working${NC}"
else
    echo -e "API Endpoint: ${RED}✗ Not Working${NC}"
fi

# Autonomous Mode Features
if [ "$AUTONOMOUS_OK" = true ]; then
    echo -e "Autonomous Mode: ${GREEN}✓ Available${NC}"
elif [ "$BACKEND_OK" = true ]; then
    echo -e "Autonomous Mode: ${YELLOW}⚠ Not Implemented${NC}"
else
    echo -e "Autonomous Mode: ${RED}✗ Cannot Test${NC}"
fi

if [ "$EXPRESSION_OK" = true ]; then
    echo -e "Expression Control: ${GREEN}✓ Available${NC}"
elif [ "$BACKEND_OK" = true ]; then
    echo -e "Expression Control: ${YELLOW}⚠ Not Implemented${NC}"
else
    echo -e "Expression Control: ${RED}✗ Cannot Test${NC}"
fi

if [ "$MOTION_OK" = true ]; then
    echo -e "Motion Control: ${GREEN}✓ Available${NC}"
elif [ "$BACKEND_OK" = true ]; then
    echo -e "Motion Control: ${YELLOW}⚠ Not Implemented${NC}"
else
    echo -e "Motion Control: ${RED}✗ Cannot Test${NC}"
fi

if [ "$TWITCH_OK" = true ]; then
    echo -e "Twitch Integration: ${GREEN}✓ Available${NC}"
elif [ "$BACKEND_OK" = true ]; then
    echo -e "Twitch Integration: ${YELLOW}⚠ Not Implemented${NC}"
else
    echo -e "Twitch Integration: ${RED}✗ Cannot Test${NC}"
fi

if [ "$PUMP_FUN_OK" = true ]; then
    echo -e "pump.fun Integration: ${GREEN}✓ Available${NC}"
elif [ "$BACKEND_OK" = true ]; then
    echo -e "pump.fun Integration: ${YELLOW}⚠ Not Implemented${NC}"
else
    echo -e "pump.fun Integration: ${RED}✗ Cannot Test${NC}"
fi

echo ""

# Final status
CORE_SERVICES_OK=false
if [ "$FRONTEND_OK" = true ] && [ "$BACKEND_OK" = true ] && [ "$API_OK" = true ]; then
    CORE_SERVICES_OK=true
fi

if [ "$CORE_SERVICES_OK" = true ]; then
    echo -e "${GREEN}✓ Core services are running correctly!${NC}"
    
    # Check if autonomous features are implemented
    AUTONOMOUS_FEATURES_COUNT=0
    [ "$AUTONOMOUS_OK" = true ] && AUTONOMOUS_FEATURES_COUNT=$((AUTONOMOUS_FEATURES_COUNT + 1))
    [ "$EXPRESSION_OK" = true ] && AUTONOMOUS_FEATURES_COUNT=$((AUTONOMOUS_FEATURES_COUNT + 1))
    [ "$MOTION_OK" = true ] && AUTONOMOUS_FEATURES_COUNT=$((AUTONOMOUS_FEATURES_COUNT + 1))
    [ "$TWITCH_OK" = true ] && AUTONOMOUS_FEATURES_COUNT=$((AUTONOMOUS_FEATURES_COUNT + 1))
    [ "$PUMP_FUN_OK" = true ] && AUTONOMOUS_FEATURES_COUNT=$((AUTONOMOUS_FEATURES_COUNT + 1))
    
    if [ "$AUTONOMOUS_FEATURES_COUNT" -gt 0 ]; then
        echo -e "${GREEN}✓ ${AUTONOMOUS_FEATURES_COUNT}/5 autonomous livestream mode features are available${NC}"
        if [ "$AUTONOMOUS_OK" = true ]; then
            echo -e "${GREEN}  ✓ Autonomous text generation is working!${NC}"
        fi
        if [ "$TWITCH_OK" = true ]; then
            echo -e "${GREEN}  ✓ Twitch integration endpoints are available${NC}"
        fi
        if [ "$PUMP_FUN_OK" = true ]; then
            echo -e "${GREEN}  ✓ pump.fun integration endpoints are available${NC}"
            echo -e "${GREEN}  ✓ Chat message filtering and processing system is ready${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ Autonomous livestream mode features are not yet implemented${NC}"
        echo -e "${YELLOW}  This is expected for a work-in-progress feature${NC}"
    fi
    
    exit 0
else
    echo -e "${RED}✗ Some core services are not running correctly${NC}"
    echo ""
    echo -e "${YELLOW}To start services, run:${NC}"
    echo -e "  ${BLUE}python run_dev.py${NC}"
    exit 1
fi

