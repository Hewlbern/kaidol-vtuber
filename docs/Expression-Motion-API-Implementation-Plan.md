# Expression and Motion REST API Implementation Plan

## Overview

This document outlines 5 different approaches for implementing REST API endpoints for expression and motion control, analyzes each approach, and selects the best option for implementation.

## Current State

- ✅ WebSocket handlers for `expression-command` and `motion-command` exist
- ✅ Backend adapter pattern is implemented (`OrphiqAdapter`)
- ✅ WebSocketHandler manages client adapters
- ❌ REST API endpoints `/api/expression` and `/api/motion` are missing
- ❌ Test script expects these endpoints to exist

## Requirements

1. **REST API Endpoints**:
   - `POST /api/expression` - Set character expression
   - `POST /api/motion` - Trigger character motion

2. **Functionality**:
   - Accept JSON request body with parameters
   - Use existing adapter system (same as WebSocket)
   - Send commands to WebSocket clients
   - Return appropriate HTTP responses

3. **Client Management**:
   - Handle `client_uid` from header or request body
   - Support default client if no `client_uid` provided
   - Reuse existing adapter instances

## 5 Implementation Approaches

### Approach 1: Shared WebSocketHandler Instance

**Description**: Create a global/singleton WebSocketHandler instance that both WebSocket and REST routes can access.

**Implementation**:
```python
# In routes.py
_global_ws_handler: Optional[WebSocketHandler] = None

def get_ws_handler(default_context_cache: ServiceContext) -> WebSocketHandler:
    global _global_ws_handler
    if _global_ws_handler is None:
        _global_ws_handler = WebSocketHandler(default_context_cache)
    return _global_ws_handler

def init_client_ws_route(default_context_cache: ServiceContext):
    ws_handler = get_ws_handler(default_context_cache)
    # ... rest of implementation

def init_webtool_routes(default_context_cache: ServiceContext):
    ws_handler = get_ws_handler(default_context_cache)
    # ... REST endpoints can use ws_handler
```

**Pros**:
- ✅ Single source of truth for client state
- ✅ Reuses existing adapter instances
- ✅ Consistent with WebSocket behavior
- ✅ Simple to implement

**Cons**:
- ⚠️ Global state (but manageable)
- ⚠️ Need to ensure initialization order

**Risk Level**: Low

---

### Approach 2: Pass WebSocketHandler to Both Route Initializers

**Description**: Create WebSocketHandler in server.py and pass it to both route initializers.

**Implementation**:
```python
# In server.py
default_context_cache = ServiceContext()
default_context_cache.load_from_config(config)
ws_handler = WebSocketHandler(default_context_cache)

self.app.include_router(
    init_client_ws_route(default_context_cache, ws_handler),
)
self.app.include_router(
    init_webtool_routes(default_context_cache, ws_handler),
)

# In routes.py
def init_client_ws_route(default_context_cache, ws_handler):
    # Use passed ws_handler

def init_webtool_routes(default_context_cache, ws_handler):
    # Use passed ws_handler for REST endpoints
```

**Pros**:
- ✅ Explicit dependency injection
- ✅ No global state
- ✅ Clear initialization order
- ✅ Easy to test

**Cons**:
- ⚠️ Requires changing function signatures
- ⚠️ More parameters to pass around

**Risk Level**: Low-Medium

---

### Approach 3: Separate Adapter Manager

**Description**: Extract adapter management into a separate class that both WebSocketHandler and REST routes can use.

**Implementation**:
```python
# New file: adapter_manager.py
class AdapterManager:
    def __init__(self, default_context_cache: ServiceContext):
        self.default_context_cache = default_context_cache
        self.client_adapters: Dict[str, BackendAdapter] = {}
        self.backend_modes: Dict[str, str] = {}
        self.client_contexts: Dict[str, ServiceContext] = {}
    
    def get_adapter(self, client_uid: str) -> BackendAdapter:
        # ... adapter creation logic

# In routes.py
adapter_manager = AdapterManager(default_context_cache)

# Both WebSocketHandler and REST routes use adapter_manager
```

**Pros**:
- ✅ Clean separation of concerns
- ✅ Reusable across different interfaces
- ✅ Easy to extend

**Cons**:
- ⚠️ Requires refactoring existing code
- ⚠️ More complex initial implementation
- ⚠️ May duplicate some WebSocketHandler logic

