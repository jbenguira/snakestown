class MultiplayerSnakeGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.camera = { x: 0, y: 0, zoom: 1 };
        this.worldSize = 5000;
        this.minZoom = 0.25;
        this.maxZoom = 5;
        
        // Touch/pinch state
        this.touches = [];
        this.lastPinchDistance = 0;
        
        // Multiplayer
        this.ws = null;
        this.playerId = null;
        this.players = new Map();
        this.connectionStatus = 'disconnected';
        
        // Snake player
        this.snake = {
            segments: [
                { x: 2500, y: 2500 },
                { x: 2480, y: 2500 },
                { x: 2460, y: 2500 },
                { x: 2440, y: 2500 },
                { x: 2420, y: 2500 }
            ],
            targetX: 2500,
            targetY: 2500,
            speed: 3,
            moving: false,
            color: '#4ECDC4',
            score: 0,
            growthQueue: 0 // Number of segments to grow
        };
        
        // Input state
        this.isPressed = false;
        this.currentTargetX = 2500;
        this.currentTargetY = 2500;
        
        // Food system
        this.food = [];
        this.maxFood = 20;
        this.foodSize = 6;
        
        // Bonus/Malus system
        this.bonusBoxes = [];
        this.maxBonusBoxes = 8;
        this.bonusBoxSize = 12;
        this.activeEffects = [];
        this.baseSpeed = 3;
        
        // Ability system
        this.abilities = {
            dash: { cooldown: 8000, lastUsed: 0, active: false, duration: 0 },
            bullets: { cooldown: 8000, lastUsed: 0, active: false, duration: 0 },
            magnet: { cooldown: 8000, lastUsed: 0, active: false, endTime: 0, duration: 20000 }, // Double duration
            shield: { cooldown: 8000, lastUsed: 0, active: false, endTime: 0, duration: 30000 } // Double duration
        };
        
        // Bullet system
        this.bullets = [];
        
        // Temporary powers
        this.temporaryPowers = {
            ghostMode: { active: false, endTime: 0 },
            doubleScore: { active: false, endTime: 0 },
            freezeTime: { active: false, endTime: 0 },
            invincibility: { active: false, endTime: 0 }
        };
        
        // Environmental elements
        this.hazards = [];
        this.interactiveObjects = [];
        
        // Achievement system
        this.achievements = {
            lengthMilestones: { 50: false, 100: false, 200: false },
            speedDemon: { distance: 0, achieved: false },
            collector: { foodEaten: 0, achieved: false },
            riskTaker: { malusCollected: 0, achieved: false }
        };
        
        // Visual effects
        this.particles = [];
        this.trailEffect = 'normal';
        
        // Game state
        this.gameState = 'playing'; // 'playing', 'gameOver'
        this.gameStartTime = Date.now();
        this.gameInstance = null;
        
        this.resizeCanvas();
        this.setupEventListeners();
        this.connectToServer();
        this.gameLoop();
    }
    
    connectToServer() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            this.connectionStatus = 'connected';
            console.log('Connected to server');
        };
        
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleServerMessage(data);
        };
        
        this.ws.onclose = () => {
            this.connectionStatus = 'disconnected';
            console.log('Disconnected from server');
            
            // Attempt to reconnect after 2 seconds
            setTimeout(() => {
                this.connectToServer();
            }, 2000);
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }
    
    handleServerMessage(data) {
        switch (data.type) {
            case 'gameState':
                this.playerId = data.yourId;
                this.players.clear();
                const initialTime = Date.now();
                data.players.forEach(player => {
                    // Initialize interpolation data for initial game state
                    player.lastUpdateTime = initialTime;
                    player.interpolationStartTime = initialTime;
                    player.previousSegments = [];
                    this.initializePlayerVelocities(player);
                    this.players.set(player.id, player);
                });
                
                // Set world state
                this.food = data.world.food;
                this.bonusBoxes = data.world.bonusBoxes;
                this.hazards = data.world.hazards;
                this.interactiveObjects = data.world.interactiveObjects;
                break;
                
            case 'gameUpdate':
                const updateTime = Date.now();
                data.players.forEach(player => {
                    const existingPlayer = this.players.get(player.id);
                    if (existingPlayer) {
                        // Calculate velocities for smooth interpolation
                        this.calculateSegmentVelocities(existingPlayer, player, updateTime);
                        
                        // Store previous position for interpolation
                        existingPlayer.previousSegments = existingPlayer.segments ? [...existingPlayer.segments] : [];
                        existingPlayer.previousUpdateTime = existingPlayer.lastUpdateTime || updateTime;
                        existingPlayer.interpolationStartTime = updateTime;
                    } else {
                        // Initialize velocities for new player
                        this.initializePlayerVelocities(player);
                    }
                    
                    // Update player with new data
                    player.lastUpdateTime = updateTime;
                    player.interpolationStartTime = updateTime;
                    this.players.set(player.id, player);
                });
                
                // Update world state
                this.food = data.world.food;
                this.bonusBoxes = data.world.bonusBoxes;
                this.hazards = data.world.hazards;
                this.interactiveObjects = data.world.interactiveObjects;
                this.bullets = data.world.bullets;
                break;
                
            case 'playerJoined':
                const joinTime = Date.now();
                data.player.lastUpdateTime = joinTime;
                data.player.interpolationStartTime = joinTime;
                data.player.previousSegments = [];
                this.initializePlayerVelocities(data.player);
                this.players.set(data.player.id, data.player);
                break;
                
            case 'playerLeft':
                this.players.delete(data.playerId);
                break;
                
            case 'playerDied':
                const player = this.players.get(data.playerId);
                if (player) {
                    player.alive = false;
                    // Show game over modal if it's the current player
                    if (data.playerId === this.playerId) {
                        this.showGameOverModal();
                    }
                }
                break;
                
            case 'playerRespawned':
                const respawnTime = Date.now();
                data.player.lastUpdateTime = respawnTime;
                data.player.interpolationStartTime = respawnTime;
                data.player.previousSegments = [];
                this.initializePlayerVelocities(data.player);
                this.players.set(data.playerId, data.player);
                break;
                
            case 'abilityUsed':
                // Handle ability visual effects for other players
                const abilityPlayer = this.players.get(data.playerId);
                if (abilityPlayer) {
                    this.createAbilityEffects(abilityPlayer, data.ability);
                }
                break;
                
            case 'playerEaten':
                // Show eating notification
                this.showEatingNotification(data.eaterName, data.victimName, data.growthGained);
                break;
        }
    }
    
    sendToServer(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }
    
    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    
    setupEventListeners() {
        window.addEventListener('resize', () => {
            this.resizeCanvas();
        });
        
        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => {
            this.handlePointerStart(e.clientX, e.clientY);
        });
        
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.isPressed) {
                this.handlePointerMove(e.clientX, e.clientY);
            }
        });
        
        this.canvas.addEventListener('mouseup', () => {
            this.handlePointerEnd();
        });
        
        this.canvas.addEventListener('mouseleave', () => {
            this.handlePointerEnd();
        });
        
        // Mouse wheel for zoom
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            this.zoom(mouseX, mouseY, zoomFactor);
        });
        
        // Touch events
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.touches = Array.from(e.touches);
            
            if (this.touches.length === 1) {
                // Single touch - movement
                this.handlePointerStart(this.touches[0].clientX, this.touches[0].clientY);
            } else if (this.touches.length === 2) {
                // Two touches - pinch zoom
                this.handlePointerEnd(); // Stop movement
                this.lastPinchDistance = this.getPinchDistance();
            }
        });
        
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.touches = Array.from(e.touches);
            
            if (this.touches.length === 1 && this.isPressed) {
                // Single touch movement
                this.handlePointerMove(this.touches[0].clientX, this.touches[0].clientY);
            } else if (this.touches.length === 2) {
                // Pinch zoom
                this.handlePinchZoom();
            }
        });
        
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.touches = Array.from(e.touches);
            
            if (this.touches.length === 0) {
                this.handlePointerEnd();
            }
        });
        
        this.canvas.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            this.touches = [];
            this.handlePointerEnd();
        });
        
        // Ability hotkeys
        document.addEventListener('keydown', (e) => {
            switch(e.key.toLowerCase()) {
                case '1': this.useAbility('dash'); break;
                case '2': this.useAbility('bullets'); break;
                case '3': this.useAbility('magnet'); break;
                case '4': this.useAbility('shield'); break;
            }
        });
        
        // Ability button click/touch events
        this.setupAbilityButtons();
    }
    
    setupAbilityButtons() {
        const abilityNames = ['dash', 'bullets', 'magnet', 'shield'];
        
        abilityNames.forEach(abilityName => {
            const button = document.getElementById(`ability-${abilityName}`);
            if (button) {
                // Mouse events
                button.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.useAbility(abilityName);
                });
                
                // Touch events
                button.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.useAbility(abilityName);
                });
                
                // Prevent context menu
                button.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                });
            }
        });
    }
    
    useAbility(abilityName) {
        if (this.gameState !== 'playing' || !this.playerId) return;
        
        const myPlayer = this.players.get(this.playerId);
        if (!myPlayer || !myPlayer.alive) return;
        
        const ability = myPlayer.abilities[abilityName];
        const currentTime = Date.now();
        
        if (currentTime - ability.lastUsed < ability.cooldown) {
            return; // Still on cooldown
        }
        
        // Send ability usage to server
        this.sendToServer({
            type: 'useAbility',
            ability: abilityName
        });
    }
    
    activateDash() {
        if (!this.snake.moving) return;
        
        const head = this.snake.segments[0];
        const dashDistance = 100;
        const angle = Math.atan2(this.snake.targetY - head.y, this.snake.targetX - head.x);
        
        // Move snake head instantly
        const newX = head.x + Math.cos(angle) * dashDistance;
        const newY = head.y + Math.sin(angle) * dashDistance;
        
        this.snake.segments[0] = {
            x: Math.max(0, Math.min(this.worldSize, newX)),
            y: Math.max(0, Math.min(this.worldSize, newY))
        };
        
        // Add particles for dash effect
        this.createDashParticles(head.x, head.y, this.snake.segments[0].x, this.snake.segments[0].y);
    }
    
    activateBullets() {
        const head = this.snake.segments[0];
        const bulletCount = 16; // Large array of bullets
        
        // Create bullets in all directions
        for (let i = 0; i < bulletCount; i++) {
            const angle = (i / bulletCount) * Math.PI * 2;
            const velocity = 8;
            
            this.bullets.push({
                x: head.x,
                y: head.y,
                vx: Math.cos(angle) * velocity,
                vy: Math.sin(angle) * velocity,
                life: 120, // 2 seconds at 60fps
                size: 4,
                color: '#FFD700'
            });
        }
        
        // Add bullet particles for visual effect
        this.createBulletFireParticles(head.x, head.y);
    }
    
    activateMagnet() {
        this.abilities.magnet.active = true;
        this.abilities.magnet.endTime = Date.now() + this.abilities.magnet.duration;
    }
    
    activateShield() {
        this.abilities.shield.active = true;
        this.abilities.shield.endTime = Date.now() + this.abilities.shield.duration;
    }
    
    activateTemporaryPower(powerName) {
        const currentTime = Date.now();
        const durations = {
            ghostMode: 15000,
            doubleScore: 30000,
            freezeTime: 5000,
            invincibility: 15000
        };
        
        this.temporaryPowers[powerName].active = true;
        this.temporaryPowers[powerName].endTime = currentTime + durations[powerName];
        
        this.createPowerActivationParticles(this.snake.segments[0].x, this.snake.segments[0].y, powerName);
    }
    
    createDashParticles(startX, startY, endX, endY) {
        const particleCount = 10;
        for (let i = 0; i < particleCount; i++) {
            const t = i / particleCount;
            this.particles.push({
                x: startX + (endX - startX) * t,
                y: startY + (endY - startY) * t,
                color: '#FFD700',
                size: Math.random() * 3 + 2,
                life: 30,
                maxLife: 30,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4
            });
        }
    }
    
    createDamageParticles(x, y, color) {
        for (let i = 0; i < 4; i++) { // Reduced from 8 to 4 particles
            this.particles.push({
                x: x + (Math.random() - 0.5) * 20,
                y: y + (Math.random() - 0.5) * 20,
                color: color,
                size: Math.random() * 4 + 2,
                life: 30, // Reduced from 40 to 30 frames
                maxLife: 30,
                vx: (Math.random() - 0.5) * 6,
                vy: (Math.random() - 0.5) * 6
            });
        }
    }
    
    createTeleportParticles(x, y) {
        for (let i = 0; i < 15; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 30,
                y: y + (Math.random() - 0.5) * 30,
                color: '#00CED1',
                size: Math.random() * 5 + 3,
                life: 50,
                maxLife: 50,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8
            });
        }
    }
    
    createBouncePadParticles(x, y, direction) {
        for (let i = 0; i < 12; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 20,
                y: y + (Math.random() - 0.5) * 20,
                color: '#32CD32',
                size: Math.random() * 4 + 2,
                life: 35,
                maxLife: 35,
                vx: Math.cos(direction + (Math.random() - 0.5) * 0.8) * 6,
                vy: Math.sin(direction + (Math.random() - 0.5) * 0.8) * 6
            });
        }
    }
    
    createCheckpointParticles(x, y) {
        for (let i = 0; i < 10; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 25,
                y: y + (Math.random() - 0.5) * 25,
                color: '#FFD700',
                size: Math.random() * 3 + 2,
                life: 45,
                maxLife: 45,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4
            });
        }
    }
    
    createTreasureParticles(x, y) {
        for (let i = 0; i < 20; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 40,
                y: y + (Math.random() - 0.5) * 40,
                color: ['#FFD700', '#DAA520', '#FFA500'][Math.floor(Math.random() * 3)],
                size: Math.random() * 6 + 3,
                life: 60,
                maxLife: 60,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10
            });
        }
    }
    
    createPowerActivationParticles(x, y, powerName) {
        const colors = {
            ghostMode: '#E6E6FA',
            doubleScore: '#FFD700',
            freezeTime: '#87CEEB',
            invincibility: '#FF6347'
        };
        
        for (let i = 0; i < 15; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 30,
                y: y + (Math.random() - 0.5) * 30,
                color: colors[powerName] || '#FFFFFF',
                size: Math.random() * 5 + 3,
                life: 50,
                maxLife: 50,
                vx: (Math.random() - 0.5) * 7,
                vy: (Math.random() - 0.5) * 7
            });
        }
    }
    
    createBulletFireParticles(x, y) {
        for (let i = 0; i < 20; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 15,
                y: y + (Math.random() - 0.5) * 15,
                color: '#FFD700',
                size: Math.random() * 3 + 1,
                life: 25,
                maxLife: 25,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8
            });
        }
    }
    
    createDestructionParticles(x, y, color) {
        for (let i = 0; i < 10; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 20,
                y: y + (Math.random() - 0.5) * 20,
                color: color,
                size: Math.random() * 4 + 2,
                life: 35,
                maxLife: 35,
                vx: (Math.random() - 0.5) * 6,
                vy: (Math.random() - 0.5) * 6
            });
        }
    }
    
    spawnHazards() {
        // Moving walls
        for (let i = 0; i < 5; i++) {
            this.hazards.push({
                type: 'movingWall',
                x: Math.random() * this.worldSize,
                y: Math.random() * this.worldSize,
                width: 20,
                height: 100,
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2,
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
                lastDamage: 0 // Add cooldown tracking
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
                id: i,
                x: Math.random() * this.worldSize,
                y: Math.random() * this.worldSize,
                radius: 20,
                color: '#FF1493',
                linkedPortal: null
            };
            
            const portalB = {
                type: 'portal',
                id: i,
                x: Math.random() * this.worldSize,
                y: Math.random() * this.worldSize,
                radius: 20,
                color: '#FF1493',
                linkedPortal: portalA
            };
            
            portalA.linkedPortal = portalB;
            this.interactiveObjects.push(portalA, portalB);
        }
        
        // Bounce pads
        for (let i = 0; i < 6; i++) {
            this.interactiveObjects.push({
                type: 'bouncePad',
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
                x: Math.random() * this.worldSize,
                y: Math.random() * this.worldSize,
                width: 30,
                height: 25,
                color: '#B8860B',
                opened: false
            });
        }
    }
    
    handlePointerStart(clientX, clientY) {
        if (this.gameState !== 'playing' || !this.playerId) return;
        
        this.isPressed = true;
        this.updateTarget(clientX, clientY);
        
        // Send target update to server
        this.sendToServer({
            type: 'updateTarget',
            targetX: this.currentTargetX,
            targetY: this.currentTargetY,
            moving: true
        });
    }
    
    handlePointerMove(clientX, clientY) {
        if (this.isPressed && this.gameState === 'playing' && this.playerId) {
            this.updateTarget(clientX, clientY);
            
            // Send target update to server
            this.sendToServer({
                type: 'updateTarget',
                targetX: this.currentTargetX,
                targetY: this.currentTargetY,
                moving: true
            });
        }
    }
    
    handlePointerEnd() {
        this.isPressed = false;
        // Don't stop moving immediately - let snake continue to last target
    }
    
    updateTarget(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = clientX - rect.left;
        const screenY = clientY - rect.top;
        
        // Convert screen coordinates to world coordinates (accounting for zoom)
        this.currentTargetX = (screenX / this.camera.zoom) + this.camera.x;
        this.currentTargetY = (screenY / this.camera.zoom) + this.camera.y;
        
        this.snake.targetX = this.currentTargetX;
        this.snake.targetY = this.currentTargetY;
    }
    
    getPinchDistance() {
        if (this.touches.length < 2) return 0;
        
        const dx = this.touches[0].clientX - this.touches[1].clientX;
        const dy = this.touches[0].clientY - this.touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    handlePinchZoom() {
        if (this.touches.length < 2) return;
        
        const currentDistance = this.getPinchDistance();
        if (this.lastPinchDistance === 0) {
            this.lastPinchDistance = currentDistance;
            return;
        }
        
        const zoomFactor = currentDistance / this.lastPinchDistance;
        
        // Get center point between the two touches
        const centerX = (this.touches[0].clientX + this.touches[1].clientX) / 2;
        const centerY = (this.touches[0].clientY + this.touches[1].clientY) / 2;
        
        const rect = this.canvas.getBoundingClientRect();
        const screenCenterX = centerX - rect.left;
        const screenCenterY = centerY - rect.top;
        
        this.zoom(screenCenterX, screenCenterY, zoomFactor);
        this.lastPinchDistance = currentDistance;
    }
    
    zoom(screenX, screenY, zoomFactor) {
        const oldZoom = this.camera.zoom;
        const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, oldZoom * zoomFactor));
        
        if (newZoom === oldZoom) return;
        
        // Calculate world coordinates of the zoom point
        const worldX = (screenX / oldZoom) + this.camera.x;
        const worldY = (screenY / oldZoom) + this.camera.y;
        
        // Update zoom
        this.camera.zoom = newZoom;
        
        // Adjust camera position to keep zoom point stationary
        this.camera.x = worldX - (screenX / newZoom);
        this.camera.y = worldY - (screenY / newZoom);
    }
    
    spawnInitialFood() {
        for (let i = 0; i < this.maxFood; i++) {
            this.spawnFood();
        }
    }
    
    spawnFood() {
        const food = {
            x: Math.random() * this.worldSize,
            y: Math.random() * this.worldSize,
            color: this.getRandomFoodColor()
        };
        this.food.push(food);
    }
    
    getRandomFoodColor() {
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#FF9F43', '#26DE81'];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    spawnInitialBonusBoxes() {
        for (let i = 0; i < this.maxBonusBoxes; i++) {
            this.spawnBonusBox();
        }
    }
    
    spawnBonusBox() {
        const rand = Math.random();
        let type, color, icon;
        
        if (rand < 0.3) {
            // Speed bonus (30% chance)
            const speedMultipliers = [2, 3, 5];
            const multiplier = speedMultipliers[Math.floor(Math.random() * speedMultipliers.length)];
            type = 'speed_bonus';
            color = '#00FF00';
            icon = '⚡';
            
            const bonusBox = {
                x: Math.random() * this.worldSize,
                y: Math.random() * this.worldSize,
                type: type,
                color: color,
                icon: icon,
                value: multiplier
            };
            this.bonusBoxes.push(bonusBox);
        } else if (rand < 0.5) {
            // Growth bonus (20% chance)
            const growthAmounts = [10, 20, 30, 40, 50];
            const growth = growthAmounts[Math.floor(Math.random() * growthAmounts.length)];
            type = 'growth_bonus';
            color = '#FFD700';
            icon = '🎁';
            
            const bonusBox = {
                x: Math.random() * this.worldSize,
                y: Math.random() * this.worldSize,
                type: type,
                color: color,
                icon: icon,
                value: growth
            };
            this.bonusBoxes.push(bonusBox);
        } else {
            // Malus (50% chance)
            const malusTypes = ['speed_malus', 'shrink_malus'];
            const malusType = malusTypes[Math.floor(Math.random() * malusTypes.length)];
            
            if (malusType === 'speed_malus') {
                const speedMultipliers = [0.5, 0.75, 1.0];
                const multiplier = speedMultipliers[Math.floor(Math.random() * speedMultipliers.length)];
                type = 'speed_malus';
                color = '#FF0000';
                icon = '💀';
                
                const bonusBox = {
                    x: Math.random() * this.worldSize,
                    y: Math.random() * this.worldSize,
                    type: type,
                    color: color,
                    icon: icon,
                    value: multiplier
                };
                this.bonusBoxes.push(bonusBox);
            } else {
                // Shrink malus
                type = 'shrink_malus';
                color = '#FF0000';
                icon = '💀';
                
                const bonusBox = {
                    x: Math.random() * this.worldSize,
                    y: Math.random() * this.worldSize,
                    type: type,
                    color: color,
                    icon: icon,
                    value: 10
                };
                this.bonusBoxes.push(bonusBox);
            }
        }
    }
    
    updateSnake() {
        if (!this.snake.moving) return;
        
        const head = this.snake.segments[0];
        const dx = this.snake.targetX - head.x;
        const dy = this.snake.targetY - head.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Stop when close to target (regardless of press state)
        if (distance < 5) {
            this.snake.moving = false;
            return;
        }
        
        // Move head towards target
        const angle = Math.atan2(dy, dx);
        const newHead = {
            x: head.x + Math.cos(angle) * this.snake.speed,
            y: head.y + Math.sin(angle) * this.snake.speed
        };
        
        // Wrap around world boundaries (unless in ghost mode)
        if (!this.temporaryPowers.ghostMode.active) {
            if (newHead.x < 0) newHead.x = this.worldSize;
            if (newHead.x > this.worldSize) newHead.x = 0;
            if (newHead.y < 0) newHead.y = this.worldSize;
            if (newHead.y > this.worldSize) newHead.y = 0;
        }
        
        this.snake.segments.unshift(newHead);
        
        // Check collisions
        this.checkFoodCollision(newHead);
        this.checkBonusBoxCollision(newHead);
        this.checkHazardCollision(newHead);
        this.checkInteractiveObjectCollision(newHead);
        this.checkSelfCollision(newHead);
        
        // Handle snake growth
        if (this.snake.growthQueue > 0) {
            // Don't remove tail when growing
            this.snake.growthQueue--;
        } else {
            // Remove tail to maintain current length
            this.snake.segments.pop();
        }
        
        // Update segments to follow smoothly
        for (let i = 1; i < this.snake.segments.length; i++) {
            const current = this.snake.segments[i];
            const target = this.snake.segments[i - 1];
            
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
    
    checkFoodCollision(head) {
        // Apply magnet effect
        if (this.abilities.magnet.active) {
            this.food.forEach(food => {
                const distance = Math.sqrt((head.x - food.x) ** 2 + (head.y - food.y) ** 2);
                if (distance < 750) { // Enhanced magnet range (5x from 150)
                    const angle = Math.atan2(head.y - food.y, head.x - food.x);
                    const pullForce = Math.max(1, 300 / distance); // Stronger pull when closer
                    food.x += Math.cos(angle) * pullForce;
                    food.y += Math.sin(angle) * pullForce;
                }
            });
        }
        
        for (let i = this.food.length - 1; i >= 0; i--) {
            const food = this.food[i];
            const distance = Math.sqrt((head.x - food.x) ** 2 + (head.y - food.y) ** 2);
            
            if (distance < this.foodSize + 10) { // 10 is snake head radius
                // Remove eaten food
                this.food.splice(i, 1);
                
                // Calculate score (with double score if active)
                let points = 10;
                if (this.temporaryPowers.doubleScore.active) points *= 2;
                
                this.snake.score += points;
                this.snake.growthQueue += 10; // Grow by 10 segments
                
                // Update achievements
                this.achievements.collector.foodEaten++;
                
                // Spawn new food to maintain count
                this.spawnFood();
                
                break; // Only eat one food per frame
            }
        }
    }
    
    checkBonusBoxCollision(head) {
        for (let i = this.bonusBoxes.length - 1; i >= 0; i--) {
            const box = this.bonusBoxes[i];
            const distance = Math.sqrt((head.x - box.x) ** 2 + (head.y - box.y) ** 2);
            
            if (distance < this.bonusBoxSize + 10) { // 10 is snake head radius
                // Remove bonus box
                this.bonusBoxes.splice(i, 1);
                
                // Apply effect
                this.applyBonusEffect(box);
                
                // Spawn new bonus box to maintain count
                this.spawnBonusBox();
                
                break; // Only collect one bonus per frame
            }
        }
    }
    
    applyBonusEffect(box) {
        const currentTime = Date.now();
        
        switch (box.type) {
            case 'speed_bonus':
                this.snake.speed = this.baseSpeed * box.value;
                this.activeEffects.push({
                    type: 'speed',
                    endTime: currentTime + 15000, // 15 seconds
                    value: box.value
                });
                break;
                
            case 'growth_bonus':
                this.snake.growthQueue += box.value;
                this.snake.score += box.value; // Bonus points
                break;
                
            case 'speed_malus':
                // Ignore malus if shield is active
                if (this.abilities.shield.active) break;
                
                this.snake.speed = this.baseSpeed * box.value;
                this.activeEffects.push({
                    type: 'speed',
                    endTime: currentTime + 15000, // 15 seconds
                    value: box.value
                });
                this.achievements.riskTaker.malusCollected++;
                break;
                
            case 'shrink_malus':
                // Ignore malus if shield is active
                if (this.abilities.shield.active) break;
                
                // Remove segments (minimum 5 segments)
                const segmentsToRemove = Math.min(box.value, this.snake.segments.length - 5);
                for (let i = 0; i < segmentsToRemove; i++) {
                    if (this.snake.segments.length > 5) {
                        this.snake.segments.pop();
                    }
                }
                this.achievements.riskTaker.malusCollected++;
                break;
        }
    }
    
    checkHazardCollision(head) {
        for (const hazard of this.hazards) {
            let collision = false;
            let distance = 0;
            
            switch (hazard.type) {
                case 'movingWall':
                    collision = head.x >= hazard.x && head.x <= hazard.x + hazard.width &&
                               head.y >= hazard.y && head.y <= hazard.y + hazard.height;
                    break;
                    
                case 'poisonZone':
                    distance = Math.sqrt((head.x - hazard.x) ** 2 + (head.y - hazard.y) ** 2);
                    collision = distance < hazard.radius + 10;
                    // Only handle poison if enough time has passed
                    if (collision && !this.temporaryPowers.invincibility.active) {
                        this.handleHazardEffect(hazard);
                    }
                    continue; // Skip the general collision handling below
                    
                case 'speedTrap':
                case 'teleporter':
                    distance = Math.sqrt((head.x - hazard.x) ** 2 + (head.y - hazard.y) ** 2);
                    collision = distance < hazard.radius + 10;
                    break;
            }
            
            if (collision && !this.temporaryPowers.invincibility.active && hazard.type !== 'poisonZone') {
                this.handleHazardEffect(hazard);
            }
        }
    }
    
    handleHazardEffect(hazard) {
        const currentTime = Date.now();
        
        switch (hazard.type) {
            case 'movingWall':
                // Bounce back
                const head = this.snake.segments[0];
                const dx = head.x - (hazard.x + hazard.width / 2);
                const dy = head.y - (hazard.y + hazard.height / 2);
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance > 0) {
                    const bounceForce = 50;
                    this.snake.segments[0].x = head.x + (dx / distance) * bounceForce;
                    this.snake.segments[0].y = head.y + (dy / distance) * bounceForce;
                }
                break;
                
            case 'poisonZone':
                // Gradual shrinking effect with cooldown
                if (currentTime - hazard.lastDamage > 1000) { // 1 second cooldown
                    if (this.snake.segments.length > 5) {
                        this.snake.segments.pop();
                        this.createDamageParticles(this.snake.segments[0].x, this.snake.segments[0].y, '#9932CC');
                        hazard.lastDamage = currentTime;
                    }
                }
                break;
                
            case 'speedTrap':
                // Slow down effect with cooldown to prevent multiple applications
                if (!hazard.lastSlowTime || currentTime - hazard.lastSlowTime > 2000) {
                    this.snake.speed = this.baseSpeed * hazard.slowFactor;
                    this.activeEffects.push({
                        type: 'speed',
                        endTime: currentTime + 5000, // 5 seconds
                        value: hazard.slowFactor
                    });
                    hazard.lastSlowTime = currentTime;
                }
                break;
                
            case 'teleporter':
                // Random teleportation with cooldown
                if (!hazard.cooldown) hazard.cooldown = 0;
                if (currentTime - hazard.cooldown > 2000) {
                    const newX = Math.random() * this.worldSize;
                    const newY = Math.random() * this.worldSize;
                    this.snake.segments[0].x = newX;
                    this.snake.segments[0].y = newY;
                    this.snake.targetX = newX;
                    this.snake.targetY = newY;
                    hazard.cooldown = currentTime;
                    this.createTeleportParticles(newX, newY);
                }
                break;
        }
    }
    
    checkInteractiveObjectCollision(head) {
        for (const obj of this.interactiveObjects) {
            let collision = false;
            let distance = 0;
            
            switch (obj.type) {
                case 'treasureChest':
                    collision = head.x >= obj.x - obj.width/2 && head.x <= obj.x + obj.width/2 &&
                               head.y >= obj.y - obj.height/2 && head.y <= obj.y + obj.height/2;
                    break;
                    
                default:
                    distance = Math.sqrt((head.x - obj.x) ** 2 + (head.y - obj.y) ** 2);
                    collision = distance < obj.radius + 10;
                    break;
            }
            
            if (collision) {
                this.handleInteractiveObjectEffect(obj);
            }
        }
    }
    
    handleInteractiveObjectEffect(obj) {
        const head = this.snake.segments[0];
        
        switch (obj.type) {
            case 'portal':
                if (obj.linkedPortal) {
                    this.snake.segments[0].x = obj.linkedPortal.x;
                    this.snake.segments[0].y = obj.linkedPortal.y;
                    this.createTeleportParticles(obj.linkedPortal.x, obj.linkedPortal.y);
                }
                break;
                
            case 'bouncePad':
                // Launch in specified direction
                const bounceDistance = 80 * obj.power;
                this.snake.segments[0].x = head.x + Math.cos(obj.direction) * bounceDistance;
                this.snake.segments[0].y = head.y + Math.sin(obj.direction) * bounceDistance;
                this.createBouncePadParticles(obj.x, obj.y, obj.direction);
                break;
                
            case 'checkpoint':
                if (!obj.activated) {
                    obj.activated = true;
                    obj.color = '#FFD700';
                    this.snake.checkpointX = obj.x;
                    this.snake.checkpointY = obj.y;
                    this.createCheckpointParticles(obj.x, obj.y);
                }
                break;
                
            case 'treasureChest':
                if (!obj.opened) {
                    obj.opened = true;
                    obj.color = '#DAA520';
                    
                    // Multiple rewards
                    this.snake.score += 100;
                    this.snake.growthQueue += 20;
                    
                    // Random temporary power
                    const powers = ['ghostMode', 'doubleScore', 'freezeTime', 'invincibility'];
                    const randomPower = powers[Math.floor(Math.random() * powers.length)];
                    this.activateTemporaryPower(randomPower);
                    
                    this.createTreasureParticles(obj.x, obj.y);
                }
                break;
        }
    }
    
    checkSelfCollision(head) {
        // Skip collision check if shield is active (prevents all death)
        if (this.abilities.shield.active || this.temporaryPowers.ghostMode.active) {
            return;
        }
        
        // Only check for self-collision if snake is long enough and moving
        if (this.snake.segments.length < 10 || !this.snake.moving) {
            return;
        }
        
        // Check collision with own body (skip more segments to avoid false positives)
        for (let i = 8; i < this.snake.segments.length; i++) {
            const segment = this.snake.segments[i];
            const distance = Math.sqrt((head.x - segment.x) ** 2 + (head.y - segment.y) ** 2);
            
            if (distance < 12) { // Reduced collision radius and more segments to skip
                this.gameOver();
                return;
            }
        }
    }
    
    gameOver() {
        if (this.gameState === 'gameOver') return; // Prevent multiple calls
        
        this.gameState = 'gameOver';
        this.snake.moving = false;
        
        // Create explosion effect
        this.createExplosionEffect();
        
        // Show game over modal after explosion animation
        setTimeout(() => {
            this.showGameOverModal();
        }, 1000);
    }
    
    createExplosionEffect() {
        const head = this.snake.segments[0];
        
        // Large explosion at head
        for (let i = 0; i < 50; i++) {
            const angle = (i / 50) * Math.PI * 2;
            const velocity = Math.random() * 15 + 5;
            this.particles.push({
                x: head.x,
                y: head.y,
                color: ['#FF6B6B', '#FF9F43', '#FFD700', '#FF8C00'][Math.floor(Math.random() * 4)],
                size: Math.random() * 8 + 4,
                life: 60,
                maxLife: 60,
                vx: Math.cos(angle) * velocity,
                vy: Math.sin(angle) * velocity
            });
        }
        
        // Smaller explosions along the body
        this.snake.segments.forEach((segment, index) => {
            if (index % 3 === 0) { // Every 3rd segment
                setTimeout(() => {
                    for (let i = 0; i < 15; i++) {
                        this.particles.push({
                            x: segment.x + (Math.random() - 0.5) * 20,
                            y: segment.y + (Math.random() - 0.5) * 20,
                            color: ['#FF6B6B', '#FF9F43'][Math.floor(Math.random() * 2)],
                            size: Math.random() * 6 + 3,
                            life: 40,
                            maxLife: 40,
                            vx: (Math.random() - 0.5) * 10,
                            vy: (Math.random() - 0.5) * 10
                        });
                    }
                }, index * 100); // Delayed explosions
            }
        });
    }
    
    showGameOverModal() {
        const modal = document.getElementById('gameOverModal');
        const survivalTime = Math.floor((Date.now() - this.gameStartTime) / 1000);
        
        // Update stats in modal
        document.getElementById('finalScore').textContent = this.snake.score;
        document.getElementById('finalLength').textContent = this.snake.segments.length;
        document.getElementById('finalFoodEaten').textContent = this.achievements.collector.foodEaten;
        document.getElementById('survivalTime').textContent = survivalTime + 's';
        
        // Show modal with animation
        modal.style.display = 'flex';
        setTimeout(() => {
            modal.style.opacity = '1';
        }, 10);
    }
    
    updateCamera() {
        const myPlayer = this.players.get(this.playerId);
        if (!myPlayer || !myPlayer.segments || myPlayer.segments.length === 0) return;
        
        const head = myPlayer.segments[0];
        const targetX = head.x - (this.canvas.width / 2) / this.camera.zoom;
        const targetY = head.y - (this.canvas.height / 2) / this.camera.zoom;
        
        // Smooth camera following
        this.camera.x += (targetX - this.camera.x) * 0.1;
        this.camera.y += (targetY - this.camera.y) * 0.1;
    }
    
    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.save();
        
        // Apply zoom and camera translation
        this.ctx.scale(this.camera.zoom, this.camera.zoom);
        this.ctx.translate(-this.camera.x, -this.camera.y);
        
        // Draw grid
        this.drawGrid();
        
        // Draw food
        this.drawFood();
        
        // Draw bonus boxes
        this.drawBonusBoxes();
        
        // Draw hazards
        this.drawHazards();
        
        // Draw interactive objects
        this.drawInteractiveObjects();
        
        // Draw all players
        this.drawPlayers();
        
        // Draw bullets
        this.drawBullets();
        
        // Draw particles
        this.drawParticles();
        
        // Draw target if pressed or still moving to target
        if (this.isPressed || this.snake.moving) {
            this.drawTarget();
        }
        
        this.ctx.restore();
        
        // Draw UI elements
        this.drawZoomIndicator();
        this.drawLeaderboard();
        this.updateAbilityUI();
    }
    
    drawGrid() {
        const gridSize = 50;
        
        // Calculate visible area accounting for zoom
        const visibleWidth = this.canvas.width / this.camera.zoom;
        const visibleHeight = this.canvas.height / this.camera.zoom;
        
        // Add padding to ensure grid covers the entire visible area
        const padding = gridSize * 2;
        const startX = Math.floor((this.camera.x - padding) / gridSize) * gridSize;
        const startY = Math.floor((this.camera.y - padding) / gridSize) * gridSize;
        const endX = startX + visibleWidth + padding * 2;
        const endY = startY + visibleHeight + padding * 2;
        
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 1 / this.camera.zoom; // Adjust line width for zoom
        
        for (let x = startX; x < endX; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, startY);
            this.ctx.lineTo(x, endY);
            this.ctx.stroke();
        }
        
        for (let y = startY; y < endY; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(startX, y);
            this.ctx.lineTo(endX, y);
            this.ctx.stroke();
        }
    }
    
    drawPlayers() {
        this.players.forEach((player, playerId) => {
            if (!player.alive || !player.segments || player.segments.length === 0) return;
            
            // Get interpolated positions
            const interpolatedPlayer = this.getInterpolatedPlayer(player);
            this.drawPlayer(interpolatedPlayer, playerId === this.playerId);
        });
    }
    
    calculateSegmentVelocities(oldPlayer, newPlayer, updateTime) {
        if (!oldPlayer.segments || !newPlayer.segments || !oldPlayer.lastUpdateTime) return;
        
        const deltaTime = updateTime - oldPlayer.lastUpdateTime;
        if (deltaTime <= 0) return;
        
        // Calculate velocities for each segment
        newPlayer.segmentVelocities = newPlayer.segments.map((segment, index) => {
            const oldSegment = oldPlayer.segments[index];
            if (!oldSegment) return { vx: 0, vy: 0 };
            
            return {
                vx: (segment.x - oldSegment.x) / deltaTime,
                vy: (segment.y - oldSegment.y) / deltaTime
            };
        });
    }
    
    initializePlayerVelocities(player) {
        if (!player.segments) return;
        
        // Initialize all velocities to zero for new players
        player.segmentVelocities = player.segments.map(() => ({ vx: 0, vy: 0 }));
    }
    
    getInterpolatedPlayer(player) {
        const currentTime = Date.now();
        const interpolationTime = 100; // 100ms between updates (10 FPS)
        
        // If we don't have previous data, return current player
        if (!player.previousSegments || !player.previousUpdateTime || !player.segmentVelocities) {
            return player;
        }
        
        // Calculate interpolation factor (0 to 1)
        const timeSinceUpdate = currentTime - player.interpolationStartTime;
        let factor = Math.min(timeSinceUpdate / interpolationTime, 1.2); // Allow slight extrapolation
        
        // Create interpolated player
        const interpolatedPlayer = { ...player };
        
        // Advanced interpolation with velocity prediction and smoothing
        interpolatedPlayer.segments = player.segments.map((segment, index) => {
            const prevSegment = player.previousSegments[index];
            const velocity = player.segmentVelocities[index];
            
            if (!prevSegment || !velocity) return segment;
            
            // Use different interpolation based on factor
            let x, y;
            
            if (factor <= 1.0) {
                // Normal interpolation with smoothing
                const t = this.smoothStep(factor);
                x = prevSegment.x + (segment.x - prevSegment.x) * t;
                y = prevSegment.y + (segment.y - prevSegment.y) * t;
            } else {
                // Extrapolation using velocity
                const extraTime = (factor - 1.0) * interpolationTime;
                x = segment.x + velocity.vx * extraTime;
                y = segment.y + velocity.vy * extraTime;
            }
            
            // Add micro-smoothing for very small movements
            if (index > 0 && interpolatedPlayer.segments[index - 1]) {
                const prevInterpolated = interpolatedPlayer.segments[index - 1];
                const distance = Math.sqrt(Math.pow(x - prevInterpolated.x, 2) + Math.pow(y - prevInterpolated.y, 2));
                
                // If segments are too close or too far, adjust
                const idealDistance = 20; // Distance between segments
                if (distance > 0 && distance !== idealDistance) {
                    const ratio = idealDistance / distance;
                    const dx = x - prevInterpolated.x;
                    const dy = y - prevInterpolated.y;
                    
                    x = prevInterpolated.x + dx * ratio;
                    y = prevInterpolated.y + dy * ratio;
                }
            }
            
            return { x, y };
        });
        
        return interpolatedPlayer;
    }
    
    // Smooth step function for more natural interpolation
    smoothStep(t) {
        // Cubic smoothstep function: 3t² - 2t³
        return t * t * (3 - 2 * t);
    }
    
    drawPlayer(player, isMe) {
        const segmentSize = 10;
        
        // Draw body segments
        for (let i = player.segments.length - 1; i >= 0; i--) {
            const segment = player.segments[i];
            const isHead = i === 0;
            
            // Apply visual effects based on active abilities
            let segmentColor = player.color;
            let effectRadius = segmentSize;
            
            if (isHead) {
                // Shield ability - golden glow
                if (player.abilities && player.abilities.shield && player.abilities.shield.active) {
                    this.ctx.shadowColor = '#FFD700';
                    this.ctx.shadowBlur = 15;
                }
                
                // Ghost mode - ethereal appearance
                if (this.temporaryPowers.ghostMode.active) {
                    segmentColor = 'rgba(230, 230, 250, 0.6)';
                }
                
                // Invincibility - red glow
                if (this.temporaryPowers.invincibility.active) {
                    this.ctx.shadowColor = '#FF6347';
                    this.ctx.shadowBlur = 12;
                }
            }
            
            // Body color gets darker towards tail
            const alpha = isHead ? 1 : Math.max(0.3, 1 - (i / player.segments.length) * 0.7);
            this.ctx.fillStyle = isHead ? segmentColor : this.adjustColorAlpha(player.color, alpha);
            
            this.ctx.beginPath();
            this.ctx.arc(segment.x, segment.y, effectRadius, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Reset shadow effects
            this.ctx.shadowBlur = 0;
            
            // Draw eyes on head
            if (isHead && player.segments.length > 1) {
                const nextSegment = player.segments[1];
                const angle = Math.atan2(segment.y - nextSegment.y, segment.x - nextSegment.x);
                
                this.ctx.fillStyle = 'white';
                const eyeOffset = 6;
                const eyeSize = 2;
                
                // Left eye
                const leftEyeX = segment.x + Math.cos(angle - 0.5) * eyeOffset;
                const leftEyeY = segment.y + Math.sin(angle - 0.5) * eyeOffset;
                this.ctx.beginPath();
                this.ctx.arc(leftEyeX, leftEyeY, eyeSize, 0, Math.PI * 2);
                this.ctx.fill();
                
                // Right eye
                const rightEyeX = segment.x + Math.cos(angle + 0.5) * eyeOffset;
                const rightEyeY = segment.y + Math.sin(angle + 0.5) * eyeOffset;
                this.ctx.beginPath();
                this.ctx.arc(rightEyeX, rightEyeY, eyeSize, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }
        
        // Draw player name
        if (player.segments.length > 0) {
            const head = player.segments[0];
            this.ctx.fillStyle = 'white';
            this.ctx.font = '12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(player.name, head.x, head.y - 20);
        }
    }
    
    createTrailParticles() {
        const head = this.snake.segments[0];
        
        // Different trail effects based on active powers
        // Removed phase ability trail effects
        
        if (this.temporaryPowers.doubleScore.active) {
            // Golden sparkle trail
            if (Math.random() < 0.3) {
                this.particles.push({
                    x: head.x + (Math.random() - 0.5) * 15,
                    y: head.y + (Math.random() - 0.5) * 15,
                    color: '#FFD700',
                    size: Math.random() * 2 + 1,
                    life: 25,
                    maxLife: 25,
                    vx: (Math.random() - 0.5) * 3,
                    vy: (Math.random() - 0.5) * 3
                });
            }
        }
        
        if (this.abilities.magnet.active) {
            // Magnetic field visualization
            if (Math.random() < 0.2) {
                this.particles.push({
                    x: head.x + (Math.random() - 0.5) * 20,
                    y: head.y + (Math.random() - 0.5) * 20,
                    color: '#4169E1',
                    size: Math.random() * 2 + 1,
                    life: 15,
                    maxLife: 15,
                    vx: (Math.random() - 0.5) * 1,
                    vy: (Math.random() - 0.5) * 1
                });
            }
        }
    }
    
    drawTarget() {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(this.snake.targetX, this.snake.targetY, 15, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // Draw crosshair
        this.ctx.beginPath();
        this.ctx.moveTo(this.snake.targetX - 10, this.snake.targetY);
        this.ctx.lineTo(this.snake.targetX + 10, this.snake.targetY);
        this.ctx.moveTo(this.snake.targetX, this.snake.targetY - 10);
        this.ctx.lineTo(this.snake.targetX, this.snake.targetY + 10);
        this.ctx.stroke();
    }
    
    adjustColorAlpha(color, alpha) {
        if (!color) return '#4ECDC4'; // Default color
        if (color.startsWith('#')) {
            const r = parseInt(color.substr(1, 2), 16);
            const g = parseInt(color.substr(3, 2), 16);
            const b = parseInt(color.substr(5, 2), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        return color;
    }
    
    drawFood() {
        this.food.forEach(food => {
            this.ctx.fillStyle = food.color;
            this.ctx.beginPath();
            this.ctx.arc(food.x, food.y, this.foodSize, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Add a subtle glow effect
            this.ctx.shadowColor = food.color;
            this.ctx.shadowBlur = 10;
            this.ctx.beginPath();
            this.ctx.arc(food.x, food.y, this.foodSize * 0.6, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        });
    }
    
    drawBonusBoxes() {
        this.bonusBoxes.forEach(box => {
            // Draw box background
            this.ctx.fillStyle = box.color;
            this.ctx.fillRect(box.x - this.bonusBoxSize, box.y - this.bonusBoxSize, 
                            this.bonusBoxSize * 2, this.bonusBoxSize * 2);
            
            // Draw box border
            this.ctx.strokeStyle = box.color === '#FF0000' ? '#8B0000' : '#FFFFFF';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(box.x - this.bonusBoxSize, box.y - this.bonusBoxSize, 
                             this.bonusBoxSize * 2, this.bonusBoxSize * 2);
            
            // Draw icon
            this.ctx.fillStyle = 'white';
            this.ctx.font = '16px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(box.icon, box.x, box.y);
            
            // Add glow effect
            this.ctx.shadowColor = box.color;
            this.ctx.shadowBlur = 15;
            this.ctx.fillRect(box.x - this.bonusBoxSize, box.y - this.bonusBoxSize, 
                            this.bonusBoxSize * 2, this.bonusBoxSize * 2);
            this.ctx.shadowBlur = 0;
        });
    }
    
    drawZoomIndicator() {
        const head = this.snake.segments[0];
        
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        this.ctx.font = '14px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`Zoom: ${Math.round(this.camera.zoom * 100)}%`, 10, this.canvas.height - 30);
        this.ctx.fillText(`Position: ${Math.round(head.x)}, ${Math.round(head.y)}`, 10, this.canvas.height - 10);
    }
    
    drawLeaderboard() {
        const padding = 20;
        const width = 250;
        const playersArray = Array.from(this.players.values()).filter(p => p.alive);
        const height = Math.max(120, 50 + playersArray.length * 25);
        const x = this.canvas.width - width - padding;
        const y = padding;
        
        // Draw background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(x, y, width, height);
        
        // Draw border
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x, y, width, height);
        
        // Draw title
        this.ctx.fillStyle = '#4ECDC4';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('🏆 Leaderboard', x + width/2, y + 25);
        
        // Sort players by score
        playersArray.sort((a, b) => b.score - a.score);
        
        // Draw player rankings
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'left';
        
        playersArray.forEach((player, index) => {
            const yPos = y + 45 + index * 25;
            const isMe = player.id === this.playerId;
            
            // Highlight current player
            if (isMe) {
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                this.ctx.fillRect(x + 5, yPos - 15, width - 10, 20);
            }
            
            // Draw rank
            this.ctx.fillStyle = index === 0 ? '#FFD700' : '#FFFFFF';
            this.ctx.fillText(`#${index + 1}`, x + 10, yPos);
            
            // Draw player name
            this.ctx.fillStyle = isMe ? '#4ECDC4' : '#FFFFFF';
            this.ctx.fillText(player.name, x + 35, yPos);
            
            // Draw score
            this.ctx.fillStyle = '#FFEAA7';
            this.ctx.textAlign = 'right';
            this.ctx.fillText(`${player.score}`, x + width - 10, yPos);
            this.ctx.textAlign = 'left';
        });
        
        // Draw connection status
        this.ctx.fillStyle = this.connectionStatus === 'connected' ? '#4ECDC4' : '#FF6B6B';
        this.ctx.font = '10px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(this.connectionStatus, x + width/2, y + height - 10);
    }
    
    drawHazards() {
        this.hazards.forEach(hazard => {
            switch (hazard.type) {
                case 'movingWall':
                    this.ctx.fillStyle = hazard.color;
                    this.ctx.fillRect(hazard.x, hazard.y, hazard.width, hazard.height);
                    
                    // Add warning border
                    this.ctx.strokeStyle = '#FF0000';
                    this.ctx.lineWidth = 2;
                    this.ctx.strokeRect(hazard.x, hazard.y, hazard.width, hazard.height);
                    break;
                    
                case 'poisonZone':
                    // Pulsing poison zone
                    this.ctx.fillStyle = `rgba(153, 50, 204, ${hazard.intensity})`;
                    this.ctx.beginPath();
                    this.ctx.arc(hazard.x, hazard.y, hazard.radius, 0, Math.PI * 2);
                    this.ctx.fill();
                    
                    // Poison particles
                    this.ctx.strokeStyle = hazard.color;
                    this.ctx.lineWidth = 1;
                    this.ctx.stroke();
                    break;
                    
                case 'speedTrap':
                    // Speed trap with warning pattern
                    this.ctx.fillStyle = `rgba(255, 140, 0, 0.4)`;
                    this.ctx.beginPath();
                    this.ctx.arc(hazard.x, hazard.y, hazard.radius, 0, Math.PI * 2);
                    this.ctx.fill();
                    
                    // Warning stripes
                    this.ctx.strokeStyle = hazard.color;
                    this.ctx.lineWidth = 3;
                    for (let i = 0; i < 8; i++) {
                        const angle = (i / 8) * Math.PI * 2;
                        this.ctx.beginPath();
                        this.ctx.moveTo(hazard.x, hazard.y);
                        this.ctx.lineTo(
                            hazard.x + Math.cos(angle) * hazard.radius,
                            hazard.y + Math.sin(angle) * hazard.radius
                        );
                        this.ctx.stroke();
                    }
                    break;
                    
                case 'teleporter':
                    // Animated teleporter
                    const rotation = hazard.rotation || 0;
                    this.ctx.save();
                    this.ctx.translate(hazard.x, hazard.y);
                    this.ctx.rotate(rotation);
                    
                    // Outer ring
                    this.ctx.strokeStyle = hazard.color;
                    this.ctx.lineWidth = 4;
                    this.ctx.beginPath();
                    this.ctx.arc(0, 0, hazard.radius, 0, Math.PI * 2);
                    this.ctx.stroke();
                    
                    // Inner core
                    this.ctx.fillStyle = hazard.color;
                    this.ctx.beginPath();
                    this.ctx.arc(0, 0, hazard.radius * 0.4, 0, Math.PI * 2);
                    this.ctx.fill();
                    
                    this.ctx.restore();
                    break;
            }
        });
    }
    
    drawInteractiveObjects() {
        this.interactiveObjects.forEach(obj => {
            switch (obj.type) {
                case 'portal':
                    // Pulsing portal
                    const pulseIntensity = 0.5 + Math.sin(Date.now() * 0.01) * 0.3;
                    this.ctx.fillStyle = `rgba(255, 20, 147, ${pulseIntensity})`;
                    this.ctx.beginPath();
                    this.ctx.arc(obj.x, obj.y, obj.radius, 0, Math.PI * 2);
                    this.ctx.fill();
                    
                    this.ctx.strokeStyle = obj.color;
                    this.ctx.lineWidth = 3;
                    this.ctx.stroke();
                    break;
                    
                case 'bouncePad':
                    // Bounce pad with direction indicator
                    this.ctx.fillStyle = obj.color;
                    this.ctx.beginPath();
                    this.ctx.arc(obj.x, obj.y, obj.radius, 0, Math.PI * 2);
                    this.ctx.fill();
                    
                    // Direction arrow
                    this.ctx.strokeStyle = '#FFFFFF';
                    this.ctx.lineWidth = 3;
                    const arrowLength = obj.radius * 0.8;
                    this.ctx.beginPath();
                    this.ctx.moveTo(obj.x, obj.y);
                    this.ctx.lineTo(
                        obj.x + Math.cos(obj.direction) * arrowLength,
                        obj.y + Math.sin(obj.direction) * arrowLength
                    );
                    this.ctx.stroke();
                    break;
                    
                case 'checkpoint':
                    // Checkpoint flag
                    this.ctx.fillStyle = obj.activated ? '#FFD700' : '#999999';
                    this.ctx.beginPath();
                    this.ctx.arc(obj.x, obj.y, obj.radius, 0, Math.PI * 2);
                    this.ctx.fill();
                    
                    if (obj.activated) {
                        this.ctx.strokeStyle = '#FFA500';
                        this.ctx.lineWidth = 2;
                        this.ctx.stroke();
                    }
                    break;
                    
                case 'treasureChest':
                    // Treasure chest
                    this.ctx.fillStyle = obj.color;
                    this.ctx.fillRect(
                        obj.x - obj.width/2, obj.y - obj.height/2,
                        obj.width, obj.height
                    );
                    
                    if (!obj.opened) {
                        // Glow effect for unopened chest
                        this.ctx.shadowColor = '#FFD700';
                        this.ctx.shadowBlur = 15;
                        this.ctx.fillRect(
                            obj.x - obj.width/2, obj.y - obj.height/2,
                            obj.width, obj.height
                        );
                        this.ctx.shadowBlur = 0;
                    }
                    break;
            }
        });
    }
    
    drawParticles() {
        this.particles.forEach(particle => {
            const alpha = particle.life / particle.maxLife;
            this.ctx.fillStyle = particle.color.includes('rgba') 
                ? particle.color.replace(/[\d\.]+\)$/g, `${alpha})`)
                : particle.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
            
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }
    
    drawBullets() {
        this.bullets.forEach(bullet => {
            const alpha = bullet.life / 120; // Fade based on remaining life
            this.ctx.fillStyle = `rgba(255, 215, 0, ${alpha})`;
            this.ctx.beginPath();
            this.ctx.arc(bullet.x, bullet.y, bullet.size, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Add glow effect
            this.ctx.shadowColor = '#FFD700';
            this.ctx.shadowBlur = 6;
            this.ctx.beginPath();
            this.ctx.arc(bullet.x, bullet.y, bullet.size * 0.6, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        });
    }
    
    updateAbilityUI() {
        const currentTime = Date.now();
        const myPlayer = this.players.get(this.playerId);
        
        if (!myPlayer || !myPlayer.abilities) return;
        
        // Update ability slot visual states
        Object.keys(myPlayer.abilities).forEach(abilityName => {
            const ability = myPlayer.abilities[abilityName];
            const element = document.getElementById(`ability-${abilityName}`);
            const timerElement = document.getElementById(`timer-${abilityName}`);
            
            if (element) {
                const timeSinceUse = currentTime - ability.lastUsed;
                const isOnCooldown = timeSinceUse < ability.cooldown;
                
                // Update visual state
                element.className = 'ability-slot';
                if (isOnCooldown) {
                    element.classList.add('cooldown');
                    
                    // Update timer display
                    const secondsLeft = Math.ceil((ability.cooldown - timeSinceUse) / 1000);
                    if (timerElement) {
                        timerElement.textContent = secondsLeft;
                    }
                } else {
                    element.classList.add('ready');
                }
                
                // Update cooldown overlay
                const cooldownElement = element.querySelector('.ability-cooldown');
                if (cooldownElement && isOnCooldown) {
                    const progress = timeSinceUse / ability.cooldown;
                    cooldownElement.style.clipPath = `polygon(0 0, 100% 0, 100% ${100 - progress * 100}%, 0 ${100 - progress * 100}%)`;
                }
            }
        });
    }
    
    updateEffects() {
        const currentTime = Date.now();
        
        // Update abilities
        Object.keys(this.abilities).forEach(abilityName => {
            const ability = this.abilities[abilityName];
            if (ability.active && ability.endTime && currentTime >= ability.endTime) {
                ability.active = false;
            }
        });
        
        // Update temporary powers
        Object.keys(this.temporaryPowers).forEach(powerName => {
            const power = this.temporaryPowers[powerName];
            if (power.active && currentTime >= power.endTime) {
                power.active = false;
            }
        });
        
        // Remove expired speed effects
        this.activeEffects = this.activeEffects.filter(effect => {
            if (currentTime >= effect.endTime) {
                // Reset to base values when effect expires
                if (effect.type === 'speed') {
                    this.snake.speed = this.baseSpeed;
                }
                return false;
            }
            return true;
        });
        
        // Update particles
        this.particles = this.particles.filter(particle => {
            particle.life--;
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.vx *= 0.98; // Friction
            particle.vy *= 0.98;
            return particle.life > 0;
        });
    }
    
    updateHazards() {
        const currentTime = Date.now();
        
        this.hazards.forEach(hazard => {
            switch (hazard.type) {
                case 'movingWall':
                    // Move the wall
                    hazard.x += hazard.vx;
                    hazard.y += hazard.vy;
                    
                    // Bounce off world boundaries
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
                    // Pulsing effect
                    hazard.intensity = 0.3 + Math.sin(currentTime * 0.005) * 0.3;
                    break;
                    
                case 'teleporter':
                    // Rotation effect
                    hazard.rotation = (hazard.rotation || 0) + 0.05;
                    break;
            }
        });
    }
    
    updateBullets() {
        // Update bullet positions and handle collisions
        this.bullets = this.bullets.filter(bullet => {
            // Move bullet
            bullet.x += bullet.vx;
            bullet.y += bullet.vy;
            bullet.life--;
            
            // Check collisions with world elements
            this.checkBulletCollisions(bullet);
            
            // Remove expired bullets
            return bullet.life > 0;
        });
    }
    
    checkBulletCollisions(bullet) {
        // Check collision with food
        for (let i = this.food.length - 1; i >= 0; i--) {
            const food = this.food[i];
            const distance = Math.sqrt((bullet.x - food.x) ** 2 + (bullet.y - food.y) ** 2);
            if (distance < this.foodSize + bullet.size) {
                this.food.splice(i, 1);
                this.spawnFood(); // Respawn food
                this.createDestructionParticles(food.x, food.y, food.color);
                bullet.life = 0; // Destroy bullet
                break;
            }
        }
        
        // Check collision with bonus boxes
        for (let i = this.bonusBoxes.length - 1; i >= 0; i--) {
            const box = this.bonusBoxes[i];
            const distance = Math.sqrt((bullet.x - box.x) ** 2 + (bullet.y - box.y) ** 2);
            if (distance < this.bonusBoxSize + bullet.size) {
                this.bonusBoxes.splice(i, 1);
                this.spawnBonusBox(); // Respawn bonus box
                this.createDestructionParticles(box.x, box.y, box.color);
                bullet.life = 0; // Destroy bullet
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
                this.createDestructionParticles(hazard.x, hazard.y, hazard.color);
                this.hazards.splice(i, 1);
                bullet.life = 0; // Destroy bullet
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
                this.createDestructionParticles(obj.x, obj.y, obj.color);
                this.interactiveObjects.splice(i, 1);
                bullet.life = 0; // Destroy bullet
                break;
            }
        }
    }
    
    checkAchievements() {
        const currentLength = this.snake.segments.length;
        
        // Length milestones
        Object.keys(this.achievements.lengthMilestones).forEach(milestone => {
            const target = parseInt(milestone);
            if (currentLength >= target && !this.achievements.lengthMilestones[milestone]) {
                this.achievements.lengthMilestones[milestone] = true;
                this.showAchievementNotification(`Snake Length: ${target}!`);
            }
        });
        
        // Collector achievement
        if (this.achievements.collector.foodEaten >= 100 && !this.achievements.collector.achieved) {
            this.achievements.collector.achieved = true;
            this.showAchievementNotification('Collector: 100 food eaten!');
        }
        
        // Risk taker achievement
        if (this.achievements.riskTaker.malusCollected >= 10 && !this.achievements.riskTaker.achieved) {
            this.achievements.riskTaker.achieved = true;
            this.showAchievementNotification('Risk Taker: 10 malus collected!');
        }
    }
    
    showAchievementNotification(text) {
        // Create achievement notification particle effect
        const head = this.snake.segments[0];
        for (let i = 0; i < 25; i++) {
            this.particles.push({
                x: head.x + (Math.random() - 0.5) * 50,
                y: head.y + (Math.random() - 0.5) * 50,
                color: '#FFD700',
                size: Math.random() * 6 + 4,
                life: 80,
                maxLife: 80,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8
            });
        }
    }
    
    showEatingNotification(eaterName, victimName, growthGained) {
        // Create eating notification in the UI
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(255, 0, 0, 0.9);
            color: white;
            padding: 20px;
            border-radius: 10px;
            font-size: 18px;
            font-weight: bold;
            text-align: center;
            z-index: 3000;
            box-shadow: 0 0 20px rgba(255, 0, 0, 0.5);
            animation: fadeInOut 3s ease-in-out;
        `;
        
        notification.innerHTML = `
            🐍 ${eaterName} ate ${victimName}!<br>
            <span style="color: #4ECDC4;">+${growthGained} growth</span>
        `;
        
        // Add CSS animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeInOut {
                0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
                20% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(notification);
        
        // Remove after animation
        setTimeout(() => {
            document.body.removeChild(notification);
            document.head.removeChild(style);
        }, 3000);
    }
    
    createAbilityEffects(player, abilityName) {
        if (!player.segments || player.segments.length === 0) return;
        
        const head = player.segments[0];
        
        switch (abilityName) {
            case 'dash':
                this.createDashParticles(head.x, head.y, head.x, head.y);
                break;
            case 'bullets':
                this.createBulletFireParticles(head.x, head.y);
                break;
            case 'magnet':
                this.createPowerActivationParticles(head.x, head.y, 'magnet');
                break;
            case 'shield':
                this.createPowerActivationParticles(head.x, head.y, 'shield');
                break;
        }
    }
    
    gameLoop() {
        // Always update effects and camera for smooth animations
        this.updateEffects();
        this.updateCamera();
        this.render();
        
        // Continue the game loop
        this.gameInstance = requestAnimationFrame(() => this.gameLoop());
    }
    
    restart() {
        // Hide game over modal
        document.getElementById('gameOverModal').style.display = 'none';
        
        // Send respawn message to server
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'respawn'
            }));
        }
        
        // Reset game state
        this.gameState = 'playing';
        this.gameStartTime = Date.now();
    }
}

// Global game instance
let gameInstance = null;

// Global restart function for the button
function restartGame() {
    if (gameInstance) {
        gameInstance.restart();
    }
}

// Start the game when the page loads
window.addEventListener('load', () => {
    gameInstance = new MultiplayerSnakeGame();
});