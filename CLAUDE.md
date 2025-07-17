# CLAUDE.md - Snake Town Development Documentation

This document provides comprehensive information for Claude Code to understand the Snake Town multiplayer game codebase, its architecture, and development context.

## Project Overview

**Snake Town** is a real-time multiplayer snake game built with WebSocket technology. Players control snakes in a shared arena, competing through size-based combat, special abilities, and environmental interactions.

### Key Technologies
- **Backend**: Node.js with WebSocket Server (`ws` library)
- **Frontend**: Vanilla JavaScript with Canvas 2D rendering
- **Architecture**: Client-server with authoritative server and client-side prediction
- **Real-time Communication**: WebSocket protocol for low-latency multiplayer

## File Structure

```
D:\dev\claude\thegame\
├── server.js          # WebSocket server and game logic
├── game.js            # Client-side game engine and rendering
├── index.html         # Main game interface and UI
├── package.json       # Dependencies and scripts
├── README.md          # User documentation
└── CLAUDE.md          # This development documentation
```

## Core Architecture

### Server-Side (server.js)

**Class: SnakeServer**
- Manages WebSocket connections and HTTP file serving
- Runs authoritative game simulation at 60 FPS
- Broadcasts world state to clients at 30 FPS
- Handles player connections, movement, abilities, and collision detection

**Key Server Methods:**
- `updateGame()` - Main game loop with collision detection and physics
- `broadcastUpdates()` - Sends world state to all clients
- `handleMessage()` - Processes client input (movement, abilities)
- `spawnFood/Hazards/Objects()` - World generation and management
- `playerEatsPlayer()` - Size-based combat mechanics

**Server Game State:**
```javascript
this.players = new Map();           // All connected players
this.worldSize = 5000;              // World boundaries (5000x5000)
this.food = [];                     // Food items for growth
this.hazards = [];                  // Environmental dangers
this.interactiveObjects = [];       // Portals, bounce pads, etc.
this.bullets = [];                  // Player projectiles
```

### Client-Side (game.js)

**Class: MultiplayerSnakeGame**
- Handles user input and local prediction
- Renders game world with smooth interpolation
- Manages UI, camera, and visual effects
- Communicates with server via WebSocket

**Key Client Methods:**
- `updateSnake()` - Local movement with physics deceleration
- `render()` - Main rendering loop with camera and zoom
- `getInterpolatedPlayer()` - Smooth movement interpolation
- `handleMessage()` - Process server updates and sync game state
- `updateCamera()` - Smooth camera following with lerp

**Client Rendering Pipeline:**
1. Clear canvas and apply camera transform
2. Draw world grid and borders
3. Render all game elements (food, hazards, objects)
4. Draw interpolated players with smooth movement
5. Apply visual effects and particles
6. Update UI elements and ability cooldowns

### User Interface (index.html)

**Responsive Design:**
- Desktop: Full leaderboard, instructions, and ability bar
- Mobile: Compact UI with user score widget only
- Adaptive ability buttons and zoom controls

**UI Components:**
- Real-time leaderboard with player rankings
- Ability bar with cooldown timers and visual feedback
- Game over modal with detailed statistics
- Connection status and instruction panels

## Game Mechanics

### Movement System
**Physics-Based Movement:**
- Click/touch to set target position
- Snake moves toward target with velocity
- Deceleration when input released (physics-like)
- Bouncing off world boundaries with realistic physics

**Network Synchronization:**
- Client sends target position to server
- Server validates and simulates authoritative movement
- Client interpolates between server updates for smooth visuals
- 30 FPS network updates interpolated to 60 FPS display

### Combat System
**Size-Based Combat:**
```javascript
// Combat resolution logic
if (playerSize > otherPlayerSize) {
    this.playerEatsPlayer(player, otherPlayer);
} else if (otherPlayerSize > playerSize) {
    this.playerEatsPlayer(otherPlayer, player);
} else {
    // Equal size - both die
    this.killPlayer(player);
    this.killPlayer(otherPlayer);
}
```

**Growth Mechanics:**
- Eating food increases snake length and score
- Player size determines combat outcomes
- Growth queue system for smooth segment addition

### Ability System
**Four Special Abilities:**
1. **Dash (⚡)** - 1s cooldown, 200px instant teleport
2. **Bullets (🔫)** - 8s cooldown, projectile attack
3. **Magnet (🧲)** - 8s cooldown, 500px radius food attraction
4. **Shield (🛡️)** - 8s cooldown, temporary invincibility

**Ability Implementation:**
- Server-side validation and timing
- Client-side cooldown UI and input handling
- Network synchronization of ability states

### World Elements

**Food System:**
- Random spawn locations throughout world
- Provides growth and score increase
- Respawns automatically to maintain density

