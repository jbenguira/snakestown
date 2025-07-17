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
        this.broadcastInterval = null;
        
        // Game world elements
        this.food = [];
        this.bonusBoxes = [];
        this.hazards = [];
        this.interactiveObjects = [];
        this.bullets = [];
        this.maxFood = 20;
        this.maxBonusBoxes = 8;
        this.interactionCooldowns = new Map();
        
        this.setupWebSocket();
        this.initializeWorld();
        this.startGameLoop();
        this.startBroadcastLoop();
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
                targetX: 2500,
                targetY: 2500,
                speed: 8,
                color: this.generatePlayerColor(),
                score: 0,
                name: `Player ${playerId}`,
                lastUpdate: Date.now(),
                moving: false,
                growthQueue: 0,
                abilities: {
                    dash: { cooldown: 1000, lastUsed: 0, active: false, duration: 0 },
                    bullets: { cooldown: 8000, lastUsed: 0, active: false, duration: 0 },
                    magnet: { cooldown: 8000, lastUsed: 0, active: false, endTime: 0, duration: 20000 },
                    shield: { cooldown: 8000, lastUsed: 0, active: false, endTime: 0, duration: 30000 }
                },
                activeEffects: [],
                alive: true
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
                    name: p.name,
                    alive: p.alive
                })),
                world: {
                    food: this.food,
                    bonusBoxes: this.bonusBoxes,
                    hazards: this.hazards,
                    interactiveObjects: this.interactiveObjects
                },
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
                    name: player.name,
                    alive: player.alive
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
            case 'updateTarget':
                if (!player.alive) return; // Only alive players can move
                player.targetX = data.targetX;
                player.targetY = data.targetY;
                player.moving = data.moving;
                break;
            case 'useAbility':
                if (!player.alive) return; // Only alive players can use abilities
                this.handleAbility(playerId, data.ability);
                break;
            case 'respawn':
                // Allow respawn for dead players
                this.respawnPlayer(player);
                break;
        }
    }
    
    initializeWorld() {
        // Initialize food
        for (let i = 0; i < this.maxFood; i++) {
            this.spawnFood();
        }
        
        // Initialize bonus boxes
        for (let i = 0; i < this.maxBonusBoxes; i++) {
            this.spawnBonusBox();
        }
        
        // Initialize hazards
        this.spawnHazards();
        
        // Initialize interactive objects
        this.spawnInteractiveObjects();
    }
    
    spawnFood() {
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#FF9F43', '#26DE81'];
        this.food.push({
            x: Math.random() * this.worldSize,
            y: Math.random() * this.worldSize,
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }
    
    spawnBonusBox() {
        const rand = Math.random();
        let type, color, icon, value;
        
        if (rand < 0.3) {
            // Speed bonus
            const multipliers = [2, 3, 5];
            type = 'speed_bonus';
            color = '#00FF00';
            icon = '⚡';
            value = multipliers[Math.floor(Math.random() * multipliers.length)];
        } else if (rand < 0.5) {
            // Growth bonus
            const growthAmounts = [10, 20, 30, 40, 50];
            type = 'growth_bonus';
            color = '#FFD700';
            icon = '🎁';
            value = growthAmounts[Math.floor(Math.random() * growthAmounts.length)];
        } else {
            // Malus
            const malusTypes = ['speed_malus', 'shrink_malus'];
            const malusType = malusTypes[Math.floor(Math.random() * malusTypes.length)];
            
            if (malusType === 'speed_malus') {
                const multipliers = [0.5, 0.75, 1.0];
                type = 'speed_malus';
                color = '#FF0000';
                icon = '💀';
                value = multipliers[Math.floor(Math.random() * multipliers.length)];
            } else {
                type = 'shrink_malus';
                color = '#FF0000';
                icon = '💀';
                value = 10;
            }
        }
        
        this.bonusBoxes.push({
            x: Math.random() * this.worldSize,
            y: Math.random() * this.worldSize,
            type, color, icon, value
        });
    }
    
    spawnHazards() {
        // Moving walls
        for (let i = 0; i < 5; i++) {
            this.hazards.push({
                type: 'movingWall',
                x: Math.random() * this.worldSize,
                y: Math.random() * this.worldSize,
                width: 60,
                height: 600,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8,
                color: '#8B4513'
            });
        }
        
        // Poison zones
        for (let i = 0; i < 3; i++) {
            this.hazards.push({
                type: 'poisonZone',
                x: Math.random() * this.worldSize,
                y: Math.random() * this.worldSize,
                radius: 80,
                color: '#9932CC',
                intensity: 0.5,
                lastDamage: 0
            });
        }
        
        // Speed traps
        for (let i = 0; i < 4; i++) {
            this.hazards.push({
                type: 'speedTrap',
                x: Math.random() * this.worldSize,
                y: Math.random() * this.worldSize,
                radius: 60,
                color: '#FF8C00',
                slowFactor: 0.3,
                lastSlowTime: 0
            });
        }
        
        // Teleporters
        for (let i = 0; i < 3; i++) {
            this.hazards.push({
                type: 'teleporter',
                x: Math.random() * this.worldSize,
                y: Math.random() * this.worldSize,
                radius: 25,
                color: '#00CED1',
                cooldown: 0
            });
        }
    }
    
    spawnInteractiveObjects() {
        // Portals (pairs)
        for (let i = 0; i < 2; i++) {
            const portalA = {
                type: 'portal',
                id: `portal_${i}_A`,
                pairId: i,
                linkedPortalId: `portal_${i}_B`,
                x: Math.random() * this.worldSize,
                y: Math.random() * this.worldSize,
                radius: 20,
                color: '#FF1493'
            };
            
            const portalB = {
                type: 'portal',
                id: `portal_${i}_B`,
                pairId: i,
                linkedPortalId: `portal_${i}_A`,
                x: Math.random() * this.worldSize,
                y: Math.random() * this.worldSize,
                radius: 20,
                color: '#FF1493'
            };
            
            this.interactiveObjects.push(portalA, portalB);
        }
        
        // Bounce pads
        for (let i = 0; i < 6; i++) {
            this.interactiveObjects.push({
                type: 'bouncePad',
                id: `bouncePad_${i}`,
                x: Math.random() * this.worldSize,
                y: Math.random() * this.worldSize,
                radius: 15,
                color: '#32CD32',
                direction: Math.random() * Math.PI * 2,
                power: 8
            });
        }
        
        // Checkpoints
        for (let i = 0; i < 4; i++) {
            this.interactiveObjects.push({
                type: 'checkpoint',
                id: `checkpoint_${i}`,
                x: Math.random() * this.worldSize,
                y: Math.random() * this.worldSize,
                radius: 18,
                color: '#FFD700',
                activated: false
            });
        }
        
        // Treasure chests
        for (let i = 0; i < 2; i++) {
            this.interactiveObjects.push({
                type: 'treasureChest',
                id: `treasure_${i}`,
                x: Math.random() * this.worldSize,
                y: Math.random() * this.worldSize,
                width: 30,
                height: 25,
                color: '#B8860B',
                opened: false
            });
        }
    }
    
    handleAbility(playerId, abilityName) {
        const player = this.players.get(playerId);
        if (!player || !player.alive) return;
        
        const ability = player.abilities[abilityName];
        const currentTime = Date.now();
        
        if (currentTime - ability.lastUsed < ability.cooldown) {
            return; // Still on cooldown
        }
        
        ability.lastUsed = currentTime;
        
        switch(abilityName) {
            case 'dash':
                this.activateDash(player);
                break;
            case 'bullets':
                this.activateBullets(player);
                break;
            case 'magnet':
                this.activateMagnet(player);
                break;
            case 'shield':
                this.activateShield(player);
                break;
        }
        
        // Broadcast ability usage
        this.broadcast({
            type: 'abilityUsed',
            playerId: playerId,
            ability: abilityName
        });
    }
    
    activateDash(player) {
        if (!player.moving) return;
        
        const head = player.segments[0];
        const dashDistance = 200;
        const angle = Math.atan2(player.targetY - head.y, player.targetX - head.x);
        
        // Move snake head instantly
        const newX = head.x + Math.cos(angle) * dashDistance;
        const newY = head.y + Math.sin(angle) * dashDistance;
        
        // Apply bouncing for dash ability too
        let dashX = newX;
        let dashY = newY;
        
        if (dashX < 0) dashX = Math.abs(dashX);
        if (dashX > this.worldSize) dashX = this.worldSize - (dashX - this.worldSize);
        if (dashY < 0) dashY = Math.abs(dashY);
        if (dashY > this.worldSize) dashY = this.worldSize - (dashY - this.worldSize);
        
        player.segments[0] = { x: dashX, y: dashY };
    }
    
    activateBullets(player) {
        const head = player.segments[0];
        const bulletCount = 16;
        
        // Create bullets in all directions
        for (let i = 0; i < bulletCount; i++) {
            const angle = (i / bulletCount) * Math.PI * 2;
            const velocity = 8;
            
            this.bullets.push({
                playerId: player.id,
                x: head.x,
                y: head.y,
                vx: Math.cos(angle) * velocity,
                vy: Math.sin(angle) * velocity,
                life: 120,
                size: 4,
                color: '#FFD700'
            });
        }
    }
    
    activateMagnet(player) {
        player.abilities.magnet.active = true;
        player.abilities.magnet.endTime = Date.now() + player.abilities.magnet.duration;
    }
    
    activateShield(player) {
        player.abilities.shield.active = true;
        player.abilities.shield.endTime = Date.now() + player.abilities.shield.duration;
    }
    
    applyMagnetEffect(player) {
        const head = player.segments[0];
        const magnetRange = 500; // Much larger magnet range
        
        // Attract food
        this.food.forEach(food => {
            const dx = head.x - food.x;
            const dy = head.y - food.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < magnetRange && distance > 0) {
                const force = Math.min(12, magnetRange / distance);
                const angle = Math.atan2(dy, dx);
                food.x += Math.cos(angle) * force;
                food.y += Math.sin(angle) * force;
            }
        });
        
        // Attract bonus boxes
        this.bonusBoxes.forEach(box => {
            const dx = head.x - box.x;
            const dy = head.y - box.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < magnetRange && distance > 0) {
                const force = Math.min(12, magnetRange / distance);
                const angle = Math.atan2(dy, dx);
                box.x += Math.cos(angle) * force;
                box.y += Math.sin(angle) * force;
            }
        });
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
        }, 1000 / 60); // 60 FPS for smoother server simulation
    }
    
    startBroadcastLoop() {
        this.broadcastInterval = setInterval(() => {
            this.broadcastUpdates();
        }, 1000 / 30); // 30 FPS for network updates
    }
    
    updateGame() {
        const now = Date.now();
        
        this.players.forEach(player => {
            if (player.alive) {
                this.updatePlayer(player, now);
                
                // Handle magnet ability (works regardless of movement)
                if (player.abilities.magnet.active && now < player.abilities.magnet.endTime) {
                    this.applyMagnetEffect(player);
                } else if (player.abilities.magnet.active) {
                    // Magnet expired
                    player.abilities.magnet.active = false;
                }
                
                // Handle shield ability expiration
                if (player.abilities.shield.active && now > player.abilities.shield.endTime) {
                    player.abilities.shield.active = false;
                }
            }
        });
        
        this.updateBullets();
        this.updateHazards();
        this.checkCollisions();
    }
    
    updatePlayer(player, now) {
        if (!player.moving || player.segments.length === 0) return;
        
        const head = player.segments[0];
        const dx = player.targetX - head.x;
        const dy = player.targetY - head.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Stop when close to target
        if (distance < 5) {
            player.moving = false;
            return;
        }
        
        // Move head towards target
        const angle = Math.atan2(dy, dx);
        const newHead = {
            x: head.x + Math.cos(angle) * player.speed,
            y: head.y + Math.sin(angle) * player.speed
        };
        
        // Bounce off world boundaries
        if (newHead.x < 0) {
            newHead.x = Math.abs(newHead.x); // Bounce back into the world
            player.targetX = Math.max(50, player.targetX); // Adjust target to prevent immediate re-collision
        }
        if (newHead.x > this.worldSize) {
            newHead.x = this.worldSize - (newHead.x - this.worldSize); // Bounce back
            player.targetX = Math.min(this.worldSize - 50, player.targetX); // Adjust target
        }
        if (newHead.y < 0) {
            newHead.y = Math.abs(newHead.y); // Bounce back into the world
            player.targetY = Math.max(50, player.targetY); // Adjust target to prevent immediate re-collision
        }
        if (newHead.y > this.worldSize) {
            newHead.y = this.worldSize - (newHead.y - this.worldSize); // Bounce back
            player.targetY = Math.min(this.worldSize - 50, player.targetY); // Adjust target
        }
        
        player.segments.unshift(newHead);
        
        // Handle snake growth
        if (player.growthQueue > 0) {
            player.growthQueue--;
        } else {
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
    
    updateBullets() {
        this.bullets = this.bullets.filter(bullet => {
            // Move bullet
            bullet.x += bullet.vx;
            bullet.y += bullet.vy;
            bullet.life--;
            
            // Check collisions
            this.checkBulletCollisions(bullet);
            
            // Remove expired bullets
            return bullet.life > 0;
        });
    }
    
    updateHazards() {
        const currentTime = Date.now();
        
        this.hazards.forEach(hazard => {
            switch (hazard.type) {
                case 'movingWall':
                    hazard.x += hazard.vx;
                    hazard.y += hazard.vy;
                    
                    if (hazard.x <= 0 || hazard.x + hazard.width >= this.worldSize) {
                        hazard.vx *= -1;
                        hazard.x = Math.max(0, Math.min(this.worldSize - hazard.width, hazard.x));
                    }
                    if (hazard.y <= 0 || hazard.y + hazard.height >= this.worldSize) {
                        hazard.vy *= -1;
                        hazard.y = Math.max(0, Math.min(this.worldSize - hazard.height, hazard.y));
                    }
                    break;
                    
                case 'poisonZone':
                    hazard.intensity = 0.3 + Math.sin(currentTime * 0.005) * 0.3;
                    break;
                    
                case 'teleporter':
                    hazard.rotation = (hazard.rotation || 0) + 0.05;
                    break;
            }
        });
    }
    
    checkBulletCollisions(bullet) {
        // Check collision with food
        for (let i = this.food.length - 1; i >= 0; i--) {
            const food = this.food[i];
            const distance = Math.sqrt((bullet.x - food.x) ** 2 + (bullet.y - food.y) ** 2);
            if (distance < 6 + bullet.size) {
                this.food.splice(i, 1);
                this.spawnFood();
                bullet.life = 0;
                break;
            }
        }
        
        // Check collision with bonus boxes
        for (let i = this.bonusBoxes.length - 1; i >= 0; i--) {
            const box = this.bonusBoxes[i];
            const distance = Math.sqrt((bullet.x - box.x) ** 2 + (bullet.y - box.y) ** 2);
            if (distance < 12 + bullet.size) {
                this.bonusBoxes.splice(i, 1);
                this.spawnBonusBox();
                bullet.life = 0;
                break;
            }
        }
        
        // Check collision with hazards
        for (let i = this.hazards.length - 1; i >= 0; i--) {
            const hazard = this.hazards[i];
            let collision = false;
            
            switch (hazard.type) {
                case 'movingWall':
                    collision = bullet.x >= hazard.x && bullet.x <= hazard.x + hazard.width &&
                               bullet.y >= hazard.y && bullet.y <= hazard.y + hazard.height;
                    break;
                case 'poisonZone':
                case 'speedTrap':
                case 'teleporter':
                    const distance = Math.sqrt((bullet.x - hazard.x) ** 2 + (bullet.y - hazard.y) ** 2);
                    collision = distance < hazard.radius + bullet.size;
                    break;
            }
            
            if (collision) {
                this.hazards.splice(i, 1);
                bullet.life = 0;
                break;
            }
        }
        
        // Check collision with interactive objects
        for (let i = this.interactiveObjects.length - 1; i >= 0; i--) {
            const obj = this.interactiveObjects[i];
            let collision = false;
            
            switch (obj.type) {
                case 'treasureChest':
                    collision = bullet.x >= obj.x - obj.width/2 && bullet.x <= obj.x + obj.width/2 &&
                               bullet.y >= obj.y - obj.height/2 && bullet.y <= obj.y + obj.height/2;
                    break;
                default:
                    const distance = Math.sqrt((bullet.x - obj.x) ** 2 + (bullet.y - obj.y) ** 2);
                    collision = distance < obj.radius + bullet.size;
                    break;
            }
            
            if (collision) {
                this.interactiveObjects.splice(i, 1);
                bullet.life = 0;
                break;
            }
        }
    }
    
    checkCollisions() {
        const playersArray = Array.from(this.players.values());
        
        // Check player collisions with world elements
        playersArray.forEach(player => {
            if (!player.alive || player.segments.length === 0) return;
            
            const head = player.segments[0];
            
            // Check food collision
            this.checkPlayerFoodCollision(player, head);
            
            // Check bonus box collision
            this.checkPlayerBonusBoxCollision(player, head);
            
            // Check hazard collision
            this.checkPlayerHazardCollision(player, head);
            
            // Check interactive object collision
            this.checkPlayerInteractiveObjectCollision(player, head);
            
            // Self-collision disabled - snakes can pass through themselves
            // this.checkPlayerSelfCollision(player, head);
            
            // Check collision with other players
            this.checkPlayerPlayerCollision(player, head, playersArray);
        });
    }
    
    checkPlayerFoodCollision(player, head) {
        for (let i = this.food.length - 1; i >= 0; i--) {
            const food = this.food[i];
            const distance = Math.sqrt((head.x - food.x) ** 2 + (head.y - food.y) ** 2);
            
            if (distance < 6 + 10) { // food size + snake head radius
                this.food.splice(i, 1);
                player.score += 10;
                player.growthQueue += 10;
                this.spawnFood();
                break;
            }
        }
    }
    
    checkPlayerBonusBoxCollision(player, head) {
        for (let i = this.bonusBoxes.length - 1; i >= 0; i--) {
            const box = this.bonusBoxes[i];
            const distance = Math.sqrt((head.x - box.x) ** 2 + (head.y - box.y) ** 2);
            
            if (distance < 12 + 10) { // box size + snake head radius
                this.bonusBoxes.splice(i, 1);
                this.applyBonusEffect(player, box);
                this.spawnBonusBox();
                break;
            }
        }
    }
    
    checkPlayerHazardCollision(player, head) {
        // Only check if not shielded
        if (player.abilities.shield.active) return;
        
        this.hazards.forEach(hazard => {
            let collision = false;
            
            switch (hazard.type) {
                case 'movingWall':
                    collision = head.x >= hazard.x && head.x <= hazard.x + hazard.width &&
                               head.y >= hazard.y && head.y <= hazard.y + hazard.height;
                    break;
                case 'poisonZone':
                case 'speedTrap':
                case 'teleporter':
                    const distance = Math.sqrt((head.x - hazard.x) ** 2 + (head.y - hazard.y) ** 2);
                    collision = distance < hazard.radius + 10;
                    break;
            }
            
            if (collision) {
                this.handleHazardEffect(player, hazard);
            }
        });
    }
    
    checkPlayerInteractiveObjectCollision(player, head) {
        const currentTime = Date.now();
        
        this.interactiveObjects.forEach(obj => {
            let collision = false;
            
            switch (obj.type) {
                case 'portal':
                case 'bouncePad':
                case 'checkpoint':
                    const distance = Math.sqrt((head.x - obj.x) ** 2 + (head.y - obj.y) ** 2);
                    collision = distance < obj.radius + 10;
                    break;
                case 'treasureChest':
                    collision = head.x >= obj.x - obj.width/2 && head.x <= obj.x + obj.width/2 &&
                               head.y >= obj.y - obj.height/2 && head.y <= obj.y + obj.height/2;
                    break;
            }
            
            if (collision) {
                // Add cooldown for player-object interactions
                const cooldownKey = `${player.id}_${obj.id}`;
                if (!this.interactionCooldowns) {
                    this.interactionCooldowns = new Map();
                }
                
                const lastInteraction = this.interactionCooldowns.get(cooldownKey) || 0;
                if (currentTime - lastInteraction > 1000) { // 1 second cooldown
                    this.interactionCooldowns.set(cooldownKey, currentTime);
                    this.handleInteractiveObjectEffect(player, obj);
                }
            }
        });
    }
    
    checkPlayerSelfCollision(player, head) {
        // Skip if shielded
        if (player.abilities.shield.active) return;
        
        // Check collision with own body
        for (let i = 8; i < player.segments.length; i++) {
            const segment = player.segments[i];
            const distance = Math.sqrt((head.x - segment.x) ** 2 + (head.y - segment.y) ** 2);
            
            if (distance < 12) {
                this.killPlayer(player);
                return;
            }
        }
    }
    
    checkPlayerPlayerCollision(player, head, playersArray) {
        // Skip if shielded
        if (player.abilities.shield.active) return;
        
        playersArray.forEach(otherPlayer => {
            if (otherPlayer.id === player.id || !otherPlayer.alive) return;
            
            // Check head-to-head collision only (body collisions are handled separately)
            const otherHead = otherPlayer.segments[0];
            const distance = Math.sqrt((head.x - otherHead.x) ** 2 + (head.y - otherHead.y) ** 2);
            
            if (distance < 20) { // Head-to-head collision
                // Compare snake sizes
                const playerSize = player.segments.length;
                const otherPlayerSize = otherPlayer.segments.length;
                
                if (playerSize > otherPlayerSize) {
                    // Current player is bigger - eats the other player
                    this.playerEatsPlayer(player, otherPlayer);
                } else if (otherPlayerSize > playerSize) {
                    // Other player is bigger - eats current player
                    this.playerEatsPlayer(otherPlayer, player);
                } else {
                    // Same size - both die
                    this.killPlayer(player);
                    this.killPlayer(otherPlayer);
                }
            } else {
                // Check collision with other player's body segments (not head)
                for (let i = 1; i < otherPlayer.segments.length; i++) {
                    const segment = otherPlayer.segments[i];
                    const bodyDistance = Math.sqrt((head.x - segment.x) ** 2 + (head.y - segment.y) ** 2);
                    
                    if (bodyDistance < 15) {
                        // Compare snake sizes for body collision too
                        const playerSize = player.segments.length;
                        const otherPlayerSize = otherPlayer.segments.length;
                        
                        if (playerSize > otherPlayerSize) {
                            // Current player is bigger - eats the other player
                            this.playerEatsPlayer(player, otherPlayer);
                        } else if (otherPlayerSize > playerSize) {
                            // Other player is bigger - current player dies
                            this.killPlayer(player);
                            otherPlayer.score += Math.floor(player.segments.length / 2);
                        } else {
                            // Same size - current player dies (body hit is disadvantageous)
                            this.killPlayer(player);
                            otherPlayer.score += Math.floor(player.segments.length / 2);
                        }
                        return;
                    }
                }
            }
        });
    }
    
    applyBonusEffect(player, box) {
        const currentTime = Date.now();
        
        switch (box.type) {
            case 'speed_bonus':
                player.speed = 8 * box.value;
                player.activeEffects.push({
                    type: 'speed',
                    endTime: currentTime + 15000,
                    value: box.value
                });
                break;
            case 'growth_bonus':
                player.growthQueue += box.value;
                player.score += box.value;
                break;
            case 'speed_malus':
                player.speed = 8 * box.value;
                player.activeEffects.push({
                    type: 'speed',
                    endTime: currentTime + 15000,
                    value: box.value
                });
                break;
            case 'shrink_malus':
                const segmentsToRemove = Math.min(box.value, player.segments.length - 5);
                for (let i = 0; i < segmentsToRemove; i++) {
                    if (player.segments.length > 5) {
                        player.segments.pop();
                    }
                }
                break;
        }
    }
    
    handleHazardEffect(player, hazard) {
        const currentTime = Date.now();
        
        switch (hazard.type) {
            case 'movingWall':
                // Bounce back
                const head = player.segments[0];
                const dx = head.x - (hazard.x + hazard.width / 2);
                const dy = head.y - (hazard.y + hazard.height / 2);
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance > 0) {
                    const bounceForce = 50;
                    player.segments[0].x = head.x + (dx / distance) * bounceForce;
                    player.segments[0].y = head.y + (dy / distance) * bounceForce;
                }
                break;
                
            case 'poisonZone':
                if (currentTime - hazard.lastDamage > 1000) {
                    if (player.segments.length > 5) {
                        player.segments.pop();
                        hazard.lastDamage = currentTime;
                    }
                }
                break;
                
            case 'speedTrap':
                if (!hazard.lastSlowTime || currentTime - hazard.lastSlowTime > 2000) {
                    player.speed = 8 * hazard.slowFactor;
                    player.activeEffects.push({
                        type: 'speed',
                        endTime: currentTime + 10000,
                        value: hazard.slowFactor
                    });
                    hazard.lastSlowTime = currentTime;
                }
                break;
                
            case 'teleporter':
                if (currentTime - hazard.cooldown > 2000) {
                    const newX = Math.random() * this.worldSize;
                    const newY = Math.random() * this.worldSize;
                    player.segments[0].x = newX;
                    player.segments[0].y = newY;
                    player.targetX = newX;
                    player.targetY = newY;
                    hazard.cooldown = currentTime;
                }
                break;
        }
    }
    
    handleInteractiveObjectEffect(player, obj) {
        const currentTime = Date.now();
        
        switch (obj.type) {
            case 'portal':
                // Find linked portal
                const linkedPortal = this.interactiveObjects.find(portal => 
                    portal.type === 'portal' && portal.id === obj.linkedPortalId
                );
                if (linkedPortal) {
                    player.segments[0].x = linkedPortal.x;
                    player.segments[0].y = linkedPortal.y;
                    player.targetX = linkedPortal.x;
                    player.targetY = linkedPortal.y;
                }
                break;
                
            case 'bouncePad':
                const bounceDistance = obj.power * 20;
                let newX = player.segments[0].x + Math.cos(obj.direction) * bounceDistance;
                let newY = player.segments[0].y + Math.sin(obj.direction) * bounceDistance;
                
                // Apply bouncing for bounce pad too
                if (newX < 0) newX = Math.abs(newX);
                if (newX > this.worldSize) newX = this.worldSize - (newX - this.worldSize);
                if (newY < 0) newY = Math.abs(newY);
                if (newY > this.worldSize) newY = this.worldSize - (newY - this.worldSize);
                
                player.segments[0].x = newX;
                player.segments[0].y = newY;
                break;
                
            case 'checkpoint':
                if (!obj.activated) {
                    obj.activated = true;
                    obj.activatedBy = player.id;
                    obj.activatedTime = currentTime;
                    player.score += 50;
                    console.log(`Checkpoint ${obj.id} activated by ${player.name}`);
                }
                break;
                
            case 'treasureChest':
                if (!obj.opened) {
                    obj.opened = true;
                    obj.openedBy = player.id;
                    obj.openedTime = currentTime;
                    player.score += 100;
                    player.growthQueue += 20;
                    console.log(`Treasure ${obj.id} opened by ${player.name}`);
                }
                break;
        }
    }
    
    playerEatsPlayer(eater, victim) {
        // Calculate growth based on victim's size
        const growthAmount = Math.floor(victim.segments.length / 2);
        
        // Add growth to eater
        eater.growthQueue += growthAmount;
        eater.score += victim.segments.length; // Full score for eating another player
        
        // Kill the victim
        victim.alive = false;
        victim.moving = false;
        
        // Broadcast the eating event
        this.broadcast({
            type: 'playerEaten',
            eaterId: eater.id,
            victimId: victim.id,
            eaterName: eater.name,
            victimName: victim.name,
            eaterScore: eater.score,
            growthGained: growthAmount
        });
        
        // Also broadcast player death for the victim
        this.broadcast({
            type: 'playerDied',
            playerId: victim.id
        });
    }
    
    killPlayer(player) {
        player.alive = false;
        player.moving = false;
        
        // Broadcast player death
        this.broadcast({
            type: 'playerDied',
            playerId: player.id
        });
    }
    
    respawnPlayer(player) {
        player.segments = this.generateInitialSegments();
        player.score = Math.max(0, player.score - 10);
        player.alive = true;
        player.moving = false;
        player.growthQueue = 0;
        player.speed = 8;
        player.activeEffects = [];
        
        // Reset abilities
        Object.keys(player.abilities).forEach(abilityName => {
            player.abilities[abilityName].active = false;
            player.abilities[abilityName].endTime = 0;
        });
        
        // Broadcast respawn
        this.broadcast({
            type: 'playerRespawned',
            playerId: player.id,
            player: {
                id: player.id,
                segments: player.segments,
                color: player.color,
                score: player.score,
                name: player.name,
                alive: player.alive
            }
        });
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
    
    
    broadcastUpdates() {
        // Only send updates if there are players
        if (this.players.size === 0) return;
        
        // Send position updates for all players in a single message
        const playerUpdates = Array.from(this.players.values()).map(player => ({
            id: player.id,
            segments: player.segments,
            color: player.color,
            score: player.score,
            name: player.name,
            alive: player.alive,
            abilities: player.abilities
        }));
        
        this.broadcast({
            type: 'gameUpdate',
            players: playerUpdates,
            world: {
                food: this.food,
                bonusBoxes: this.bonusBoxes,
                hazards: this.hazards,
                interactiveObjects: this.interactiveObjects,
                bullets: this.bullets
            }
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