**Risk Level**: Medium

---

### Approach 4: Direct ServiceContext Access

**Description**: REST endpoints create their own adapter instances directly from ServiceContext, bypassing WebSocketHandler.

**Implementation**:
```python
# In routes.py
@router.post("/api/expression")
async def set_expression_endpoint(
    request: ExpressionRequest,
    default_context_cache: ServiceContext = Depends(get_default_context)
):
    # Create adapter directly
    adapter = OrphiqAdapter(
        service_context=default_context_cache,
        websocket_send=create_websocket_sender(client_uid)
    )
    result = await adapter.trigger_expression(...)
    # Send to WebSocket clients manually
```

**Pros**:
- ✅ No dependency on WebSocketHandler
- ✅ Simple REST-only implementation

**Cons**:
- ❌ Duplicates adapter creation logic
- ❌ Doesn't reuse existing adapter instances
- ❌ Separate state from WebSocket clients
- ❌ Need to manually broadcast to WebSocket clients

**Risk Level**: Medium-High

---

### Approach 5: Hybrid: REST Endpoints with WebSocket Broadcast

**Description**: REST endpoints create temporary adapters but broadcast results to all WebSocket clients.

**Implementation**:
```python
# In routes.py
@router.post("/api/expression")
async def set_expression_endpoint(
    request: ExpressionRequest,
    default_context_cache: ServiceContext = Depends(get_default_context)
):
    # Create temporary adapter
    adapter = OrphiqAdapter(...)
    result = await adapter.trigger_expression(...)
    
    # Broadcast to all WebSocket clients
    for client_uid, websocket in ws_handler.client_connections.items():
        await websocket.send_text(json.dumps({
            "type": "expression-update",
            "expression_id": request.expressionId,
            "result": result
        }))
```

**Pros**:
- ✅ REST and WebSocket can work independently
- ✅ Can broadcast to all clients

**Cons**:
- ❌ Doesn't reuse adapter instances
- ❌ Complex broadcast logic
- ❌ May cause duplicate messages

**Risk Level**: Medium

---

## Comparison Matrix

| Approach | Complexity | Reusability | State Management | Testability | Risk |
|----------|-----------|-------------|------------------|-------------|------|
| 1. Shared Handler | Low | High | Good | Medium | Low |
| 2. Pass Handler | Low | High | Excellent | High | Low |
| 3. Adapter Manager | Medium | Very High | Excellent | High | Medium |
| 4. Direct Access | Low | Low | Poor | Medium | Medium-High |
| 5. Hybrid | Medium | Medium | Medium | Medium | Medium |

## Selected Approach: **Approach 2 - Pass WebSocketHandler**

### Rationale

1. **Explicit Dependencies**: Clear, testable, no hidden global state
2. **Reuses Existing Logic**: WebSocketHandler already manages adapters correctly
3. **Consistent State**: Same adapter instances for WebSocket and REST
4. **Low Risk**: Minimal changes, easy to roll back
5. **Future-Proof**: Easy to extend for additional REST endpoints

### Implementation Details

#### Step 1: Modify Route Initializers

**File**: `backend/src/open_llm_vtuber/routes.py`

```python
def init_client_ws_route(
    default_context_cache: ServiceContext,
    ws_handler: Optional[WebSocketHandler] = None
) -> APIRouter:
    """Create WebSocket route with optional handler"""
    router = APIRouter()
    
    if ws_handler is None:
        ws_handler = WebSocketHandler(default_context_cache)
    
    # ... existing WebSocket endpoint code ...
    
    return router

def init_webtool_routes(
    default_context_cache: ServiceContext,
    ws_handler: Optional[WebSocketHandler] = None
) -> APIRouter:
    """Create REST API routes with optional WebSocket handler"""
    router = APIRouter()
    
    if ws_handler is None:
        ws_handler = WebSocketHandler(default_context_cache)
    
    # ... existing REST endpoints ...
    
    # NEW: Expression and Motion endpoints
    @router.post("/api/expression")
    async def set_expression_endpoint(request: ExpressionRequest):
        # Implementation here
        pass
    
    @router.post("/api/motion")
    async def trigger_motion_endpoint(request: MotionRequest):
        # Implementation here
        pass
    
    return router
```

#### Step 2: Update Server Initialization

**File**: `backend/src/open_llm_vtuber/server.py`

