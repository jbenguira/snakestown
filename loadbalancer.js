const http = require('http');
const httpProxy = require('http-proxy-middleware');

// Note: This requires http-proxy-middleware package
// Install with: npm install http-proxy-middleware

const workers = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003'
];

let currentWorker = 0;

const proxy = httpProxy.createProxyMiddleware({
    target: workers[0],
    changeOrigin: true,
    ws: true, // Enable WebSocket proxying
    router: (req) => {
        // Round-robin load balancing
        const target = workers[currentWorker];
        currentWorker = (currentWorker + 1) % workers.length;
        console.log(`🔄 Routing request to ${target}`);
        return target;
    },
    onError: (err, req, res) => {
        console.error('❌ Proxy error:', err.message);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Service temporarily unavailable');
    }
});

const server = http.createServer(proxy);

// Handle WebSocket upgrades
server.on('upgrade', proxy.upgrade);

const port = process.env.LOAD_BALANCER_PORT || 8080;
server.listen(port, () => {
    console.log(`🔄 Load balancer running on port ${port}`);
    console.log(`📍 Routing to workers: ${workers.join(', ')}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Load balancer shutting down...');
    server.close(() => {
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('🛑 Load balancer shutting down...');
    server.close(() => {
        process.exit(0);
    });
});