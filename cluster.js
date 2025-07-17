const cluster = require('cluster');
const os = require('os');

if (cluster.isMaster) {
    const numCPUs = os.cpus().length;
    const maxWorkers = Math.min(numCPUs, 8); // Limit to 8 workers max
    
    console.log(`🚀 Starting Snake Town cluster with ${maxWorkers} workers`);
    console.log(`💻 CPU cores available: ${numCPUs}`);
    
    // Fork workers
    for (let i = 0; i < maxWorkers; i++) {
        const worker = cluster.fork();
        console.log(`🐍 Worker ${worker.process.pid} started`);
    }
    
    // Handle worker crashes
    cluster.on('exit', (worker, code, signal) => {
        console.log(`❌ Worker ${worker.process.pid} died (${code || signal})`);
        console.log('🔄 Starting a new worker...');
        const newWorker = cluster.fork();
        console.log(`🐍 New worker ${newWorker.process.pid} started`);
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
        console.log('🛑 Shutting down cluster...');
        for (const id in cluster.workers) {
            cluster.workers[id].kill();
        }
        process.exit(0);
    });
    
    process.on('SIGINT', () => {
        console.log('🛑 Shutting down cluster...');
        for (const id in cluster.workers) {
            cluster.workers[id].kill();
        }
        process.exit(0);
    });
    
} else {
    // Worker process - start the game server
    require('./server.js');
    console.log(`🎮 Game server worker ${process.pid} is running`);
}