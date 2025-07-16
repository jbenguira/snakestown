class SimpleSnakeGame {
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
            color: '#4ECDC4'
        };
        
        // Input state
        this.isPressed = false;
        this.currentTargetX = 2500;
        this.currentTargetY = 2500;
        
        this.resizeCanvas();
        this.setupEventListeners();
        this.gameLoop();
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
    }
    
    handlePointerStart(clientX, clientY) {
        this.isPressed = true;
        this.updateTarget(clientX, clientY);
        this.snake.moving = true;
    }
    
    handlePointerMove(clientX, clientY) {
        if (this.isPressed) {
            this.updateTarget(clientX, clientY);
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
        
        // Wrap around world boundaries
        if (newHead.x < 0) newHead.x = this.worldSize;
        if (newHead.x > this.worldSize) newHead.x = 0;
        if (newHead.y < 0) newHead.y = this.worldSize;
        if (newHead.y > this.worldSize) newHead.y = 0;
        
        this.snake.segments.unshift(newHead);
        
        // Remove tail to keep length constant
        if (this.snake.segments.length > 5) {
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
    
    updateCamera() {
        const head = this.snake.segments[0];
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
        
        // Draw snake
        this.drawSnake();
        
        // Draw target if pressed or still moving to target
        if (this.isPressed || this.snake.moving) {
            this.drawTarget();
        }
        
        this.ctx.restore();
        
        // Draw zoom indicator
        this.drawZoomIndicator();
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
    
    drawSnake() {
        const segmentSize = 10;
        
        // Draw body segments
        for (let i = this.snake.segments.length - 1; i >= 0; i--) {
            const segment = this.snake.segments[i];
            const isHead = i === 0;
            
            // Body color gets darker towards tail
            const alpha = isHead ? 1 : Math.max(0.3, 1 - (i / this.snake.segments.length) * 0.7);
            this.ctx.fillStyle = isHead ? this.snake.color : this.adjustColorAlpha(this.snake.color, alpha);
            
            this.ctx.beginPath();
            this.ctx.arc(segment.x, segment.y, segmentSize, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Draw eyes on head
            if (isHead && this.snake.segments.length > 1) {
                const nextSegment = this.snake.segments[1];
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
        if (color.startsWith('#')) {
            const r = parseInt(color.substr(1, 2), 16);
            const g = parseInt(color.substr(3, 2), 16);
            const b = parseInt(color.substr(5, 2), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        return color;
    }
    
    drawZoomIndicator() {
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        this.ctx.font = '14px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`Zoom: ${Math.round(this.camera.zoom * 100)}%`, 10, this.canvas.height - 10);
    }
    
    gameLoop() {
        this.updateSnake();
        this.updateCamera();
        this.render();
        requestAnimationFrame(() => this.gameLoop());
    }
}

// Start the game when the page loads
window.addEventListener('load', () => {
    new SimpleSnakeGame();
});