**Environmental Hazards:**
- **Moving Walls**: 60x600px obstacles with physics
- **Poison Zones**: Circular damage areas
- **Speed Traps**: Temporary movement reduction (10s duration)
- **Teleporters**: Random position transport

**Interactive Objects:**
- **Portals**: Linked teleportation pairs
- **Bounce Pads**: Launch players in random directions
- **Checkpoints/Treasures**: Score bonuses with cooldowns

## Network Protocol

### Message Types
```javascript
// Client to Server
'join'         - Initial connection
'updateTarget' - Movement commands
'ability'      - Special ability activation
'respawn'      - Restart after death

// Server to Client
'gameUpdate'   - World state synchronization
'playerJoined' - New player notification
'playerLeft'   - Player disconnect notification
'gameOver'     - Death notification with stats
```

### Data Optimization
- 30 FPS network updates vs 60 FPS game logic
- Efficient serialization of world state
- Delta compression for movement data
- Culling of out-of-range elements

## Performance Optimizations

### Client-Side
- **Interpolation**: Smooth 60 FPS rendering from 30 FPS network data
- **Culling**: Only render visible elements based on camera view
- **Canvas Optimization**: Efficient drawing and transform management
- **Memory Management**: Proper cleanup of particles and effects

### Server-Side
- **Spatial Optimization**: Efficient collision detection algorithms
- **Update Frequency**: Separate game logic (60 FPS) and network (30 FPS)
- **Connection Management**: Proper WebSocket lifecycle handling
- **World State**: Optimized data structures for fast access

## Development Context

### Code Evolution
This codebase evolved from a single-player chain reaction game through multiple iterations:
1. Single-player snake game with basic mechanics
2. Addition of special abilities and world elements
3. Conversion to multiplayer with WebSocket architecture
4. Performance optimizations and smooth interpolation
5. UI improvements and mobile responsiveness

### Key Technical Decisions
- **Authoritative Server**: Prevents cheating, ensures fair gameplay
- **Client Prediction**: Immediate response to user input
- **Interpolation System**: Smooth visuals despite network limitations
- **Physics Deceleration**: Natural-feeling movement mechanics

### Mobile Optimization
- Touch input handling with gesture support
- Responsive UI that adapts to screen size
- Performance considerations for mobile devices
- Simplified controls and interface elements

## Testing and Debugging

### Server Testing
```bash
npm start  # Starts server on port 3000
```

### Client Debugging
- Browser DevTools for network inspection
- Canvas performance monitoring
- WebSocket connection status tracking
- Real-time performance metrics

### Common Issues
- **Network Latency**: Affects interpolation quality
- **Connection Drops**: Players removed on disconnect
- **Mobile Performance**: Varies by device capabilities
- **Collision Edge Cases**: Complex multi-player interactions

## Configuration Options

### Server Configuration
```javascript
// World settings
this.worldSize = 5000;              // Play area size
this.maxFood = 20;                  // Food density
this.maxBonusBoxes = 8;            // Bonus item count

// Network settings
gameUpdateInterval = 1000/60;       // 60 FPS game logic
broadcastInterval = 1000/30;        // 30 FPS network updates

// Ability cooldowns
dash: 1000ms                        // 1 second
bullets: 8000ms                     // 8 seconds
magnet: 8000ms                      // 8 seconds
shield: 8000ms                      // 8 seconds
```

### Client Configuration
```javascript
// Rendering settings
this.minZoom = 0.25;               // Minimum zoom level
this.maxZoom = 5;                  // Maximum zoom level
interpolationTime = 33;             // 33ms (30 FPS)

// Physics settings
this.snake.speed = 8;              // Movement speed
this.snake.deceleration = 0.08;    // Deceleration rate
```

## Future Development

### Planned Features
- Player customization (names, colors)
- Additional game modes and arenas
- Enhanced visual effects and animations
- Statistics tracking and achievements
- Spectator mode and replay system

### Technical Improvements
- WebGL rendering for better performance
- Server clustering for scalability
- Better mobile optimization
- Progressive loading and caching

### Code Quality
- TypeScript migration for better type safety
- Unit testing for game logic
- Performance profiling and optimization
- Documentation improvements

## Development Tips

### Adding New Features
1. Implement server-side logic first (authoritative)
2. Add client-side rendering and UI
3. Test network synchronization thoroughly
4. Consider mobile compatibility
5. Update this documentation

### Debugging Network Issues
- Monitor WebSocket messages in DevTools
- Check server console for connection errors
- Verify message serialization/deserialization
- Test with simulated network latency

### Performance Optimization
- Profile rendering performance with DevTools
- Monitor memory usage and garbage collection
- Optimize collision detection algorithms
- Consider spatial partitioning for large player counts

---

This documentation provides Claude Code with comprehensive understanding of the Snake Town codebase, enabling effective development, debugging, and feature enhancement.