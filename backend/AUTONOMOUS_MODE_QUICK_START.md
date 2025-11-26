# Autonomous Mode Quick Start

## Important: Restart Required

After making changes to the autonomous mode code, **you must restart the server** for the changes to take effect.

## Restarting the Server

1. Stop the current server (Ctrl+C in the terminal where it's running)
2. Start it again:
   ```bash
   cd backend
   python run_server.py
   # or
   uv run run_server.py
   ```

## Verifying the New Routes Work

After restarting, test the endpoints:

### 1. Check Status (should return new format)
```bash
curl http://localhost:12393/api/autonomous/status
```

Expected response should include:
- `autonomous_generator_enabled`
- `autonomous_generator_interval`
- `auto_responses_enabled`

### 2. Test Control Endpoint
```bash
curl -X POST http://localhost:12393/api/autonomous/control \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

Should return:
```json
{
  "status": "success",
  "enabled": false
}
```

## Troubleshooting

If you still get "Method Not Allowed" after restarting:

1. **Check server logs** - Look for any errors during startup
2. **Verify route registration** - Check that the route is being included:
   ```python
   # In server.py, should have:
   self.app.include_router(
       init_webtool_routes(
           default_context_cache=default_context_cache,
           ws_handler=ws_handler,
           autonomous_generator=self.autonomous_generator
       ),
   )
   ```
3. **Check for route conflicts** - Make sure no other route is using `/api/autonomous/control`

## Current Status

- ⚠️ Autonomous mode is **disabled by default** - must be activated
- ✅ Automatic responses work immediately (no restart needed for this)
- ⚠️ Random message generator is disabled until activated
- ✅ Control endpoint available at `/api/autonomous/control`

## Activating Autonomous Mode

After restarting the server, activate autonomous mode:

```bash
curl -X POST http://localhost:12393/api/autonomous/control \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

This will start generating random messages at random intervals between 2-4 minutes (120-240 seconds).

