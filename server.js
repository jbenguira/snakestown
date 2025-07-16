const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

class SnakeServer {
    constructor() {
        this.server = http.createServer((req, res) => {
            this.handleHttpRequest(req, res);
        });
        
        this.wss = new WebSocket.Server({ server: this.server });
        this.players = new Map();
        this.playerIdCounter = 0;
        this.worldSize = 5000;
        this.gameUpdateInterval = null;
        
        this.setupWebSocket();
        this.startGameLoop();
        this.startServer();
    }
    
    handleHttpRequest(req, res) {
        let filePath = req.url === '/' ? '/index.html' : req.url;
        const fullPath = path.join(__dirname, filePath);
        
        const extname = path.extname(filePath);
        let contentType = 'text/html';
        
        switch(extname) {
            case '.js':
                contentType = 'text/javascript';
                break;
            case '.css':
                contentType = 'text/css';
                break;
            case '.html':
                contentType = 'text/html';
                break;
        }
        
        fs.readFile(fullPath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }
            
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        });
    }
    
    setupWebSocket() {
        this.wss.on('connection', (ws) => {
            const playerId = this.generatePlayerId();
            const player = {
                id: playerId,
                ws: ws,
                segments: this.generateInitialSegments(),
                direction: 0,
                speed: 2,
                color: this.generatePlayerColor(),
                score: 0,
                name: `Player ${playerId}`,
                lastUpdate: Date.now(),
                moving: false
            };
            
            this.players.set(playerId, player);
            console.log(`Player ${playerId} connected`);
            
            // Send initial game state to new player
            this.sendToPlayer(playerId, {
                type: 'gameState',
                players: Array.from(this.players.values()).map(p => ({
                    id: p.id,
                    segments: p.segments,
                    color: p.color,
                    score: p.score,
                    name: p.name
                })),
                yourId: playerId
            });
            
            // Notify other players
            this.broadcast({
                type: 'playerJoined',
                player: {
                    id: player.id,
                    segments: player.segments,
                    color: player.color,
                    score: player.score,
                    name: player.name
                }
            }, playerId);
            
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    this.handleMessage(playerId, data);
                } catch (error) {
                    console.error('Error parsing message:', error);
                }
            });
            
            ws.on('close', () => {
                console.log(`Player ${playerId} disconnected`);
                this.players.delete(playerId);
                
                this.broadcast({
                    type: 'playerLeft',
                    playerId: playerId
                });
            });
        });
    }
    
    handleMessage(playerId, data) {
        const player = this.players.get(playerId);
        if (!player) return;
        
        switch (data.type) {
            case 'updateDirection':
                player.direction = data.angle;
                player.moving = true;
                break;
        }
    }
    
    generateInitialSegments() {
        const x = Math.random() * (this.worldSize - 200) + 100;
        const y = Math.random() * (this.worldSize - 200) + 100;
        const segments = [];
        
        for (let i = 0; i < 5; i++) {
            segments.push({
                x: x - i * 20,
                y: y
            });
        }
        
        return segments;
    }
    
    generatePlayerId() {
        return `P${++this.playerIdCounter}`;
    }
    
    generatePlayerColor() {
        const colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
            '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
            '#FF9F43', '#10AC84', '#EE5A6F', '#0FB9B1',
            '#A55EEA', '#26DE81', '#FD79A8', '#FDCB6E'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    startGameLoop() {
        this.gameUpdateInterval = setInterval(() => {
            this.updateGame();
        }, 1000 / 20); // 20 FPS for smoother client experience
    }
    
    updateGame() {
        const now = Date.now();
        
        this.players.forEach(player => {
            this.updatePlayer(player, now);
        });
        
        this.checkCollisions();
        this.broadcastUpdates();
    }
    
    updatePlayer(player, now) {
        if (player.segments.length === 0 || !player.moving) return;
        
        const deltaTime = now - player.lastUpdate;
        player.lastUpdate = now;
        
        // Move head
        const head = player.segments[0];
        const newHead = {
            x: head.x + Math.cos(player.direction) * player.speed,
            y: head.y + Math.sin(player.direction) * player.speed
        };
        
        // Wrap around world boundaries
        if (newHead.x < 0) newHead.x = this.worldSize;
        if (newHead.x > this.worldSize) newHead.x = 0;
        if (newHead.y < 0) newHead.y = this.worldSize;
        if (newHead.y > this.worldSize) newHead.y = 0;
        
        player.segments.unshift(newHead);
        
        // Keep snake length (remove tail unless growing)
        if (player.segments.length > player.score + 5) {
            player.segments.pop();
        }
        
        // Update segments to follow smoothly
        for (let i = 1; i < player.segments.length; i++) {
            const current = player.segments[i];
            const target = player.segments[i - 1];
            
            const dx = target.x - current.x;
            const dy = target.y - current.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 20) {
                const angle = Math.atan2(dy, dx);
                current.x = target.x - Math.cos(angle) * 20;
                current.y = target.y - Math.sin(angle) * 20;
            }
        }
    }
    
    checkCollisions() {
        const playersArray = Array.from(this.players.values());
        
        for (let i = 0; i < playersArray.length; i++) {
            const player1 = playersArray[i];
            if (player1.segments.length === 0) continue;
            
            const head1 = player1.segments[0];
            
            for (let j = 0; j < playersArray.length; j++) {
                const player2 = playersArray[j];
                if (player2.segments.length === 0) continue;
                
                // Check collision with other players' bodies
                const startIndex = (i === j) ? 3 : 0; // Don't check own head and nearby segments
                
                for (let k = startIndex; k < player2.segments.length; k++) {
                    const segment = player2.segments[k];
                    const distance = Math.sqrt(
                        (head1.x - segment.x) ** 2 + (head1.y - segment.y) ** 2
                    );
                    
                    if (distance < 15) {
                        this.handlePlayerEaten(player1, player2);
                        return;
                    }
                }
            }
        }
    }
    
    handlePlayerEaten(victim, killer) {
        if (victim.id === killer.id) {
            // Self-collision, respawn
            this.respawnPlayer(victim);
        } else {
            // Eaten by another player
            killer.score += Math.floor(victim.segments.length / 2);
            
            this.broadcast({
                type: 'playerEaten',
                killerName: killer.name,
                victimName: victim.name,
                killerScore: killer.score
            });
            
            this.respawnPlayer(victim);
        }
    }
    
    respawnPlayer(player) {
        player.segments = this.generateInitialSegments();
        player.score = Math.max(0, player.score - 1);
        player.direction = Math.random() * Math.PI * 2;
    }
    
    broadcastUpdates() {
        // Only send updates if there are players
        if (this.players.size === 0) return;
        
        // Send position updates for all players in a single message
        const playerUpdates = Array.from(this.players.values()).map(player => ({
            id: player.id,
            segments: player.segments,
            score: player.score
        }));
        
        this.broadcast({
            type: 'playersUpdate',
            players: playerUpdates
        });
    }
    
    sendToPlayer(playerId, message) {
        const player = this.players.get(playerId);
        if (player && player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(JSON.stringify(message));
        }
    }
    
    broadcast(message, excludePlayerId = null) {
        this.players.forEach((player, playerId) => {
            if (playerId !== excludePlayerId && player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(JSON.stringify(message));
            }
        });
    }
    
    startServer() {
        const port = process.env.PORT || 3000;
        this.server.listen(port, () => {
            console.log(`Snake server running on port ${port}`);
        });
    }
}

new SnakeServer();