```python
# Create shared WebSocketHandler
default_context_cache = ServiceContext()
default_context_cache.load_from_config(config)
ws_handler = WebSocketHandler(default_context_cache)

# Pass to both route initializers
self.app.include_router(
    init_client_ws_route(
        default_context_cache=default_context_cache,
        ws_handler=ws_handler
    ),
)
self.app.include_router(
    init_webtool_routes(
        default_context_cache=default_context_cache,
        ws_handler=ws_handler
    ),
)
```

#### Step 3: Implement REST Endpoints

**Request Models**:
```python
class ExpressionRequest(BaseModel):
    expressionId: int
    duration: Optional[int] = 0
    priority: Optional[int] = 0
    client_uid: Optional[str] = None

class MotionRequest(BaseModel):
    motionGroup: str
    motionIndex: int
    loop: Optional[bool] = False
    priority: Optional[int] = 0
    client_uid: Optional[str] = None
```

**Endpoint Implementation**:
```python
@router.post("/api/expression")
async def set_expression_endpoint(
    request: ExpressionRequest,
    x_client_uid: Optional[str] = Header(None, alias="X-Client-UID")
):
    """Set character expression via REST API"""
    client_uid = request.client_uid or x_client_uid or "default"
    
    try:
        # Get or create adapter
        adapter = ws_handler._get_adapter(client_uid)
        
        # Trigger expression
        result = await adapter.trigger_expression(
            expression_id=request.expressionId,
            duration=request.duration,
            priority=request.priority
        )
        
        return {
            "status": "success",
            "expression_id": request.expressionId,
            "result": result
        }
    except Exception as e:
        logger.error(f"Error setting expression: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

## Implementation Steps

1. ✅ Create implementation plan (this document)
2. ⏳ Modify `init_client_ws_route` to accept optional `ws_handler`
3. ⏳ Modify `init_webtool_routes` to accept optional `ws_handler`
4. ⏳ Update `server.py` to create and pass shared `ws_handler`
5. ⏳ Create Pydantic request models (`ExpressionRequest`, `MotionRequest`)
6. ⏳ Implement `POST /api/expression` endpoint
7. ⏳ Implement `POST /api/motion` endpoint
8. ⏳ Add error handling and validation
9. ⏳ Test with `test_services.sh` script
10. ⏳ Verify WebSocket integration still works

## Testing Strategy

### Manual Testing

1. **Test Expression Endpoint**:
```bash
curl -X POST http://localhost:12393/api/expression \
  -H "Content-Type: application/json" \
  -H "X-Client-UID: test-client" \
  -d '{"expressionId": 3, "duration": 5000, "priority": 10}'
```

2. **Test Motion Endpoint**:
```bash
curl -X POST http://localhost:12393/api/motion \
  -H "Content-Type: application/json" \
  -H "X-Client-UID: test-client" \
  -d '{"motionGroup": "idle", "motionIndex": 0, "loop": false, "priority": 5}'
```

### Automated Testing

Run the existing test script:
```bash
./test_services.sh
```

Expected results:
- ✅ Expression Control: Available
- ✅ Motion Control: Available

## Error Handling

1. **Missing Parameters**: Return 400 Bad Request
2. **Invalid Expression ID**: Return 400 with error message
3. **Invalid Motion Group**: Return 400 with error message
4. **Adapter Creation Failure**: Return 500 Internal Server Error
5. **WebSocket Send Failure**: Log error but return success (command was processed)

## Success Criteria

- ✅ `POST /api/expression` returns 200/201 with valid request
- ✅ `POST /api/motion` returns 200/201 with valid request
- ✅ Commands are sent to WebSocket clients
- ✅ Test script shows endpoints as "Available"
- ✅ Existing WebSocket functionality unchanged
- ✅ No breaking changes to existing code

## Future Enhancements

1. **Priority Queue**: Implement expression/motion priority system
2. **Duration Management**: Automatic expiration of timed expressions
3. **Batch Operations**: Support multiple expressions/motions in one request
4. **Status Endpoints**: `GET /api/expression/status`, `GET /api/motion/status`
5. **WebSocket Broadcast**: Option to broadcast to all clients or specific client

## Notes

- The `client_uid` can come from header (`X-Client-UID`) or request body
- If no `client_uid` is provided, use "default" as fallback
- REST endpoints reuse the same adapter instances as WebSocket
- Commands sent via REST will trigger WebSocket messages to clients

