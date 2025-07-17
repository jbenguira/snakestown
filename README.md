# 🐍 Snake Town - Multiplayer Arena

A fast-paced, real-time multiplayer snake game where players compete in an arena filled with food, power-ups, hazards, and interactive elements. Grow your snake, use special abilities, and dominate the leaderboard!

## 🎮 Live Demo

**Play now:** [https://snaketown-u3.vm.elestio.app/](https://snaketown-u3.vm.elestio.app/)

Experience the multiplayer action live! No installation required - just open the link and start playing immediately.


## 🎮 Game Features

### Core Gameplay
- **Multiplayer Combat**: Real-time battles with other players
- **Size-Based Combat**: Bigger snakes can eat smaller ones
- **Smooth Physics**: Deceleration-based movement with bouncing boundaries
- **Growth System**: Eat food to grow longer and increase your score

### Special Abilities
- **⚡ Dash** (1s cooldown): Instantly teleport 200 pixels forward
- **🔫 Bullets** (8s cooldown): Shoot projectiles to eliminate enemies
- **🧲 Magnet** (8s cooldown): Attract food and bonuses from 500px radius
- **🛡️ Shield** (8s cooldown): Temporary invincibility

### World Elements
- **🍎 Food**: Basic growth and score increase
- **📦 Bonus Boxes**: Speed boosts, growth bonuses, and special effects
- **☠️ Malus Boxes**: Speed reduction and shrinking penalties
- **🌀 Portals**: Teleport between linked portal pairs
- **🏃 Bounce Pads**: Launch your snake in random directions
- **💎 Checkpoints & Treasures**: Score bonuses with interaction cooldowns

### Environmental Hazards
- **Moving Walls**: Large 60x600px obstacles moving at high speed
- **Poison Zones**: Circular areas that damage your snake
- **Speed Traps**: Slow your snake for 10 seconds
- **Teleporters**: Random teleportation zones

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm
- Minimum 2 CPU cores recommended for production

### Installation
```bash
# Clone the repository
git clone <repository-url>
cd thegame

# Install dependencies
npm install

# Development (single process)
npm run dev

# Production (multi-process cluster)
npm run cluster
```

### Deployment Options

#### Development Mode
```bash
npm run dev
# Single process - good for development and testing
# Handles ~150 concurrent users
```

#### Production Mode
```bash
npm run cluster
# Multi-process cluster using all CPU cores
# Handles 400-1200+ concurrent users depending on hardware
```

#### Advanced Load Balancing
```bash
# Install additional dependency for advanced load balancing
npm install http-proxy-middleware

# Start load balancer (optional for high-scale deployments)
node loadbalancer.js
```

### Playing the Game
1. Open your browser and navigate to `http://localhost:3000`
2. The game starts automatically when you connect
3. **Click and hold** to move your snake toward your cursor
4. **Release** to let your snake decelerate naturally
5. Use **mouse wheel** or **pinch** to zoom in/out
6. Press **1-4** or click ability buttons to use special powers

## 🎯 Controls

### Desktop
- **Mouse**: Click and hold to move, release to decelerate
- **Mouse Wheel**: Zoom in/out
- **1-4 Keys**: Activate abilities (Dash, Bullets, Magnet, Shield)

### Mobile
- **Touch**: Tap and hold to move, release to decelerate
- **Pinch**: Zoom in/out
- **Touch Ability Buttons**: Activate special powers

## 🏗️ Architecture

### Server Architecture
- **WebSocket Server**: Real-time communication using `ws` library
- **Authoritative Server**: Server validates all game logic
- **60 FPS Game Loop**: High-frequency game state updates
- **30 FPS Network Updates**: Optimized network bandwidth
- **Collision Detection**: Comprehensive collision system for all interactions

### Client Architecture
- **Canvas Rendering**: High-performance 2D graphics
- **Client-Side Prediction**: Immediate input response
- **Smooth Interpolation**: 30 FPS server data interpolated to 60 FPS display
- **Velocity-Based Prediction**: Advanced movement prediction
- **Responsive Design**: Mobile and desktop optimized

### Network Features
- **Client-Side Interpolation**: Smooth movement despite network updates
- **Lag Compensation**: Predictive movement for responsiveness
- **Bandwidth Optimization**: Efficient data transmission
- **Connection Status**: Real-time connection monitoring

## 🎨 UI Features

### Responsive Design
- **Desktop**: Full leaderboard and instructions visible
- **Mobile**: Compact UI with user score widget, hidden instructions

### Visual Elements
- **Dynamic Labels**: All game elements have descriptive labels
- **Particle Effects**: Visual feedback for interactions
- **Smooth Animations**: Interpolated movement and effects
- **Ability Cooldown UI**: Visual cooldown timers and indicators

### Game Over System
- **Detailed Stats**: Final score, length, food eaten, survival time
- **Full Leaderboard**: Complete player rankings in game over modal
- **Restart Functionality**: Quick game restart capability

## ⚙️ Configuration

### Server Settings
```javascript
// In server.js
this.worldSize = 5000;          // World boundaries
gameUpdateInterval = 60 FPS;     // Server logic frequency
broadcastInterval = 30 FPS;      // Network update frequency
```

### Game Balance
```javascript
// Ability Cooldowns
dash: 1000ms        // 1 second
bullets: 8000ms     // 8 seconds  
magnet: 8000ms      // 8 seconds
shield: 8000ms      // 8 seconds

// Magnet Properties
range: 500px        // Attraction radius
force: up to 12     // Attraction strength
```

## 🔧 Technical Details

### Multi-Process Architecture
Snake Town uses Node.js clustering for horizontal scaling:

- **Master Process**: Manages worker processes and handles crashes
- **Worker Processes**: Independent game servers sharing the same port
- **Automatic Load Balancing**: OS-level connection distribution
- **Fault Tolerance**: Worker crashes don't affect other players

### Performance Scaling

| Server Configuration | Concurrent Users | Workers | Memory Usage |
|---------------------|------------------|---------|--------------|
| 2 CPU cores         | 200-300         | 2       | ~200MB       |
| 4 CPU cores         | 400-600         | 4       | ~400MB       |
| 8 CPU cores         | 800-1200+       | 8       | ~800MB       |

### Performance Optimizations
- **Multi-Process Clustering**: Utilize all CPU cores
- **Culling**: Only render visible elements
- **Efficient Collision Detection**: Spatial optimization
- **Memory Management**: Proper object pooling and cleanup
- **Network Optimization**: Delta compression and batching
- **Rate Limiting**: Client (10 msg/sec) and server (60 msg/sec) limits

### Browser Compatibility
- **Modern Browsers**: Chrome, Firefox, Safari, Edge
- **Canvas 2D**: Hardware-accelerated rendering
- **WebSocket Support**: Real-time multiplayer communication
- **Mobile Safari**: iOS touch and gesture support

### Network Protocol
```javascript
// Message Types
'join' - Player connection
'updateTarget' - Movement commands  
'ability' - Special ability activation
'gameUpdate' - World state synchronization
'respawn' - Player restart
```

## 🐛 Known Issues & Limitations

- **Player Limit**: No enforced maximum (performance depends on server)
- **Connection Drops**: Players are removed on disconnect
- **Mobile Performance**: May vary on older devices
- **Network Latency**: Visible impact on high-latency connections

## 🚀 Future Enhancements

### Planned Features
- [ ] Player customization (colors, names)
- [ ] Game modes (Team battles, King of the Hill)
- [ ] Power-up combinations
- [ ] Spectator mode
- [ ] Replay system
- [ ] Statistics tracking

### Performance Improvements
- [x] Multi-process clustering for horizontal scaling
- [ ] WebGL rendering for better performance
- [ ] Better mobile optimization
- [ ] Progressive loading

## 📊 Production Deployment

### Monitoring
Snake Town provides built-in monitoring for clustered deployments:

```bash
📊 Worker 1 (PID: 1234): 45 players, 45 connections, 67MB RAM
📊 Worker 2 (PID: 1235): 52 players, 52 connections, 71MB RAM
📊 Worker 3 (PID: 1236): 38 players, 38 connections, 63MB RAM
```

### Environment Variables
```bash
PORT=3000                    # Server port (default: 3000)
NODE_ENV=production         # Environment mode
LOAD_BALANCER_PORT=8080     # Load balancer port (default: 8080)
```

### Production Checklist
- [ ] Use `npm run cluster` for production
- [ ] Set `NODE_ENV=production`
- [ ] Configure reverse proxy (nginx/apache)
- [ ] Set up monitoring (PM2, logs)
- [ ] Enable HTTPS/WSS for security
- [ ] Configure firewall rules

### Scaling Guidelines
1. **Start with clustering**: `npm run cluster`
2. **Monitor performance**: Watch worker stats and system resources
3. **Vertical scaling**: Add more CPU cores/RAM to existing server
4. **Horizontal scaling**: Add more servers with load balancer
5. **Database scaling**: Consider Redis for >1000 concurrent users

For detailed deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🎮 Game Tips

### Survival Strategies
- **Stay Mobile**: Use deceleration physics to your advantage
- **Size Matters**: Avoid larger snakes, hunt smaller ones
- **Use Abilities Wisely**: Dash for escapes, magnet for collecting
- **Map Awareness**: Learn hazard locations and portal connections
- **Timing**: Use bounce pads and teleporters strategically

### Advanced Techniques
- **Corner Fighting**: Use world boundaries for tactical advantage
- **Ability Combos**: Chain abilities for maximum effectiveness
- **Predictive Movement**: Anticipate enemy positions
- **Resource Control**: Dominate food-rich areas

---

**Ready to dominate the arena? Start the server and let the battles begin!** 🐍⚔️